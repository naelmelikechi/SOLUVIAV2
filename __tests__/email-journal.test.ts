process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks references hoisted once (avant les vi.mock, qui sont eux-memes
// hoistes par vitest) : les factories doivent renvoyer les MEMES objets a
// chaque reimport (vi.resetModules), sinon un test qui reimporte le module
// perd la reference vers les vi.fn() precedemment assertes.
const { loggerMocks } = vi.hoisted(() => ({
  loggerMocks: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@/lib/utils/logger', () => ({ logger: loggerMocks }));

const { envState } = vi.hoisted(() => ({
  envState: {
    RESEND_API_KEY: 'test-resend-key' as string | undefined,
    EMAIL_OVERRIDE: undefined as string | undefined,
  },
}));
vi.mock('@/lib/env', () => ({ env: envState }));

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({
  // Fonction normale (pas flechee) : le SDK est instancie avec `new Resend(...)`,
  // et une arrow function n'est pas constructible (leve "is not a constructor").
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: sendMock } };
  }),
}));

const { adminState } = vi.hoisted(() => ({
  adminState: {
    insertResult: { error: null as { message: string } | null },
    insertCalls: [] as unknown[],
    throwOnCreate: false,
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    if (adminState.throwOnCreate) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required for admin operations',
      );
    }
    return {
      from: (_table: string) => ({
        insert: (row: unknown) => {
          adminState.insertCalls.push(row);
          return Promise.resolve(adminState.insertResult);
        },
      }),
    };
  }),
}));

async function loadSendEmail() {
  vi.resetModules();
  const mod = await import('@/lib/email/_send');
  return mod.sendEmail;
}

beforeEach(() => {
  loggerMocks.error.mockClear();
  loggerMocks.warn.mockClear();
  loggerMocks.info.mockClear();
  loggerMocks.debug.mockClear();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'resend-id' }, error: null });
  adminState.insertResult = { error: null };
  adminState.insertCalls = [];
  adminState.throwOnCreate = false;
  envState.RESEND_API_KEY = 'test-resend-key';
  envState.EMAIL_OVERRIDE = undefined;
});

describe('sendEmail -> journal emails_envoyes (wiring)', () => {
  it('journalise une ligne source=app apres un envoi reussi, avec projetId/clientId/type', async () => {
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['client@exemple.fr'],
      cc: ['copie@exemple.fr'],
      subject: 'Facture FAC-SOL-0099',
      html: '<p>corps</p>',
      projetId: 'projet-1',
      clientId: 'client-1',
      type: 'facture',
    });

    expect(result.success).toBe(true);
    expect(adminState.insertCalls).toHaveLength(1);
    const row = adminState.insertCalls[0] as Record<string, unknown>;
    expect(row.source).toBe('app');
    expect(row.sujet).toBe('Facture FAC-SOL-0099');
    expect(row.destinataires).toEqual([
      'client@exemple.fr',
      'copie@exemple.fr',
    ]);
    expect(row.projet_id).toBe('projet-1');
    expect(row.client_id).toBe('client-1');
    expect(row.type).toBe('facture');
  });

  it('sans projetId/clientId/type (appelants existants non modifies), journalise quand meme avec des valeurs nulles', async () => {
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: 'destinataire@exemple.fr',
      subject: 'Notification',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(true);
    expect(adminState.insertCalls).toHaveLength(1);
    const row = adminState.insertCalls[0] as Record<string, unknown>;
    expect(row.projet_id).toBeNull();
    expect(row.client_id).toBeNull();
    expect(row.type).toBeNull();
  });

  it('EMAIL_OVERRIDE actif : journalise les destinataires REELS et le sujet ORIGINAL, pas l adresse de redirection', async () => {
    envState.EMAIL_OVERRIDE = 'demo@mysoluvia.com';
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['vrai-client@exemple.fr'],
      subject: 'Sujet original',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(true);

    // L'envoi Resend reel part bien vers l'adresse de redirection.
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['demo@mysoluvia.com'],
        subject: '[DEMO -> vrai-client@exemple.fr] Sujet original',
      }),
    );

    // Le journal, lui, dit ce qui se serait passe en vrai.
    expect(adminState.insertCalls).toHaveLength(1);
    const row = adminState.insertCalls[0] as Record<string, unknown>;
    expect(row.sujet).toBe('Sujet original');
    expect(row.destinataires).toEqual(['vrai-client@exemple.fr']);
  });

  it('envoi skipped (RESEND_API_KEY absent) ne produit aucune ligne de journal', async () => {
    envState.RESEND_API_KEY = undefined;
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['client@exemple.fr'],
      subject: 'Sujet',
      html: '<p>x</p>',
    });

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(adminState.insertCalls).toHaveLength(0);
  });

  it('un echec Resend (error renvoye par le SDK) ne journalise rien non plus', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'Rate limited' },
    });
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['client@exemple.fr'],
      subject: 'Sujet',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(false);
    expect(adminState.insertCalls).toHaveLength(0);
  });

  it('un echec d ecriture du journal (table inaccessible) ne fait PAS echouer l envoi', async () => {
    adminState.insertResult = { error: { message: 'permission denied' } };
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['client@exemple.fr'],
      subject: 'Sujet',
      html: '<p>x</p>',
    });

    // L'email est parti : c'est ce qui compte, le journal est best-effort.
    expect(result.success).toBe(true);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('un client admin qui leve une exception (service role manquant) ne fait pas non plus echouer l envoi', async () => {
    adminState.throwOnCreate = true;
    const sendEmail = await loadSendEmail();

    const result = await sendEmail({
      from: 'SOLUVIA <contact@mysoluvia.com>',
      to: ['client@exemple.fr'],
      subject: 'Sujet',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(true);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});

describe('journaliserEmail (lib/email/journal) - unitaire', () => {
  it('insere une ligne avec source=app et les champs fournis', async () => {
    vi.resetModules();
    const { journaliserEmail } = await import('@/lib/email/journal');

    await journaliserEmail({
      sujet: 'Devis DEV-0042',
      destinataires: ['a@exemple.fr'],
      expediteur: 'SOLUVIA <contact@mysoluvia.com>',
      projetId: 'p-1',
      clientId: 'c-1',
      type: 'devis',
    });

    expect(adminState.insertCalls).toHaveLength(1);
    const row = adminState.insertCalls[0] as Record<string, unknown>;
    expect(row.source).toBe('app');
    expect(row.sujet).toBe('Devis DEV-0042');
    expect(row.projet_id).toBe('p-1');
    expect(row.client_id).toBe('c-1');
    expect(row.type).toBe('devis');
  });

  it('ne leve jamais, meme si la table est inaccessible', async () => {
    adminState.insertResult = { error: { message: 'table introuvable' } };
    vi.resetModules();
    const { journaliserEmail } = await import('@/lib/email/journal');

    await expect(
      journaliserEmail({ sujet: 'x', destinataires: ['a@exemple.fr'] }),
    ).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('ne leve jamais, meme si createAdminClient leve une exception', async () => {
    adminState.throwOnCreate = true;
    vi.resetModules();
    const { journaliserEmail } = await import('@/lib/email/journal');

    await expect(
      journaliserEmail({ sujet: 'x', destinataires: ['a@exemple.fr'] }),
    ).resolves.toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });
});
