// Mock client pour le module qualite Eduvia. Fidele au contrat /api/v1/quality/*
// tel que defini dans la discussion 2026-05-05. Utilise tant que les endpoints
// V1 ne sont pas publies cote Eduvia. Les donnees sont calees sur l'instance
// demo Eduvia (1 campus "Campus Demo 1", 10 criteres : C1-C7 + ADM/HQ/RGPD).
//
// Quand Eduvia aura livre les endpoints V1, on swap vers EduviaQualityHttpClient
// via le factory createEduviaQualityClient().

import type {
  EduviaQualityClient,
  QualityCampus,
  QualityClientPingResult,
  QualityCriterion,
  QualityDeliverable,
  QualityDeliverableStatus,
  QualityEvidence,
  QualityIndicator,
} from './quality-types';

// ---------------------------------------------------------------------------
// Donnees figees (referentiel + campus de demo)
// ---------------------------------------------------------------------------

const MOCK_CAMPUS: QualityCampus = {
  id: 1,
  denomination: 'Campus Demo 1',
  siret: '12345678000001',
  uai_cfa: '0000001A',
  address: '10 Rue du Campus',
  postcode: '44000',
  city: 'Nantes',
  phone_number: '0200000001',
  email: 'campus1@demo.fr',
  is_company_cfa: false,
};

const MOCK_CRITERIA: QualityCriterion[] = [
  {
    id: 1,
    prefix: 'C1',
    title: "L'information au public",
    description:
      "Conditions d'information du public sur les prestations proposees, les delais pour y acceder, et les resultats obtenus.",
    criterion_type: 'qualiopi',
    icon: 'lucide:megaphone',
    color: { primary: '#6366f1', light: '#e0e7ff' },
  },
  {
    id: 2,
    prefix: 'C2',
    title: 'Objectif et adaptation des prestations',
    description:
      "L'identification precise des objectifs des prestations et l'adaptation des prestations aux publics beneficiaires lors de la conception des prestations.",
    criterion_type: 'qualiopi',
    icon: 'lucide:target',
    color: { primary: '#8b5cf6', light: '#ede9fe' },
  },
  {
    id: 3,
    prefix: 'C3',
    title: 'Accueil, suivi et evaluation du public',
    description:
      "L'adaptation aux publics beneficiaires des prestations et des modalites d'accueil, d'accompagnement, de suivi et d'evaluation mises en oeuvre.",
    criterion_type: 'qualiopi',
    icon: 'lucide:users',
    color: { primary: '#10b981', light: '#d1fae5' },
  },
  {
    id: 4,
    prefix: 'C4',
    title: 'Adequations des moyens',
    description:
      "L'adequation des moyens pedagogiques, techniques et d'encadrement aux prestations mises en oeuvre.",
    criterion_type: 'qualiopi',
    icon: 'lucide:layers',
    color: { primary: '#f59e0b', light: '#fef3c7' },
  },
  {
    id: 5,
    prefix: 'C5',
    title: 'Qualification du personnel',
    description:
      'La qualification et le developpement des connaissances et competences des personnels charges de mettre en oeuvre les prestations.',
    criterion_type: 'qualiopi',
    icon: 'lucide:graduation-cap',
    color: { primary: '#a855f7', light: '#f3e8ff' },
  },
  {
    id: 6,
    prefix: 'C6',
    title: "Investissement dans l'environnement professionnel",
    description:
      "L'inscription et l'investissement du prestataire dans son environnement professionnel.",
    criterion_type: 'qualiopi',
    icon: 'lucide:briefcase',
    color: { primary: '#14b8a6', light: '#ccfbf1' },
  },
  {
    id: 7,
    prefix: 'C7',
    title: 'Appreciations et amelioration continue',
    description:
      'Le recueil et la prise en compte des appreciations et des reclamations formulees par les parties prenantes aux prestations delivrees.',
    criterion_type: 'qualiopi',
    icon: 'lucide:trending-up',
    color: { primary: '#f97316', light: '#fed7aa' },
  },
  {
    id: 8,
    prefix: 'ADM',
    title: 'Administration & Organisation',
    description:
      "Gestion administrative et juridique de l'organisme de formation.",
    criterion_type: 'eduvia',
    icon: 'lucide:building-2',
    color: { primary: '#64748b', light: '#e2e8f0' },
  },
  {
    id: 9,
    prefix: 'HQ',
    title: 'Handicap & Qualite Transversale',
    description: 'Prise en charge du handicap et qualite transversale.',
    criterion_type: 'eduvia',
    icon: 'lucide:accessibility',
    color: { primary: '#ec4899', light: '#fce7f3' },
  },
  {
    id: 10,
    prefix: 'RGPD',
    title: 'Protection des Donnees',
    description: 'Conformite RGPD et protection des donnees personnelles.',
    criterion_type: 'eduvia',
    icon: 'lucide:shield',
    color: { primary: '#0ea5e9', light: '#e0f2fe' },
  },
];

const MOCK_CRITERIA_BY_ID = new Map(MOCK_CRITERIA.map((c) => [c.id, c]));

// 32 indicateurs Qualiopi reels + indicateurs Eduvia. On simule en repartissant
// 3-8 indicateurs par critere, chacun pointant sur 1-4 livrables.
const MOCK_INDICATORS: QualityIndicator[] = (() => {
  // Repartition realiste pour 1 campus :
  // C1=3, C2=5, C3=8, C4=4, C5=2, C6=7, C7=3 (Qualiopi = 32) + ADM=3, HQ=1, RGPD=1
  const distribution: [number, number][] = [
    [1, 3],
    [2, 5],
    [3, 8],
    [4, 4],
    [5, 2],
    [6, 7],
    [7, 3],
    [8, 3],
    [9, 1],
    [10, 1],
  ];
  const out: QualityIndicator[] = [];
  let idCounter = 1;
  for (const [criterionId, count] of distribution) {
    for (let n = 1; n <= count; n++) {
      const c = MOCK_CRITERIA_BY_ID.get(criterionId)!;
      out.push({
        id: idCounter++,
        code: `${c.prefix}-${String(n).padStart(2, '0')}`,
        number: n,
        title: `Indicateur ${c.prefix}-${n}`,
        criterion_id: criterionId,
        assigned_to_id: null,
      });
    }
  }
  return out;
})();

// ~108 livrables repartis (correspond au screenshot demo.eduvia.app : 1+8+26+11+7+17+12+20+1+5)
const DELIVERABLES_PER_CRITERION: Record<number, number> = {
  1: 1,
  2: 8,
  3: 26,
  4: 11,
  5: 7,
  6: 17,
  7: 12,
  8: 20,
  9: 1,
  10: 5,
};

const MOCK_DELIVERABLES: QualityDeliverable[] = (() => {
  const out: QualityDeliverable[] = [];
  let idCounter = 100;
  const recurrences: QualityDeliverable['recurrence'][] = [
    'annual',
    'biannual',
    'quarterly',
    'monthly',
    'one_time',
    'per_session',
    'continuous',
    'on_change',
  ];
  for (const indicator of MOCK_INDICATORS) {
    const target = DELIVERABLES_PER_CRITERION[indicator.criterion_id] ?? 0;
    const count = Math.max(1, Math.floor(target / 5));
    for (let n = 1; n <= count; n++) {
      const c = MOCK_CRITERIA_BY_ID.get(indicator.criterion_id)!;
      out.push({
        id: idCounter++,
        code: `LIV-${c.prefix}-${String(idCounter).padStart(4, '0')}`,
        title: `Livrable ${c.prefix} #${n}`,
        recurrence: recurrences[idCounter % recurrences.length] ?? 'annual',
        indicator_id: indicator.id,
      });
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Etat operationnel mutable (in-memory) pour simuler upload/validation
// ---------------------------------------------------------------------------

interface MockState {
  evidences: Map<number, QualityEvidence>;
  // Index : deliverable_id -> evidence_ids
  byDeliverable: Map<number, Set<number>>;
  nextEvidenceId: number;
}

const state: MockState = {
  evidences: new Map(),
  byDeliverable: new Map(),
  nextEvidenceId: 1000,
};

// Pre-seed : 1 livrable du C1 conforme + quelques to_review (pour le test demo)
(function seed() {
  const c1Deliverable = MOCK_DELIVERABLES.find(
    (d) =>
      MOCK_INDICATORS.find((i) => i.id === d.indicator_id)?.criterion_id === 1,
  );
  if (c1Deliverable) {
    const evId = state.nextEvidenceId++;
    state.evidences.set(evId, {
      id: evId,
      deliverable_id: c1Deliverable.id,
      campus_id: 1,
      status: 'conform',
      expires_at: '2027-04-28',
      uploaded_by_id: 23,
      file_name: 'site-web-snapshot-2026-04-15.pdf',
      file_url: 'https://example.com/mock/file.pdf',
      created_at: '2026-04-15T10:00:00Z',
      updated_at: '2026-04-15T10:00:00Z',
    });
    const set = state.byDeliverable.get(c1Deliverable.id) ?? new Set();
    set.add(evId);
    state.byDeliverable.set(c1Deliverable.id, set);
  }
})();

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EduviaQualityMockClient implements EduviaQualityClient {
  async ping(): Promise<QualityClientPingResult> {
    return {
      ok: true,
      authenticated: 'ok',
      version: 'mock-1.0.0',
    };
  }

  async listCampuses(): Promise<QualityCampus[]> {
    return [MOCK_CAMPUS];
  }

  async listCriteria(): Promise<QualityCriterion[]> {
    return [...MOCK_CRITERIA];
  }

  async listIndicators(criterionId: number): Promise<QualityIndicator[]> {
    return MOCK_INDICATORS.filter((i) => i.criterion_id === criterionId);
  }

  async listDeliverables(indicatorId: number): Promise<QualityDeliverable[]> {
    return MOCK_DELIVERABLES.filter((d) => d.indicator_id === indicatorId);
  }

  async listDeliverableStatuses(
    campusId: number,
  ): Promise<QualityDeliverableStatus[]> {
    if (campusId !== 1) return [];
    return MOCK_DELIVERABLES.map((d, idx) => {
      const ids = state.byDeliverable.get(d.id);
      const evidences = ids
        ? [...ids]
            .map((id) => state.evidences.get(id))
            .filter((e): e is QualityEvidence => Boolean(e))
        : [];

      let status: QualityDeliverableStatus['status'] = 'missing';
      let nextExpiry: string | null = null;
      if (evidences.length > 0) {
        if (evidences.some((e) => e.status === 'conform')) {
          status = 'conform';
          nextExpiry = evidences
            .flatMap((e) =>
              e.status === 'conform' && e.expires_at ? [e.expires_at] : [],
            )
            .reduce<
              string | null
            >((min, cur) => (min === null || cur < min ? cur : min), null);
        } else if (evidences.some((e) => e.status === 'to_review')) {
          status = 'to_review';
        } else if (evidences.some((e) => e.status === 'rejected')) {
          status = 'rejected';
        } else {
          status = 'expired';
        }
      }

      return {
        id: 8000 + idx,
        campus_id: campusId,
        deliverable_id: d.id,
        status,
        evidences_count: evidences.filter((e) => e.status !== 'expired').length,
        next_expiry: nextExpiry,
      };
    });
  }

  async listEvidences(
    campusId: number,
    deliverableId: number,
  ): Promise<QualityEvidence[]> {
    if (campusId !== 1) return [];
    const ids = state.byDeliverable.get(deliverableId);
    if (!ids) return [];
    return [...ids]
      .map((id) => state.evidences.get(id))
      .filter((e): e is QualityEvidence => Boolean(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
