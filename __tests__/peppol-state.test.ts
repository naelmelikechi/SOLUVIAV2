import { describe, it, expect } from 'vitest';
import {
  normalizePeppolMoveState,
  resolvePeppolStateUpdate,
  getPeppolStateBadge,
} from '@/lib/odoo/peppol-state';

describe('normalizePeppolMoveState', () => {
  it('false/vide/null/undefined cote Odoo -> null (jamais transmis)', () => {
    expect(normalizePeppolMoveState(false)).toBeNull();
    expect(normalizePeppolMoveState('')).toBeNull();
    expect(normalizePeppolMoveState('   ')).toBeNull();
    expect(normalizePeppolMoveState(null)).toBeNull();
    expect(normalizePeppolMoveState(undefined)).toBeNull();
  });

  it('conserve toute chaine non vide telle quelle (trimee)', () => {
    expect(normalizePeppolMoveState('done')).toBe('done');
    expect(normalizePeppolMoveState('to_send')).toBe('to_send');
    expect(normalizePeppolMoveState(' processing ')).toBe('processing');
    // Valeur inconnue d'une future version Odoo : conservee, pas filtree.
    expect(normalizePeppolMoveState('nouveau_statut')).toBe('nouveau_statut');
  });
});

describe('resolvePeppolStateUpdate (changement de valeur -> update)', () => {
  it('pas de changement : valeur Odoo identique a la DB', () => {
    expect(resolvePeppolStateUpdate('done', 'done')).toEqual({
      changed: false,
      next: 'done',
    });
    expect(resolvePeppolStateUpdate(null, false)).toEqual({
      changed: false,
      next: null,
    });
    expect(resolvePeppolStateUpdate(null, '')).toEqual({
      changed: false,
      next: null,
    });
  });

  it('premiere transmission : null en DB -> statut Odoo', () => {
    expect(resolvePeppolStateUpdate(null, 'to_send')).toEqual({
      changed: true,
      next: 'to_send',
    });
  });

  it('progression du cycle de vie : processing -> done', () => {
    expect(resolvePeppolStateUpdate('processing', 'done')).toEqual({
      changed: true,
      next: 'done',
    });
  });

  it('retour a false cote Odoo -> null en DB', () => {
    expect(resolvePeppolStateUpdate('error', false)).toEqual({
      changed: true,
      next: null,
    });
  });
});

describe('getPeppolStateBadge (mapping label FR)', () => {
  it('null (jamais transmis) -> pas de badge', () => {
    expect(getPeppolStateBadge(null)).toBeNull();
  });

  it('done et statuts aval PDP -> Transmise (vert)', () => {
    for (const s of ['done', 'submitted', 'made_available', 'AB', 'AP', 'PD']) {
      expect(getPeppolStateBadge(s)).toEqual({
        label: 'Peppol : Transmise',
        color: 'green',
      });
    }
  });

  it('ready/to_send/processing -> En cours (bleu)', () => {
    for (const s of ['ready', 'to_send', 'processing']) {
      expect(getPeppolStateBadge(s)).toEqual({
        label: 'Peppol : En cours',
        color: 'blue',
      });
    }
  });

  it('error/RE/refused -> Erreur (rouge)', () => {
    for (const s of ['error', 'RE', 'refused']) {
      expect(getPeppolStateBadge(s)).toEqual({
        label: 'Peppol : Erreur',
        color: 'red',
      });
    }
  });

  it('skipped/cancelled -> Ignoree (gris)', () => {
    for (const s of ['skipped', 'cancelled']) {
      expect(getPeppolStateBadge(s)).toEqual({
        label: 'Peppol : Ignorée',
        color: 'gray',
      });
    }
  });

  it('valeur inconnue -> code brut en gris (defensif)', () => {
    expect(getPeppolStateBadge('nouveau_statut')).toEqual({
      label: 'Peppol : nouveau_statut',
      color: 'gray',
    });
  });
});
