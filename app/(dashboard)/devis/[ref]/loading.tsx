import { Skeleton } from '@/components/ui/skeleton';

export default function DevisDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header with actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      {/* Lignes */}
      <div className="space-y-3 rounded-md border p-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      {/* Totaux */}
      <div className="rounded-md border p-4">
        <div className="ml-auto flex w-full max-w-xs flex-col items-end gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-56" />
        </div>
      </div>
    </div>
  );
}
