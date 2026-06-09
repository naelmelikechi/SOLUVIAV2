import { Skeleton } from '@/components/ui/skeleton';

export default function EquipeLoading() {
  return (
    <div className="space-y-8">
      <div>
        {/* PageHeader skeleton */}
        <div className="mb-6 space-y-1">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-96" />
        </div>
        {/* Filter pills */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
        {/* Members grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      {/* Team chat skeleton */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
