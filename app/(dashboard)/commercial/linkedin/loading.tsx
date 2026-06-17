import { Skeleton } from '@/components/ui/skeleton';

export default function LinkedinLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Règles d'affectation */}
      <div className="rounded-lg border p-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      {/* Liste d'évènements */}
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <div className="rounded-lg border">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
