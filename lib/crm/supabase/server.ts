import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/lib/crm/database.types';

// Client Supabase serveur scopé au schéma `crm` (RLS active, session utilisateur
// via cookies). Miroir de `lib/supabase/server.ts` mais borné au schéma isolé du
// CRM. Un nouveau client par passe de rendu / Server Action.
export async function createCrmClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, 'crm'>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: 'crm' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : ignorable si le middleware
            // rafraîchit les sessions.
          }
        },
      },
    },
  );
}
