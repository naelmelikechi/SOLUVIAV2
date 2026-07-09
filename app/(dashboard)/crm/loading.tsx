// État de chargement par défaut des routes /crm. Évite l'écran figé pendant
// le fetch des Server Components (U-C3).
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement…">
      <div className="bg-secondary h-6 w-40 animate-pulse rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-secondary/40 h-24 animate-pulse rounded-xl border"
          />
        ))}
      </div>
      <div className="border-border space-y-2 rounded-xl border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-secondary/40 h-8 animate-pulse rounded-md"
          />
        ))}
      </div>
    </div>
  );
}
