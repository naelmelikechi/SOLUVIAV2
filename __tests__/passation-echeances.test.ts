import { describe, it, expect } from 'vitest';
import {
  echeancesDues,
  ECHEANCE_COLONNE,
  H18_MS,
  H48_MS,
  type EcheanceDoc,
} from '@/lib/passation/echeances';

const T0 = new Date('2026-07-01T08:00:00Z');

function doc(overrides: Partial<EcheanceDoc> = {}): EcheanceDoc {
  return {
    statut: 'generee',
    created_at: T0.toISOString(),
    signature_signee_at: null,
    soumise_at: null,
    rappel_dev_at: null,
    escalade_dev_at: null,
    rappel_referent_at: null,
    escalade_direction_at: null,
    ...overrides,
  };
}

function at(offsetMs: number): Date {
  return new Date(T0.getTime() + offsetMs);
}

describe('echeancesDues', () => {
  it('ne remonte rien avant 18h', () => {
    expect(echeancesDues(doc(), at(H18_MS - 1))).toEqual([]);
  });

  it('rappel Dev a 18h pile (statut generee)', () => {
    expect(echeancesDues(doc(), at(H18_MS))).toEqual(['rappel_dev']);
  });

  it('rappel Dev aussi en cours de completion', () => {
    expect(
      echeancesDues(doc({ statut: 'en_cours_completion' }), at(H18_MS)),
    ).toEqual(['rappel_dev']);
  });

  it('a 48h : escalade Dev + escalade Direction (et rappel si pas encore pose)', () => {
    expect(echeancesDues(doc(), at(H48_MS))).toEqual([
      'rappel_dev',
      'escalade_dev',
      'escalade_direction',
    ]);
  });

  it("l'ancre des delais Dev est la signature quand elle existe", () => {
    const signee = at(6 * 3_600_000).toISOString(); // signee 6h apres creation
    const d = doc({ signature_signee_at: signee });
    // 18h apres creation mais 12h apres signature : rien.
    expect(echeancesDues(d, at(H18_MS))).toEqual([]);
    // 18h apres signature : rappel.
    expect(echeancesDues(d, at(6 * 3_600_000 + H18_MS))).toEqual([
      'rappel_dev',
    ]);
  });

  it('idempotence : les colonnes posees suppriment les echeances', () => {
    const d = doc({
      rappel_dev_at: T0.toISOString(),
      escalade_dev_at: T0.toISOString(),
      escalade_direction_at: T0.toISOString(),
    });
    expect(echeancesDues(d, at(H48_MS * 2))).toEqual([]);
  });

  it('rappel Referent 18h apres soumission uniquement', () => {
    const soumise = at(H18_MS).toISOString();
    const d = doc({ statut: 'en_attente_arbitrage', soumise_at: soumise });
    expect(echeancesDues(d, at(H18_MS + H18_MS - 1))).toEqual([]);
    expect(echeancesDues(d, at(H18_MS + H18_MS))).toEqual(['rappel_referent']);
  });

  it('en attente arbitrage : pas de rappel/escalade Dev, mais escalade Direction a 48h', () => {
    const d = doc({
      statut: 'en_attente_arbitrage',
      soumise_at: at(H18_MS).toISOString(),
      rappel_referent_at: T0.toISOString(),
    });
    expect(echeancesDues(d, at(H48_MS))).toEqual(['escalade_direction']);
  });

  it('statuts termines : plus aucune echeance', () => {
    for (const statut of ['cdp_affecte', 'diffusee_vague2', 'archivee']) {
      expect(echeancesDues(doc({ statut }), at(H48_MS * 3))).toEqual([]);
    }
  });

  it('dates invalides : fail-safe, rien du', () => {
    expect(
      echeancesDues(doc({ created_at: 'pas-une-date' }), at(H48_MS)),
    ).toEqual([]);
  });

  it('chaque echeance a sa colonne d idempotence', () => {
    expect(ECHEANCE_COLONNE).toEqual({
      rappel_dev: 'rappel_dev_at',
      escalade_dev: 'escalade_dev_at',
      rappel_referent: 'rappel_referent_at',
      escalade_direction: 'escalade_direction_at',
    });
  });
});
