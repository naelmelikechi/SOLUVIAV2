// Primitives partagees entre les actions brouillon (PAS un module 'use
// server' : rien ici n'est une action, uniquement des schemas/types/helpers).
//
// Pourquoi ces schemas : RLS bloque les acces non autorises mais ne contraint
// pas le type. Sans ces guards, un client peut poster montants=NaN,
// ids=garbage ou arrays de 100k items et corrompre les donnees / ouvrir un
// DoS.

import { z } from 'zod';
import type { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { addDaysIso } from '@/lib/utils/dates';
import { getDelaiEcheanceJours } from '@/lib/queries/parametres';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';

export const uuidSchema = (label: string) =>
  z.string().uuid(`${label} doit être un UUID`);

export const montantHtSchema = z
  .number()
  .finite('Montant doit être un nombre fini')
  .gte(-10_000_000, 'Montant aberrant')
  .lte(10_000_000, 'Montant aberrant');

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (attendu YYYY-MM-DD)');

export type SupabaseServerClient = Extract<
  Awaited<ReturnType<typeof checkAuth>>,
  { ok: true }
>['supabase'];

// ---------------------------------------------------------------------------
// Helper partage : insert brouillon facture + lignes
// ---------------------------------------------------------------------------
// Mecanique commune entre createBlankBrouillon (facture rattachee projet),
// createFreeBrouillon (facture libre) et createBrouillonEcheancier (jalons
// dus). Calcule la TVA en cents entiers pour preserver l'invariant
// SUM(facture_lignes.montant_ht) == factures.montant_ht et rollback la
// facture si l'insert des lignes echoue (autorise tant que statut='a_emettre'
// car aucun numero gapless n'est consomme). Caller responsable de l'auth,
// de l'audit et des revalidatePath.

export interface BrouillonLigneInsert {
  contrat_id: string | null;
  description: string;
  montant_ht: number;
  mois_relatif: number;
  quote_part: number;
  npec_snapshot: number;
  taux_commission_snapshot: number;
}

export async function insertBrouillonWithLignes(args: {
  supabase: SupabaseServerClient;
  userId: string;
  projetId: string;
  clientId: string;
  lignes: BrouillonLigneInsert[];
  logScope: string;
  societeEmettriceId?: string;
  /** Surcharge le mois concerné (défaut : mois courant YYYY-MM). */
  moisConcerne?: string;
}): Promise<
  | { ok: true; factureId: string; totalHt: number }
  | { ok: false; error: string }
> {
  const { supabase, userId, projetId, clientId, lignes, logScope } = args;
  const societeEmettriceIdFinal =
    args.societeEmettriceId ?? (await getDefaultSocieteEmettriceId());

  const totalHtCents = lignes.reduce(
    (s, l) => s + Math.round(l.montant_ht * 100),
    0,
  );
  if (totalHtCents <= 0) {
    return { ok: false, error: 'Montant total nul ou négatif' };
  }

  // TVA : 0% si client UE non-FR (autoliquidation), sinon 20%.
  const { data: clientTva } = await supabase
    .from('clients')
    .select('tva_intracommunautaire')
    .eq('id', clientId)
    .single();
  const tauxTva = resolveTvaRegime(clientTva?.tva_intracommunautaire).taux;
  const montantTvaCents = Math.round((totalHtCents * tauxTva) / 100);
  const totalHt = totalHtCents / 100;
  const montantTva = montantTvaCents / 100;
  const montantTtc = (totalHtCents + montantTvaCents) / 100;

  const today = new Date();
  const dateEmissionStr = today.toISOString().split('T')[0]!;
  const delaiJours = await getDelaiEcheanceJours(supabase);
  const dateEcheanceStr = addDaysIso(dateEmissionStr, delaiJours);

  const { data: facture, error: insertError } = await supabase
    .from('factures')
    .insert({
      societe_emettrice_id: societeEmettriceIdFinal,
      projet_id: projetId,
      client_id: clientId,
      date_emission: dateEmissionStr,
      date_echeance: dateEcheanceStr,
      mois_concerne: args.moisConcerne ?? today.toISOString().slice(0, 7),
      montant_ht: totalHt,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      statut: 'a_emettre',
      est_avoir: false,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !facture) {
    logger.error('actions.factures', `${logScope} insert failed`, {
      error: insertError,
      clientId,
      projetId,
    });
    return {
      ok: false,
      error: insertError?.message ?? 'Échec de la création du brouillon',
    };
  }

  const { error: lignesError } = await supabase
    .from('facture_lignes')
    .insert(lignes.map((l) => ({ ...l, facture_id: facture.id })));

  if (lignesError) {
    await supabase.from('factures').delete().eq('id', facture.id);
    logger.error('actions.factures', `${logScope} lignes failed`, {
      factureId: facture.id,
      error: lignesError,
    });
    return { ok: false, error: lignesError.message };
  }

  return { ok: true, factureId: facture.id, totalHt };
}
