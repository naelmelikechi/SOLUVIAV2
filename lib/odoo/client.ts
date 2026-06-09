import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Odoo client interface
// ---------------------------------------------------------------------------

export interface OdooInvoicePayload {
  ref: string;
  partner_siret: string;
  partner_name: string;
  partner_vat: string | null;
  date_invoice: string;
  date_due: string;
  taux_tva: number;
  lines: Array<{
    description: string;
    quantity: number;
    price_unit: number;
  }>;
  is_credit_note: boolean;
  // Quand true, la facture reste en draft cote Odoo (pas de action_post).
  // Utilise pour les clients de demo (clients.is_demo = true) afin que les
  // factures de test n entrent pas dans les livres comptables.
  is_draft?: boolean;
  // Multi-societes : id Odoo de la company emettrice (res.company.id) et
  // journal de vente associe (account.journal.id). Si NULL, Odoo retombe sur
  // la company par defaut du user technique, ce qui melange les comptabilites
  // quand le tenant heberge plusieurs societes (SOLUVIA, EDUVIA, HEOL).
  odoo_company_id?: number | null;
  odoo_journal_id?: number | null;
}

/**
 * Etat de paiement d'une facture Odoo, lu directement sur l'account.move (la
 * source de verite). Robuste a toutes les methodes de reconciliation :
 * account.payment classique, rapprochement direct d'une ligne bancaire (qui ne
 * cree PAS d'account.payment), avoir applique, etc.
 */
export interface OdooInvoicePayment {
  invoice_odoo_id: string;
  /** 'not_paid' | 'in_payment' | 'paid' | 'partial' | 'reversed' */
  payment_state: string;
  amount_total: number;
  amount_residual: number;
  /** Reglements en numeraire reconcilies (avoirs exclus). */
  payments: { odoo_id: string; amount: number; date: string }[];
}

export interface OdooCancelledMove {
  odoo_id: string;
  ref: string | null;
  state: 'cancel';
  write_date: string;
}

/**
 * Ligne de releve bancaire entrante non lettree (lecture seule). Sert a detecter
 * un encaissement arrive en banque mais pas encore rapproche d'une facture :
 * l'account.move reste alors payment_state=not_paid cote Odoo, donc la facture
 * Soluvia reste "en retard" alors que l'argent est la. Le rapprochement lui-meme
 * reste du ressort de la compta / FINANCES-WISEMANH (Soluvia ne fait que lire).
 */
export interface OdooUnreconciledBankLine {
  id: number;
  /** Montant signe ; > 0 pour un encaissement entrant. */
  amount: number;
  /** Libelle bancaire (souvent la ref facture, parfois reformattee par la banque). */
  payment_ref: string;
  /** Nom du partenaire si la banque/Odoo l'a rattache, sinon null. */
  partner_name: string | null;
  date: string;
}

export interface OdooPingResult {
  ok: boolean;
  uid?: number;
  version?: string;
  serverInfo?: string;
  db?: string;
  username?: string;
  isStub: boolean;
  error?: string;
}

export interface OdooClient {
  ping(): Promise<OdooPingResult>;
  pushInvoice(payload: OdooInvoicePayload): Promise<{ odoo_id: string }>;
  pushCreditNote(payload: OdooInvoicePayload): Promise<{ odoo_id: string }>;
  /**
   * Lit l'etat de paiement des factures Odoo donnees (par move id). Approche
   * facture-driven : on interroge la source de verite (account.move) plutot que
   * de scraper account.payment, ce qui rate les reconciliations faites au niveau
   * releve bancaire.
   */
  pullInvoicePayments(moveIds: string[]): Promise<OdooInvoicePayment[]>;
  pullCancellations(since: string): Promise<OdooCancelledMove[]>;
  /**
   * Lit les lignes de releve bancaire entrantes NON lettrees (lecture seule).
   * Permet de detecter un encaissement arrive mais pas encore rapproche d'une
   * facture. Ne reconcilie rien : c'est de la detection pure.
   */
  findUnreconciledIncomingBankLines(
    limit?: number,
  ): Promise<OdooUnreconciledBankLine[]>;
  /**
   * Enregistre un paiement sur une facture posted dans Odoo via le wizard
   * account.payment.register. Le wizard cree un account.payment, le poste, et
   * lettre automatiquement avec la facture. Retourne l'id du payment cree.
   *
   * Comptablement : ecriture debit Banque / credit Client, avec reconciliation
   * sur la ligne de la facture. Statut de la facture passe a payment_state=paid
   * (ou in_payment) cote Odoo.
   */
  registerPayment(params: OdooPaymentInput): Promise<{ odoo_id: string }>;
  /**
   * Attache un PDF (ex: facture rendue cote Soluvia) a un account.move Odoo
   * via ir.attachment. Idempotent : skip si une attachment du meme name existe
   * deja sur ce move. Retourne attachmentId ou null si skipped.
   */
  attachInvoicePdf(params: OdooAttachmentInput): Promise<{
    attachment_id: number | null;
    skipped: boolean;
  }>;
  /**
   * Crée une account.analytic.line sur le compte analytique identifié par
   * `code_analytique`. Synergie #1 : ventile le CA d'émission par projet/société
   * pour que FINANCES-WISEMANH y voie le réel sans saisie manuelle.
   *
   * Retourne {analytic_line_odoo_id: null, skipped: true} si le code analytique
   * n'existe pas côté Odoo (l'appelant log et continue, pas d'erreur fatale).
   */
  pushAnalyticLineForMove(params: OdooAnalyticLineInput): Promise<{
    analytic_line_odoo_id: number | null;
    skipped: boolean;
    reason?: string;
  }>;
}

export interface OdooAttachmentInput {
  move_odoo_id: string;
  name: string; // ex. "FAC-SOL-0042.pdf"
  pdf_base64: string;
  company_id?: number | null;
}

export interface OdooAnalyticLineInput {
  code_analytique: string; // ex. "41.01"
  amount: number; // signé : positif = recette (out_invoice), négatif = dépense
  date: string; // YYYY-MM-DD
  name: string; // libellé visible Odoo, ex "[SOLUVIA-AUTO] FAC-SOL-0042 - ligne 1"
  company_id?: number | null;
  partner_id?: number | null;
}

export interface OdooPaymentInput {
  invoice_odoo_id: string;
  amount: number;
  payment_date: string; // YYYY-MM-DD
  // Communication libre (par defaut : ref de la facture cote Odoo)
  communication?: string;
}

const SCOPE = 'odoo.client';

// ---------------------------------------------------------------------------
// JSON-RPC implementation
// ---------------------------------------------------------------------------

interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: { message?: string; debug?: string; name?: string };
  };
}

class OdooRpcError extends Error {
  constructor(
    message: string,
    public readonly debug?: string,
  ) {
    super(message);
    this.name = 'OdooRpcError';
  }
}

class OdooJsonRpcClient implements OdooClient {
  private uid: number | null = null;
  private taxId20: number | null = null;

  constructor(private readonly config: OdooConfig) {}

  // -------- Low-level transport --------

  private async rpc<T>(
    service: 'common' | 'object',
    method: string,
    args: unknown[],
  ): Promise<T> {
    const res = await fetch(`${this.config.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: Date.now(),
      }),
    });

    if (!res.ok) {
      throw new OdooRpcError(`HTTP ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new OdooRpcError(
        json.error.data?.message ?? json.error.message,
        json.error.data?.debug,
      );
    }
    if (json.result === undefined) {
      throw new OdooRpcError('Empty Odoo response');
    }
    return json.result;
  }

  private async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid;
    const uid = await this.rpc<number | false>('common', 'authenticate', [
      this.config.db,
      this.config.username,
      this.config.apiKey,
      {},
    ]);
    if (!uid || typeof uid !== 'number') {
      throw new OdooRpcError('Authentication failed (bad credentials or DB)');
    }
    this.uid = uid;
    logger.info(SCOPE, 'Authenticated', { uid });
    return uid;
  }

  private async executeKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const uid = await this.authenticate();
    return this.rpc<T>('object', 'execute_kw', [
      this.config.db,
      uid,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  // -------- Connectivity check --------

  async ping(): Promise<OdooPingResult> {
    try {
      const uid = await this.authenticate();
      const versionInfo = await this.rpc<{
        server_version?: string;
        server_serie?: string;
      }>('common', 'version', []);
      return {
        ok: true,
        uid,
        version: versionInfo.server_version ?? versionInfo.server_serie,
        serverInfo: versionInfo.server_serie,
        db: this.config.db,
        username: this.config.username,
        isStub: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        db: this.config.db,
        username: this.config.username,
        isStub: false,
        error: msg,
      };
    }
  }

  // -------- Domain helpers --------

  private async findOrCreatePartner(
    siret: string,
    name: string,
    vat: string | null,
  ): Promise<number> {
    const cleanSiret = siret.replace(/\s/g, '');
    const cleanVat = vat?.replace(/\s/g, '') ?? null;

    // Match strictly by VAT or SIRET. Fallback name ilike removed: deux clients
    // SOLUVIA avec meme raison_sociale et SIRET differents finiraient lies au
    // meme partner Odoo, ce qui mele les comptabilites client.
    const domains: Array<unknown[][]> = [];
    if (cleanVat) domains.push([['vat', '=', cleanVat]]);
    if (cleanSiret) {
      domains.push([['vat', '=', cleanSiret]]);
      domains.push([['company_registry', '=', cleanSiret]]);
    }

    for (const domain of domains) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      const ids = await this.executeKw<number[]>(
        'res.partner',
        'search',
        [domain],
        { limit: 1 },
      );
      if (ids.length > 0 && ids[0] !== undefined) return ids[0];
    }

    const created = await this.executeKw<number>('res.partner', 'create', [
      {
        name,
        vat: cleanVat,
        company_registry: cleanSiret || false,
        is_company: true,
      },
    ]);
    logger.info(SCOPE, 'Created partner', { id: created, name });
    return created;
  }

  private async findSaleTax(
    rate: number,
    companyId?: number | null,
  ): Promise<number | null> {
    // Cache du tax id 20% uniquement quand pas de scope company, sinon le
    // cache renverrait la mauvaise taxe pour une autre company.
    if (rate === 20 && !companyId && this.taxId20 !== null) return this.taxId20;
    const domain: unknown[] = [
      ['type_tax_use', '=', 'sale'],
      ['amount', '=', rate],
      ['amount_type', '=', 'percent'],
    ];
    if (companyId) domain.push(['company_id', '=', companyId]);
    const ids = await this.executeKw<number[]>(
      'account.tax',
      'search',
      [domain],
      { limit: 1 },
    );
    const id = ids[0] ?? null;
    if (rate === 20 && !companyId && id !== null) this.taxId20 = id;
    return id;
  }

  // -------- Push invoice / credit note --------

  private async pushMove(
    payload: OdooInvoicePayload,
  ): Promise<{ odoo_id: string }> {
    const partnerId = await this.findOrCreatePartner(
      payload.partner_siret,
      payload.partner_name,
      payload.partner_vat,
    );

    const companyId = payload.odoo_company_id ?? null;
    const journalId = payload.odoo_journal_id ?? null;

    const taxId = await this.findSaleTax(payload.taux_tva, companyId);
    if (payload.taux_tva > 0 && taxId === null) {
      throw new OdooRpcError(
        `Aucune taxe de vente "${payload.taux_tva}%" trouvee dans Odoo${companyId ? ` pour la company ${companyId}` : ''}. Configurez le taux dans Comptabilite > Configuration > Taxes avant de re-pousser la facture ${payload.ref}.`,
      );
    }
    const taxIdsCmd: unknown[] = taxId ? [[6, 0, [taxId]]] : [[5]];

    const moveType = payload.is_credit_note ? 'out_refund' : 'out_invoice';

    // Idempotency : si un move existe deja pour ce ref+type, on le reutilise.
    // Sans cette recherche, un echec de action_post apres create laissait un
    // draft cote Odoo dont l'odoo_id n'etait pas sauve cote Soluvia, et le
    // run suivant recreait un doublon draft.
    // Scope par company_id : deux societes peuvent avoir des refs identiques
    // (FAC-EDU-0001 vs FAC-SOL-0001 ne collisionnent pas mais FAC-001 oui).
    const existingDomain: unknown[] = [
      ['ref', '=', payload.ref],
      ['move_type', '=', moveType],
    ];
    if (companyId) existingDomain.push(['company_id', '=', companyId]);
    type ExistingMove = { id: number; state: string };
    const existing = await this.executeKw<ExistingMove[]>(
      'account.move',
      'search_read',
      [existingDomain],
      { fields: ['id', 'state'], limit: 1 },
    );
    const existingMove = existing[0];

    let moveId: number;
    if (existingMove) {
      moveId = existingMove.id;
      logger.info(SCOPE, 'Reusing existing move', {
        ref: payload.ref,
        odoo_id: moveId,
        state: existingMove.state,
      });
      // Si encore en draft et qu'on n'est pas en mode demo, on tente le post.
      // Si deja posted/cancel, on retourne juste l'id pour que Soluvia le sauve.
      if (existingMove.state === 'draft' && !payload.is_draft) {
        await this.executeKw<boolean>('account.move', 'action_post', [
          [moveId],
        ]);
      }
    } else {
      const lineIds = payload.lines.map((l) => [
        0,
        0,
        {
          name: l.description,
          quantity: l.quantity,
          price_unit: l.price_unit,
          tax_ids: taxIdsCmd,
        },
      ]);

      const moveVals: Record<string, unknown> = {
        move_type: moveType,
        partner_id: partnerId,
        invoice_date: payload.date_invoice,
        invoice_date_due: payload.date_due,
        ref: payload.ref,
        invoice_line_ids: lineIds,
      };
      if (companyId) moveVals.company_id = companyId;
      if (journalId) moveVals.journal_id = journalId;

      moveId = await this.executeKw<number>('account.move', 'create', [
        moveVals,
      ]);

      // Post the invoice (draft -> posted) sauf si is_draft (mode demo)
      if (!payload.is_draft) {
        await this.executeKw<boolean>('account.move', 'action_post', [
          [moveId],
        ]);
      }

      logger.info(
        SCOPE,
        payload.is_draft ? 'Created draft move' : 'Posted move',
        {
          ref: payload.ref,
          odoo_id: moveId,
          type: moveType,
          is_draft: payload.is_draft ?? false,
        },
      );
    }

    return { odoo_id: String(moveId) };
  }

  async pushInvoice(payload: OdooInvoicePayload) {
    return this.pushMove(payload);
  }

  async pushCreditNote(payload: OdooInvoicePayload) {
    return this.pushMove({ ...payload, is_credit_note: true });
  }

  // -------- Attach invoice PDF (ir.attachment) --------

  async attachInvoicePdf(params: OdooAttachmentInput): Promise<{
    attachment_id: number | null;
    skipped: boolean;
  }> {
    const moveId = Number(params.move_odoo_id);
    if (!Number.isFinite(moveId)) {
      throw new OdooRpcError(
        `attachInvoicePdf: move_odoo_id invalide (${params.move_odoo_id})`,
      );
    }

    // Idempotence : skip si une attachment du meme name existe deja sur ce
    // move. Necessaire car le sync peut re-tourner (ex: retry apres erreur
    // partielle) et on ne veut pas accumuler des doublons cote Odoo.
    const existingDomain: unknown[] = [
      ['res_model', '=', 'account.move'],
      ['res_id', '=', moveId],
      ['name', '=', params.name],
    ];
    const existing = await this.executeKw<number[]>(
      'ir.attachment',
      'search',
      [existingDomain],
      { limit: 1 },
    );
    if (existing.length > 0) {
      return { attachment_id: existing[0] ?? null, skipped: true };
    }

    const vals: Record<string, unknown> = {
      name: params.name,
      res_model: 'account.move',
      res_id: moveId,
      type: 'binary',
      datas: params.pdf_base64,
      mimetype: 'application/pdf',
    };
    if (params.company_id) vals.company_id = params.company_id;

    const attachmentId = await this.executeKw<number>(
      'ir.attachment',
      'create',
      [vals],
    );
    logger.info(SCOPE, 'Attached invoice PDF', {
      move_odoo_id: moveId,
      attachment_id: attachmentId,
      name: params.name,
    });
    return { attachment_id: attachmentId, skipped: false };
  }

  // -------- Push analytic line --------

  async pushAnalyticLineForMove(params: OdooAnalyticLineInput): Promise<{
    analytic_line_odoo_id: number | null;
    skipped: boolean;
    reason?: string;
  }> {
    // Lookup compte analytique par code. Si absent, skip non-bloquant : le
    // user doit créer le compte côté Odoo (ou FINANCES-WISEMANH) puis le
    // sync suivant repassera.
    const accountDomain: unknown[] = [['code', '=', params.code_analytique]];
    if (params.company_id) {
      // Compte de la company OU global (company_id=false : compte partagé)
      accountDomain.push('|');
      accountDomain.push(['company_id', '=', params.company_id]);
      accountDomain.push(['company_id', '=', false]);
    }
    const accountIds = await this.executeKw<number[]>(
      'account.analytic.account',
      'search',
      [accountDomain],
      { limit: 1 },
    );
    const accountId = accountIds[0];
    if (!accountId) {
      return {
        analytic_line_odoo_id: null,
        skipped: true,
        reason: `account.analytic.account code=${params.code_analytique} introuvable`,
      };
    }

    const vals: Record<string, unknown> = {
      account_id: accountId,
      date: params.date,
      name: params.name,
      amount: params.amount,
    };
    if (params.company_id) vals.company_id = params.company_id;
    if (params.partner_id) vals.partner_id = params.partner_id;

    const id = await this.executeKw<number>('account.analytic.line', 'create', [
      vals,
    ]);
    logger.info(SCOPE, 'Pushed analytic line', {
      analytic_line_odoo_id: id,
      account_id: accountId,
      code: params.code_analytique,
      amount: params.amount,
    });
    return { analytic_line_odoo_id: id, skipped: false };
  }

  // -------- Pull invoice payments (facture-driven) --------

  async pullInvoicePayments(moveIds: string[]): Promise<OdooInvoicePayment[]> {
    const ids = moveIds
      .map((m) => Number(m))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];

    type WidgetEntry = {
      amount: number;
      date: string;
      partial_id?: number;
      is_refund?: boolean;
      account_payment_id?: number | false;
    };
    type Widget = { content?: WidgetEntry[] } | false;
    type MoveRow = {
      id: number;
      payment_state: string;
      amount_total: number;
      amount_residual: number;
      invoice_payments_widget: Widget;
    };

    const moves = await this.executeKw<MoveRow[]>(
      'account.move',
      'read',
      [ids],
      {
        fields: [
          'payment_state',
          'amount_total',
          'amount_residual',
          'invoice_payments_widget',
        ],
      },
    );

    return moves.map((m) => {
      const widget = m.invoice_payments_widget;
      const content =
        widget && typeof widget === 'object' ? (widget.content ?? []) : [];
      // Avoirs exclus (is_refund) : ce ne sont pas des reglements en numeraire.
      // odoo_id reste compatible avec le format des paiements manuels
      // (`${account_payment_id}-${moveId}`) pour deduper ; fallback sur l'id de
      // reconciliation partielle pour les rapprochements directs de releve.
      const payments = content
        .filter((c) => !c.is_refund)
        .map((c, i) => ({
          odoo_id:
            typeof c.account_payment_id === 'number'
              ? `${c.account_payment_id}-${m.id}`
              : `recon-${c.partial_id ?? `${m.id}-${i}`}`,
          amount: Number(c.amount),
          date: c.date,
        }));
      return {
        invoice_odoo_id: String(m.id),
        payment_state: m.payment_state,
        amount_total: Number(m.amount_total),
        amount_residual: Number(m.amount_residual),
        payments,
      };
    });
  }

  // -------- Register payment (manual reconciliation) --------

  /**
   * Cree un paiement client lettre a la facture via le wizard standard Odoo
   * (account.payment.register). Le wizard se charge de :
   * - selectionner le journal bancaire de la societe de la facture
   * - generer l'ecriture comptable (debit Banque / credit Client)
   * - poster le payment (state=posted)
   * - lettrer la ligne client de la facture avec celle du payment
   *
   * En cas d'erreur Odoo (facture deja payee, etat invalide, journal absent),
   * une OdooRpcError est levee avec le message Odoo.
   */
  async registerPayment(
    params: OdooPaymentInput,
  ): Promise<{ odoo_id: string }> {
    const moveId = Number(params.invoice_odoo_id);
    if (!Number.isFinite(moveId) || moveId <= 0) {
      throw new OdooRpcError(
        `invoice_odoo_id invalide: ${params.invoice_odoo_id}`,
      );
    }

    // Verifie que la facture existe et est posted (sinon le wizard refusera)
    type MoveCheck = {
      id: number;
      state: string;
      payment_state: string;
      move_type: string;
      amount_residual: number;
      name: string | false;
    };
    const moves = await this.executeKw<MoveCheck[]>('account.move', 'read', [
      [moveId],
      ['id', 'state', 'payment_state', 'move_type', 'amount_residual', 'name'],
    ]);
    const move = moves[0];
    if (!move) {
      throw new OdooRpcError(`Facture Odoo ${moveId} introuvable`);
    }
    if (move.state !== 'posted') {
      throw new OdooRpcError(
        `Facture Odoo ${moveId} non posted (state=${move.state}) - impossible d'enregistrer un paiement`,
      );
    }
    if (move.move_type !== 'out_invoice') {
      throw new OdooRpcError(
        `Move Odoo ${moveId} n'est pas une facture client (move_type=${move.move_type})`,
      );
    }
    if (move.payment_state === 'paid' || move.payment_state === 'in_payment') {
      throw new OdooRpcError(
        `Facture Odoo ${moveId} deja payee (payment_state=${move.payment_state})`,
      );
    }
    if (params.amount > move.amount_residual + 0.01) {
      throw new OdooRpcError(
        `Montant ${params.amount} superieur au reste a payer ${move.amount_residual}`,
      );
    }

    // Cree le wizard avec active_ids contextualise sur la facture.
    // Odoo charge alors les default_amount/journal_id/payment_type a partir
    // de la facture, on ne surcharge que ce qui est necessaire.
    const communication = params.communication ?? (move.name || undefined);
    const wizardId = await this.executeKw<number>(
      'account.payment.register',
      'create',
      [
        {
          amount: params.amount,
          payment_date: params.payment_date,
          ...(communication ? { communication } : {}),
        },
      ],
      {
        context: {
          active_model: 'account.move',
          active_ids: [moveId],
          active_id: moveId,
        },
      },
    );

    // Declenche la creation effective du payment. action_create_payments
    // retourne une action dict avec res_id (single) ou domain (multi).
    type ActionResult =
      | {
          res_id?: number;
          res_ids?: number[];
          domain?: unknown;
        }
      | false;
    const action = await this.executeKw<ActionResult>(
      'account.payment.register',
      'action_create_payments',
      [[wizardId]],
    );

    // Recupere l'id du payment cree. Selon Odoo, l'action peut contenir res_id
    // directement (single payment) ou un domain avec id. On fait un fallback
    // robuste via account.payment.search_read.
    let paymentId: number | undefined;
    if (action && typeof action === 'object') {
      if (typeof action.res_id === 'number') paymentId = action.res_id;
      else if (Array.isArray(action.res_ids) && action.res_ids.length > 0) {
        paymentId = action.res_ids[0];
      }
    }
    if (!paymentId) {
      // Fallback: recherche le dernier payment lettre a cette facture.
      const linked = await this.executeKw<Array<{ id: number }>>(
        'account.payment',
        'search_read',
        [
          [
            ['reconciled_invoice_ids', 'in', [moveId]],
            ['state', '=', 'posted'],
          ],
        ],
        { fields: ['id'], order: 'id desc', limit: 1 },
      );
      paymentId = linked[0]?.id;
    }
    if (!paymentId) {
      throw new OdooRpcError(
        `Payment cree mais id introuvable apres action_create_payments (move ${moveId})`,
      );
    }

    logger.info(SCOPE, 'Registered payment', {
      move_id: moveId,
      payment_id: paymentId,
      amount: params.amount,
    });

    // Format coherent avec pullPayments : odoo_id = `${paymentId}-${moveId}`
    // pour eviter doublons lors du pull suivant (qui upsert sur odoo_id).
    return { odoo_id: `${paymentId}-${moveId}` };
  }

  // -------- Pull cancellations --------

  async pullCancellations(since: string): Promise<OdooCancelledMove[]> {
    type CancelRecord = {
      id: number;
      name: string | false;
      ref: string | false;
      state: string;
      write_date: string;
    };

    const sinceOdoo = since
      .replace('T', ' ')
      .replace(/\.\d+/, '')
      .replace('Z', '')
      .slice(0, 19);

    const moves = await this.executeKw<CancelRecord[]>(
      'account.move',
      'search_read',
      [
        [
          ['state', '=', 'cancel'],
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ['write_date', '>=', sinceOdoo],
        ],
      ],
      { fields: ['id', 'name', 'ref', 'state', 'write_date'] },
    );

    return moves.map((m) => ({
      odoo_id: String(m.id),
      ref: typeof m.ref === 'string' && m.ref.length > 0 ? m.ref : null,
      state: 'cancel',
      write_date: m.write_date,
    }));
  }

  // -------- Detect unreconciled incoming bank lines (read-only) --------

  async findUnreconciledIncomingBankLines(
    limit = 200,
  ): Promise<OdooUnreconciledBankLine[]> {
    type BankLineRecord = {
      id: number;
      amount: number;
      payment_ref: string | false;
      partner_id: [number, string] | false;
      date: string | false;
    };

    const lines = await this.executeKw<BankLineRecord[]>(
      'account.bank.statement.line',
      'search_read',
      [
        [
          ['is_reconciled', '=', false],
          ['amount', '>', 0],
        ],
      ],
      {
        fields: ['id', 'amount', 'payment_ref', 'partner_id', 'date'],
        order: 'date desc',
        limit,
      },
    );

    return lines.map((l) => ({
      id: l.id,
      amount: Number(l.amount),
      payment_ref: typeof l.payment_ref === 'string' ? l.payment_ref : '',
      partner_name: Array.isArray(l.partner_id) ? l.partner_id[1] : null,
      date: typeof l.date === 'string' ? l.date : '',
    }));
  }
}

// ---------------------------------------------------------------------------
// Stub implementation (used when env vars are missing)
// ---------------------------------------------------------------------------

function createStubOdooClient(): OdooClient {
  return {
    async ping() {
      return {
        ok: true,
        uid: 0,
        version: 'stub',
        isStub: true,
      };
    },
    async pushInvoice(payload) {
      const odoo_id = `ODOO-STUB-${Date.now()}`;
      logger.info(SCOPE, 'pushInvoice (stub)', {
        ref: payload.ref,
        odoo_id,
        lines: payload.lines.length,
      });
      return { odoo_id };
    },
    async pushCreditNote(payload) {
      const odoo_id = `ODOO-STUB-CN-${Date.now()}`;
      logger.info(SCOPE, 'pushCreditNote (stub)', {
        ref: payload.ref,
        odoo_id,
        lines: payload.lines.length,
      });
      return { odoo_id };
    },
    async pullInvoicePayments(moveIds) {
      logger.info(SCOPE, 'pullInvoicePayments (stub)', {
        count: moveIds.length,
      });
      return [];
    },
    async pullCancellations(since) {
      logger.info(SCOPE, 'pullCancellations (stub)', { since });
      return [];
    },
    async findUnreconciledIncomingBankLines(limit) {
      logger.info(SCOPE, 'findUnreconciledIncomingBankLines (stub)', { limit });
      return [];
    },
    async registerPayment(params) {
      const odoo_id = `ODOO-STUB-PAY-${Date.now()}-${params.invoice_odoo_id}`;
      logger.info(SCOPE, 'registerPayment (stub)', {
        invoice_odoo_id: params.invoice_odoo_id,
        amount: params.amount,
        date: params.payment_date,
        odoo_id,
      });
      return { odoo_id };
    },
    async attachInvoicePdf(params) {
      logger.info(SCOPE, 'attachInvoicePdf (stub)', {
        move_odoo_id: params.move_odoo_id,
        name: params.name,
      });
      return { attachment_id: null, skipped: true };
    },
    async pushAnalyticLineForMove(params) {
      logger.info(SCOPE, 'pushAnalyticLineForMove (stub)', {
        code: params.code_analytique,
        amount: params.amount,
      });
      return { analytic_line_odoo_id: null, skipped: true, reason: 'stub' };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns an OdooClient.
 *
 * Reads ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY from env.
 * Falls back to a stub if any is missing (so local dev keeps working
 * without Odoo configured).
 */
export function createOdooClient(): OdooClient {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    logger.warn(SCOPE, 'Odoo env vars missing - using stub client');
    return createStubOdooClient();
  }

  return new OdooJsonRpcClient({ url, db, username, apiKey });
}
