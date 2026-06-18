import { describe, it, expect } from 'vitest';
import {
  CATEGORIE_OPERATION_SERVICES,
  TVA_DEBITS_MENTION,
  buildEInvoicingMentions,
  buildOdooNarration,
} from '@/lib/utils/e-invoicing-mentions';

describe('e-invoicing mentions', () => {
  it("catégorie d'opération toujours présente, débits absente par défaut", () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: false })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
    ]);
  });

  it('mention débits ajoutée quand le flag est vrai', () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: true })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
      TVA_DEBITS_MENTION,
    ]);
  });

  it('flag null/undefined traité comme false', () => {
    expect(buildEInvoicingMentions({ tvaSurDebits: null })).toEqual([
      CATEGORIE_OPERATION_SERVICES,
    ]);
    expect(buildEInvoicingMentions({})).toEqual([CATEGORIE_OPERATION_SERVICES]);
  });

  it('narration Odoo = mentions jointes par retour ligne', () => {
    expect(buildOdooNarration({ tvaSurDebits: true })).toBe(
      `${CATEGORIE_OPERATION_SERVICES}\n${TVA_DEBITS_MENTION}`,
    );
  });

  it('constantes sans em-dash', () => {
    expect(CATEGORIE_OPERATION_SERVICES).not.toContain('—');
    expect(TVA_DEBITS_MENTION).not.toContain('—');
  });
});
