// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PeriodSelector } from '@/components/dashboard/period-selector';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(''),
}));

afterEach(() => cleanup());

describe('PeriodSelector', () => {
  it('affiche le label fourni', () => {
    render(<PeriodSelector current="ce_mois" label="Mai 2026" />);
    expect(screen.getByText('Mai 2026')).toBeDefined();
  });

  it("ouvre la liste au clic et affiche les 3 options", () => {
    render(<PeriodSelector current="ce_mois" label="Mai 2026" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Ce mois')).toBeDefined();
    expect(screen.getByText('Mois precedent')).toBeDefined();
    expect(screen.getByText('30 derniers jours')).toBeDefined();
  });

  it('navigue sans le param quand on selectionne ce_mois', () => {
    pushMock.mockClear();
    render(<PeriodSelector current="mois_precedent" label="Avril 2026" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Ce mois'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('navigue avec ?periode=mois_precedent quand selectionne', () => {
    pushMock.mockClear();
    render(<PeriodSelector current="ce_mois" label="Mai 2026" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Mois precedent'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard?periode=mois_precedent');
  });
});
