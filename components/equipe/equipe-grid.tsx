import { Mail, Phone } from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ProjectRef } from '@/components/shared/project-ref';
import type { EquipeMember } from '@/lib/queries/equipe';

interface EquipeGridProps {
  members: EquipeMember[];
}

/**
 * Flat team roster - no hierarchy, no role badges. Shows contact info
 * (email, phone, avatar of the day) and the active projets the person is
 * currently assigned to (as principal CDP or backup CDP).
 */
export function EquipeGrid({ members }: EquipeGridProps) {
  if (members.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun collègue actif pour le moment.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => (
        <MemberCard key={m.id} member={m} />
      ))}
    </div>
  );
}

function MemberCard({ member }: { member: EquipeMember }) {
  const fullName = `${member.prenom} ${member.nom}`.trim();

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          email={member.email}
          avatarSeed={member.avatar_seed}
          avatarMode={member.avatar_mode}
          avatarRegenDate={member.avatar_regen_date}
          name={fullName}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate font-medium">{fullName}</p>
          <a
            href={`mailto:${member.email}`}
            className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 truncate text-xs transition-colors"
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{member.email}</span>
          </a>
          {member.telephone && (
            <a
              href={`tel:${member.telephone.replace(/\s+/g, '')}`}
              className="text-muted-foreground hover:text-foreground mt-0.5 inline-flex items-center gap-1 text-xs transition-colors"
            >
              <Phone className="h-3 w-3 shrink-0" />
              <span>{member.telephone}</span>
            </a>
          )}
        </div>
      </div>

      <div className="border-border border-t pt-3">
        {member.projets.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            Aucun projet assigné
          </p>
        ) : (
          <>
            <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
              {member.projets.length} projet
              {member.projets.length > 1 ? 's' : ''}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {member.projets.map((p) => (
                <li key={`${member.id}-${p.id}`} className="flex items-center">
                  {p.ref ? (
                    <ProjectRef
                      ref_={p.ref}
                      className={
                        p.role === 'backup'
                          ? 'ring-dashed opacity-70 ring-1 ring-[var(--primary-bg)]'
                          : undefined
                      }
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {p.client ?? '-'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {member.projets.some((p) => p.role === 'backup') && (
              <p className="text-muted-foreground mt-2 text-[11px] italic">
                Les réfs en pointillés = backup CDP.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
