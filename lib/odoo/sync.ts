import type { SupabaseClient } from '@supabase/supabase-js';
import { createOdooClient } from '@/lib/odoo/client';
import type {
  OdooInvoicePayload,
  OdooUnreconciledBankLine,
} from '@/lib/odoo/client';
import { pushFacturePdfToOdoo } from '@/lib/odoo/attach-pdf';
import { logger } from '@/lib/utils/logger';
import { matchUnreconciledBankLine } from '@/lib/odoo/bank-line-match';
import { parseFrAddress } from '@/lib/utils/fr-address';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';

const SCOPE = 'odoo.sync';

// Type alias (pas interface) : assignable a Record<string, Json> pour le
// journal d'audit, sans cast.
export type OdooSyncResult = {
  pushed: number;
  pulled: number;
  errors: string[];
};

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
      client:clients!factures_client_id_fkey(siret, raison_sociale, tva_intracommunautaire, is_demo, adresse, localisation),
      societe:societes_emettrices!factures_societe_emettrice_id_fkey(odoo_company_id, odoo_journal_id),
      projet:projets!factures_projet_id_fkey(code_analytique),
      lignes:facture_lignes(id, description, montant_ht, analytic_line_odoo_id)
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
        adresse: string | null;
        localisation: string | null;
        is_demo: boolean | null;
      } | null;

      const societe = f.societe as unknown as {
        odoo_company_id: number | null;
        odoo_journal_id: number | null;
      } | null;

      const projet = f.projet as unknown as {
        code_analytique: string | null;
      } | null;

      const rawLignes =
        (f.lignes as unknown as Array<{
          id: string;
          description: string;
          montant_ht: number;
          analytic_line_odoo_id: string | null;
        }>) ?? [];

      const lines = rawLignes.map((l) => ({
        description: l.description,
        quantity: 1,
        price_unit: Number(l.montant_ht),
      }));

      const addr = parseFrAddress(client?.adresse, client?.localisation);
      const countryCode =
        resolveTvaRegime(client?.tva_intracommunautaire).countryCode ?? 'FR';

      const payload: OdooInvoicePayload = {
        ref: f.ref ?? '',
        partner_siret: client?.siret ?? '',
        partner_name: client?.raison_sociale ?? 'Client inconnu',
        partner_vat: client?.tva_intracommunautaire ?? null,
        partner_street: addr.street,
        partner_zip: addr.zip,
        partner_city: addr.city,
        partner_country_code: countryCode,
        date_invoice: f.date_emission ?? '',
        date_due: f.date_echeance ?? '',
        taux_tva: Number(f.taux_tva ?? 20),
        lines,
        is_credit_note: false,
        is_draft: client?.is_demo === true,
        odoo_company_id: societe?.odoo_company_id ?? null,
        odoo_journal_id: societe?.odoo_journal_id ?? null,
      };

      // oxlint-disable-next-line react-doctor/async-await-in-loop
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

      // Best-effort : attache le PDF facture genere par Soluvia au account.move
      // Odoo via ir.attachment. La compta voit le PDF Soluvia (avec RIB,
      // mentions legales) directement dans Odoo, sans avoir a aller dans
      // l'email Resend. Echec ici = log mais le push facture est considere
      // OK (le bonus PDF est secondaire).
      try {
        const pdfRes = await pushFacturePdfToOdoo(supabase, odoo, f.id);
        if (!pdfRes.ok) {
          logger.warn(SCOPE, 'Attach PDF failed (non bloquant)', {
            facture_id: f.id,
            ref: f.ref,
            error: pdfRes.error,
          });
        }
      } catch (err) {
        logger.warn(SCOPE, 'Attach PDF exception (non bloquant)', {
          facture_id: f.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Synergie #1 : push analytic line par ligne facture si le projet a un
      // code_analytique configure. Best-effort, non bloquant. Idempotence via
      // facture_lignes.analytic_line_odoo_id (skip si deja pousse).
      const codeAna = projet?.code_analytique;
      if (codeAna) {
        for (const l of rawLignes) {
          if (l.analytic_line_odoo_id) continue; // deja pousse
          try {
            // oxlint-disable-next-line react-doctor/async-await-in-loop
            const r = await odoo.pushAnalyticLineForMove({
              code_analytique: codeAna,
              amount: Number(l.montant_ht), // positif pour out_invoice (recette)
              date: f.date_emission ?? '',
              name: `[SOLUVIA-AUTO] ${f.ref} - ${l.description.slice(0, 60)}`,
              company_id: societe?.odoo_company_id ?? null,
            });
            if (r.skipped) {
              logger.warn(SCOPE, 'Analytic line skipped', {
                facture_id: f.id,
                ligne_id: l.id,
                reason: r.reason,
              });
              continue;
            }
            if (r.analytic_line_odoo_id !== null) {
              await supabase
                .from('facture_lignes')
                .update({
                  analytic_line_odoo_id: String(r.analytic_line_odoo_id),
                })
                .eq('id', l.id);
            }
          } catch (err) {
            logger.warn(SCOPE, 'Push analytic line failed (non bloquant)', {
              facture_id: f.id,
              ligne_id: l.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
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
      client:clients!factures_client_id_fkey(siret, raison_sociale, tva_intracommunautaire, is_demo, adresse, localisation),
      societe:societes_emettrices!factures_societe_emettrice_id_fkey(odoo_company_id, odoo_journal_id),
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
        adresse: string | null;
        localisation: string | null;
        is_demo: boolean | null;
      } | null;

      const societe = a.societe as unknown as {
        odoo_company_id: number | null;
        odoo_journal_id: number | null;
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

      const addr = parseFrAddress(client?.adresse, client?.localisation);
      const countryCode =
        resolveTvaRegime(client?.tva_intracommunautaire).countryCode ?? 'FR';

      const payload: OdooInvoicePayload = {
        ref: a.ref ?? '',
        partner_siret: client?.siret ?? '',
        partner_name: client?.raison_sociale ?? 'Client inconnu',
        partner_vat: client?.tva_intracommunautaire ?? null,
        partner_street: addr.street,
        partner_zip: addr.zip,
        partner_city: addr.city,
        partner_country_code: countryCode,
        date_invoice: a.date_emission ?? '',
        date_due: a.date_echeance ?? '',
        taux_tva: Number(a.taux_tva ?? 20),
        lines,
        is_credit_note: true,
        is_draft: client?.is_demo === true,
        odoo_company_id: societe?.odoo_company_id ?? null,
        odoo_journal_id: societe?.odoo_journal_id ?? null,
      };

      // oxlint-disable-next-line react-doctor/async-await-in-loop
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

      try {
        const pdfRes = await pushFacturePdfToOdoo(supabase, odoo, a.id);
        if (!pdfRes.ok) {
          logger.warn(SCOPE, 'Attach PDF (avoir) failed (non bloquant)', {
            avoir_id: a.id,
            ref: a.ref,
            error: pdfRes.error,
          });
        }
      } catch (err) {
        logger.warn(SCOPE, 'Attach PDF (avoir) exception (non bloquant)', {
          avoir_id: a.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
  // Approche facture-driven : on re-verifie TOUTES les factures encore non
  // payees qui ont un move Odoo, en lisant l'etat de paiement directement sur
  // l'account.move (source de verite). Avantages vs l'ancien scrape global
  // d'account.payment :
  //  - attrape les reconciliations faites au niveau releve bancaire (qui ne
  //    creent pas d'account.payment) ;
  //  - auto-reparant : pas de checkpoint `since` qui pourrait rater une facture
  //    reconciliee dans le passe (chaque run reconsidere l'ensemble non paye).
  const { data: factures, error: facturesErr } = await supabase
    .from('factures')
    .select('id, ref, odoo_id, montant_ttc, statut')
    .in('statut', ['emise', 'en_retard'])
    .not('odoo_id', 'is', null)
    .eq('est_avoir', false);

  if (facturesErr) {
    errors.push(`pull factures: ${facturesErr.message}`);
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'paiement',
      statut: 'error',
      erreur: facturesErr.message,
    });
    return 0;
  }

  const tracked = factures ?? [];
  if (tracked.length === 0) {
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'paiement',
      statut: 'success',
      payload: { count: 0, factures_checked: 0 },
    });
    return 0;
  }

  const moveIds = tracked
    .map((f) => f.odoo_id as string | null)
    .filter((id): id is string => Boolean(id));

  let infos;
  try {
    infos = await odoo.pullInvoicePayments(moveIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, 'pullInvoicePayments call failed', { error: err });
    errors.push(`pullInvoicePayments: ${msg}`);
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'paiement',
      statut: 'error',
      erreur: msg,
    });
    return 0;
  }

  const byMove = new Map(infos.map((i) => [i.invoice_odoo_id, i]));
  let pulled = 0;
  const unpaidInvoices: UnpaidInvoice[] = [];

  for (const f of tracked) {
    const info = byMove.get(String(f.odoo_id));
    if (!info) continue;

    try {
      // Upsert chaque reglement reconcilie (dedupe par odoo_id).
      let upsertOk = true;
      for (const p of info.payments) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        const { error: upsertErr } = await supabase.from('paiements').upsert(
          {
            facture_id: f.id,
            montant: p.amount,
            date_reception: p.date,
            odoo_id: p.odoo_id,
            saisie_manuelle: false,
          },
          { onConflict: 'odoo_id' },
        );
        if (upsertErr) {
          logger.error(SCOPE, 'Upsert paiement failed', {
            odoo_id: p.odoo_id,
            error: upsertErr,
          });
          errors.push(`Upsert paiement ${p.odoo_id}: ${upsertErr.message}`);
          upsertOk = false;
        } else {
          pulled++;
        }
      }

      // Statut paye selon la verite Odoo (payment_state), pas selon la somme
      // locale : une facture peut etre soldee par un avoir sans reglement cash.
      // On ne bascule PAS si un reglement n'a pas pu etre enregistre, sinon la
      // facture passerait payee sans trace ET sortirait du set de retry.
      const isPaid =
        info.payment_state === 'paid' || info.payment_state === 'in_payment';
      if (isPaid && upsertOk && f.statut !== 'payee') {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        const { error: updErr } = await supabase
          .from('factures')
          .update({ statut: 'payee' })
          .eq('id', f.id);
        if (updErr) {
          errors.push(`Update statut ${f.ref}: ${updErr.message}`);
        }
      }

      // Facture toujours non payee selon Odoo : candidate a la detection d'un
      // encaissement arrive mais non lettre (cf. notifyUnreconciledIncomingPayments).
      if (!isPaid && f.ref) {
        unpaidInvoices.push({
          id: f.id,
          ref: f.ref,
          montantTtc: Number(f.montant_ttc),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, 'Process facture payment failed', {
        ref: f.ref,
        error: err,
      });
      errors.push(`Facture ${f.ref}: ${msg}`);
    }
  }

  // Detection annexe (lecture seule) : reperer un encaissement arrive en banque
  // mais pas lettre cote Odoo, et alerter les admins. Ne bloque jamais le pull.
  await notifyUnreconciledIncomingPayments(supabase, odoo, unpaidInvoices);

  const statut: 'success' | 'partial' | 'error' =
    errors.length === 0 ? 'success' : pulled > 0 ? 'partial' : 'error';
  await logSync(supabase, {
    direction: 'pull',
    entity_type: 'paiement',
    statut,
    payload: { count: pulled, factures_checked: tracked.length },
    erreur: errors.length > 0 ? errors.join('; ') : undefined,
  });

  return pulled;
}

interface UnpaidInvoice {
  id: string;
  ref: string;
  montantTtc: number;
}

// ---------------------------------------------------------------------------
// Detect incoming payments that arrived in the bank but were not reconciled in
// Odoo. L'account.move reste alors not_paid -> la facture Soluvia reste "en
// retard" alors que l'argent est la (cas FAC-HEO-0001). Canal en lecture seule :
// on ne reconcilie rien (ressort compta / FINANCES-WISEMANH), on alerte les
// admins pour qu'ils lettrent. Idempotent : pas de re-notification a chaque run.
// ---------------------------------------------------------------------------

const UNRECONCILED_NOTIF_TITRE = 'Encaissement non lettré détecté';

async function notifyUnreconciledIncomingPayments(
  supabase: SupabaseClient,
  odoo: ReturnType<typeof createOdooClient>,
  unpaid: UnpaidInvoice[],
): Promise<void> {
  if (unpaid.length === 0) return;

  let bankLines: OdooUnreconciledBankLine[];
  try {
    bankLines = await odoo.findUnreconciledIncomingBankLines();
  } catch (err) {
    logger.warn(SCOPE, 'findUnreconciledIncomingBankLines failed', {
      error: err,
    });
    return;
  }
  if (bankLines.length === 0) return;

  const matches: { inv: UnpaidInvoice; line: OdooUnreconciledBankLine }[] = [];
  for (const inv of unpaid) {
    const line = matchUnreconciledBankLine(
      { ref: inv.ref, montantTtc: inv.montantTtc },
      bankLines,
    );
    if (line) matches.push({ inv, line });
  }
  if (matches.length === 0) return;

  // Destinataires : admins + superadmins actifs (alerte de nature compta).
  const { data: admins, error: adminsErr } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  if (adminsErr) {
    logger.warn(SCOPE, 'load admins for unreconciled notif failed', {
      error: adminsErr,
    });
    return;
  }
  const adminIds = (admins ?? []).map((a) => a.id);
  if (adminIds.length === 0) return;

  // Idempotence : ne pas re-notifier a chaque pull (~3h). On regarde les notifs
  // erreur_sync de ce titre deja posees pour les liens concernes.
  const candidateLinks = matches.map((m) => `/facturation/${m.inv.ref}`);
  const { data: existing } = await supabase
    .from('notifications')
    .select('lien')
    .eq('type', 'erreur_sync')
    .eq('titre', UNRECONCILED_NOTIF_TITRE)
    .in('lien', candidateLinks);
  const existingLinks = new Set(
    (existing ?? []).map((n) => n.lien).filter((l): l is string => l !== null),
  );

  const notifsToCreate = matches.flatMap(({ inv, line }) => {
    const lien = `/facturation/${inv.ref}`;
    if (existingLinks.has(lien)) return [];
    const montant = inv.montantTtc.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const message = `⚠️ Un encaissement de ${montant} € correspondant à la facture ${inv.ref} a été trouvé en banque (ligne #${line.id} du ${line.date}) mais n'est pas lettré dans Odoo. La facture reste « en retard » tant que le rapprochement n'est pas fait (compta / FINANCES-WISEMANH).`;
    return adminIds.map((adminId) => ({
      type: 'erreur_sync' as const,
      user_id: adminId,
      titre: UNRECONCILED_NOTIF_TITRE,
      message,
      lien,
    }));
  });
  if (notifsToCreate.length === 0) return;

  const { error: notifErr } = await supabase
    .from('notifications')
    .insert(notifsToCreate);
  if (notifErr) {
    logger.warn(SCOPE, 'insert unreconciled notifications failed', {
      error: notifErr,
    });
    return;
  }

  logger.info(SCOPE, 'Unreconciled incoming payments detected', {
    factures: matches.map((m) => m.inv.ref),
    notifications: notifsToCreate.length,
  });
  await logSync(supabase, {
    direction: 'pull',
    entity_type: 'bank_unreconciled',
    statut: 'success',
    payload: {
      detected: matches.length,
      factures: matches.map((m) => m.inv.ref),
    },
  });
}

// ---------------------------------------------------------------------------
// Pull cancellations from Odoo
// ---------------------------------------------------------------------------

async function pullCancellations(
  supabase: SupabaseClient,
  odoo: ReturnType<typeof createOdooClient>,
  errors: string[],
): Promise<number> {
  // Determine "since" from last cancellation pull (success ou partial).
  const { data: lastLog } = await supabase
    .from('odoo_sync_logs')
    .select('created_at')
    .eq('direction', 'pull')
    .eq('entity_type', 'cancellation')
    .in('statut', ['success', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastLog?.created_at ?? '2020-01-01T00:00:00Z';

  let cancellations;
  try {
    cancellations = await odoo.pullCancellations(since);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, 'pullCancellations call failed', { error: err });
    errors.push(`pullCancellations: ${msg}`);
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'cancellation',
      statut: 'error',
      erreur: msg,
    });
    return 0;
  }

  // Pre-fetch admin user ids (admin + superadmin) une fois pour la boucle.
  const { data: admins, error: adminsErr } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);

  if (adminsErr) {
    const msg = adminsErr.message;
    logger.error(SCOPE, 'Failed to load admins for cancellation notifs', {
      error: adminsErr,
    });
    errors.push(`pullCancellations admins: ${msg}`);
    await logSync(supabase, {
      direction: 'pull',
      entity_type: 'cancellation',
      statut: 'error',
      erreur: msg,
    });
    return 0;
  }

  const adminIds = (admins ?? []).map((a) => a.id);

  let processed = 0;
  const errorsBefore = errors.length;

  for (const move of cancellations) {
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const { data: facture } = await supabase
        .from('factures')
        .select('id, ref, statut, est_avoir')
        .eq('odoo_id', move.odoo_id)
        .maybeSingle();

      if (!facture) {
        logger.warn(SCOPE, 'Facture not found for cancelled Odoo move', {
          odoo_id: move.odoo_id,
          ref: move.ref,
        });
        continue;
      }

      // Skip si la facture est deja un avoir (pas de notif utile).
      if (facture.est_avoir === true) {
        continue;
      }

      // Skip si un avoir Soluvia existe deja sur cette facture.
      const { count: avoirCount } = await supabase
        .from('factures')
        .select('id', { count: 'exact', head: true })
        .eq('facture_origine_id', facture.id)
        .eq('est_avoir', true);

      if (avoirCount && avoirCount > 0) {
        continue;
      }

      // Pas de changement de statut: aucune valeur 'annulee' dans l'enum.
      // On notifie les admins pour traitement manuel.
      const writeDate = move.write_date.slice(0, 10);
      const message = `⚠️ Facture ${facture.ref ?? '(sans ref)'} annulée côté Odoo le ${writeDate}. À réviser : créer un avoir Soluvia ou suivre selon contexte.`;

      // Batch insert : meme contenu de notif pour chaque admin, on evite
      // les N round-trips.
      const notifsToCreate = adminIds.map((adminId) => ({
        type: 'erreur_sync' as const,
        user_id: adminId,
        titre: 'Facture annulée côté Odoo',
        message,
        lien: facture.ref ? `/facturation/${facture.ref}` : null,
      }));
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert(notifsToCreate);

      if (notifErr) {
        logger.warn(SCOPE, 'Failed to create cancellation notifications', {
          adminCount: adminIds.length,
          facture_id: facture.id,
          error: notifErr,
        });
      }

      await logSync(supabase, {
        direction: 'pull',
        entity_type: 'cancellation',
        entity_id: facture.id,
        statut: 'success',
        payload: {
          odoo_id: move.odoo_id,
          soluvia_ref: facture.ref,
          write_date: move.write_date,
        },
      });

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, 'Process cancellation failed', {
        odoo_id: move.odoo_id,
        error: err,
      });
      errors.push(`Cancellation ${move.odoo_id}: ${msg}`);
    }
  }

  // Toujours logguer une ligne globale pour faire avancer "since" au prochain run.
  const localErrors = errors.slice(errorsBefore);
  const statut: 'success' | 'partial' | 'error' =
    localErrors.length === 0 ? 'success' : processed > 0 ? 'partial' : 'error';
  await logSync(supabase, {
    direction: 'pull',
    entity_type: 'cancellation',
    statut,
    payload: { since, count: processed },
    erreur: localErrors.length > 0 ? localErrors.join('; ') : undefined,
  });

  return processed;
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

  const [pushedFactures, pushedAvoirs, pulledPayments, pulledCancellations] =
    await Promise.all([
      pushFactures(supabase, odoo, errors),
      pushAvoirs(supabase, odoo, errors),
      pullPayments(supabase, odoo, errors),
      pullCancellations(supabase, odoo, errors),
    ]);

  const result: OdooSyncResult = {
    pushed: pushedFactures + pushedAvoirs,
    pulled: pulledPayments + pulledCancellations,
    errors,
  };

  logger.info(SCOPE, 'Odoo sync completed', {
    pushed: result.pushed,
    pulled: result.pulled,
    pulledPayments,
    pulledCancellations,
    errorCount: errors.length,
  });

  return result;
}
