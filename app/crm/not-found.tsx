import Link from 'next/link';
import { buttonVariants } from '@/components/crm/ui/button';
import { cn } from '@/lib/crm/utils';

// 404 thémée pour les routes /crm (ex. compte/opportunité introuvable).
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">Erreur 404</p>
        <h2 className="text-lg font-semibold tracking-tight">Introuvable</h2>
        <p className="text-muted-foreground text-sm">
          Cet élément n&apos;existe pas ou a été supprimé.
        </p>
      </div>
      <Link
        href="/crm/dashboard"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        Retour au dashboard
      </Link>
    </div>
  );
}
