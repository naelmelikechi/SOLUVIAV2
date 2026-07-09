import Link from 'next/link';
import { Info } from 'lucide-react';

// Hint compact (plus une pleine Card) : la facturation du projet vit dans
// l'espace Facturation, cette ligne ne fait que le rappeler.
export function ProjetEcheancierManualPlaceholder() {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Info className="size-3.5 shrink-0" />
      <span>
        La facturation de ce projet (commission SOLUVIA) est gérée depuis{' '}
        <Link
          href="/facturation"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          l&apos;espace Facturation
        </Link>
        .
      </span>
    </p>
  );
}
