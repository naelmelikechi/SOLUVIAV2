import { describe, it, expect } from 'vitest';
import {
  deriveBrainIngestState,
  BRAIN_INGEST_STALE_HOURS,
} from '@/lib/queries/syncs';

/**
 * Couvre la derivation d'etat de la card "Ingestion du cerveau"
 * (/admin/syncs). La fonction est pure : l'horloge est injectee via `now`.
 *
 * Rappel des regles (le script est MANUEL, aucun creneau attendu : seule
 * compte l'anciennete du dernier run REUSSI) :
 *  - never  : aucun run journalise
 *  - failed : le dernier run est en erreur (prime sur l'anciennete)
 *  - stale  : dernier succes plus vieux que 7 jours, ou aucun succes
 *  - ok     : dernier succes de moins de 7 jours
 */

const NOW = new Date('2026-08-05T12:00:00.000Z');

function runAt(hoursAgo: number, statut: string) {
  return {
    statut,
    started_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  };
}

describe('deriveBrainIngestState', () => {
  it('never : aucun run journalise', () => {
    expect(deriveBrainIngestState(null, null, NOW)).toEqual({
      state: 'never',
      successAgeHours: null,
    });
    expect(deriveBrainIngestState(undefined, undefined, NOW).state).toBe(
      'never',
    );
  });

  it('ok : dernier run reussi il y a 2 jours', () => {
    const run = runAt(48, 'success');
    expect(deriveBrainIngestState(run, run, NOW)).toEqual({
      state: 'ok',
      successAgeHours: 48,
    });
  });

  it('ok : la borne (7 jours pile) n est pas encore une alerte', () => {
    const run = runAt(BRAIN_INGEST_STALE_HOURS, 'success');
    expect(deriveBrainIngestState(run, run, NOW).state).toBe('ok');
  });

  it('stale : juste au-dela de la borne (7 jours + 1 min)', () => {
    const run = runAt(BRAIN_INGEST_STALE_HOURS + 1 / 60, 'success');
    expect(deriveBrainIngestState(run, run, NOW).state).toBe('stale');
  });

  it('stale : dernier succes vieux de 3 semaines (le cerveau n apprend plus)', () => {
    const run = runAt(21 * 24, 'success');
    const { state, successAgeHours } = deriveBrainIngestState(run, run, NOW);
    expect(state).toBe('stale');
    expect(successAgeHours).toBe(21 * 24);
  });

  it('failed : dernier run en erreur, meme avec un succes recent derriere', () => {
    const echec = runAt(1, 'error');
    const succes = runAt(25, 'success');
    expect(deriveBrainIngestState(echec, succes, NOW)).toEqual({
      state: 'failed',
      successAgeHours: 25,
    });
  });

  it('failed : dernier run en erreur et aucun succes connu', () => {
    expect(deriveBrainIngestState(runAt(2, 'error'), null, NOW)).toEqual({
      state: 'failed',
      successAgeHours: null,
    });
  });

  it('stale : des runs existent mais aucun n a jamais reussi', () => {
    // Un run `running` orphelin (script tue) n'a rien appris au cerveau.
    expect(deriveBrainIngestState(runAt(1, 'running'), null, NOW).state).toBe(
      'stale',
    );
  });

  it('run interrompu : le succes precedent continue de faire foi', () => {
    const enCours = runAt(0.1, 'running');
    const succes = runAt(12, 'success');
    expect(deriveBrainIngestState(enCours, succes, NOW).state).toBe('ok');
    // ... jusqu'a ce que ce succes vieillisse au-dela du seuil.
    const vieuxSucces = runAt(BRAIN_INGEST_STALE_HOURS + 24, 'success');
    expect(deriveBrainIngestState(enCours, vieuxSucces, NOW).state).toBe(
      'stale',
    );
  });

  it('horloge par defaut : un succes date de maintenant est ok', () => {
    const run = { statut: 'success', started_at: new Date().toISOString() };
    expect(deriveBrainIngestState(run, run).state).toBe('ok');
  });

  it('seuil documente : 7 jours', () => {
    expect(BRAIN_INGEST_STALE_HOURS).toBe(168);
  });
});
