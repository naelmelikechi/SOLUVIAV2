import { createCrmClient } from '@/lib/crm/supabase/server';
import { todayInParis } from '@/lib/utils/formatters';
import { type OppRegions } from '@/lib/crm/domain/geo-stats';
import { fetchRisks } from '@/lib/crm/queries/recap';
import { listEtapes } from '@/lib/crm/queries/opportunites';
import { fetchCrmUsers } from '@/lib/crm/queries/_users';
import { computeDormantes, type Dormante } from '@/lib/crm/domain/recap';
import type { OppStatut } from '@/lib/crm/domain/enums';
import type { Database, Etape, ActiviteType } from '@/lib/crm/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OppDashRow = {
  statut: OppStatut;
  etape_id: string;
  probabilite: number | null;
  nb_alternants: number | null;
  date_demarrage_souhaitee?: string | null;
  compte?: { adresses: { region: string | null }[] } | null;
};

export type DashboardActivite = {
  id: string;
  type: ActiviteType;
  contenu: string;
  created_at: string;
  auteur: { prenom: string | null; nom: string | null } | null;
};

export type DashboardData = {
  opps: OppDashRow[];
  etapes: Etape[];
  relancesDues: { id: string; titre: string; date_echeance: string }[];
  prochainRdv: { id: string; titre: string; debut: string }[];
  activitesRecentes: DashboardActivite[];
  densiteOpps: OppRegions[];
};

/**
 * Un SEUL scan d'opportunites pour les KPIs/funnel ET la carte de densité
 * (avant : deux requêtes quasi identiques par chargement du dashboard).
 * Dégradation gracieuse conservée : si la requête enrichie échoue (ex. 42P01
 * adresses absente), on retombe sur le fetch nu → KPIs OK, carte vide, jamais de 500.
 */
async function fetchOppsDash(
  supabase: SupabaseClient<Database, 'crm'>,
): Promise<OppDashRow[]> {
  const full = await supabase
    .from('opportunites')
    .select(
      'statut, etape_id, probabilite, nb_alternants, date_demarrage_souhaitee, compte:comptes(adresses(region))',
    );
  if (!full.error) return (full.data ?? []) as unknown as OppDashRow[];
  const bare = await supabase
    .from('opportunites')
    .select('statut, etape_id, probabilite, nb_alternants');
  return (bare.data ?? []) as OppDashRow[];
}

export async function dashboardData(): Promise<DashboardData> {
  const supabase = await createCrmClient();
  const today = todayInParis();
  const nowIso = new Date().toISOString();
  const [opps, etapes, relances, rdv, activites] = await Promise.all([
    fetchOppsDash(supabase),
    listEtapes(),
    supabase
      .from('relances')
      .select('id, titre, date_echeance')
      .is('archived_at', null) // les relances archivées ne comptent plus (cohérence KPI - cf. audit)
      .eq('fait', false)
      .lte('date_echeance', today)
      .order('date_echeance'),
    supabase
      .from('rdv')
      .select('id, titre, debut')
      .gte('debut', nowIso)
      .order('debut')
      .limit(5),
    supabase
      .from('activites')
      .select('id, type, contenu, created_at, auteur_id')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  // Auteurs des activités = public.users : embed cross-schéma impossible, on
  // recolle en JS via un fetch groupé.
  const activiteRows = (activites.data ?? []) as unknown as (Omit<
    DashboardActivite,
    'auteur'
  > & { auteur_id: string | null })[];
  const activiteUsers = await fetchCrmUsers(
    activiteRows.map((a) => a.auteur_id),
  );
  const activitesRecentes = activiteRows.map(({ auteur_id, ...a }) => {
    const u = auteur_id ? activiteUsers.get(auteur_id) : undefined;
    return { ...a, auteur: u ? { prenom: u.prenom, nom: u.nom } : null };
  });
  return {
    opps,
    etapes,
    relancesDues: relances.data ?? [],
    prochainRdv: rdv.data ?? [],
    activitesRecentes,
    // Carte de densité : mêmes lignes, filtrées ouvertes (agrégation côté client
    // pour le toggle métrique/rentrée sans round-trip).
    densiteOpps: opps.filter(
      (o) => o.statut === 'ouverte',
    ) as unknown as OppRegions[],
  };
}

export type DashboardRisks = {
  dormantes: Dormante[];
  rdvADebriefer: {
    id: string;
    titre: string;
    debut: string;
    compte: string | null;
  }[];
  // Comptes REELS (les listes ci-dessus sont tronquees a 6 pour l'affichage) :
  // les badges doivent montrer le vrai total, pas la longueur tronquee.
  dormantesTotal: number;
  rdvADebrieferTotal: number;
};

/** Signaux de risque pour le dashboard (mêmes calculs que le récap). */
export async function dashboardRisks(): Promise<DashboardRisks> {
  const supabase = await createCrmClient();
  const now = new Date();
  const risks = await fetchRisks(supabase, now.toISOString());
  const allDormantes = computeDormantes(risks.dormanteInputs, now);
  return {
    dormantes: allDormantes.slice(0, 6),
    rdvADebriefer: risks.rdvADebriefer.slice(0, 6).map((r) => ({
      id: r.id,
      titre: r.titre,
      debut: r.debut,
      compte: r.compte?.nom ?? null,
    })),
    dormantesTotal: allDormantes.length,
    rdvADebrieferTotal: risks.rdvADebriefer.length,
  };
}

/** Toute l'activité (timeline complète) - pour la modale « Voir tout » du dashboard. */
export async function listAllActivites(
  limit = 200,
): Promise<DashboardActivite[]> {
  const supabase = await createCrmClient();
  const { data, error } = await supabase
    .from('activites')
    .select('id, type, contenu, created_at, auteur_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as (Omit<DashboardActivite, 'auteur'> & {
    auteur_id: string | null;
  })[];
  const users = await fetchCrmUsers(rows.map((a) => a.auteur_id));
  return rows.map(({ auteur_id, ...a }) => {
    const u = auteur_id ? users.get(auteur_id) : undefined;
    return { ...a, auteur: u ? { prenom: u.prenom, nom: u.nom } : null };
  });
}
