import { describe, it, expect } from 'vitest';
import { extractDriveFileId } from '@/lib/process/drive-url';

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
