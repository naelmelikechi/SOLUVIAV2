import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMissions, listAllProcess } from '@/lib/process/browse';
import { stripMarkdown } from '@/lib/process/format';
import { ProcessHub } from '@/components/process/process-hub';

export const metadata: Metadata = {
  title: 'Process · SOLUVIA',
};

const SUB_MAX_LEN = 120;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

export default async function ProcessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [missions, all] = await Promise.all([
    listMissions(admin),
    listAllProcess(admin),
  ]);

  const cleanedAll = all.map((item) => ({
    ...item,
    sub: truncate(stripMarkdown(item.sub), SUB_MAX_LEN),
  }));

  return <ProcessHub missions={missions} all={cleanedAll} />;
}
