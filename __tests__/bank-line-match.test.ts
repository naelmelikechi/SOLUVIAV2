import { describe, it, expect } from 'vitest';
import {
  invoiceRefToken,
  matchUnreconciledBankLine,
  type CandidateBankLine,
} from '@/lib/odoo/bank-line-match';

describe('invoiceRefToken', () => {
  it('extrait trigramme + sequence sans prefixe FAC ni separateurs', () => {
    expect(invoiceRefToken('FAC-HEO-0001')).toBe('HEO0001');
    expect(invoiceRefToken('FAC-SOL-0042')).toBe('SOL0042');
  });

  it('est insensible a la casse et aux separateurs', () => {
    expect(invoiceRefToken('fac_heo_0001')).toBe('HEO0001');
  });

  it('retourne null pour une ref trop courte / non discriminante', () => {
    expect(invoiceRefToken('FAC')).toBeNull();
    expect(invoiceRefToken('FAC-1')).toBeNull(); // jeton "1" < 4 chars
    expect(invoiceRefToken('')).toBeNull();
  });
});

describe('matchUnreconciledBankLine', () => {
  // Cas reel : la banque reformatte "FAC-HEO-0001" en "FACT HEO0001".
  const ligneHeo: CandidateBankLine = {
    id: 140,
    amount: 34571.21,
    // Libelle EXACT de la ligne bancaire prod #140 (verifie sur Odoo 2026-06).
    payment_ref:
      'VIREMENT EN VOTRE FAVEUR VIR INST de HEOL ACADEMY PRESTA SOLUVIA - CFA HEOL ACADE HEOL ACADEMY FACT HEO0001 SOLUVIA HEOL ACADEMY',
  };

  it('matche montant exact + ref reformattee par la banque', () => {
    const r = matchUnreconciledBankLine(
      { ref: 'FAC-HEO-0001', montantTtc: 34571.21 },
      [ligneHeo],
    );
    expect(r?.id).toBe(140);
  });

  it('ne matche pas si le montant differe (meme si ref presente)', () => {
    const r = matchUnreconciledBankLine(
      { ref: 'FAC-HEO-0001', montantTtc: 9999 },
      [ligneHeo],
    );
    expect(r).toBeNull();
  });

  it('ne matche pas si la ref est absente du libelle (meme si montant egal)', () => {
    const r = matchUnreconciledBankLine(
      { ref: 'FAC-HEO-0001', montantTtc: 34571.21 },
      [{ id: 7, amount: 34571.21, payment_ref: 'VIREMENT DIVERS SANS REF' }],
    );
    expect(r).toBeNull();
  });

  it('tolere un ecart de montant <= 0.01 (arrondi), pas au-dela', () => {
    const inv = { ref: 'FAC-HEO-0001', montantTtc: 34571.22 };
    expect(
      matchUnreconciledBankLine(inv, [ligneHeo])?.id, // ecart 0.01
    ).toBe(140);
    expect(
      matchUnreconciledBankLine(
        { ref: 'FAC-HEO-0001', montantTtc: 34571.25 }, // ecart 0.04
        [ligneHeo],
      ),
    ).toBeNull();
  });

  it('selectionne la bonne ligne parmi plusieurs (montant + jeton)', () => {
    const lignes: CandidateBankLine[] = [
      { id: 1, amount: 6147.56, payment_ref: 'HEOL ACADEMY FACHEO0002' },
      ligneHeo, // id 140, 34571.21, HEO0001
      { id: 2, amount: 100, payment_ref: 'AUTRE CLIENT FAC-X-0001' },
    ];
    const r = matchUnreconciledBankLine(
      { ref: 'FAC-HEO-0001', montantTtc: 34571.21 },
      lignes,
    );
    expect(r?.id).toBe(140);
  });

  it('ne confond pas deux sequences proches (jeton complet requis), garde le montant comme garde-fou', () => {
    // "HEO0001" ne doit pas matcher une ligne libellee "HEO0011" de meme montant.
    const r = matchUnreconciledBankLine(
      { ref: 'FAC-HEO-0011', montantTtc: 500 },
      [{ id: 9, amount: 500, payment_ref: 'VIREMENT HEO0001 SOLUVIA' }],
    );
    expect(r).toBeNull();
  });
});
