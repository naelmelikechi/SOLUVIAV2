/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const createDevisMock = vi.fn(async () => ({
  success: true as const,
  id: 'devis-id',
}));
vi.mock('@/lib/actions/devis', () => ({
  createDevis: (...a: unknown[]) =>
    createDevisMock(...(a as Parameters<typeof createDevisMock>)),
  cancelDevis: vi.fn(async () => ({ success: true as const })),
  sendDevis: vi.fn(async () => ({
    success: true as const,
    ref: 'DEV-SOL-0001',
  })),
  addLigne: vi.fn(async () => ({ success: true as const, id: 'l1' })),
  updateLigne: vi.fn(async () => ({ success: true as const })),
  deleteLigne: vi.fn(async () => ({ success: true as const })),
}));

import { NewDevisDialog } from '@/components/devis/new-devis-dialog';

const clients = [{ id: 'c1', trigramme: 'DUP', raison_sociale: 'Dupont SA' }];
const societes = [
  {
    id: 'sol-id',
    code: 'SOL',
    raison_sociale: 'SOLUVIA SAS',
    est_defaut: true,
  },
];

afterEach(() => cleanup());
beforeEach(() => createDevisMock.mockClear());

describe('NewDevisDialog', () => {
  it('renders the trigger button', () => {
    render(<NewDevisDialog societes={societes} clients={clients} />);
    expect(screen.getByText(/Nouveau devis/i)).toBeInTheDocument();
  });

  it('button is clickable (not disabled)', () => {
    render(<NewDevisDialog societes={societes} clients={clients} />);
    const btn = screen.getByText(/Nouveau devis/i).closest('button');
    expect(btn).not.toBeNull();
    expect(btn?.disabled).not.toBe(true);
  });
});
