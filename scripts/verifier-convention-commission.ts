/**
 * Aide a la decision : convention HT / TTC de la commission echeancier
 * (audit #122, constat 4 / chantier A).
 *
 * LECTURE SEULE. N'ecrit rien, ne modifie rien.
 *
 * Le code ne peut pas trancher cette question : la reponse est dans le libelle
 * des contrats de partenariat NON-HEOL. Ce script produit les chiffres a
 * comparer au contrat, sur des projets echeancier reels :
 *
 *   - ce qui a ETE FACTURE (montant_ht et montant_ttc des factures emises)
 *   - ce que donnerait la convention HT   : NPEC x taux / 100 = HT
 *   - ce que donnerait la convention TTC  : NPEC x taux / 100 = TTC
 *
 * Si le contrat stipule une commission HT, c'est la colonne « si HT » qui doit
 * correspondre au HT facture. S'il stipule TTC, c'est la colonne « si TTC ».
 *
 * Usage : npx tsx scripts/verifier-convention-commission.ts
 *
 * Env requis (.env.local) : SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL),
 * SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.
 *
 * Volontairement sans dependance npm (tourne via npx tsx).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvLocal(): void {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]!] === undefined) {
        process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // Pas de .env.local : les secrets viennent de l'environnement.
  }
}

/** Garde-fou : ce script est strictement en lecture. */
function assertReadOnly(sql: string): void {
  const head = sql.trim().replace(/^\(*/, '').slice(0, 6).toUpperCase();
  if (head !== 'SELECT' && head.slice(0, 4) !== 'WITH') {
    throw new Error(`Requete non read-only refusee : ${sql.slice(0, 60)}`);
  }
}

async function query<T>(sql: string): Promise<T[]> {
  assertReadOnly(sql);
  const base = (
    process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/, '');
  const user = process.env.SUPAVIA_DASHBOARD_USER;
  const pass = process.env.SUPAVIA_DASHBOARD_PASSWORD;
  if (!base || !user || !pass) {
    throw new Error(
      'Env manquant : SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.',
    );
  }
  const res = await fetch(`${base}/api/platform/pg-meta/default/query`, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`pg-meta HTTP ${res.status} : ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as unknown;
  if (!Array.isArray(json)) {
    const o = json as { formattedError?: string; message?: string };
    throw new Error(`Erreur SQL : ${o.formattedError || o.message || text}`);
  }
  return json as T[];
}

const eur = (n: number) =>
  n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface Ligne {
  projet_ref: string;
  client: string;
  contrat_ref: string | null;
  npec: number;
  taux: number;
  facture_ht: number;
  facture_ttc: number;
}

async function main() {
  loadDotEnvLocal();

  console.log('Convention HT / TTC de la commission echeancier');
  console.log('Audit #122, constat 4 - LECTURE SEULE\n');

  // Lignes d'echeancier facturees sur des projets au modele `echeancier`.
  // On n'exclut PAS les lignes sans contrat ni NPEC : c'est justement
  // l'information utile (une ligne sans NPEC ne passe pas par la formule de
  // commission, donc elle ne dit rien sur la convention).
  const lignes = await query<Ligne>(`
    SELECT p.ref                          AS projet_ref,
           c.raison_sociale               AS client,
           ct.ref                         AS contrat_ref,
           COALESCE(fl.npec_snapshot, ct.npec_amount, 0)          AS npec,
           COALESCE(fl.taux_commission_snapshot, p.taux_commission, 0) AS taux,
           SUM(fl.montant_ht)             AS facture_ht,
           SUM(
             fl.montant_ht
               * (1 + COALESCE(fl.taux_tva_ligne, f.taux_tva, 20) / 100)
           )                              AS facture_ttc
    FROM public.facture_lignes fl
    JOIN public.factures f  ON f.id = fl.facture_id
    JOIN public.projets p   ON p.id = f.projet_id
    JOIN public.clients c   ON c.id = p.client_id
    LEFT JOIN public.contrats ct ON ct.id = fl.contrat_id
    WHERE p.modele_facturation = 'echeancier'
      AND f.est_avoir = false
      AND f.statut <> 'a_emettre'
      AND fl.event_type IS NULL
      AND c.is_demo = false
      AND c.archive = false
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 4 DESC, 1
    LIMIT 25
  `);

  // Seules les lignes portant un NPEC et un taux passent par la formule
  // NPEC x taux / 100 : les autres (factures libres) ne disent rien de la
  // convention et seraient trompeuses dans le comparatif.
  const exploitables = lignes.filter(
    (l) => Number(l.npec) > 0 && Number(l.taux) > 0,
  );

  if (lignes.length > 0 && exploitables.length === 0) {
    console.log(
      `${lignes.length} ligne(s) trouvee(s) sur des projets echeancier, mais AUCUNE\n` +
        'ne porte de NPEC ni de taux de commission : ce sont des factures libres\n' +
        '(projets *-LIB), qui ne passent pas par la formule NPEC x taux / 100.\n',
    );
    console.log(
      "CONSEQUENCE POUR L'ARBITRAGE, et elle est bonne : la formule de commission\n" +
        "echeancier n'a encore JAMAIS produit de ligne de facture en production.\n" +
        "Il n'y a donc RIEN a rectifier sur l'historique, quelle que soit la\n" +
        "convention retenue. L'option 2 du chantier A (avoirs a emettre sur tout le\n" +
        "portefeuille) est sans objet AUJOURD'HUI.\n\n" +
        'Mais la fenetre se referme : trancher AVANT la premiere facture de\n' +
        'commission echeancier reelle rend la decision gratuite. Apres, elle coute\n' +
        'des avoirs.',
    );
    return;
  }

  if (lignes.length === 0) {
    console.log(
      'Aucune ligne facturee sur un projet echeancier : rien a comparer pour le\n' +
        "moment, et donc rien a rectifier sur l'historique quelle que soit la\n" +
        'convention retenue.',
    );
    return;
  }

  console.log(
    'projet          contrat        NPEC       taux   facture HT   si HT       si TTC',
  );
  console.log('-'.repeat(88));

  let concordeHt = 0;
  let concordeTtc = 0;

  for (const l of exploitables) {
    const brut = (Number(l.npec) * Number(l.taux)) / 100;
    const siHt = brut; // convention HT : l'expression EST le HT
    const siTtc = brut / 1.2; // convention TTC : on en deduit le HT
    const factureHt = Number(l.facture_ht);

    // Le facture peut ne couvrir qu'une partie des jalons : on compare des
    // RATIOS et non des montants absolus.
    const ecartHt = Math.abs(factureHt / siHt - 1);
    const ecartTtc = Math.abs(factureHt / siTtc - 1);
    if (ecartHt < ecartTtc) concordeHt++;
    else concordeTtc++;

    console.log(
      `${(l.projet_ref ?? '-').padEnd(15)} ${(l.contrat_ref ?? '-').padEnd(14)} ` +
        `${eur(Number(l.npec)).padStart(10)} ${String(l.taux).padStart(5)}% ` +
        `${eur(factureHt).padStart(11)} ${eur(siHt).padStart(11)} ${eur(siTtc).padStart(11)}`,
    );
  }

  console.log('\n' + '-'.repeat(88));
  console.log(
    `Le HT reellement facture est plus proche de la convention HT sur ${concordeHt} contrat(s), ` +
      `de la convention TTC sur ${concordeTtc}.`,
  );
  console.log(
    '\nATTENTION : ce comptage ne prouve rien a lui seul. Le facture ne couvre\n' +
      "souvent qu'une PARTIE des jalons de l'echeancier, ce qui rapproche\n" +
      'mecaniquement de la colonne la plus basse. La seule preuve est la lecture\n' +
      'du contrat de partenariat : prends UN contrat de cette liste, ouvre le\n' +
      'contrat signe, et regarde si la commission y est stipulee HT ou TTC.\n' +
      '\nEnsuite, une seule ligne a changer dans lib/utils/convention-commission.ts.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
