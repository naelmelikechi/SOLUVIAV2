/**
 * Preview READ-ONLY du backfill date_rupture (migration
 * 20260805120000_production_post_rupture.sql) : rejoue la regle composite en
 * SELECT sur la prod et montre, contrat par contrat, la date retenue et la
 * production theorique qui en decoule.
 *
 * Usage : npx tsx scripts/preview-backfill-rupture.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.SUPAVIA_DASHBOARD_USER}:${process.env.SUPAVIA_DASHBOARD_PASSWORD}`,
  ).toString('base64');

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!/^\s*(select|with)/i.test(sql)) throw new Error('read-only only');
  const res = await fetch(`${BASE}/api/platform/pg-meta/default/query`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new Error(JSON.stringify(json).slice(0, 400));
  return json as T[];
}

const SQL = `
WITH rompus AS (
  SELECT
    ct.id, ct.ref, ct.contract_state, ct.date_debut, ct.duree_mois,
    ct.npec_amount, pr.taux_commission, pr.ref AS projet,
    pg.last_activity_at,
    EXISTS (
      SELECT 1 FROM public.eduvia_invoice_steps st
      WHERE st.contrat_id = ct.id
        AND (st.invoice_sent_at IS NOT NULL OR COALESCE(st.paid_amount, 0) > 0)
    ) AS a_jalon_facture
  FROM public.contrats ct
  JOIN public.projets pr ON pr.id = ct.projet_id
  LEFT JOIN public.contrats_progressions pg ON pg.contrat_id = ct.id
  -- (la clause "date_rupture IS NULL" de la migration est omise ici : la
  --  colonne n'existe pas encore en prod, la migration n'etant pas deployee)
  WHERE lower(ct.contract_state) IN
      ('resilie','annule','rupture','rompu','abandon','abandonne')
), calc AS (
  SELECT r.*,
    CASE
      WHEN r.last_activity_at IS NULL AND NOT r.a_jalon_facture THEN r.date_debut
      WHEN r.last_activity_at IS NOT NULL THEN r.last_activity_at::date
      ELSE CURRENT_DATE
    END AS date_rupture_calculee
  FROM rompus r
)
SELECT
  projet, ref, contract_state, date_debut, duree_mois,
  last_activity_at::date AS derniere_activite,
  a_jalon_facture,
  date_rupture_calculee,
  ROUND(
    LEAST(duree_mois, GREATEST(0,
      (EXTRACT(YEAR FROM age(date_rupture_calculee, date_debut)) * 12
       + EXTRACT(MONTH FROM age(date_rupture_calculee, date_debut))
       + EXTRACT(DAY FROM age(date_rupture_calculee, date_debut)) / 30.0)
    ))::numeric, 2) AS mois_realises,
  ROUND((npec_amount * COALESCE(taux_commission, 0) / 100 / 1.2)::numeric, 2)
    AS production_totale_ht_avant,
  ROUND((
    npec_amount * COALESCE(taux_commission, 0) / 100 / 1.2
    * LEAST(1, GREATEST(0,
        (EXTRACT(YEAR FROM age(date_rupture_calculee, date_debut)) * 12
         + EXTRACT(MONTH FROM age(date_rupture_calculee, date_debut))
         + EXTRACT(DAY FROM age(date_rupture_calculee, date_debut)) / 30.0)
        / NULLIF(duree_mois, 0)))
  )::numeric, 2) AS production_totale_ht_apres
FROM calc
ORDER BY projet, ref`;

async function main(): Promise<void> {
  const rows = await query(SQL);
  console.log('\n===== Backfill date_rupture : previsualisation =====');
  if (rows.length === 0) console.log('(aucun contrat rompu a backfiller)');
  else console.table(rows);

  const before = rows.reduce(
    (s, r) => s + Number(r.production_totale_ht_avant ?? 0),
    0,
  );
  const after = rows.reduce(
    (s, r) => s + Number(r.production_totale_ht_apres ?? 0),
    0,
  );
  console.log(
    `\nProduction SOLUVIA cumulee de ces contrats : ${before.toFixed(2)} EUR HT ` +
      `-> ${after.toFixed(2)} EUR HT (retrait de ${(before - after).toFixed(2)} EUR HT)`,
  );
}

void main();
