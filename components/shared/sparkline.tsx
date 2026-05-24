import {
  getSparklineData,
  type Scope,
  type SparklinePoint,
} from '@/lib/queries/kpi-history';

type Color = 'green' | 'red' | 'blue' | 'neutral';

const COLOR_MAP: Record<Color, string> = {
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  neutral: '#6b7280',
};

interface SvgProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  color?: Color;
}

/**
 * Composant pur : rend juste le SVG. Testable sans Supabase.
 */
export function SparklineSvg({
  points,
  width = 100,
  height = 30,
  color = 'blue',
}: SvgProps) {
  if (points.length < 2) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums">--</span>
    );
  }

  const values = points.map((p) => p.valeur);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.valeur - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const last = points[points.length - 1]!;
  const lastX = width;
  const lastY = height - ((last.valeur - min) / range) * height;
  const stroke = COLOR_MAP[color];

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      aria-label="Sparkline 12 mois"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}

interface ServerProps {
  kpiType: string;
  scope: Scope;
  scopeId?: string | null;
  width?: number;
  height?: number;
  color?: Color;
}

/**
 * Composant Server : fetch les snapshots puis delegue a SparklineSvg.
 */
export async function Sparkline({
  kpiType,
  scope,
  scopeId = null,
  width,
  height,
  color,
}: ServerProps) {
  const points = await getSparklineData({
    kpiType,
    scope,
    scopeId,
    monthsBack: 12,
  });
  return (
    <SparklineSvg points={points} width={width} height={height} color={color} />
  );
}
