'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ExternalLink } from 'lucide-react';
import type { MentionOption } from '@/components/crm/shared/mention-textarea';
import {
  OppDetailBody,
  type OppDetail,
  type OppContact,
} from './opp-detail-body';
import type { Etape } from './types';

export type { OppDetail, OppContact };

/**
 * Coup d'oeil rapide sur une opportunité depuis le kanban/tableau (doctrine
 * disclosure : sheet = aperçu + actions, pas de tabs). La fiche complète
 * (activités, relances, RDV, négociation) vit sur /crm/pipeline/[id].
 */
export function OppDrawer({
  opp,
  etapes,
  mentionOptions = [],
  canNote = true,
}: {
  opp: OppDetail;
  etapes: Etape[];
  mentionOptions?: MentionOption[];
  canNote?: boolean;
}) {
  const router = useRouter();
  const close = () => router.push('/crm/pipeline');
  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold tracking-tight">
            {opp.intitule}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Détail de l&apos;opportunité.
          </SheetDescription>
          <Link
            href={`/crm/pipeline/${opp.id}`}
            className="text-primary inline-flex w-fit items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Ouvrir la fiche complète
          </Link>
        </SheetHeader>
        <div className="px-4 pb-6">
          <OppDetailBody
            opp={opp}
            etapes={etapes}
            mentionOptions={mentionOptions}
            canNote={canNote}
            compact
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
