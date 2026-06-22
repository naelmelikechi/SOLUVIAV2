import { Skeleton } from '@/components/ui/skeleton';

export default function TempsEquipeLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="rounded-lg border">
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
