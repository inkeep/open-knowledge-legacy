---
date: 2026-04-30
sources: code (packages/server/src/api-extension.ts grep enumeration of error strings), packages/core/src/schemas/api.ts (existing per-handler precedent)
type: decision-grounding
applies-to: Q20, Q21, Q22 (Decision batch 2)
---

# Decision grounding — Batch 2 (Q20 / Q22 / Q21)

## Q20 — Code-union shape: single shared vs per-handler

### Distinct error strings observed

`grep` of `json(res, NNN, { ok: false, error: '<literal>'` in `api-extension.ts`: **98 distinct error strings**. Top frequencies:

| Frequency | Error string | Future kebab code |
|---|---|---|
| 34× | `'Method not allowed'` | `'method-not-allowed'` (cross-handler shared) |
| 13× | `'Invalid docName'` | `'invalid-docname'` (shared) |
| 13× | `'Internal server error'` | `'internal-server-error'` (shared) |
| 11× | `'Invalid JSON body'` | `'invalid-json-body'` (shared) |
| 10× | `'Payload too large'` | `'payload-too-large'` (shared) |
| 10× | `'Invalid JSON'` | `'invalid-json'` (shared) |
| 8× | `'Backlink index not configured'` | `'backlink-index-not-configured'` (shared) |
| 7× | `'Body must be a JSON object'` | `'body-must-be-json-object'` (shared) |
| 5× | `'summary must be a string'` | `'invalid-summary'` (shared) |
| 5× | `'Shadow repo not configured'` | `'shadow-repo-not-configured'` (shared) |
| 4× | `'Sync engine not active'` | (shared) |
| 4× | `'storage-error'` (already kebab) | `'storage-error'` |
| 4× | `'path-escape'` (already kebab) | `'path-escape'` |
| (snip) | … 80+ more low-frequency strings | many handler-specific |
| 13 sites | template-literal interpolated (e.g., `` `'${docName}' is reserved` ``) | code is fixed, message interpolated |

**Shape observation.** ~10-15 codes appear in 2+ handlers (cross-cutting); the rest are 1-handler-specific. Migration is essentially: convert ~98 English strings to kebab codes with deduped naming.

### Three viable shapes

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **A. Single `HttpErrorCode` union** (all codes shared) | `export const HttpErrorCodeSchema = z.enum([...all 80+ kebab codes])` | One source-of-truth file; uniform helper signature `errorResponse(res, NNN, code: HttpErrorCode, message, instance?)`; typo at call site rejected; client consumers (when they exist) get one type. | Adding a handler-specific code edits the shared file; ~80-100 literals in one union. |
| **B. Per-handler unions** | `UploadErrorCode = z.enum(['malformed-upload', ...])`, `AgentWriteErrorCode = z.enum([...])`, etc. — 57 small unions | Each handler's "what can I emit" is locally explicit; smaller per-PR diffs; cross-handler shared codes still typed (via shared sub-union). | Helper needs generic to narrow; many small files to maintain; cross-handler shared codes duplicated unless extracted. |
| **C. Hybrid: shared common codes + per-handler extras** | `CommonHttpErrorCode = z.enum([~12 cross-cutting codes])`; each handler unions it with its specifics | Best typing locality; avoids dedup pain on common codes. | More moving parts; convention drift risk (when does a code "go shared"?). |

### Recommendation: **A — single shared `HttpErrorCode` union**

Reasons:
1. Repo precedent is single-source-of-truth (`agent-write-summary.ts`, `auth-token-schema.ts`, `core/src/schemas/api.ts:7` — "single source of truth, no cross-process drift").
2. With 80-100 literals, the union is large but flat — TS handles flat literal unions trivially. No deep-instantiation risk.
3. Helper signature stays uniform: `errorResponse(res, NNN, code: HttpErrorCode, message, instance?)`. Generic-free, mechanical migration.
4. ~13 cross-handler-shared codes (`'method-not-allowed'`, `'invalid-json'`, etc.) get one definition. Per-handler shape duplicates them; hybrid adds a "promotion" decision per code.
5. Adding a new code = one line in the union; touches one file. Net cost lower than (B) or (C).

Confidence: MEDIUM — (B) is the pure-type-purist choice. (A) wins on practicality + matches repo convention.

## Q22 — Response-schema shape

### Existing precedent (verified)

`core/src/schemas/api.ts` already has 2 per-handler schemas:

```ts
export const ServerInfoResponseSchema = z.object({
  ok: z.literal(true),
  serverInstanceId: z.string().min(1),
  currentBranch: z.string().min(1).optional(),
  currentDiskAckSVs: z.record(z.string().min(1), z.string().min(1)).optional(),
}).loose();

export const PrincipalResponseSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  // …
}).loose();
```

Per-handler. `.loose()` for forward-compat. `z.infer` for derived types. Direct precedent for upload + every other handler.

### Three viable shapes

| Option | Shape | Notes |
|---|---|---|
| **A. Per-handler success schemas + shared error envelope** | Each handler: `XyzResponseSchema = z.discriminatedUnion('ok', [SuccessVariant, ApiErrorEnvelopeSchema]).loose()` | Matches existing 2 schemas; shared `ApiErrorEnvelopeSchema` used by all error variants. |
| **B. Single canonical `ApiResponse<TData>` generic** | `apiResponse(success) = z.discriminatedUnion('ok', [z.object({ ok: true, data: success }), ApiErrorEnvelope])` — wraps success fields under `data` | **Wire-breaking** — existing schemas have fields directly under `ok: true` (no `data` nesting). Migrating breaks every consumer. **Rejected.** |
| **C. Loose error envelope only (success shapes hand-rolled)** | Shared `ApiErrorEnvelopeSchema`; success shapes stay un-Zod'd | Half-migration; wastes the schema-as-SSOT win on success paths. |

### Recommendation: **A — per-handler success schemas + shared `ApiErrorEnvelopeSchema`**

`core/src/schemas/api.ts` (or new sibling `error-envelope.ts`) exports the shared `ApiErrorEnvelopeSchema`. Each handler's response schema unions its success variant with the shared error envelope. Existing 2 schemas (`ServerInfoResponse`, `Principal`) extend trivially — wrap them in `z.discriminatedUnion('ok', [...success, ApiErrorEnvelopeSchema])`.

Confidence: HIGH — (B) is wire-breaking; (C) is half-baked.

## Q21 — Per-handler smoke-test discipline

### Cost / value

Per-handler smoke test = one parse-success + one parse-failure assertion. ~10 LoC per handler. 57 handlers = ~570 LoC of test code, ~6KB after gzip. Test runtime: ~1ms per handler × 57 = <100ms total.

### Three viable shapes

| Option | Discipline | Notes |
|---|---|---|
| **A. Required for every migrated handler** | Each PR adds smoke test alongside the migration | High coverage; thin handlers (rarely-tested) get tests they didn't have. |
| **B. Required only for canonical example (handleUploadImage)** | One smoke test for upload; rest trust compile-time enforcement | Low cost; trusts TS narrowing to catch shape drift. |
| **C. Meta-test only** (single test that imports every schema and round-trips) | One `tests/integration/api-error-envelope-coverage.test.ts` enumerates schemas via reflection / the helper map | One test catches all schema-shape drift; doesn't test handler-emit logic. |

### Recommendation: **A — required for every migrated handler**

Rationale:
- IS6 risk (§14) is "regression on thinly-tested handlers." Per-handler smoke test directly closes that risk.
- Cost is small (~10 LoC each, mechanical).
- Per-cluster PR cadence already groups handlers; smoke tests land alongside their handler PR.
- (B) trusts compile-time, but TS narrowing doesn't catch runtime emission errors (e.g., handler builds an envelope without going through helper).
- (C) is good defense-in-depth but doesn't replace the per-handler test.

Confidence: HIGH — directly mitigates §14's largest IS6 risk.
