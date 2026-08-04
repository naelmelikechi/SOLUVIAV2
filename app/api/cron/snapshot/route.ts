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
import { encaisseHt } from '@/lib/utils/montant-ht';
import { computeQualiopiCompletionForClients } from '@/lib/queries/qualiopi-stats';

export const maxDuration = 300;

type Scope = 'global' | 'projet' | 'cdp';

type SnapshotRow = {
  mois: string;
  type_kpi: string;
  valeur: number;
  scope: Scope;
  scope_id: string | null;
};

// Calcule taux_qualiopi via l'API Eduvia (deliverables conform / total).
// La donnee Qualiopi vit cote Eduvia, pas dans une table SOLUVIA.
// Agrege par CFA (client) du scope, puis sum(conform) / sum(total).
// Retourne null quand Eduvia n'a AUCUN livrable (total=0) ou en erreur :
// snapshotter 0 rendait "pas de donnees" indistinguable d'un vrai 0% de
// conformite (la card affichait 0,0% au lieu de --).
async function computeTauxQualiopi(
  supabase: SupabaseClient,
  scope: Scope,
  scopeId: string | null,
): Promise<number | null> {
  try {
    // Recupere les client_ids du scope
    let clientIds: string[] = [];

    if (scope === 'global') {
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('is_demo', false)
        .eq('archive', false);
      clientIds = (data ?? []).map((c) => c.id as string);
    } else if (scope === 'projet') {
      const { data } = await supabase
        .from('projets')
        .select('client_id')
        .eq('id', scopeId as string)
        .single();
      if (data?.client_id) clientIds = [data.client_id as string];
    } else if (scope === 'cdp') {
      const { data } = (await supabase
        .from('projets')
        .select(
          'client_id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
        )
        .eq('archive', false)
        .eq('client.is_demo', false)
        .eq('client.archive', false)
        .or(`cdp_id.eq.${scopeId},backup_cdp_id.eq.${scopeId}`)) as unknown as {
        data: Array<{ client_id: string }>;
      };
      clientIds = Array.from(
        new Set(
          (data ?? []).flatMap((p) => (p.client_id ? [p.client_id] : [])),
        ),
      );
    }

    if (clientIds.length === 0) return 0;

    // Eduvia API calls (peut etre lent + reseau). Fallback 0 si erreur.
    const completions = await computeQualiopiCompletionForClients(clientIds);
    let realise = 0;
    let total = 0;
    for (const c of completions.values()) {
      realise += c.realise;
      total += c.total;
    }
    if (total === 0) return null;
    return Math.round((realise / total) * 10000) / 100;
  } catch (err) {
    logger.error('cron.snapshot', err, {
      step: 'compute_taux_qualiopi',
      scope,
      scopeId,
    });
    return null;
  }
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
    // oxlint-disable-next-line react-doctor/async-await-in-loop
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
    .eq('client.archive', false)
    .eq('est_libre', false);

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
      'id, montant_ht, statut, est_avoir, facture_origine_id, projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id)',
    )
    // Avoirs emis inclus (statut 'avoir', montants negatifs) : le total
    // facture est NET des avoirs, et le compte "en retard" ignore les
    // factures totalement soldees par un avoir.
    .in('statut', ['emise', 'payee', 'en_retard', 'avoir'])
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
      'montant, facture:factures!paiements_facture_id_fkey!inner(montant_ht, montant_ttc, projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id))',
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
  type SnapshotFacture = {
    id: string;
    montant_ht: number;
    statut: string;
    est_avoir: boolean;
    facture_origine_id: string | null;
  };
  const factures = (facturesRes.data ?? []) as SnapshotFacture[];
  // Avoirs emis indexes par facture d'origine (netting du "en retard").
  const avoirByOrigine = new Map<string, number>();
  for (const f of factures) {
    if (f.est_avoir && f.statut === 'avoir' && f.facture_origine_id) {
      avoirByOrigine.set(
        f.facture_origine_id,
        (avoirByOrigine.get(f.facture_origine_id) ?? 0) + (f.montant_ht ?? 0),
      );
    }
  }
  const facturesEmises = factures.filter((f) => !f.est_avoir).length;
  const facturesEnRetard = factures.filter(
    (f) =>
      f.statut === 'en_retard' &&
      (f.montant_ht ?? 0) + (avoirByOrigine.get(f.id) ?? 0) > 0,
  ).length;
  // Net des avoirs : les avoirs emis (montants negatifs) sont dans la liste.
  const totalFactureHt = factures.reduce(
    (s: number, f) => s + (f.montant_ht ?? 0),
    0,
  );
  // Encaissé en HT (prorata HT/TTC de chaque facture), cohérent avec total_facture_ht.
  const totalEncaisse = (paiementsRes.data ?? []).reduce(
    (
      s: number,
      p: {
        montant: number;
        facture?: { montant_ht: number; montant_ttc: number } | null;
      },
    ) =>
      s +
      encaisseHt(
        p.montant,
        p.facture?.montant_ht ?? 0,
        p.facture?.montant_ttc ?? 0,
      ),
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
    // taux_qualiopi omis quand null (pas de donnees Eduvia) : la card
    // sparkline affiche alors -- au lieu d'un 0,0% trompeur.
    ...(tauxQualiopi === null
      ? []
      : [
          {
            mois,
            type_kpi: 'taux_qualiopi',
            valeur: tauxQualiopi,
            scope,
            scope_id: scopeId,
          },
        ]),
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
    // 1. KPIs globaux + listes projets/CDP en parallele (independants).
    const [globalRows, { data: projets }, { data: cdps }] = await Promise.all([
      computeKpisForScope(supabase, 'global', null, mois),
      supabase
        .from('projets')
        .select(
          'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
        )
        .eq('statut', 'actif')
        .eq('archive', false)
        .eq('client.is_demo', false)
        .eq('client.archive', false)
        .eq('est_libre', false),
      supabase.from('users').select('id').eq('role', 'cdp').eq('actif', true),
    ]);

    const [projetRows, cdpRows] = await Promise.all([
      chunked(projets ?? [], 10, (p: { id: string }) =>
        computeKpisForScope(supabase, 'projet', p.id, mois),
      ),
      chunked(cdps ?? [], 10, (u: { id: string }) =>
        computeKpisForScope(supabase, 'cdp', u.id, mois),
      ),
    ]);

    const scopedRows = [...projetRows.flat(), ...cdpRows.flat()];

    // Upsert global : scope_id IS NULL — l'index COALESCE empeche les doublons
    // mais PostgREST ne peut pas cibler un index fonctionnel via onConflict.
    // On utilise INSERT avec ignoreDuplicates via un index partiel dedie
    // (uq_snapshot_scoped WHERE scope_id IS NOT NULL ne couvre pas le global),
    // donc on supprime + reinsere pour l'idempotence du CRON mensuel.
    const { error: delGlobalError } = await supabase
      .from('kpi_snapshots')
      .delete()
      .eq('mois', mois)
      .eq('scope', 'global')
      .is('scope_id', null);

    if (delGlobalError) {
      logger.error('cron.snapshot', delGlobalError, {
        mois,
        step: 'delete_global',
      });
      return NextResponse.json(
        { success: false, error: delGlobalError.message },
        { status: 500 },
      );
    }

    const { error: insGlobalError } = await supabase
      .from('kpi_snapshots')
      .insert(globalRows);

    if (insGlobalError) {
      logger.error('cron.snapshot', insGlobalError, {
        mois,
        step: 'insert_global',
      });
      return NextResponse.json(
        { success: false, error: insGlobalError.message },
        { status: 500 },
      );
    }

    // Projet/cdp : DELETE + INSERT (PostgREST ne sait pas cibler un index
    // partiel via onConflict). Atomique-ish pour un CRON mensuel.
    if (scopedRows.length > 0) {
      const { error: delScopedError } = await supabase
        .from('kpi_snapshots')
        .delete()
        .eq('mois', mois)
        .in('scope', ['projet', 'cdp']);

      if (delScopedError) {
        logger.error('cron.snapshot', delScopedError, {
          mois,
          step: 'delete_scoped',
        });
        return NextResponse.json(
          { success: false, error: delScopedError.message },
          { status: 500 },
        );
      }

      const { error: insScopedError } = await supabase
        .from('kpi_snapshots')
        .insert(scopedRows);

      if (insScopedError) {
        logger.error('cron.snapshot', insScopedError, {
          mois,
          step: 'insert_scoped',
        });
        return NextResponse.json(
          { success: false, error: insScopedError.message },
          { status: 500 },
        );
      }
    }

    const ms = Date.now() - start;
    const projetFlat = projetRows.flat();
    const cdpFlat = cdpRows.flat();
    logger.info('cron.snapshot', `KPI snapshot captured for ${mois}`, {
      mois,
      global: globalRows.length,
      projet: projetFlat.length,
      cdp: cdpFlat.length,
      ms,
    });

    return NextResponse.json({
      success: true,
      mois,
      counts: {
        global: globalRows.length,
        projet: projetFlat.length,
        cdp: cdpFlat.length,
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
