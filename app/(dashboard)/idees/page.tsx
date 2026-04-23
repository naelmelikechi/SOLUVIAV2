import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getIdeesGroupedByStatut } from '@/lib/queries/idees';
import { canValidateIdeas, canShipIdeas, isAdmin } from '@/lib/utils/roles';
import { IdeasBoard } from '@/components/idees/ideas-board';

export const metadata: Metadata = {
  title: 'Idées - SOLUVIA',
};

export default async function IdeesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, can_validate_ideas, can_ship_ideas')
    .eq('id', user.id)
    .single();

  const grouped = await getIdeesGroupedByStatut();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Boîte à idées</h1>
        <p className="text-muted-foreground text-sm">
          Propose une amélioration pour Eduvia, Soluvia ou un workflow —
          l&apos;équipe la revoit et la livre si elle est pertinente.
        </p>
      </div>
      <IdeasBoard
        initialGrouped={grouped}
        currentUserId={user.id}
        isAdmin={isAdmin(currentUser?.role)}
        canValidate={canValidateIdeas(currentUser?.role)}
        canShip={canShipIdeas(currentUser?.role, currentUser?.can_ship_ideas)}
      />
    </div>
  );
}
