import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/crm/database.types';
import { actorName, excerpt } from './notify';

// Stub minimal : supabase.schema(...).from(...).select(...).eq(...).maybeSingle() -> { data }
// SOLUVIA : l'identité vit dans public.users (prenom + nom), pas dans profiles.nom_complet.
function stubSupabase(
  userRow: { prenom: string | null; nom: string | null } | null,
): SupabaseClient<Database, 'crm'> {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: userRow }),
  };
  return { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient<
    Database,
    'crm'
  >;
}

describe('actorName', () => {
  it("renvoie 'Quelqu'un' sans utilisateur", async () => {
    const sb = stubSupabase(null);
    expect(await actorName(sb, null)).toBe("Quelqu'un");
  });

  it("préfère le nom complet (prenom + nom) de l'utilisateur", async () => {
    const sb = stubSupabase({ prenom: 'Alice', nom: 'Martin' });
    expect(await actorName(sb, { id: 'u1', email: 'a@x.fr' })).toBe(
      'Alice Martin',
    );
  });

  it("retombe sur l'email si le nom est vide", async () => {
    const sb = stubSupabase({ prenom: null, nom: null });
    expect(await actorName(sb, { id: 'u1', email: 'a@x.fr' })).toBe('a@x.fr');
  });

  it("retombe sur 'Quelqu'un' si ni nom ni email", async () => {
    const sb = stubSupabase({ prenom: null, nom: null });
    expect(await actorName(sb, { id: 'u1', email: null })).toBe("Quelqu'un");
  });

  it("ne révèle JAMAIS le nom d'un compte fantôme (nom générique, sans lookup)", async () => {
    vi.stubEnv('HIDDEN_USER_EMAILS', 'fantome@exemple.fr');
    // Le stub renverrait le vrai nom si le lookup avait lieu : il ne doit pas.
    const sb = stubSupabase({ prenom: 'Nael', nom: 'Melikechi' });
    expect(await actorName(sb, { id: 'u1', email: 'fantome@exemple.fr' })).toBe(
      'Un collègue',
    );
    vi.unstubAllEnvs();
  });
});

describe('excerpt', () => {
  it('normalise les espaces et laisse court intact', () => {
    expect(excerpt('  a   b ')).toBe('a b');
  });
  it('tronque avec une ellipse au-delà de la limite', () => {
    const out = excerpt('x'.repeat(200), 10);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(11);
  });
});
