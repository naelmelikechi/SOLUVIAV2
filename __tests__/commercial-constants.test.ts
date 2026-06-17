import { describe, it, expect } from 'vitest';
import {
  STAGE_PROSPECT_ORDER,
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_PROSPECT_LABELS,
  STATUT_RDV_LABELS,
  STATUT_RDV_COLORS,
  TYPE_RDV_LABELS,
  FORMAT_RDV_LABELS,
  CANAL_ORIGINE_LABELS,
  ROLE_DECISION_LABELS,
  SANTE_PROSPECT_LABELS,
  SANTE_PROSPECT_COLORS,
  TAUX_NPEC_PLANCHER,
} from '@/lib/utils/constants';

// Valeurs canoniques de chaque union (source : enums DB + constants.ts).
// Si une valeur est ajoutée à un type sans label/couleur correspondant, la
// comparaison d'ensembles ci-dessous échoue : c'est le filet de sécurité.
const VALEURS = {
  stage: [...STAGE_PROSPECT_ORDER],
  typeProspect: ['cfa', 'entreprise'],
  statutRdv: ['prevu', 'realise', 'annule', 'reporte'],
  typeRdv: [
    'presentation',
    'cadrage',
    'audit_tunnel_a',
    'audit_tunnel_b',
    'signature',
    'autre',
  ],
  formatRdv: [
    'presentiel',
    'visio_meet',
    'visio_zoom',
    'visio_teams',
    'telephone',
  ],
  canalOrigine: [
    'reseau_developpeur',
    'reseau_direction',
    'linkedin_auto',
    'salon',
    'apporteur',
    'autre',
  ],
  roleDecision: ['signataire', 'sponsor', 'operationnel', 'soutien'],
  sante: ['vert', 'orange', 'rouge'],
} as const;

// Chaque valeur attendue possède un libellé non vide, et la map n'a aucune clé
// orpheline (label sans valeur correspondante).
function expectLabelsComplets(
  attendu: readonly string[],
  labels: Record<string, string>,
) {
  for (const v of attendu) {
    expect(labels[v], `label manquant pour « ${v} »`).toBeTruthy();
  }
  expect([...Object.keys(labels)].sort()).toEqual([...attendu].sort());
  for (const libelle of Object.values(labels)) {
    expect(typeof libelle).toBe('string');
    expect(libelle.length).toBeGreaterThan(0);
  }
}

// Une valeur qui a un label DOIT avoir une couleur, et réciproquement : on
// compare directement les jeux de clés des deux maps.
function expectColorsAlignees(
  labels: Record<string, string>,
  colors: Record<string, string>,
) {
  expect([...Object.keys(colors)].sort()).toEqual(
    [...Object.keys(labels)].sort(),
  );
  for (const couleur of Object.values(colors)) {
    expect(couleur.length).toBeGreaterThan(0);
  }
}

describe('maps commerciales — complétude label / couleur', () => {
  it('StageProspect : labels + couleurs couvrent STAGE_PROSPECT_ORDER', () => {
    expectLabelsComplets(VALEURS.stage, STAGE_PROSPECT_LABELS);
    expectColorsAlignees(STAGE_PROSPECT_LABELS, STAGE_PROSPECT_COLORS);
  });

  it('TypeProspect : labels complets', () => {
    expectLabelsComplets(VALEURS.typeProspect, TYPE_PROSPECT_LABELS);
  });

  it('StatutRdv : labels + couleurs complets', () => {
    expectLabelsComplets(VALEURS.statutRdv, STATUT_RDV_LABELS);
    expectColorsAlignees(STATUT_RDV_LABELS, STATUT_RDV_COLORS);
  });

  it('TypeRdv : labels complets (6 types du tunnel)', () => {
    expectLabelsComplets(VALEURS.typeRdv, TYPE_RDV_LABELS);
  });

  it('FormatRdv : labels complets', () => {
    expectLabelsComplets(VALEURS.formatRdv, FORMAT_RDV_LABELS);
  });

  it('CanalOrigine : labels complets', () => {
    expectLabelsComplets(VALEURS.canalOrigine, CANAL_ORIGINE_LABELS);
  });

  it('RoleDecisionContact : labels complets', () => {
    expectLabelsComplets(VALEURS.roleDecision, ROLE_DECISION_LABELS);
  });

  it('SanteProspect : labels + couleurs complets', () => {
    expectLabelsComplets(VALEURS.sante, SANTE_PROSPECT_LABELS);
    expectColorsAlignees(SANTE_PROSPECT_LABELS, SANTE_PROSPECT_COLORS);
  });
});

describe('plancher tarifaire commercial', () => {
  it('TAUX_NPEC_PLANCHER vaut 35 (seuil escalade Direction Générale)', () => {
    expect(TAUX_NPEC_PLANCHER).toBe(35);
  });
});
