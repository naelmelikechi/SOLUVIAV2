// Regle pure : quel format de facture electronique poser sur le partner client
// Odoo. SOLUVIA ne facture que des clients FR B2B en Factur-X. Le SIRET
// (company_registry) est requis cote Odoo pour deriver le routage Peppol ; sans
// lui on ne pose rien. Clients non-FR (intracom) : on laisse Odoo/compta decider.

export const EDI_FORMAT_FACTURX = 'facturx';

export function resolveInvoiceEdiFormat(opts: {
  countryCode?: string | null;
  companyRegistry?: string | null;
}): typeof EDI_FORMAT_FACTURX | null {
  const country = (opts.countryCode ?? 'FR').toUpperCase();
  const registry = opts.companyRegistry?.replace(/\s/g, '') ?? '';
  if (country !== 'FR') return null;
  if (registry.length === 0) return null;
  return EDI_FORMAT_FACTURX;
}
