// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

// vi.hoisted lets us share handles across the mock factories below.
const mocks = vi.hoisted(() => {
  // Server-side Supabase client (used by guards). We re-shape the chain on
  // demand via setSupabaseTarget below.
  const supabaseFrom = vi.fn();
  const supabaseRpc = vi.fn();
  const supabase = {
    from: supabaseFrom,
    rpc: supabaseRpc,
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };

  // Admin client (service_role) - separate from server client.
  const adminFrom = vi.fn();
  const adminInsert = vi.fn().mockResolvedValue({ error: null });
  const adminCreateUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null });
  const adminDeleteUser = vi.fn().mockResolvedValue({ error: null });
  const adminSignOut = vi.fn().mockResolvedValue({ error: null });
  const adminUpdateUserById = vi.fn().mockResolvedValue({ error: null });

  const adminClient = {
    from: adminFrom,
    auth: {
      admin: {
        createUser: adminCreateUser,
        deleteUser: adminDeleteUser,
        signOut: adminSignOut,
        updateUserById: adminUpdateUserById,
      },
    },
  };

  // Guard return value : caller pose un { ok, supabase, user, role } via
  // setAuthState. Defaults : superadmin (couvre 90 % des tests).
  let authState: unknown = {
    ok: true,
    supabase,
    user: { id: '00000000-0000-4000-8000-000000000000' } as User,
    role: 'superadmin',
  };

  return {
    supabase,
    supabaseFrom,
    supabaseRpc,
    adminClient,
    adminFrom,
    adminInsert,
    adminCreateUser,
    adminDeleteUser,
    adminSignOut,
    adminUpdateUserById,
    getAuth: () => authState,
    setAuth: (v: unknown) => {
      authState = v;
    },
  };
});

vi.mock('@/lib/auth/guards', () => ({
  checkAuth: vi.fn(async () => mocks.getAuth()),
  requireSuperAdmin: vi.fn(async () => mocks.getAuth()),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mocks.adminClient),
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/email/client', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  updateUserRole,
  toggleUserActive,
  deleteUser,
  inviteUser,
  resetUserPassword,
} from '@/lib/actions/users';

// Helpers : raccourci pour reconfigurer le chain Supabase server/admin.
function setSelectSingle(table: 'users', row: unknown) {
  mocks.supabaseFrom.mockImplementation((t: string) => {
    if (t !== table) throw new Error(`Unexpected from(${t})`);
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });
}

// Etat du pre-check duplicate dans inviteUser : null = pas de duplicate.
// Les tests peuvent reassigner avant l'appel pour simuler un email existant.
let duplicateRow: { id: string; actif: boolean } | null = null;

beforeEach(() => {
  // resetAllMocks (vs clearAllMocks) vide les queues mockResolvedValueOnce
  // qui sinon fuient entre tests (ex. un test deleteUser qui queue un
  // adminDeleteUser one-shot et plante en UUID validation laissait le
  // one-shot consommer le PREMIER appel du test suivant).
  vi.resetAllMocks();
  mocks.setAuth({
    ok: true,
    supabase: mocks.supabase,
    user: { id: CALLER_UUID } as User,
    role: 'superadmin',
  });
  setSelectSingle('users', { role: 'cdp' });
  duplicateRow = null;
  mocks.adminInsert.mockResolvedValue({ error: null });
  // adminClient.from('users') doit supporter :
  //  - .select('id, actif').eq('email', x).maybeSingle()  (pre-check duplicate)
  //  - .insert(row)                                       (creation)
  mocks.adminFrom.mockImplementation(() => ({
    insert: mocks.adminInsert,
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: duplicateRow,
          error: null,
        })),
      }),
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }));
  mocks.adminCreateUser.mockResolvedValue({
    data: { user: { id: 'new-user-id' } },
    error: null,
  });
  mocks.adminDeleteUser.mockResolvedValue({ error: null });
  mocks.adminSignOut.mockResolvedValue({ error: null });
  mocks.adminUpdateUserById.mockResolvedValue({ error: null });
  mocks.supabaseRpc.mockResolvedValue({ error: null });
});

// Zod v4 .uuid() exige le digit version 4 + variant 8/9/a/b. Les UUIDs
// "1111..." ne passent pas, on utilise des v4 valides.
const CALLER_UUID = '00000000-0000-4000-8000-000000000000';
const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

describe('updateUserRole', () => {
  it('refuse les UUID invalides', async () => {
    const res = await updateUserRole('not-a-uuid', 'cdp');
    expect(res.success).toBe(false);
  });

  it('un admin (non superadmin) ne peut pas promouvoir vers admin', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: CALLER_UUID } as User,
      role: 'admin',
    });
    const res = await updateUserRole(OTHER_UUID, 'admin');
    expect(res).toEqual({
      success: false,
      error: 'Seul un superadmin peut attribuer ce rôle',
    });
  });

  it('un admin ne peut pas modifier un autre admin', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: CALLER_UUID } as User,
      role: 'admin',
    });
    setSelectSingle('users', { role: 'admin' });
    const res = await updateUserRole(OTHER_UUID, 'cdp');
    expect(res).toEqual({
      success: false,
      error: 'Seul un superadmin peut modifier un administrateur',
    });
  });

  it('un caller ne peut pas modifier son propre role', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: VALID_UUID } as User,
      role: 'superadmin',
    });
    const res = await updateUserRole(VALID_UUID, 'admin');
    expect(res).toEqual({
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre rôle',
    });
  });

  it('superadmin promeut un cdp en admin', async () => {
    const res = await updateUserRole(OTHER_UUID, 'admin');
    expect(res).toEqual({ success: true });
  });
});

describe('toggleUserActive', () => {
  it('un caller ne peut pas se desactiver lui-meme', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: VALID_UUID } as User,
      role: 'admin',
    });
    const res = await toggleUserActive(VALID_UUID, false);
    expect(res).toEqual({
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre compte',
    });
  });

  it('un admin ne peut pas desactiver un autre admin', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: CALLER_UUID } as User,
      role: 'admin',
    });
    setSelectSingle('users', { role: 'admin' });
    const res = await toggleUserActive(OTHER_UUID, false);
    expect(res.success).toBe(false);
    expect(res.error).toContain('superadmin');
  });

  it('revoque les sessions Auth quand on passe a inactif', async () => {
    await toggleUserActive(OTHER_UUID, false);
    expect(mocks.adminSignOut).toHaveBeenCalledWith(OTHER_UUID, 'global');
  });

  it('n appelle PAS signOut quand on passe a actif', async () => {
    await toggleUserActive(OTHER_UUID, true);
    expect(mocks.adminSignOut).not.toHaveBeenCalled();
  });

  it("ne fait pas echouer l'action si signOut throw", async () => {
    mocks.adminSignOut.mockRejectedValueOnce(new Error('network'));
    const res = await toggleUserActive(OTHER_UUID, false);
    expect(res).toEqual({ success: true });
  });
});

describe('deleteUser', () => {
  it('un superadmin ne peut pas se supprimer lui-meme', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: VALID_UUID } as User,
      role: 'superadmin',
    });
    const res = await deleteUser(VALID_UUID);
    expect(res).toEqual({
      success: false,
      error: 'Vous ne pouvez pas supprimer votre propre compte',
    });
  });

  it('remonte l erreur RPC delete_user_cascade au caller', async () => {
    mocks.supabaseRpc.mockResolvedValueOnce({
      error: { message: 'FK violation on X' },
    });
    const res = await deleteUser(OTHER_UUID);
    expect(res.success).toBe(false);
    expect(res.error).toContain('FK violation on X');
    // l'auth ne doit PAS avoir ete supprimee si la DB a echoue
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it('remonte un message specifique runbook si auth.deleteUser echoue', async () => {
    mocks.supabaseRpc.mockResolvedValueOnce({ error: null });
    mocks.adminDeleteUser.mockResolvedValueOnce({
      error: { message: 'auth gone' },
    });
    const res = await deleteUser(OTHER_UUID);
    expect(res.success).toBe(false);
    expect(res.error).toContain('RUNBOOKS.md');
  });

  it('succede quand les deux etapes passent', async () => {
    mocks.supabaseRpc.mockResolvedValueOnce({ error: null });
    const res = await deleteUser(OTHER_UUID);
    expect(res).toEqual({ success: true });
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('delete_user_cascade', {
      p_user_id: OTHER_UUID,
    });
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith(OTHER_UUID);
  });
});

describe('inviteUser', () => {
  it('un admin (non superadmin) ne peut pas inviter un admin', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: CALLER_UUID } as User,
      role: 'admin',
    });
    const res = await inviteUser('a@b.fr', 'admin', 'Jean', 'Dupont');
    expect(res).toEqual({
      success: false,
      error: 'Seul un superadmin peut inviter un administrateur',
    });
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it('refuse les emails malformes au schema Zod', async () => {
    const res = await inviteUser('pas-un-email', 'cdp', 'Jean', 'Dupont');
    expect(res.success).toBe(false);
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it('rollback auth.user si l INSERT public.users echoue', async () => {
    // INSERT echec
    mocks.adminInsert.mockResolvedValueOnce({
      error: { message: 'duplicate key' },
    });
    const res = await inviteUser('cdp@new.fr', 'cdp', 'New', 'CDP');
    expect(res.success).toBe(false);
    expect(res.error).toBe('duplicate key');
    // Le rollback doit avoir ete tente sur l'auth.user fraichement cree
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith('new-user-id');
  });

  it('remonte un message specifique si le rollback lui-meme echoue', async () => {
    mocks.adminInsert.mockResolvedValueOnce({
      error: { message: 'duplicate key' },
    });
    mocks.adminDeleteUser.mockResolvedValueOnce({
      error: { message: 'auth API down' },
    });
    const res = await inviteUser('cdp@new.fr', 'cdp', 'New', 'CDP');
    expect(res.success).toBe(false);
    expect(res.error).toContain('RUNBOOKS.md');
  });

  it('propage l erreur createUser et NE crée RIEN cote public.users', async () => {
    mocks.adminCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Email already registered' },
    });
    const res = await inviteUser('exist@b.fr', 'cdp', 'X', 'Y');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Email already registered');
    expect(mocks.adminInsert).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it('rejette si l email existe deja (actif)', async () => {
    duplicateRow = { id: 'existing', actif: true };
    const res = await inviteUser('dup@b.fr', 'cdp', 'X', 'Y');
    expect(res.success).toBe(false);
    expect(res.error).toContain('existe déjà');
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it('rejette avec un message specifique si l email existe mais est desactive', async () => {
    duplicateRow = { id: 'existing', actif: false };
    const res = await inviteUser('dup@b.fr', 'cdp', 'X', 'Y');
    expect(res.success).toBe(false);
    expect(res.error).toContain('désactivé');
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it('normalise l email (trim + lowercase)', async () => {
    const res = await inviteUser('  FOO@BAR.FR  ', 'cdp', 'X', 'Y');
    expect(res.success).toBe(true);
    // createUser doit avoir recu la version normalisee
    expect(mocks.adminCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'foo@bar.fr' }),
    );
  });

  it('invite un commercial avec pipeline_access=true force', async () => {
    const res = await inviteUser('com@x.fr', 'commercial', 'Cyril', 'Ven');
    expect(res.success).toBe(true);
    expect(mocks.adminInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'commercial', pipeline_access: true }),
    );
  });
});

describe('resetUserPassword', () => {
  it('refuse de reinitialiser son propre mot de passe', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: VALID_UUID } as User,
      role: 'admin',
    });
    const res = await resetUserPassword(VALID_UUID);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Mot de passe oublié');
  });

  it('refuse les UUID invalides', async () => {
    const res = await resetUserPassword('not-a-uuid');
    expect(res.success).toBe(false);
  });

  it('un admin ne peut pas reinit le password d un admin', async () => {
    mocks.setAuth({
      ok: true,
      supabase: mocks.supabase,
      user: { id: CALLER_UUID } as User,
      role: 'admin',
    });
    setSelectSingle('users', {
      email: 'x@y.fr',
      prenom: 'X',
      nom: 'Y',
      role: 'admin',
      derniere_connexion: null,
    });
    const res = await resetUserPassword(OTHER_UUID);
    expect(res.success).toBe(false);
    expect(res.error).toContain('superadmin');
  });
});
