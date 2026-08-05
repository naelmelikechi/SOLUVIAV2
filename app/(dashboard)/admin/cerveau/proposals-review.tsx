'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProposalRow } from '@/lib/queries/brain-proposals';
import {
  approveProposalAction,
  rejectProposalAction,
  resolveGapAction,
  arbitrateStaleAction,
} from '@/lib/actions/brain-proposals';

const KIND_LABEL: Record<string, string> = {
  conversation: 'Réponses validées 👍',
  lacune: 'Lacunes à combler 👎',
  entite: 'Entités & définitions',
  obsolescence: 'Notes obsolètes',
};
// Les lacunes d'abord : ce sont les questions restées sans réponse.
const ORDER = ['lacune', 'conversation', 'entite', 'obsolescence'];

/** Corps éditable d'une proposition (absent pour lacune / obsolescence). */
function bodyOf(proposal: ProposalRow | null | undefined): string {
  const body = proposal?.payload.body;
  return typeof body === 'string' ? body : '';
}

/** Libellé de liste : titre, sinon question, sinon le chemin de la note. */
function labelOf(proposal: ProposalRow): string {
  const { title, question } = proposal.payload;
  if (typeof title === 'string' && title) return title;
  if (typeof question === 'string' && question) return question;
  return proposal.target_path ?? proposal.source_ref;
}

export function ProposalsReview({ proposals }: { proposals: ProposalRow[] }) {
  const { refresh } = useRouter();
  const [selected, setSelected] = useState<ProposalRow | null>(
    proposals[0] ?? null,
  );
  // Le brouillon est initialisé avec le corps de la proposition sélectionnée
  // dès le premier rendu : l'affichage ne retombe jamais sur le corps d'origine
  // quand l'admin vide le champ (un corps vidé est un vrai vide, et le serveur
  // le refuse explicitement).
  const [draft, setDraft] = useState(() => bodyOf(proposals[0]));
  const [isPending, startTransition] = useTransition();

  const run = (
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(ok);
        setSelected(null);
        setDraft('');
        refresh();
      } else {
        toast.error(res.error ?? 'Échec');
      }
    });

  if (!proposals.length) {
    return (
      <p className="text-muted-foreground">
        Rien à valider. Le cerveau proposera de nouvelles notes au prochain
        <code className="mx-1">npm run brain:ingest</code>.
      </p>
    );
  }

  const payload = selected?.payload ?? {};
  const noteBody = bodyOf(selected);

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <div className="space-y-6">
        {ORDER.filter((k) => proposals.some((p) => p.kind === k)).map(
          (kind) => (
            <section key={kind}>
              <h2 className="mb-2 text-sm font-semibold">
                {KIND_LABEL[kind]}{' '}
                <Badge variant="secondary">
                  {proposals.filter((p) => p.kind === kind).length}
                </Badge>
              </h2>
              <ul className="space-y-1">
                {proposals
                  .filter((p) => p.kind === kind)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(p);
                          setDraft(bodyOf(p));
                        }}
                        className={cn(
                          'hover:bg-muted w-full truncate rounded px-2 py-1 text-left text-sm',
                          selected?.id === p.id && 'bg-muted font-medium',
                        )}
                      >
                        {labelOf(p)}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ),
        )}
      </div>

      {selected && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">
            {selected.target_path ?? selected.source_ref}
          </div>

          {selected.kind === 'lacune' && (
            <>
              <h3 className="font-semibold">
                {String(payload.question ?? '')}
              </h3>
              <p className="bg-muted text-muted-foreground rounded p-3 text-sm">
                Réponse jugée insuffisante : {String(payload.answer_ko ?? '')}
              </p>
              <Textarea
                rows={10}
                placeholder="Écris la bonne réponse — elle deviendra une note du cerveau."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={isPending || !draft.trim()}
                  onClick={() =>
                    run(
                      () =>
                        resolveGapAction({ id: selected.id, answer: draft }),
                      'Lacune comblée',
                    )
                  }
                >
                  Enregistrer la réponse
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => rejectProposalAction({ id: selected.id }),
                      'Lacune écartée',
                    )
                  }
                >
                  Écarter
                </Button>
              </div>
            </>
          )}

          {(selected.kind === 'conversation' || selected.kind === 'entite') && (
            <>
              <h3 className="font-semibold">{String(payload.title ?? '')}</h3>
              <Textarea
                rows={16}
                className="font-mono text-xs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () =>
                        approveProposalAction({
                          id: selected.id,
                          editedBody: draft !== noteBody ? draft : undefined,
                        }),
                      'Note ajoutée au cerveau',
                    )
                  }
                >
                  Approuver
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => rejectProposalAction({ id: selected.id }),
                      'Proposition rejetée',
                    )
                  }
                >
                  Rejeter
                </Button>
              </div>
            </>
          )}

          {selected.kind === 'obsolescence' && (
            <>
              <h3 className="font-semibold">{selected.target_path}</h3>
              <p className="text-muted-foreground text-sm">
                Une source de cette note a changé. Que faire ?
              </p>
              <div className="flex gap-2">
                {(['garder', 'archiver', 'regenerer'] as const).map((choix) => (
                  <Button
                    key={choix}
                    variant={choix === 'garder' ? 'default' : 'outline'}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => arbitrateStaleAction({ id: selected.id, choix }),
                        choix === 'regenerer'
                          ? 'Sera régénérée au prochain brain:ingest'
                          : 'Arbitrage enregistré',
                      )
                    }
                  >
                    {choix === 'garder'
                      ? 'Garder telle quelle'
                      : choix === 'archiver'
                        ? 'Archiver'
                        : 'Régénérer'}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
