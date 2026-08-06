import { describe, it, expect } from 'vitest';
import { buildSyntheseCards, type SyntheseInput } from '@/lib/projets/synthese';

const BASE: SyntheseInput = {
  projetRef: '0016-HEO-APP',
  lancement: { terminees: 3, total: 7 },
  production: { apprentisActifs: 12, progressionPct: 85 },
  finance: { produitHt: 24000, factureHt: 18000 },
  qualite: { realise: 18, total: 29 },
  contrats: { total: 15, actifs: 12 },
};

describe('buildSyntheseCards', () => {
  it('produit exactement cinq cartes, dans l ordre de la sous-nav', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.cle)).toEqual([
      'lancement',
      'production',
      'finance',
      'qualite',
      'contrats',
    ]);
  });

  it('pointe chaque carte vers sa sous-route', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.href)).toEqual([
      '/projets/0016-HEO-APP/lancement',
      '/projets/0016-HEO-APP/production',
      '/projets/0016-HEO-APP/finance',
      '/projets/0016-HEO-APP/qualite',
      '/projets/0016-HEO-APP/contrats',
    ]);
  });

  it('encode la ref dans l URL', () => {
    const cards = buildSyntheseCards({ ...BASE, projetRef: 'a b' });
    expect(cards[0]!.href).toBe('/projets/a%20b/lancement');
  });

  it('affiche l avancement du lancement en fraction', () => {
    const c = buildSyntheseCards(BASE)[0]!;
    expect(c.valeur).toBe('3/7');
    expect(c.contexte).toBe('étapes terminées');
    expect(c.ton).toBe('attention');
  });

  it('passe le lancement en neutre quand toutes les etapes sont terminees', () => {
    const c = buildSyntheseCards({
      ...BASE,
      lancement: { terminees: 7, total: 7 },
    })[0]!;
    expect(c.ton).toBe('neutre');
  });

  it('colore la production selon la progression', () => {
    const bon = buildSyntheseCards(BASE)[1]!;
    expect(bon.valeur).toBe('85 %');
    expect(bon.ton).toBe('neutre');

    const moyen = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 60 },
    })[1]!;
    expect(moyen.ton).toBe('attention');

    const mauvais = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 40 },
    })[1]!;
    expect(mauvais.ton).toBe('alerte');
  });

  it('reste neutre et affiche un tiret quand la progression est inconnue', () => {
    const c = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 0, progressionPct: null },
    })[1]!;
    expect(c.valeur).toBe('-');
    expect(c.ton).toBe('neutre');
    expect(c.contexte).toBe('aucun apprenti actif');
  });

  it('accorde le contexte de production au singulier', () => {
    const c = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 1, progressionPct: 85 },
    })[1]!;
    expect(c.contexte).toBe('1 apprenti actif');
  });

  it('alerte sur la finance quand rien n est facture alors qu il y a du produit', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('alerte');
  });

  it('reste neutre sur la finance quand il n y a rien a facturer', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 0, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('neutre');
  });

  it('affiche la qualite en pourcentage avec le detail des livrables', () => {
    const c = buildSyntheseCards(BASE)[3]!;
    expect(c.valeur).toBe('62 %');
    expect(c.contexte).toBe('18/29 livrables');
    expect(c.ton).toBe('attention');
  });

  it('neutralise la qualite quand aucun referentiel n est disponible', () => {
    const c = buildSyntheseCards({
      ...BASE,
      qualite: { realise: 0, total: 0 },
    })[3]!;
    expect(c.valeur).toBe('-');
    expect(c.ton).toBe('neutre');
    expect(c.contexte).toBe('référentiel non disponible');
  });

  it('resume les contrats', () => {
    const c = buildSyntheseCards(BASE)[4]!;
    expect(c.valeur).toBe('15');
    expect(c.contexte).toBe('12 actifs');
  });

  it('tient la contrainte de densite : une seule ligne de contexte par carte', () => {
    for (const c of buildSyntheseCards(BASE)) {
      expect(c.contexte).not.toContain('\n');
      expect(c.contexte.length).toBeLessThanOrEqual(40);
    }
  });
});
