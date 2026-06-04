/**
 * Vérification READ-ONLY du format de facturation HEOL sur Supavia.
 *
 * N'écrit rien : uniquement des SELECT via le endpoint pg-meta (même plomberie
 * que scripts/migrate-supavia.ts, Postgres prod non exposé directement).
 *
 * Répond à : HEOL est-il en commission/event-based ou en échéancier NPEC ?
 *   - taux_commission des projets HEOL
 *   - existence (ou non) de la colonne projets.billing_mode (censée être droppée)
 *   - sociétés émettrices déclarées
 *   - factures HEOL émises + leur société émettrice
 *   - base de commission par line_type (PEDAGOGIE vs PREMIEREQUIPEMENT)
 *   - types d'events facturés sur les lignes HEOL (engagement / opco_step)
 *
 * Usage : npx tsx scripts/verify-heol-facturation.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const USER = process.env.SUPAVIA_DASHBOARD_USER;
const PASS = process.env.SUPAVIA_DASHBOARD_PASSWORD;

if (!BASE || !USER || !PASS) {
  console.error(
    'Manque SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL) + SUPAVIA_DASHBOARD_USER + SUPAVIA_DASHBOARD_PASSWORD dans .env.local',
  );
  process.exit(1);
}

const PGMETA = `${BASE}/api/platform/pg-meta/default/query`;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  const { promise, resolve: done } = Promise.withResolvers<void>();
  setTimeout(done, ms);
  return promise;
}

/** Garde-fou : ce script est strictement lecture seule. */
function assertReadOnly(sql: string): void {
  const head = sql.trim().replace(/^\(*/, '').slice(0, 6).toUpperCase();
  if (head !== 'SELECT' && head.slice(0, 4) !== 'WITH') {
    throw new Error(`Requête non read-only refusée : ${sql.slice(0, 60)}…`);
  }
}

async function query<T = Record<string, unknown>>(
  sql: string,
  attempt = 1,
): Promise<T[]> {
  assertReadOnly(sql);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(PGMETA, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
      return query<T>(sql, attempt + 1);
    }
    throw new Error(`pg-meta injoignable : ${(err as Error).message}`);
  }
  clearTimeout(timer);

  const text = await res.text();
  if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    return query<T>(sql, attempt + 1);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Réponse pg-meta non-JSON (HTTP ${res.status}) : ${text.slice(0, 200)}`,
    );
  }
  if (!Array.isArray(json)) {
    const obj = json as { formattedError?: string; message?: string };
    throw new Error(
      `Erreur SQL pg-meta : ${obj.formattedError || obj.message || text}`,
    );
  }
  return json as T[];
}

// Filtre HEOL réutilisé : client "HEOL ACADEMY" ou projets dont la ref porte le
// trigramme HEO (réel) / HED (démo).
const HEOL_WHERE = `(c.raison_sociale ILIKE '%HEOL%' OR p.ref ILIKE '%-HEO-%' OR p.ref ILIKE '%-HED-%')`;

interface Section {
  title: string;
  sql: string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Sociétés émettrices déclarées',
    sql: `
      SELECT code, raison_sociale, actif, est_defaut, odoo_company_id, odoo_journal_id
      FROM societes_emettrices
      ORDER BY est_defaut DESC, code`,
  },
  {
    title:
      '2. Colonne projets.billing_mode (doit être ABSENTE depuis la migration 20260514100000)',
    sql: `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projets'
        AND column_name = 'billing_mode'`,
  },
  {
    title: '3. Projets HEOL + taux de commission',
    sql: `
      SELECT p.ref, c.raison_sociale AS client, c.trigramme,
             p.taux_commission, p.statut, p.archive,
             COALESCE(u.prenom || ' ' || u.nom, '-') AS cdp
      FROM projets p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN users u ON u.id = p.cdp_id
      WHERE ${HEOL_WHERE}
      ORDER BY p.ref`,
  },
  {
    title: '4. Factures HEOL émises (ref, statut, montants, société émettrice)',
    sql: `
      SELECT f.ref, f.statut, f.est_avoir, f.montant_ht, f.montant_ttc,
             f.taux_tva, COALESCE(se.code, '-') AS societe, f.date_emission
      FROM factures f
      JOIN projets p ON p.id = f.projet_id
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN societes_emettrices se ON se.id = f.societe_emettrice_id
      WHERE ${HEOL_WHERE}
      ORDER BY f.created_at`,
  },
  {
    title:
      '5. Base de commission HEOL par line_type (PEDAGOGIE commissionné, PREMIEREQUIPEMENT exclu)',
    sql: `
      SELECT eil.line_type, COUNT(*) AS nb_lignes, SUM(eil.amount) AS total_eur
      FROM eduvia_invoice_lines eil
      JOIN contrats ct ON ct.id = eil.contrat_id
      JOIN projets p ON p.id = ct.projet_id
      JOIN clients c ON c.id = p.client_id
      WHERE ${HEOL_WHERE}
      GROUP BY eil.line_type
      ORDER BY total_eur DESC`,
  },
  {
    title:
      '6. Lignes de facture HEOL par type d’event (event-based ?) — est_avoir=false',
    sql: `
      SELECT COALESCE(fl.event_type, '(aucun / libre)') AS event_type,
             COUNT(*) AS nb_lignes, SUM(fl.montant_ht) AS total_ht
      FROM facture_lignes fl
      JOIN factures f ON f.id = fl.facture_id
      JOIN projets p ON p.id = f.projet_id
      JOIN clients c ON c.id = p.client_id
      WHERE ${HEOL_WHERE} AND fl.est_avoir = false
      GROUP BY fl.event_type
      ORDER BY nb_lignes DESC`,
  },
];

function printRows(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log('   (aucune ligne)');
    return;
  }
  const cols = Object.keys(rows[0]!);
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length)),
  );
  console.log('   ' + cols.map((col, i) => col.padEnd(widths[i]!)).join('  '));
  console.log('   ' + widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log(
      '   ' +
        cols
          .map((col, i) => String(r[col] ?? '').padEnd(widths[i]!))
          .join('  '),
    );
  }
}

async function main(): Promise<void> {
  console.log(`\n=== Vérif facturation HEOL @ ${BASE} ===\n`);
  for (const section of SECTIONS) {
    console.log(`\n${section.title}`);
    try {
      const rows = await query(section.sql);
      printRows(rows);
    } catch (err) {
      console.log(`   ⚠ ${(err as Error).message}`);
    }
  }
  console.log('\n=== Lecture ===');
  console.log(
    "• Section 2 vide => billing_mode bien droppé : l'arbitrage auto/manuel n'est plus un flag par projet.",
  );
  console.log(
    '• Section 5 : du PEDAGOGIE > 0 et (idéalement) du PREMIEREQUIPEMENT exclu => modèle commission event-based actif.',
  );
  console.log(
    "• Section 6 : des lignes 'engagement'/'opco_step' => factures bâties sur events (manuel), pas sur échéancier NPEC.",
  );
  console.log(
    '• Section 3 : taux_commission attendu = 40 sur les projets HEOL réels.\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
