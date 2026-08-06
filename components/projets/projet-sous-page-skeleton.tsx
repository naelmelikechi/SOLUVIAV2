import { Skeleton } from '@/components/ui/skeleton';

/**
 * Squelette commun aux sous-pages projet. L'en-tete et la sous-nav vivent dans
 * le layout : ils restent affiches pendant le chargement, le squelette ne
 * couvre donc que la zone de contenu.
 */
export function ProjetSousPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="rounded-lg border">
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
