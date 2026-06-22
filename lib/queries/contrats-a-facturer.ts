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

/** Contrat dont une échéance OPCO est facturable : état ENGAGE/TRANSMIS, non
 *  archivé, non verrouillé (lock manuel facturation SOLUVIA). */
function isContratEligible(c: AFacturerContratInput): boolean {
  return (
    !c.archive &&
    !c.facturation_verrouillee &&
    !!BILLABLE_STATES[c.contract_state]
  );
}

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
    if (isContratEligible(c)) eligibleContrats.set(c.id, c);
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

export interface ContratNonFacture {
  contratId: string;
  ref: string | null;
  contractNumber: string | null;
  apprenti: string;
  formationTitre: string | null;
  projetRef: string | null;
  clientRaisonSociale: string | null;
  cdpNom: string | null;
  opco: string;
  /** Échéances OPCO non transmises (toutes dates). */
  nonTransmisCount: number;
  prochaineEcheance: string;
  montantNonTransmis: number;
  statut: 'echu' | 'a_venir';
  /** Retard en jours de la plus ancienne échéance échue (0 si à venir). */
  retardJours: number;
}

/**
 * Noyau pur : tous les contrats avec >=1 échéance OPCO non transmise, TOUTES
 * dates (échu + à venir). Une ligne par contrat. Vue supervision superadmin.
 */
export function selectContratsNonFactures(input: {
  contrats: AFacturerContratInput[];
  steps: AFacturerStepInput[];
  opcoByContratId: Map<string, string>;
  cdpNomByContratId: Map<string, string>;
  today: string;
}): ContratNonFacture[] {
  const { contrats, steps, opcoByContratId, cdpNomByContratId, today } = input;

  const eligibleContrats = new Map<string, AFacturerContratInput>();
  for (const c of contrats) {
    if (isContratEligible(c)) eligibleContrats.set(c.id, c);
  }

  // Échéances non transmises (toutes dates) par contrat éligible.
  const byContrat = new Map<string, AFacturerStepInput[]>();
  for (const s of steps) {
    if (s.invoice_state !== null || !s.opening_date) continue;
    if (!eligibleContrats.has(s.contrat_id)) continue;
    const arr = byContrat.get(s.contrat_id);
    if (arr) arr.push(s);
    else byContrat.set(s.contrat_id, [s]);
  }

  const rows: ContratNonFacture[] = [];
  for (const [contratId, ntSteps] of byContrat) {
    const c = eligibleContrats.get(contratId)!;
    const earliest = ntSteps.reduce((a, b) =>
      a.opening_date! <= b.opening_date! ? a : b,
    );
    const montantNonTransmis = ntSteps.reduce(
      (sum, s) => sum + (s.total_amount ?? 0),
      0,
    );
    const echu = earliest.opening_date! <= today;
    rows.push({
      contratId,
      ref: c.ref,
      contractNumber: c.contract_number,
      apprenti: `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim(),
      formationTitre: c.formation_titre,
      projetRef: c.projet_ref,
      clientRaisonSociale: c.client_raison_sociale,
      cdpNom: cdpNomByContratId.get(contratId) ?? null,
      opco: opcoByContratId.get(contratId) ?? OPCO_NON_RESOLU,
      nonTransmisCount: ntSteps.length,
      prochaineEcheance: earliest.opening_date!,
      montantNonTransmis: Math.round(montantNonTransmis * 100) / 100,
      statut: echu ? 'echu' : 'a_venir',
      retardJours: echu
        ? Math.max(0, diffDaysIso(earliest.opening_date!, today))
        : 0,
    });
  }

  // Échus d'abord, puis par prochaine échéance ; départage par référence.
  rows.sort(
    (a, b) =>
      (a.statut === b.statut ? 0 : a.statut === 'echu' ? -1 : 1) ||
      a.prochaineEcheance.localeCompare(b.prochaineEcheance) ||
      (a.ref ?? a.contractNumber ?? '').localeCompare(
        b.ref ?? b.contractNumber ?? '',
      ),
  );
  return rows;
}

// Forme brute d'une ligne step jointe au contrat (PostgREST embeddings).
interface JoinedProjet {
  ref: string | null;
  cdp_id: string | null;
  clients:
    | { raison_sociale: string | null }
    | { raison_sociale: string | null }[]
    | null;
}

interface JoinedContrat {
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
  projets: JoinedProjet | JoinedProjet[] | null;
}

interface JoinedStepRow {
  contrat_id: string;
  step_number: number;
  opening_date: string | null;
  invoice_state: string | null;
  total_amount: number | null;
  contrats: JoinedContrat | JoinedContrat[] | null;
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface LoadedInputs {
  supabase: ServerClient;
  contrats: AFacturerContratInput[];
  steps: AFacturerStepInput[];
  opcoByContratId: Map<string, string>;
  cdpIdByContratId: Map<string, string>;
}

/**
 * Charge les échéances OPCO non transmises (invoice_state null) visibles par
 * l'utilisateur courant (RLS : CDP = ses projets, admin = tout) et assemble
 * les inputs du noyau pur : contrats, steps, OPCO résolu, cdp responsable.
 * `maxOpeningDate` borne (optionnel) aux échéances déjà ouvertes.
 */
async function loadContratStepInputs(opts: {
  maxOpeningDate?: string;
}): Promise<LoadedInputs> {
  const supabase = await createClient();

  let query = supabase
    .from('eduvia_invoice_steps')
    .select(
      `contrat_id, step_number, opening_date, invoice_state, total_amount,
       contrats!inner (
         id, ref, contract_number, apprenant_prenom, apprenant_nom,
         formation_titre, contract_state, archive, facturation_verrouillee,
         eduvia_company_id, source_client_id,
         projets!inner ( ref, cdp_id, clients!inner ( raison_sociale ) )
       )`,
    )
    .is('invoice_state', null);
  if (opts.maxOpeningDate)
    query = query.lte('opening_date', opts.maxOpeningDate);

  const { data, error } = await query;
  if (error) {
    logger.error('queries.contrats-a-facturer', 'fetch failed', { error });
    return {
      supabase,
      contrats: [],
      steps: [],
      opcoByContratId: new Map(),
      cdpIdByContratId: new Map(),
    };
  }

  const rows = (data ?? []) as unknown as JoinedStepRow[];

  const contratsById = new Map<string, AFacturerContratInput>();
  const steps: AFacturerStepInput[] = [];
  const cdpIdByContratId = new Map<string, string>();
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
    if (contratsById.has(c.id)) continue;
    const projet = unwrap(c.projets);
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
    if (projet?.cdp_id) cdpIdByContratId.set(c.id, projet.cdp_id);
    if (c.source_client_id && c.eduvia_company_id != null) {
      companyKeyByContrat.set(c.id, {
        clientId: c.source_client_id,
        eduviaId: c.eduvia_company_id,
      });
      clientIds.add(c.source_client_id);
      eduviaIds.add(c.eduvia_company_id);
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

  return {
    supabase,
    contrats: [...contratsById.values()],
    steps,
    opcoByContratId,
    cdpIdByContratId,
  };
}

/**
 * Contrats à facturer (échu) visibles par l'utilisateur courant. ~3 requêtes.
 */
export async function getContratsAFacturer(): Promise<ContratAFacturer[]> {
  const today = toLocalISODate(new Date());
  const { contrats, steps, opcoByContratId } = await loadContratStepInputs({
    maxOpeningDate: today,
  });
  return selectContratsAFacturer({ contrats, steps, opcoByContratId, today });
}

/**
 * Supervision superadmin : TOUS les contrats avec une échéance OPCO non
 * transmise (échu + à venir), tous CDP. RLS admin = tout.
 */
export async function getContratsNonFacturesGlobal(): Promise<
  ContratNonFacture[]
> {
  const today = toLocalISODate(new Date());
  const { supabase, contrats, steps, opcoByContratId, cdpIdByContratId } =
    await loadContratStepInputs({});

  // Noms des CDP responsables (projet.cdp_id -> users).
  const cdpNomByContratId = new Map<string, string>();
  const cdpIds = [...new Set(cdpIdByContratId.values())];
  if (cdpIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, prenom, nom')
      .in('id', cdpIds);
    const nameById = new Map<string, string>();
    for (const u of users ?? []) {
      nameById.set(u.id, `${u.prenom ?? ''} ${u.nom ?? ''}`.trim());
    }
    for (const [contratId, cdpId] of cdpIdByContratId) {
      const name = nameById.get(cdpId);
      if (name) cdpNomByContratId.set(contratId, name);
    }
  }

  return selectContratsNonFactures({
    contrats,
    steps,
    opcoByContratId,
    cdpNomByContratId,
    today,
  });
}
