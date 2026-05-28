import Link from 'next/link';
import { MousePointer } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function ProjetEcheancierManualPlaceholder() {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <MousePointer className="size-4 text-orange-600" />
        <h3 className="text-sm font-semibold">Échéancier de facturation</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        Ce projet est en facturation manuelle. Allez dans Facturation, onglet
        Manuel, pour facturer les engagements ou règlements OPCO.
      </p>
      <div className="mt-3">
        <Link
          href="/facturation?tab=manuel"
          className="text-primary text-xs font-medium underline-offset-2 hover:underline"
        >
          Ouvrir l&apos;onglet Manuel
        </Link>
      </div>
    </Card>
  );
}
