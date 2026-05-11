import { describe, it, expect } from 'vitest';
import type { Row } from '@tanstack/react-table';
import { textFilterFn } from '@/lib/utils/table-filters';

function makeRow<T>(value: T): Row<unknown> {
  return {
    getValue: () => value,
  } as unknown as Row<unknown>;
}

describe('textFilterFn', () => {
  it('string filter : match accent + case insensible', () => {
    expect(textFilterFn(makeRow('Élève'), 'col', 'eleve', () => {})).toBe(true);
    expect(textFilterFn(makeRow('Jean Dupont'), 'col', 'JEAN', () => {})).toBe(
      true,
    );
    expect(
      textFilterFn(makeRow('Jean Dupont'), 'col', 'martin', () => {}),
    ).toBe(false);
  });

  it('array filter : includes sur la cellule', () => {
    expect(
      textFilterFn(makeRow('admin'), 'col', ['admin', 'cdp'], () => {}),
    ).toBe(true);
    expect(textFilterFn(makeRow('autre'), 'col', ['admin'], () => {})).toBe(
      false,
    );
  });

  it('array vide : aucun filtre actif -> match (pas de "personne")', () => {
    expect(textFilterFn(makeRow('admin'), 'col', [], () => {})).toBe(true);
  });

  it('cellule null/undefined : pas de match', () => {
    expect(textFilterFn(makeRow(null), 'col', 'x', () => {})).toBe(false);
    expect(textFilterFn(makeRow(undefined), 'col', ['a'], () => {})).toBe(
      false,
    );
  });

  it('filterValue non supporte (number) : false', () => {
    expect(
      textFilterFn(makeRow('admin'), 'col', 42 as unknown as string, () => {}),
    ).toBe(false);
  });

  it('string vide : pas de filtre -> match (cf matchesSearch)', () => {
    expect(textFilterFn(makeRow('foo'), 'col', '', () => {})).toBe(true);
  });
});
