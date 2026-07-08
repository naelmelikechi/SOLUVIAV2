import { describe, it, expect } from 'vitest';
import { doitAlerterTaux, SEUIL_TAUX_DEROGATOIRE } from '@/lib/crm/domain/taux';

describe('doitAlerterTaux (seuil Direction 35 %)', () => {
  it('expose le seuil a 35', () => {
    expect(SEUIL_TAUX_DEROGATOIRE).toBe(35);
  });

  it('alerte a la premiere saisie sous le seuil (null -> 30)', () => {
    expect(doitAlerterTaux(null, 30)).toBe(true);
  });

  it('alerte au franchissement du seuil a la baisse (40 -> 30)', () => {
    expect(doitAlerterTaux(40, 30)).toBe(true);
  });

  it('ne re-notifie pas si deja sous le seuil (30 -> 28)', () => {
    expect(doitAlerterTaux(30, 28)).toBe(false);
  });

  it("n'alerte pas quand le taux est efface (30 -> null)", () => {
    expect(doitAlerterTaux(30, null)).toBe(false);
  });

  it("n'alerte pas pour une saisie au-dessus du seuil (null -> 40)", () => {
    expect(doitAlerterTaux(null, 40)).toBe(false);
  });

  it('35 pile est conforme (null -> 35 : pas d alerte)', () => {
    expect(doitAlerterTaux(null, 35)).toBe(false);
  });

  it('passage 35 -> 34.99 franchit le seuil', () => {
    expect(doitAlerterTaux(35, 34.99)).toBe(true);
  });

  it('undefined est traite comme null (pas de valeur precedente)', () => {
    expect(doitAlerterTaux(undefined, 30)).toBe(true);
    expect(doitAlerterTaux(30, undefined)).toBe(false);
  });
});
