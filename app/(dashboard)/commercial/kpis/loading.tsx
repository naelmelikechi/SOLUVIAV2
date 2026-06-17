import { Skeleton } from '@/components/ui/skeleton';

export default function CommercialKpisLoading() {
  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      {/* Volume tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>
      {/* Tunnel table */}
      <div className="space-y-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
