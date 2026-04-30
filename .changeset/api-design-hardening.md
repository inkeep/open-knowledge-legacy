---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(api): RFC 9457 Problem Details envelope across all HTTP handlers (api-design-hardening)

All 57 handlers in `packages/server/src/api-extension.ts` now share a single canonical wire format:

- **Errors** emit `Content-Type: application/problem+json` with a flat body `{ type, title, status, instance?, detail? }` per [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html). The `type` field is a closed-enum URN of the form `urn:ok:error:<kebab>` (per RFC 9457 §3.1.1 — URN form is routing-independent and won't change meaning under reverse-proxy / path-prefix). The `title` is a required short English summary; `instance` is a UUID correlation ID emitted alongside the structured Pino log line for grep-correlated triage; `detail` is an optional longer explanation.
- **Success** drops the `{ ok: true, ... }` wrapper and emits a flat `{ ...data }` body with `Content-Type: application/json`. Clients narrow on the HTTP status code (`if (!res.ok)`) before parsing — the RFC 9457 two-step parse pattern.

This is a wire-format breaking change for any direct in-process consumer of the HTTP API. The `@inkeep/open-knowledge` MCP shim's internal `httpGet` / `httpPost` helpers wrap the new flat success body with `{ok: true, ...body}` for in-process MCP tools so existing `if (!result.ok) return error` short-circuits keep working — MCP's own `{content, isError?}` envelope is unchanged.

Structural enforcement:

- Per-handler `XyzRequestSchema` + `XyzSuccessSchema` Zod schemas live in `@inkeep/open-knowledge-core/schemas/api`. Every schema exports `satisfies StandardSchemaV1<...>`.
- Request bodies validated through a `withValidation()` middleware wrapper at `packages/server/src/http/request-validation.ts` (handlers can't be added without going through it).
- Errors emit through `errorResponse(res, status, type, title, options)` at `packages/server/src/http/error-response.ts` — the only sanctioned site (`packages/app/tests/integration/error-envelope-coverage.test.ts` runs in fail-on-any-occurrence mode and AST-scans `api-extension.ts` for inline `{ ok: false, ... }` and `{ ok: true, ... }` literals).
- NDJSON streaming endpoints (clone, auth-login, auth-repos) emit pre-stream errors through `errorResponse` and mid-stream errors through `streamingProblemEvent({type: 'error', problem: ProblemDetails})` events — typed envelope preserved across the streaming protocol.
- Closed-enum `ProblemType` URNs (~40 tokens) plus `assertNeverProblemType` / `assertNeverLinkTarget` exhaustiveness helpers are structurally enforced by `packages/app/tests/integration/exhaustiveness-coverage.test.ts` — derived from the schema at test-discovery time so the registry never drifts.
- Telemetry: `ok.api.error.count{type, handler}` counter increments on every error emit.

Client lockstep: 23 sites in `packages/app/src` reading `data.ok` / `body.ok` / `raw.ok` migrated to the two-step parse pattern. `class HttpResponseParseError` distinguishes contract-shape responses (RFC 9457 problem details) from non-contract responses (proxy 502 HTML, network failures).

Defense-in-depth: SVG is in `IMAGE_EXTENSIONS` (so the editor's `<img src=svg>` rendering still works — browsers ignore Content-Disposition for embed contexts) but excluded from `INLINE_RENDERABLE_EXTENSIONS` so top-level navigation to `.svg` (web fallback `window.open` from a markdown SVG link) downloads instead of executing embedded `<script>` under same origin. Aligns with Docmost's posture; cf. GHSA-rcg8-g69v-x23j (Plane SVG XSS).

Full spec + decision log (D1–D38, US-001 through US-014): [`specs/2026-04-30-api-design-hardening/SPEC.md`](specs/2026-04-30-api-design-hardening/SPEC.md). Canonical pattern guide: [`packages/server/src/http/README.md`](packages/server/src/http/README.md).
