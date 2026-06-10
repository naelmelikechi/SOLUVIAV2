/**
 * Re-genere + ré-attache les PDF des factures existantes avec les mentions
 * légales à jour (capital + RCS, ajoutées le 2026-06).
 *
 * INALTÉRABILITÉ : n'altère AUCUNE écriture comptable et ne supprime aucune
 * pièce. Le hash Odoo scelle l'account.move, pas les ir.attachment. Si un PDF
 * du même nom existe déjà (factures déjà synchronisées), on AJOUTE le PDF
 * corrigé sous un nom distinct (« - mentions a jour ») sans toucher l'original.
 *
 * Env chargé par le runtime :
 *   npx tsx --env-file=.env.local scripts/reattach-facture-pdfs.ts
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createOdooClient } from '@/lib/odoo/client';
import { pushFacturePdfToOdoo } from '@/lib/odoo/attach-pdf';

const REFS = [
  'FAC-HEO-0001',
  'FAC-HEO-0002',
  'FAC-HEO-0003',
  'FAC-HEO-0004',
  'FAC-MEC-0005',
];

async function main() {
  const supabase = createAdminClient();
  const odoo = createOdooClient();

  for (const ref of REFS) {
    const { data: f, error } = await supabase
      .from('factures')
      .select('id, odoo_id')
      .eq('ref', ref)
      .single();

    if (error || !f) {
      console.log(`${ref}: introuvable (${error?.message ?? '?'})`);
      continue;
    }
    if (!f.odoo_id) {
      console.log(`${ref}: pas d'odoo_id, skip`);
      continue;
    }

    // 1er essai : nom standard. Attache si aucun PDF (cas 0001/0002).
    let res = await pushFacturePdfToOdoo(supabase, odoo, f.id);
    // Si un PDF du même nom existe déjà (0003/0004/0005) -> duplicata corrigé
    // sous un nom distinct, sans supprimer l'original.
    if (res.ok && res.skipped) {
      res = await pushFacturePdfToOdoo(
        supabase,
        odoo,
        f.id,
        `${ref} - mentions a jour.pdf`,
      );
    }
    console.log(`${ref}: ${JSON.stringify(res)}`);
  }
}

main().catch((e: unknown) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
