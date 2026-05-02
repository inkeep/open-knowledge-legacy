import {
  createDefaultGBrainCommandRunner,
  type GBrainCommandResult,
  type GBrainCommandRunner,
  type GBrainStatus,
} from './gbrain-status';

export const GBRAIN_SEARCH_DEFAULT_LIMIT = 10;
export const GBRAIN_SEARCH_MAX_RENDER_LIMIT = 50;
export const GBRAIN_SEARCH_MAX_FETCH_LIMIT = 50;
export const GBRAIN_SEARCH_TIMEOUT_MS = 5_000;

export interface GBrainSearchStatusProvider {
  getStatus(projectPath: string): Promise<GBrainStatus>;
}

export interface GBrainSearchRequest {
  query: string;
  limit?: number;
}

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
      code:
        | 'invalid-query'
        | 'not-matched'
        | 'timeout'
        | 'invalid-json'
        | 'missing-source-identifiers'
        | 'missing-embeddings'
        | 'search-failed';
      message: string;
      diagnostic?: string;
    };

interface CreateGBrainSearcherOptions {
  run?: GBrainCommandRunner;
  statusProvider: GBrainSearchStatusProvider;
  timeoutMs?: number;
}

class InvalidGBrainSearchJsonError extends Error {}

export function createGBrainSearcher(options: CreateGBrainSearcherOptions) {
  const run = options.run ?? createDefaultGBrainCommandRunner;
  const timeoutMs = options.timeoutMs ?? GBRAIN_SEARCH_TIMEOUT_MS;

  return {
    async search(projectPath: string, request: GBrainSearchRequest): Promise<GBrainSearchResponse> {
      const query = request.query.trim();
      if (query === '') {
        return {
          ok: false,
          code: 'invalid-query',
          message: 'Enter a search query.',
        };
      }

      const status = await options.statusProvider.getStatus(projectPath);
      if (status.state !== 'matched') {
        return {
          ok: false,
          code: 'not-matched',
          message: 'gbrain search is available only for registered gbrain sources.',
          diagnostic: status.state,
        };
      }

      const limit = normalizeRequestedLimit(request.limit);
      const fetchLimit = getFetchLimit(limit);
      const commandResult = await run(
        [
          'call',
          'query',
          JSON.stringify({
            query,
            limit: fetchLimit,
          }),
        ],
        { timeoutMs },
      );
      const commandFailure = mapSearchCommandFailure(commandResult);
      if (commandFailure !== null) return commandFailure;

      let rows: GBrainSearchResult[];
      try {
        rows = parseGBrainSearchJson(commandResult.stdout);
      } catch (err) {
        return {
          ok: false,
          code: 'invalid-json',
          message: 'gbrain returned an unexpected search response.',
          diagnostic: err instanceof Error ? err.message : String(err),
        };
      }

      if (rows.length > 0 && !rows.some((row) => row.sourceId !== undefined)) {
        return {
          ok: false,
          code: 'missing-source-identifiers',
          message: 'gbrain results could not be safely scoped to this project.',
        };
      }

      return {
        ok: true,
        sourceId: status.sourceId,
        limit,
        results: rows.filter((row) => row.sourceId === status.sourceId).slice(0, limit),
      };
    },
  };
}

export function parseGBrainSearchJson(stdout: string): GBrainSearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new InvalidGBrainSearchJsonError(err instanceof Error ? err.message : String(err));
  }

  if (!Array.isArray(parsed)) {
    throw new InvalidGBrainSearchJsonError('expected array of search rows');
  }

  const rows: GBrainSearchResult[] = [];
  for (const rawRow of parsed) {
    if (typeof rawRow !== 'object' || rawRow === null) continue;
    const row = rawRow as Record<string, unknown>;
    const slug =
      readNonEmptyString(row.slug) ??
      readNonEmptyString(row.page_id) ??
      readNonEmptyString(row.chunk_id);
    if (slug === undefined) continue;

    const title = readNonEmptyString(row.title);
    const snippet =
      readNonEmptyString(row.chunk_text) ?? readNonEmptyString(row.chunk_source) ?? title ?? slug;
    const score =
      typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : undefined;
    const stale = typeof row.stale === 'boolean' ? row.stale : undefined;
    const sourceId = readNonEmptyString(row.source_id);

    rows.push({
      sourceId,
      slug,
      title,
      snippet,
      score,
      stale,
    });
  }

  return rows;
}

function normalizeRequestedLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return GBRAIN_SEARCH_DEFAULT_LIMIT;
  return Math.max(1, Math.min(GBRAIN_SEARCH_MAX_RENDER_LIMIT, Math.floor(limit)));
}

function getFetchLimit(renderLimit: number): number {
  return Math.min(GBRAIN_SEARCH_MAX_FETCH_LIMIT, Math.max(renderLimit, renderLimit * 4));
}

function mapSearchCommandFailure(result: GBrainCommandResult): GBrainSearchResponse | null {
  if (result.timedOut === true) {
    return {
      ok: false,
      code: 'timeout',
      message: 'gbrain search did not respond in time.',
    };
  }
  if (result.errorCode !== undefined || result.exitCode !== 0) {
    const diagnostic = compactDiagnostic(result);
    if (diagnostic !== undefined && /embed|embedding|vector/i.test(diagnostic)) {
      return {
        ok: false,
        code: 'missing-embeddings',
        message: 'gbrain search is not ready for this project yet.',
        diagnostic,
      };
    }
    return {
      ok: false,
      code: 'search-failed',
      message: 'gbrain search failed.',
      diagnostic,
    };
  }
  return null;
}

function compactDiagnostic(result: GBrainCommandResult): string | undefined {
  const stderr = result.stderr.trim();
  if (stderr !== '') return stderr;
  const stdout = result.stdout.trim();
  if (stdout !== '') return stdout;
  if (result.errorCode !== undefined) return result.errorCode;
  if (result.exitCode !== null) return `exit ${result.exitCode}`;
  return undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
