import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Eduvia API types
// ---------------------------------------------------------------------------

export interface EduviaApiResponse<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface EduviaContract {
  id: number;
  state: string;
  start_date: string | null;
  end_date: string | null;
  funding_amount: number | null;
  employee_learner?: {
    id: number;
    last_name: string;
    first_name: string;
    email?: string;
  };
  formation?: { id: number; title: string; duration?: number };
  company?: { id: number; name: string };
}

export interface EduviaLearner {
  id: number;
  last_name: string;
  first_name: string;
  email?: string;
}

export interface EduviaFormation {
  id: number;
  title: string;
  duration?: number;
}

export interface EduviaCompany {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// fetchAllPages — paginated Eduvia API fetcher
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT = 3_000; // 3 seconds
const PER_PAGE = 100;

/**
 * Fetches all pages of a given Eduvia API resource.
 *
 * - Uses `Authorization: Bearer {apiKey}`
 * - 3-second timeout per request
 * - Returns flattened array of all items across all pages
 *
 * @throws on HTTP error with status code and response text
 */
export async function fetchAllPages<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T[]> {
  const baseUrl = instanceUrl.replace(/\/$/, '');
  const allItems: T[] = [];

  // Fetch first page to discover total pages
  const firstPage = await fetchPage<T>(baseUrl, apiKey, resource, 1);
  allItems.push(...firstPage.data);

  const { last_page } = firstPage.meta;

  // Fetch remaining pages sequentially to avoid rate limits
  for (let page = 2; page <= last_page; page++) {
    const result = await fetchPage<T>(baseUrl, apiKey, resource, page);
    allItems.push(...result.data);
  }

  logger.info(
    'eduvia_client',
    `Fetched ${allItems.length} items from ${resource}`,
    {
      resource,
      totalPages: last_page,
      totalItems: allItems.length,
    },
  );

  return allItems;
}

async function fetchPage<T>(
  baseUrl: string,
  apiKey: string,
  resource: string,
  page: number,
): Promise<EduviaApiResponse<T>> {
  const url = `${baseUrl}/api/v1/${resource}?page=${page}&per_page=${PER_PAGE}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const text = await response
      .text()
      .catch(() => '(impossible de lire la réponse)');
    throw new Error(
      `Eduvia API erreur ${response.status} pour ${resource} (page ${page}): ${text}`,
    );
  }

  return (await response.json()) as EduviaApiResponse<T>;
}
