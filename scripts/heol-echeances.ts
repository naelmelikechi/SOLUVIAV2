/**
 * Vue "prochaines échéances" (reste à facturer) de tous les contrats HEOL.
 *
 * HEOL est en modèle event-based (commission sur règlements OPCO), pas en
 * échéancier calendaire. On réutilise la logique de vérité de l'app :
 *   assembleProjetBillableEvents (pure) + buildResteAFacturer (pure)
 * en chargeant les données via le service-role client (bypass RLS).
 *
 * Quatre natures de reste (toutes HT) :
 *   - facturable  : bordereau OPCO PAYÉ, pas encore facturé -> actionnable
 *   - en attente  : PEDAGOGIE émise (TRANSMIS) non encore payée par l'OPCO
 *   - bloqué      : event 'locked' (IDCC/OPCO/line_type/exclusion) -> data à corriger
 *   - prévisionnel: steps pédago pas encore émis (base support/NPEC x taux)
 *
 * Usage : npx tsx --env-file=.env.local scripts/heol-echeances.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '@/lib/supabase/admin';
import {
  qContrats,
  qInvoiceLines,
  qEmittedSteps,
  qCompaniesIdcc,
  qExistingLignes,
} from '@/lib/queries/billable-events/db';
import { assembleProjetBillableEvents } from '@/lib/queries/billable-events/derive';
import { buildResteAFacturer } from '@/lib/utils/reste-a-facturer';
import { normalizeIdcc } from '@/lib/opco/resolve';

const fmt = (v: number) =>
  v.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function main() {
  const supabase = createAdminClient();

  // 1. Projet HEOL
  const { data: projet } = await supabase
    .from('projets')
    .select(
      'id, ref, taux_commission, client:clients!projets_client_id_fkey(id, raison_sociale, tva_intracommunautaire)',
    )
    .ilike('ref', '%-HEO-%')
    .maybeSingle();
  if (!projet) throw new Error('Projet HEOL introuvable');
  const projetId = projet.id;
  // supabase-js type la relation to-one comme un tableau ; on fige la forme
  // connue du select une seule fois plutôt que de caster à chaque accès.
  const client = projet.client as unknown as {
    id: string;
    raison_sociale: string | null;
    tva_intracommunautaire: string | null;
  };
  console.log(
    `Projet ${projet.ref} - ${client.raison_sociale} - taux ${projet.taux_commission}%\n`,
  );

  // 2. OPCO mapping (réplique getActiveOpcoMapping via admin client)
  const { data: opcos } = await supabase
    .from('opcos')
    .select('code, nom, idcc_codes')
    .eq('actif', true);
  const opcoMapping = new Map<string, { code: string; nom: string }>();
  for (const o of opcos ?? []) {
    for (const raw of (o.idcc_codes as string[] | null) ?? []) {
      const idcc = normalizeIdcc(raw);
      if (idcc && !opcoMapping.has(idcc))
        opcoMapping.set(idcc, { code: o.code, nom: o.nom });
    }
  }

  // 3. Données du projet (mêmes requêtes que getBillableEvents)
  const { data: contrats } = await qContrats(supabase, [projetId]);
  const contratIds = (contrats ?? []).map((c) => c.id);
  const [
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
    { data: existingLignes },
  ] = await Promise.all([
    qInvoiceLines(supabase, contratIds),
    qEmittedSteps(supabase, contratIds),
    qCompaniesIdcc(supabase, [client.id]),
    qExistingLignes(supabase, contratIds),
  ]);

  // 4. Assemblage (source de vérité)
  const projetEvents = assembleProjetBillableEvents({
    projet: projet as never,
    contrats: (contrats ?? []) as never,
    opcoMapping,
    invoiceLines: (invoiceLines ?? []) as never,
    emittedSteps: (emittedSteps ?? []) as never,
    companiesIdcc: (companiesIdcc ?? []) as never,
    existingLignes: (existingLignes ?? []) as never,
  });

  const raf = buildResteAFacturer([projetEvents]);
  const t = raf.totals;

  console.log('===== TOTAUX HEOL (HT) =====');
  console.log(
    `  Facturable maintenant : ${fmt(t.facturableHt).padStart(10)} €  (${t.nbContratsFacturable} contrats)`,
  );
  console.log(
    `  En attente OPCO       : ${fmt(t.emisNonPayeHt).padStart(10)} €  (${t.nbContratsEnAttente} contrats)`,
  );
  console.log(
    `  Bloqué (data)         : ${fmt(t.bloqueHt).padStart(10)} €  (${t.nbContratsBloque} contrats)`,
  );
  console.log(
    `  Prévisionnel restant  : ${fmt(t.previsionnelHt).padStart(10)} €`,
  );
  console.log(
    `  Déjà facturé (events) : ${fmt(t.dejaFactureHt).padStart(10)} €`,
  );

  // 4b. Prévisionnel par OPCO + par état de contrat (pipeline futur)
  console.log('\n===== PRÉVISIONNEL PAR OPCO (HT) =====');
  for (const o of [...raf.parOpco].sort(
    (a, b) => b.previsionnelHt - a.previsionnelHt,
  )) {
    console.log(
      `  ${(o.opcoNom || '-').padEnd(14)} prévis ${fmt(o.previsionnelHt).padStart(11)} €  | facturable ${fmt(o.facturableHt).padStart(8)} € | attente ${fmt(o.emisNonPayeHt).padStart(8)} €`,
    );
  }
  const prevByState = new Map<string, { ht: number; nb: number }>();
  for (const r of raf.parContrat) {
    if (r.previsionnelHt <= 0) continue;
    const g = prevByState.get(r.contractState) ?? { ht: 0, nb: 0 };
    g.ht += r.previsionnelHt;
    g.nb += 1;
    prevByState.set(r.contractState, g);
  }
  console.log('\n===== PRÉVISIONNEL PAR ÉTAT DE CONTRAT (HT) =====');
  for (const [state, g] of [...prevByState].sort((a, b) => b[1].ht - a[1].ht)) {
    console.log(
      `  ${state.padEnd(22)} ${fmt(g.ht).padStart(11)} €  (${g.nb} contrats)`,
    );
  }

  // 5. Détail par contrat : lignes avec au moins un reste
  const rows = raf.parContrat
    .filter(
      (r) =>
        r.facturableHt > 0 ||
        r.emisNonPayeHt > 0 ||
        r.bloqueHt > 0 ||
        r.previsionnelHt > 0,
    )
    .sort(
      (a, b) =>
        b.facturableHt + b.emisNonPayeHt - (a.facturableHt + a.emisNonPayeHt),
    );

  console.log(`\n===== DÉTAIL PAR CONTRAT (${rows.length}) =====`);
  console.log(
    'apprenant'.padEnd(26) +
      'contrat'.padEnd(17) +
      'OPCO'.padEnd(10) +
      'état'.padEnd(9) +
      'factur.'.padStart(9) +
      'attente'.padStart(9) +
      'bloqué'.padStart(9) +
      'prévis.'.padStart(9),
  );
  for (const r of rows) {
    console.log(
      (r.apprenant || '?').padEnd(26) +
        (r.contractNumber || r.contratRef || '?').padEnd(17) +
        (r.opcoCode || '-').padEnd(10) +
        r.contractState.padEnd(9) +
        fmt(r.facturableHt).padStart(9) +
        fmt(r.emisNonPayeHt).padStart(9) +
        fmt(r.bloqueHt).padStart(9) +
        fmt(r.previsionnelHt).padStart(9) +
        (r.lockReasons.length ? '  ⚠ ' + r.lockReasons.join(',') : ''),
    );
  }

  // 6. Steps TRANSMIS (imminents : bordereau parti, virement OPCO à venir)
  const transmis = (emittedSteps ?? []).filter(
    (s) => s.invoice_state === 'TRANSMIS',
  );
  if (transmis.length) {
    const byId = new Map(
      (contrats ?? []).map((c) => [
        c.id,
        `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`.trim(),
      ]),
    );
    console.log(
      `\n===== BORDEREAUX OPCO ÉMIS NON PAYÉS (TRANSMIS) - ${transmis.length} =====`,
    );
    for (const s of transmis.sort((a, b) =>
      String(a.opening_date).localeCompare(String(b.opening_date)),
    )) {
      console.log(
        `  step ${s.step_number} | émis ${s.opening_date} | ${byId.get(s.contrat_id) ?? '?'} | pédago ${fmt(Number(s.including_pedagogie_amount ?? 0))} € | bordereau ${s.external_number ?? '-'}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
