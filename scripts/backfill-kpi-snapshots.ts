/**
 * Backfill kpi_snapshots sur les N derniers mois (defaut 12) au scope='global'.
 *
 * Pre-requis : SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL en env (.env.local).
 *
 * Usage : npx tsx scripts/backfill-kpi-snapshots.ts [nombre_mois]
 *
 * Note : utilise l'etat ACTUEL des donnees pour chaque mois passe.
 * C'est une approximation deliberee : les sparklines historiques refletent
 * l'etat present, pas le passe reel. A executer une fois apres deploy PR2,
 * puis le CRON mensuel prend le relais.
 *
 * Scope ecrit : global uniquement (projet/cdp se construisent naturellement
 * via le CRON mensuel).
 *
 * KPIs ecrits (14) :
 *   projets_actifs, factures_emises, factures_en_retard, total_facture_ht,
 *   total_encaisse, contrats_actifs, taux_qualiopi, pedagogie_avancement,
 *   taux_financement, taux_abandon, taux_rupture, contrats_app, contrats_pdc,
 *   contrats_poe
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { subMonths, startOfMonth, format } from 'date-fns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (verifier .env.local)',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ACTIVE_CONTRACT_STATES = new Set([
  'actif',
  'ENGAGE',
  'EN_COURS_INSTRUCTION',
  'TRANSMIS',
  'NOTSENT',
]);

const ABANDON_STATES = new Set(['resilie', 'ANNULE']);

function computeTauxAbandon(
  contrats: Array<{ contract_state: string }>,
): number {
  if (contrats.length === 0) return 0;
  const abandons = contrats.filter((c) =>
    ABANDON_STATES.has(c.contract_state),
  ).length;
  return Math.round((abandons / contrats.length) * 10000) / 100;
}

function computeTauxFinancement(
  contratsActifs: Array<{ npec_amount: number | null }>,
  totalFactureHt: number,
): number {
  const npecTotal = contratsActifs.reduce(
    (s, c) => s + (c.npec_amount ?? 0),
    0,
  );
  if (npecTotal === 0) return 0;
  return Math.round((totalFactureHt / npecTotal) * 10000) / 100;
}

function computePedagogieAvancement(
  contratsActifs: Array<{
    contrats_progressions: Array<{ progression_percentage: number }>;
  }>,
): number {
  const progressions = contratsActifs
    .flatMap((c) => c.contrats_progressions ?? [])
    .map((p) => p.progression_percentage);
  if (progressions.length === 0) return 0;
  const sum = progressions.reduce((s, v) => s + v, 0);
  return Math.round((sum / progressions.length) * 100) / 100;
}

function groupContratsByType(
  contratsActifs: Array<{ contract_type: string | null }>,
): { app: number; pdc: number; poe: number } {
  const counts = { app: 0, pdc: 0, poe: 0 };
  for (const c of contratsActifs) {
    switch (c.contract_type) {
      case 'APP':
        counts.app++;
        break;
      case 'PDC':
        counts.pdc++;
        break;
      case 'POE':
        counts.poe++;
        break;
    }
  }
  return counts;
}

type SnapshotRow = {
  mois: string;
  type_kpi: string;
  valeur: number;
  scope: 'global';
  scope_id: null;
};

async function computeGlobalForMonth(mois: string): Promise<SnapshotRow[]> {
  // Requetes paralleles - meme logique que le CRON (scope=global)
  const [projetsRes, facturesRes, paiementsRes, contratsRes] =
    await Promise.all([
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

      supabase
        .from('factures')
        .select(
          'montant_ht, statut, est_avoir, projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id)',
        )
        .in('statut', ['emise', 'payee', 'en_retard'])
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),

      supabase
        .from('paiements')
        .select(
          'montant, facture:factures!paiements_facture_id_fkey!inner(projet_id, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id))',
        )
        .eq('facture.projet.client.is_demo', false)
        .eq('facture.projet.client.archive', false),

      supabase
        .from('contrats')
        .select(
          'id, contract_state, contract_type, npec_amount, projet_id, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive), cdp_id, backup_cdp_id), contrats_progressions(progression_percentage)',
        )
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factures: any[] = facturesRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contrats: any[] = contratsRes.data ?? [];

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

  const contratsActifs = contrats.filter((c: { contract_state: string }) =>
    ACTIVE_CONTRACT_STATES.has(c.contract_state),
  );

  const tauxAbandon = computeTauxAbandon(contrats);
  const tauxFinancement = computeTauxFinancement(
    contratsActifs,
    totalFactureHt,
  );
  const pedagogie = computePedagogieAvancement(contratsActifs);
  const byType = groupContratsByType(contratsActifs);

  const rows: SnapshotRow[] = [
    {
      mois,
      type_kpi: 'projets_actifs',
      valeur: projetsRes.count ?? 0,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'factures_emises',
      valeur: facturesEmises,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'factures_en_retard',
      valeur: facturesEnRetard,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'total_facture_ht',
      valeur: totalFactureHt,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'total_encaisse',
      valeur: totalEncaisse,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'contrats_actifs',
      valeur: contratsActifs.length,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'taux_qualiopi',
      valeur: 0,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'pedagogie_avancement',
      valeur: pedagogie,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'taux_financement',
      valeur: tauxFinancement,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'taux_abandon',
      valeur: tauxAbandon,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'taux_rupture',
      valeur: tauxAbandon,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'contrats_app',
      valeur: byType.app,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'contrats_pdc',
      valeur: byType.pdc,
      scope: 'global',
      scope_id: null,
    },
    {
      mois,
      type_kpi: 'contrats_poe',
      valeur: byType.poe,
      scope: 'global',
      scope_id: null,
    },
  ];

  return rows;
}

const nbMois = Number(process.argv[2] ?? 12);

async function main() {
  console.log(`Backfill kpi_snapshots sur ${nbMois} mois (scope=global)...`);

  const today = new Date();
  let skipped = 0;
  let inserted = 0;

  for (let i = 0; i < nbMois; i++) {
    const mois = format(startOfMonth(subMonths(today, i)), 'yyyy-MM-dd');
    process.stdout.write(`  Mois ${mois}... `);

    // Verifie si des snapshots globaux existent deja pour ce mois
    const { count } = await supabase
      .from('kpi_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('mois', mois)
      .eq('scope', 'global')
      .is('scope_id', null);

    if ((count ?? 0) > 0) {
      console.log(`SKIP (${count} KPIs deja presents)`);
      skipped++;
      continue;
    }

    const rows = await computeGlobalForMonth(mois);

    const { error } = await supabase.from('kpi_snapshots').insert(rows);

    if (error) {
      console.error(`\nErreur sur ${mois}:`, error.message);
      process.exit(1);
    }

    console.log(`OK (${rows.length} KPIs inseres)`);
    inserted++;
  }

  console.log(
    `\nBackfill termine : ${inserted} mois inseres, ${skipped} mois sautes (deja presents).`,
  );
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
