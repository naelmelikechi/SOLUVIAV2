import { createClient } from '@/lib/supabase/server';
import { getActiveOpcoMapping } from '@/lib/queries/opcos';
import {
  resolveOpcoFromIdcc,
  normalizeIdcc,
  OPCO_NON_RESOLU,
} from '@/lib/opco/resolve';
import { toLocalISODate, diffDaysIso } from '@/lib/utils/dates';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Contrats à facturer : indicateur de pilotage CDP.
//
// Un contrat est "à facturer" s'il a une échéance OPCO ouverte mais jamais
// transmise : >=1 ligne eduvia_invoice_steps avec invoice_state IS NULL et
// opening_date <= aujourd'hui, sur un contrat ENGAGE/TRANSMIS, non archivé,
// non verrouillé. Une ligne par contrat (l'échéance la plus en retard).
//
// Toute la donnée est déjà synchronisée depuis Eduvia. Le scoping CDP est
// gratuit : la RLS de eduvia_invoice_steps filtre déjà par
// contrat -> projet.cdp_id / backup_cdp_id (admin voit tout).
// ---------------------------------------------------------------------------

/** États contrat où une échéance OPCO est réellement facturable. */
const BILLABLE_STATES: Record<string, true> = { ENGAGE: true, TRANSMIS: true };

export interface AFacturerContratInput {
  id: string;
  ref: string | null;
  contract_number: string | null;
  apprenant_prenom: string | null;
  apprenant_nom: string | null;
  formation_titre: string | null;
  contract_state: string;
  archive: boolean;
  facturation_verrouillee: boolean;
  projet_ref: string | null;
  client_raison_sociale: string | null;
}

export interface AFacturerStepInput {
  contrat_id: string;
  step_number: number;
  opening_date: string | null;
  invoice_state: string | null;
  total_amount: number | null;
}

export interface ContratAFacturer {
  contratId: string;
  ref: string | null;
  contractNumber: string | null;
  apprenti: string;
  formationTitre: string | null;
  projetRef: string | null;
  clientRaisonSociale: string | null;
  opco: string;
  /** Échéance due la plus en retard. */
  stepNumber: number;
  openingDate: string;
  montant: number | null;
  retardJours: number;
  /** Nombre total d'échéances dues sur le contrat (>=1). */
  echeancesDuesCount: number;
}

export { OPCO_NON_RESOLU };

/**
 * Noyau pur (sans DB) : applique la règle "à facturer" et matérialise une
 * ligne par contrat. Déterministe et testable.
 */
export function selectContratsAFacturer(input: {
  contrats: AFacturerContratInput[];
  steps: AFacturerStepInput[];
  opcoByContratId: Map<string, string>;
  today: string;
}): ContratAFacturer[] {
  const { contrats, steps, opcoByContratId, today } = input;

  const eligibleContrats = new Map<string, AFacturerContratInput>();
  for (const c of contrats) {
    if (c.archive || c.facturation_verrouillee) continue;
    if (!BILLABLE_STATES[c.contract_state]) continue;
    eligibleContrats.set(c.id, c);
  }

  // Échéances dues (ouvertes, non transmises) par contrat éligible.
  const dueByContrat = new Map<string, AFacturerStepInput[]>();
  for (const s of steps) {
    if (s.invoice_state !== null) continue;
    if (!s.opening_date || s.opening_date > today) continue;
    if (!eligibleContrats.has(s.contrat_id)) continue;
    const arr = dueByContrat.get(s.contrat_id);
    if (arr) arr.push(s);
    else dueByContrat.set(s.contrat_id, [s]);
  }

  const rows: ContratAFacturer[] = [];
  for (const [contratId, dueSteps] of dueByContrat) {
    const c = eligibleContrats.get(contratId)!;
    const earliest = dueSteps.reduce((a, b) =>
      a.opening_date! <= b.opening_date! ? a : b,
    );
    const apprenti =
      `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim();
    rows.push({
      contratId,
      ref: c.ref,
      contractNumber: c.contract_number,
      apprenti,
      formationTitre: c.formation_titre,
      projetRef: c.projet_ref,
      clientRaisonSociale: c.client_raison_sociale,
      opco: opcoByContratId.get(contratId) ?? OPCO_NON_RESOLU,
      stepNumber: earliest.step_number,
      openingDate: earliest.opening_date!,
      montant: earliest.total_amount,
      retardJours: Math.max(0, diffDaysIso(earliest.opening_date!, today)),
      echeancesDuesCount: dueSteps.length,
    });
  }

  // Plus en retard d'abord ; départage stable par référence contrat.
  rows.sort(
    (a, b) =>
      a.openingDate.localeCompare(b.openingDate) ||
      (a.ref ?? a.contractNumber ?? '').localeCompare(
        b.ref ?? b.contractNumber ?? '',
      ),
  );
  return rows;
}

// Forme brute d'une ligne step jointe au contrat (PostgREST embeddings).
interface JoinedStepRow {
  contrat_id: string;
  step_number: number;
  opening_date: string | null;
  invoice_state: string | null;
  total_amount: number | null;
  contrats: {
    id: string;
    ref: string | null;
    contract_number: string | null;
    apprenant_prenom: string | null;
    apprenant_nom: string | null;
    formation_titre: string | null;
    contract_state: string;
    archive: boolean;
    facturation_verrouillee: boolean;
    eduvia_company_id: number | null;
    source_client_id: string | null;
    projets:
      | {
          ref: string | null;
          clients:
            | { raison_sociale: string | null }
            | { raison_sociale: string | null }[]
            | null;
        }
      | { ref: string | null; clients: unknown }[]
      | null;
  } | null;
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Matérialise les contrats à facturer visibles par l'utilisateur courant
 * (RLS : CDP = ses projets, admin = tout). ~3 requêtes DB.
 */
export async function getContratsAFacturer(): Promise<ContratAFacturer[]> {
  const supabase = await createClient();
  const today = toLocalISODate(new Date());

  const { data, error } = await supabase
    .from('eduvia_invoice_steps')
    .select(
      `contrat_id, step_number, opening_date, invoice_state, total_amount,
       contrats!inner (
         id, ref, contract_number, apprenant_prenom, apprenant_nom,
         formation_titre, contract_state, archive, facturation_verrouillee,
         eduvia_company_id, source_client_id,
         projets!inner ( ref, clients!inner ( raison_sociale ) )
       )`,
    )
    .is('invoice_state', null)
    .lte('opening_date', today);

  if (error) {
    logger.error('queries.contrats-a-facturer', 'fetch failed', { error });
    return [];
  }

  const rows = (data ?? []) as unknown as JoinedStepRow[];

  const contratsById = new Map<string, AFacturerContratInput>();
  const steps: AFacturerStepInput[] = [];
  // (source_client_id, eduvia_company_id) par contrat, pour résoudre l'OPCO.
  const companyKeyByContrat = new Map<
    string,
    { clientId: string; eduviaId: number }
  >();
  const clientIds = new Set<string>();
  const eduviaIds = new Set<number>();

  for (const r of rows) {
    const c = unwrap(r.contrats);
    if (!c) continue;
    steps.push({
      contrat_id: r.contrat_id,
      step_number: r.step_number,
      opening_date: r.opening_date,
      invoice_state: r.invoice_state,
      total_amount: r.total_amount,
    });
    if (!contratsById.has(c.id)) {
      const projet = unwrap(c.projets) as {
        ref: string | null;
        clients:
          | { raison_sociale: string | null }
          | { raison_sociale: string | null }[]
          | null;
      } | null;
      const client = unwrap(projet?.clients ?? null);
      contratsById.set(c.id, {
        id: c.id,
        ref: c.ref,
        contract_number: c.contract_number,
        apprenant_prenom: c.apprenant_prenom,
        apprenant_nom: c.apprenant_nom,
        formation_titre: c.formation_titre,
        contract_state: c.contract_state,
        archive: c.archive,
        facturation_verrouillee: c.facturation_verrouillee,
        projet_ref: projet?.ref ?? null,
        client_raison_sociale: client?.raison_sociale ?? null,
      });
      if (c.source_client_id && c.eduvia_company_id != null) {
        companyKeyByContrat.set(c.id, {
          clientId: c.source_client_id,
          eduviaId: c.eduvia_company_id,
        });
        clientIds.add(c.source_client_id);
        eduviaIds.add(c.eduvia_company_id);
      }
    }
  }

  // OPCO : idcc des employeurs -> OPCO actif. Map keyée (client_id:eduvia_id)
  // pour rester correct en multitenant (un eduvia_id peut se répéter).
  const opcoByContratId = new Map<string, string>();
  if (companyKeyByContrat.size > 0) {
    const [opcoMapping, companiesRes] = await Promise.all([
      getActiveOpcoMapping(),
      supabase
        .from('eduvia_companies')
        .select('eduvia_id, client_id, idcc_code')
        .in('client_id', [...clientIds])
        .in('eduvia_id', [...eduviaIds]),
    ]);
    const idccByKey = new Map<string, string | null>();
    for (const co of companiesRes.data ?? []) {
      idccByKey.set(`${co.client_id}:${co.eduvia_id}`, co.idcc_code);
    }
    for (const [contratId, key] of companyKeyByContrat) {
      const idcc = normalizeIdcc(
        idccByKey.get(`${key.clientId}:${key.eduviaId}`),
      );
      const opco = resolveOpcoFromIdcc(idcc, opcoMapping);
      if (opco) opcoByContratId.set(contratId, opco.code);
    }
  }

  return selectContratsAFacturer({
    contrats: [...contratsById.values()],
    steps,
    opcoByContratId,
    today,
  });
}
