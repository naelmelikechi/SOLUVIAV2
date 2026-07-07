import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/crm/database.types';
import { todayInParis } from '@/lib/crm/format';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import { listEtapes } from '@/lib/crm/queries/opportunites';
import type { RecapPeriod, DormanteInput } from '@/lib/crm/domain/recap';

type DB = SupabaseClient<Database, 'crm'>;

export type RiskData = {
  dormanteInputs: DormanteInput[];
  rdvADebriefer: {
    id: string;
    titre: string;
    debut: string;
    compte: { nom: string | null } | null;
  }[];
};

/**
 * Anonymisation des comptes fantômes dans les données lues via le client
 * service-role (cron du récap) : la RLS ne s'y applique pas, et le nom partirait
 * sinon en clair dans le mail. Un profil masqué devient null (« Non attribué »).
 * SOLUVIA : l'identité vit dans `public.users` (prenom/nom) et le masquage se
 * décide sur l'email (`isHiddenEmail`) — pas de colonne `is_hidden`.
 */
type ProfilRow = {
  prenom: string | null;
  nom: string | null;
  email?: string | null;
} | null;
function visibleProfile(p: ProfilRow): { nom_complet: string | null } | null {
  if (!p || isHiddenEmail(p.email)) return null;
  const nomComplet = [p.prenom, p.nom].filter(Boolean).join(' ').trim();
  return { nom_complet: nomComplet || null };
}

/** Opportunités ouvertes enrichies (activités/relances/rdv) + RDV passés sans compte-rendu. Réutilisé dashboard + récap. */
export async function fetchRisks(sb: DB, nowIso: string): Promise<RiskData> {
  const [opps, rdv] = await Promise.all([
    sb
      .from('opportunites')
      .select(
        `id, intitule, statut, owner:users!opportunites_owner_id_fkey(prenom, nom, email), compte:comptes(nom),
        activites(created_at), relances(date_echeance, fait, archived_at), rdv(debut)`,
      )
      .eq('statut', 'ouverte')
      // `computeDormantes` n'a besoin que du MAX(activites.created_at) : on ne rapatrie
      // que la dernière activité par opportunité (les activités s'accumulent sans borne,
      // c'était le gros du sur-fetch). Le limit sur table référencée cape l'embed sans
      // retirer d'opportunité (parent conservé, y compris à 0 activité). relances/rdv
      // restent complètes (bornées par opp) — la logique dormante les re-filtre.
      .order('created_at', { referencedTable: 'activites', ascending: false })
      .limit(1, { referencedTable: 'activites' }),
    sb
      .from('rdv')
      .select('id, titre, debut, statut, compte_rendu, compte:comptes(nom)')
      .lt('debut', nowIso)
      .neq('statut', 'annule')
      .order('debut', { ascending: false })
      .limit(80),
  ]);
  const dormanteInputs = (
    (opps.data ?? []) as unknown as (DormanteInput & { owner: ProfilRow })[]
  ).map((o) => ({ ...o, owner: visibleProfile(o.owner) }));
  const rdvADebriefer = (rdv.data ?? [])
    .filter((r) => !r.compte_rendu || r.compte_rendu.trim() === '')
    .map((r) => ({
      id: r.id,
      titre: r.titre,
      debut: r.debut,
      compte: r.compte as { nom: string | null } | null,
    }));
  return { dormanteInputs, rdvADebriefer };
}

export type RecapRaw = {
  opps: {
    statut: string;
    etape_id: string;
    probabilite: number | null;
    nb_alternants: number | null;
    owner: { nom_complet: string | null } | null;
  }[];
  etapes: {
    id: string;
    libelle: string;
    ordre: number;
    couleur: string | null;
  }[];
  relEnRetard: RelanceRow[];
  relAujourdhui: RelanceRow[];
  rdvAvenir: RdvRow[];
  risks: RiskData;
  nouvelles: number;
  gagnees: { intitule: string; compte: { nom: string | null } | null }[];
  perdues: {
    intitule: string;
    motif_perte: string | null;
    compte: { nom: string | null } | null;
  }[];
  activites: number;
  rdvRealises: number;
  relancesFaites: number;
};

type RelanceRow = {
  id: string;
  titre: string;
  date_echeance: string;
  priorite: string;
  compte: { nom: string | null } | null;
  assignee: { nom_complet: string | null } | null;
};
type RdvRow = {
  id: string;
  titre: string;
  debut: string;
  statut: string;
  compte: { nom: string | null } | null;
  commerciaux: { profile: { nom_complet: string | null } | null }[];
};

const REL_SEL = `id, titre, date_echeance, priorite, compte:comptes(nom), assignee:users!relances_assignee_id_fkey(prenom, nom, email)`;
const RDV_SEL = `id, titre, debut, statut, compte:comptes(nom), commerciaux:rdv_commerciaux(profile:users!rdv_commerciaux_user_id_fkey(prenom, nom, email))`;

const scrubRelance = (r: RelanceRow & { assignee: ProfilRow }): RelanceRow => ({
  ...r,
  assignee: visibleProfile(r.assignee),
});
const scrubRdv = (
  r: Omit<RdvRow, 'commerciaux'> & { commerciaux: { profile: ProfilRow }[] },
): RdvRow => ({
  ...r,
  commerciaux: (r.commerciaux ?? [])
    .map((c) => ({ profile: visibleProfile(c.profile) }))
    .filter((c) => c.profile),
});

export async function fetchRecapData(
  sb: DB,
  period: RecapPeriod,
): Promise<RecapRaw> {
  const today = todayInParis();
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();
  const nextIso = period.nextRecap.toISOString();

  const [
    opps,
    etapes,
    relEnRetard,
    relAujourdhui,
    rdvAvenir,
    risks,
    nouvelles,
    gagnees,
    perdues,
    activites,
    rdvRealises,
    relancesFaites,
  ] = await Promise.all([
    sb
      .from('opportunites')
      .select(
        'statut, etape_id, probabilite, nb_alternants, owner:users!opportunites_owner_id_fkey(prenom, nom, email)',
      ),
    listEtapes(), // cache inter-requêtes (config quasi immuable)
    sb
      .from('relances')
      .select(REL_SEL)
      .is('archived_at', null)
      .eq('fait', false)
      .lt('date_echeance', today)
      .order('date_echeance'),
    sb
      .from('relances')
      .select(REL_SEL)
      .is('archived_at', null)
      .eq('fait', false)
      .eq('date_echeance', today)
      .order('date_echeance'),
    sb
      .from('rdv')
      .select(RDV_SEL)
      .gte('debut', endIso)
      .lt('debut', nextIso)
      .order('debut'),
    fetchRisks(sb, endIso),
    sb
      .from('opportunites')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    sb
      .from('opportunites')
      .select('intitule, compte:comptes(nom)')
      .eq('statut', 'gagnee')
      .gte('updated_at', startIso),
    sb
      .from('opportunites')
      .select('intitule, motif_perte, compte:comptes(nom)')
      .eq('statut', 'perdue')
      .gte('updated_at', startIso),
    sb
      .from('activites')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    sb
      .from('rdv')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'realise')
      .gte('debut', startIso)
      .lte('debut', endIso),
    sb
      .from('relances')
      .select('id', { count: 'exact', head: true })
      .eq('fait', true)
      .gte('date_fait', startIso),
  ]);

  return {
    // Anonymisation fantômes (stats par commercial du mail : « Non attribué »).
    opps: (
      (opps.data ?? []) as unknown as (RecapRaw['opps'][number] & {
        owner: ProfilRow;
      })[]
    ).map((o) => ({ ...o, owner: visibleProfile(o.owner) })),
    etapes: etapes as RecapRaw['etapes'],
    relEnRetard: (
      (relEnRetard.data ?? []) as unknown as (RelanceRow & {
        assignee: ProfilRow;
      })[]
    ).map(scrubRelance),
    relAujourdhui: (
      (relAujourdhui.data ?? []) as unknown as (RelanceRow & {
        assignee: ProfilRow;
      })[]
    ).map(scrubRelance),
    rdvAvenir: (
      (rdvAvenir.data ?? []) as unknown as (Omit<RdvRow, 'commerciaux'> & {
        commerciaux: { profile: ProfilRow }[];
      })[]
    ).map(scrubRdv),
    risks,
    nouvelles: nouvelles.count ?? 0,
    gagnees: (gagnees.data ?? []) as unknown as RecapRaw['gagnees'],
    perdues: (perdues.data ?? []) as unknown as RecapRaw['perdues'],
    activites: activites.count ?? 0,
    rdvRealises: rdvRealises.count ?? 0,
    relancesFaites: relancesFaites.count ?? 0,
  };
}

export type LastRecap = {
  recap_date: string;
  trigger: string;
  created_at: string;
};

/** Dernier récap enregistré (pour la page admin). Dégradation gracieuse si table absente. */
export async function lastRecap(sb: DB): Promise<LastRecap | null> {
  const { data, error } = await sb
    .from('recaps')
    .select('recap_date, trigger, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as LastRecap | null) ?? null;
}
