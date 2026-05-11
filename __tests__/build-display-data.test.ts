import { describe, it, expect } from 'vitest';
import {
  buildDisplayData,
  buildConsolidatedData,
} from '@/components/production/views/build-display-data';
import type { ProductionRow } from '@/lib/queries/production';

function row(
  mois: string,
  prod: number,
  prodSoluvia: number,
  facture: number,
  encaisse: number,
  en_retard = 0,
): ProductionRow {
  return {
    mois,
    label: mois.slice(0, 7),
    production: prod,
    productionSoluvia: prodSoluvia,
    facture,
    encaisse,
    en_retard,
  };
}

describe('buildDisplayData', () => {
  it('OPCO : retourne production/facture/encaisse brut', () => {
    const data: ProductionRow[] = [row('2026-01-01', 1000, 100, 500, 200)];
    const result = buildDisplayData(data, 'opco');
    expect(result).toHaveLength(1);
    expect(result[0]!.production).toBe(1000);
    expect(result[0]!.facture).toBe(500);
    expect(result[0]!.encaisse).toBe(200);
  });

  it('SOLUVIA : scale facture/encaisse par le ratio commission', () => {
    // ratio = productionSoluvia / production = 100 / 1000 = 0.1
    const data: ProductionRow[] = [row('2026-01-01', 1000, 100, 500, 200, 50)];
    const result = buildDisplayData(data, 'soluvia');
    expect(result[0]!.production).toBe(100); // = productionSoluvia
    expect(result[0]!.facture).toBe(50); // 500 * 0.1
    expect(result[0]!.encaisse).toBe(20); // 200 * 0.1
    expect(result[0]!.en_retard).toBe(5); // 50 * 0.1
  });

  it('production=0 : ratio=0 (pas de division par zero)', () => {
    const data: ProductionRow[] = [row('2026-01-01', 0, 0, 500, 200)];
    const result = buildDisplayData(data, 'soluvia');
    expect(result[0]!.facture).toBe(0); // 500 * 0
    expect(result[0]!.encaisse).toBe(0);
  });

  it('calcule cumuls raf/rae/rolling12/ytd', () => {
    const data: ProductionRow[] = [
      row('2026-01-01', 100, 10, 80, 60),
      row('2026-02-01', 200, 20, 150, 100),
      row('2026-03-01', 300, 30, 200, 180),
    ];
    const result = buildDisplayData(data, 'opco');
    // Cumul production = 100 + 200 + 300 = 600
    // Cumul facture = 80 + 150 + 200 = 430
    // raf (mars) = 600 - 430 = 170
    expect(result[2]!.raf).toBe(170);
    // Cumul encaisse = 60 + 100 + 180 = 340
    // rae (mars) = 430 - 340 = 90
    expect(result[2]!.rae).toBe(90);
    // rolling12 (mars) = 100 + 200 + 300 = 600 (moins de 12 mois)
    expect(result[2]!.rolling12).toBe(600);
    // ytd (mars 2026) = 100 + 200 + 300 = 600 (meme annee)
    expect(result[2]!.ytd).toBe(600);
  });

  it('ytd reset au changement d annee', () => {
    const data: ProductionRow[] = [
      row('2025-12-01', 100, 10, 0, 0),
      row('2026-01-01', 200, 20, 0, 0),
      row('2026-02-01', 300, 30, 0, 0),
    ];
    const result = buildDisplayData(data, 'opco');
    expect(result[0]!.ytd).toBe(100); // 2025
    expect(result[1]!.ytd).toBe(200); // 2026 reset
    expect(result[2]!.ytd).toBe(500); // 2026 cumul
  });

  it('rolling12 fenetre glissante max 12 mois', () => {
    const data: ProductionRow[] = Array.from({ length: 15 }, (_, i) =>
      row(`2026-${String(i + 1).padStart(2, '0')}-01`, 100, 10, 0, 0),
    );
    const result = buildDisplayData(data, 'opco');
    expect(result[14]!.rolling12).toBe(1200); // 12 derniers * 100
  });

  it('isCurrent/isFuture base sur le mois courant', () => {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const futureMonth = `${today.getFullYear() + 1}-01-01`;
    const data: ProductionRow[] = [
      row('2020-01-01', 0, 0, 0, 0),
      row(currentMonth, 0, 0, 0, 0),
      row(futureMonth, 0, 0, 0, 0),
    ];
    const result = buildDisplayData(data, 'opco');
    expect(result[0]!.isFuture).toBe(false);
    expect(result[0]!.isCurrent).toBe(false);
    expect(result[1]!.isCurrent).toBe(true);
    expect(result[1]!.isFuture).toBe(false);
    expect(result[2]!.isFuture).toBe(true);
    expect(result[2]!.isCurrent).toBe(false);
  });
});

describe('buildConsolidatedData', () => {
  it('combine OPCO + SOLUVIA cote a cote par mois', () => {
    const data: ProductionRow[] = [row('2026-01-01', 1000, 100, 500, 200, 50)];
    const result = buildConsolidatedData(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.opco.production).toBe(1000);
    expect(result[0]!.opco.facture).toBe(500);
    expect(result[0]!.soluvia.production).toBe(100);
    expect(result[0]!.soluvia.facture).toBe(50); // 500 * 0.1
  });
});
