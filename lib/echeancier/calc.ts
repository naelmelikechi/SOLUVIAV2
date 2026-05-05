// Source unique de verite pour le calcul des jalons de facturation.
// Utilise par : cron echeances, createFactures, recompute NPEC, rupture.
//
// Concepts :
// - jalon : { mois_relatif, quote_part, label? } : un jalon = 1 emission
//   facturable, exprime en fraction de (NPEC × taux/100).
// - template : ensemble nomme de jalons reutilisable.
// - override : tableau JSONB local au projet, surcharge le template.
//
// Resolution effective :
//   echeancier_override (si non NULL) > template (si template_id) > default global

// Pas d'import date-fns : on utilise UTC pur pour eviter les bugs timezone
// (l'app peut tourner en CET/CEST en local et UTC en prod Vercel).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Jalon {
  mois_relatif: number;
  quote_part: number;
  label?: string;
}

export interface ContratEcheancierContext {
  contrat_id: string;
  npec_amount: number;
  date_debut: string; // ISO yyyy-mm-dd
  duree_mois: number;
  archive: boolean;
}

export interface JalonContribution {
  contrat_id: string;
  mois_absolu: string; // ISO yyyy-mm-dd, 1er du mois
  mois_relatif: number;
  quote_part: number;
  npec_snapshot: number;
  montant_ht: number;
}

export interface EcheanceProjetAggregee {
  projet_id: string;
  mois_concerne: string; // ISO yyyy-mm-dd, 1er du mois
  date_emission_prevue: string; // 25 du mois
  montant_prevu_ht: number;
  contributions: JalonContribution[];
}

// ---------------------------------------------------------------------------
// Helpers de base
// ---------------------------------------------------------------------------

/** Round half-up a 2 decimales (cohérent avec le reste de l'app, evite les flottants) */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ISO yyyy-mm-dd du 1er du mois M+x relatif a date_debut. UTC pur. */
export function moisAbsoluFromRelatif(
  dateDebut: string,
  moisRelatif: number,
): string {
  const [yStr, mStr] = dateDebut.split('-');
  const y = Number(yStr);
  const m = Number(mStr); // 1-12
  if (!y || !m) return dateDebut;
  // Date.UTC accepte month 0-indexed et roule automatiquement les debordements.
  const target = new Date(Date.UTC(y, m - 1 + moisRelatif, 1));
  return target.toISOString().split('T')[0]!;
}

/** Le 25 du mois est la date d'emission prevue par defaut. UTC pur. */
export function dateEmissionPrevuePourMois(moisAbsolu: string): string {
  const [yStr, mStr] = moisAbsolu.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return moisAbsolu;
  const d = new Date(Date.UTC(y, m - 1, 25));
  return d.toISOString().split('T')[0]!;
}

/**
 * Nombre de mois (avec fraction) entre deux dates UTC. Utilise pour le pro-rata.
 * Exemple : 2026-01-01 -> 2026-07-01 = 6.0 (exact).
 */
function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const months = (ty - fy) * 12 + (tm - fm);
  const dayFraction = (td - fd) / 30; // approximation acceptable
  return months + dayFraction;
}

// ---------------------------------------------------------------------------
// Validation d'un set de jalons
// ---------------------------------------------------------------------------

export interface JalonsValidation {
  ok: boolean;
  total: number;
  errors: string[];
  warnings: string[];
}

/**
 * Verifie qu'un tableau de jalons est exploitable.
 * - tous les mois_relatif >= 1 et entiers
 * - quote_part > 0
 * - pas de doublon mois_relatif
 * - somme typiquement = 1.0 (warning si different mais valide)
 */
export function validateJalons(jalons: Jalon[]): JalonsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (jalons.length === 0) errors.push('Au moins un jalon requis');

  const seenMois = new Set<number>();
  for (const j of jalons) {
    if (!Number.isInteger(j.mois_relatif) || j.mois_relatif < 1) {
      errors.push(`mois_relatif invalide : ${j.mois_relatif}`);
    }
    if (typeof j.quote_part !== 'number' || j.quote_part <= 0) {
      errors.push(`quote_part invalide pour M+${j.mois_relatif}`);
    }
    if (seenMois.has(j.mois_relatif)) {
      errors.push(`Doublon mois_relatif M+${j.mois_relatif}`);
    }
    seenMois.add(j.mois_relatif);
  }

  const total = jalons.reduce((sum, j) => sum + (j.quote_part ?? 0), 0);
  // Tolerance d'arrondi 0.01 = 1%
  if (Math.abs(total - 1.0) > 0.01) {
    const twelfths = total * 12;
    const totalLabel =
      Math.abs(twelfths - Math.round(twelfths)) < 0.05
        ? `${Math.round(twelfths)}/12`
        : `${twelfths.toFixed(1)}/12`;
    warnings.push(`Total = ${totalLabel} (attendu 12/12)`);
  }

  return { ok: errors.length === 0, total, errors, warnings };
}

// ---------------------------------------------------------------------------
// Calcul d'une contribution unitaire
// ---------------------------------------------------------------------------

/**
 * Calcule la contribution d'UN contrat sur UN jalon.
 * Retourne null si le jalon depasse la duree du contrat (= pas facturable).
 */
export function computeJalonContribution(
  contrat: ContratEcheancierContext,
  jalon: Jalon,
  tauxCommission: number,
): JalonContribution | null {
  // Ignore si contrat archive (pas de production)
  if (contrat.archive) return null;
  // Ignore si le jalon depasse la duree du contrat
  if (jalon.mois_relatif > contrat.duree_mois) return null;
  // Ignore si NPEC ou taux invalides (echeance a 0 inutile)
  if (contrat.npec_amount <= 0 || tauxCommission <= 0) return null;

  const baseTotal = (contrat.npec_amount * tauxCommission) / 100;
  const montant = round2(baseTotal * jalon.quote_part);
  if (montant <= 0) return null;

  return {
    contrat_id: contrat.contrat_id,
    mois_absolu: moisAbsoluFromRelatif(contrat.date_debut, jalon.mois_relatif),
    mois_relatif: jalon.mois_relatif,
    quote_part: jalon.quote_part,
    npec_snapshot: contrat.npec_amount,
    montant_ht: montant,
  };
}

// ---------------------------------------------------------------------------
// Aggregation au niveau projet : un mois calendaire = somme contributions
// ---------------------------------------------------------------------------

/**
 * Aggrege les contributions de tous les contrats d'un projet en echeances
 * projet/mois. Un contrat avec date_debut differente contribue sur un mois
 * calendaire different : le groupage se fait sur mois_absolu.
 */
export function aggregateProjetEcheances(
  projetId: string,
  contrats: ContratEcheancierContext[],
  jalons: Jalon[],
  tauxCommission: number,
): EcheanceProjetAggregee[] {
  const byMois = new Map<string, JalonContribution[]>();

  for (const contrat of contrats) {
    for (const jalon of jalons) {
      const c = computeJalonContribution(contrat, jalon, tauxCommission);
      if (!c) continue;
      const arr = byMois.get(c.mois_absolu) ?? [];
      arr.push(c);
      byMois.set(c.mois_absolu, arr);
    }
  }

  return Array.from(byMois.entries())
    .map(([mois, contributions]) => ({
      projet_id: projetId,
      mois_concerne: mois,
      date_emission_prevue: dateEmissionPrevuePourMois(mois),
      montant_prevu_ht: round2(
        contributions.reduce((s, c) => s + c.montant_ht, 0),
      ),
      contributions,
    }))
    .sort((a, b) => a.mois_concerne.localeCompare(b.mois_concerne));
}

// ---------------------------------------------------------------------------
// Resolution du template effectif d'un projet
// ---------------------------------------------------------------------------

export interface ProjetEcheancierConfig {
  /** JSONB override local au projet */
  echeancier_override: unknown;
  /** Template assignement explicite */
  echeancier_template_id: string | null;
}

export interface ResolvedEcheancier {
  jalons: Jalon[];
  source: 'override' | 'template' | 'default';
  template_id?: string;
  template_nom?: string;
}

/**
 * A partir d'un projet et de la liste des templates dispos,
 * resout le set de jalons a appliquer.
 *
 * Priorite :
 *   1. echeancier_override (si non NULL et valide)
 *   2. echeancier_template_id (template assigne explicitement)
 *   3. template global is_default = true
 *   4. fallback : tableau vide (cas d'echec, cron emet rien)
 */
export function resolveProjetEcheancier(
  projet: ProjetEcheancierConfig,
  templates: Array<{
    id: string;
    nom: string;
    jalons: unknown;
    is_default: boolean;
  }>,
): ResolvedEcheancier {
  // 1. Override JSONB
  if (projet.echeancier_override) {
    const jalons = parseJalons(projet.echeancier_override);
    if (jalons.length > 0) {
      return { jalons, source: 'override' };
    }
  }

  // 2. Template assigne
  if (projet.echeancier_template_id) {
    const t = templates.find((x) => x.id === projet.echeancier_template_id);
    if (t) {
      const jalons = parseJalons(t.jalons);
      return {
        jalons,
        source: 'template',
        template_id: t.id,
        template_nom: t.nom,
      };
    }
  }

  // 3. Defaut global
  const def = templates.find((t) => t.is_default);
  if (def) {
    const jalons = parseJalons(def.jalons);
    return {
      jalons,
      source: 'default',
      template_id: def.id,
      template_nom: def.nom,
    };
  }

  return { jalons: [], source: 'default' };
}

/** Parse un JSONB en Jalon[] avec validation defensive */
export function parseJalons(raw: unknown): Jalon[] {
  if (!Array.isArray(raw)) return [];
  const out: Jalon[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.mois_relatif !== 'number' ||
      typeof r.quote_part !== 'number'
    ) {
      continue;
    }
    out.push({
      mois_relatif: r.mois_relatif,
      quote_part: r.quote_part,
      label: typeof r.label === 'string' ? r.label : undefined,
    });
  }
  return out.sort((a, b) => a.mois_relatif - b.mois_relatif);
}

// ---------------------------------------------------------------------------
// Recompute on NPEC change : delta a emettre/avoir
// ---------------------------------------------------------------------------

export interface BilledLine {
  /** Reference de la facture origine (juste pour breakdown) */
  facture_id: string;
  facture_ref: string;
  /** Montant HT facture (positif pour facture standard, negatif pour avoir) */
  montant_ht: number;
  /** Snapshot du NPEC au moment de l'emission */
  npec_snapshot: number;
  /** Snapshot du taux commission */
  taux_commission_snapshot: number;
  /** Quote_part utilisee */
  quote_part: number;
}

export interface DerivanceResult {
  /** delta_ht > 0 : facture complementaire a emettre ; < 0 : avoir */
  delta_ht: number;
  /** Detail par facture : ce qui aurait du etre facture vs ce qui l'a ete */
  breakdown: Array<{
    facture_id: string;
    facture_ref: string;
    montant_emis: number;
    montant_attendu: number;
    delta_ligne: number;
  }>;
}

/**
 * Calcule la derive entre montants emis (snapshot) et montants attendus
 * avec le NPEC actuel. Positive = sous-facture (a emettre), negative = sur-facture (avoir).
 *
 * Utilise dans le hook NPEC change : si npec change, on appelle cette fonction
 * sur toutes les facture_lignes du contrat, et on cumule pour proposer un
 * ajustement.
 */
export function computeDerivance(
  npecActuel: number,
  tauxCommissionActuel: number,
  billedLines: BilledLine[],
): DerivanceResult {
  const breakdown: DerivanceResult['breakdown'] = [];
  let delta = 0;

  for (const line of billedLines) {
    const baseAttendu = (npecActuel * tauxCommissionActuel) / 100;
    const montantAttendu = round2(baseAttendu * line.quote_part);
    const deltaLigne = round2(montantAttendu - line.montant_ht);
    delta += deltaLigne;
    breakdown.push({
      facture_id: line.facture_id,
      facture_ref: line.facture_ref,
      montant_emis: line.montant_ht,
      montant_attendu: montantAttendu,
      delta_ligne: deltaLigne,
    });
  }

  return { delta_ht: round2(delta), breakdown };
}

// ---------------------------------------------------------------------------
// Pro-rata sur rupture anticipee
// ---------------------------------------------------------------------------

export interface ProrataRuptureResult {
  /** Montant total a "rendre" (avoir) en HT */
  avoir_total_ht: number;
  /** Detail par facture origine */
  breakdown: Array<{
    facture_id: string;
    facture_ref: string;
    montant_facture: number;
    pct_realise: number;
    montant_avoir: number;
  }>;
}

/**
 * Calcule l'avoir pro-rata pour rupture anticipee.
 * Pour chaque facture emise sur ce contrat, on rend la portion non realisee
 * (= duree_realisee / duree_totale × montant_facture).
 *
 * Note : le pro-rata est calcule au niveau du contrat global (linear) et
 * applique uniformement aux factures emises. Les jalons peuvent etre non-
 * lineaires (ex: 3/12 au M+3) mais le pro-rata reste lineaire pour rester
 * coherent avec le pattern actuel. Si tu veux du jalon-aware, c'est une V2.
 */
export function computeProrataRupture(
  contrat: { date_debut: string; duree_mois: number },
  dateRupture: string,
  billedLines: BilledLine[],
): ProrataRuptureResult {
  const realiseeMois = Math.max(
    0,
    Math.min(
      contrat.duree_mois,
      monthsBetween(contrat.date_debut, dateRupture),
    ),
  );
  const pctRealise =
    contrat.duree_mois > 0 ? realiseeMois / contrat.duree_mois : 1;
  const fractionNonRealisee = Math.max(0, Math.min(1, 1 - pctRealise));

  const breakdown = billedLines.map((line) => {
    const montantAvoir = round2(line.montant_ht * fractionNonRealisee);
    return {
      facture_id: line.facture_id,
      facture_ref: line.facture_ref,
      montant_facture: line.montant_ht,
      pct_realise: pctRealise,
      montant_avoir: montantAvoir,
    };
  });

  return {
    avoir_total_ht: round2(breakdown.reduce((s, b) => s + b.montant_avoir, 0)),
    breakdown,
  };
}
