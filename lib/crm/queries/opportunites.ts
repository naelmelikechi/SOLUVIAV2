import { unstable_cache } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import type { ActiviteType } from '@/lib/crm/database.types';
import type { OppStatut, RdvStatut, Priorite } from '@/lib/crm/domain/enums';

/**
 * Étapes actives, cachées inter-requêtes (config quasi immuable, sinon refetchée
 * à chaque rendu de pipeline/dashboard/récap). Lecture via le client service-role :
 * `cookies()` est interdit dans unstable_cache, et `etapes` ne contient rien de
 * sensible (libellés/couleurs/ordre). Aucune action n'écrit etapes aujourd'hui
 * (écriture réservée admin en DB) ; si ça arrive un jour, invalider
 * avec `revalidateTag("etapes")`. TTL 1 h en filet.
 */
export const listEtapes = unstable_cache(
  async () => {
    const supabase = createCrmAdminClient();
    const { data, error } = await supabase
      .from('etapes')
      .select('*')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data ?? [];
  },
  ['etapes-actives'],
  { tags: ['etapes'], revalidate: 3600 },
);

// L'identité commerciale (owner) vit dans `public.users` (SOLUVIA), pas dans un
// `profiles.nom_complet` : embed cross-schema via la FK explicite, colonnes
// prenom/nom (le nom affichable est recomposé côté consommateur).
const OPP_LIST_BASE = `id, intitule, probabilite, statut, etape_id, date_cloture_prevue, nb_alternants,
  owner:users!opportunites_owner_id_fkey(prenom, nom)`;

export type OppListItem = {
  id: string;
  intitule: string;
  probabilite: number | null;
  statut: OppStatut;
  etape_id: string;
  date_cloture_prevue: string | null;
  nb_alternants: number | null;
  owner: { prenom: string | null; nom: string | null } | null;
  compte: {
    id: string;
    nom: string;
    adresses: { departement: string | null; region: string | null }[];
  } | null;
};

export async function listOpportunites(): Promise<OppListItem[]> {
  const supabase = await createCrmClient();
  // Enrichi avec les zones (adresses) de la société pour le filtre du pipeline.
  const { data, error } = await supabase
    .from('opportunites')
    .select(
      `${OPP_LIST_BASE}, compte:comptes(id, nom, adresses(departement, region))`,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OppListItem[];
}

export type OppDetailContact = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  principal: boolean;
};
export type OppDetailAdresse = {
  id: string;
  libelle: string | null;
  ville: string | null;
  departement: string | null;
  region: string | null;
  principal: boolean;
};
export type OppDetailActivite = {
  id: string;
  type: ActiviteType;
  contenu: string;
  created_at: string;
  auteur: { prenom: string | null; nom: string | null } | null;
};
export type OppDetailRelance = {
  id: string;
  titre: string;
  date_echeance: string;
  fait: boolean;
  priorite: Priorite;
};
export type OppDetailRdv = {
  id: string;
  titre: string;
  debut: string;
  statut: RdvStatut;
};
export type OppDetail = {
  id: string;
  intitule: string;
  statut: OppStatut;
  etape_id: string;
  probabilite: number | null;
  formation_visee: string | null;
  nb_alternants: number | null;
  source: string | null;
  date_cloture_prevue: string | null;
  cfa: string | null;
  date_cible_prochain_rdv: string | null;
  compte: {
    id: string;
    nom: string;
    nombre_collaborateurs: number | null;
    contacts: OppDetailContact[];
    adresses: OppDetailAdresse[];
  } | null;
  activites: OppDetailActivite[];
  relances: OppDetailRelance[];
  rdv: OppDetailRdv[];
};

export async function getOpportunite(id: string): Promise<OppDetail | null> {
  const supabase = await createCrmClient();
  // Colonnes ciblées (celles du type OppDetail du drawer) au lieu de `*`, et
  // timeline bornée aux 30 dernières activités (elles s'accumulent sans limite ;
  // même esprit que le plafonnement de fetchRisks).
  const withAdresses = `id, intitule, statut, etape_id, probabilite, formation_visee, nb_alternants,
      source, date_cloture_prevue, cfa, date_cible_prochain_rdv,
      compte:comptes(id, nom, nombre_collaborateurs, contacts(id, prenom, nom, email, telephone, principal), adresses(id, libelle, ville, departement, region, principal)),
      activites(id, type, contenu, created_at, auteur:users!activites_auteur_id_fkey(prenom, nom)),
      relances(id, titre, date_echeance, fait, priorite),
      rdv(id, titre, debut, statut)`;
  const { data, error } = await supabase
    .from('opportunites')
    .select(withAdresses)
    .eq('id', id)
    .is('relances.archived_at', null) // les relances archivées n'apparaissent pas dans le drawer
    .order('created_at', { referencedTable: 'activites', ascending: false })
    .limit(30, { referencedTable: 'activites' })
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OppDetail | null) ?? null;
}
