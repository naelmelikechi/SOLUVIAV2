import { Skeleton } from '@/components/ui/skeleton';

export default function FactureDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-4 h-5 w-44" />
      {/* Facture header */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Emetteur / Destinataire */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      {/* Lignes table */}
      <div className="mb-6 rounded-lg border">
        <div className="border-b px-5 py-3">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      {/* Totaux */}
      <div className="mb-6 ml-auto w-full max-w-xs space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
      {/* Paiements */}
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
