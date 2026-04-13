import { Skeleton } from '@/components/ui/skeleton';

export default function QualiteLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader skeleton */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-64" />
      </div>
      {/* Table skeleton */}
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
