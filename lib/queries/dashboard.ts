import { createClient } from '@/lib/supabase/server';

export async function getDashboardData() {
  const supabase = await createClient();

  const [projetsRes, facturesRes, tachesRes, echeancesRes, contratsRes] =
    await Promise.all([
      supabase
        .from('projets')
        .select('id')
        .eq('statut', 'actif')
        .eq('est_absence', false),
      supabase.from('factures').select('id, statut'),
      supabase.from('taches_qualite').select('id').eq('fait', false),
      supabase
        .from('echeances')
        .select('id')
        .is('facture_id', null)
        .eq('validee', false),
      supabase
        .from('contrats')
        .select('id')
        .eq('contract_state', 'actif')
        .eq('archive', false),
    ]);

  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard:
      facturesRes.data?.filter((f) => f.statut === 'en_retard').length ?? 0,
    facturesEmises:
      facturesRes.data?.filter((f) => f.statut === 'emise').length ?? 0,
    tachesEnAttente: tachesRes.data?.length ?? 0,
    echeancesAFacturer: echeancesRes.data?.length ?? 0,
    contratsActifs: contratsRes.data?.length ?? 0,
  };
}
