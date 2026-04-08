import { createClient } from '@/lib/supabase/server';

export async function getProjetsList() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      statut,
      date_debut,
      taux_commission,
      est_absence,
      client:clients!projets_client_id_fkey (
        id,
        trigramme,
        raison_sociale
      ),
      typologie:typologies_projet!projets_typologie_id_fkey (
        code,
        libelle
      ),
      cdp:users!projets_cdp_id_fkey (
        id,
        nom,
        prenom
      ),
      backup_cdp:users!projets_backup_cdp_id_fkey (
        id,
        nom,
        prenom
      )
    `,
    )
    .eq('est_absence', false)
    .eq('archive', false)
    .order('ref', { ascending: true });

  if (error) throw error;
  return data;
}

export type ProjetListItem = Awaited<ReturnType<typeof getProjetsList>>[number];

export async function getProjetByRef(ref: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id,
      ref,
      statut,
      date_debut,
      taux_commission,
      est_absence,
      client:clients!projets_client_id_fkey (
        id,
        trigramme,
        raison_sociale,
        siret,
        adresse,
        localisation
      ),
      typologie:typologies_projet!projets_typologie_id_fkey (
        code,
        libelle
      ),
      cdp:users!projets_cdp_id_fkey (
        id,
        nom,
        prenom,
        email
      ),
      backup_cdp:users!projets_backup_cdp_id_fkey (
        id,
        nom,
        prenom,
        email
      )
    `,
    )
    .eq('ref', ref)
    .single();

  if (error) return null;
  return data;
}

export type ProjetDetail = NonNullable<
  Awaited<ReturnType<typeof getProjetByRef>>
>;

export async function getContratsByProjetId(projetId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contrats')
    .select('*')
    .eq('projet_id', projetId)
    .eq('archive', false)
    .order('ref', { ascending: true });

  if (error) throw error;
  return data;
}
