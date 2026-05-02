export type GBrainStatus =
  | { state: 'not-installed'; message: string }
  | { state: 'not-configured'; message: string; diagnostic?: string }
  | { state: 'not-registered'; projectPath: string; message: string }
  | { state: 'matched'; sourceId: string; sourceName: string; localPath: string }
  | {
      state: 'error';
      code: string;
      message: string;
      diagnostic?: string;
    };

export interface GBrainSearchResult {
  sourceId?: string;
  slug: string;
  title?: string;
  snippet: string;
  score?: number;
  stale?: boolean;
}

export type GBrainSearchResponse =
  | {
      ok: true;
      sourceId: string;
      limit: number;
      results: GBrainSearchResult[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      diagnostic?: string;
    };

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'json' | 'ok' | 'status'>>;

export const DEFAULT_GBRAIN_SEARCH_LIMIT = 10;

export async function fetchGBrainStatus(fetcher: FetchLike = fetch): Promise<GBrainStatus> {
  try {
    const response = await fetcher('/api/gbrain/status');
    const payload = await response.json().catch(() => null);
    return normalizeGBrainStatusPayload(response.ok, payload);
  } catch {
    return {
      state: 'error',
      code: 'request-failed',
      message: 'Could not check gbrain status.',
    };
  }
}

export async function searchGBrain(
  query: string,
  options: { fetcher?: FetchLike; limit?: number } = {},
): Promise<GBrainSearchResponse> {
  try {
    const response = await (options.fetcher ?? fetch)('/api/gbrain/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit: options.limit ?? DEFAULT_GBRAIN_SEARCH_LIMIT,
      }),
    });
    const payload = await response.json().catch(() => null);
    return normalizeGBrainSearchPayload(payload);
  } catch {
    return {
      ok: false,
      code: 'request-failed',
      message: 'Could not search gbrain.',
    };
  }
}

export function normalizeGBrainStatusPayload(ok: boolean, payload: unknown): GBrainStatus {
  if (
    ok &&
    typeof payload === 'object' &&
    payload !== null &&
    isGBrainStatus((payload as { status?: unknown }).status)
  ) {
    return (payload as { status: GBrainStatus }).status;
  }

  return {
    state: 'error',
    code: 'invalid-status-response',
    message: 'Could not check gbrain status.',
  };
}

export function normalizeGBrainSearchPayload(payload: unknown): GBrainSearchResponse {
  if (typeof payload !== 'object' || payload === null) {
    return {
      ok: false,
      code: 'invalid-search-response',
      message: 'gbrain returned an unexpected search response.',
    };
  }

  const response = payload as Record<string, unknown>;
  if (
    response.ok === true &&
    typeof response.sourceId === 'string' &&
    typeof response.limit === 'number' &&
    Array.isArray(response.results)
  ) {
    return {
      ok: true,
      sourceId: response.sourceId,
      limit: response.limit,
      results: response.results.filter(isGBrainSearchResult),
    };
  }

  if (response.ok === false && typeof response.code === 'string') {
    return {
      ok: false,
      code: response.code,
      message: typeof response.message === 'string' ? response.message : 'gbrain search failed.',
      diagnostic: typeof response.diagnostic === 'string' ? response.diagnostic : undefined,
    };
  }

  return {
    ok: false,
    code: 'invalid-search-response',
    message: 'gbrain returned an unexpected search response.',
  };
}

function isGBrainStatus(value: unknown): value is GBrainStatus {
  if (typeof value !== 'object' || value === null) return false;
  const status = value as Record<string, unknown>;
  if (typeof status.state !== 'string') return false;
  if (status.state === 'matched') {
    return (
      typeof status.sourceId === 'string' &&
      typeof status.sourceName === 'string' &&
      typeof status.localPath === 'string'
    );
  }
  if (status.state === 'not-registered') {
    return typeof status.projectPath === 'string' && typeof status.message === 'string';
  }
  if (
    status.state === 'not-installed' ||
    status.state === 'not-configured' ||
    status.state === 'error'
  ) {
    return typeof status.message === 'string';
  }
  return false;
}

function isGBrainSearchResult(value: unknown): value is GBrainSearchResult {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.slug === 'string' && typeof row.snippet === 'string';
}
