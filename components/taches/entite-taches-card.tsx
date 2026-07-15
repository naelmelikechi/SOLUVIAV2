'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ListTodo, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setClientPlaneProject, togglePlaneTask } from '@/lib/actions/plane';
import { formatDateParis } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type {
  PlaneMember,
  PlaneProjectSummary,
  PlaneTask,
} from '@/lib/plane/queries';
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

// Sentinelle « aucun projet lié » (Select base-ui n'accepte pas de value vide).
const UNLINKED = 'unlinked';

// Carte Tâches (Plane) d'un client SOLUVIA (affichée sur la fiche client et
// les pages projet du client). Liste TOUTES les issues ouvertes du projet
// Plane lié via clients.plane_project_id - tous assignés confondus - avec la
// même mécanique optimiste cocher/décocher que l'accueil. Le lien vers le
// projet Plane se choisit ici même (admins uniquement).
export function EntiteTachesCard({
  clientId,
  planeProjectId,
  tasks,
  planeProjects,
  members,
  currentMemberId,
  canEdit,
}: {
  clientId: string;
  planeProjectId: string | null;
  tasks: PlaneTask[];
  planeProjects: PlaneProjectSummary[];
  members: PlaneMember[];
  currentMemberId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const [isLinking, startLinking] = useTransition();

  const linkedProject =
    planeProjects.find((p) => p.id === planeProjectId) ?? null;
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

  const linkProject = (value: string | null) => {
    const next = value === UNLINKED || !value ? null : value;
    if (next === planeProjectId) return;
    startLinking(async () => {
      const res = await setClientPlaneProject({
        clientId,
        planeProjectId: next,
      });
      if (res.success) {
        toast.success(next ? 'Projet Plane associé' : 'Projet Plane dissocié');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Échec de la mise à jour');
      }
    });
  };

  const projectLabel = (id: string | null) => {
    if (!id || id === UNLINKED) return 'Aucun projet Plane';
    const p = planeProjects.find((x) => x.id === id);
    return p ? `${p.identifier} · ${p.name}` : 'Sélectionner';
  };

  const selector = canEdit && (
    <Select
      value={planeProjectId ?? UNLINKED}
      onValueChange={(v) => linkProject(v as string | null)}
      disabled={isLinking}
    >
      <SelectTrigger
        className="h-7 max-w-56 text-xs"
        aria-label="Projet Plane lié"
      >
        <SelectValue>{(v) => projectLabel(v as string)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNLINKED}>Aucun projet Plane</SelectItem>
        {planeProjects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="font-mono">{p.identifier}</span> · {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="size-4" />
          Tâches (Plane)
          {linkedProject && (
            <span className="text-muted-foreground text-xs font-normal tabular-nums">
              {openCount} ouverte{openCount > 1 ? 's' : ''}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {selector}
          {linkedProject && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              Nouvelle tâche
            </Button>
          )}
        </div>
      </div>

      {!linkedProject ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">
          {canEdit
            ? 'Aucun projet Plane associé à ce client. Choisis-en un ci-dessus pour afficher ses tâches.'
            : 'Aucun projet Plane associé à ce client.'}
        </p>
      ) : tasks.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">
          Aucune tâche ouverte dans{' '}
          <span className="font-mono">{linkedProject.identifier}</span>.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {tasks.map((task) => {
            const done = doneIds.has(task.id);
            const overdue =
              !done && task.targetDate !== null && task.targetDate < today;
            const priority = task.priority
              ? PRIORITY_META[task.priority]
              : null;
            return (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
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
      )}

      {linkedProject && (
        <NouvelleTacheDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projects={[linkedProject]}
          members={members}
          currentMemberId={currentMemberId}
          onCreated={() => router.refresh()}
        />
      )}
    </Card>
  );
}
