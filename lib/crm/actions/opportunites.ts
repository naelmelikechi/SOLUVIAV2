'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import { dbFail, ActionError } from '@/lib/crm/actions/errors';
import {
  opportuniteCompleteSchema,
  type OpportuniteCompleteInput,
} from '@/lib/crm/validators/opportunite-complete';
import {
  negociationSchema,
  type NegociationInput,
} from '@/lib/crm/validators/negociation';
import { toAdresseRow, isAdresseVide } from '@/lib/crm/validators/adresse';
import { onOpportuniteGagnee } from '@/lib/crm/actions/pont';
import { notifierTauxDerogatoire } from '@/lib/crm/alertes/taux-derogatoire';
import { doitAlerterTaux } from '@/lib/crm/domain/taux';
import type { OppStatut } from '@/lib/crm/domain/enums';

/**
 * Création unifiée : crée en une fois la société + le(s) contact(s) + l'opportunité
 * + (optionnel) le 1er RDV + (optionnel) un commentaire. Le commercial ne saisit
 * jamais « compte » puis « contact » séparément. Tout est inséré via la fonction
 * Postgres `create_opportunite_complete` = une seule transaction :
 * un échec au milieu => rollback complet, plus d'orphelins.
 * `date_premier_rdv` est attendu en ISO (la conversion datetime-local->ISO se fait
 * côté client, comme rdv-form, pour respecter le fuseau du navigateur).
 */
export type CreateOppResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Enveloppe : exige l'auth, exécute la création, et convertit toute erreur en
 * résultat *retourné* (jamais levé). En prod, Next.js masque le message des
 * erreurs levées par un Server Action (seul un digest atteint le client) ; un
 * résultat retourné, lui, arrive intact. Le détail technique (cause Postgres)
 * n'est renvoyé qu'au propriétaire (compte fantôme `HIDDEN_USER_EMAILS`) ; les
 * commerciaux n'ont qu'un message neutre.
 */
export async function createOpportuniteComplete(
  input: OpportuniteCompleteInput,
): Promise<CreateOppResult> {
  const user = await requireCrmUser(); // hors try : sa redirection /login ne doit pas être avalée
  const reveal = isHiddenEmail(user.email);
  try {
    return { ok: true, id: await runCreate(input, reveal) };
  } catch (e) {
    const detail =
      e instanceof ActionError
        ? e.detail
        : e instanceof Error
          ? e.message
          : String(e);
    console.error('[createOpportuniteComplete] échec:', detail);
    return {
      ok: false,
      error: reveal ? detail : "Création de l'opportunité impossible",
    };
  }
}

async function runCreate(
  input: OpportuniteCompleteInput,
  ghost = false,
): Promise<string> {
  const p = opportuniteCompleteSchema.parse(input);
  const supabase = await createCrmClient();

  // Filtrage + normalisation géo en JS (source de vérité unique), puis TOUT est
  // inséré via une fonction Postgres unique = une seule transaction :
  // un échec au milieu => rollback complet, plus d'orphelins.
  const contactsUtiles = p.contacts.filter(
    (c) =>
      (c.prenom || '').trim() ||
      (c.nom || '').trim() ||
      (c.email || '').trim() ||
      (c.telephone || '').trim(),
  );
  const adressesUtiles = (p.adresses ?? []).filter((a) => !isAdresseVide(a));
  const rpcPayload = {
    societe: {
      nom: p.societe_nom,
      nombre_collaborateurs: p.nombre_collaborateurs,
    },
    contacts: contactsUtiles.map((c, i) => ({
      prenom: c.prenom || null,
      nom: c.nom || null,
      email: c.email || null,
      telephone: c.telephone || null,
      principal: i === 0,
    })),
    adresses: adressesUtiles.map((a, i) => ({
      ...toAdresseRow(a),
      principal: i === 0,
    })),
    opportunite: {
      nb_alternants: p.nb_alternants,
      cfa: p.cfa || null,
      date_cible_prochain_rdv: p.date_cible_prochain_rdv,
    },
    date_premier_rdv: p.date_premier_rdv || null,
    // Compte fantôme : le commentaire deviendrait une note d'activité à son nom
    // via la RPC → supprimé (zéro trace, cohérent avec addNote).
    commentaire:
      !ghost && p.commentaire && p.commentaire.trim() ? p.commentaire : null,
  };

  const { data: oppId, error } = await supabase.rpc(
    'create_opportunite_complete',
    { p: rpcPayload },
  );
  if (error) dbFail(error, "Création de l'opportunité impossible");
  revalidatePath('/crm/pipeline');
  if (rpcPayload.date_premier_rdv) revalidatePath('/crm/rdv');
  return oppId as string;
}

// Édition rapide des champs principaux d'une opportunité depuis le drawer.
// Update PARTIEL (uniquement ces colonnes) : ne peut pas écraser les autres champs
// (dates, source, owner…) - contrairement à un re-parse complet du schéma.
const oppFieldsSchema = z.object({
  intitule: z.string().min(1, 'Intitulé requis'),
  // Vide -> null (et non 0/1) : ne pas fabriquer une valeur quand le champ est laissé
  // vide, pour ne pas muter la sémantique « non renseigné » d'une autre sauvegarde.
  probabilite: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().int().min(0).max(100).nullable(),
  ),
  nb_alternants: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().int().min(0).nullable(),
  ),
  cfa: z
    .string()
    .nullable()
    .transform((v) => (v === '' || v == null ? null : v)),
  date_cible_prochain_rdv: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.string().nullable(),
  ),
});
export type OppFieldsInput = z.input<typeof oppFieldsSchema>;

export async function updateOpportuniteFields(
  id: string,
  input: OppFieldsInput,
): Promise<void> {
  await requireCrmUser();
  const parsed = oppFieldsSchema.parse(input);
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('opportunites')
    .update(parsed)
    .eq('id', id);
  if (error) dbFail(error, "Mise à jour de l'opportunité impossible");
  revalidatePath('/crm/pipeline');
}

/**
 * Édition des champs de négociation / passation (A4/A5). Update PARTIEL, distinct
 * de `updateOpportuniteFields` : ce bloc envoie TOUJOURS l'intégralité des champs
 * négociation (dont les tableaux `formations_rncp`/`leviers`), on ne peut donc pas
 * le fusionner avec l'édition rapide sans risquer d'écraser les text[] par [].
 */
export async function updateOpportuniteNegociation(
  id: string,
  input: NegociationInput,
): Promise<void> {
  const user = await requireCrmUser();
  const parsed = negociationSchema.parse(input);
  const supabase = await createCrmClient();
  // Ancien taux AVANT l'update : l'alerte Direction ne part qu'au FRANCHISSEMENT
  // du seuil (null ou >= 35 -> < 35), pas à chaque re-sauvegarde sous le seuil.
  const { data: avant } = await supabase
    .from('opportunites')
    .select('taux_npec')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase
    .from('opportunites')
    .update(parsed)
    .eq('id', id);
  if (error) dbFail(error, 'Mise à jour de la négociation impossible');
  // Garde-fou taux dérogatoire < 35 % (Direction 2026-06-09). Best-effort,
  // jamais levé : un échec de notification ne casse pas la sauvegarde.
  // NB : `taux_npec` n'est saisi QUE par ce bloc négociation (la création
  // unifiée n'a pas de champ taux), c'est donc l'unique point d'ancrage.
  if (
    parsed.taux_npec != null &&
    doitAlerterTaux(avant?.taux_npec ?? null, parsed.taux_npec)
  ) {
    await notifierTauxDerogatoire({
      oppId: id,
      taux: parsed.taux_npec,
      saisiPar: { id: user.id, email: user.email },
    });
  }
  revalidatePath('/crm/pipeline');
}

export async function deleteOpportunite(id: string): Promise<void> {
  await requireCrmUser();
  const supabase = await createCrmClient();
  // Cascade DB : supprime aussi activités/relances/RDV liés (FK on delete cascade).
  const { error } = await supabase.from('opportunites').delete().eq('id', id);
  if (error) dbFail(error, "Suppression de l'opportunité impossible");
  revalidatePath('/crm/pipeline');
}

/**
 * Déplacement d'étape : met aussi à jour `statut` pour rester cohérent avec le
 * `type` de l'étape cible (sinon glisser une carte dans la colonne « Gagné »/
 * « Perdu » du kanban ne marquait jamais l'opportunité gagnée/perdue → KPIs faux).
 */
export async function moveOpportuniteStage(
  id: string,
  etapeId: string,
  etapeLibelle: string,
): Promise<void> {
  const user = await requireCrmUser();
  const supabase = await createCrmClient();
  const auteur = user.id;
  // On remonte l'erreur du lookup au lieu de retomber silencieusement sur
  // « ouverte » (qui fausserait le statut/les KPIs sur une erreur transitoire) - cf. audit.
  const { data: etape, error: etapeErr } = await supabase
    .from('etapes')
    .select('type')
    .eq('id', etapeId)
    .maybeSingle();
  if (etapeErr) dbFail(etapeErr, "Déplacement de l'opportunité impossible");
  const type = (etape?.type ?? 'ouverte') as OppStatut;
  const patch: { etape_id: string; statut: OppStatut; motif_perte?: null } = {
    etape_id: etapeId,
    statut: type,
  };
  if (type !== 'perdue') patch.motif_perte = null;
  const { error } = await supabase
    .from('opportunites')
    .update(patch)
    .eq('id', id);
  if (error) dbFail(error, "Déplacement de l'opportunité impossible");
  // Pont Phase 2 : gagnée → client SOLUVIA + synthèse de passation (best-effort).
  if (type === 'gagnee') await onOpportuniteGagnee(id);
  // Compte fantôme : AUCUNE trace d'activité (exigence d'invisibilité totale).
  if (!isHiddenEmail(user.email)) {
    const { error: actErr } = await supabase.from('activites').insert({
      type: 'systeme',
      opportunite_id: id,
      auteur_id: auteur,
      contenu: `Étape → ${etapeLibelle}`,
    });
    if (actErr)
      console.error('activite (move) non enregistrée:', actErr.message);
  }
  revalidatePath('/crm/pipeline');
}

/**
 * Changement de statut depuis le drawer : repositionne aussi `etape_id` vers une
 * étape active du `type` correspondant, pour que le kanban reste cohérent.
 */
export async function setOpportuniteStatut(
  id: string,
  statut: OppStatut,
  motif?: string,
): Promise<void> {
  const user = await requireCrmUser();
  const supabase = await createCrmClient();
  const auteur = user.id;
  // Cible l'étape active du bon type (la plus basse en ordre pour « ouverte »).
  const { data: cible } = await supabase
    .from('etapes')
    .select('id')
    .eq('type', statut)
    .eq('actif', true)
    .order('ordre')
    .limit(1)
    .maybeSingle();
  const patch: {
    statut: typeof statut;
    motif_perte: string | null;
    etape_id?: string;
  } = {
    statut,
    motif_perte: statut === 'perdue' ? (motif ?? null) : null,
  };
  if (cible?.id) patch.etape_id = cible.id;
  const { error } = await supabase
    .from('opportunites')
    .update(patch)
    .eq('id', id);
  if (error) dbFail(error, 'Changement de statut impossible');
  // Pont Phase 2 : gagnée → client SOLUVIA + synthèse de passation (best-effort).
  if (statut === 'gagnee') await onOpportuniteGagnee(id);
  // Compte fantôme : AUCUNE trace d'activité (exigence d'invisibilité totale).
  if (!isHiddenEmail(user.email)) {
    const txt =
      statut === 'gagnee'
        ? 'Opportunité gagnée 🎉'
        : statut === 'perdue'
          ? `Opportunité perdue${motif ? ' - ' + motif : ''}`
          : 'Opportunité rouverte';
    const { error: actErr } = await supabase.from('activites').insert({
      type: 'systeme',
      opportunite_id: id,
      auteur_id: auteur,
      contenu: txt,
    });
    if (actErr)
      console.error('activite (statut) non enregistrée:', actErr.message);
  }
  revalidatePath('/crm/pipeline');
}
