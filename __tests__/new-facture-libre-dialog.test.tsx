/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const createFreeBrouillonMock = vi.fn(async () => ({
  success: true as const,
  ref: 'FAC-AAA-0001',
}));
vi.mock('@/lib/actions/factures', () => ({
  createFreeBrouillon: (...args: unknown[]) =>
    createFreeBrouillonMock(
      ...(args as Parameters<typeof createFreeBrouillonMock>),
    ),
}));

import { NewFactureLibreDialog } from '@/components/facturation/new-facture-libre-dialog';

afterEach(() => cleanup());

beforeEach(() => {
  createFreeBrouillonMock.mockClear();
});

describe('NewFactureLibreDialog', () => {
  const clients = [
    { id: 'c1', trigramme: 'DUP', raison_sociale: 'Dupont SARL' },
  ];
  const societesMulti = [
    {
      id: 'sol-id',
      code: 'SOL',
      raison_sociale: 'S.A.S. SOLUVIA',
      est_defaut: true,
    },
    {
      id: 'dig-id',
      code: 'DIG',
      raison_sociale: 'DIGIVIA',
      est_defaut: false,
    },
  ];
  const societesSingle = [societesMulti[0]!];

  it('affiche un selecteur quand >1 societe', () => {
    render(
      <NewFactureLibreDialog
        open
        onOpenChange={() => {}}
        clients={clients}
        societes={societesMulti}
      />,
    );
    // selecteur affiche les 2 options
    expect(screen.getByLabelText(/société émettrice/i)).toBeInTheDocument();
  });

  it('affiche un libelle quand exactement 1 societe', () => {
    render(
      <NewFactureLibreDialog
        open
        onOpenChange={() => {}}
        clients={clients}
        societes={societesSingle}
      />,
    );
    expect(
      screen.queryByLabelText(/société émettrice/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/S\.A\.S\. SOLUVIA/)).toBeInTheDocument();
  });

  it('submit envoie societeEmettriceId au server action', async () => {
    render(
      <NewFactureLibreDialog
        open
        onOpenChange={() => {}}
        clients={clients}
        societes={societesMulti}
      />,
    );
    fireEvent.click(screen.getAllByText('Dupont SARL')[0]!);
    fireEvent.change(
      screen.getAllByPlaceholderText(/Description ligne 1/)[0]!,
      {
        target: { value: 'Audit' },
      },
    );
    fireEvent.change(screen.getAllByPlaceholderText(/Montant HT/)[0]!, {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByRole('button', { name: /brouillon/i }));
    await new Promise((r) => setTimeout(r, 0));

    expect(createFreeBrouillonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'c1',
        societeEmettriceId: 'sol-id',
        lignes: [{ description: 'Audit', montantHt: 500 }],
      }),
    );
  });
});
