// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';

afterEach(cleanup);

describe('MiniKpiCard', () => {
  it('rend label, value, subtitle', () => {
    render(
      <MiniKpiCard label="Projets actifs" value="6" subtitle="en cours" />,
    );
    expect(screen.getByText('Projets actifs')).toBeDefined();
    expect(screen.getByText('6')).toBeDefined();
    expect(screen.getByText('en cours')).toBeDefined();
  });

  it('rend un Link quand href est fourni', () => {
    render(<MiniKpiCard label="X" value="1" href="/projets" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/projets');
  });

  it("n'est pas un lien quand href absent", () => {
    render(<MiniKpiCard label="X" value="1" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('affiche le bouton de hide en editMode', () => {
    const onHide = vi.fn();
    render(<MiniKpiCard label="X" value="1" editMode onHide={onHide} />);
    fireEvent.click(screen.getByLabelText(/masquer/i));
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("editMode desactive la navigation (pas de Link)", () => {
    render(
      <MiniKpiCard
        label="X"
        value="1"
        href="/x"
        editMode
        onHide={() => {}}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
