import { describe, it, expect } from 'vitest';
import { buildClientReconcileModelVals } from '@/lib/odoo/reconcile-model-vals';

describe('buildClientReconcileModelVals', () => {
  const base = {
    raisonSociale: 'HEOL ACADEMY',
    partnerId: 11,
    companyId: 1,
    bankJournalId: 13,
  };

  it('mode manual (defaut) : trigger manual, match par libelle + partenaire + journal', () => {
    const v = buildClientReconcileModelVals({ ...base, auto: false });
    expect(v).toEqual({
      name: 'Soluvia auto-match HEOL ACADEMY',
      trigger: 'manual',
      match_label: 'contains',
      match_label_param: 'HEOL ACADEMY',
      mapped_partner_id: 11,
      company_id: 1,
      match_journal_ids: [[6, 0, [13]]],
    });
  });

  it('mode auto : trigger auto_reconcile (lettrage sans clic)', () => {
    const v = buildClientReconcileModelVals({ ...base, auto: true });
    expect(v.trigger).toBe('auto_reconcile');
    // le reste du modele est identique au mode manual
    expect(v.match_label_param).toBe('HEOL ACADEMY');
    expect(v.mapped_partner_id).toBe(11);
  });

  it('scope le journal banque via la commande x2many (6,0,[id])', () => {
    const v = buildClientReconcileModelVals({ ...base, auto: false });
    expect(v.match_journal_ids).toEqual([[6, 0, [13]]]);
  });

  it('le nom est stable et derive de la raison sociale (cle idempotence)', () => {
    expect(
      buildClientReconcileModelVals({
        ...base,
        raisonSociale: 'ACME SAS',
        auto: true,
      }).name,
    ).toBe('Soluvia auto-match ACME SAS');
  });
});
