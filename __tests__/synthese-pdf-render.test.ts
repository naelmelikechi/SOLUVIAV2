import { describe, it, expect, vi } from 'vitest';

// queries/passation (types importes par le composant PDF) tire le client
// serveur -> next/headers : neutralise pour l'import.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { normalizeSnapshot } from '@/lib/queries/passation';
import type { SyntheseSaisies } from '@/lib/queries/passation';
import { renderSynthesePdf } from '@/lib/utils/synthese-pdf';

const SAISIES_VIDES: SyntheseSaisies = {
  points_vigilance: null,
  promesses_orales: null,
  typologie_client: null,
  charge_previsionnelle: null,
  risque_churn: null,
  cdp_ideal: null,
  cdp_a_eviter: null,
  notes_inter_equipe: null,
};

function expectPdf(buffer: Buffer) {
  expect(buffer.length).toBeGreaterThan(1000);
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buffer.subarray(-32).toString('latin1')).toContain('%%EOF');
}

describe('renderSynthesePdf', () => {
  it('rend un PDF valide sur un snapshot minimal (tout null), 2 variantes', async () => {
    const snapshot = normalizeSnapshot(null);
    const complet = await renderSynthesePdf(snapshot, SAISIES_VIDES, 'complet');
    expectPdf(complet);
    const cdp = await renderSynthesePdf(snapshot, SAISIES_VIDES, 'cdp');
    expectPdf(cdp);
  }, 30_000);

  it('rend un PDF avec saisies remplies (sections 6 et 8)', async () => {
    const snapshot = normalizeSnapshot(null);
    snapshot.identite.raisonSociale = 'Groupe Vasseur Bâtiment';
    const saisies: SyntheseSaisies = {
      points_vigilance: 'Point 1\nPoint 2\nPoint 3',
      promesses_orales: 'Point mensuel avec le President.',
      typologie_client: 'exigeant',
      charge_previsionnelle: 'forte',
      risque_churn: 'faible',
      cdp_ideal: 'Profil experimente creation',
      cdp_a_eviter: null,
      notes_inter_equipe: 'RAS',
    };
    const complet = await renderSynthesePdf(snapshot, saisies, 'complet');
    expectPdf(complet);
  }, 30_000);
});
