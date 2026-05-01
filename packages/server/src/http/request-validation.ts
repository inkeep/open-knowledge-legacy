/**
 * `withValidation()` middleware wrapper for HTTP request bodies (D34, FR12).
 *
 * Structural enforcement that handlers can't be added without going through
 * Zod validation: at handler registration, wrap with
 * `withValidation(XyzRequestSchema, async (req, res, body) => { ... })`.
 * The handler receives an already-validated, typed `body`. Failure auto-
 * routes through `errorResponse(res, 400, 'urn:ok:error:invalid-request', ...)`
 * — the inner handler never sees a malformed body.
 *
 * Body-shape errors emitted by this wrapper happen BEFORE
 * `extractAgentIdentity` is called by the inner handler, which is
 * semantically OK: no Y.Doc mutation is attempted, so the response is
 * legitimately anonymous. Semantic errors (handler-internal logic) must be
 * post-identity (attributed). The `attribution-sweep-coverage.test.ts`
 * ordering check (FR17-adjacent) enforces the distinction on mutating
 * handlers (precedent #24).
 *
 * Multipart binary parsing remains busboy's job (`POST /api/upload`); for
 * multipart handlers, call `validateBody(schema, parsedMetadata)` after
 * busboy assembles the metadata fields.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { errorResponse } from './error-response.ts';

/** 1 MB request-body cap — matches `MAX_BODY_BYTES` in `api-extension.ts`. */
const MAX_BODY_BYTES = 1_048_576;

/**
 * Read the full request body up to `MAX_BODY_BYTES`. Returns the raw `Buffer`
 * for callers that need bytes (or want to JSON-parse themselves). Throws
 * `PayloadTooLargeError` when the body exceeds the cap.
 */
async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body exceeded 1 MB cap');
    this.name = 'PayloadTooLargeError';
  }
}

export interface WithValidationOptions {
  /** Tag for telemetry; surfaces as `ok.api.error.count{handler}` attribute. */
  handler?: string;
  /**
   * If true, the wrapper does NOT read the request body. Caller is
   * responsible for parsing (e.g., busboy multipart). Use `validateBody()`
   * directly with the parsed metadata.
   */
  skipBodyParse?: boolean;
  /**
   * Allowed HTTP method. When set, the wrapper rejects mismatched methods
   * with a 405 + `Allow: <method>` BEFORE reading the body — proper REST
   * semantics (a GET on a POST-only endpoint should not consume the body).
   * Omitting accepts any method.
   */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /**
   * Runs after method check, BEFORE body read. Return `false` to short-
   * circuit (caller must already have emitted via `errorResponse`); return
   * `true` to proceed.
   *
   * Use cases:
   *   - **Security gate** (`checkLocalOpSecurity`): reject 403 loopback /
   *     Origin violations BEFORE consuming bytes from untrusted sources.
   *   - **Service-availability gate** (`getSyncEngine?.()`): emit 503
   *     `urn:ok:error:sync-not-active` early when the subsystem isn't
   *     initialized; saves the body read.
   *   - **Fail-fast preconditions** that depend only on headers/path.
   *
   * Compose multiple gates inline by returning early:
   *   ```ts
   *   preBodyGate: (req, res) => {
   *     if (!checkLocalOpSecurity(req, res, { handler })) return false;
   *     const engine = getSyncEngine?.();
   *     if (!engine) {
   *       errorResponse(res, 503, 'urn:ok:error:sync-not-active', '…', { handler });
   *       return false;
   *     }
   *     return true;
   *   }
   *   ```
   */
  preBodyGate?: (req: IncomingMessage, res: ServerResponse) => boolean;
}

/**
 * Validate a parsed body against a Zod schema and emit a 400 error response
 * on failure. Returns a discriminated `Result` so callers can branch on
 * validation outcome without try/catch ceremony. Used both directly by
 * multipart handlers and indirectly by `withValidation()`.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  res: ServerResponse,
  options: WithValidationOptions = {},
): { ok: true; value: T } | { ok: false } {
  const parseResult = schema.safeParse(raw);
  if (parseResult.success) {
    return { ok: true, value: parseResult.data };
  }
  const detail = parseResult.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Request body is invalid.', {
    handler: options.handler,
    detail,
  });
  return { ok: false };
}

export type ValidatedHandler<T> = (
  req: IncomingMessage,
  res: ServerResponse,
  body: T,
) => Promise<void> | void;

/**
 * Wrap a JSON-body handler with Zod validation. The wrapper:
 *   1. Reads the request body (up to `MAX_BODY_BYTES`).
 *   2. JSON-parses; on parse failure → 400 `urn:ok:error:invalid-request`.
 *   3. Schema-validates; on failure → 400 with field-path detail.
 *   4. Invokes the inner handler with a typed, validated body.
 *
 * Inner handler exceptions are NOT caught — `api-extension.ts` keeps its
 * existing top-level try/catch + 500 emission per handler. Symmetric with
 * the existing `json()` helper precedent at `api-extension.ts:1029`.
 */
export function withValidation<T>(
  schema: z.ZodType<T>,
  handler: ValidatedHandler<T>,
  options: WithValidationOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (options.method !== undefined && req.method !== options.method) {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: options.handler,
        extraHeaders: { Allow: options.method },
      });
      return;
    }

    if (options.preBodyGate !== undefined) {
      const gateOk = options.preBodyGate(req, res);
      if (!gateOk) return;
    }

    if (options.skipBodyParse) {
      // GET-style endpoint: don't read the body. Validate against an empty
      // object so the schema is still load-bearing (catches schemas that
      // require fields when paired with a no-body method by mistake).
      const validated = validateBody(schema, {}, res, options);
      if (!validated.ok) return;
      await handler(req, res, validated.value);
      return;
    }

    let raw: Buffer;
    try {
      raw = await readRequestBody(req);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        errorResponse(res, 413, 'urn:ok:error:invalid-request', 'Payload too large.', {
          handler: options.handler,
          cause: err,
        });
        return;
      }
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Failed to read request body.', {
        handler: options.handler,
        cause: err,
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = raw.length === 0 ? {} : JSON.parse(raw.toString('utf8'));
    } catch (err) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Request body is not valid JSON.', {
        handler: options.handler,
        cause: err,
      });
      return;
    }

    const validated = validateBody(schema, parsed, res, options);
    if (!validated.ok) return;

    await handler(req, res, validated.value);
  };
}
