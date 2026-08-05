// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/actions/brain-proposals.ts — la SEULE couche qui écrit et
 * archive dans brain_notes. Une Server Action est un point d'entrée HTTP :
 * l'interface d'arbitrage ne protège rien, tout se joue ici.
 *
 * Couvre :
 * - adminGate : aucune des 4 actions ne touche la base sans un admin
 * - garde de `kind` : arbitrer une `conversation` comme une obsolescence
 *   permettait d'archiver une note approuvée par une requête forgée
 * - archiver = drapeau `frontmatter.archive`, JAMAIS un delete (la note est
 *   souvent la seule copie d'une réponse rédigée à la main)
 * - upsertNote : une note `corrige: true` (réponse humaine) n'est jamais
 *   écrasée par une paraphrase de l'assistant ; idem pour une entité
 *   `verified: true` (définition officielle curée à la main)
 * - garder : dé-stale ET rafraîchit `frontmatter.source_hashes` — sans quoi
 *   markStaleConversations re-marque la note au run suivant sans rouvrir
 *   d'arbitrage, et elle sort définitivement de la recherche
 * - concurrence : source_hash périmé, proposition déjà arbitrée, transition
 *   affectant zéro ligne (deux onglets) -> erreur, jamais un faux succès
 * - resolveGapAction : la réponse de l'admin devient une note dont le
 *   frontmatter.source_hashes est résolu depuis process_qa_feedback.sources
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ checkAuth: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
// Le logger n'écrit que sur la console : on le neutralise pour garder la
// sortie des tests lisible sur les nombreux chemins d'erreur attendus.
vi.mock('@/lib/utils/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof LoggerModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type * as LoggerModule from '@/lib/utils/logger';

import { revalidatePath } from 'next/cache';
import { checkAuth } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  approveProposalAction,
  rejectProposalAction,
  resolveGapAction,
  arbitrateStaleAction,
} from '@/lib/actions/brain-proposals';

const PROPOSAL_ID = '11111111-1111-4111-a111-111111111111';
const FEEDBACK_ID = '22222222-2222-4222-a222-222222222222';
const USER_ID = '33333333-3333-4333-a333-333333333333';
const HASH = 'hash-affiche-a-l-admin';
const NOTE_PATH = 'conversations/comment-facturer-un-opco-abcd1234.md';
const ENTITE_PATH = 'entites/afest.md';

const ERR_PERIMEE =
  'Proposition déjà traitée, ou modifiée depuis son affichage — recharge la page';
const ERR_DEJA_TRAITEE = 'Proposition déjà traitée';
const ERR_MAUVAIS_KIND =
  "Cette proposition n'est pas un arbitrage d'obsolescence";

// ---------------------------------------------------------------------------
// Faux client Supabase : enregistre chaque opération (table + verbe + valeurs +
// filtres) et délègue le résultat à une route `${table}.${verbe}` fournie par le
// test. `delete()` est un espion dédié : plusieurs tests vérifient son ABSENCE.
// ---------------------------------------------------------------------------

type Filter = { kind: 'eq' | 'in'; col: string; val: unknown };
type Verb = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

interface Op {
  table: string;
  verb: Verb;
  columns: string | null;
  values: Record<string, unknown> | null;
  filters: Filter[];
  terminal: 'await' | 'single' | 'maybeSingle';
}

type RouteResult = { data?: unknown; error?: { message: string } | null };
type Route = (op: Op) => RouteResult;
type Routes = Record<string, Route>;

function makeDb(routes: Routes = {}) {
  const ops: Op[] = [];
  const deleteSpy = vi.fn();

  // Défauts « rien en base, tout passe » : chaque test ne surcharge que ce qui
  // porte son scénario.
  const defaults: Routes = {
    // Aucune proposition en attente ne correspond (id/statut/hash) : c'est le
    // refus par défaut, les tests du chemin nominal fournissent la ligne.
    'brain_proposals.select': () => ({
      data: null,
      error: { message: 'PGRST116: no rows returned' },
    }),
    'brain_proposals.update': () => ({
      data: [{ id: PROPOSAL_ID }],
      error: null,
    }),
    'brain_notes.select': (op) =>
      op.filters.some((f) => f.kind === 'in')
        ? { data: [], error: null }
        : { data: null, error: null },
    'brain_notes.upsert': () => ({ data: null, error: null }),
    'brain_notes.update': () => ({ data: null, error: null }),
    'process_qa_feedback.select': () => ({ data: null, error: null }),
  };

  function chain(op: Op) {
    const run = () => {
      const key = `${op.table}.${op.verb}`;
      const route = routes[key] ?? defaults[key];
      const res: RouteResult = route ? route(op) : { data: null, error: null };
      return Promise.resolve({
        data: res.data ?? null,
        error: res.error ?? null,
      });
    };
    const api = {
      select(columns?: string) {
        op.columns = columns ?? null;
        return api;
      },
      eq(col: string, val: unknown) {
        op.filters.push({ kind: 'eq', col, val });
        return api;
      },
      in(col: string, val: unknown) {
        op.filters.push({ kind: 'in', col, val });
        return api;
      },
      single() {
        op.terminal = 'single';
        return run();
      },
      maybeSingle() {
        op.terminal = 'maybeSingle';
        return run();
      },
      // Rend la chaîne awaitable sans terminal explicite (upsert / update .eq).
      then(
        onOk?: (v: {
          data: unknown;
          error: { message: string } | null;
        }) => unknown,
        onErr?: (e: unknown) => unknown,
      ) {
        return run().then(onOk, onErr);
      },
    };
    return api;
  }

  function from(table: string) {
    const newOp = (verb: Verb, init: Partial<Op> = {}): Op => {
      const op: Op = {
        table,
        verb,
        columns: null,
        values: null,
        filters: [],
        terminal: 'await',
        ...init,
      };
      ops.push(op);
      return op;
    };
    return {
      select: (columns?: string) =>
        chain(newOp('select', { columns: columns ?? null })),
      insert: (values: Record<string, unknown>) =>
        chain(newOp('insert', { values })),
      update: (values: Record<string, unknown>) =>
        chain(newOp('update', { values })),
      upsert: (values: Record<string, unknown>) =>
        chain(newOp('upsert', { values })),
      delete: () => {
        deleteSpy(table);
        return chain(newOp('delete'));
      },
    };
  }

  return { client: { from }, ops, deleteSpy };
}

type FakeDb = ReturnType<typeof makeDb>;

/** Toute opération autre qu'une lecture : ce qui laisse une trace en base. */
function ecritures(db: FakeDb): Op[] {
  return db.ops.filter((o) => o.verb !== 'select');
}

function opsDe(db: FakeDb, table: string, verb: Verb): Op[] {
  return db.ops.filter((o) => o.table === table && o.verb === verb);
}

function useDb(routes: Routes = {}): FakeDb {
  const db = makeDb(routes);
  vi.mocked(createAdminClient).mockReturnValue(
    db.client as unknown as ReturnType<typeof createAdminClient>,
  );
  return db;
}

function setAdmin(role = 'admin', userId = USER_ID) {
  vi.mocked(checkAuth).mockResolvedValue({
    ok: true,
    supabase: {},
    user: { id: userId },
    role,
  } as unknown as Awaited<ReturnType<typeof checkAuth>>);
}

function setGuardKo(error = 'Accès refusé - réservé aux admins') {
  vi.mocked(checkAuth).mockResolvedValue({ ok: false, error });
}

// --- Fixtures de propositions ---------------------------------------------

function conversationProposal(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    kind: 'conversation',
    status: 'en_attente',
    // `noteToProposal` pose target_path sur TOUTES les propositions : une
    // conversation porte donc un chemin de note parfaitement valide.
    target_path: NOTE_PATH,
    payload: {
      path: NOTE_PATH,
      type: 'conversation',
      title: 'Comment facturer un OPCO ?',
      aliases: [],
      tags: ['faq'],
      links: ['fiches/opco'],
      body: '# Comment facturer un OPCO ?\n\nRéponse paraphrasée par l assistant.\n\n[[fiches/opco]]',
      frontmatter: {
        derived_from: ['fiches/opco'],
        source_hashes: { 'fiches/opco': 'h-opco' },
      },
      source_ref: FEEDBACK_ID,
      source_hash: HASH,
    },
    source_ref: FEEDBACK_ID,
    source_hash: HASH,
    ...over,
  };
}

/**
 * Proposition de DÉFINITION d'entité, telle que `entityToBrainNote` la produit :
 * son frontmatter ne porte que `definition` — jamais `verified`, qui est posé à
 * la main sur les entités curées.
 */
function entiteProposal(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    kind: 'entite',
    status: 'en_attente',
    target_path: ENTITE_PATH,
    payload: {
      path: ENTITE_PATH,
      type: 'entite',
      title: 'AFEST',
      aliases: [],
      tags: [],
      links: ['fiches/opco'],
      body: '# AFEST\n\nDéfinition reformulée par Claude.\n\n## Notes liées\n[[fiches/opco]]',
      frontmatter: { definition: 'Définition reformulée par Claude.' },
      source_ref: 'entite:afest',
      source_hash: HASH,
    },
    source_ref: 'entite:afest',
    source_hash: HASH,
    ...over,
  };
}

function obsolescenceProposal(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    kind: 'obsolescence',
    status: 'en_attente',
    target_path: NOTE_PATH,
    payload: {
      path: NOTE_PATH,
      title: 'Comment facturer un OPCO ?',
      sources_modifiees: ['fiches/opco'],
    },
    source_ref: NOTE_PATH,
    source_hash: HASH,
    ...over,
  };
}

function lacuneProposal(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    kind: 'lacune',
    status: 'en_attente',
    target_path: null,
    payload: {
      question: 'Comment facturer un OPCO ?',
      answer_ko: 'Mauvaise réponse générée par l assistant.',
      derived_from: [],
      source_hashes: {},
    },
    source_ref: FEEDBACK_ID,
    source_hash: HASH,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setAdmin();
});

// ---------------------------------------------------------------------------
// 1. Garde d'autorisation
// ---------------------------------------------------------------------------

describe('adminGate — les 4 actions', () => {
  it('guard en échec -> les 4 actions refusent sans ouvrir de client admin', async () => {
    setGuardKo();
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
    });

    const resultats = await Promise.all([
      approveProposalAction({ id: PROPOSAL_ID, sourceHash: HASH }),
      rejectProposalAction({ id: PROPOSAL_ID }),
      resolveGapAction({ id: PROPOSAL_ID, sourceHash: HASH, answer: 'Voici.' }),
      arbitrateStaleAction({
        id: PROPOSAL_ID,
        sourceHash: HASH,
        choix: 'archiver',
      }),
    ]);

    for (const res of resultats) {
      expect(res).toEqual({
        success: false,
        error: 'Accès refusé - réservé aux admins',
      });
    }
    // Le client service-role n'est même pas instancié : rien ne peut être écrit.
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
    expect(db.deleteSpy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('utilisateur authentifié mais non-admin -> refus, aucune écriture', async () => {
    // Défense en profondeur : même si checkAuth laissait passer un rôle non
    // admin, adminGate re-teste isAdmin avant de créer le client service-role.
    setAdmin('collaborateur');
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({ success: false, error: 'Réservé aux admins' });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  it('superadmin passe le garde', async () => {
    setAdmin('superadmin');
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({ data: { frontmatter: {} }, error: null }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({ success: true });
    expect(opsDe(db, 'brain_notes', 'update')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Validation des entrées (avant tout accès)
// ---------------------------------------------------------------------------

describe('validation des entrées', () => {
  it('ID non-UUID -> Données invalides, sans même vérifier l auth', async () => {
    const db = useDb();
    const res = await approveProposalAction({
      id: 'pas-un-uuid',
      sourceHash: HASH,
    });
    expect(res).toEqual({ success: false, error: 'Données invalides' });
    expect(checkAuth).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  it('sourceHash vide -> Données invalides (pas de publication non versionnée)', async () => {
    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: '',
    });
    expect(res).toEqual({ success: false, error: 'Données invalides' });
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it('choix hors enum -> Données invalides', async () => {
    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      // @ts-expect-error - choix forgé hors de l'enum
      choix: 'supprimer',
    });
    expect(res).toEqual({ success: false, error: 'Données invalides' });
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it('« regenerer » est un choix retiré : rejeté au schéma, aucune écriture', async () => {
    // L'action a disparu de l'écran, mais une Server Action reste un point
    // d'entrée HTTP : l'ancien choix ne doit plus rien déclencher.
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      // @ts-expect-error - `regenerer` ne fait plus partie de l'enum
      choix: 'regenerer',
    });

    expect(res).toEqual({ success: false, error: 'Données invalides' });
    expect(checkAuth).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  it('réponse de lacune vide -> Réponse manquante', async () => {
    const db = useDb();
    const res = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: '',
    });
    expect(res).toEqual({ success: false, error: 'Réponse manquante' });
    expect(db.ops).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Le garde de `kind` — arbitrer une note qui n'est pas en obsolescence
// ---------------------------------------------------------------------------

describe('arbitrateStaleAction — garde de kind', () => {
  for (const kind of ['conversation', 'entite', 'lacune'] as const) {
    for (const choix of ['garder', 'archiver'] as const) {
      it(`refuse une proposition ${kind} avec choix=${choix}, sans rien écrire`, async () => {
        const db = useDb({
          // La proposition porte un target_path valide : seul le `kind` la
          // distingue d'un arbitrage d'obsolescence.
          'brain_proposals.select': () => ({
            data: conversationProposal({ kind }),
            error: null,
          }),
          'brain_notes.select': () => ({
            data: { body: 'corps', frontmatter: { stale: true } },
            error: null,
          }),
        });

        const res = await arbitrateStaleAction({
          id: PROPOSAL_ID,
          sourceHash: HASH,
          choix,
        });

        expect(res).toEqual({ success: false, error: ERR_MAUVAIS_KIND });
        // Ni archivage, ni dé-stale, ni transition de statut.
        expect(ecritures(db)).toEqual([]);
        expect(db.deleteSpy).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
      });
    }
  }

  it('refuse une obsolescence sans note cible', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal({ target_path: null }),
        error: null,
      }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({
      success: false,
      error: 'Proposition sans note cible',
    });
    expect(ecritures(db)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3-4. Archiver = drapeau, jamais un delete
// ---------------------------------------------------------------------------

describe('arbitrateStaleAction — archiver', () => {
  it('pose frontmatter.archive = true et n appelle JAMAIS delete', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { frontmatter: { stale: true } },
        error: null,
      }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({ success: true });

    const maj = opsDe(db, 'brain_notes', 'update');
    expect(maj).toHaveLength(1);
    const fm = maj[0]!.values!.frontmatter as Record<string, unknown>;
    expect(fm.archive).toBe(true);
    expect(maj[0]!.filters).toEqual([
      { kind: 'eq', col: 'path', val: NOTE_PATH },
    ]);

    // La régression qu'on ne veut jamais revoir : la note reste en base.
    expect(db.deleteSpy).not.toHaveBeenCalled();
    expect(db.ops.some((o) => o.verb === 'delete')).toBe(false);
  });

  it('préserve le reste du frontmatter existant', async () => {
    const existant = {
      corrige: true,
      stale: true,
      derived_from: ['fiches/opco'],
      source_hashes: { 'fiches/opco': 'h-opco' },
    };
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { frontmatter: existant },
        error: null,
      }),
    });

    await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    const maj = opsDe(db, 'brain_notes', 'update')[0]!;
    expect(maj.values!.frontmatter).toEqual({ ...existant, archive: true });
    // Le corps n'est pas touché par un archivage.
    expect(maj.values).not.toHaveProperty('body');
  });

  it('marque la proposition approuvée en gardant le choix comme motif', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({ data: { frontmatter: {} }, error: null }),
    });

    await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    const decision = opsDe(db, 'brain_proposals', 'update')[0]!;
    expect(decision.values!.status).toBe('approuvee');
    expect(decision.values!.reason).toBe('archiver');
    expect(decision.values!.decided_by).toBe(USER_ID);
    // Transition conditionnelle : la mise à jour est bornée à `en_attente`.
    expect(decision.filters).toContainEqual({
      kind: 'eq',
      col: 'status',
      val: 'en_attente',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/cerveau');
  });

  it('note cible introuvable -> refus sans écriture', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({ data: null, error: null }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({ success: false, error: 'Note introuvable' });
    expect(ecritures(db)).toEqual([]);
    expect(db.deleteSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// arbitrateStaleAction — garder
// ---------------------------------------------------------------------------

describe('arbitrateStaleAction — garder', () => {
  const NOTE_STALE = {
    body: '> ⚠️ Réponse à revoir : une source a changé.\n\n# Titre\n\nCorps.',
    frontmatter: {
      stale: true,
      corrige: true,
      derived_from: ['fiches/opco', 'fiches/facturation'],
      // Les empreintes PÉRIMÉES : c'est d'elles que markStaleConversations a
      // déduit l'obsolescence.
      source_hashes: {
        'fiches/opco': 'h-vieux',
        'fiches/facturation': 'h-fact',
      },
    },
  };

  /** Note obsolète + sources dont on contrôle les empreintes courantes. */
  const routesGarder = (sources: unknown): Routes => ({
    'brain_proposals.select': () => ({
      data: obsolescenceProposal(),
      error: null,
    }),
    'brain_notes.select': (op) =>
      op.filters.some((f) => f.kind === 'in')
        ? { data: sources, error: null }
        : { data: NOTE_STALE, error: null },
  });

  it('retire la bannière ⚠️, pose stale=false et préserve le frontmatter', async () => {
    const db = useDb(
      routesGarder([
        { path: 'fiches/opco.md', source_hash: 'h-neuf' },
        { path: 'fiches/facturation.md', source_hash: 'h-fact' },
      ]),
    );

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    expect(res).toEqual({ success: true });
    const maj = opsDe(db, 'brain_notes', 'update')[0]!;
    expect(maj.values!.body).toBe('# Titre\n\nCorps.');
    const fm = maj.values!.frontmatter as Record<string, unknown>;
    expect(fm.stale).toBe(false);
    expect(fm.corrige).toBe(true);
    expect(fm.derived_from).toEqual(['fiches/opco', 'fiches/facturation']);
    expect(db.deleteSpy).not.toHaveBeenCalled();
  });

  it('rafraîchit source_hashes aux empreintes COURANTES des sources', async () => {
    // Le bug qu'on ne veut plus revoir : sans ce rafraîchissement, le prochain
    // markStaleConversations relit `h-vieux`, re-marque la note, et ne rouvre
    // AUCUNE proposition (son source_hash, calculé sur ces mêmes empreintes,
    // n'a pas changé → shouldPropose renvoie `skip`). La note sort
    // définitivement de la recherche.
    const db = useDb(
      routesGarder([
        { path: 'fiches/opco.md', source_hash: 'h-neuf' },
        { path: 'fiches/facturation.md', source_hash: 'h-fact' },
      ]),
    );

    await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    // La relecture interroge bien brain_notes sur les clés + « .md ».
    const lookup = opsDe(db, 'brain_notes', 'select').find((o) =>
      o.filters.some((f) => f.kind === 'in'),
    )!;
    expect(lookup.filters).toContainEqual({
      kind: 'in',
      col: 'path',
      val: ['fiches/opco.md', 'fiches/facturation.md'],
    });

    const fm = opsDe(db, 'brain_notes', 'update')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.source_hashes).toEqual({
      'fiches/opco': 'h-neuf',
      'fiches/facturation': 'h-fact',
    });
  });

  it('une source disparue perd sa clé (sinon la boucle se rouvre au run suivant)', async () => {
    // markStaleConversations compare à `currentHash.get(p)`, soit `undefined`
    // pour une note absente : conserver la clé à `null` la re-marquerait
    // aussitôt. La provenance reste tracée par derived_from.
    const db = useDb(
      routesGarder([{ path: 'fiches/opco.md', source_hash: 'h-neuf' }]),
    );

    await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    const fm = opsDe(db, 'brain_notes', 'update')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.source_hashes).toEqual({ 'fiches/opco': 'h-neuf' });
    expect(fm.derived_from).toEqual(['fiches/opco', 'fiches/facturation']);
  });

  it('une source sans empreinte garde sa clé à null (comparaison juste)', async () => {
    const db = useDb(
      routesGarder([
        { path: 'fiches/opco.md', source_hash: null },
        { path: 'fiches/facturation.md', source_hash: 'h-fact' },
      ]),
    );

    await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    const fm = opsDe(db, 'brain_notes', 'update')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.source_hashes).toEqual({
      'fiches/opco': null,
      'fiches/facturation': 'h-fact',
    });
  });

  it('note sans source_hashes : aucune requête in(), rien ne casse', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { body: '# Titre\n\nCorps.', frontmatter: { stale: true } },
        error: null,
      }),
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    expect(res).toEqual({ success: true });
    expect(
      opsDe(db, 'brain_notes', 'select').some((o) =>
        o.filters.some((f) => f.kind === 'in'),
      ),
    ).toBe(false);
    const fm = opsDe(db, 'brain_notes', 'update')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.source_hashes).toEqual({});
    expect(fm.stale).toBe(false);
  });

  it('relecture des sources en échec -> refus, la note n est pas touchée', async () => {
    // Dé-staler sur des empreintes qu'on n'a pas pu relire republierait la note
    // avec ses valeurs périmées : exactement le bug corrigé.
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
      'brain_notes.select': (op) =>
        op.filters.some((f) => f.kind === 'in')
          ? { data: null, error: { message: 'connection reset' } }
          : { data: NOTE_STALE, error: null },
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'garder',
    });

    expect(res).toEqual({ success: false, error: 'connection reset' });
    expect(ecritures(db)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5-6. Protection des réponses rédigées à la main
// ---------------------------------------------------------------------------

describe('approveProposalAction — protection des réponses humaines', () => {
  it('refuse d écraser une note corrige: true, sans upsert ni transition', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { frontmatter: { corrige: true } },
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/réponse rédigée par un administrateur/);
    expect(opsDe(db, 'brain_notes', 'upsert')).toEqual([]);
    // La proposition reste en_attente : l'admin peut encore la rejeter.
    expect(opsDe(db, 'brain_proposals', 'update')).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('publie quand la note existante n est pas corrige: true', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { frontmatter: { corrige: false, stale: true } },
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: true });
    const upsert = opsDe(db, 'brain_notes', 'upsert');
    expect(upsert).toHaveLength(1);
    expect(upsert[0]!.values!.path).toBe(NOTE_PATH);
    expect(upsert[0]!.values!.type).toBe('conversation');
    expect(opsDe(db, 'brain_proposals', 'update')[0]!.values!.status).toBe(
      'approuvee',
    );
  });

  it('publie quand aucune note n existe encore sur ce path', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
      'brain_notes.select': () => ({ data: null, error: null }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: true });
    expect(opsDe(db, 'brain_notes', 'upsert')).toHaveLength(1);
  });

  it('un corps édité vide ne republie pas le texte de l assistant', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      editedBody: '   \n  ',
    });

    expect(res.success).toBe(false);
    expect(ecritures(db)).toEqual([]);
  });

  it('un corps édité re-dérive links et source_hashes du texte publié', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
    });

    // L'admin retire le lien vers fiches/opco : la note publiée ne doit plus
    // le citer, sinon l'anti-obsolescence la marquerait pour une source
    // qu'elle ne référence plus.
    await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      editedBody: '# Titre\n\nRéponse relue par un humain.',
    });

    const upsert = opsDe(db, 'brain_notes', 'upsert')[0]!;
    expect(upsert.values!.links).toEqual([]);
    expect(upsert.values!.body).toBe('# Titre\n\nRéponse relue par un humain.');
    expect(
      (upsert.values!.frontmatter as Record<string, unknown>).source_hashes,
    ).toEqual({});
  });

  it('un upsert en échec laisse la proposition en_attente', async () => {
    // On écrit AVANT de marquer approuvée : si l'écriture rate, rien n'est perdu.
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
      'brain_notes.upsert': () => ({ error: { message: 'deadlock detected' } }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: false, error: 'deadlock detected' });
    expect(opsDe(db, 'brain_proposals', 'update')).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Protection des définitions d'entités curées à la main
// ---------------------------------------------------------------------------

describe('approveProposalAction — protection des entités curées', () => {
  // 23 des 31 entités en production portent `verified: true` + `sources` : des
  // définitions officielles rédigées à la main, avec leur URL de référence. Le
  // script les épargne déjà ; l'approbation n'avait aucun garde équivalent.
  it('refuse d écraser une entité verified: true, sans upsert ni transition', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({ data: entiteProposal(), error: null }),
      'brain_notes.select': () => ({
        data: {
          frontmatter: {
            verified: true,
            sources: ['https://www.francetravail.fr/employeur/afest.html'],
          },
        },
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/définition curée/);
    // Rien n'entre en base : ni le corps de Claude, ni la décision.
    expect(opsDe(db, 'brain_notes', 'upsert')).toEqual([]);
    expect(ecritures(db)).toEqual([]);
    expect(db.deleteSpy).not.toHaveBeenCalled();
    // La proposition reste en_attente : l'admin peut encore la rejeter.
    expect(opsDe(db, 'brain_proposals', 'update')).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('le garde lit bien la note EXISTANTE, pas le payload proposé', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({ data: entiteProposal(), error: null }),
      'brain_notes.select': () => ({
        data: { frontmatter: { verified: true } },
        error: null,
      }),
    });

    await approveProposalAction({ id: PROPOSAL_ID, sourceHash: HASH });

    const lecture = opsDe(db, 'brain_notes', 'select')[0]!;
    expect(lecture.filters).toEqual([
      { kind: 'eq', col: 'path', val: ENTITE_PATH },
    ]);
  });

  it('publie une définition sur une entité non curée', async () => {
    // Les 8 autres entités : notes-carrefour sans définition, rien à protéger.
    const db = useDb({
      'brain_proposals.select': () => ({ data: entiteProposal(), error: null }),
      'brain_notes.select': () => ({ data: { frontmatter: {} }, error: null }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: true });
    const upsert = opsDe(db, 'brain_notes', 'upsert');
    expect(upsert).toHaveLength(1);
    expect(upsert[0]!.values!.path).toBe(ENTITE_PATH);
    expect(upsert[0]!.values!.type).toBe('entite');
  });

  it('verified: false ou absent ne bloque pas', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({ data: entiteProposal(), error: null }),
      'brain_notes.select': () => ({
        data: { frontmatter: { verified: false, definition: 'ancienne' } },
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: true });
    expect(opsDe(db, 'brain_notes', 'upsert')).toHaveLength(1);
  });

  it('un corps édité par l admin, marqué verified, peut remplacer une entité curée', async () => {
    // Le garde bloque l'écrasement PAR une paraphrase de l'assistant, pas la
    // correction d'une définition curée par une autre — symétrique de `corrige`.
    const db = useDb({
      'brain_proposals.select': () => ({
        data: entiteProposal({
          payload: {
            ...entiteProposal().payload,
            frontmatter: { definition: 'Définition relue.', verified: true },
          },
        }),
        error: null,
      }),
      'brain_notes.select': () => ({
        data: { frontmatter: { verified: true } },
        error: null,
      }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: true });
    expect(opsDe(db, 'brain_notes', 'upsert')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7-8. Concurrence
// ---------------------------------------------------------------------------

describe('concurrence', () => {
  it('sourceHash périmé -> refus explicite, aucune écriture (approve)', async () => {
    // La ligne a été réécrite en place par le script depuis l'affichage : la
    // requête filtrée sur source_hash ne ramène rien.
    const db = useDb();

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: 'hash-perime',
    });

    expect(res).toEqual({ success: false, error: ERR_PERIMEE });
    expect(ecritures(db)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();

    // Le chargement est bien borné par les trois filtres.
    const lecture = opsDe(db, 'brain_proposals', 'select')[0]!;
    expect(lecture.filters).toEqual([
      { kind: 'eq', col: 'id', val: PROPOSAL_ID },
      { kind: 'eq', col: 'status', val: 'en_attente' },
      { kind: 'eq', col: 'source_hash', val: 'hash-perime' },
    ]);
  });

  it('sourceHash périmé -> refus pour resolveGap et arbitrateStale aussi', async () => {
    const db = useDb();

    const gap = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: 'hash-perime',
      answer: 'Réponse humaine.',
    });
    const stale = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: 'hash-perime',
      choix: 'archiver',
    });

    expect(gap).toEqual({ success: false, error: ERR_PERIMEE });
    expect(stale).toEqual({ success: false, error: ERR_PERIMEE });
    expect(ecritures(db)).toEqual([]);
    expect(db.deleteSpy).not.toHaveBeenCalled();
  });

  it('proposition déjà arbitrée -> même refus, aucune écriture', async () => {
    // Statut != en_attente : la requête de chargement, bornée à `en_attente`,
    // ne la voit pas.
    const db = useDb({
      'brain_proposals.select': (op) =>
        op.filters.some((f) => f.col === 'status' && f.val === 'en_attente')
          ? { data: null, error: { message: 'PGRST116: no rows returned' } }
          : {
              data: obsolescenceProposal({ status: 'approuvee' }),
              error: null,
            },
    });

    const res = await arbitrateStaleAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      choix: 'archiver',
    });

    expect(res).toEqual({ success: false, error: ERR_PERIMEE });
    expect(ecritures(db)).toEqual([]);
  });

  it('rejet d une proposition déjà traitée -> erreur, pas de faux succès', async () => {
    const db = useDb({
      'brain_proposals.update': () => ({ data: [], error: null }),
    });

    const res = await rejectProposalAction({
      id: PROPOSAL_ID,
      reason: 'hors sujet',
    });

    expect(res).toEqual({ success: false, error: ERR_DEJA_TRAITEE });
    expect(revalidatePath).not.toHaveBeenCalled();
    // Un rejet ne lit ni n'écrit jamais dans brain_notes.
    expect(db.ops.filter((o) => o.table === 'brain_notes')).toEqual([]);
  });

  it('rejet nominal : transition bornée à en_attente, motif conservé', async () => {
    const db = useDb();

    const res = await rejectProposalAction({
      id: PROPOSAL_ID,
      reason: 'hors sujet',
    });

    expect(res).toEqual({ success: true });
    const maj = opsDe(db, 'brain_proposals', 'update')[0]!;
    expect(maj.values!.status).toBe('rejetee');
    expect(maj.values!.reason).toBe('hors sujet');
    expect(maj.filters).toEqual([
      { kind: 'eq', col: 'id', val: PROPOSAL_ID },
      { kind: 'eq', col: 'status', val: 'en_attente' },
    ]);
  });

  it('approve : note écrite mais transition perdue -> erreur, pas de succès', async () => {
    const db = useDb({
      'brain_proposals.select': () => ({
        data: conversationProposal(),
        error: null,
      }),
      'brain_proposals.update': () => ({ data: [], error: null }),
    });

    const res = await approveProposalAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
    });

    expect(res).toEqual({ success: false, error: ERR_DEJA_TRAITEE });
    expect(revalidatePath).not.toHaveBeenCalled();
    // La note a bien été écrite avant la transition perdue : l'upsert est
    // idempotent (onConflict path), donc réessayer ne duplique rien.
    expect(opsDe(db, 'brain_notes', 'upsert')).toHaveLength(1);
    expect(opsDe(db, 'brain_notes', 'upsert')[0]!.values!.path).toBe(NOTE_PATH);
  });
});

// ---------------------------------------------------------------------------
// 10. resolveGapAction
// ---------------------------------------------------------------------------

describe('resolveGapAction', () => {
  const routesLacune = (sources: unknown, notes: unknown): Routes => ({
    'brain_proposals.select': () => ({ data: lacuneProposal(), error: null }),
    'process_qa_feedback.select': () => ({ data: { sources }, error: null }),
    'brain_notes.select': (op) =>
      op.filters.some((f) => f.kind === 'in')
        ? { data: notes, error: null }
        : { data: null, error: null },
  });

  it('écrit la réponse de l admin et résout source_hashes depuis le feedback', async () => {
    const db = useDb(
      routesLacune(
        [
          { source_fiche_id: 'f-1' },
          { source_fiche_id: 'f-2' },
          { titre: 'source sans id' },
        ],
        [
          { path: 'fiches/opco.md', source_ref: 'f-1', source_hash: 'h-opco' },
          {
            path: 'fiches/facturation.md',
            source_ref: 'f-2',
            source_hash: 'h-fact',
          },
        ],
      ),
    );

    const res = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: 'On facture via le portail OPCO, sous 30 jours.',
    });

    expect(res).toEqual({ success: true });

    // Les sources du 👎 sont résolues via process_qa_feedback puis brain_notes.
    const fb = opsDe(db, 'process_qa_feedback', 'select')[0]!;
    expect(fb.filters).toEqual([{ kind: 'eq', col: 'id', val: FEEDBACK_ID }]);
    const lookup = opsDe(db, 'brain_notes', 'select').find((o) =>
      o.filters.some((f) => f.kind === 'in'),
    )!;
    expect(lookup.filters).toContainEqual({
      kind: 'in',
      col: 'source_ref',
      val: ['f-1', 'f-2'],
    });

    const upsert = opsDe(db, 'brain_notes', 'upsert')[0]!;
    const fm = upsert.values!.frontmatter as Record<string, unknown>;
    // Sans ces hashes, la réponse humaine ne serait jamais revisitée par
    // l'anti-obsolescence.
    expect(fm.source_hashes).toEqual({
      'fiches/opco': 'h-opco',
      'fiches/facturation': 'h-fact',
    });
    expect(fm.derived_from).toEqual(['fiches/facturation', 'fiches/opco']);
    expect(fm.corrige).toBe(true);

    // La note est bien construite à partir de la réponse saisie, pas de la
    // mauvaise réponse d'origine.
    expect(upsert.values!.type).toBe('conversation');
    expect(upsert.values!.title).toBe('Comment facturer un OPCO ?');
    expect(String(upsert.values!.path)).toMatch(/^conversations\/.+\.md$/);
    expect(String(upsert.values!.body)).toContain(
      'On facture via le portail OPCO, sous 30 jours.',
    );
    expect(String(upsert.values!.body)).not.toContain(
      'Mauvaise réponse générée',
    );
    expect(upsert.values!.source_ref).toBe(FEEDBACK_ID);

    expect(opsDe(db, 'brain_proposals', 'update')[0]!.values!.status).toBe(
      'approuvee',
    );
  });

  it('sans source connue : note publiée avec source_hashes vide, aucune requête in()', async () => {
    const db = useDb(routesLacune([], []));

    const res = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: 'Réponse sans source.',
    });

    expect(res).toEqual({ success: true });
    expect(
      opsDe(db, 'brain_notes', 'select').some((o) =>
        o.filters.some((f) => f.kind === 'in'),
      ),
    ).toBe(false);
    const fm = opsDe(db, 'brain_notes', 'upsert')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.source_hashes).toEqual({});
    expect(fm.derived_from).toEqual([]);
  });

  it('une source sans hash est liée mais n entre pas dans source_hashes', async () => {
    const db = useDb(
      routesLacune(
        [{ source_fiche_id: 'f-1' }],
        [{ path: 'fiches/opco.md', source_ref: 'f-1', source_hash: null }],
      ),
    );

    await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: 'Réponse humaine.',
    });

    const fm = opsDe(db, 'brain_notes', 'upsert')[0]!.values!
      .frontmatter as Record<string, unknown>;
    expect(fm.derived_from).toEqual(['fiches/opco']);
    expect(fm.source_hashes).toEqual({});
  });

  it('une réponse humaine peut en remplacer une autre (corrige -> corrige)', async () => {
    // Le garde de upsertNote ne bloque que l'écrasement PAR une paraphrase :
    // un admin reste libre de corriger une correction.
    const db = useDb({
      ...routesLacune([], []),
      'brain_notes.select': (op) =>
        op.filters.some((f) => f.kind === 'in')
          ? { data: [], error: null }
          : { data: { frontmatter: { corrige: true } }, error: null },
    });

    const res = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: 'Nouvelle réponse humaine.',
    });

    expect(res).toEqual({ success: true });
    expect(opsDe(db, 'brain_notes', 'upsert')).toHaveLength(1);
  });

  it('une proposition qui n est pas une lacune n écrit aucune note', async () => {
    // resolveGapAction n'a pas de garde de `kind` explicite : elle ne doit sa
    // sûreté qu'au fait qu'un payload non-lacune n'a pas de `question`.
    const db = useDb({
      'brain_proposals.select': () => ({
        data: obsolescenceProposal(),
        error: null,
      }),
    });

    const res = await resolveGapAction({
      id: PROPOSAL_ID,
      sourceHash: HASH,
      answer: 'Réponse forgée.',
    });

    expect(res.success).toBe(false);
    expect(ecritures(db)).toEqual([]);
    expect(db.deleteSpy).not.toHaveBeenCalled();
  });
});
