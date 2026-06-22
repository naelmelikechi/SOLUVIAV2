'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Receipt } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';
import { cn } from '@/lib/utils';
import type { AccueilCdpData, WorklistColor } from '@/lib/queries/accueil';

const DOT_COLOR: Record<WorklistColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
};

export function AccueilCdp({
  prenom,
  data,
}: {
  prenom: string;
  data: AccueilCdpData;
}) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );
  const { items, aFacturerPreview, totalActions } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bonjour {prenom || ''} 👋</h1>
        <p className="text-muted-foreground text-sm">
          {totalActions > 0
            ? `${totalActions} action${totalActions > 1 ? 's' : ''} à traiter`
            : 'Tout est à jour ✅'}
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <p className="text-sm">
            Rien à traiter pour le moment. Beau travail !
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.key} href={item.href} className="block">
              <Card className="hover:bg-muted/50 flex items-center justify-between p-4 transition-colors">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      DOT_COLOR[item.color],
                    )}
                  />
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums">
                        {item.count}
                      </span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {aFacturerPreview.length > 0 && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <h3 className="text-sm font-semibold">
                Contrats à facturer — les plus en retard
              </h3>
            </div>
            <Link
              href="/a-facturer"
              className="text-primary text-xs hover:underline"
            >
              Voir tout →
            </Link>
          </div>
          <ul className="divide-y">
            {aFacturerPreview.map((c) => (
              <li key={c.contratId}>
                <button
                  type="button"
                  onClick={() => setSelectedContratId(c.contratId)}
                  className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {c.apprenti || c.contractNumber || c.ref}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {c.projetRef} · {c.opco}
                    </span>
                  </div>
                  <StatusBadge
                    label={
                      c.retardJours === 0
                        ? 'aujourd’hui'
                        : `retard ${c.retardJours} j`
                    }
                    color={c.retardJours === 0 ? 'orange' : 'red'}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </div>
  );
}
