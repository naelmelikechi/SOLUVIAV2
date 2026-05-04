import type { SupabaseClient } from '@supabase/supabase-js';
import { createOdooClient } from '@/lib/odoo/client';
import type { OdooInvoicePayload } from '@/lib/odoo/client';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'odoo.sync';

export interface OdooSyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logSync(
  supabase: SupabaseClient,
  opts: {
    direction: 'push' | 'pull';
    entity_type: string;
    entity_id?: string;
    statut: 'success' | 'error' | 'retry' | 'partial';
    payload?: unknown;
    erreur?: string;
  },
) {
  const { error } = await supabase.from('odoo_sync_logs').insert({
    direction: opts.direction,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id ?? null,
    statut: opts.statut,
    payload: opts.payload ?? null,
    erreur: opts.erreur ?? null,
  });
  if (error) {
    logger.error(SCOPE, 'Failed to write sync log', { error });
  }
}

// ---------------------------------------------------------------------------
// Push factures to Odoo
// ---------------------------------------------------------------------------

async function pushFactures(
  supabase: SupabaseClient,
  odoo: ReturnType<typeof createOdooClient>,
  errors: string[],
): Promise<number> {
  // Fetch factures (non-avoir) without odoo_id, in pushable statuses
  const { data: factures, error: fetchErr } = await supabase
    .from('factures')
    .select(
      `
      id, ref, date_emission, date_echeance, est_avoir,
      montant_ht, montant_ttc, taux_tva,
      client:clients!factures_client_id_fkey(siret, raison_sociale, tva_intracommunautaire, is_demo),
      lignes:facture_lignes(description, montant_ht)
    `,
    )
    .is('odoo_id', null)
    .in('statut', ['emise', 'en_retard'])
    .eq('est_avoir', false);

  if (fetchErr) {
    logger.error(SCOPE, 'Failed to fetch factures for push', {
      error: fetchErr,
    });
    errors.push('Impossible de charger les factures à pousser');
    return 0;
  }

  let pushed = 0;

  for (const f of factures ?? []) {
    try {
      const client = f.client as unknown as {
        siret: string | null;
        raison_sociale: string | null;
        tva_intracommunautaire: string | null;
        is_demo: boolean | null;
      } | null;

      const lines = (
        (f.lignes as unknown as Array<{
          description: string;
          montant_ht: number;
        }>) ?? []
      ).map((l) => ({
        description: l.description,
        quantity: 1,
        price_unit: Number(l.montant_ht),
      }));

      const payload: OdooInvoicePayload = {
        ref: f.ref ?? '',
        partner_siret: client?.siret ?? '',
        partner_name: client?.raison_sociale ?? 'Client inconnu',
        partner_vat: client?.tva_intracommunautaire ?? null,
        date_invoice: f.date_emission ?? '',
        date_due: f.date_echeance ?? '',
        taux_tva: Number(f.taux_tva ?? 20),
        lines,
        is_credit_note: false,
        is_draft: client?.is_demo === true,
      };

      const result = await odoo.pushInvoice(payload);

      // Update facture with odoo_id
      const { error: updateErr } = await supabase
        .from('factures')
        .update({ odoo_id: result.odoo_id })
        .eq('id', f.id);

      if (updateErr) {
        logger.error(SCOPE, 'Failed to update facture with odoo_id', {
          factureId: f.id,
          error: updateErr,
        });
        errors.push(`Echec MAJ facture ${f.ref}: ${updateErr.message}`);
        await logSync(supabase, {
          direction: 'push',
          entity_type: 'facture',
          entity_id: f.id,
          statut: 'error',
          payload,
          erreur: updateErr.message,
        });
        continue;
      }

      await logSync(supabase, {
        direction: 'push',
        entity_type: 'facture',
        entity_id: f.id,
        statut: 'success',
        payload,
      });
      pushed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, `Push facture failed: ${f.ref}`, { error: err });
      errors.push(`Push facture ${f.ref}: ${msg}`);
      await logSync(supabase, {
        direction: 'push',
        entity_type: 'facture',
        entity_id: f.id,
        statut: 'error',
        erreur: msg,
      });
    }
  }

  return pushed;
}

// ---------------------------------------------------------------------------
// Push avoirs (credit notes) to Odoo
// ---------------------------------------------------------------------------

async function pushAvoirs(
  supabase: SupabaseClient,
  odoo: ReturnType<typeof createOdooClient>,
  errors: string[],
): Promise<number> {
  const { data: avoirs, error: fetchErr } = await supabase
    .from('factures')
    .select(
      `
      id, ref, date_emission, date_echeance,
      montant_ht, montant_ttc, taux_tva,
      client:clients!factures_client_id_fkey(siret, raison_sociale, tva_intracommunautaire, is_demo),
      lignes:facture_lignes(description, montant_ht)
    `,
    )
    .is('odoo_id', null)
    .eq('est_avoir', true);

  if (fetchErr) {
    logger.error(SCOPE, 'Failed to fetch avoirs for push', {
      error: fetchErr,
    });
    errors.push('Impossible de charger les avoirs à pousser');
    return 0;
  }

  let pushed = 0;

  for (const a of avoirs ?? []) {
    try {
      const client = a.client as unknown as {
        siret: string | null;
        raison_sociale: string | null;
        tva_intracommunautaire: string | null;
        is_demo: boolean | null;
      } | null;

      // Sur un out_refund Odoo, les price_unit doivent etre POSITIFS.
      // Le moveType 'out_refund' inverse deja le sens comptable (debit/credit),
      // donc envoyer des prix negatifs cree un avoir negatif que Odoo refuse
      // de valider via action_post.
      const lines = (
        (a.lignes as unknown as Array<{
          description: string;
          montant_ht: number;
        }>) ?? []
      ).map((l) => ({
        description: l.description,
        quantity: 1,
        price_unit: Math.abs(Number(l.montant_ht)),
      }));

      const payload: OdooInvoicePayload = {
        ref: a.ref ?? '',
        partner_siret: client?.siret ?? '',
        partner_name: client?.raison_sociale ?? 'Client inconnu',
        partner_vat: client?.tva_intracommunautaire ?? null,
        date_invoice: a.date_emission ?? '',
        date_due: a.date_echeance ?? '',
        taux_tva: Number(a.taux_tva ?? 20),
        lines,
        is_credit_note: true,
        is_draft: client?.is_demo === true,
      };

      const result = await odoo.pushCreditNote(payload);

      const { error: updateErr } = await supabase
        .from('factures')
        .update({ odoo_id: result.odoo_id })
        .eq('id', a.id);

      if (updateErr) {
        logger.error(SCOPE, 'Failed to update avoir with odoo_id', {
          avoirId: a.id,
          error: updateErr,
        });
        errors.push(`Echec MAJ avoir ${a.ref}: ${updateErr.message}`);
        await logSync(supabase, {
          direction: 'push',
          entity_type: 'avoir',
          entity_id: a.id,
          statut: 'error',
          payload,
          erreur: updateErr.message,
        });
        continue;
      }

      await logSync(supabase, {
        direction: 'push',
        entity_type: 'avoir',
        entity_id: a.id,
        statut: 'success',
        payload,
      });
      pushed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, `Push avoir failed: ${a.ref}`, { error: err });
      errors.push(`Push avoir ${a.ref}: ${msg}`);
      await logSync(supabase, {
        direction: 'push',
        entity_type: 'avoir',
        entity_id: a.id,
        statut: 'error',
        erreur: msg,
      });
    }
  }

  return pushed;
}

// ---------------------------------------------------------------------------
// Pull payments from Odoo
// ---------------------------------------------------------------------------

async function pullPayments(
  supabase: SupabaseClient,
  odoo: ReturnType<typeof createOdooClient>,
  errors: string[],
): Promise<number> {
  // Determine "since" from last successful pull. Accepte 'success' ET
  // 'partial' : un partial signifie qu'au moins certains paiements ont ete
  // importes, donc le prochain run peut repartir de cette date.
  const { data: lastLog } = await supabase
    .from('odoo_sync_logs')
    .select('created_at')
    .eq('direction', 'pull')
    .in('statut', ['success', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastLog?.created_at ?? '2020-01-01T00:00:00Z';

  let payments;
  try {
    payments = await odoo.pullPayments(since);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, 'pullPayments call failed', { error: err });
    errors.push(`pullPayments: ${msg}`);
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'paiement',
      statut: 'error',
      erreur: msg,
    });
    return 0;
  }

  let pulled = 0;

  for (const payment of payments) {
    try {
      // Find the facture by its odoo_id
      const { data: facture } = await supabase
        .from('factures')
        .select('id, montant_ttc')
        .eq('odoo_id', payment.invoice_odoo_id)
        .maybeSingle();

      if (!facture) {
        logger.warn(SCOPE, 'Facture not found for payment', {
          invoice_odoo_id: payment.invoice_odoo_id,
        });
        continue;
      }

      // Upsert payment (match on odoo_id)
      const { error: upsertErr } = await supabase.from('paiements').upsert(
        {
          facture_id: facture.id,
          montant: payment.amount,
          date_reception: payment.date,
          odoo_id: payment.odoo_id,
          saisie_manuelle: false,
        },
        { onConflict: 'odoo_id' },
      );

      if (upsertErr) {
        logger.error(SCOPE, 'Upsert paiement failed', {
          odoo_id: payment.odoo_id,
          error: upsertErr,
        });
        errors.push(`Upsert paiement ${payment.odoo_id}: ${upsertErr.message}`);
        continue;
      }

      // Check if facture is fully paid
      const { data: totalPaid } = await supabase
        .from('paiements')
        .select('montant')
        .eq('facture_id', facture.id);

      const sum = (totalPaid ?? []).reduce(
        (acc, p) => acc + Number(p.montant),
        0,
      );

      if (sum >= Number(facture.montant_ttc)) {
        await supabase
          .from('factures')
          .update({ statut: 'payee' })
          .eq('id', facture.id);
      }

      pulled++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, 'Process payment failed', {
        odoo_id: payment.odoo_id,
        error: err,
      });
      errors.push(`Payment ${payment.odoo_id}: ${msg}`);
    }
  }

  // Log the pull operation. 'partial' = au moins 1 paiement OK + au moins 1
  // erreur. Le calcul de `since` au prochain run accepte success ET partial
  // pour eviter de re-puller indefiniment ces paiements (l'upsert sur odoo_id
  // les deduplique de toute facon, mais le re-pull est gaspillage).
  const statut: 'success' | 'partial' | 'error' =
    errors.length === 0 ? 'success' : pulled > 0 ? 'partial' : 'error';
  await logSync(supabase, {
    direction: 'pull',
    entity_type: 'paiement',
    statut,
    payload: { since, count: pulled },
    erreur: errors.length > 0 ? errors.join('; ') : undefined,
  });

  return pulled;
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

export async function syncOdoo(
  supabase: SupabaseClient,
): Promise<OdooSyncResult> {
  logger.info(SCOPE, 'Starting Odoo sync');

  const odoo = createOdooClient();
  const errors: string[] = [];

  const pushedFactures = await pushFactures(supabase, odoo, errors);
  const pushedAvoirs = await pushAvoirs(supabase, odoo, errors);
  const pulled = await pullPayments(supabase, odoo, errors);

  const result: OdooSyncResult = {
    pushed: pushedFactures + pushedAvoirs,
    pulled,
    errors,
  };

  logger.info(SCOPE, 'Odoo sync completed', {
    pushed: result.pushed,
    pulled: result.pulled,
    errorCount: errors.length,
  });

  return result;
}
