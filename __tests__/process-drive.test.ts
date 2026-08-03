import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractDriveFileId } from '@/lib/process/drive-url';
import { isKnownDeliverable, previewabilityFor } from '@/lib/process/drive';

describe('previewabilityFor', () => {
  it('direct pour PDF / images / texte', () => {
    expect(previewabilityFor('application/pdf')).toBe('direct');
    expect(previewabilityFor('image/png')).toBe('direct');
    expect(previewabilityFor('text/plain; charset=utf-8')).toBe('direct');
  });
  it('sandbox pour HTML / SVG (rendu sans script)', () => {
    expect(previewabilityFor('text/html; charset=UTF-8')).toBe('sandbox');
    expect(previewabilityFor('image/svg+xml')).toBe('sandbox');
  });
  it('unsupported pour le reste', () => {
    expect(previewabilityFor('application/zip')).toBe('unsupported');
    expect(
      previewabilityFor(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('unsupported');
  });
});

describe('extractDriveFileId', () => {
  it('extrait l’ID des formes /file/d, /document/d, /spreadsheets/d, /presentation/d', () => {
    expect(
      extractDriveFileId(
        'https://drive.google.com/file/d/1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m/view?usp=drive',
      ),
    ).toBe('1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m');
    expect(
      extractDriveFileId('https://docs.google.com/document/d/ABC123_xy/edit'),
    ).toBe('ABC123_xy');
    expect(
      extractDriveFileId(
        'https://docs.google.com/spreadsheets/d/SHEET-9/edit#gid=0',
      ),
    ).toBe('SHEET-9');
    expect(
      extractDriveFileId('https://docs.google.com/presentation/d/PRES_7/edit'),
    ).toBe('PRES_7');
    expect(extractDriveFileId('https://drive.google.com/open?id=OPEN_42')).toBe(
      'OPEN_42',
    );
  });
  it('renvoie null hors Drive / dossier', () => {
    expect(extractDriveFileId('https://example.com/x')).toBeNull();
    expect(
      extractDriveFileId('https://drive.google.com/drive/folders/FOLDER1'),
    ).toBeNull();
  });
});

// Client Supabase factice : renvoie les lignes fournies pour `.select()`.
function fakeClient(rows: unknown[]): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data: rows }) }),
  } as unknown as SupabaseClient;
}

describe('isKnownDeliverable', () => {
  const KNOWN =
    'https://drive.google.com/file/d/1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m/view';

  it('renvoie true si un lien de livrable pointe vers ce fileId', async () => {
    const rows = [
      { detail: { taches: [{ liens: [{ libelle: 'A', url: KNOWN }] }] } },
    ];
    await expect(
      isKnownDeliverable(fakeClient(rows), '1iC0qWfLIr6gHIX5cARcmrVX_4CVMrb7m'),
    ).resolves.toBe(true);
  });

  it('renvoie false pour un id inconnu (détail bien formé)', async () => {
    const rows = [
      { detail: { taches: [{ liens: [{ libelle: 'A', url: KNOWN }] }] } },
    ];
    await expect(
      isKnownDeliverable(fakeClient(rows), 'ID_INCONNU'),
    ).resolves.toBe(false);
  });

  it('renvoie false sans throw quand une tâche n’a pas de clé liens', async () => {
    const rows = [{ detail: { taches: [{ titre: 'sans liens' }] } }];
    await expect(
      isKnownDeliverable(fakeClient(rows), 'ID_INCONNU'),
    ).resolves.toBe(false);
  });
});
