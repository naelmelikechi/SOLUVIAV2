'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logAudit } from '@/lib/utils/audit';
import { CONTRACT_STATE_LABELS } from '@/lib/utils/contrat-states';

const PATH = '/admin/parametres/archivage-contrats';

// Etat source choisi dans une liste fermee : les cles connues de
// CONTRACT_STATE_LABELS. Une saisie libre autoriserait une faute de frappe a
// creer une regle inerte que personne ne verrait jamais se declencher.
const ETATS_VALIDES = Object.keys(CONTRACT_STATE_LABELS) as [
  string,
  ...string[],
];

const RegleSchema = z.object({
  id: z.string().uuid().optional(),
  nom: z.string().trim().min(1, 'Nom requis').max(200),
  etat_source: z.enum(ETATS_VALIDES, {
    message: 'État inconnu - choisissez dans la liste',
  }),
  delai_jours: z
    .number()
    .int()
    .positive('Le délai doit être un entier positif'),
  actif: z.boolean(),
});

export type RegleArchivageInput = z.infer<typeof RegleSchema>;

/**
 * Cree ou met a jour une regle d'archivage. Protegee par checkAuth (auth +
 * role admin explicite) : la RLS bloque deja l'ecriture en base, mais une
 * action qui echoue silencieusement cote serveur est une mauvaise experience
 * pour l'admin qui vient de valider un formulaire.
 */
export async function upsertRegleArchivage(
  input: RegleArchivageInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = RegleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const payload = {
    nom: parsed.data.nom,
    etat_source: parsed.data.etat_source,
    delai_jours: parsed.data.delai_jours,
    actif: parsed.data.actif,
    updated_by: user.id,
  };

  const { data, error } = parsed.data.id
    ? await supabase
        .from('contrats_regles_archivage')
        .update(payload)
        .eq('id', parsed.data.id)
        .select('id')
        .single()
    : await supabase
        .from('contrats_regles_archivage')
        .insert(payload)
        .select('id')
        .single();

  if (error) {
    // Contrainte UNIQUE(etat_source) : message Postgres brut peu lisible,
    // on le remplace par quelque chose que l'admin comprend directement.
    if (error.code === '23505') {
      return {
        success: false,
        error: 'Une règle existe déjà pour cet état',
      };
    }
    return { success: false, error: error.message };
  }

  logAudit(
    parsed.data.id ? 'regle_archivage_updated' : 'regle_archivage_created',
    'contrats_regles_archivage',
    data.id,
    {
      nom: parsed.data.nom,
      etat_source: parsed.data.etat_source,
      delai_jours: parsed.data.delai_jours,
      actif: parsed.data.actif,
    },
    user.id,
  );
  revalidatePath(PATH);
  return { success: true, id: data.id };
}

/**
 * Remet un contrat archive automatiquement dans la production.
 *
 * Efface la tracabilite en meme temps que l'archivage : c'est
 * archive_regle_id qui protege la ligne du desarchivage accidentel (trigger
 * protege_archivage_auto_contrat). Le laisser en place ferait re-archiver le
 * contrat par le trigger a l'instruction suivante, et le garder sur une ligne
 * archive = false raconterait une histoire fausse - c'est exactement l'etat
 * incoherent que la sync Eduvia produisait avant le correctif.
 *
 * Reserve aux admins : desarchiver reinjecte un contrat dans le chiffre de la
 * production.
 */
export async function desarchiverContrat(
  contratId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsedId = z.string().uuid().safeParse(contratId);
  if (!parsedId.success)
    return { success: false, error: 'Identifiant invalide' };

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('contrats')
    .update({
      archive: false,
      archive_regle_id: null,
      archive_auto_le: null,
    })
    .eq('id', parsedId.data)
    .select('id, ref, projet_id')
    .single();

  if (error) return { success: false, error: error.message };

  logAudit(
    'contrat_desarchive',
    'contrats',
    parsedId.data,
    { ref: data.ref },
    user.id,
  );
  revalidatePath(PATH);
  revalidatePath('/projets', 'layout');
  return { success: true };
}

export async function deleteRegleArchivage(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success)
    return { success: false, error: 'Identifiant invalide' };

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('contrats_regles_archivage')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit(
    'regle_archivage_deleted',
    'contrats_regles_archivage',
    id,
    {},
    user.id,
  );
  revalidatePath(PATH);
  return { success: true };
}
