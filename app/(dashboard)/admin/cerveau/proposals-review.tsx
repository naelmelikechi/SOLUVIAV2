'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import type { ProposalRow } from '@/lib/queries/brain-proposals';
import type { ProposalKind } from '@/lib/brain/proposal';
import {
  approveProposalAction,
  rejectProposalAction,
  resolveGapAction,
  arbitrateStaleAction,
} from '@/lib/actions/brain-proposals';

// Types fermés sur `ProposalKind` : un cinquième type de proposition oublié ici
// ne serait pas rendu du tout et resterait en attente indéfiniment. Le
// compilateur le signale maintenant.
const KIND_LABEL: Record<ProposalKind, string> = {
  conversation: 'Réponses validées 👍',
  lacune: 'Lacunes à combler 👎',
  entite: 'Entités & définitions',
  obsolescence: 'Notes obsolètes',
};
// Les lacunes d'abord : ce sont les questions restées sans réponse.
const ORDER: ProposalKind[] = [
  'lacune',
  'conversation',
  'entite',
  'obsolescence',
];

/**
 * Corps éditable d'une proposition (absent pour lacune / obsolescence).
 * `payload` est `jsonb not null` en base, mais `'null'::jsonb` reste possible :
 * sans le `?? {}`, une seule ligne malformée ferait tomber tout l'écran.
 */
function bodyOf(proposal: ProposalRow | null | undefined): string {
  const payload: Record<string, unknown> = proposal?.payload ?? {};
  const body = payload.body;
  return typeof body === 'string' ? body : '';
}

/** Libellé de liste : titre, sinon question, sinon le chemin de la note. */
function labelOf(proposal: ProposalRow): string {
  const payload: Record<string, unknown> = proposal.payload ?? {};
  const { title, question } = payload;
  if (typeof title === 'string' && title) return title;
  if (typeof question === 'string' && question) return question;
  return proposal.target_path ?? proposal.source_ref;
}

export function ProposalsReview({ proposals }: { proposals: ProposalRow[] }) {
  const { refresh } = useRouter();
  // On ne mémorise que l'identifiant : un instantané de la ligne resterait figé
  // après `refresh()` et l'admin approuverait un texte qui n'est plus celui qui
  // sera publié.
  const [selectedId, setSelectedId] = useState<string | null>(
    proposals[0]?.id ?? null,
  );
  // Le brouillon est initialisé avec le corps de la proposition sélectionnée
  // dès le premier rendu : l'affichage ne retombe jamais sur le corps d'origine
  // quand l'admin vide le champ (un corps vidé est un vrai vide, et le serveur
  // le refuse explicitement).
  const [draft, setDraft] = useState(() => bodyOf(proposals[0]));
  // Sélection demandée mais suspendue à une confirmation (brouillon non
  // enregistré).
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = proposals.find((p) => p.id === selectedId) ?? null;

  // Ordre réellement affiché : c'est lui qui définit « la proposition suivante ».
  const ordered = ORDER.flatMap((kind) =>
    proposals.filter((p) => p.kind === kind),
  );
  const currentIndex = ordered.findIndex((p) => p.id === selectedId);
  const nextProposal =
    currentIndex === -1
      ? null
      : (ordered[currentIndex + 1] ?? ordered[currentIndex - 1] ?? null);

  const isDirty = selected !== null && draft !== bodyOf(selected);

  const select = (proposal: ProposalRow | null) => {
    setSelectedId(proposal?.id ?? null);
    setDraft(bodyOf(proposal));
  };

  /** Changer de sélection efface le brouillon : on demande d'abord. */
  const askSelect = (proposal: ProposalRow) => {
    if (proposal.id === selectedId) return;
    if (isDirty) {
      setPendingSelectId(proposal.id);
      return;
    }
    select(proposal);
  };

  const run = (
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(ok);
        // Enchaîner sur la proposition suivante plutôt que de démonter le
        // panneau : c'est le comportement d'une file traitée dans l'ordre, et
        // le focus clavier ne retombe pas sur <body> à chaque validation.
        select(nextProposal);
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

  const payload: Record<string, unknown> = selected?.payload ?? {};
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
                        aria-current={selectedId === p.id}
                        onClick={() => askSelect(p)}
                        className={cn(
                          'hover:bg-muted w-full truncate rounded px-2 py-1 text-left text-sm',
                          selectedId === p.id && 'bg-muted font-medium',
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
                aria-label="Réponse à rédiger"
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
                        resolveGapAction({
                          id: selected.id,
                          sourceHash: selected.source_hash,
                          answer: draft,
                        }),
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
                aria-label="Corps de la note"
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
                          sourceHash: selected.source_hash,
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
                    variant={
                      choix === 'garder'
                        ? 'default'
                        : choix === 'archiver'
                          ? 'destructive'
                          : 'outline'
                    }
                    disabled={isPending}
                    onClick={() => {
                      // Archiver est la plus lourde des trois : elle passe par
                      // une confirmation, les deux autres non.
                      if (choix === 'archiver') {
                        setConfirmArchive(true);
                        return;
                      }
                      run(
                        () =>
                          arbitrateStaleAction({
                            id: selected.id,
                            sourceHash: selected.source_hash,
                            choix,
                          }),
                        choix === 'regenerer'
                          ? 'Sera régénérée au prochain brain:ingest'
                          : 'Arbitrage enregistré',
                      );
                    }}
                  >
                    {choix === 'garder'
                      ? 'Garder telle quelle'
                      : choix === 'archiver'
                        ? 'Archiver'
                        : 'Régénérer'}
                  </Button>
                ))}
              </div>
              <ConfirmDialog
                open={confirmArchive}
                onOpenChange={setConfirmArchive}
                title="Archiver cette note"
                description="La note sort de la recherche du cerveau : l'assistant ne s'en servira plus pour répondre. Elle reste enregistrée en base et peut être rétablie."
                confirmText="Archiver"
                variant="destructive"
                isPending={isPending}
                onConfirm={() => {
                  setConfirmArchive(false);
                  run(
                    () =>
                      arbitrateStaleAction({
                        id: selected.id,
                        sourceHash: selected.source_hash,
                        choix: 'archiver',
                      }),
                    'Arbitrage enregistré',
                  );
                }}
              />
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingSelectId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSelectId(null);
        }}
        title="Abandonner les modifications ?"
        description="Tu as des modifications non enregistrées sur cette proposition. Changer de sélection les abandonnera."
        confirmText="Abandonner"
        variant="destructive"
        onConfirm={() => {
          const target = proposals.find((p) => p.id === pendingSelectId);
          if (target) select(target);
          setPendingSelectId(null);
        }}
      />
    </div>
  );
}
