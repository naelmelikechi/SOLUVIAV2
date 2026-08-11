// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { formatCurrency } from '@/lib/utils/formatters';

interface Ligne {
  ref: string;
  montant: number | null;
  progression: number;
}

const DATA: Ligne[] = [
  { ref: 'A-1', montant: 100, progression: 20 },
  { ref: 'A-2', montant: 50.5, progression: 40 },
  { ref: 'A-3', montant: null, progression: 60 },
];

const COLUMNS: ColumnDef<Ligne>[] = [
  { accessorKey: 'ref', header: 'Réf' },
  {
    accessorKey: 'montant',
    header: 'Montant',
    meta: {
      label: 'Montant',
      aggregate: 'sum',
      aggregateFormat: formatCurrency,
    },
  },
  {
    accessorKey: 'progression',
    header: 'Progression',
    meta: {
      label: 'Progression',
      aggregate: 'avg',
      aggregateFormat: (v) => `${Math.round(v)} %`,
    },
  },
];

afterEach(() => cleanup());

describe('DataTableAggregateBar (via DataTable)', () => {
  it('affiche somme et moyenne des lignes filtrées, en ignorant les null', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    const bar = screen.getByLabelText('Agrégats des colonnes numériques');
    expect(bar).toHaveTextContent('3 lignes');
    // 100 + 50.5 (le null est ignoré)
    expect(bar.textContent!.replace(/[\s  ]/g, ' ')).toContain('Montant :');
    expect(bar.textContent!.replace(/[\s  ]/g, '')).toContain('150,5€');
    // Moyenne (20+40+60)/3 = 40
    expect(bar).toHaveTextContent('Moy. Progression : 40 %');
  });

  it("n'affiche rien quand aucune colonne ne déclare d'agrégat", () => {
    render(
      <DataTable
        columns={[{ accessorKey: 'ref', header: 'Réf' }] as ColumnDef<Ligne>[]}
        data={DATA}
      />,
    );
    expect(
      screen.queryByLabelText('Agrégats des colonnes numériques'),
    ).not.toBeInTheDocument();
  });

  it('restreint les agrégats aux lignes filtrées par la recherche', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    fireEvent.change(screen.getByLabelText('Rechercher...'), {
      target: { value: 'A-1' },
    });
    const bar = screen.getByLabelText('Agrégats des colonnes numériques');
    expect(bar).toHaveTextContent('1 ligne');
    expect(bar.textContent!.replace(/[\s  ]/g, '')).toContain('100€');
  });

  it('bascule sur la sélection quand des lignes sont cochées', () => {
    render(<DataTable columns={COLUMNS} data={DATA} enableRowSelection />);
    const checkboxes = screen.getAllByLabelText('Sélectionner la ligne');
    fireEvent.click(checkboxes[1]!);
    const bar = screen.getByLabelText('Agrégats des colonnes numériques');
    expect(bar).toHaveTextContent('Sélection : 1 ligne');
    expect(bar.textContent!.replace(/[\s  ]/g, '')).toContain('50,5€');
  });
});
