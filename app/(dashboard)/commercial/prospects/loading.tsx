import { Skeleton } from '@/components/ui/skeleton';

export default function ProspectsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader avec bouton d'action */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      {/* Toggle + export */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Barre de recherche / filtres */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-64" />
      </div>
      {/* Squelette du tableau */}
      <div className="rounded-lg border">
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
