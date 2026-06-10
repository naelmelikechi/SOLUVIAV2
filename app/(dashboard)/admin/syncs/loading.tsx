import { Skeleton } from '@/components/ui/skeleton';

export default function SyncsLoading() {
  return (
    <div>
      {/* PageHeader */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      <div className="space-y-8">
        {/* Cards Eduvia par client */}
        <div>
          <Skeleton className="mb-3 h-6 w-44" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        </div>

        {/* Card Odoo */}
        <div>
          <Skeleton className="mb-3 h-6 w-20" />
          <div className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>

        {/* Table derniers runs */}
        <div>
          <Skeleton className="mb-3 h-6 w-48" />
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="rounded-lg border">
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
