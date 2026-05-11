import { createClient } from '@/lib/supabase/server';

export type BugFilter = 'open' | 'closed' | 'all';

const OPEN_STATUSES = ['nouveau', 'en_cours'] as const;
const CLOSED_STATUSES = ['resolu', 'wontfix'] as const;

export async function getBugReports(filter: BugFilter = 'open') {
  const supabase = await createClient();
  let query = supabase
    .from('bug_reports')
    .select('*')
    .eq('archive', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter === 'open') {
    query = query.in('status', OPEN_STATUSES as unknown as string[]);
  } else if (filter === 'closed') {
    query = query.in('status', CLOSED_STATUSES as unknown as string[]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBugReportCounts(): Promise<{
  open: number;
  closed: number;
  all: number;
}> {
  const supabase = await createClient();
  const [openRes, closedRes, allRes] = await Promise.all([
    supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('archive', false)
      .in('status', OPEN_STATUSES as unknown as string[]),
    supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('archive', false)
      .in('status', CLOSED_STATUSES as unknown as string[]),
    supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('archive', false),
  ]);

  return {
    open: openRes.count ?? 0,
    closed: closedRes.count ?? 0,
    all: allRes.count ?? 0,
  };
}

export async function getBugReportByRef(ref: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .eq('ref', ref)
    .single();
  if (error) return null;
  return data;
}

export type BugReportRow = Awaited<ReturnType<typeof getBugReports>>[number];
