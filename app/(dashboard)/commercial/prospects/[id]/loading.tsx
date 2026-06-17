import { Skeleton } from '@/components/ui/skeleton';

export default function ProspectFicheLoading() {
  return (
    <div>
      {/* Back-link */}
      <Skeleton className="mb-4 h-5 w-20" />
      {/* Header */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Tabs bar */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      {/* Panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}
