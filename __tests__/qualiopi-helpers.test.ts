import { describe, it, expect } from 'vitest';
import {
  computeCompletion,
  computeExpiresAt,
  deriveDeliverableStatus,
  type QualityEvidence,
} from '@/lib/eduvia/quality-types';

// ---------------------------------------------------------------------------
// computeExpiresAt : duree d'expiration selon recurrence
// ---------------------------------------------------------------------------

describe('computeExpiresAt', () => {
  const ref = new Date('2026-05-05T00:00:00Z');

  it('calcule weekly = J+7', () => {
    expect(computeExpiresAt('weekly', ref)).toBe('2026-05-12');
  });

  it('calcule monthly = M+1', () => {
    expect(computeExpiresAt('monthly', ref)).toBe('2026-06-05');
  });

  it('calcule quarterly = M+3', () => {
    expect(computeExpiresAt('quarterly', ref)).toBe('2026-08-05');
  });

  it('calcule biannual = M+6', () => {
    expect(computeExpiresAt('biannual', ref)).toBe('2026-11-05');
  });

  it('calcule annual = A+1', () => {
    expect(computeExpiresAt('annual', ref)).toBe('2027-05-05');
  });

  it('retourne null pour one_time', () => {
    expect(computeExpiresAt('one_time', ref)).toBeNull();
  });

  it('retourne null pour continuous', () => {
    expect(computeExpiresAt('continuous', ref)).toBeNull();
  });

  it('retourne null pour per_session, per_intake, per_cohort', () => {
    expect(computeExpiresAt('per_session', ref)).toBeNull();
    expect(computeExpiresAt('per_intake', ref)).toBeNull();
    expect(computeExpiresAt('per_cohort', ref)).toBeNull();
  });

  it('retourne null pour per_incident, per_subcontractor, on_change', () => {
    expect(computeExpiresAt('per_incident', ref)).toBeNull();
    expect(computeExpiresAt('per_subcontractor', ref)).toBeNull();
    expect(computeExpiresAt('on_change', ref)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveDeliverableStatus : recompute defensif vs evidences
// ---------------------------------------------------------------------------

function makeEv(
  status: QualityEvidence['status'],
  expires_at: string | null = null,
  id = 1,
): QualityEvidence {
  return {
    id,
    deliverable_id: 100,
    campus_id: 1,
    status,
    expires_at,
    uploaded_by_id: null,
    file_name: 'test.pdf',
    file_url: 'https://example.com/test.pdf',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('deriveDeliverableStatus', () => {
  const now = new Date('2026-05-05T12:00:00Z');

  it('retourne missing si aucune preuve', () => {
    expect(deriveDeliverableStatus([], now)).toBe('missing');
  });

  it('retourne conform si au moins 1 preuve conform non expiree', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('conform', '2027-01-01'), makeEv('rejected', null, 2)],
        now,
      ),
    ).toBe('conform');
  });

  it('retourne expired si la conform a expires_at < now (workaround bug Eduvia)', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('conform', '2025-01-01')], // expire avant now
        now,
      ),
    ).toBe('expired');
  });

  it('priorite to_review > rejected quand pas de conform', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('to_review'), makeEv('rejected', null, 2)],
        now,
      ),
    ).toBe('to_review');
  });

  it('retourne rejected si que des rejected', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('rejected'), makeEv('rejected', null, 2)],
        now,
      ),
    ).toBe('rejected');
  });

  it('retourne expired si que des expired', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('expired'), makeEv('expired', null, 2)],
        now,
      ),
    ).toBe('expired');
  });

  it('priorite : conform expire vire en queue, mais autre conform valide gagne', () => {
    expect(
      deriveDeliverableStatus(
        [makeEv('conform', '2025-01-01'), makeEv('conform', '2027-01-01', 2)],
        now,
      ),
    ).toBe('conform');
  });
});

// ---------------------------------------------------------------------------
// computeCompletion : taux de completion d'un set
// ---------------------------------------------------------------------------

describe('computeCompletion', () => {
  it('retourne 0% / valid=false sur ensemble vide (pas de donnees)', () => {
    // Voir lib/eduvia/quality-types.ts: total === 0 => 0%, on ne pretend pas
    // etre conforme par absence de donnees.
    expect(computeCompletion([])).toEqual({
      percent: 0,
      conform: 0,
      total: 0,
      valid: false,
    });
  });

  it('compte les conform sur le total', () => {
    expect(
      computeCompletion([
        { status: 'conform' },
        { status: 'conform' },
        { status: 'missing' },
        { status: 'rejected' },
      ]),
    ).toEqual({
      percent: 50,
      conform: 2,
      total: 4,
      valid: false,
    });
  });

  it('valid=true uniquement si tous conform', () => {
    expect(
      computeCompletion([{ status: 'conform' }, { status: 'conform' }]),
    ).toEqual({
      percent: 100,
      conform: 2,
      total: 2,
      valid: true,
    });
  });

  it('arrondit le pourcentage', () => {
    // 1/3 = 33.33% -> 33
    expect(
      computeCompletion([
        { status: 'conform' },
        { status: 'missing' },
        { status: 'missing' },
      ]).percent,
    ).toBe(33);
    // 2/3 = 66.66% -> 67
    expect(
      computeCompletion([
        { status: 'conform' },
        { status: 'conform' },
        { status: 'missing' },
      ]).percent,
    ).toBe(67);
  });
});
