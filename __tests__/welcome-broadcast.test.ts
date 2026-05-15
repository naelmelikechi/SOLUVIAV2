process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect } from 'vitest';
import {
  filterEligibleRecipients,
  type BroadcastUser,
} from '@/lib/email/welcome-broadcast';

describe('filterEligibleRecipients', () => {
  it('garde les users actifs sans welcome_email_sent_at', () => {
    const users: BroadcastUser[] = [
      {
        email: 'a@x.fr',
        prenom: 'A',
        role: 'admin',
        actif: true,
        welcome_email_sent_at: null,
      },
      {
        email: 'b@x.fr',
        prenom: 'B',
        role: 'cdp',
        actif: true,
        welcome_email_sent_at: '2026-05-01T00:00:00Z',
      },
      {
        email: 'c@x.fr',
        prenom: 'C',
        role: 'cdp',
        actif: false,
        welcome_email_sent_at: null,
      },
      {
        email: 'd@x.fr',
        prenom: 'D',
        role: 'commercial',
        actif: true,
        welcome_email_sent_at: null,
      },
      {
        email: 'e@x.fr',
        prenom: 'E',
        role: 'superadmin',
        actif: false,
        welcome_email_sent_at: '2025-12-01T00:00:00Z',
      },
    ];
    const eligible = filterEligibleRecipients(users);
    expect(eligible.map((u) => u.email)).toEqual(['a@x.fr', 'd@x.fr']);
  });

  it('retourne un tableau vide si rien d eligible', () => {
    const users: BroadcastUser[] = [
      {
        email: 'a@x.fr',
        prenom: 'A',
        role: 'admin',
        actif: true,
        welcome_email_sent_at: '2026-05-01',
      },
    ];
    expect(filterEligibleRecipients(users)).toEqual([]);
  });

  it('accepte une liste vide', () => {
    expect(filterEligibleRecipients([])).toEqual([]);
  });
});
