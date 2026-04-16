import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { getEquipeWithProjets } from '@/lib/queries/equipe';
import { getRecentTeamMessages } from '@/lib/queries/team-chat';
import { PageHeader } from '@/components/shared/page-header';
import { EquipeGrid } from '@/components/equipe/equipe-grid';
import { TeamChat } from '@/components/equipe/team-chat';

export const metadata: Metadata = { title: 'Équipe - SOLUVIA' };

export default async function EquipePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [members, messages] = await Promise.all([
    getEquipeWithProjets(),
    getRecentTeamMessages(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Équipe"
          description="Contacts internes et projets actifs sur lesquels chacun est assigné"
        />
        <EquipeGrid members={members} />
      </div>

      <TeamChat
        initialMessages={messages}
        currentUser={{
          id: user.id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          avatar_mode: user.avatar_mode as 'daily' | 'random' | 'frozen' | null,
          avatar_seed: user.avatar_seed,
          avatar_regen_date: user.avatar_regen_date,
        }}
      />
    </div>
  );
}
