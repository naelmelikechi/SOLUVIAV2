// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ContextChips } from '@/components/dashboard/context-chips';

afterEach(cleanup);

describe('ContextChips', () => {
  it('rend les 3 chips quand toutes valeurs sont > 0', () => {
    render(<ContextChips enRetard={4200} aFacturer={7800} weekHours={18} />);
    expect(screen.getByText(/En retard/)).toBeDefined();
    expect(screen.getByText(/À facturer/)).toBeDefined();
    expect(screen.getByText(/Ta semaine/)).toBeDefined();
  });

  it('omet "En retard" si 0', () => {
    render(<ContextChips enRetard={0} aFacturer={7800} weekHours={18} />);
    expect(screen.queryByText(/En retard/)).toBeNull();
  });

  it('omet "À facturer" si 0', () => {
    render(<ContextChips enRetard={4200} aFacturer={0} weekHours={18} />);
    expect(screen.queryByText(/À facturer/)).toBeNull();
  });

  it('rend toujours "Ta semaine"', () => {
    render(<ContextChips enRetard={0} aFacturer={0} weekHours={0} />);
    expect(screen.getByText(/Ta semaine/)).toBeDefined();
    expect(screen.getByText(/0h\s*\/\s*35h/)).toBeDefined();
  });
});
