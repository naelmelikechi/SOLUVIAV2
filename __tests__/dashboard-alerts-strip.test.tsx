// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AlertsStrip, type Alert } from '@/components/dashboard/alerts-strip';

afterEach(cleanup);

describe('AlertsStrip', () => {
  it('rend chaque alerte avec son compteur et son label', () => {
    const alerts: Alert[] = [
      { count: 2, title: 'Factures en retard', href: '/facturation', color: 'red' },
      { count: 3, title: 'Echeances pretes', href: '/facturation', color: 'blue' },
    ];
    render(<AlertsStrip alerts={alerts} />);
    expect(screen.getByText('Factures en retard')).toBeDefined();
    expect(screen.getByText('Echeances pretes')).toBeDefined();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it("affiche l'etat 'tout est sous controle' quand vide", () => {
    render(<AlertsStrip alerts={[]} />);
    expect(screen.getByText(/sous controle/i)).toBeDefined();
  });

  it('chaque alerte affiche son count', () => {
    const alerts: Alert[] = [
      { count: 7, title: 'Test', href: '/x', color: 'orange' },
    ];
    render(<AlertsStrip alerts={alerts} />);
    expect(screen.getByText('7')).toBeDefined();
  });

  it('affiche le bouton × en editMode', () => {
    const onHide = vi.fn();
    render(<AlertsStrip alerts={[]} editMode onHide={onHide} />);
    fireEvent.click(screen.getByLabelText(/masquer les alertes/i));
    expect(onHide).toHaveBeenCalledOnce();
  });
});
