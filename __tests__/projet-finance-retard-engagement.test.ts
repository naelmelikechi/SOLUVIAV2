process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

/**
 * Tests de sommeRetardFacturationEngagement (lib/queries/projet-finance-detail.ts) :
 * correction du sous-comptage du retard de facturation commission au modele
 * engagement. selectContratsAFacturer (lib/queries/contrats-a-facturer.ts)
 * ne garde que l'echeance la plus en retard par contrat (bon comportement
 * pour /a-facturer, un ecran de pilotage) ; ici on veut un MONTANT, donc
 * sommer TOUTES les echeances dues d'un contrat, pas seulement la premiere.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { sommeRetardFacturationEngagement } from '@/lib/queries/projet-finance-detail';

const TODAY = '2026-08-07';

function contrat(
  over: Partial<
    Parameters<typeof sommeRetardFacturationEngagement>[0]['contrats'][number]
  > = {},
) {
  return {
    id: 'c1',
    ref: 'CTR-0001',
    contract_number: null,
    apprenant_prenom: 'Jean',
    apprenant_nom: 'Dupont',
    archive: false,
    facturation_verrouillee: false,
    contract_state: 'ENGAGE',
    ...over,
  };
}

function step(
  over: Partial<
    Parameters<typeof sommeRetardFacturationEngagement>[0]['steps'][number]
  > = {},
) {
  return {
    contrat_id: 'c1',
    step_number: 1,
    opening_date: '2026-01-01',
    invoice_state: null,
    total_amount: 1000,
    ...over,
  };
}

describe('sommeRetardFacturationEngagement - correction du sous-comptage', () => {
  it('somme les DEUX echeances ouvertes et non transmises d un meme contrat', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat()],
      steps: [
        step({ step_number: 1, opening_date: '2026-01-01' }),
        step({ step_number: 2, opening_date: '2026-02-01', total_amount: 500 }),
      ],
      today: TODAY,
    });
    expect(r.montant).toBe(1500);
    expect(r.lignes).toHaveLength(2);
  });

  it('ne compte qu une seule echeance quand une seule est due', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat()],
      steps: [step()],
      today: TODAY,
    });
    expect(r.montant).toBe(1000);
    expect(r.lignes).toHaveLength(1);
  });

  it('exclut un contrat archive', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat({ archive: true })],
      steps: [step()],
      today: TODAY,
    });
    expect(r.montant).toBe(0);
  });

  it('exclut un contrat a la facturation verrouillee', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat({ facturation_verrouillee: true })],
      steps: [step()],
      today: TODAY,
    });
    expect(r.montant).toBe(0);
  });

  it('exclut un contrat hors etats facturables (ni ENGAGE ni TRANSMIS)', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat({ contract_state: 'ANNULE' })],
      steps: [step()],
      today: TODAY,
    });
    expect(r.montant).toBe(0);
  });

  it('accepte un contrat TRANSMIS', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat({ contract_state: 'TRANSMIS' })],
      steps: [step()],
      today: TODAY,
    });
    expect(r.montant).toBe(1000);
  });

  it('ignore une echeance deja transmise', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat()],
      steps: [step({ invoice_state: 'TRANSMIS' })],
      today: TODAY,
    });
    expect(r.montant).toBe(0);
  });

  it('ignore une echeance ouverte dans le futur', () => {
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat()],
      steps: [step({ opening_date: '2026-12-01' })],
      today: TODAY,
    });
    expect(r.montant).toBe(0);
  });

  it('compte une echeance ouverte aujourd hui meme (echue, memes semantiques que /a-facturer)', () => {
    // Pas de delai de grace ici : contrairement a agregerFluxOpco (flux
    // OPCO), cette fonction reproduit isContratEligible + le filtre "due"
    // de selectContratsAFacturer, ou opening_date <= today suffit.
    const r = sommeRetardFacturationEngagement({
      contrats: [contrat()],
      steps: [step({ opening_date: TODAY })],
      today: TODAY,
    });
    expect(r.montant).toBe(1000);
  });
});
