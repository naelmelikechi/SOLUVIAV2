import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Eduvia API types - mirror the OpenAPI spec at
// https://demo.eduvia.app/api/docs/openapi.yaml (saved as /tmp/eduvia_openapi.yaml).
// ---------------------------------------------------------------------------

export interface EduviaApiResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

/** Single-object (non-paginated) response, used by per-contract progressions. */
export interface EduviaObjectResponse<T> {
  data: T;
}

export interface EduviaContract {
  id: number;
  employee_id: number;
  company_id: number;
  formation_id: number;
  teacher_id: number | null;
  campus_id: number;
  contract_number: string | null;
  internal_number: string | null;
  contract_type: string | null;
  contract_mode: string | null;
  contract_state: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_conclusion_date: string | null;
  practical_training_start_date: string | null;
  creation_mode: string;
  support: string | null;
  support_first_equipment: string | null;
  npec_amount: number | null;
  referrer_name: string | null;
  referrer_amount: number | null;
  referrer_type: string;
  created_at: string;
  updated_at: string;
}

export interface EduviaLearner {
  id: number;
  first_name: string;
  last_name: string;
  gender: string | null;
  phone_number: string | null;
  formation_id: number | null;
  internal_number: string | null;
  learning_start_date: string | null;
  learning_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaFormation {
  id: number;
  rncp: string | null;
  code_diploma: string | null;
  diploma_type: string | null;
  qualification_title: string;
  duration: number | null;
  sequence_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaCompany {
  id: number;
  denomination: string;
  siret: string | null;
  naf: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
  employee_count: number | null;
  idcc_code: string | null;
  employer_type: string | null;
  campus_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaInvoiceStep {
  id: number;
  contract_id: number;
  invoice_id: number | null;
  step_number: number;
  opening_date: string;
  total_amount: number;
  including_pedagogie_amount: number;
  including_rqth_amount: number;
  paid_amount: number;
  in_progress_amount: number;
  siret_cfa: string;
  external_code: string;
  invoice_state: string | null;
  invoice_sent_at: string | null;
}

export interface EduviaInvoiceForecastStep {
  id: number;
  contract_id: number;
  step_number: number;
  opening_date: string;
  total_amount: number;
  percentage: number;
  npec_amount: number;
  created_at: string;
  updated_at: string;
}

export interface EduviaProgression {
  contract_id: number;
  formation_id: number;
  total_spent_time: number;
  total_spent_time_hours: number;
  completed_sequences_count: number;
  sequence_count: number;
  progression_percentage: number;
  estimated_relative_time: number;
  average_score: number;
  last_activity_at: string | null;
  sequences: Array<Record<string, unknown>>;
}

/**
 * Response of GET /api/v1/status. UNWRAPPED - no { data } envelope, unlike
 * every other endpoint. `authenticated` is "ok" when the bearer token is
 * valid, anything else means the token was refused.
 */
export interface EduviaStatus {
  status: string;
  version: string;
  authenticated: string;
}

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT = 15_000; // 15 seconds - covers cold-start Cloudflare routes
const PER_PAGE = 100;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 1_500, 4_000]; // before retry N we wait RETRY_BACKOFF_MS[N-1]

/** Thrown when an Eduvia API endpoint returns 404 - means the endpoint isn't available yet. */
export class EndpointNotAvailableError extends Error {
  constructor(public resource: string) {
    super(`Endpoint /api/v1/${resource} pas encore disponible`);
    this.name = 'EndpointNotAvailableError';
  }
}

/** Thrown when Eduvia returns 401/403 - we must fail fast, retrying would just stall. */
export class AuthError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`Eduvia ${status} auth refusée pour ${url}`);
    this.name = 'AuthError';
  }
}

/** Thrown on non-404/401/403 4xx responses. Not retryable. */
export class HttpClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpClientError';
  }
}

function baseUrlFrom(instanceUrl: string): string {
  // instance_url is stored as "slug.eduvia.app" - API lives at "api.slug.eduvia.app"
  const cleanUrl = instanceUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
  return `https://api.${cleanUrl}`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET with timeout + exponential backoff on 5xx / network errors. 404 throws EndpointNotAvailableError, 401/403 throw immediately. */
async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.ok) return (await response.json()) as T;

      if (response.status === 404) {
        const resource = new URL(url).pathname.replace(/^\/api\/v1\//, '');
        throw new EndpointNotAvailableError(resource);
      }
      if (response.status === 401 || response.status === 403) {
        throw new AuthError(response.status, url);
      }
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastErr = new Error(`HTTP ${response.status} on ${url}`);
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 4_000);
        continue;
      }

      const text = await response.text().catch(() => '(réponse illisible)');
      // 4xx (other than 404/401/403 handled above) are client errors - not retryable.
      // We throw a specific error and re-throw it in the catch so backoff is skipped.
      const message = `Eduvia erreur ${response.status} pour ${url}: ${text.slice(0, 500)}`;
      if (response.status >= 400 && response.status < 500) {
        throw new HttpClientError(response.status, message);
      }
      throw new Error(message);
    } catch (err) {
      if (
        err instanceof EndpointNotAvailableError ||
        err instanceof AuthError ||
        err instanceof HttpClientError
      ) {
        throw err;
      }
      // Timeouts, DNS, TLS - retry
      if (attempt < MAX_RETRIES) {
        lastErr = err;
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 4_000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`Retries exhausted for ${url}`);
}

/**
 * Fetch all pages of a paginated list resource.
 */
export async function fetchAllPages<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T[]> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const allItems: T[] = [];

  const firstPage = await fetchJson<EduviaApiResponse<T>>(
    `${baseUrl}/api/v1/${resource}?page=1&per_page=${PER_PAGE}`,
    apiKey,
  );
  allItems.push(...firstPage.data);

  for (let page = 2; page <= firstPage.meta.total_pages; page++) {
    const result = await fetchJson<EduviaApiResponse<T>>(
      `${baseUrl}/api/v1/${resource}?page=${page}&per_page=${PER_PAGE}`,
      apiKey,
    );
    allItems.push(...result.data);
  }

  logger.info(
    'eduvia_client',
    `Fetched ${allItems.length} items from ${resource}`,
    {
      resource,
      totalPages: firstPage.meta.total_pages,
      totalItems: allItems.length,
    },
  );

  return allItems;
}

/**
 * Fetch a single object resource - used for per-contract progressions which
 * return `{ data: {...} }` instead of a paginated list.
 */
export async function fetchOne<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const result = await fetchJson<EduviaObjectResponse<T>>(
    `${baseUrl}/api/v1/${resource}`,
    apiKey,
  );
  return result.data;
}

/**
 * Fetch a simple list (no pagination expected, or pagination is not present).
 * Used by per-contract invoice_steps + invoice_forecast_steps endpoints.
 */
export async function fetchList<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T[]> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const result = await fetchJson<{ data: T[] }>(
    `${baseUrl}/api/v1/${resource}`,
    apiKey,
  );
  return result.data ?? [];
}

/**
 * Health check + token validation. Hits GET /api/v1/status which returns an
 * UNWRAPPED { status, version, authenticated } object (no `data` envelope).
 * Used as a cheap pre-check at the top of syncEduviaForClient so we bail out
 * with a clear error before running N paginated fetches against a dead API
 * or with a revoked token.
 */
export async function fetchStatus(
  instanceUrl: string,
  apiKey: string,
): Promise<EduviaStatus> {
  const baseUrl = baseUrlFrom(instanceUrl);
  return fetchJson<EduviaStatus>(`${baseUrl}/api/v1/status`, apiKey);
}
