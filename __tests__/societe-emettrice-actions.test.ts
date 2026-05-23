import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: 'new-id' }, error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/queries/users', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'u1', role: 'admin' })),
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createSocieteEmettrice } from '@/lib/actions/societes-emettrices';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSocieteEmettrice', () => {
  it('rejette si code vide', async () => {
    const res = await createSocieteEmettrice({
      code: '',
      raison_sociale: 'Test',
      siret: '123',
      tva_intracom: 'FR',
      adresse: 'a',
      code_postal: 'cp',
      ville: 'v',
      email_contact: 'a@b.fr',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/code|invalide/i);
    }
  });

  it('cree avec valeurs minimales', async () => {
    const res = await createSocieteEmettrice({
      code: 'TST',
      raison_sociale: 'Test',
      siret: '123',
      tva_intracom: 'FR',
      adresse: 'a',
      code_postal: '79000',
      ville: 'Niort',
      email_contact: 'a@b.fr',
    });
    expect(res.success).toBe(true);
  });
});
