import { describe, expect, it } from 'vitest';
import { negociationSchema } from '@/lib/crm/validators/negociation';
import { JALONS_CALENDRIER } from '@/lib/utils/constants';

// Section 5 (calendrier prévisionnel) : valeurs en texte libre, clés bornées
// aux jalons connus, objet vide -> null (colonne JSONB nullable).
describe('negociationSchema.calendrier_previsionnel', () => {
  it('accepte mois AAAA-MM et texte libre, et retire les entrées vides', () => {
    const parsed = negociationSchema.parse({
      calendrier_previsionnel: {
        demarrage: '2026-08',
        recrut_directeur: 'OK',
        premiere_facture: 'à aviser',
        nda: '  ',
        qualiopi: '',
      },
    });
    expect(parsed.calendrier_previsionnel).toEqual({
      demarrage: '2026-08',
      recrut_directeur: 'OK',
      premiere_facture: 'à aviser',
    });
  });

  it('ignore les clés hors jalons connus', () => {
    const parsed = negociationSchema.parse({
      calendrier_previsionnel: { demarrage: '2026-08', inconnu: 'x' },
    });
    expect(parsed.calendrier_previsionnel).toEqual({ demarrage: '2026-08' });
  });

  it('normalise objet vide / absent en null', () => {
    expect(
      negociationSchema.parse({ calendrier_previsionnel: {} })
        .calendrier_previsionnel,
    ).toBeNull();
    expect(
      negociationSchema.parse({ calendrier_previsionnel: { nda: '' } })
        .calendrier_previsionnel,
    ).toBeNull();
    expect(negociationSchema.parse({}).calendrier_previsionnel).toBeNull();
  });

  it('couvre chaque jalon déclaré', () => {
    const all = Object.fromEntries(
      JALONS_CALENDRIER.map((j) => [j.key, '2026-09']),
    );
    const parsed = negociationSchema.parse({ calendrier_previsionnel: all });
    expect(Object.keys(parsed.calendrier_previsionnel ?? {})).toHaveLength(
      JALONS_CALENDRIER.length,
    );
  });
});
