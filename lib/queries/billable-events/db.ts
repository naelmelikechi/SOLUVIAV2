import type { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Acces DB : helpers typed reutilises par getBillableEvents (1 projet) ET
// getBillableEventsForProjets (N projets en bulk). Filtrent tous par liste
// d'ids -> nombre de round-trips CONSTANT quel que soit le nombre de projets.
// ---------------------------------------------------------------------------

type BillableDbClient = Awaited<ReturnType<typeof createClient>>;

export function qProjetOne(supabase: BillableDbClient, projetId: string) {
  return supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission,
      client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)
    `,
    )
    .eq('id', projetId)
    .maybeSingle();
}

export function qProjetsMany(supabase: BillableDbClient, projetIds: string[]) {
  return supabase
    .from('projets')
    .select(
      `
      id, ref, taux_commission,
      client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)
    `,
    )
    .in('id', projetIds);
}

export function qContrats(supabase: BillableDbClient, projetIds: string[]) {
  return supabase
    .from('contrats')
    .select(
      `
      id, projet_id, ref, contract_number, internal_number,
      apprenant_nom, apprenant_prenom, formation_titre,
      contract_state, npec_amount, support, eduvia_company_id, facturation_verrouillee
    `,
    )
    .in('projet_id', projetIds)
    .eq('archive', false);
}

export function qInvoiceLines(
  supabase: BillableDbClient,
  contratIds: string[],
) {
  return supabase
    .from('eduvia_invoice_lines')
    .select('eduvia_invoice_id, contrat_id, amount, line_type')
    .in('contrat_id', contratIds);
}

export function qEmittedSteps(
  supabase: BillableDbClient,
  contratIds: string[],
) {
  return supabase
    .from('eduvia_invoice_steps')
    .select(
      'id, contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, total_amount, opco_settled_amount, net_invoiced_amount, opening_date, paid_at, invoice_state, invoice_number, external_number',
    )
    .in('contrat_id', contratIds)
    .not('invoice_state', 'is', null)
    .not('eduvia_invoice_id', 'is', null);
}

export function qCompaniesIdcc(
  supabase: BillableDbClient,
  clientIds: string[],
) {
  return supabase
    .from('eduvia_companies')
    .select('eduvia_id, idcc_code')
    .in('client_id', clientIds);
}

export function qExistingLignes(
  supabase: BillableDbClient,
  contratIds: string[],
) {
  return supabase
    .from('facture_lignes')
    .select(
      `
      event_type, event_source_id, contrat_id, est_avoir,
      facture:factures!facture_lignes_facture_id_fkey(id, ref, statut)
    `,
    )
    .in('contrat_id', contratIds)
    .not('event_type', 'is', null);
}

export type ProjetRow = NonNullable<
  Awaited<ReturnType<typeof qProjetsMany>>['data']
>[number];
export type ContratRow = NonNullable<
  Awaited<ReturnType<typeof qContrats>>['data']
>[number];
export type InvoiceLineRow = NonNullable<
  Awaited<ReturnType<typeof qInvoiceLines>>['data']
>[number];
export type EmittedStepRow = NonNullable<
  Awaited<ReturnType<typeof qEmittedSteps>>['data']
>[number];
export type CompanyIdccRow = NonNullable<
  Awaited<ReturnType<typeof qCompaniesIdcc>>['data']
>[number];
export type ExistingLigneRow = NonNullable<
  Awaited<ReturnType<typeof qExistingLignes>>['data']
>[number];
