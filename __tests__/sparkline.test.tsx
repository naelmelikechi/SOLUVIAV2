// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Mock kpi-history to avoid pulling in supabase/server env validation
vi.mock('@/lib/queries/kpi-history', () => ({
  getSparklineData: vi.fn().mockResolvedValue([]),
  getLatestKpiValue: vi.fn().mockResolvedValue(null),
}));

import { SparklineSvg } from '@/components/shared/sparkline';

afterEach(cleanup);

describe('SparklineSvg', () => {
  it('rend un SVG avec polyline pour >= 2 points', () => {
    const { container } = render(
      <SparklineSvg
        points={[
          { mois: '2026-01-01', valeur: 5 },
          { mois: '2026-02-01', valeur: 10 },
          { mois: '2026-03-01', valeur: 8 },
        ]}
        width={100}
        height={30}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('polyline')).toBeTruthy();
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('affiche -- si < 2 points', () => {
    const { getByText, container } = render(
      <SparklineSvg points={[{ mois: '2026-01-01', valeur: 5 }]} />,
    );
    expect(getByText('--')).toBeTruthy();
    expect(container.querySelector('svg')).toBeFalsy();
  });

  it('rend -- si 0 points', () => {
    const { getByText } = render(<SparklineSvg points={[]} />);
    expect(getByText('--')).toBeTruthy();
  });

  it('utilise la couleur fournie', () => {
    const { container } = render(
      <SparklineSvg
        points={[
          { mois: '2026-01-01', valeur: 5 },
          { mois: '2026-02-01', valeur: 10 },
        ]}
        color="red"
      />,
    );
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('stroke')).toMatch(/red|#ef4444/);
  });
});
