import { describe, it, expect } from 'vitest';
import {
  aggregateProjetEcheances,
  computeDerivance,
  computeJalonContribution,
  computeProrataRupture,
  dateEmissionPrevuePourMois,
  moisAbsoluFromRelatif,
  parseJalons,
  resolveProjetEcheancier,
  validateJalons,
  type ContratEcheancierContext,
  type Jalon,
} from '@/lib/echeancier/calc';

const STANDARD_JALONS: Jalon[] = [
  { mois_relatif: 3, quote_part: 0.25, label: 'Rattrapage' },
  { mois_relatif: 4, quote_part: 0.0833 },
  { mois_relatif: 5, quote_part: 0.0833 },
  { mois_relatif: 6, quote_part: 0.0833 },
  { mois_relatif: 7, quote_part: 0.0833 },
  { mois_relatif: 8, quote_part: 0.0833 },
  { mois_relatif: 9, quote_part: 0.0833 },
  { mois_relatif: 10, quote_part: 0.0833 },
  { mois_relatif: 11, quote_part: 0.0833 },
  { mois_relatif: 12, quote_part: 0.0836 },
];

const CONTRAT_12K_12M: ContratEcheancierContext = {
  contrat_id: 'c-1',
  npec_amount: 12000,
  date_debut: '2026-01-01',
  duree_mois: 12,
  archive: false,
};

describe('moisAbsoluFromRelatif', () => {
  it('calcule M+3 depuis 2026-01-01', () => {
    expect(moisAbsoluFromRelatif('2026-01-01', 3)).toBe('2026-04-01');
  });
  it('gere le passage d annee', () => {
    expect(moisAbsoluFromRelatif('2026-09-15', 5)).toBe('2027-02-01');
  });
});

describe('dateEmissionPrevuePourMois', () => {
  it('met le 25 du mois', () => {
    expect(dateEmissionPrevuePourMois('2026-04-01')).toBe('2026-04-25');
  });
});

describe('validateJalons', () => {
  it('accepte un set valide somme = 100%', () => {
    const r = validateJalons(STANDARD_JALONS);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]); // 0.9999 ≈ 1.0
  });
  it('warning si total != 100% (mais pas erreur)', () => {
    const r = validateJalons([{ mois_relatif: 3, quote_part: 0.5 }]);
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('erreur si tableau vide', () => {
    expect(validateJalons([]).ok).toBe(false);
  });
  it('erreur si doublon mois_relatif', () => {
    expect(
      validateJalons([
        { mois_relatif: 3, quote_part: 0.5 },
        { mois_relatif: 3, quote_part: 0.5 },
      ]).ok,
    ).toBe(false);
  });
  it('erreur si quote_part <= 0', () => {
    expect(validateJalons([{ mois_relatif: 3, quote_part: 0 }]).ok).toBe(false);
  });
});

describe('computeJalonContribution', () => {
  it('calcule M+3 = NPEC × taux × 0.25', () => {
    const r = computeJalonContribution(
      CONTRAT_12K_12M,
      STANDARD_JALONS[0]!,
      10,
    );
    // 12000 × 10/100 × 0.25 = 300
    expect(r).not.toBeNull();
    expect(r!.montant_ht).toBe(300);
    expect(r!.mois_absolu).toBe('2026-04-01');
    expect(r!.npec_snapshot).toBe(12000);
  });

  it('ignore les jalons depassant duree_mois', () => {
    const contrat6 = { ...CONTRAT_12K_12M, duree_mois: 6 };
    const r = computeJalonContribution(contrat6, STANDARD_JALONS[6]!, 10); // M+9
    expect(r).toBeNull();
  });

  it('ignore contrat archive', () => {
    expect(
      computeJalonContribution(
        { ...CONTRAT_12K_12M, archive: true },
        STANDARD_JALONS[0]!,
        10,
      ),
    ).toBeNull();
  });

  it('ignore NPEC <= 0', () => {
    expect(
      computeJalonContribution(
        { ...CONTRAT_12K_12M, npec_amount: 0 },
        STANDARD_JALONS[0]!,
        10,
      ),
    ).toBeNull();
  });
});

describe('aggregateProjetEcheances', () => {
  it('genere 10 echeances pour 1 contrat 12 mois standard', () => {
    const r = aggregateProjetEcheances(
      'p-1',
      [CONTRAT_12K_12M],
      STANDARD_JALONS,
      10,
    );
    expect(r).toHaveLength(10);
    expect(r[0]?.mois_concerne).toBe('2026-04-01'); // M+3
    expect(r[9]?.mois_concerne).toBe('2027-01-01'); // M+12
    // Total = 12000 × 10/100 = 1200, somme should equal ~1200
    const total = r.reduce((s, e) => s + e.montant_prevu_ht, 0);
    expect(total).toBeCloseTo(1200, 1);
  });

  it('aggrege contrats du meme projet sur le meme mois si dates identiques', () => {
    const c2 = { ...CONTRAT_12K_12M, contrat_id: 'c-2' };
    const r = aggregateProjetEcheances(
      'p-1',
      [CONTRAT_12K_12M, c2],
      STANDARD_JALONS,
      10,
    );
    expect(r[0]?.contributions).toHaveLength(2);
    expect(r[0]?.montant_prevu_ht).toBe(600); // 2 × 300
  });

  it('separe contrats avec dates differentes', () => {
    const c2 = {
      ...CONTRAT_12K_12M,
      contrat_id: 'c-2',
      date_debut: '2026-02-01',
    };
    const r = aggregateProjetEcheances(
      'p-1',
      [CONTRAT_12K_12M, c2],
      STANDARD_JALONS,
      10,
    );
    // c-1 M+3 = 2026-04-01, c-2 M+3 = 2026-05-01 → 2 mois distincts
    expect(r.length).toBeGreaterThan(10);
  });
});

describe('parseJalons', () => {
  it('parse un JSONB valide et trie par mois', () => {
    const raw = [
      { mois_relatif: 5, quote_part: 0.3 },
      { mois_relatif: 3, quote_part: 0.7 },
    ];
    const r = parseJalons(raw);
    expect(r).toHaveLength(2);
    expect(r[0]?.mois_relatif).toBe(3);
    expect(r[1]?.mois_relatif).toBe(5);
  });
  it('skip les entrees malformees', () => {
    const r = parseJalons([
      { mois_relatif: 3, quote_part: 0.5 },
      { mois_relatif: 'foo', quote_part: 0.5 },
      null,
      { quote_part: 0.5 },
    ]);
    expect(r).toHaveLength(1);
  });
  it('retourne [] si pas un array', () => {
    expect(parseJalons('foo')).toEqual([]);
    expect(parseJalons(null)).toEqual([]);
  });
});

describe('resolveProjetEcheancier', () => {
  const templates = [
    {
      id: 't-default',
      nom: 'Default',
      jalons: [{ mois_relatif: 3, quote_part: 1.0 }],
      is_default: true,
    },
    {
      id: 't-legacy',
      nom: 'Legacy',
      jalons: [{ mois_relatif: 2, quote_part: 1.0 }],
      is_default: false,
    },
  ];

  it('retourne override si present', () => {
    const r = resolveProjetEcheancier(
      {
        echeancier_override: [{ mois_relatif: 5, quote_part: 1.0 }],
        echeancier_template_id: 't-legacy',
      },
      templates,
    );
    expect(r.source).toBe('override');
    expect(r.jalons[0]?.mois_relatif).toBe(5);
  });

  it('retourne template si pas d override', () => {
    const r = resolveProjetEcheancier(
      { echeancier_override: null, echeancier_template_id: 't-legacy' },
      templates,
    );
    expect(r.source).toBe('template');
    expect(r.template_nom).toBe('Legacy');
  });

  it('retourne default si rien', () => {
    const r = resolveProjetEcheancier(
      { echeancier_override: null, echeancier_template_id: null },
      templates,
    );
    expect(r.source).toBe('default');
    expect(r.template_nom).toBe('Default');
  });
});

describe('computeDerivance', () => {
  it('detecte une derive positive (NPEC augmente)', () => {
    const r = computeDerivance(15000, 10, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 3,
        montant_ht: 300, // emis sur npec=12000, qp=0.25
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.25,
      },
    ]);
    // attendu = 15000 × 10/100 × 0.25 = 375
    // delta = 375 - 300 = 75
    expect(r.delta_ht).toBe(75);
    expect(r.breakdown[0]?.delta_jalon).toBe(75);
    expect(r.breakdown[0]?.mois_relatif).toBe(3);
  });

  it('detecte une derive negative (NPEC reduit)', () => {
    const r = computeDerivance(10000, 10, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 3,
        montant_ht: 300,
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.25,
      },
    ]);
    // attendu = 10000 × 10/100 × 0.25 = 250
    // delta = 250 - 300 = -50
    expect(r.delta_ht).toBe(-50);
  });

  it('zero derive si NPEC inchange', () => {
    expect(
      computeDerivance(12000, 10, [
        {
          facture_id: 'f1',
          facture_ref: 'FAC-1',
          mois_relatif: 3,
          montant_ht: 300,
          npec_snapshot: 12000,
          taux_commission_snapshot: 10,
          quote_part: 0.25,
        },
      ]).delta_ht,
    ).toBe(0);
  });

  it('utilise le taux SNAPSHOT de la ligne (pas le taux projet courant)', () => {
    // Scenario : projet taux courant 40%, mais la facture a ete emise a 50%.
    // On veut detecter UNIQUEMENT la derive NPEC, pas le changement de taux.
    // Si NPEC inchange, delta doit etre 0 meme si taux a change.
    const r = computeDerivance(12000, 40, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 3,
        montant_ht: 1500, // = 12000 × 50/100 × 0.25 (taux snapshot 50)
        npec_snapshot: 12000,
        taux_commission_snapshot: 50,
        quote_part: 0.25,
      },
    ]);
    expect(r.delta_ht).toBe(0);
    expect(r.breakdown[0]?.taux_commission_snapshot).toBe(50);
  });

  it('groupe par jalon : evite le double comptage sur 2e changement NPEC', () => {
    // Scenario reel du bug #1 :
    //  - Originale : NPEC=5000, qp=1/12, taux=40 → emis 16.67 (cents : on prend 16.67)
    //    Calcul exact : 5000 × 40/100 × (1/12) = 166.6666... → arrondi a 166.67
    //  - Complement emis : 33.33 (delta NPEC 5000→6000)
    //  - 2e changement : NPEC 6000 → 7000
    //  - On attend delta = (7000-6000) × 40/100 × (1/12) = 33.33
    //    PAS 233.33 + 233.33 - 200 = 266.67 (ancien bug).
    const qp = 1 / 12;
    const r = computeDerivance(7000, 40, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 1,
        montant_ht: 166.67,
        npec_snapshot: 5000,
        taux_commission_snapshot: 40,
        quote_part: qp,
      },
      {
        facture_id: 'f2',
        facture_ref: 'FAC-2',
        mois_relatif: 1,
        montant_ht: 33.33,
        npec_snapshot: 6000,
        taux_commission_snapshot: 40,
        quote_part: qp,
      },
    ]);
    // attendu_jalon = 7000 × 40/100 × 1/12 = 233.33
    // sum_emis = 166.67 + 33.33 = 200
    // delta = 33.33
    expect(r.delta_ht).toBeCloseTo(33.33, 2);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]?.mois_relatif).toBe(1);
    expect(r.breakdown[0]?.lignes).toHaveLength(2);
  });

  it('deduit les avoirs deja emis (creditsExisting) du delta net', () => {
    // Scenario bug #2 :
    //  - Originale : 200€ emis (NPEC=6000, qp=1/12, taux=40)
    //  - Avoir deja emis : -33€ (creditsExisting = -33)
    //  - Nouvel NPEC : 5000
    //  - attendu_brut = 5000 × 40/100 × 1/12 = 166.67
    //  - delta_brut = 166.67 - 200 = -33.33
    //  - delta_net = -33.33 - (-33) = -0.33 (quasi nul, l'avoir compense)
    const r = computeDerivance(
      5000,
      40,
      [
        {
          facture_id: 'f1',
          facture_ref: 'FAC-1',
          mois_relatif: 1,
          montant_ht: 200,
          npec_snapshot: 6000,
          taux_commission_snapshot: 40,
          quote_part: 1 / 12,
        },
      ],
      -33,
    );
    expect(r.delta_ht_brut).toBeCloseTo(-33.33, 2);
    expect(r.credits_existing).toBe(-33);
    expect(r.delta_ht).toBeCloseTo(-0.33, 2);
  });

  it('creditsExisting=0 par defaut (retro-compat)', () => {
    const r = computeDerivance(15000, 10, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 3,
        montant_ht: 300,
        npec_snapshot: 12000,
        taux_commission_snapshot: 10,
        quote_part: 0.25,
      },
    ]);
    expect(r.credits_existing).toBe(0);
    expect(r.delta_ht).toBe(r.delta_ht_brut);
  });

  it('idempotence cross-resolved : 2e NPEC change apres complement emis', () => {
    // Scenario complet :
    //  1. Original emis : NPEC=5000, qp=1/12, taux=40 -> montant 166.67
    //  2. NPEC -> 6000 : pending +33.33 cree
    //  3. User emet complement : ligne facture 33.33, qp=1/12, snap=6000
    //     -> resolveAjustement(emitted, factureId=complement.id)
    //  4. NPEC -> 7000 : nouvelle detection
    //     attendu calcul correct = (7000-6000) × 40 / 100 × 1/12 = 33.33
    //     (et PAS 266.67 via le bug double-counting d'origine)
    const qp = 1 / 12;
    const r = computeDerivance(
      7000,
      40,
      [
        {
          facture_id: 'orig',
          facture_ref: 'FAC-1',
          mois_relatif: 1,
          montant_ht: 166.67,
          npec_snapshot: 5000,
          taux_commission_snapshot: 40,
          quote_part: qp,
        },
        {
          facture_id: 'cmp',
          facture_ref: 'FAC-2',
          mois_relatif: 1,
          montant_ht: 33.33,
          npec_snapshot: 6000,
          taux_commission_snapshot: 40,
          quote_part: qp,
        },
      ],
      0, // pas d'avoir emis
    );
    expect(r.delta_ht).toBeCloseTo(33.33, 2);
  });

  it('idempotence cross-resolved : 2e NPEC change apres avoir emis', () => {
    // Scenario :
    //  1. Original emis : NPEC=6000, qp=1/12, taux=40 -> 200
    //  2. NPEC -> 5000 : pending -33.33
    //  3. User emet avoir de -33.33 -> creditsExisting = -33.33
    //  4. NPEC -> 4000 : nouvelle detection
    //     attendu_brut = 4000 × 40/100 × 1/12 = 133.33
    //     sum_emis_jalon = 200 (l'avoir est compte separement)
    //     delta_brut = 133.33 - 200 = -66.67
    //     delta_net = -66.67 - (-33.33) = -33.34
    //     (vs ancien bug : -66.67, qui aurait sur-credite de -33.33)
    const qp = 1 / 12;
    const r = computeDerivance(
      4000,
      40,
      [
        {
          facture_id: 'orig',
          facture_ref: 'FAC-1',
          mois_relatif: 1,
          montant_ht: 200,
          npec_snapshot: 6000,
          taux_commission_snapshot: 40,
          quote_part: qp,
        },
      ],
      -33.33,
    );
    expect(r.delta_ht_brut).toBeCloseTo(-66.67, 2);
    expect(r.delta_ht).toBeCloseTo(-33.34, 2);
  });

  it('groupe par jalon : qp canonique = max du groupe', () => {
    // Complement emis manuellement avec qp fractionnaire plus petite : on
    // garde la qp de la ligne originale pour calculer l'attendu, pas la qp
    // du complement.
    const r = computeDerivance(7000, 40, [
      {
        facture_id: 'f1',
        facture_ref: 'FAC-1',
        mois_relatif: 1,
        montant_ht: 166.67,
        npec_snapshot: 5000,
        taux_commission_snapshot: 40,
        quote_part: 1 / 12, // canonique
      },
      {
        facture_id: 'f2',
        facture_ref: 'FAC-2',
        mois_relatif: 1,
        montant_ht: 33.33,
        npec_snapshot: 6000,
        taux_commission_snapshot: 40,
        quote_part: 0.005, // qp arbitraire petite, ne doit pas etre prise
      },
    ]);
    expect(r.breakdown[0]?.quote_part).toBeCloseTo(1 / 12, 5);
  });
});

describe('computeProrataRupture', () => {
  it('calcule pro-rata 50% pour rupture mi-contrat', () => {
    const r = computeProrataRupture(
      { date_debut: '2026-01-01', duree_mois: 12 },
      '2026-07-01', // 6 mois realises sur 12
      [
        {
          facture_id: 'f1',
          facture_ref: 'FAC-1',
          mois_relatif: 3,
          montant_ht: 1200,
          npec_snapshot: 12000,
          taux_commission_snapshot: 10,
          quote_part: 1,
        },
      ],
    );
    // 6 mois / 12 = 50% realise → 50% non realise → avoir = 1200 × 0.5 = 600
    expect(r.avoir_total_ht).toBeCloseTo(600, 0);
  });

  it('avoir = 0 si rupture apres fin contrat', () => {
    const r = computeProrataRupture(
      { date_debut: '2026-01-01', duree_mois: 12 },
      '2027-12-01',
      [
        {
          facture_id: 'f1',
          facture_ref: 'FAC-1',
          mois_relatif: 3,
          montant_ht: 1200,
          npec_snapshot: 12000,
          taux_commission_snapshot: 10,
          quote_part: 1,
        },
      ],
    );
    expect(r.avoir_total_ht).toBe(0);
  });

  it('avoir = montant total si rupture des le debut', () => {
    const r = computeProrataRupture(
      { date_debut: '2026-01-01', duree_mois: 12 },
      '2026-01-01',
      [
        {
          facture_id: 'f1',
          facture_ref: 'FAC-1',
          mois_relatif: 3,
          montant_ht: 1200,
          npec_snapshot: 12000,
          taux_commission_snapshot: 10,
          quote_part: 1,
        },
      ],
    );
    expect(r.avoir_total_ht).toBe(1200);
  });
});
