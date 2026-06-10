/**
 * Bootstrap e2e : cree (idempotent) le compte admin de test utilise par
 * e2e/auth.setup.ts, via l'API admin GoTrue + upsert du profil public.users.
 *
 * Il n'y a PAS de trigger handle_new_user dans ce schema : la creation auth
 * seule ne suffit pas, il faut aussi la ligne public.users (role admin).
 *
 * Usage (Supabase local demarre) :
 *   E2E_ADMIN_EMAIL=ci-admin@e2e.test E2E_ADMIN_PASSWORD=... \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/e2e-bootstrap.ts
 *
 * NE JAMAIS pointer vers la prod : garde-fou ci-dessous.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error(
    'Env manquant : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD.',
  );
  process.exit(1);
}

// Garde-fou : ce script cree un compte admin avec un mot de passe connu.
// Interdit hors instance locale (check sur le hostname exact, pas une
// substring - une URL distante contenant "localhost" en query ne passe pas).
const hostname = new URL(url).hostname;
if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
  console.error(`Refus : ${url} n'est pas une instance locale.`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Auth user (confirme, mot de passe connu). Idempotent : si l'email
  //    existe deja, on resynchronise juste le mot de passe.
  let userId: string;
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true,
    });

  if (createErr) {
    if (!/already.*(registered|exists)/i.test(createErr.message)) {
      throw createErr;
    }
    const { data: list, error: listErr } =
      await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email === email);
    if (!existing) throw new Error(`User ${email} introuvable apres conflit.`);
    userId = existing.id;
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      password: password!,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    console.log(`Auth user existant resynchronise : ${email}`);
  } else {
    userId = created.user!.id;
    console.log(`Auth user cree : ${email}`);
  }

  // 2. Profil applicatif (role admin, actif).
  const { error: upsertErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email: email!,
      nom: 'CI',
      prenom: 'E2E',
      role: 'admin',
      actif: true,
    },
    { onConflict: 'id' },
  );
  if (upsertErr) throw upsertErr;
  console.log(`Profil public.users admin OK (${userId}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
