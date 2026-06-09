import { Skeleton } from '@/components/ui/skeleton';

export default function ParametresCompteLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-4 h-5 w-20" />
      {/* PageHeader skeleton */}
      <div className="mb-6 space-y-1">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Settings cards */}
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Avatar card */}
        <div className="space-y-4 rounded-lg border p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="flex justify-center">
            <Skeleton className="size-32 rounded-2xl" />
          </div>
        </div>
        {/* Form cards */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-lg border p-6">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
