import { createClient } from '@/lib/supabase/server';

export async function getBugReports() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .eq('archive', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
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
