import { describe, it, expect } from 'vitest';
import { alerteEtape } from '@/lib/lancement/alertes';

const AUJOURD_HUI = '2026-08-06';
const SEUIL = 15;

function alerte(over: Partial<Parameters<typeof alerteEtape>[0]> = {}) {
  return alerteEtape({
    statut: 'en_cours',
    dateObjectif: null,
    dateRealisation: null,
    aujourdHui: AUJOURD_HUI,
    seuilEnlisementJours: SEUIL,
    ...over,
  });
}

describe('alerteEtape - en retard', () => {
  it('signale un retard quand l objectif est passe et rien n est parti', () => {
    expect(alerte({ dateObjectif: '2026-08-05' })).toBe('en_retard');
  });

  it('ne signale rien le jour meme de l objectif', () => {
    expect(alerte({ dateObjectif: AUJOURD_HUI })).toBe(null);
  });

  it('ne signale rien quand l objectif est dans le futur', () => {
    expect(alerte({ dateObjectif: '2026-09-01' })).toBe(null);
  });

  it('ne signale rien sans date d objectif', () => {
    expect(alerte({ dateObjectif: null })).toBe(null);
  });

  it('ne signale plus de retard des que l etape est realisee', () => {
    expect(
      alerte({
        statut: 'depose',
        dateObjectif: '2026-06-01',
        dateRealisation: '2026-08-05',
      }),
    ).toBe(null);
  });
});

describe('alerteEtape - enlise', () => {
  it('signale un enlisement au-dela du seuil', () => {
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-21' })).toBe(
      'enlise',
    );
  });

  it('ne signale rien pile au seuil', () => {
    // 2026-07-22 -> 2026-08-06 = 15 jours exactement
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-22' })).toBe(
      null,
    );
  });

  it('ne signale rien juste sous le seuil', () => {
    expect(alerte({ statut: 'depose', dateRealisation: '2026-07-23' })).toBe(
      null,
    );
  });

  it('ne signale pas d enlisement sur une etape terminee', () => {
    expect(alerte({ statut: 'lance', dateRealisation: '2026-01-01' })).toBe(
      null,
    );
  });

  it('ne signale pas d enlisement sur une etape pas encore deposee', () => {
    expect(alerte({ statut: 'en_cours', dateRealisation: '2026-01-01' })).toBe(
      null,
    );
  });

  it('suit le seuil parametre', () => {
    expect(
      alerte({
        statut: 'depose',
        dateRealisation: '2026-08-01',
        seuilEnlisementJours: 3,
      }),
    ).toBe('enlise');
  });

  it('ne plante pas sur une etape deposee sans date de realisation', () => {
    expect(alerte({ statut: 'depose', dateRealisation: null })).toBe(null);
  });
});

describe('alerteEtape - priorite', () => {
  it('une etape deposee en retard sur objectif est enlisee, pas en retard', () => {
    // L'objectif est tenu au depot : le retard n'est plus le notre.
    expect(
      alerte({
        statut: 'depose',
        dateObjectif: '2026-01-01',
        dateRealisation: '2026-07-01',
      }),
    ).toBe('enlise');
  });

  it('une etape a venir sans objectif ne signale rien', () => {
    expect(alerte({ statut: 'non_commence' })).toBe(null);
  });
});
