import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';

// Registry public des sociétés émettrices SOLUVIA avec mapping Odoo configuré.
// Source de vérité pour FINANCES-WISEMANH (et tout autre consommateur) afin
// d'éviter le drift de configuration entre 2 endroits quand une nouvelle
// société est ajoutée au tenant wisemanh.odoo.com.
//
// Sortie : seules les sociétés avec `odoo_company_id` non NULL et `actif=true`
// sont exposées. Le SIRET (donnée publique figurant sur chaque facture, requis
// par FINANCES pour le rapprochement) est inclus. En revanche IBAN, mentions
// légales et détail facturation ne le sont pas : passer par /admin pour cela.
//
// Auth : non protégée par session (donc cache CDN OK). Pour limiter le surface,
// on requiert un header `x-registry-token` qui matche REGISTRY_TOKEN (env).
// FINANCES doit avoir le même token configuré.

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

interface RegistryEntry {
  odoo_company_id: number;
  odoo_journal_id_sale: number | null;
  internal_slug: string; // = code (SOL, EDU, HEO, ...)
  raison_sociale: string;
  siret: string | null;
  is_billing_entity: boolean; // toujours true (rows = sociétés émettrices)
}

export async function GET(request: Request) {
  const expected = process.env.REGISTRY_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        success: false,
        error: 'REGISTRY_TOKEN non configuré côté serveur',
      },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-registry-token');
  if (!timingSafeStrEqual(provided, expected)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select(
      'code, raison_sociale, siret, odoo_company_id, odoo_journal_id, actif',
    )
    .eq('actif', true)
    .not('odoo_company_id', 'is', null);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  const entries: RegistryEntry[] = (data ?? []).map((s) => ({
    odoo_company_id: s.odoo_company_id as number,
    odoo_journal_id_sale: s.odoo_journal_id,
    internal_slug: s.code,
    raison_sociale: s.raison_sociale,
    siret: s.siret,
    is_billing_entity: true,
  }));

  return NextResponse.json({
    success: true,
    fetched_at: new Date().toISOString(),
    source: 'soluvia.societes_emettrices',
    entries,
  });
}
