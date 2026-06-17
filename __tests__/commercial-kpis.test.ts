import { describe, it, expect } from 'vitest';
import {
  computeFunnelConversion,
  computeCycleStats,
  maxReachedFunnelIndex,
  funnelIndex,
  resolvePeriodeRange,
  FUNNEL_STAGES,
  computeCommercialKpis,
} from '@/lib/queries/commercial-kpis';
import { STAGE_PROSPECT_LABELS } from '@/lib/utils/constants';

describe('funnelIndex', () => {
  it('ordonne les étapes linéaires et exclut perdu', () => {
    expect(funnelIndex('a_qualifier')).toBe(0);
    expect(funnelIndex('presente')).toBe(1);
    expect(funnelIndex('signe')).toBe(FUNNEL_STAGES.length - 1);
    expect(funnelIndex('perdu')).toBe(-1);
  });
});

describe('maxReachedFunnelIndex', () => {
  it('retient le stage courant sans historique', () => {
    expect(maxReachedFunnelIndex('a_qualifier', [])).toBe(0);
    expect(maxReachedFunnelIndex('signe', [])).toBe(4);
  });

  it("récupère l'étape max atteinte avant une perte (perdu = -1)", () => {
    // Perdu après avoir été audité : on conserve le pic à audite (index 3).
    expect(maxReachedFunnelIndex('perdu', ['presente', 'audite'])).toBe(3);
  });

  it('renvoie -1 pour un perdu sans aucune transition d entonnoir', () => {
    expect(maxReachedFunnelIndex('perdu', [])).toBe(-1);
  });

  it('prend le max entre stage courant et historique désordonné', () => {
    expect(maxReachedFunnelIndex('presente', ['cadre', 'a_qualifier'])).toBe(2);
  });
});

describe('computeFunnelConversion', () => {
  it('première étape : conversion null', () => {
    const out = computeFunnelConversion([{ stage: 'a_qualifier', count: 10 }]);
    expect(out[0]?.conversion).toBeNull();
    expect(out[0]?.label).toBe(STAGE_PROSPECT_LABELS.a_qualifier);
  });

  it('conversion partielle 0..1, complète et nulle', () => {
    const out = computeFunnelConversion([
      { stage: 'a_qualifier', count: 10 },
      { stage: 'presente', count: 5 }, // 5/10 -> partielle
      { stage: 'cadre', count: 5 }, // 5/5 -> complète
      { stage: 'audite', count: 0 }, // 0/5 -> nulle
    ]);
    expect(out[1]?.conversion).toBe(0.5);
    expect(out[2]?.conversion).toBe(1);
    expect(out[3]?.conversion).toBe(0);
  });

  it('étape précédente vide => conversion 0 (pas de division par zéro)', () => {
    const out = computeFunnelConversion([
      { stage: 'a_qualifier', count: 0 },
      { stage: 'presente', count: 0 },
    ]);
    expect(out[1]?.conversion).toBe(0);
  });

  it('entonnoir décroissant : toutes les conversions dans ]0,1]', () => {
    const counts = [100, 60, 30, 10, 4];
    const out = computeFunnelConversion(
      FUNNEL_STAGES.map((stage, i) => ({ stage, count: counts[i] ?? 0 })),
    );
    // Counts préservés et décroissants.
    expect(out.map((s) => s.count)).toEqual(counts);
    for (let i = 1; i < out.length; i++) {
      const c = out[i]?.conversion as number;
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeCycleStats', () => {
  it('liste vide => tout à 0', () => {
    expect(computeCycleStats([])).toEqual({
      count: 0,
      moyenJours: 0,
      medianJours: 0,
    });
  });

  it('nombre impair : médiane = élément central', () => {
    const out = computeCycleStats([10, 30, 20]);
    expect(out.count).toBe(3);
    expect(out.moyenJours).toBe(20);
    expect(out.medianJours).toBe(20);
  });

  it('nombre pair : médiane = moyenne des deux centraux', () => {
    const out = computeCycleStats([40, 10, 30, 20]);
    expect(out.count).toBe(4);
    expect(out.moyenJours).toBe(25);
    expect(out.medianJours).toBe(25);
  });

  it('ignore les durées négatives ou non finies', () => {
    const out = computeCycleStats([-5, Number.NaN, 10, 20]);
    expect(out.count).toBe(2);
    expect(out.moyenJours).toBe(15);
    expect(out.medianJours).toBe(15);
  });

  it('arrondit moyenne et médiane à une décimale', () => {
    const out = computeCycleStats([1, 1, 2]);
    expect(out.moyenJours).toBe(1.3); // 4/3 = 1.333..
    expect(out.medianJours).toBe(1);
  });
});

describe('resolvePeriodeRange', () => {
  const now = new Date('2026-06-17T12:00:00.000Z');

  it("'mois' : fenêtre du mois courant, période précédente non chevauchante", () => {
    const r = resolvePeriodeRange('mois', now);
    expect(r.start.getMonth()).toBe(now.getMonth());
    expect(r.start.getDate()).toBe(1);
    expect(r.start.getTime()).toBeLessThanOrEqual(r.end.getTime());
    expect(r.prevEnd.getTime()).toBeLessThan(r.start.getTime());
  });

  it("'mois_precedent' : fenêtre entièrement avant le mois courant", () => {
    const r = resolvePeriodeRange('mois_precedent', now);
    const startOfThisMonth = new Date(2026, now.getMonth(), 1).getTime();
    expect(r.end.getTime()).toBeLessThan(startOfThisMonth);
    expect(r.prevEnd.getTime()).toBeLessThan(r.start.getTime());
  });

  it("'trimestre' et 'annee' : périodes ordonnées et non chevauchantes", () => {
    for (const periode of ['trimestre', 'annee'] as const) {
      const r = resolvePeriodeRange(periode, now);
      expect(r.start.getTime()).toBeLessThanOrEqual(r.end.getTime());
      expect(r.prevStart.getTime()).toBeLessThan(r.prevEnd.getTime());
      expect(r.prevEnd.getTime()).toBeLessThan(r.start.getTime());
    }
  });
});

// ---------------------------------------------------------------------------
// Intégration : agrégation complète (client Supabase simulé). Les filtres
// fenêtre/scope sont rejoués en mémoire, le mock renvoie donc tout sans
// filtrer ; on vérifie le câblage des 6 blocs.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        gte: () => builder,
        lte: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

describe('computeCommercialKpis (intégration)', () => {
  const NOW = new Date('2026-06-17T12:00:00.000Z');

  const prospects: Row[] = [
    {
      id: 'p1',
      nom: 'Alpha',
      stage: 'a_qualifier',
      type_prospect: 'entreprise',
      canal_origine: 'reseau_direction',
      commercial_id: 'c1',
      volume_apprenants: 10,
      created_at: '2026-06-02T09:00:00.000Z',
      derniere_action_at: '2026-06-16T09:00:00.000Z',
      archive: false,
    },
    {
      id: 'p2',
      nom: 'Beta',
      stage: 'signe',
      type_prospect: 'entreprise',
      canal_origine: 'linkedin_auto',
      commercial_id: 'c1',
      volume_apprenants: 30,
      created_at: '2026-05-20T09:00:00.000Z',
      derniere_action_at: '2026-06-10T09:00:00.000Z',
      archive: false,
    },
    {
      id: 'p3',
      nom: 'Gamma',
      stage: 'audite',
      type_prospect: 'cfa',
      canal_origine: 'salon',
      commercial_id: null,
      volume_apprenants: 50,
      created_at: '2026-04-01T09:00:00.000Z',
      derniere_action_at: '2026-05-01T09:00:00.000Z',
      archive: false,
    },
    {
      id: 'p4',
      nom: 'Delta',
      stage: 'perdu',
      type_prospect: 'cfa',
      canal_origine: 'autre',
      commercial_id: 'c1',
      volume_apprenants: 5,
      created_at: '2026-03-01T09:00:00.000Z',
      derniere_action_at: '2026-03-15T09:00:00.000Z',
      archive: false,
    },
    {
      id: 'p5',
      nom: 'Epsilon',
      stage: 'presente',
      type_prospect: 'entreprise',
      canal_origine: null,
      commercial_id: 'c1',
      volume_apprenants: 20,
      created_at: '2026-06-15T09:00:00.000Z',
      derniere_action_at: '2026-06-16T09:00:00.000Z',
      archive: false,
    },
  ];

  const stageHistory: Row[] = [
    {
      prospect_id: 'p2',
      to_stage: 'presente',
      changed_at: '2026-05-22T09:00:00.000Z',
    },
    {
      prospect_id: 'p2',
      to_stage: 'cadre',
      changed_at: '2026-05-25T09:00:00.000Z',
    },
    {
      prospect_id: 'p2',
      to_stage: 'audite',
      changed_at: '2026-05-28T09:00:00.000Z',
    },
    {
      prospect_id: 'p2',
      to_stage: 'signe',
      changed_at: '2026-06-05T09:00:00.000Z',
    },
    {
      prospect_id: 'p3',
      to_stage: 'presente',
      changed_at: '2026-04-10T09:00:00.000Z',
    },
    {
      prospect_id: 'p3',
      to_stage: 'cadre',
      changed_at: '2026-04-20T09:00:00.000Z',
    },
    {
      prospect_id: 'p3',
      to_stage: 'audite',
      changed_at: '2026-04-25T09:00:00.000Z',
    },
    {
      prospect_id: 'p5',
      to_stage: 'presente',
      changed_at: '2026-06-16T09:00:00.000Z',
    },
  ];

  // p1 signe via signature_requests (sans transition d'historique) -> OU.
  const signatures: Row[] = [
    { prospect_id: 'p1', signed_at: '2026-06-12T09:00:00.000Z' },
    { prospect_id: 'p2', signed_at: '2026-06-05T09:00:00.000Z' },
  ];

  const client = makeClient({
    prospects,
    prospect_stage_history: stageHistory,
    signature_requests: signatures,
  });

  it('produit les 6 blocs cohérents pour la vue Direction', async () => {
    const kpis = await computeCommercialKpis(
      client as never,
      { periode: 'mois' },
      NOW,
    );

    // Volume (snapshots + période)
    expect(kpis.volume.actifs).toBe(4); // p1,p2,p3,p5 (p4 perdu exclu)
    expect(kpis.volume.qualifies).toBe(3); // p2,p3,p5 (présenté+)
    expect(kpis.volume.nouveaux).toEqual({ value: 2, previous: 1 });
    // p1 (signature) + p2 (history+signature) sur juin ; mai = 0
    expect(kpis.volume.signatures).toEqual({ value: 2, previous: 0 });

    // Entonnoir : décroissant, depuis l'historique + stage courant
    expect(kpis.funnel.map((s) => s.count)).toEqual([5, 3, 2, 2, 1]);
    const counts = kpis.funnel.map((s) => s.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i] ?? 0).toBeLessThanOrEqual(counts[i - 1] ?? 0);
    }
    expect(kpis.funnel[0]?.conversion).toBeNull();

    // Cycle : p1 (10 j) + p2 (16 j)
    expect(kpis.cycle).toEqual({ count: 2, moyenJours: 13, medianJours: 13 });

    // Tunnels A (entreprise) / B (cfa)
    const a = kpis.tunnels.find((t) => t.tunnel === 'entreprise')!;
    const b = kpis.tunnels.find((t) => t.tunnel === 'cfa')!;
    expect(a.volumeActif).toBe(3); // p1,p2,p5
    expect(a.signatures).toBe(2); // p1,p2
    expect(a.apprenantsSignes).toBe(40); // 10 + 30
    expect(a.ticketMoyen).toBe(20);
    expect(b.volumeActif).toBe(1); // p3 (p4 perdu exclu)
    expect(b.signatures).toBe(0);
    expect(b.ticketMoyen).toBe(0);

    // Origine : 5 canaux distincts à 20 %
    expect(kpis.origine).toHaveLength(5);
    expect(kpis.origine.every((o) => o.pct === 20)).toBe(true);
    expect(kpis.origine.find((o) => o.canal === 'non_renseigne')?.count).toBe(
      1,
    );

    // Alertes
    const sansAction = kpis.alertes.find((g) => g.type === 'sans_action')!;
    const bloque = kpis.alertes.find((g) => g.type === 'a_signer_bloque')!;
    const sansCommercial = kpis.alertes.find(
      (g) => g.type === 'sans_commercial',
    )!;
    expect(sansAction.count).toBe(1); // p3
    expect(bloque.count).toBe(1); // p3 audité bloqué
    expect(sansCommercial.count).toBe(1); // p3 non assigné
  });
});
