process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';
import { rattacherMessage } from '@/lib/gmail/collecte';
import { assertAdresseDansDomaine } from '@/lib/gmail/client';
import type { GmailMessageHeaders } from '@/lib/gmail/client';

const { envState } = vi.hoisted(() => ({
  envState: { GMAIL_DOMAINE: 'mysoluvia.com' as string | undefined },
}));
vi.mock('@/lib/env', () => ({ env: envState }));

function entetes(
  overrides: Partial<GmailMessageHeaders> = {},
): GmailMessageHeaders {
  return {
    id: 'msg-1',
    sujet: 'Point projet',
    de: 'cdp@mysoluvia.com',
    a: ['contact@client-a.fr'],
    date: '2026-08-06T10:00:00Z',
    ...overrides,
  };
}

describe('rattacherMessage - perimetre de collecte', () => {
  it('aucun participant connu -> null, rien n est stocke', () => {
    const contacts = new Map<string, string>([
      ['connu@client-a.fr', 'client-a'],
    ]);
    const result = rattacherMessage(
      entetes({ de: 'inconnu@ailleurs.fr', a: ['autre-inconnu@ailleurs.fr'] }),
      contacts,
    );
    expect(result).toBeNull();
  });

  it('un destinataire connu -> ligne rattachee au client de ce contact', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({ de: 'cdp@mysoluvia.com', a: ['contact@client-a.fr'] }),
      contacts,
    );
    expect(result).not.toBeNull();
    expect(result?.client_id).toBe('client-a-id');
    expect(result?.ambigu).toBe(false);
  });

  it('un expediteur connu -> meme chose', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({ de: 'contact@client-a.fr', a: ['cdp@mysoluvia.com'] }),
      contacts,
    );
    expect(result).not.toBeNull();
    expect(result?.client_id).toBe('client-a-id');
  });

  it('plusieurs contacts de clients differents -> rattache au premier et le signale, ne duplique pas', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
      ['contact@client-b.fr', 'client-b-id'],
    ]);
    const result = rattacherMessage(
      entetes({
        de: 'contact@client-a.fr',
        a: ['contact@client-b.fr', 'cdp@mysoluvia.com'],
      }),
      contacts,
    );
    expect(result).not.toBeNull();
    // Ordre : expediteur d abord, donc client-a-id gagne.
    expect(result?.client_id).toBe('client-a-id');
    expect(result?.ambigu).toBe(true);
    // Une seule ligne produite, jamais un tableau ni un doublon.
    expect(Array.isArray(result)).toBe(false);
  });

  it('comparaison insensible a la casse et tolere "Nom <adresse@x.fr>"', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({
        de: 'Jean Dupont <CONTACT@Client-A.fr>',
        a: ['cdp@mysoluvia.com'],
      }),
      contacts,
    );
    expect(result).not.toBeNull();
    expect(result?.client_id).toBe('client-a-id');
  });

  it('tolere aussi la forme "Nom <adresse>" cote destinataire, y compris avec plusieurs To separes par virgule', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({
        de: 'cdp@mysoluvia.com',
        a: ['Autre <autre@ailleurs.fr>', 'Contact A <contact@client-a.fr>'],
      }),
      contacts,
    );
    expect(result).not.toBeNull();
    expect(result?.client_id).toBe('client-a-id');
  });

  it('AUCUN champ de corps n apparait dans la ligne produite', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({ de: 'contact@client-a.fr' }),
      contacts,
    );
    expect(result).not.toBeNull();
    const keys = Object.keys(result as object);
    // La ligne ne doit exposer QUE des metadonnees, jamais un champ pouvant
    // porter le corps d un message.
    expect(keys).toEqual(
      expect.arrayContaining([
        'source',
        'envoye_le',
        'sujet',
        'expediteur',
        'destinataires',
        'client_id',
        'external_id',
        'ambigu',
      ]),
    );
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(
        /corps|body|content|snippet|html|text/,
      );
    }
    // Le type GmailMessageHeaders lui-meme (source de la ligne) n a pas de
    // champ corps : rien n est disponible a extraire par erreur.
    const entetesKeys = Object.keys(entetes());
    for (const key of entetesKeys) {
      expect(key.toLowerCase()).not.toMatch(/corps|body|content|snippet/);
    }
  });

  it('rattache la ligne source=gmail avec envoye_le en ISO derive de l en-tete Date', () => {
    const contacts = new Map<string, string>([
      ['contact@client-a.fr', 'client-a-id'],
    ]);
    const result = rattacherMessage(
      entetes({ date: '2026-08-06T10:00:00Z' }),
      contacts,
    );
    expect(result?.source).toBe('gmail');
    expect(result?.envoye_le).toBe('2026-08-06T10:00:00.000Z');
  });
});

describe('assertAdresseDansDomaine - garde-fou anti-usurpation', () => {
  it('accepte une adresse du domaine configure', () => {
    expect(() => assertAdresseDansDomaine('cdp@mysoluvia.com')).not.toThrow();
  });

  it('refuse une adresse hors du domaine configure', () => {
    expect(() => assertAdresseDansDomaine('quelquun@gmail.com')).toThrow(
      /hors du domaine/,
    );
  });

  it('refuse meme un sous-domaine ou un domaine proche (pas de match partiel)', () => {
    expect(() => assertAdresseDansDomaine('cdp@sub.mysoluvia.com')).toThrow();
    expect(() => assertAdresseDansDomaine('cdp@notmysoluvia.com')).toThrow();
  });
});
