import { describe, it, expect } from 'vitest';
import {
  buildSyntheseCards,
  buildCarteQualite,
  type SyntheseInput,
} from '@/lib/projets/synthese';

const BASE: SyntheseInput = {
  projetRef: '0016-HEO-APP',
  lancement: { terminees: 3, total: 7 },
  production: { apprentisActifs: 12, progressionPct: 85 },
  finance: { produitHt: 24000, factureHt: 18000 },
  contrats: { total: 15, actifs: 12 },
};

describe('buildSyntheseCards', () => {
  it('produit exactement quatre cartes, dans l ordre de la sous-nav (la qualite est construite a part)', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.cle)).toEqual([
      'lancement',
      'production',
      'finance',
      'contrats',
    ]);
  });

  it('pointe chaque carte vers sa sous-route', () => {
    const cards = buildSyntheseCards(BASE);
    expect(cards.map((c) => c.href)).toEqual([
      '/projets/0016-HEO-APP/lancement',
      '/projets/0016-HEO-APP/production',
      '/projets/0016-HEO-APP/finance',
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
    expect(c.ton).toBe('neutre');
  });

  it('reste neutre sur le lancement quelle que soit la fraction terminee (pas encore de notion de retard)', () => {
    const enCours = buildSyntheseCards({
      ...BASE,
      lancement: { terminees: 3, total: 7 },
    })[0]!;
    expect(enCours.ton).toBe('neutre');

    const rienFait = buildSyntheseCards({
      ...BASE,
      lancement: { terminees: 0, total: 7 },
    })[0]!;
    expect(rienFait.ton).toBe('neutre');

    const termine = buildSyntheseCards({
      ...BASE,
      lancement: { terminees: 7, total: 7 },
    })[0]!;
    expect(termine.ton).toBe('neutre');
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

  it('respecte les bornes de l echelle de couleur de la production (alignee sur lib/queries/projet-performance.ts)', () => {
    const a80 = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 80 },
    })[1]!;
    expect(a80.ton).toBe('neutre');

    const a799 = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 79.9 },
    })[1]!;
    expect(a799.ton).toBe('attention');

    const a50 = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 50 },
    })[1]!;
    expect(a50.ton).toBe('attention');

    const a499 = buildSyntheseCards({
      ...BASE,
      production: { apprentisActifs: 12, progressionPct: 49.9 },
    })[1]!;
    expect(a499.ton).toBe('alerte');
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

  it('reste neutre sur la finance quand rien n est facture alors qu il y a du produit (facturation par jalon, pas un retard)', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('neutre');
  });

  it('reste neutre sur la finance quel que soit le ratio facture/produit (pas encore de notion de retard de facturation)', () => {
    const rienFacture = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: 0 },
    })[2]!;
    expect(rienFacture.ton).toBe('neutre');

    const totalementFacture = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: 24000 },
    })[2]!;
    expect(totalementFacture.ton).toBe('neutre');

    const avoirNegatif = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 24000, factureHt: -500 },
    })[2]!;
    expect(avoirNegatif.ton).toBe('neutre');
  });

  it('reste neutre sur la finance quand il n y a rien a facturer', () => {
    const c = buildSyntheseCards({
      ...BASE,
      finance: { produitHt: 0, factureHt: 0 },
    })[2]!;
    expect(c.ton).toBe('neutre');
  });

  it('resume les contrats', () => {
    const c = buildSyntheseCards(BASE)[3]!;
    expect(c.valeur).toBe('15');
    expect(c.contexte).toBe('12 actifs');
  });

  it('n alarme aucune carte quand le projet est entierement vide (donnee absente = pas d alarme)', () => {
    const vide: SyntheseInput = {
      projetRef: 'vide',
      lancement: { terminees: 0, total: 0 },
      production: { apprentisActifs: 0, progressionPct: null },
      finance: { produitHt: 0, factureHt: 0 },
      contrats: { total: 0, actifs: 0 },
    };
    const cards = [
      ...buildSyntheseCards(vide),
      buildCarteQualite('vide', { realise: 0, total: 0 }),
    ];
    expect(cards).toHaveLength(5);
    expect(cards.some((c) => c.ton === 'alerte')).toBe(false);
  });

  it('tient la contrainte de densite : une seule ligne de contexte par carte, et une valeur courte', () => {
    const vide: SyntheseInput = {
      projetRef: 'vide',
      lancement: { terminees: 0, total: 0 },
      production: { apprentisActifs: 0, progressionPct: null },
      finance: { produitHt: 0, factureHt: 0 },
      contrats: { total: 0, actifs: 0 },
    };
    const grosMontant: SyntheseInput = {
      ...BASE,
      finance: { produitHt: 1234567, factureHt: 1234567 },
    };
    const qualites = [
      buildCarteQualite('0016-HEO-APP', { realise: 18, total: 29 }),
      buildCarteQualite('vide', { realise: 0, total: 0 }),
    ];
    for (const input of [BASE, vide, grosMontant]) {
      for (const c of [...buildSyntheseCards(input), ...qualites]) {
        expect(c.contexte).not.toContain('\n');
        expect(c.contexte.length).toBeLessThanOrEqual(40);
        expect(c.valeur).not.toContain('\n');
      }
    }
  });
});

describe('buildCarteQualite', () => {
  it('pointe vers la sous-route qualite en encodant la ref', () => {
    expect(
      buildCarteQualite('0016-HEO-APP', { realise: 18, total: 29 }).href,
    ).toBe('/projets/0016-HEO-APP/qualite');
    expect(buildCarteQualite('a b', { realise: 0, total: 0 }).href).toBe(
      '/projets/a%20b/qualite',
    );
  });

  it('affiche la qualite en pourcentage avec le detail des livrables', () => {
    const c = buildCarteQualite('0016-HEO-APP', { realise: 18, total: 29 });
    expect(c.cle).toBe('qualite');
    expect(c.titre).toBe('Qualité');
    expect(c.valeur).toBe('62 %');
    expect(c.contexte).toBe('18/29 livrables');
    expect(c.ton).toBe('attention');
  });

  it('neutralise la qualite quand aucun referentiel n est disponible', () => {
    const c = buildCarteQualite('0016-HEO-APP', { realise: 0, total: 0 });
    expect(c.valeur).toBe('-');
    expect(c.ton).toBe('neutre');
    expect(c.contexte).toBe('référentiel non disponible');
  });

  it('suit la meme echelle de couleur que la production', () => {
    expect(buildCarteQualite('r', { realise: 80, total: 100 }).ton).toBe(
      'neutre',
    );
    expect(buildCarteQualite('r', { realise: 50, total: 100 }).ton).toBe(
      'attention',
    );
    expect(buildCarteQualite('r', { realise: 49, total: 100 }).ton).toBe(
      'alerte',
    );
  });
});
