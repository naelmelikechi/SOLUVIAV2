// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DataTableColumnHeader } from '@/components/shared/data-table/data-table-column-header';

function mockColumn(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getCanSort: () => true,
    getIsSorted: () => false,
    toggleSorting: vi.fn(),
    getCanFilter: () => true,
    getFilterValue: () => undefined,
    setFilterValue: vi.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

afterEach(() => cleanup());

describe('DataTableColumnHeader', () => {
  it('rend la loupe quand filterVariant="text"', () => {
    render(
      <DataTableColumnHeader
        column={mockColumn()}
        title="Client"
        filterVariant="text"
      />,
    );
    expect(screen.getByLabelText('Filtrer par Client')).toBeInTheDocument();
  });

  it('ne rend PAS la loupe quand filterVariant absent (retrocompat)', () => {
    render(<DataTableColumnHeader column={mockColumn()} title="Client" />);
    expect(screen.queryByLabelText('Filtrer par Client')).toBeNull();
  });

  it('clic loupe ouvre un input de recherche', () => {
    render(
      <DataTableColumnHeader
        column={mockColumn()}
        title="Client"
        filterVariant="text"
      />,
    );
    fireEvent.click(screen.getByLabelText('Filtrer par Client'));
    expect(
      screen.getByPlaceholderText(/Rechercher Client/i),
    ).toBeInTheDocument();
  });

  it('saisie debounce appelle setFilterValue apres 200ms', async () => {
    const setFilterValue = vi.fn();
    render(
      <DataTableColumnHeader
        column={mockColumn({ setFilterValue })}
        title="Client"
        filterVariant="text"
      />,
    );
    fireEvent.click(screen.getByLabelText('Filtrer par Client'));
    const input = screen.getByPlaceholderText(/Rechercher Client/i);
    fireEvent.change(input, { target: { value: 'acme' } });

    expect(setFilterValue).not.toHaveBeenCalled();
    await waitFor(() => expect(setFilterValue).toHaveBeenCalledWith('acme'), {
      timeout: 500,
    });
  });

  it('indicateur visuel actif quand getFilterValue retourne valeur', () => {
    render(
      <DataTableColumnHeader
        column={mockColumn({ getFilterValue: () => 'acme' })}
        title="Client"
        filterVariant="text"
      />,
    );
    expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument();
  });
});
