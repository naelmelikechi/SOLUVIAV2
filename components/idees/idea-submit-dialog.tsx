'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
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
import { toast } from 'sonner';
import { Lightbulb } from 'lucide-react';
import { proposeIdea, updateProposedIdea } from '@/lib/actions/idees';
import { CIBLE_IDEE_LABELS, type CibleIdee } from '@/lib/utils/constants';

interface IdeaSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: {
    id: string;
    titre: string;
    description: string | null;
    cible: CibleIdee;
  };
}

export function IdeaSubmitDialog({
  open,
  onOpenChange,
  initial,
}: IdeaSubmitDialogProps) {
  const [titre, setTitre] = useState(initial?.titre ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cible, setCible] = useState<CibleIdee>(initial?.cible ?? 'soluvia');
  const [isPending, startTransition] = useTransition();

  const initialId = initial?.id ?? null;
  const initialTitre = initial?.titre ?? '';
  const initialDescription = initial?.description ?? '';
  const initialCible = initial?.cible ?? 'soluvia';
  useEffect(() => {
    setTitre(initialTitre);
    setDescription(initialDescription);
    setCible(initialCible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const handleSubmit = useCallback(
    function handleSubmit() {
      if (!titre.trim()) {
        toast.error('Le titre est requis');
        return;
      }
      startTransition(async () => {
        const result = initial
          ? await updateProposedIdea(initial.id, {
              titre,
              description,
              cible,
            })
          : await proposeIdea({ titre, description, cible });
        if (result.success) {
          toast.success(initial ? 'Idée mise à jour' : 'Idée proposée');
          onOpenChange(false);
          if (!initial) {
            setTitre('');
            setDescription('');
            setCible('soluvia');
          }
        } else {
          toast.error(result.error ?? 'Erreur');
        }
      });
    },
    [titre, description, cible, initial, onOpenChange],
  );

  useCmdEnter(handleSubmit, !isPending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="text-primary h-4 w-4" />
            {initial ? 'Modifier mon idée' : 'Proposer une idée'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="idea-titre">Titre</Label>
            <Input
              id="idea-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex: Ajouter un raccourci Cmd+K..."
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="idea-cible">Cible</Label>
            <Select
              value={cible}
              onValueChange={(v) => setCible((v ?? 'soluvia') as CibleIdee)}
            >
              <SelectTrigger className="w-full" id="idea-cible">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CIBLE_IDEE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="idea-description">Description</Label>
            <Textarea
              id="idea-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Décris le problème et ta proposition..."
            />
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
          <Button onClick={handleSubmit} disabled={isPending || !titre.trim()}>
            {isPending ? 'Envoi...' : initial ? 'Enregistrer' : 'Proposer'}
            {!isPending && <span className="ml-2 text-xs opacity-50">⌘↵</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
