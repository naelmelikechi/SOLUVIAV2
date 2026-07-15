'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { togglePlaneTask } from '@/lib/actions/plane';
import { formatDateParis } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { PlaneTask } from '@/lib/plane/queries';

// Mes tâches transverses (Plane) sur l'accueil : cocher ici = passer l'issue
// en Done dans Plane (décochable tant que la carte est affichée). Optimiste,
// rollback si l'API échoue.
export function PlaneTasksCard({ tasks }: { tasks: PlaneTask[] }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  if (tasks.length === 0) return null;
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

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-border flex items-baseline justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="size-4" />
          Mes tâches (Plane)
        </h2>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {openCount} ouverte{openCount > 1 ? 's' : ''}
          </span>
          <Link
            href="/taches"
            className="text-primary font-medium hover:underline"
          >
            Voir tout
          </Link>
        </span>
      </div>
      <ul className="divide-border divide-y">
        {tasks.map((task) => {
          const done = doneIds.has(task.id);
          const overdue =
            !done && task.targetDate !== null && task.targetDate < today;
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
                        overdue && 'font-medium text-red-600 dark:text-red-400',
                      )}
                    >
                      {' '}
                      · échéance {formatDateParis(task.targetDate)}
                    </span>
                  )}
                </p>
              </div>
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
  );
}
