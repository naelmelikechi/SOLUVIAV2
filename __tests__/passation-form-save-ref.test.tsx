/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression (audit #122, constat 12b).
 *
 * `soumettreSynthese` rend les DEUX PDF a partir de la ligne en base. Le parent
 * soumettait sans avoir persiste les sections 6 et 8 : les PDF partaient donc
 * sans les points de vigilance, et la recuperation etait impossible puisque
 * re-soumettre renvoie « Synthese deja soumise ». En plus, la `key` du
 * formulaire contient `updated_at` : au retour de l'action il etait remonte avec
 * les valeurs serveur, et la redaction non enregistree disparaissait de l'ecran.
 *
 * PassationForm publie desormais sa sauvegarde via `saveRef`, et le parent
 * l'appelle avant de soumettre. Ce test verifie le point qui casse tout si on
 * se trompe : la fonction publiee doit voir les valeurs COURANTES, pas celles
 * du montage (une closure figee enregistrerait le formulaire vide).
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const enregistrerMock = vi.fn(async () => ({ success: true as const }));
vi.mock('@/lib/actions/passation', () => ({
  enregistrerSaisiesSynthese: (...args: unknown[]) =>
    enregistrerMock(...(args as [])),
}));

import { PassationForm } from '@/components/commercial/passations/passation-form';

afterEach(() => cleanup());
beforeEach(() => enregistrerMock.mockClear());

const SYNTHESE = {
  id: 'syn-1',
  statut: 'en_cours_completion',
  points_vigilance: null,
  promesses_orales: null,
  contenu: {},
  updated_at: '2026-08-06T10:00:00Z',
  created_at: '2026-08-06T09:00:00Z',
} as never;

describe('PassationForm : sauvegarde publiee au parent', () => {
  it('saveRef voit les valeurs COURANTES, pas celles du montage', async () => {
    const saveRef: {
      current: ((silent?: boolean) => Promise<boolean>) | null;
    } = { current: null };

    render(
      <PassationForm
        synthese={SYNTHESE}
        reco={null}
        locked={false}
        onSaved={() => {}}
        saveRef={saveRef}
      />,
    );

    // Le parent doit pouvoir declencher la sauvegarde.
    expect(saveRef.current).toBeTypeOf('function');

    // Redaction APRES le montage : c'est tout l'enjeu, une closure figee au
    // mount enregistrerait null.
    fireEvent.change(screen.getByLabelText(/le tacite à connaître/i), {
      target: { value: 'Client tres sensible aux delais' },
    });

    const ok = await saveRef.current!(true);
    expect(ok).toBe(true);
    expect(enregistrerMock).toHaveBeenCalledTimes(1);
    expect(enregistrerMock).toHaveBeenCalledWith(
      'syn-1',
      expect.objectContaining({
        points_vigilance: 'Client tres sensible aux delais',
      }),
    );
  });

  it('en mode silencieux, ne declenche pas le rechargement du parent', async () => {
    const onSaved = vi.fn();
    const saveRef: {
      current: ((silent?: boolean) => Promise<boolean>) | null;
    } = { current: null };

    render(
      <PassationForm
        synthese={SYNTHESE}
        reco={null}
        locked={false}
        onSaved={onSaved}
        saveRef={saveRef}
      />,
    );

    await saveRef.current!(true);
    // Le parent fera son propre reload apres la soumission : un reload
    // intermediaire remonterait le formulaire (la `key` contient updated_at) au
    // milieu de l'operation.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('remonte false sans lever quand l enregistrement echoue', async () => {
    enregistrerMock.mockResolvedValueOnce({
      success: false as never,
      error: 'RLS refusee',
    } as never);
    const saveRef: {
      current: ((silent?: boolean) => Promise<boolean>) | null;
    } = { current: null };

    render(
      <PassationForm
        synthese={SYNTHESE}
        reco={null}
        locked={false}
        onSaved={() => {}}
        saveRef={saveRef}
      />,
    );

    // Le parent doit pouvoir renoncer a soumettre : soumettre malgre un echec
    // d'enregistrement reproduirait exactement le bug corrige.
    await expect(saveRef.current!(true)).resolves.toBe(false);
  });
});
