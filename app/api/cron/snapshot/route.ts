import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { format, startOfMonth } from 'date-fns';

export const maxDuration = 120;

// CRON: Monthly KPI snapshot (runs on the 1st of each month)
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const mois = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  try {
    // Run all KPI queries in parallel
    // Filtres clients reels (is_demo=false, archive=false) sur toutes les
    // queries pour rester coherent avec /production et /dashboard.
    const [projetsRes, facturesRes, paiementsRes, contratsRes] =
      await Promise.all([
        // projets_actifs
        supabase
          .from('projets')
          .select(
            'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
            { count: 'exact', head: false },
          )
          .eq('statut', 'actif')
          .eq('archive', false)
          .eq('client.is_demo', false)
          .eq('client.archive', false),
        // factures (multiple KPIs derived from this)
        supabase
          .from('factures')
          .select(
            'montant_ht, statut, est_avoir, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
          )
          .in('statut', ['emise', 'payee', 'en_retard'])
          .eq('projet.client.is_demo', false)
          .eq('projet.client.archive', false),
        // total_encaisse
        supabase
          .from('paiements')
          .select(
            'montant, facture:factures!paiements_facture_id_fkey!inner(projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive)))',
          )
          .eq('facture.projet.client.is_demo', false)
          .eq('facture.projet.client.archive', false),
        // contrats_actifs
        supabase
          .from('contrats')
          .select(
            'id, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
            { count: 'exact', head: false },
          )
          .eq('archive', false)
          .eq('projet.client.is_demo', false)
          .eq('projet.client.archive', false),
      ]);

    const factures = facturesRes.data ?? [];
    const facturesEmises = factures.length;
    const facturesEnRetard = factures.filter(
      (f) => f.statut === 'en_retard',
    ).length;
    const totalFactureHt = factures
      .filter((f) => !f.est_avoir)
      .reduce((sum, f) => sum + f.montant_ht, 0);
    const totalEncaisse = (paiementsRes.data ?? []).reduce(
      (sum, p) => sum + p.montant,
      0,
    );

    const snapshots = [
      {
        mois,
        type_kpi: 'projets_actifs',
        valeur: projetsRes.count ?? 0,
        scope: 'global' as const,
        scope_id: null,
      },
      {
        mois,
        type_kpi: 'factures_emises',
        valeur: facturesEmises,
        scope: 'global' as const,
        scope_id: null,
      },
      {
        mois,
        type_kpi: 'factures_en_retard',
        valeur: facturesEnRetard,
        scope: 'global' as const,
        scope_id: null,
      },
      {
        mois,
        type_kpi: 'total_facture_ht',
        valeur: totalFactureHt,
        scope: 'global' as const,
        scope_id: null,
      },
      {
        mois,
        type_kpi: 'total_encaisse',
        valeur: totalEncaisse,
        scope: 'global' as const,
        scope_id: null,
      },
      {
        mois,
        type_kpi: 'contrats_actifs',
        valeur: contratsRes.count ?? 0,
        scope: 'global' as const,
        scope_id: null,
      },
    ];

    // Upsert - ignoreDuplicates makes it idempotent (safe to run multiple times)
    const { error } = await supabase.from('kpi_snapshots').upsert(snapshots, {
      onConflict: 'mois,type_kpi,scope,scope_id',
      ignoreDuplicates: true,
    });

    if (error) {
      logger.error('cron.snapshot', error, { mois });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    logger.info('cron.snapshot', `KPI snapshot captured for ${mois}`, {
      mois,
      count: snapshots.length,
    });

    return NextResponse.json({
      success: true,
      message: `KPI snapshot captured for ${mois}`,
      mois,
      kpis: snapshots.length,
    });
  } catch (err) {
    logger.error('cron.snapshot', err, { mois });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
