'use client';

import { useState, useTransition } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateLong } from '@/lib/utils/formatters';
import { toast } from 'sonner';
import { addProspectNote } from '@/lib/actions/prospects';
import { isAdmin, getRoleLabel } from '@/lib/utils/roles';
import type { ProspectNote } from '@/lib/queries/prospects';

interface ProspectNotesSectionProps {
  prospectId: string;
  notes: ProspectNote[];
}

export function ProspectNotesSection({
  prospectId,
  notes,
}: ProspectNotesSectionProps) {
  const [contenu, setContenu] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!contenu.trim()) {
      toast.error('Le contenu de la note est requis');
      return;
    }

    startTransition(async () => {
      const result = await addProspectNote(prospectId, contenu);
      if (result.success) {
        toast.success('Note ajoutée');
        setContenu('');
      } else {
        toast.error(result.error ?? "Erreur lors de l'ajout");
      }
    });
  }

  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" /> Historique / Notes
      </h4>

      <div className="mb-4">
        <Textarea
          placeholder="Ajouter une note..."
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || !contenu.trim()}
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            {isPending ? 'Envoi...' : 'Ajouter la note'}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune note</p>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="border-primary/30 border-l-2 pl-4">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span>{formatDateLong(note.created_at)}</span>
                <span>{'—'}</span>
                <span className="font-medium">
                  {note.user?.prenom} {note.user?.nom}
                </span>
                {note.user?.role && (
                  <StatusBadge
                    label={getRoleLabel(note.user.role)}
                    color={isAdmin(note.user.role) ? 'purple' : 'blue'}
                  />
                )}
              </div>
              <p className="mt-1 text-sm">{note.contenu}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
