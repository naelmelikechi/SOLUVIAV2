// HTTP client pour /api/v1/quality/*. Implementation reelle qui sera utilisee
// quand Eduvia aura publie les endpoints (cf discussion 2026-05-05).
//
// Tant que les endpoints ne sont pas publies, le factory retourne le mock.
// Switch via env EDUVIA_QUALITY_API_MODE :
//   - undefined ou 'mock' : MockClient (defaut)
//   - 'real' : HttpClient (necessite apiKey + baseUrl)
//
// Le ping() permet de detecter si l'instance Eduvia est prete : si le HTTP
// client renvoie 404 sur /api/v1/status, on saura que les endpoints ne sont
// pas encore deployes.

import { logger } from '@/lib/utils/logger';
import type {
  EduviaQualityClient,
  QualityCampus,
  QualityClientPingResult,
  QualityCriterion,
  QualityDeliverable,
  QualityDeliverableStatus,
  QualityEvidence,
  QualityIndicator,
} from './quality-types';
import { EduviaQualityMockClient } from './quality-client-mock';

const SCOPE = 'eduvia.quality';

interface ApiResponse<T> {
  data: T;
  meta?: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

class EduviaQualityHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'EduviaQualityHttpError';
  }
}

interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
}

class EduviaQualityHttpClient implements EduviaQualityClient {
  constructor(private readonly config: HttpClientConfig) {}

  private buildHeaders(extra: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json',
      ...extra,
    };
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...this.buildHeaders(), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      let code: string | undefined;
      let message = `HTTP ${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as Partial<ApiError>;
        if (body.error) {
          code = body.error.code;
          message = body.error.message;
        }
      } catch {
        // body non-JSON, on garde le statusText
      }
      throw new EduviaQualityHttpError(message, res.status, code);
    }
    return (await res.json()) as T;
  }

  async ping(): Promise<QualityClientPingResult> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/status`, {
        headers: this.buildHeaders(),
      });
      if (!res.ok) {
        return {
          ok: false,
          authenticated: 'connection-error',
          error: `HTTP ${res.status}`,
        };
      }
      const body = (await res.json()) as {
        status: string;
        version?: string;
        authenticated: QualityClientPingResult['authenticated'];
      };
      return {
        ok: body.authenticated === 'ok',
        authenticated: body.authenticated,
        version: body.version,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, 'ping failed', { error: msg });
      return {
        ok: false,
        authenticated: 'connection-error',
        error: msg,
      };
    }
  }

  async listCampuses(): Promise<QualityCampus[]> {
    const r =
      await this.fetchJson<ApiResponse<QualityCampus[]>>('/api/v1/campuses');
    return r.data;
  }

  async listCriteria(): Promise<QualityCriterion[]> {
    const r = await this.fetchJson<ApiResponse<QualityCriterion[]>>(
      '/api/v1/quality/criteria',
    );
    return r.data;
  }

  async listIndicators(criterionId: number): Promise<QualityIndicator[]> {
    const r = await this.fetchJson<ApiResponse<QualityIndicator[]>>(
      `/api/v1/quality/criteria/${criterionId}/indicators`,
    );
    return r.data;
  }

  async listDeliverables(indicatorId: number): Promise<QualityDeliverable[]> {
    const r = await this.fetchJson<ApiResponse<QualityDeliverable[]>>(
      `/api/v1/quality/indicators/${indicatorId}/deliverables`,
    );
    return r.data;
  }

  async listDeliverableStatuses(
    campusId: number,
  ): Promise<QualityDeliverableStatus[]> {
    const r = await this.fetchJson<ApiResponse<QualityDeliverableStatus[]>>(
      `/api/v1/campuses/${campusId}/quality/deliverable_statuses?per_page=100`,
    );
    return r.data;
  }

  async listEvidences(
    campusId: number,
    deliverableId: number,
  ): Promise<QualityEvidence[]> {
    const r = await this.fetchJson<ApiResponse<QualityEvidence[]>>(
      `/api/v1/campuses/${campusId}/quality/deliverables/${deliverableId}/evidences`,
    );
    return r.data;
  }

  async uploadEvidence(
    campusId: number,
    deliverableId: number,
    file: { name: string; type: string; bytes: ArrayBuffer | Uint8Array },
  ): Promise<QualityEvidence> {
    const formData = new FormData();
    formData.append('deliverable_id', String(deliverableId));
    const blob = new Blob([file.bytes as BlobPart], { type: file.type });
    formData.append('file', blob, file.name);

    const url = `${this.config.baseUrl}/api/v1/campuses/${campusId}/quality/evidences`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(), // pas de Content-Type, multipart auto
      body: formData,
    });
    if (!res.ok) {
      throw new EduviaQualityHttpError(
        `Upload failed: HTTP ${res.status}`,
        res.status,
      );
    }
    const body = (await res.json()) as ApiResponse<QualityEvidence>;
    return body.data;
  }

  async updateEvidenceStatus(
    evidenceId: number,
    status: 'conform' | 'rejected',
  ): Promise<QualityEvidence> {
    const r = await this.fetchJson<ApiResponse<QualityEvidence>>(
      `/api/v1/quality/evidences/${evidenceId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    return r.data;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateClientOpts {
  /** Cle API Eduvia, recuperee depuis client_api_keys (chiffree en DB) */
  apiKey?: string;
  /** Base URL de l'instance Eduvia (defaut https://back.eduvia.app) */
  baseUrl?: string;
  /** Force le mode (sinon lit env EDUVIA_QUALITY_API_MODE) */
  mode?: 'mock' | 'real';
}

export function createEduviaQualityClient(
  opts: CreateClientOpts = {},
): EduviaQualityClient {
  const mode =
    opts.mode ??
    (process.env.EDUVIA_QUALITY_API_MODE === 'real' ? 'real' : 'mock');

  if (mode === 'real') {
    const baseUrl =
      opts.baseUrl ??
      process.env.EDUVIA_API_BASE_URL ??
      'https://back.eduvia.app';
    if (!opts.apiKey) {
      logger.warn(SCOPE, 'mode=real demande mais apiKey absent, fallback mock');
      return new EduviaQualityMockClient();
    }
    return new EduviaQualityHttpClient({ baseUrl, apiKey: opts.apiKey });
  }

  return new EduviaQualityMockClient();
}

export { EduviaQualityHttpError, EduviaQualityHttpClient };
