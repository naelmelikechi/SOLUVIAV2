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
        La facturation de ce projet (commission SOLUVIA) est gérée depuis
        l&apos;espace Facturation.
      </p>
      <div className="mt-3">
        <Link
          href="/facturation"
          className="text-primary text-xs font-medium underline-offset-2 hover:underline"
        >
          Ouvrir Facturation
        </Link>
      </div>
    </Card>
  );
}
