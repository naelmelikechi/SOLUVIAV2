'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { searchProcess } from '@/lib/process/search';
import type { ProcessSearchResult } from '@/lib/process/types';

/**
 * Recherche de process pour un collaborateur authentifié.
 */
export async function searchProcessAction(
  query: string,
): Promise<ProcessSearchResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (!query.trim()) return [];
  return searchProcess(query, { admin: createAdminClient() });
}
