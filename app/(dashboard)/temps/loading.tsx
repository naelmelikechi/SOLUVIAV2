import { Skeleton } from '@/components/ui/skeleton';

export default function TempsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader skeleton */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-9" />
      </div>
      {/* Time grid skeleton — 7 columns */}
      <div className="rounded-lg border">
        <div className="space-y-3 p-4">
          {/* Day headers */}
          <div className="grid grid-cols-8 gap-2">
            <Skeleton className="h-6 w-full" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-8 gap-2">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
