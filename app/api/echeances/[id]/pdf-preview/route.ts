import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import type { FactureDetail } from '@/lib/queries/factures';
import { FacturePdf } from '@/components/facturation/facture-pdf';
import { createElement, type ReactElement } from 'react';

/**
 * Draft PDF preview for a pending échéance.
 *
 * Builds a FactureDetail-shaped object in-memory from the échéance row and its
 * projet's active contrats, applying the same commission formula as
 * createFactures() in lib/actions/factures.ts. NOTHING is written to the DB.
 *
 * The PDF is rendered with `isDraft=true` so a clear "APERÇU" banner
 * distinguishes it from a real, legally numbered facture.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: echeance, error } = await supabase
    .from('echeances')
    .select(
      `
      id, mois_concerne, date_emission_prevue, montant_prevu_ht,
      projet:projets!echeances_projet_id_fkey(
        id, ref, taux_commission,
        client:clients!projets_client_id_fkey(id, trigramme, raison_sociale, siret, adresse)
      )
    `,
    )
    .eq('id', id)
    .single();

  if (error || !echeance) {
    return NextResponse.json(
      { error: 'Échéance introuvable' },
      { status: 404 },
    );
  }

  const projet = echeance.projet;
  if (!projet) {
    return NextResponse.json(
      { error: 'Projet de l\u2019échéance introuvable' },
      { status: 404 },
    );
  }

  const { data: contrats } = await supabase
    .from('contrats')
    .select(
      'id, ref, npec_amount, formation_titre, apprenant_prenom, apprenant_nom',
    )
    .eq('projet_id', projet.id)
    .eq('archive', false);

  const tauxCommission = projet.taux_commission ?? 10;

  // Same math as createFactures in lib/actions/factures.ts
  const lignes = (contrats ?? []).map((c, idx) => {
    const montantHt =
      Math.round((((c.npec_amount ?? 0) * tauxCommission) / 100 / 12) * 100) /
      100;
    return {
      id: `draft-line-${idx}`,
      contrat_id: c.id,
      description: `Commission ${tauxCommission}% - ${c.formation_titre ?? ''} - ${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''} - ${echeance.mois_concerne}`,
      montant_ht: montantHt,
      contrat: c.ref
        ? {
            ref: c.ref,
            apprenant_nom: c.apprenant_nom ?? null,
            apprenant_prenom: c.apprenant_prenom ?? null,
          }
        : null,
    };
  });

  const totalHt =
    Math.round(lignes.reduce((s, l) => s + l.montant_ht, 0) * 100) / 100;
  const tauxTva = 20;
  const montantTva = Math.round(totalHt * tauxTva) / 100;
  const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

  const today = new Date();
  const dateEmission = today.toISOString().split('T')[0]!;
  const dateEcheanceDate = new Date(
    today.getFullYear(),
    today.getMonth() + 2,
    0,
  );
  const dateEcheanceStr = dateEcheanceDate.toISOString().split('T')[0]!;

  // Shape a draft FactureDetail. `ref` is a placeholder, numero_seq is 0.
  const draftFacture = {
    id: `draft-${echeance.id}`,
    ref: 'APERÇU',
    numero_seq: 0,
    date_emission: dateEmission,
    date_echeance: dateEcheanceStr,
    mois_concerne: echeance.mois_concerne,
    montant_ht: totalHt,
    taux_tva: tauxTva,
    montant_tva: montantTva,
    montant_ttc: montantTtc,
    statut: 'emise',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_id: null,
    email_envoye: false,
    created_by: null,
    projet: { id: projet.id, ref: projet.ref ?? '' },
    client: projet.client
      ? {
          id: projet.client.id,
          trigramme: projet.client.trigramme ?? '',
          raison_sociale: projet.client.raison_sociale ?? '',
          siret: projet.client.siret ?? null,
          adresse: projet.client.adresse ?? null,
        }
      : null,
    lignes,
  } as unknown as FactureDetail;

  const emetteur = await getEmetteurInfo();

  const element = createElement(FacturePdf, {
    facture: draftFacture,
    emetteur,
    isDraft: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  const buffer = await renderToBuffer(element);
  const uint8 = new Uint8Array(buffer);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="apercu-echeance-${echeance.id}.pdf"`,
      // Short-lived: draft data can change as contracts evolve
      'Cache-Control': 'private, max-age=60',
    },
  });
}
