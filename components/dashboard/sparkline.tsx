/**
 * Mini graphique en aire pour KPI cards (12 points typiques).
 * Pas de dependance externe : SVG pur, leger.
 *
 * - Auto-scale sur min/max
 * - Le dernier point (mois en cours) est mis en surbrillance via un cercle
 * - Couleur paramétrable (matche celle de la KPI card)
 */
interface SparklineProps {
  values: number[];
  color: string; // hex (ex '#10b981') ou var css
  /** Hauteur en px, default 32 */
  height?: number;
  /** Largeur en px, default 96 */
  width?: number;
  /** Inverse la metrique : pour 'En retard', valeur basse = bon (vert), valeur haute = mauvais (rouge). Affecte juste le tooltip. */
  isNegativeMetric?: boolean;
}

export function Sparkline({
  values,
  color,
  height = 32,
  width = 96,
}: SparklineProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  // 4px de padding vertical pour ne pas couper le cercle final
  const paddingY = 4;
  const usableHeight = height - paddingY * 2;
  const stepX = width / Math.max(1, values.length - 1);

  const points = values.map((v, i) => ({
    x: i * stepX,
    y: paddingY + usableHeight - ((v - min) / range) * usableHeight,
  }));

  const lastPoint = points[points.length - 1]!;

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const areaPath = `${linePath} L ${lastPoint.x} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Évolution sur 12 mois"
      className="overflow-visible"
    >
      <path d={areaPath} fill={color} fillOpacity={0.15} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={color} />
    </svg>
  );
}
