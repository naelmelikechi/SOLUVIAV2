/**
 * Rend le PDF d'une facture (par id) en local, pour verification visuelle
 * "sur papier" sans passer par l'app. Utilise le meme composant FacturePdf +
 * le meme select que getFactureByRef/attach-pdf -> rendu fidele a la prod.
 *
 * Usage : npx tsx scripts/preview-facture-pdf.ts <factureId> [outPath]
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env.local') });

import { createElement } from 'react';
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { renderToBuffer } from '@react-pdf/renderer';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { createClient } from '@supabase/supabase-js';
import {
  EMETTEUR_FALLBACK,
  mapSocieteToEmetteur,
  type EmetteurInfo,
  type SocieteEmettriceRow,
} from '@/lib/queries/parametres';
import type { FactureDetail } from '@/lib/queries/factures';

const SELECT = `
  id, ref, numero_seq, date_emission, date_echeance, mois_concerne,
  montant_ht, taux_tva, montant_tva, montant_ttc,
  statut, est_avoir, avoir_motif, facture_origine_id, email_envoye, created_by, objet, conditions_reglement,
  societe_emettrice_id, odoo_id,
  projet:projets!factures_projet_id_fkey(id, ref),
  client:clients!factures_client_id_fkey(id, trigramme, raison_sociale, siret, adresse, localisation, tva_intracommunautaire),
  lignes:facture_lignes(id, contrat_id, description, montant_ht, opco_code, contrat:contrats!facture_lignes_contrat_id_fkey(ref, contract_number, apprenant_nom, apprenant_prenom))
`;

async function main(): Promise<void> {
  const factureId = process.argv[2];
  const outPath = process.argv[3] ?? '/tmp/facture-preview.pdf';
  if (!factureId)
    throw new Error('Usage: preview-facture-pdf.ts <factureId> [outPath]');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants',
    );
  const supabase = createClient(url, key);

  const { data: facture, error } = await supabase
    .from('factures')
    .select(SELECT)
    .eq('id', factureId)
    .order('ordre', { foreignTable: 'lignes', nullsFirst: false })
    .single();
  if (error || !facture)
    throw new Error(error?.message ?? 'facture introuvable');

  let emetteur: EmetteurInfo = EMETTEUR_FALLBACK;
  const societeId = (facture as { societe_emettrice_id?: string | null })
    .societe_emettrice_id;
  if (societeId) {
    const { data: soc } = await supabase
      .from('societes_emettrices')
      .select('*')
      .eq('id', societeId)
      .maybeSingle();
    if (soc) emetteur = mapSocieteToEmetteur(soc as SocieteEmettriceRow);
  }

  // PostgREST type les embeds en arrays ; le runtime renvoie la shape exacte
  // attendue par FacturePdf (boundary lib -> cast unchecked unique).
  const element = createElement(FacturePdf, {
    facture: facture as unknown as FactureDetail,
    emetteur,
    logoSrc: null,
  });
  const buf = await renderToBuffer(
    element as unknown as Parameters<typeof renderToBuffer>[0],
  );
  writeFileSync(outPath, Buffer.from(buf));
  console.log(`written ${buf.length} bytes -> ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
