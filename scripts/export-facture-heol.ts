/**
 * Export Excel detaille d'une facture HEOL ACADEMY (brouillon en cours).
 * Genere ~/Downloads/facture-heol-<ref>-<date>.xlsx avec 3 feuilles :
 *   - Resume : entete facture + totaux
 *   - Lignes : 1 ligne par facture_lignes avec full details + contrat lie
 *   - Pivot par contrat : agregation montant_ht par contrat
 *
 * Usage : npx tsx --env-file=.env.local scripts/export-facture-heol.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

const FACTURE_ID = '6a6d7f6a-58a6-4792-8b22-5b34ccfdb6c9';

async function main() {
  const supabase = createAdminClient();

  // 1. Header facture
  const { data: facture, error: factErr } = await supabase
    .from('factures')
    .select('*')
    .eq('id', FACTURE_ID)
    .single();

  if (factErr || !facture) {
    console.error('Facture introuvable:', factErr?.message);
    process.exit(1);
  }

  // 2. Lignes + contrats
  const { data: lignes, error: lignesErr } = await supabase
    .from('facture_lignes')
    .select(
      `
      id,
      event_type,
      event_source_id,
      description,
      mois_relatif,
      quote_part,
      npec_snapshot,
      taux_commission_snapshot,
      montant_ht,
      est_avoir,
      contrat:contrats (
        ref,
        contract_number,
        internal_number,
        apprenant_nom,
        apprenant_prenom,
        formation_titre,
        contract_type,
        contract_state,
        date_debut,
        date_fin,
        duree_mois,
        npec_amount,
        support,
        support_first_equipment,
        referrer_name,
        referrer_amount,
        referrer_type,
        eduvia_id
      )
    `,
    )
    .eq('facture_id', FACTURE_ID)
    .order('contrat_id', { ascending: true });

  if (lignesErr || !lignes) {
    console.error('Lignes introuvables:', lignesErr?.message);
    process.exit(1);
  }

  console.log(`${lignes.length} lignes recuperees`);

  // ----- Sheet 1: Resume -----
  const resumeRows = [
    {
      Champ: 'Ref facture',
      Valeur: facture.ref ?? '(brouillon, pas encore numerote)',
    },
    { Champ: 'Statut', Valeur: facture.statut },
    { Champ: 'Projet', Valeur: '0016-HEO-APP' },
    { Champ: 'Client', Valeur: 'HEOL ACADEMY' },
    { Champ: 'Date creation', Valeur: facture.created_at },
    { Champ: 'Montant HT', Valeur: Number(facture.montant_ht) },
    { Champ: 'Montant TTC', Valeur: Number(facture.montant_ttc) },
    {
      Champ: 'TVA (20%)',
      Valeur: Number(facture.montant_ttc) - Number(facture.montant_ht),
    },
    { Champ: 'Nombre de lignes', Valeur: lignes.length },
    {
      Champ: 'Nombre de contrats distincts',
      Valeur: new Set(
        lignes
          .map((l) => (l.contrat as { ref?: string } | null)?.ref)
          .filter(Boolean),
      ).size,
    },
    {
      Champ: 'Somme montant_ht (verif)',
      Valeur: lignes.reduce((s, l) => s + Number(l.montant_ht), 0),
    },
  ];

  // ----- Sheet 2: Detail lignes -----
  type LigneRow = {
    ligne_id: string;
    event_type: string | null;
    description: string | null;
    mois_relatif: number | null;
    quote_part_pct: number | null;
    npec_snapshot: number | null;
    taux_commission_pct: number | null;
    montant_ht: number;
    est_avoir: boolean;
    contrat_ref: string | null;
    contract_number: string | null;
    internal_number: string | null;
    apprenant: string;
    formation: string | null;
    contract_type: string | null;
    contract_state: string | null;
    date_debut: string | null;
    date_fin: string | null;
    duree_mois: number | null;
    npec_amount_contrat: number | null;
    support: number | null;
    support_first_equipment: number | null;
    referrer_name: string | null;
    referrer_amount: number | null;
    referrer_type: string | null;
    eduvia_id: number | null;
    base_calcul_npec: number | null;
    montant_attendu_40pct: number | null;
    ecart: number | null;
  };

  const detailRows: LigneRow[] = lignes.map((l) => {
    const c = (l.contrat ?? null) as null | Record<string, unknown>;
    const npec = l.npec_snapshot != null ? Number(l.npec_snapshot) : null;
    const taux =
      l.taux_commission_snapshot != null
        ? Number(l.taux_commission_snapshot)
        : null;
    const expected =
      npec != null && taux != null ? Math.round(npec * taux) / 100 : null;
    const montantHt = Number(l.montant_ht);
    return {
      ligne_id: l.id,
      event_type: l.event_type,
      description: l.description,
      mois_relatif: l.mois_relatif,
      quote_part_pct: l.quote_part != null ? Number(l.quote_part) * 100 : null,
      npec_snapshot: npec,
      taux_commission_pct: taux,
      montant_ht: montantHt,
      est_avoir: l.est_avoir,
      contrat_ref: (c?.ref ?? null) as string | null,
      contract_number: (c?.contract_number ?? null) as string | null,
      internal_number: (c?.internal_number ?? null) as string | null,
      apprenant: c
        ? `${(c.apprenant_nom ?? '') as string} ${(c.apprenant_prenom ?? '') as string}`.trim()
        : '',
      formation: (c?.formation_titre ?? null) as string | null,
      contract_type: (c?.contract_type ?? null) as string | null,
      contract_state: (c?.contract_state ?? null) as string | null,
      date_debut: (c?.date_debut ?? null) as string | null,
      date_fin: (c?.date_fin ?? null) as string | null,
      duree_mois: (c?.duree_mois ?? null) as number | null,
      npec_amount_contrat:
        c?.npec_amount != null ? Number(c.npec_amount) : null,
      support: c?.support != null ? Number(c.support) : null,
      support_first_equipment:
        c?.support_first_equipment != null
          ? Number(c.support_first_equipment)
          : null,
      referrer_name: (c?.referrer_name ?? null) as string | null,
      referrer_amount:
        c?.referrer_amount != null ? Number(c.referrer_amount) : null,
      referrer_type: (c?.referrer_type ?? null) as string | null,
      eduvia_id: (c?.eduvia_id ?? null) as number | null,
      base_calcul_npec: npec,
      montant_attendu_40pct: expected,
      ecart:
        expected != null
          ? Math.round((montantHt - expected) * 100) / 100
          : null,
    };
  });

  // ----- Sheet 3: Pivot par contrat -----
  type Pivot = {
    contrat_ref: string;
    contract_number: string;
    apprenant: string;
    formation: string;
    contract_type: string;
    npec_amount_contrat: number;
    nb_lignes: number;
    base_npec_facture: number;
    montant_ht_total: number;
  };

  const pivotMap = new Map<string, Pivot>();
  for (const r of detailRows) {
    const key = r.contrat_ref ?? '(sans contrat)';
    const existing = pivotMap.get(key);
    if (existing) {
      existing.nb_lignes++;
      existing.base_npec_facture += r.npec_snapshot ?? 0;
      existing.montant_ht_total += r.montant_ht;
    } else {
      pivotMap.set(key, {
        contrat_ref: key,
        contract_number: r.contract_number ?? '',
        apprenant: r.apprenant,
        formation: r.formation ?? '',
        contract_type: r.contract_type ?? '',
        npec_amount_contrat: r.npec_amount_contrat ?? 0,
        nb_lignes: 1,
        base_npec_facture: r.npec_snapshot ?? 0,
        montant_ht_total: r.montant_ht,
      });
    }
  }
  const pivotRows = Array.from(pivotMap.values())
    .map((p) => ({
      ...p,
      base_npec_facture: Math.round(p.base_npec_facture * 100) / 100,
      montant_ht_total: Math.round(p.montant_ht_total * 100) / 100,
      ratio_base_npec: p.npec_amount_contrat
        ? Math.round((p.base_npec_facture / p.npec_amount_contrat) * 10000) /
          100
        : null,
    }))
    .sort((a, b) => a.contract_number.localeCompare(b.contract_number));

  // ----- Build workbook -----
  const wb = XLSX.utils.book_new();
  const wsResume = XLSX.utils.json_to_sheet(resumeRows);
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  const wsPivot = XLSX.utils.json_to_sheet(pivotRows);
  XLSX.utils.book_append_sheet(wb, wsResume, 'Resume');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail lignes');
  XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot par contrat');

  const outPath = resolve(
    homedir(),
    'Downloads',
    `facture-heol-brouillon-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(outPath, buf);

  console.log(`\nExport OK : ${outPath}`);
  console.log(`   Resume       : ${resumeRows.length} lignes`);
  console.log(`   Detail       : ${detailRows.length} lignes`);
  console.log(`   Pivot        : ${pivotRows.length} contrats`);
  console.log(
    `   Somme montant_ht (lignes) : ${detailRows
      .reduce((s, l) => s + l.montant_ht, 0)
      .toFixed(2)}`,
  );
  console.log(
    `   Montant facture HT        : ${Number(facture.montant_ht).toFixed(2)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
