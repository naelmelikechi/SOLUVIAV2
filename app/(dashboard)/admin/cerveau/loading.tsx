import { Skeleton } from '@/components/ui/skeleton';

export default function CerveauLoading() {
  return (
    <div>
      {/* PageHeader */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      {/* Deux colonnes : liste des propositions / detail */}
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="space-y-2">
              <Skeleton className="h-5 w-48" />
              {Array.from({ length: 3 }).map((_, row) => (
                <Skeleton key={row} className="h-7 w-full" />
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-6 w-80" />
          <Skeleton className="h-64 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
