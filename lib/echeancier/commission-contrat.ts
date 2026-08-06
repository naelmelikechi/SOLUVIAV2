import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  computeCommissionContratComplet,
  parseJalons,
  resolveProjetEcheancier,
  type BilledLine,
} from '@/lib/echeancier/calc';

/**
 * Commission HT que produirait l'echeancier COMPLET d'un contrat.
 *
 * C'est la reference "gagne a 100 %" de `computeProrataRupture`. Extrait de
 * lib/echeancier/ajustements.ts pour etre partage avec le calcul d'avoir de
 * rupture propose dans l'UI (audit #122, constat 15) : les deux chemins
 * calculaient un prorata differemment, l'UI avec un prorata lineaire de
 * 30,4375 jours par mois, le pipeline en jalon-aware. Sur un echeancier
 * front-load, le lineaire sur-remboursait.
 *
 * La base est prise au SNAPSHOT des lignes facturees (npec et taux figes a
 * l'emission) pour rester coherente avec le facture et ne pas se melanger a un
 * changement de NPEC, traite separement par detectNpecChangeAjustement. Le
 * snapshot canonique est celui du plus gros NPEC.
 */
export async function loadTotalCommissionContrat(
  supabase: SupabaseClient<Database>,
  projetConfig: {
    echeancier_template_id: string | null;
    echeancier_override: unknown;
  } | null,
  billedLines: BilledLine[],
  dureeMois: number,
): Promise<number> {
  if (billedLines.length === 0) return 0;

  const canon = billedLines.reduce(
    (best, l) => (l.npec_snapshot > best.npec_snapshot ? l : best),
    billedLines[0]!,
  );
  const base = (canon.npec_snapshot * canon.taux_commission_snapshot) / 100;

  const { data: templates } = await supabase
    .from('echeanciers_templates')
    .select('id, nom, jalons, is_default')
    .eq('archive', false);

  const resolved = resolveProjetEcheancier(
    {
      echeancier_template_id: projetConfig?.echeancier_template_id ?? null,
      echeancier_override: projetConfig?.echeancier_override ?? null,
    },
    (templates ?? []).map((t) => ({
      id: t.id,
      nom: t.nom,
      jalons: t.jalons,
      is_default: t.is_default,
    })),
  );

  return computeCommissionContratComplet(
    base,
    parseJalons(resolved.jalons),
    dureeMois,
  );
}
