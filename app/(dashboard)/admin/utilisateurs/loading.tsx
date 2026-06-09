import { Skeleton } from '@/components/ui/skeleton';

export default function UtilisateursLoading() {
  return (
    <div>
      {/* PageHeader with action button */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-2">
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
