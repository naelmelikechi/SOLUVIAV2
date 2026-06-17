import type { SupabaseClient } from '@supabase/supabase-js';
import { renderFacturePdfBuffer } from '@/lib/utils/render-facture-pdf';
import {
  EMETTEUR_FALLBACK,
  mapSocieteToEmetteur,
  type EmetteurInfo,
  type SocieteEmettriceRow,
} from '@/lib/queries/parametres';
import type { OdooClient } from '@/lib/odoo/client';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'odoo.attach-pdf';

// Re-genere le PDF facture cote serveur (en mode cron : pas de session
// utilisateur, donc on utilise le client supabase admin passe en parametre)
// et attache au account.move Odoo correspondant via ir.attachment.
//
// Idempotent : si une ir.attachment du meme nom existe deja, skip cote client.
//
// Best-effort : on log + return false en cas d'erreur, le sync continue.
// Le PDF cote Odoo est un bonus (compta a deja le sien generate par Odoo),
// la facture reste correctement poussee meme si l'attach echoue.
export async function pushFacturePdfToOdoo(
  supabase: SupabaseClient,
  odoo: OdooClient,
  factureId: string,
  // Override du nom de la piece jointe. Par defaut `${ref}.pdf`. Permet de
  // ré-attacher un PDF corrigé sans ecraser l'original (nom distinct).
  nameOverride?: string,
): Promise<{
  ok: boolean;
  skipped?: boolean;
  attachment_id?: number | null;
  error?: string;
}> {
  // Re-fetch la facture avec la meme shape que getFactureByRef (le PDF en a
  // besoin pour rendre lignes/projet/client).
  const { data: facture, error: fErr } = await supabase
    .from('factures')
    .select(
      `
      id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
      montant_ht, taux_tva, montant_tva, montant_ttc,
      statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by, objet, conditions_reglement,
      societe_emettrice_id, odoo_id,
      projet:projets!factures_projet_id_fkey(id, ref),
      client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
      lignes:facture_lignes(id, contrat_id, description, montant_ht, opco_code, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
    `,
    )
    .eq('id', factureId)
    .order('ordre', { foreignTable: 'lignes', nullsFirst: false })
    .single();

  if (fErr || !facture || !facture.odoo_id || !facture.ref) {
    return {
      ok: false,
      error: fErr?.message ?? 'facture/odoo_id/ref manquants',
    };
  }

  // Resolve origine ref pour les avoirs (affiche "Avoir sur FAC-XXX" dans le
  // PDF) + emetteur en parallele.
  let origineRef: string | null = null;
  if (facture.est_avoir && facture.facture_origine_id) {
    const { data: o } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', facture.facture_origine_id)
      .single();
    origineRef = o?.ref ?? null;
  }

  let emetteur: EmetteurInfo = EMETTEUR_FALLBACK;
  let emetteurOdooCompanyId: number | null = null;
  if (facture.societe_emettrice_id) {
    const { data: e } = await supabase
      .from('societes_emettrices')
      .select('*')
      .eq('id', facture.societe_emettrice_id)
      .maybeSingle();
    if (e) {
      const societe = e as SocieteEmettriceRow;
      emetteur = mapSocieteToEmetteur(societe);
      emetteurOdooCompanyId = societe.odoo_company_id;
    }
  }

  let pdfBuffer: Buffer;
  try {
    const raw = await renderFacturePdfBuffer({
      // Le type de FacturePdf attend FactureDetail (le retour exact de
      // getFactureByRef). Notre select ici est identique, mais TS ne le sait
      // pas a cause des PostgREST embeds typés en arrays. Cast safe.
      facture: facture as never,
      origineRef,
      emetteur,
    });
    pdfBuffer = Buffer.from(raw);
  } catch (err) {
    return {
      ok: false,
      error: `render PDF: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const result = await odoo.attachInvoicePdf({
      move_odoo_id: facture.odoo_id,
      name: nameOverride ?? `${facture.ref}.pdf`,
      pdf_base64: pdfBuffer.toString('base64'),
      company_id: emetteurOdooCompanyId,
    });
    logger.info(SCOPE, 'Attached', {
      facture_id: facture.id,
      ref: facture.ref,
      ...result,
    });
    return { ok: true, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
