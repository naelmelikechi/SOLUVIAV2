export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="bg-muted/40 h-8 w-64 animate-pulse rounded" />
      <div className="bg-muted/40 h-10 w-80 animate-pulse rounded" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted/40 h-20 animate-pulse rounded-lg"
          />
        ))}
      </div>
      <div className="bg-muted/40 h-64 animate-pulse rounded-lg" />
    </div>
  );
}
