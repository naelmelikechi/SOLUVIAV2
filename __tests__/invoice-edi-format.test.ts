import { describe, it, expect } from 'vitest';
import {
  EDI_FORMAT_FACTURX,
  resolveInvoiceEdiFormat,
} from '@/lib/odoo/invoice-edi-format';

describe('resolveInvoiceEdiFormat', () => {
  it('FR + registry présent -> facturx', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'FR',
        companyRegistry: '99424153700012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('countryCode absent ou null (défaut FR) + registry -> facturx', () => {
    expect(resolveInvoiceEdiFormat({ companyRegistry: '99424153700012' })).toBe(
      EDI_FORMAT_FACTURX,
    );
    expect(
      resolveInvoiceEdiFormat({
        countryCode: null,
        companyRegistry: '99424153700012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('registry avec espaces accepté', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'fr',
        companyRegistry: '994 241 537 00012',
      }),
    ).toBe(EDI_FORMAT_FACTURX);
  });

  it('pays non-FR -> null', () => {
    expect(
      resolveInvoiceEdiFormat({
        countryCode: 'BE',
        companyRegistry: '0123456789',
      }),
    ).toBeNull();
  });

  it('registry vide ou absent -> null', () => {
    expect(
      resolveInvoiceEdiFormat({ countryCode: 'FR', companyRegistry: '' }),
    ).toBeNull();
    expect(resolveInvoiceEdiFormat({ countryCode: 'FR' })).toBeNull();
    expect(
      resolveInvoiceEdiFormat({ countryCode: 'FR', companyRegistry: null }),
    ).toBeNull();
  });

  it('constante = facturx', () => {
    expect(EDI_FORMAT_FACTURX).toBe('facturx');
  });
});
