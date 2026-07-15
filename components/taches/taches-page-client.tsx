'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ListTodo, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { togglePlaneTask } from '@/lib/actions/plane';
import { formatDateParis } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type {
  PlaneMember,
  PlaneProjectSummary,
  PlaneTask,
} from '@/lib/plane/queries';
import { PageHeader } from '@/components/shared/page-header';
import { NouvelleTacheDialog } from '@/components/taches/nouvelle-tache-dialog';

// Libellés et styles des priorités Plane (urgent/high/medium/low).
const PRIORITY_META: Record<string, { label: string; className: string }> = {
  urgent: {
    label: 'Urgente',
    className:
      'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-transparent',
  },
  high: {
    label: 'Haute',
    className:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-transparent',
  },
  medium: {
    label: 'Moyenne',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-transparent',
  },
  low: {
    label: 'Basse',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
};

// Page Tâches : mes issues Plane ouvertes, groupées par projet Plane,
// cochables (même mécanique optimiste que la carte de l'accueil) + création
// d'issues poussées vers Plane.
export function TachesPageClient({
  tasks,
  projects,
  members,
  currentMemberId,
}: {
  tasks: PlaneTask[];
  projects: PlaneProjectSummary[];
  members: PlaneMember[];
  currentMemberId: string | null;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const openCount = tasks.length - doneIds.size;
  const today = new Date().toISOString().slice(0, 10);

  const toggle = (task: PlaneTask, done: boolean) => {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (done) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    start(async () => {
      const res = await togglePlaneTask({
        projectId: task.projectId,
        issueId: task.id,
        done,
      });
      if (!res.success) {
        // Rollback optimiste
        setDoneIds((prev) => {
          const next = new Set(prev);
          if (done) next.delete(task.id);
          else next.add(task.id);
          return next;
        });
        toast.error(res.error ?? 'Échec de la mise à jour dans Plane');
      }
    });
  };

  // Groupement par projet Plane, ordre alphabétique des identifiants ;
  // au sein d'un groupe l'ordre serveur (échéance croissante) est conservé.
  const groups = new Map<string, PlaneTask[]>();
  for (const task of tasks) {
    const list = groups.get(task.projectIdentifier) ?? [];
    list.push(task);
    groups.set(task.projectIdentifier, list);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div>
      <PageHeader
        title="Tâches"
        description={
          tasks.length > 0
            ? `${openCount} tâche${openCount > 1 ? 's' : ''} ouverte${openCount > 1 ? 's' : ''} · synchronisé avec Plane`
            : 'Tâches transverses synchronisées avec Plane.'
        }
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Nouvelle tâche
        </Button>
      </PageHeader>

      {tasks.length === 0 ? (
        <Card className="items-center gap-2 py-12 text-center">
          <ListTodo className="text-muted-foreground size-8" />
          <p className="text-sm font-medium">Aucune tâche ouverte</p>
          <p className="text-muted-foreground text-sm">
            Les tâches Plane qui te sont assignées apparaîtront ici.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([identifier, groupTasks]) => (
            <Card key={identifier} className="gap-0 overflow-hidden p-0">
              <div className="border-border flex items-baseline justify-between border-b px-4 py-2.5">
                <h2 className="font-mono text-sm font-semibold">
                  {identifier}
                </h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {groupTasks.filter((t) => !doneIds.has(t.id)).length} ouverte
                  {groupTasks.filter((t) => !doneIds.has(t.id)).length > 1
                    ? 's'
                    : ''}
                </span>
              </div>
              <ul className="divide-border divide-y">
                {groupTasks.map((task) => {
                  const done = doneIds.has(task.id);
                  const overdue =
                    !done &&
                    task.targetDate !== null &&
                    task.targetDate < today;
                  const priority = task.priority
                    ? PRIORITY_META[task.priority]
                    : null;
                  return (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Checkbox
                        checked={done}
                        onCheckedChange={(v) => toggle(task, v === true)}
                        aria-label={`Marquer « ${task.name} » comme ${done ? 'à faire' : 'faite'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm leading-tight font-medium',
                            done && 'text-muted-foreground line-through',
                          )}
                        >
                          {task.name}
                        </p>
                        <p className="text-muted-foreground text-xs leading-tight">
                          <span className="font-mono">{task.ref}</span>
                          {task.targetDate && (
                            <span
                              className={cn(
                                overdue &&
                                  'font-medium text-red-600 dark:text-red-400',
                              )}
                            >
                              {' '}
                              · échéance {formatDateParis(task.targetDate)}
                            </span>
                          )}
                        </p>
                      </div>
                      {priority && !done && (
                        <Badge className={cn('shrink-0', priority.className)}>
                          {priority.label}
                        </Badge>
                      )}
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ouvrir ${task.ref} dans Plane`}
                        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <NouvelleTacheDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projects}
        members={members}
        currentMemberId={currentMemberId}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
