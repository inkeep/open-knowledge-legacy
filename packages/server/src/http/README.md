# HTTP API discipline

Canonical pattern guide for handlers in `packages/server/src/api-extension.ts`. Every HTTP route follows this shape — drift is gated by `error-envelope-coverage.test.ts` (FR17 fail-on-any-occurrence meta-test) and `attribution-sweep-coverage.test.ts` (precedent #24 ordering check on mutating handlers).

## RFC 9457 Problem Details on errors

Errors emit on the wire as RFC 9457 Problem Details (D22 LOCKED):

```
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json
X-Content-Type-Options: nosniff

{
  "type": "urn:ok:error:invalid-request",
  "title": "Request body is invalid.",
  "status": 400,
  "instance": "01234567-89ab-4def-8123-456789abcdef",
  "detail": "parentDocName: Required"
}
```

- `type` is a URN (`urn:ok:error:<kebab>`) per D38 — not a relative URI. URNs are routing-independent (won't shift meaning under reverse-proxy / path-prefix). The token set is closed by policy (NG1) and lives in `packages/core/src/schemas/api.ts` as `ProblemTypeSchema`. Adding a token = single edit there + the handler PR that emits it.
- `title` is REQUIRED (D14). Short, English, may interpolate runtime values.
- `status` mirrors the HTTP response status (D22).
- `instance` is a fresh `crypto.randomUUID()` per emit (D13). Same value lands in the Pino `log.error()` line for grep correlation.
- `detail` is OPTIONAL — longer human-readable explanation when `title` isn't enough.

## Success path: flat shape, no `ok: true` wrapper

Successes drop the `{ ok: true, ... }` wrapper (D22):

```
HTTP/1.1 200 OK
Content-Type: application/json

{ "src": "attachments/photo.png", "deduped": true, "sha": "abc123", "byteLength": 1024 }
```

Client narrowing uses HTTP status. The two-step parse keeps non-contract responses (reverse-proxy 502 with HTML body, network error returning a different shape, malformed bytes) distinguishable from real `ProblemDetails` emits:

```ts
import { ProblemDetailsSchema, UploadAssetSuccessSchema } from '@inkeep/open-knowledge-core';
import { HttpResponseParseError } from '@/editor/http-client';

const res = await fetch(url, { method: 'POST', body });
const body = await res.json().catch(() => null);
if (!res.ok) {
  const problem = ProblemDetailsSchema.safeParse(body);
  if (!problem.success) {
    throw new HttpResponseParseError('Server returned non-RFC9457 error', {
      cause: problem.error,
      status: res.status,
    });
  }
  // problem.data.title for display, problem.data.type for typed routing,
  // problem.data.instance for grep correlation against the server log line.
} else {
  const success = UploadAssetSuccessSchema.safeParse(body);
  if (!success.success) {
    throw new HttpResponseParseError('Server returned malformed success body', {
      cause: success.error,
      status: res.status,
    });
  }
  // success.data.src ...
}
```

`HttpResponseParseError` lives in `packages/app/src/editor/http-client.ts`. Throwing the typed class lets callers route the non-contract path through their own retry / surface-to-user handling without confusing it with a real `ProblemDetails`.

## `errorResponse(...)` is the only sanctioned error emitter

```ts
import { errorResponse } from './http/error-response.ts';

errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Field X is required', {
  handler: 'upload-asset',
  detail: 'parentDocName: must be a non-empty string',
});
```

The helper:

1. Generates `instance` UUID (or accepts a caller-provided one).
2. Constructs the body and calls `ProblemDetailsSchema.parse()` for defense-in-depth.
3. Sets `Content-Type: application/problem+json` + `X-Content-Type-Options: nosniff`.
4. Increments the `ok.api.error.count{type, handler}` OTel counter (D37).
5. Emits a Pino `log.error()` line with the same `instance` UUID, plus `event: 'api.error'`, `type`, `status`, `handler`, `detail`, optional `err` cause chain.

Inline `json(res, NNN, { ok: false, error: '...' })` calls are not permitted, and inline `json(res, NNN, { ok: true, ... })` success wrappers are not permitted either (D22 drops the `ok: true` wrapper from success bodies). `error-envelope-coverage.test.ts` runs in fail-on-any-occurrence mode: it AST-scans `api-extension.ts` for both inline patterns and fails the build with file:line + handler name on any match. The migration shipped in stacked cluster PRs (US-004 through US-013) under an allowlist that shrank per cluster; US-014 retired the allowlist. New handlers go through `withValidation(...) + errorResponse(...)` from day one.

## `withValidation(...)` is the only sanctioned request-body validator

```ts
import { withValidation } from './http/request-validation.ts';
import { UploadRequestSchema } from '@inkeep/open-knowledge-core';

const handleUploadAsset = withValidation(
  UploadRequestSchema,
  async (req, res, body) => {
    // body is typed as UploadRequest — already validated.
    // ...handler logic...
  },
  { handler: 'upload-asset' },
);
```

The wrapper:

1. Reads the request body (up to 1 MB).
2. JSON-parses; on parse failure → 400 `urn:ok:error:invalid-request`.
3. Schema-validates; on failure → 400 with field-path detail.
4. Invokes the inner handler with the validated body.

Body-shape errors emitted by the wrapper happen BEFORE `extractAgentIdentity` is called (no Y.Doc mutation yet). Semantic errors raised by handler logic must be POST-identity (attributed). The `attribution-sweep-coverage.test.ts` ordering check enforces this on mutating handlers (precedent #24).

## Multipart handlers (`POST /api/upload`)

For multipart, busboy parses the binary stream upstream. Pass the resulting metadata object through `validateBody(schema, parsedMetadata, res, { handler: '...' })` after busboy assembly:

```ts
const validated = validateBody(UploadRequestSchema, multipartFields, res, {
  handler: 'upload-asset',
});
if (!validated.ok) return; // 400 already emitted
// validated.value is typed UploadRequest
```

## Streaming endpoints (NDJSON / `application/x-ndjson`)

Pre-stream errors (response head not yet written) → emit via `errorResponse(...)` problem+json normally.

Mid-stream errors (response head already written as `application/x-ndjson`) → emit an inline event in the stream via the `streamingProblemEvent(...)` helper:

```ts
import { streamingProblemEvent } from './http/error-response.ts';

const event = streamingProblemEvent(
  500,
  'urn:ok:error:clone-failed',
  'Clone subprocess exited with non-zero status.',
  { handler: 'local-op-clone', detail: stderrOutput },
);
res.write(`${JSON.stringify(event)}\n`);
```

Wire shape (matches `StreamingProblemEventSchema`):

```jsonc
{
  "type": "error",                          // streaming protocol discriminator
  "problem": {                              // RFC 9457 ProblemDetails (typed)
    "type": "urn:ok:error:clone-failed",
    "title": "Clone subprocess exited with non-zero status.",
    "status": 500,
    "instance": "01234567-89ab-4def-8123-456789abcdef",
    "detail": "fatal: repository not found"
  }
}
```

The outer `type` field stays the streaming protocol's event-kind discriminator (`progress | complete | error`); the URN problem identifier lives nested under `problem.type`. The two `type` fields share a name but never collide because the streaming `type` is a fixed enum (3 values) while `problem.type` is the closed `ProblemTypeSchema` URN union.

`streamingProblemEvent(...)` mirrors `errorResponse(...)`'s side effects: generates a UUID `instance`, validates against `StreamingProblemEventSchema`, increments `ok.api.error.count{type, handler}`, emits a Pino `log.error()` line with the same `instance`. The caller writes the returned event to the stream so the helper stays synchronous and composes with the caller's `res.writableEnded` / cleanup logic.

CLI-emitted error events on subprocess streams should be intercepted and wrapped: don't pass through untyped `{ type: 'error', message: '…' }` lines. Wrap them in `streamingProblemEvent(...)` so every mid-stream error event carries a `problem: ProblemDetails` payload — clients read `event.problem.title`, not `event.message`.

See `handleLocalOpClone` for the canonical streaming-endpoint pattern: pre-stream gates → `errorResponse(...)`; subprocess spawn + CLI event interception + mid-stream errors → `streamingProblemEvent(...)`.

## Closed-enum exhaustiveness

`ProblemType` is the canonical closed enum for problem-type URNs; client and server `switch`-narrow over it. Every such switch ends in `default: assertNeverProblemType(type)` (alongside `assertNeverLinkTarget(target)` for `LinkTarget` and any peer enum). A single meta-test at `packages/app/tests/integration/exhaustiveness-coverage.test.ts` AST-scans the workspace, auto-discovers every switch over a closed-DU type, and fails CI if the `default:` arm is missing or non-exhaustive — no per-callsite ratchet, no allowlist. Adding a new enum member fans out to a localized type error at every consumer until each one extends its switch or dispatches the new case.

## Telemetry

`ok.api.error.count{type, handler}` counter (D37) — pure `ok.<area>` namespace per CLAUDE.md observability guidance. Cardinality bounded: `type` ∈ closed `ProblemTypeSchema` (≈ 10–80 literals); `handler` ∈ ~57 route names. Total ≈ 285 unique combinations — within Prometheus / Tempo budget.

## Per-handler smoke tests

Every migrated handler ships a co-located narrow-integration test at `packages/app/tests/integration/api-error-envelope/<handler>.test.ts` covering:

- ≥1 success-path assertion: `safeParse(XyzSuccessSchema, body).success === true` against a real success emit; `Content-Type: application/json`.
- ≥1 error-path assertion: `safeParse(ProblemDetailsSchema, body).success === true` against a real error emit; `Content-Type: application/problem+json`; `body.status === HTTP status`.

Real helper, real schema, real handler — only the `IncomingMessage` / `ServerResponse` pair is mocked. ~20 LoC per handler.

## The `{ ok }` convention

Across HTTP / IPC / registry-lookup envelopes, `ok` is the canonical discriminator field name. The codebase converges on 50+ sites; the AssetViewerRegistry lookup shape is `{ ok: true, viewer } | { ok: false }`, mirroring every other typed result envelope in the workspace. The HTTP success body itself drops the wrapper entirely (status code is the discriminator) — `{ ok }` only appears on result envelopes that don't have an HTTP-status channel.

## See also

- [`PRECEDENTS.md`](../../../../PRECEDENTS.md) precedent #38 — HTTP API surfaces emit RFC 9457 problem details + typed validation.
- [`AGENTS.md`](../../../../AGENTS.md) §STOP rules — the FR16 cluster (HTTP API discipline, agent-undo single-path, `recordContributor` summary normalization).
- `packages/core/src/schemas/api.ts` — every `XyzRequestSchema` / `XyzSuccessSchema` and the `ProblemDetailsSchema` / `ProblemTypeSchema` / `StreamingProblemEventSchema` triple.
- `packages/app/src/editor/http-client.ts` — `HttpResponseParseError` for client-side non-contract response routing.
