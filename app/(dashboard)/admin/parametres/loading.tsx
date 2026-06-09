import { Skeleton } from '@/components/ui/skeleton';

export default function ParametresLoading() {
  return (
    <div>
      {/* PageHeader with action */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      {/* Form sections */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-md border p-4">
            <Skeleton className="h-5 w-48" />
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ))}
        {/* Societes emettrices link card */}
        <div className="space-y-2 rounded-md border p-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
    </div>
  );
}
