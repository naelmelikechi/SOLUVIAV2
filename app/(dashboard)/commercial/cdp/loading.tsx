import { Skeleton } from '@/components/ui/skeleton';

export default function CdpLoading() {
  return (
    <div className="space-y-6">
      {/* Titre de page */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Tableau plan de charge */}
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      {/* Panneau d'arbitrage */}
      <div className="space-y-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
