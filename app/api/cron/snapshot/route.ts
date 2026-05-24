import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { format, startOfMonth } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeTauxAbandon,
  computeTauxFinancement,
  computePedagogieAvancement,
  groupContratsByType,
} from '@/lib/utils/kpi-computations';
import { ACTIVE_CONTRACT_STATES } from '@/lib/utils/contrat-states';

export const maxDuration = 300;

type Scope = 'global' | 'projet' | 'cdp';

type SnapshotRow = {
  mois: string;
  type_kpi: string;
  valeur: number;
  scope: Scope;
  scope_id: string | null;
};

// Calcule taux_qualiopi. V1 : scope=global uniquement (qualite_taches non disponible).
// TODO: adapter quand schema qualite_taches verifie
async function computeTauxQualiopi(
  _supabase: SupabaseClient,
  scope: Scope,
  _scopeId: string | null,
): Promise<number> {
  // En scope=projet/cdp : Qualiopi est par CFA, retourne 0 en V1
  if (scope !== 'global') return 0;

  // La table qualite_taches n'existe pas encore dans le schema courant.
  // Retourne 0 jusqu'a ce que la table soit cree.
  // TODO: adapter quand qualite_taches est disponible avec colonne statut='conforme'
  return 0;
}

// Traite les items en chunks pour limiter le parallelisme Supabase
async function chunked<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const res = await Promise.all(chunk.map(fn));
    results.push(...res);
  }
  return results;
}

async function computeKpisForScope(
  supabase: SupabaseClient,
  scope: Scope,
  scopeId: string | null,
  mois: string,
): Promise<SnapshotRow[]> {
  // Sentinel pour eviter les requetes IN([]) qui crashent Supabase
  const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

  // 1. Projets actifs du scope (pour recuperer les IDs et le count)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let projetsQ: any = supabase
    .from('projets')
    .select(
      'id, cdp_id, backup_cdp_id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
      { count: 'exact', head: false },
    )
    .eq('statut', 'actif')
    .eq('archive', false)
    .eq('client.is_demo', false)
    .eq('client.archive', false);

  if (scope === 'projet') {
    projetsQ = projetsQ.eq('id', scopeId as string);
  } else if (scope === 'cdp') {
    projetsQ = projetsQ.or(`cdp_id.eq.${scopeId},backup_cdp_id.eq.${scopeId}`);
  }

  const projetsRes = await projetsQ;
  const projetIds: string[] = (projetsRes.data ?? []).map(
    (p: { id: string }) => p.id,
  );
  const projetCount: number = projetsRes.count ?? 0;

  // IDs pour filtrer les requetes suivantes (scope=projet/cdp)
  const projetIdsFilter = projetIds.length > 0 ? projetIds : [EMPTY_UUID];

  // 2. Factures du scope
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let facturesQ: any = supabase
    .from('factures')
    .select(
      'montant_ht, statut, est_avoir, projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id)',
    )
    .in('statut', ['emise', 'payee', 'en_retard'])
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (scope === 'projet') {
    facturesQ = facturesQ.in('projet_id', projetIdsFilter);
  } else if (scope === 'cdp') {
    facturesQ = facturesQ.or(
      `cdp_id.eq.${scopeId},backup_cdp_id.eq.${scopeId}`,
      { foreignTable: 'projet' },
    );
  }

  const facturesRes = await facturesQ;

  // 3. Paiements du scope
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paiementsQ: any = supabase
    .from('paiements')
    .select(
      'montant, facture:factures!paiements_facture_id_fkey!inner(projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id))',
    )
    .eq('facture.projet.client.is_demo', false)
    .eq('facture.projet.client.archive', false);

  if (scope === 'projet') {
    paiementsQ = paiementsQ.in('facture.projet_id', projetIdsFilter);
  } else if (scope === 'cdp') {
    paiementsQ = paiementsQ.or(
      `cdp_id.eq.${scopeId},backup_cdp_id.eq.${scopeId}`,
      { foreignTable: 'facture.projet' },
    );
  }

  const paiementsRes = await paiementsQ;

  // 4. Contrats du scope : actifs + abandons + progressions (un seul fetch enrichi)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contratsQ: any = supabase
    .from('contrats')
    .select(
      'id, contract_state, contract_type, npec_amount, projet_id, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id), contrats_progressions(progression_percentage)',
    )
    .eq('archive', false)
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (scope === 'projet') {
    contratsQ = contratsQ.in('projet_id', projetIdsFilter);
  } else if (scope === 'cdp') {
    contratsQ = contratsQ.or(
      `cdp_id.eq.${scopeId},backup_cdp_id.eq.${scopeId}`,
      { foreignTable: 'projet' },
    );
  }

  const contratsRes = await contratsQ;
  const contrats = contratsRes.data ?? [];

  // Aggregations factures
  const factures = facturesRes.data ?? [];
  const facturesEmises = factures.length;
  const facturesEnRetard = factures.filter(
    (f: { statut: string }) => f.statut === 'en_retard',
  ).length;
  const totalFactureHt = factures
    .filter((f: { est_avoir: boolean }) => !f.est_avoir)
    .reduce((s: number, f: { montant_ht: number }) => s + f.montant_ht, 0);
  const totalEncaisse = (paiementsRes.data ?? []).reduce(
    (s: number, p: { montant: number }) => s + p.montant,
    0,
  );

  // Contrats actifs selon ACTIVE_CONTRACT_STATES (contrat-states.ts)
  const contratsActifs = contrats.filter((c: { contract_state: string }) =>
    ACTIVE_CONTRACT_STATES.has(c.contract_state),
  );

  // Calcul des nouveaux KPIs via helpers purs
  const tauxAbandon = computeTauxAbandon(contrats);
  const tauxFinancement = computeTauxFinancement(
    contratsActifs,
    totalFactureHt,
  );
  const pedagogie = computePedagogieAvancement(contratsActifs);
  const byType = groupContratsByType(contratsActifs);

  // taux_qualiopi : V1 global uniquement (voir commentaire TODO dans la fonction)
  const tauxQualiopi = await computeTauxQualiopi(supabase, scope, scopeId);

  const rows: SnapshotRow[] = [
    {
      mois,
      type_kpi: 'projets_actifs',
      valeur: projetCount,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'factures_emises',
      valeur: facturesEmises,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'factures_en_retard',
      valeur: facturesEnRetard,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'total_facture_ht',
      valeur: totalFactureHt,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'total_encaisse',
      valeur: totalEncaisse,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'contrats_actifs',
      valeur: contratsActifs.length,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'taux_qualiopi',
      valeur: tauxQualiopi,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'pedagogie_avancement',
      valeur: pedagogie,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'taux_financement',
      valeur: tauxFinancement,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'taux_abandon',
      valeur: tauxAbandon,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'taux_rupture',
      valeur: tauxAbandon, // alias Eduvia pour taux_abandon
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'contrats_app',
      valeur: byType.app,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'contrats_pdc',
      valeur: byType.pdc,
      scope,
      scope_id: scopeId,
    },
    {
      mois,
      type_kpi: 'contrats_poe',
      valeur: byType.poe,
      scope,
      scope_id: scopeId,
    },
  ];

  return rows;
}

// CRON: snapshot KPI mensuel multi-scope (global + par projet + par CDP)
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const mois = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const start = Date.now();

  try {
    // 1. KPIs globaux
    const globalRows = await computeKpisForScope(
      supabase,
      'global',
      null,
      mois,
    );

    // 2. KPIs par projet actif (chunks de 10 pour limiter le parallelisme)
    const { data: projets } = await supabase
      .from('projets')
      .select(
        'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
      )
      .eq('statut', 'actif')
      .eq('archive', false)
      .eq('client.is_demo', false)
      .eq('client.archive', false);

    const projetRows = await chunked(projets ?? [], 10, (p: { id: string }) =>
      computeKpisForScope(supabase, 'projet', p.id, mois),
    );

    // 3. KPIs par CDP actif (actif=true, archive n'existe pas sur users)
    const { data: cdps } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'cdp')
      .eq('actif', true);

    const cdpRows = await chunked(cdps ?? [], 10, (u: { id: string }) =>
      computeKpisForScope(supabase, 'cdp', u.id, mois),
    );

    const allRows = [...globalRows, ...projetRows.flat(), ...cdpRows.flat()];

    // Upsert idempotent - ignoreDuplicates=true : safe a rejouer plusieurs fois
    const { error } = await supabase.from('kpi_snapshots').upsert(allRows, {
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

    const ms = Date.now() - start;
    logger.info('cron.snapshot', `KPI snapshot captured for ${mois}`, {
      mois,
      global: globalRows.length,
      projet: projetRows.flat().length,
      cdp: cdpRows.flat().length,
      ms,
    });

    return NextResponse.json({
      success: true,
      mois,
      counts: {
        global: globalRows.length,
        projet: projetRows.flat().length,
        cdp: cdpRows.flat().length,
      },
      ms,
    });
  } catch (err) {
    logger.error('cron.snapshot', err, { mois });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
