import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProcessSearch } from '@/components/process/process-search';

export const metadata: Metadata = {
  title: 'Recherche process - SOLUVIA',
};

export default async function ProcessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Recherche de process</h1>
        <p className="text-muted-foreground text-sm">
          Pose une question : les process finalisés les plus pertinents
          remontent en premier.
        </p>
      </div>
      <ProcessSearch />
    </div>
  );
}
