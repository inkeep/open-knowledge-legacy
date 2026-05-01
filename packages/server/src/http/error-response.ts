/**
 * RFC 9457 Problem Details error-response helper (D22, D38, FR3).
 *
 * Single sanctioned site for emitting HTTP error bodies from
 * `api-extension.ts` handlers. Constructs a typed
 * `ProblemDetails` body, validates it against `ProblemDetailsSchema`,
 * sets `Content-Type: application/problem+json`, generates a UUID
 * `instance` correlation ID (D13) when caller doesn't pass one,
 * increments the `ok.api.error.count` telemetry counter (D37 / FR14),
 * and emits a Pino `log.error()` line with the same `instance` value
 * for grep correlation between the HTTP response and the structured
 * log.
 *
 * Inline `json(res, NNN, { ok: false, error: '...' })` calls are not
 * permitted in `api-extension.ts`, and inline `json(res, NNN, { ok: true, ... })`
 * success wrappers are not permitted either (D22 drops the `ok: true`
 * wrapper from success bodies). `error-envelope-coverage.test.ts` runs in
 * fail-on-any-occurrence mode: it AST-scans `api-extension.ts` for both
 * inline patterns and fails the build with file:line + handler name on any
 * match. New handlers go through `withValidation(...) + errorResponse(...)`
 * from day one.
 */

import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import {
  type ProblemDetails,
  ProblemDetailsSchema,
  type ProblemType,
  type StreamingProblemEvent,
  StreamingProblemEventSchema,
} from '@inkeep/open-knowledge-core';
import type { Counter } from '@opentelemetry/api';
import { getLogger } from '../logger.ts';
import { getMeter } from '../telemetry.ts';

const log = getLogger('http');

// Lazy-init so the counter registers against a real meter post-initTelemetry
// (not the pre-init no-op). Mirrors the `hintEmittedCounter` pattern in
// `api-extension.ts:193`.
let _apiErrorCounter: Counter | null = null;
function apiErrorCounter(): Counter {
  if (!_apiErrorCounter) {
    _apiErrorCounter = getMeter().createCounter('ok.api.error.count', {
      description: 'API error responses by problem type and handler',
      unit: '1',
    });
  }
  return _apiErrorCounter;
}

interface ErrorResponseOptions {
  /** Optional handler attribute for telemetry (`ok.api.error.count{handler}`). */
  handler?: string;
  /** Optional pre-generated correlation ID. Defaults to a fresh UUID. */
  instance?: string;
  /** Optional longer human-readable explanation (RFC 9457 `detail`). */
  detail?: string;
  /**
   * Optional RFC 9457 extension members merged onto the problem+json body
   * (§3.2). Use for typed structured data callers must read without parsing
   * `detail` strings (e.g. `colliding: [{existing, incoming, to}]` on
   * managed-rename collisions).
   *
   * Reserved RFC 9457 core fields (`type`/`title`/`status`/`instance`/`detail`)
   * are excluded from the type — passing them as extensions would be silently
   * dropped by the merge order at line ~110, so the type-system disallows the
   * footgun at compile time.
   */
  extensions?: Record<string, unknown> & {
    [K in 'type' | 'title' | 'status' | 'instance' | 'detail']?: never;
  };
  /** Optional headers merged into the response head (e.g. `Allow:` on 405). */
  extraHeaders?: Record<string, string>;
  /**
   * Optional `cause` chain forwarded to Pino's std serializer for the log
   * line. Surfaces underlying errno / syscall on storage failures.
   */
  cause?: unknown;
}

/**
 * Emit an RFC 9457 Problem Details error response.
 *
 * @param res - Node HTTP response. If the head has already been written,
 *   the call is suppressed and logged (defense-in-depth against async races
 *   and programming errors at any of the ~286 call sites).
 * @param status - HTTP status code, 4xx or 5xx. Mirrored to body.status (D22).
 * @param type - URN problem type (`urn:ok:error:<kebab>` per D38). Closed enum.
 * @param title - Required short human-readable English summary (D14).
 * @param options - Optional handler tag, instance UUID, detail, headers, cause.
 */
export function errorResponse(
  res: ServerResponse,
  status: number,
  type: ProblemType,
  title: string,
  options: ErrorResponseOptions = {},
): void {
  const instance = options.instance ?? randomUUID();

  // Defense-in-depth: if a handler has already started writing (async race,
  // programming error at any of the ~286 call sites), `res.writeHead()`
  // would throw `ERR_HTTP_HEADERS_SENT` and lose the original error. Mirror
  // `createStreamingErrorWriter`'s `writableEnded` guard so the sync path
  // is similarly defensive. Log the suppression so the failure stays loud
  // in dev tools / production telemetry instead of silently disappearing.
  if (res.headersSent) {
    log.error(
      {
        event: 'api.error.double-write',
        instance,
        type,
        status,
        handler: options.handler,
      },
      'errorResponse called after headers already sent — suppressed',
    );
    return;
  }

  const body: ProblemDetails = {
    type,
    title,
    status,
    instance,
    ...(options.detail ? { detail: options.detail } : {}),
  };
  // Defense-in-depth: validate the body against the schema. A bad
  // `errorResponse` call (e.g., empty title hitting `min(1)`) would have
  // crashed via throwing `.parse()` before any bytes left the process —
  // the original error that triggered `errorResponse` would be lost and
  // the client would get no HTTP response at all. Use `safeParse` and emit
  // a hardcoded fallback ProblemDetails so the client still gets a typed
  // response while the validation failure stays loud in logs + telemetry.
  const validated = ProblemDetailsSchema.safeParse(body);
  if (!validated.success) {
    log.error(
      {
        event: 'api.error.malformed-envelope',
        issues: validated.error.issues,
        body,
        handler: options.handler,
      },
      'errorResponse produced an invalid ProblemDetails body — emitting fallback',
    );
    res.writeHead(status, {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      ...options.extraHeaders,
    });
    res.end(
      JSON.stringify({
        type: 'urn:ok:error:internal-server-error' satisfies ProblemType,
        title: 'Internal server error.',
        status,
        instance,
      }),
    );
    return;
  }

  // RFC 9457 §3.2 extension members: emitted alongside `body` after schema
  // validation so the closed `ProblemDetails` shape stays the floor and
  // extensions ride as additional fields. The schema is `.loose()`, so
  // round-tripping through `safeParse` on the client preserves them.
  const wireBody: Record<string, unknown> = options.extensions
    ? { ...options.extensions, ...body }
    : body;

  apiErrorCounter().add(1, {
    type,
    ...(options.handler ? { handler: options.handler } : {}),
  });

  log.error(
    {
      event: 'api.error',
      instance,
      type,
      status,
      handler: options.handler,
      detail: options.detail,
      err: options.cause,
    },
    title,
  );

  res.writeHead(status, {
    'Content-Type': 'application/problem+json',
    'X-Content-Type-Options': 'nosniff',
    ...options.extraHeaders,
  });
  res.end(JSON.stringify(wireBody));
}

/**
 * Build a typed mid-stream error event for NDJSON streaming endpoints
 * (D36 c). The streaming protocol's `type` field discriminates event kinds
 * (`progress` | `complete` | `error`); RFC 9457 `ProblemDetails` lives
 * nested under `problem` so the streaming `type: 'error'` and the URN
 * `problem.type` never collide.
 *
 * Like `errorResponse(...)`, this generates a UUID `instance`, validates
 * the body against `StreamingProblemEventSchema`, increments the
 * `ok.api.error.count{type, handler}` counter, and emits a Pino
 * `log.error()` line with the same `instance` for grep correlation.
 *
 * The caller is responsible for writing the returned object to the stream
 * (`res.write(`${JSON.stringify(event)}\n`)`) — separation keeps the
 * helper synchronous and lets callers compose with their own
 * `res.writableEnded` / cleanup logic.
 *
 * @param status - HTTP-equivalent status mirrored to `problem.status` (D22).
 * @param type - URN problem type (`urn:ok:error:<kebab>` per D38).
 * @param title - Required short human-readable summary (D14).
 * @param options - Optional handler tag, instance UUID, detail, cause.
 * @returns The `{ type: 'error', problem: ProblemDetails }` event ready for
 *   `JSON.stringify` + `res.write` on the streaming response.
 */
export function streamingProblemEvent(
  status: number,
  type: ProblemType,
  title: string,
  options: ErrorResponseOptions = {},
): StreamingProblemEvent {
  const instance = options.instance ?? randomUUID();
  const problem: ProblemDetails = {
    type,
    title,
    status,
    instance,
    ...(options.detail ? { detail: options.detail } : {}),
  };
  const event: StreamingProblemEvent = { type: 'error', problem };
  StreamingProblemEventSchema.parse(event);

  apiErrorCounter().add(1, {
    type,
    ...(options.handler ? { handler: options.handler } : {}),
  });

  log.error(
    {
      event: 'api.streaming.error',
      instance,
      type,
      status,
      handler: options.handler,
      detail: options.detail,
      err: options.cause,
    },
    title,
  );

  return event;
}

/**
 * Bind a streaming-error writer to a specific `(res, handler)` pair. Returns
 * a closure that writes a typed `{ type: 'error', problem: ProblemDetails }`
 * event to the NDJSON stream, gated on `res.writableEnded` so a second call
 * after the response has been ended is a benign no-op.
 *
 * Three NDJSON streaming handlers in `api-extension.ts` (clone, auth-login,
 * auth-repos) need the same closure shape — extracting it here removes the
 * three-site duplication and lets future streaming handlers consume the
 * helper without rebuilding the same write/guard/counter scaffolding.
 *
 * @param res - The streaming response (already in `application/x-ndjson`
 *   mode; helper does NOT write the head).
 * @param handler - Handler tag for `ok.api.error.count{handler}`.
 */
export function createStreamingErrorWriter(
  res: ServerResponse,
  handler: string,
): (
  status: number,
  type: ProblemType,
  title: string,
  options?: { detail?: string; cause?: unknown },
) => void {
  return (status, type, title, options = {}) => {
    if (res.writableEnded) return;
    const event = streamingProblemEvent(status, type, title, { handler, ...options });
    res.write(`${JSON.stringify(event)}\n`);
  };
}

/**
 * Internal: reset the lazy-cached counter. Test-only — production callers
 * never invoke this. Allows narrow-integration tests to swap the meter
 * provider between cases without process restart.
 */
export function _resetApiErrorCounterForTest(): void {
  _apiErrorCounter = null;
}
