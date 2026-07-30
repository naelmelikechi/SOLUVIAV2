export function ProcessProgress({
  total,
  realise,
  valideCdp,
  valide,
}: {
  total: number;
  realise: number;
  valideCdp: number;
  valide: number;
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
      <div
        className="absolute inset-y-0 left-0 bg-orange-600 dark:bg-orange-400"
        style={{ width: `${pct(realise)}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-[var(--purple)]"
        style={{ width: `${pct(valideCdp)}%` }}
      />
      <div
        className="bg-primary absolute inset-y-0 left-0"
        style={{ width: `${pct(valide)}%` }}
      />
    </div>
  );
}
