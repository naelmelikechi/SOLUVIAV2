import { Skeleton } from '@/components/ui/skeleton';

export default function QualiopiLoading() {
  return (
    <div>
      {/* PageHeader skeleton */}
      <div className="mb-6 space-y-1">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Section title */}
      <Skeleton className="mb-3 h-4 w-40" />
      {/* Client cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
