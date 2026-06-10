import { describe, it, expect } from 'vitest';
import {
  deriveSyncState,
  lastExpectedSlot,
  SYNC_STALE_HOURS,
} from '@/lib/queries/syncs';

/**
 * Couvre la derivation d'etat de la page "Sante des synchronisations"
 * (/admin/syncs). La fonction est pure : l'horloge est injectee via `now`.
 *
 * Rappel des regles :
 *  - never    : aucun run en journal
 *  - down     : dernier run en erreur (quel que soit son age)
 *  - stale    : plus aucun run depuis plus de 26h (la sync tourne 9h-18h UTC
 *               7j/7 + audit nocturne, donc 26h sans run = cron arrete)
 *  - degraded : dernier run partial, ou run(s) manquant(s) vs le dernier
 *               creneau cron attendu (fenetre 9h-18h UTC)
 *  - ok       : dernier run success couvrant le dernier creneau attendu
 *
 * La fraicheur est relative au CRENEAU attendu, pas a l'age absolu : la nuit
 * (18h -> 9h UTC) aucun run n'est attendu, un success de 18h reste "ok" a 6h
 * du matin (regression corrigee : la page criait au loup ~11h par jour).
 */

// 12:00 UTC : en pleine fenetre cron. Dernier creneau attendu = 12:00,
// tolerance 65 min -> cutoff 10:55.
const NOW = new Date('2026-06-10T12:00:00.000Z');

function runAt(hoursAgo: number, statut: string, now: Date = NOW) {
  return {
    statut,
    created_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  };
}

describe('lastExpectedSlot', () => {
  it('en fenetre : heure pile courante', () => {
    expect(
      lastExpectedSlot(new Date('2026-06-10T12:34:56Z')).toISOString(),
    ).toBe('2026-06-10T12:00:00.000Z');
  });

  it('avant 9h UTC : le 18h de la veille', () => {
    expect(
      lastExpectedSlot(new Date('2026-06-10T05:30:00Z')).toISOString(),
    ).toBe('2026-06-09T18:00:00.000Z');
  });

  it('apres 18h UTC : le 18h du jour', () => {
    expect(
      lastExpectedSlot(new Date('2026-06-10T22:10:00Z')).toISOString(),
    ).toBe('2026-06-10T18:00:00.000Z');
  });
});

describe('deriveSyncState', () => {
  it('never : aucun run en journal', () => {
    expect(deriveSyncState(null, NOW)).toBe('never');
    expect(deriveSyncState(undefined, NOW)).toBe('never');
  });

  it('ok : dernier run success recent (en fenetre)', () => {
    expect(deriveSyncState(runAt(0.5, 'success'), NOW)).toBe('ok');
  });

  it('ok : la borne de tolerance (creneau - 65 min pile) est incluse', () => {
    // cutoff = 10:55:00.000Z exactement
    expect(
      deriveSyncState(
        { statut: 'success', created_at: '2026-06-10T10:55:00.000Z' },
        NOW,
      ),
    ).toBe('ok');
  });

  it('degraded : creneaux manques en pleine fenetre (success de 7h a 12h)', () => {
    expect(deriveSyncState(runAt(5, 'success'), NOW)).toBe('degraded');
  });

  it('ok la nuit : le success de 18h reste ok a 6h du matin (aucun run attendu)', () => {
    const morning = new Date('2026-06-10T06:00:00.000Z');
    expect(
      deriveSyncState(
        { statut: 'success', created_at: '2026-06-09T18:01:00.000Z' },
        morning,
      ),
    ).toBe('ok');
  });

  it('ok le soir : le success de 18h reste ok a 22h', () => {
    const evening = new Date('2026-06-10T22:00:00.000Z');
    expect(
      deriveSyncState(
        { statut: 'success', created_at: '2026-06-10T18:02:00.000Z' },
        evening,
      ),
    ).toBe('ok');
  });

  it('degraded la nuit : la fin de fenetre de la veille a ete manquee', () => {
    // Dernier run 15h la veille : les creneaux 16/17/18h ont ete rates.
    const morning = new Date('2026-06-10T06:00:00.000Z');
    expect(
      deriveSyncState(
        { statut: 'success', created_at: '2026-06-09T15:00:00.000Z' },
        morning,
      ),
    ).toBe('degraded');
  });

  it('degraded : dernier run partial, recent ou non', () => {
    expect(deriveSyncState(runAt(0.25, 'partial'), NOW)).toBe('degraded');
    expect(deriveSyncState(runAt(10, 'partial'), NOW)).toBe('degraded');
  });

  it('down : dernier run en erreur, quel que soit son age', () => {
    expect(deriveSyncState(runAt(0.25, 'error'), NOW)).toBe('down');
    // Meme tres vieux : "le dernier etat connu est un echec" prime sur stale.
    expect(deriveSyncState(runAt(72, 'error'), NOW)).toBe('down');
  });

  it('stale : success vieux de 26h+ (plus aucun run, cron arrete)', () => {
    expect(deriveSyncState(runAt(SYNC_STALE_HOURS + 2, 'success'), NOW)).toBe(
      'stale',
    );
  });

  it('stale : partial vieux de 26h+ egalement', () => {
    expect(deriveSyncState(runAt(SYNC_STALE_HOURS + 0.1, 'partial'), NOW)).toBe(
      'stale',
    );
  });

  it('borne stale : exactement 26h n est pas encore stale (success -> degraded)', () => {
    expect(deriveSyncState(runAt(SYNC_STALE_HOURS, 'success'), NOW)).toBe(
      'degraded',
    );
  });

  it('horloge par defaut : un run success date de maintenant est ok', () => {
    expect(
      deriveSyncState({
        statut: 'success',
        created_at: new Date().toISOString(),
      }),
    ).toBe('ok');
  });
});
