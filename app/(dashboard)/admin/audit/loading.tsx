import { Skeleton } from '@/components/ui/skeleton';

export default function AuditLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-4 h-5 w-44" />
      {/* PageHeader skeleton */}
      <div className="mb-6 space-y-1">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Audit log rows */}
      <div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 border-b py-3 last:border-b-0"
          >
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
