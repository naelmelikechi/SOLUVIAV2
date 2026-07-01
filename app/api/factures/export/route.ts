import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { checkAuth } from '@/lib/auth/guards';
import {
  getFacturesPage,
  type FactureStatutFiltrable,
} from '@/lib/queries/factures';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_FACTURE_LABELS } from '@/lib/utils/constants';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 60;

// Cap dur : plafonne un export pathologique (append-only, table sans borne).
const EXPORT_MAX_ROWS = 50_000;
// Taille de page interne pour boucler getFacturesPage jusqu'a epuisement.
const EXPORT_PAGE_SIZE = 500;

const VALID_STATUTS: Record<FactureStatutFiltrable, true> = {
  emise: true,
  payee: true,
  en_retard: true,
  avoir: true,
};

function isFactureStatut(v: string): v is FactureStatutFiltrable {
  return v in VALID_STATUTS;
}

/**
 * Export Excel de la liste des factures (admin only). Le state client
 * ayant disparu avec la pagination serveur keyset, cet endpoint streame
 * toutes les lignes respectant les filtres courants en bouclant
 * getFacturesPage (curseur interne), puis genere le .xlsx.
 */
export async function GET(request: Request) {
  const auth = await checkAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statuts = searchParams
    .getAll('statut')
    .filter((s): s is FactureStatutFiltrable => isFactureStatut(s));
  const searchRef = searchParams.get('searchRef') ?? undefined;
  const filterProjet = searchParams.get('filterProjet') ?? undefined;
  const filterClient = searchParams.get('filterClient') ?? undefined;

  const rows: Record<string, string | number | null>[] = [];
  let cursor: string | null = null;
  let capped = false;

  // Boucle keyset jusqu'a epuisement (ou cap dur). Curseur interne : l'export
  // ne recompte jamais le total (head skip via cursor sur les pages > 1).
  for (;;) {
    const page = await getFacturesPage({
      limit: EXPORT_PAGE_SIZE,
      cursor,
      statuts: statuts.length ? statuts : undefined,
      searchRef,
      filterProjet,
      filterClient,
    });

    for (const f of page.rows) {
      rows.push({
        'N° Facture': f.ref,
        Projet: f.projet?.ref ?? '',
        Client: f.client?.raison_sociale ?? '',
        Émission: f.date_emission ? formatDate(f.date_emission) : '',
        Mois: f.mois_concerne,
        'Montant HT': f.montant_ht,
        Échéance: f.date_echeance ? formatDate(f.date_echeance) : '',
        État: STATUT_FACTURE_LABELS[f.statut] || f.statut,
      });
      if (rows.length >= EXPORT_MAX_ROWS) {
        capped = true;
        break;
      }
    }

    if (capped || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  if (capped) {
    logger.warn('api.factures.export', 'export tronque au cap dur', {
      cap: EXPORT_MAX_ROWS,
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const uint8 = new Uint8Array(buffer);

  const filename = `factures_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
