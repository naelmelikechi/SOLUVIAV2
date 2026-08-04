// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  aggregateMonthByProjet,
  rollupByClient,
  projectByProjet,
  nextMonthKey,
  type ContratInput,
  type FactureInput,
  type PaiementInput,
  type ProjetInfo,
} from '@/lib/queries/production-rollup';

function projet(
  id: string,
  clientId: string,
  clientName: string,
  taux: number | null = 40,
): ProjetInfo {
  return {
    id,
    ref: `00${id}-TST-APP`,
    client_id: clientId,
    taux_commission: taux,
    client: { id: clientId, raison_sociale: clientName },
  };
}

function facture(
  id: string,
  montantHt: number,
  statut: string,
  p: ProjetInfo | null,
  opts: { estAvoir?: boolean; origineId?: string | null } = {},
): FactureInput {
  return {
    id,
    montant_ht: montantHt,
    statut,
    est_avoir: opts.estAvoir ?? false,
    facture_origine_id: opts.origineId ?? null,
    projet: p,
  };
}

describe('nextMonthKey', () => {
  it('mois suivant simple et passage d annee', () => {
    expect(nextMonthKey('2026-07')).toBe('2026-08');
    expect(nextMonthKey('2026-12')).toBe('2027-01');
    expect(nextMonthKey('2026-01')).toBe('2026-02');
  });

  it('bornes courtes correctes lexicographiquement pour les formats mixtes de mois_concerne', () => {
    const low = '2026-07';
    const high = nextMonthKey('2026-07');
    // Format court event-based
    expect('2026-07' >= low && '2026-07' < high).toBe(true);
    // Format long echeancier
    expect('2026-07-01' >= low && '2026-07-01' < high).toBe(true);
    // Plage echeancier
    expect('2026-07-01 - 2026-08-01' >= low).toBe(true);
    expect('2026-07-01 - 2026-08-01' < high).toBe(true);
    // Mois adjacents exclus, dans les deux formats
    expect('2026-06' < low).toBe(true);
    expect('2026-06-01' < low).toBe(true);
    expect('2026-08' >= high).toBe(true);
    expect('2026-08-01' >= high).toBe(true);
  });
});

describe('aggregateMonthByProjet', () => {
  const pA = projet('a', 'c1', 'HEOL', 40);
  const pB = projet('b', 'c1', 'HEOL', 50);
  const pC = projet('c', 'c2', 'MONKY', 55);

  // Contrat 12 mois demarrant en janvier : mensualite SOLUVIA presente en
  // juillet, versement OPCO M+7 aussi en aout (pas juillet).
  const contrats: ContratInput[] = [
    {
      date_debut: '2026-01-15',
      duree_mois: 12,
      npec_amount: 10000,
      projet: pA,
    },
    { date_debut: '2026-01-15', duree_mois: 12, npec_amount: 6000, projet: pB },
    { date_debut: '2025-01-15', duree_mois: 12, npec_amount: 9000, projet: pC }, // termine avant juillet 2026
  ];
  const factures: FactureInput[] = [
    facture('f1', 1000, 'emise', pA),
    facture('f2', 500, 'en_retard', pA),
    facture('f3', 200, 'payee', pC),
  ];
  const paiements: PaiementInput[] = [
    // Paiement TTC 240 sur une facture HT 200 / TTC 240 -> encaisse HT = 200
    {
      montant: 240,
      facture: { montant_ht: 200, montant_ttc: 240, projet_id: 'c' },
    },
    // Paiement sur une facture d un projet inconnu du mois -> ignore
    {
      montant: 100,
      facture: { montant_ht: 100, montant_ttc: 120, projet_id: 'zz' },
    },
  ];

  const agg = aggregateMonthByProjet('2026-07', contrats, factures, paiements);

  it('production SOLUVIA du mois par projet (contrats actifs uniquement)', () => {
    // pA : TTC 4000 -> HT 3333.33 / 12 = 277.78
    expect(agg.get('a')!.productionSoluvia).toBeCloseTo(277.78, 2);
    // pB : TTC 3000 -> HT 2500 / 12 = 208.33
    expect(agg.get('b')!.productionSoluvia).toBeCloseTo(208.33, 2);
    // pC : contrat 2025 termine, aucune production en 2026-07 mais une facture
    expect(agg.get('c')!.productionSoluvia).toBe(0);
  });

  it('factures et retards agreges par projet', () => {
    expect(agg.get('a')!.facture).toBe(1500);
    expect(agg.get('a')!.enRetard).toBe(500);
    expect(agg.get('c')!.facture).toBe(200);
  });

  it('encaisse HT au prorata HT/TTC de la facture, paiements orphelins ignores', () => {
    expect(agg.get('c')!.encaisse).toBeCloseTo(200, 2);
    expect(agg.has('zz')).toBe(false);
  });

  it('avoirs emis deduits du facture, facture soldee par avoir sortie du retard', () => {
    const withAvoirs = aggregateMonthByProjet(
      '2026-07',
      [],
      [
        // Facture en retard totalement soldee par un avoir emis
        facture('f10', 4012.8, 'en_retard', pA),
        facture('a10', -4012.8, 'avoir', pA, {
          estAvoir: true,
          origineId: 'f10',
        }),
        // Facture en retard avec avoir partiel
        facture('f11', 1000, 'en_retard', pA),
        facture('a11', -400, 'avoir', pA, { estAvoir: true, origineId: 'f11' }),
        // Facture en retard sans avoir
        facture('f12', 500, 'en_retard', pA),
      ],
      [],
    );
    const a = withAvoirs.get('a')!;
    // Facture net : 4012.8 - 4012.8 + 1000 - 400 + 500 = 1100
    expect(a.facture).toBeCloseTo(1100, 2);
    // En retard : 0 (soldee) + 600 (partiel) + 500 = 1100
    expect(a.enRetard).toBeCloseTo(1100, 2);
  });

  it('contrats invalides ou sans projet ignores', () => {
    const bad = aggregateMonthByProjet(
      '2026-07',
      [
        { date_debut: null, duree_mois: 12, npec_amount: 10000, projet: pA },
        {
          date_debut: '2026-01-15',
          duree_mois: 0,
          npec_amount: 10000,
          projet: pA,
        },
        {
          date_debut: '2026-01-15',
          duree_mois: 12,
          npec_amount: 10000,
          projet: null,
        },
      ],
      [],
      [],
    );
    expect(bad.size).toBe(0);
  });
});

describe('rollupByClient / projectByProjet', () => {
  const pA = projet('a', 'c1', 'HEOL', 40);
  const pB = projet('b', 'c1', 'HEOL', 50);
  const agg = aggregateMonthByProjet(
    '2026-07',
    [
      {
        date_debut: '2026-01-15',
        duree_mois: 12,
        npec_amount: 10000,
        projet: pA,
      },
      {
        date_debut: '2026-01-15',
        duree_mois: 12,
        npec_amount: 6000,
        projet: pB,
      },
    ],
    [facture('f1', 1000, 'emise', pA), facture('f2', 300, 'en_retard', pB)],
    [],
  );

  it('le rollup client somme exactement les lignes projet (coherence drill-down)', () => {
    const clients = rollupByClient(agg);
    const projets = projectByProjet(agg);
    expect(clients).toHaveLength(1);
    const c1 = clients[0]!;
    expect(c1.clientId).toBe('c1');
    expect(c1.clientName).toBe('HEOL');
    expect(c1.nbProjets).toBe(2);
    const sum = (
      k: 'production' | 'productionSoluvia' | 'facture' | 'enRetard',
    ) => projets.reduce((acc, p) => acc + p[k], 0);
    expect(c1.production).toBeCloseTo(sum('production'), 2);
    expect(c1.productionSoluvia).toBeCloseTo(sum('productionSoluvia'), 2);
    expect(c1.facture).toBeCloseTo(sum('facture'), 2);
    expect(c1.enRetard).toBeCloseTo(sum('enRetard'), 2);
  });

  it('commission projet = moyenne des taux des contrats contributeurs', () => {
    const projets = projectByProjet(agg);
    const a = projets.find((p) => p.projetId === 'a')!;
    expect(a.commission).toBe(40);
    expect(a.nbContrats).toBe(1);
  });
});
