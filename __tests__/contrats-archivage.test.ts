import { describe, it, expect } from 'vitest';
import {
  contratsAArchiver,
  type ContratArchivable,
  type RegleArchivage,
} from '@/lib/contrats/archivage';

const AUJOURD_HUI = '2026-08-07';

const REGLE_NOTSENT: RegleArchivage = {
  id: 'r1',
  nom: 'Brouillon jamais transmis',
  etat_source: 'NOTSENT',
  delai_jours: 30,
  actif: true,
};

function contrat(over: Partial<ContratArchivable> = {}): ContratArchivable {
  return {
    id: 'c1',
    contract_state: 'NOTSENT',
    archive: false,
    contract_state_changed_at: '2026-06-01T00:00:00Z',
    aDesFacturesEmises: false,
    ...over,
  };
}

describe('contratsAArchiver', () => {
  it('retient un contrat au-dela du delai de sa regle', () => {
    const r = contratsAArchiver([contrat()], [REGLE_NOTSENT], AUJOURD_HUI);
    expect(r.map((x) => x.contratId)).toEqual(['c1']);
    expect(r[0]!.regleId).toBe('r1');
  });

  it('ignore un contrat pile au delai', () => {
    // 2026-07-08 -> 2026-08-07 = 30 jours exactement
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: '2026-07-08T00:00:00Z' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('retient un contrat juste au-dela du delai', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: '2026-07-07T00:00:00Z' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toHaveLength(1);
  });

  it('ignore un contrat dans un autre etat', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state: 'ENGAGE' })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore un contrat deja archive', () => {
    expect(
      contratsAArchiver(
        [contrat({ archive: true })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore une regle desactivee', () => {
    expect(
      contratsAArchiver(
        [contrat()],
        [{ ...REGLE_NOTSENT, actif: false }],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('n archive JAMAIS un contrat portant une facture emise', () => {
    // Garde-fou non negociable : archiver retire de la production. Le faire
    // sur un contrat deja facture creuserait un ecart entre la production
    // affichee et le chiffre reellement facture.
    expect(
      contratsAArchiver(
        [contrat({ aDesFacturesEmises: true })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ignore un contrat sans date de changement d etat', () => {
    expect(
      contratsAArchiver(
        [contrat({ contract_state_changed_at: null })],
        [REGLE_NOTSENT],
        AUJOURD_HUI,
      ),
    ).toEqual([]);
  });

  it('ne retient rien quand il n y a aucune regle', () => {
    expect(contratsAArchiver([contrat()], [], AUJOURD_HUI)).toEqual([]);
  });

  it('applique la bonne regle a chaque etat', () => {
    const regles: RegleArchivage[] = [
      REGLE_NOTSENT,
      {
        id: 'r2',
        nom: 'Transmis sans reponse',
        etat_source: 'TRANSMIS',
        delai_jours: 90,
        actif: true,
      },
    ];
    const r = contratsAArchiver(
      [
        contrat({ id: 'a', contract_state: 'NOTSENT' }),
        contrat({
          id: 'b',
          contract_state: 'TRANSMIS',
          contract_state_changed_at: '2026-01-01T00:00:00Z',
        }),
        contrat({
          id: 'c',
          contract_state: 'TRANSMIS',
          contract_state_changed_at: '2026-07-01T00:00:00Z',
        }),
      ],
      regles,
      AUJOURD_HUI,
    );
    expect(r.map((x) => x.contratId).sort()).toEqual(['a', 'b']);
    expect(r.find((x) => x.contratId === 'b')!.regleId).toBe('r2');
  });
});
