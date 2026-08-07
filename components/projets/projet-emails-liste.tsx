'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTimeParis } from '@/lib/utils/formatters';
import type { ProjetEmail } from '@/lib/queries/emails-projet';

const VISIBLE_COUNT = 5;

const SOURCE_LABEL: Record<string, string> = {
  app: 'Envoye par l application',
  gmail: 'Echange direct',
};

const SOURCE_DOT: Record<string, string> = {
  app: 'bg-blue-500',
  gmail: 'bg-purple-500',
};

/**
 * Liste sobre des derniers mails d'un projet (bloc Suivi de la synthese).
 * Densite volontairement limitee : 5 lignes visibles, le reste replie
 * derriere "voir plus" -- le bloc Suivi est en bas de la synthese, il ne
 * doit pas la faire doubler de longueur.
 */
export function ProjetEmailsListe({ emails }: { emails: ProjetEmail[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4" /> Mails
      </h3>
      {emails.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun mail enregistré. Le journal démarre à la mise en service.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {(expanded ? emails : emails.slice(0, VISIBLE_COUNT)).map(
              (email) => (
                <li key={email.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      SOURCE_DOT[email.source] ?? 'bg-gray-400',
                    )}
                    title={SOURCE_LABEL[email.source] ?? email.source}
                  />
                  <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                    {formatDateTimeParis(email.envoye_le)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {email.sujet}
                  </span>
                  <span className="text-muted-foreground w-40 shrink-0 truncate text-right text-xs">
                    {email.destinataires[0] ?? '-'}
                  </span>
                </li>
              ),
            )}
          </ul>
          {emails.length > VISIBLE_COUNT && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Réduire'
                : `Voir ${emails.length - VISIBLE_COUNT} de plus`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
