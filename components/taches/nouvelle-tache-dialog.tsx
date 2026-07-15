'use client';

import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ListTodo } from 'lucide-react';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createPlaneTask } from '@/lib/actions/plane';
import type { PlaneMember, PlaneProjectSummary } from '@/lib/plane/queries';

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'Aucune',
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  urgent: 'Urgente',
};

// Sentinelle pour « personne » dans le select assigné (Select base-ui
// n'accepte pas de value vide).
const UNASSIGNED = 'unassigned';

// Création d'une tâche poussée vers Plane via l'API : projet Plane, titre,
// description, priorité, échéance, assigné (moi par défaut).
export function NouvelleTacheDialog({
  open,
  onOpenChange,
  projects,
  members,
  currentMemberId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: PlaneProjectSummary[];
  members: PlaneMember[];
  currentMemberId: string | null;
  onCreated: () => void;
}) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [targetDate, setTargetDate] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>(
    currentMemberId ?? UNASSIGNED,
  );
  const [isPending, startTransition] = useTransition();

  const projectLabel = (id: string | null) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.identifier} · ${p.name}` : 'Sélectionner';
  };
  const memberLabel = (id: string | null) => {
    if (!id || id === UNASSIGNED) return 'Personne';
    const m = members.find((x) => x.id === id);
    if (!m) return 'Sélectionner';
    return m.id === currentMemberId ? `${m.displayName} (moi)` : m.displayName;
  };

  const handleSubmit = useCallback(
    function handleSubmit() {
      if (!projectId) {
        toast.error('Choisis un projet Plane');
        return;
      }
      if (!name.trim()) {
        toast.error('Le titre est requis');
        return;
      }
      startTransition(async () => {
        const res = await createPlaneTask({
          projectId,
          name: name.trim(),
          description: description.trim() || undefined,
          priority,
          targetDate: targetDate || null,
          assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
        });
        if (res.success) {
          toast.success('Tâche créée dans Plane');
          onOpenChange(false);
          setName('');
          setDescription('');
          setPriority('none');
          setTargetDate('');
          setAssigneeId(currentMemberId ?? UNASSIGNED);
          onCreated();
        } else {
          toast.error(res.error ?? 'Échec de la création dans Plane');
        }
      });
    },
    [
      projectId,
      name,
      description,
      priority,
      targetDate,
      assigneeId,
      currentMemberId,
      onOpenChange,
      onCreated,
    ],
  );

  useCmdEnter(handleSubmit, open && !isPending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="text-primary h-4 w-4" />
            Nouvelle tâche Plane
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tache-projet">Projet Plane</Label>
            <Select
              value={projectId}
              onValueChange={(v) => setProjectId(v ?? '')}
            >
              <SelectTrigger className="w-full" id="tache-projet">
                <SelectValue>{(v) => projectLabel(v as string)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono">{p.identifier}</span> · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tache-titre">Titre</Label>
            <Input
              id="tache-titre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Relancer l'OPCO sur le dossier..."
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tache-description">Description (optionnel)</Label>
            <Textarea
              id="tache-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Contexte, liens, détails..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tache-priorite">Priorité</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority((v ?? 'none') as Priority)}
              >
                <SelectTrigger className="w-full" id="tache-priorite">
                  <SelectValue>
                    {(v) => PRIORITY_LABELS[(v as Priority) ?? 'none']}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(PRIORITY_LABELS) as [Priority, string][]
                  ).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tache-echeance">Échéance (optionnel)</Label>
              <Input
                id="tache-echeance"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tache-assigne">Assigné à</Label>
            <Select
              value={assigneeId}
              onValueChange={(v) => setAssigneeId(v ?? UNASSIGNED)}
            >
              <SelectTrigger className="w-full" id="tache-assigne">
                <SelectValue>{(v) => memberLabel(v as string)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Personne</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id === currentMemberId
                      ? `${m.displayName} (moi)`
                      : m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || !projectId}
          >
            {isPending ? 'Création...' : 'Créer dans Plane'}
            {!isPending && <span className="ml-2 text-xs opacity-50">⌘↵</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
