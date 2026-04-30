# API Design Hardening — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-30
**Baseline commit:** fbfe9673 (origin/main post-#270 squash-merge; spec was investigated against `5827e8c5` cycle-49 of finalize/asset-embed-surface, content-equivalent)
**Links:**
- Prior `/typescript-api-design` audit on PR #270's contract surfaces (cross-referenced against `network-boundary.md`, `in-process.md`, `errors.md`)
- `/type-safety` cross-reference: `./evidence/type-safety-cross-reference.md`
- Source PR: #270 (merged) — Editor asset + embed surface, streaming uploads
- Source spec: `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md` — the contracts being hardened
- Worldmodel grounding: `./evidence/_init_worldmodel.md`
- User outcomes capture: `./evidence/_user_outcomes.md`

---

<!-- AUTHORING NOTE: SPEC.md describes behaviors, contracts, and decisions.
     Code excerpts, file:line references, and type signatures live in `evidence/`. -->

## 1) Problem statement

**Situation.** PR #270 just merged 8 contract surfaces (S1-S8) spanning `core` / `server` / `app` / `desktop` — `POST /api/upload` + envelope (S1), `UploadWriteError` typed class (S2), `ClassifiedLinkTarget` discriminated union (S3, bidirectional — both app and server consume it), `DiskEvent` + `assertNeverDiskEvent` (S4, exemplary), `AssetViewerRegistry` (S5, empty at landing), `IpcChannelMap` (S6), `PropDef` (S7), `WikiEmbed*` compat descriptors (S8). The codebase has clear convergent patterns already (`{ ok, error }` envelope across 30+ HTTP sites; typed error classes with `name` + `reason`-field discriminator; `z.discriminatedUnion` precedent in `core/src/schemas/cc1.ts`; `assertNever*` precedent in `assertNeverDiskEvent`). The new surfaces also shipped concrete drift: kebab-case enums mixed with English sentences in `error` fields, zero exhaustiveness gates on 4 of 5 shipped discriminated unions, `UploadWriteReason` type-erased at the JSON boundary (server throws typed class, client parses `e.message` substring), and field-name divergence (`ok` vs `found`). Three concrete next-round work items will touch these surfaces within days-to-weeks: typed-component-nodes Phase 2 viewers (S5's first registrar), cb-v2 prop file-upload server-endpoint split (S1's next consumer), and three open PRs on `JsxComponentMeta` (#380 / #374 / #372).

**Complication.** Three pressures converge:

1. **Inherited drift.** Each new HTTP route, IPC channel, or descriptor copies from the nearest existing site. Without a defensible cut now, the next 5+ surfaces inherit the inconsistencies and re-derive the discipline per-surface.
2. **Cross-package contract erosion.** `UploadWriteReason` is type-erased at JSON; server-thrown reason and client-parsed `e.message` have no compile-time link. `ClassifiedLinkTarget` is bidirectional (server + app); narrowing without exhaustiveness gates breaks consumers in distant packages silently.
3. **First-consumer window.** `AssetViewerRegistry` is empty at landing. Phase 2 viewers (B1 in worldmodel) are the first consumer. Whatever ordering / unregister / overlap policy this hardening picks lands as ground truth at zero friction cost; any later policy retrofit pays full cost.

**Resolution.** Adopt a defensible cut focused on surfaces the next-round work touches: pin a canonical typed HTTP error envelope as a Zod-discriminated-union SSOT in `core` (server emits via `.parse()`, client consumes via `safeParse`), add `assertNever*` exhaustiveness gates on remaining shipped unions, normalize the `ok`/`found` field-name divergence to `ok`, and harden `AssetViewerRegistry` lifecycle (unregister fn, ordering model, collision warning) before B1 registers. Defer S6 IPC reason-union work to PR #354 typed-IPC migration. Defer wire-format forward-compat (RFC 9457 Problem Details, Idempotency-Key) and `PropDef` Zod-ification until concrete triggers (public SDK, third-party descriptors, MCP `upload_asset` tool).

## 2) Goals

- **G1.** Establish one canonical typed HTTP error envelope shape as a Zod schema in `core`, importable by both server emission and client consumption, eliminating type-erasure at the JSON boundary for upload reasons.
- **G2.** Add `assertNever*` exhaustiveness gates on shipped discriminated unions consumed across package boundaries (`ClassifiedLinkTarget`, `UploadWriteReason`/`UploadErrorCode`).
- **G3.** Normalize the `ok` vs `found` result-field-name divergence to `ok` while consumer count is low (1 file, 3 callers).
- **G4.** Harden `AssetViewerRegistry` lifecycle (`register()` returns unregister fn; document ordering model; warn on extension-key collision) before its first consumer (typed-component-nodes Phase 2 viewers) registers.
- **G5.** Each new HTTP route or descriptor that lands after this hardening can copy the canonical pattern without re-deriving the discipline.

## 3) Non-goals

- **[NOT NOW]** **NG1: Open `UploadWriteReason` (and the canonical error-code union) for wire consumers.** Closed by policy now; client and server ship together. Revisit if: MCP `upload_asset` tool ships (NG7 in `2026-04-16-editor-asset-and-embed-surface/SPEC.md`), OR a public SDK is generated.
- **[NOT NOW]** **NG2: RFC 9457 Problem Details adoption on `POST /api/upload`.** No multi-language consumer demand. Revisit if: external SDK or public-API exposure becomes concrete.
- **[NOT NOW]** **NG3: Idempotency-Key header support on `POST /api/upload`.** Same-dir sha256 dedup acts as content-level idempotency for typical uploads. Revisit if: 100MB+ video uploads become routine and network-blip retry costs measurable bandwidth.
- **[NOT NOW]** **NG4: `PropDef` as Zod schema (SSOT) + Standard Schema acceptance.** First-party descriptors only today. Revisit if: third-party descriptor registration or wire-shape exposure of descriptors surfaces.
- **[NOT NOW]** **NG5: S6 IPC reason-union normalization (discriminator field, exhaustiveness, open-vs-closed policy).** PR #354 typed-IPC migration owns this surface. Revisit if: PR #354 stalls or descopes IPC normalization.
- **[NEVER]** **NG6: Coordinate / claim `JsxComponentMeta` polish vs in-flight PRs #380 / #374 / #372.** Concurrent work owns that surface; this hardening's claim would create merge conflict and slow both. The three PRs land first; subsequent hardening (if needed) is a follow-on spec.
- **[NOT UNLESS]** **NG7: MCP envelope alignment (`{ ok, error }` extending to MCP tools).** This hardening is HTTP-only. MCP tools today return `{ content, isError? }` per MCP SDK contract — different shape. Only revisit if: a future spec for MCP `upload_asset` (NG7 in 2026-04-16 spec) decides to share an envelope across transports, AT WHICH POINT this hardening's `UploadResponseSchema` may be the inner-payload shape that gets wrapped by the MCP envelope.
- **[NOT NOW]** **NG8: Lint-rule integration (`@typescript-eslint/switch-exhaustiveness-check`).** Repo uses biome which doesn't ship the equivalent rule. Defense-in-depth nice-to-have. Revisit if: biome adds the rule, or repo migrates to dual-linter setup.
- **[NOT NOW]** **NG9: Negative type tests (`@ts-expect-error` files) for the canonical schemas.** Defense-in-depth nicety. Revisit if: schema shape regressions surface during the hardening's lifetime.
- **[NEVER]** **NG10: Branded types for upload-handler params** (`parentDocName`, `agentId`, `sha`, `tempPath`). The audit and type-safety cross-reference both rejected — heuristic for branded IDs ("two same-base-type IDs that get passed together where swapping is realistic") doesn't trigger here. Save brands for genuine cross-package ID confusion when it surfaces.

## 4) Personas / consumers

### P1: Internal devs writing next-round capability work

- **JTBD:** When I write the next HTTP route / IPC channel / descriptor / discriminated union, but the existing patterns are inconsistent, help me copy a canonical shape from one place so I don't re-derive the discipline (and don't propagate drift).
- **Current workflow + workarounds:** Each PR author copies from the nearest existing site (`handleUploadImage` → next route copies its error shape; `assertNeverDiskEvent` → next DU author may or may not add a guard). No central canonical pattern.
- **Pain points:** PR review catches drift inconsistently. Cycle 47-49 of PR #270's review surfaced 3 such items (file-watcher loop ordering, `mintTempUploadPath` sync throw classification, agent-local path in comment) — pattern is "fresh-eyes audit catches drift after merge."
- **Trust/security sensitivities:** Hardening must not break agent-attribution boundary (precedent #24); must not break STOP rules (`fs-traced` wrappers, `extractAgentIdentity` at every mutating handler); must not invent envelope that breaks identity-extraction.
- **Success in their terms:** Next route they write reuses `UploadResponseSchema` import; next DU they author has its own `assertNever*` helper alongside; PropPanel for a new viewer doesn't re-derive collision policy.

### P2: LLM agents writing via `/api/agent-write*`

- **JTBD:** When I write markdown via `/api/agent-write-md`, help me know whether the call succeeded by reading the response shape, with errors I can route on.
- **Current workflow:** Existing `agent-write*` routes already return `{ ok: true, ... } | { ok: false, error: 'string' }` — same shape `POST /api/upload` will adopt. Convergent.
- **Pain points:** None — agent-write envelope is already aligned.
- **Trust/security sensitivities:** Agent attribution must persist (precedent #24); identity extracted via `extractAgentIdentity` from query params (multipart precludes JSON body).
- **Success in their terms:** Hardening doesn't break the existing agent-write envelope. Hardening's canonical envelope IS the existing pattern, just typed and SSOT'd.

### P3: Operators triaging Pino structured logs

- **JTBD:** When an upload fails in production, help me find the correlation ID, agent attribution, and root-cause errno from one log line so I can triage without grepping mid-stream tempfile state.
- **Current workflow:** Pino structured logs at `[upload] dedup hit` etc. (api-extension.ts:4866). Already structured with `agentId`, `agentName`, `dedup`, `mime`, `size`, `destPath`, `httpStatus`.
- **Pain points:** Cycle 47 audit found gap — `UploadWriteError` catch path doesn't emit `log.error()` at app-level (HTTP status only). Discarded by bot as pre-existing pattern but real observability gap.
- **Trust/security sensitivities:** Cardinality safety (precedent: `normalizeFsPath` + `classifyFsPath`). Bounded fields only.
- **Success in their terms:** Correlation ID (`error.instance`) lets log lookup find the request; `error.code` is the typed reason union; `error.cause` chain (Pino std serializer) surfaces errno + path.

### P4: Future SDK consumers — DEFERRED

User's `_user_outcomes.md`: "No public-API trigger named." Flagged but not deeply persona'd. Hardening's `satisfies StandardSchemaV1<UploadResponse>` export is the cheap option-value insurance for this persona without committing to it.

## 5) User journeys

Internal-only spec; surfaces are TypeScript types + JSDoc + tests, not user UI. Journeys are dev-experience micro-paths.

### P1.1 — Adding a new HTTP route after the hardening

1. **Discovery.** Dev opens `api-extension.ts`, sees neighboring route handlers using `errorResponse(res, status, code, message?, instance?)` helper.
2. **Setup.** Imports `UploadResponseSchema` (or follows the same pattern from `core/src/schemas/api.ts`) for their own response.
3. **First use.** `errorResponse(res, 400, 'malformed-input', 'Field X is required')` — no string-concatenation, no inline `json(res, ...)`. Compile-error if `code` isn't in the canonical error-code union.
4. **Ongoing use.** Adding a new error code = add to the typed union + (optionally) update server emission. Client-side `safeParse` narrows automatically.
5. **Failure / debug.** New route author tries to ship `{ error: 'something' }` without a code. Helper signature rejects at compile time.
6. **Growth.** Future MCP `upload_asset` tool wraps the canonical envelope inside `{ content, isError? }`; same payload shape, transport-specific outer wrap.

### P1.2 — Registering a viewer against `AssetViewerRegistry` (Phase 2 PR)

1. **Discovery.** Phase 2 viewer author (Nick / Mike / similar) reads `asset-dispatch/types.ts` JSDoc.
2. **Setup.** Defines `viewer: AssetViewer` with `exts: ['pdf']` + `render: (ctx) => { ... }`.
3. **First use.** `const unregister = assetViewerRegistry.register(viewer)`. Returns unregister fn (matches React 19 ref-callback cleanup pattern).
4. **Ongoing use.** Hot-reload / test environments call `unregister()` to clean up.
5. **Failure / debug.** Two viewers register `'pdf'`. Console warning: "Viewer collision on `pdf`: replacing existing viewer." Last-registered wins (documented).
6. **Growth.** Image lightbox registers `['png', 'jpg', ...]`; video viewer registers `['mp4', 'webm']`. No friction.

### P1.3 — Switching on `ClassifiedLinkTarget`

1. **Discovery.** Dev writes `switch (target.kind)` for a new consumer (e.g., right-click context menu for asset hrefs).
2. **Setup.** Adds cases for `'doc'`, `'external'`, `'anchor'`, `'asset'`. Forgets `'asset'` initially.
3. **First use.** `default: assertNeverLinkTarget(target);` — TypeScript reports `'asset'` not assignable to `never`. Compile error points at the missing case.
4. **Ongoing use.** Future `ClassifiedLinkTarget` variant addition surfaces at every `assertNeverLinkTarget` site. Same discipline as `assertNeverDiskEvent`.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `UploadResponseSchema` parse on client | N/A (one-shot) | N/A | `safeParse(...).success === false` → typed error variant | `safeParse(...).success === true` → typed success variant | N/A |
| `AssetViewerRegistry.lookup(ext)` | N/A | `{ found: false }` (no registration) → ~~consumer~~ falls through to OS dispatch | N/A (lookup is total) | `{ ok: true; viewer }` (post-rename to `ok`) | N/A |

## 6) Requirements

### Functional requirements

| ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| FR1 | `core` exports `UploadResponseSchema` as a `z.discriminatedUnion('ok', [...])` keyed on the literal `ok` field | (a) Members are plain `z.object(...)` per Zod v4 footgun 7. (b) Module-load smoke-test parses one known-good payload per variant. (c) `z.infer<typeof UploadResponseSchema>` produces the expected `{ ok: true, ... } \| { ok: false, error: { code, message, instance? } }` shape. (d) Schema satisfies `StandardSchemaV1<UploadResponse>`. | See evidence/type-safety-cross-reference.md for footgun discipline. |
| FR2 | `core` exports a typed `UploadErrorCode` literal-union covering all server-emitted reasons | Codes: `'method-not-allowed' \| 'malformed-upload' \| 'storage-full' \| 'storage-readonly' \| 'storage-error' \| 'no-file-received' \| 'parent-doc-name-required' \| 'path-escape'`. (Server-side typed `UploadWriteReason` maps 1:1 onto the wire-side `UploadErrorCode`; the two unions converge in this hardening.) Adding a new code requires adding to the union + (optionally) the server-side classification table. | Closed by policy (NG1). |
| FR3 | `POST /api/upload` server-side handler emits all errors via a typed `errorResponse(res, status, code, message?, instance?)` helper that produces `UploadResponseSchema`-compliant bodies | Every error path in `handleUploadImage` (now `handleUploadAsset` post-rename if user wants — DELEGATED) returns through the helper. No inline `json(res, ...; { ok: false, error: 'string' })`. | Helper is server-internal; canonical pattern documented for new routes. |
| FR4 | Client-side upload caller (`packages/app/src/editor/image-upload/upload-file.ts` or equivalent) consumes the response via `safeParse(UploadResponseSchema, body)` and reads `result.data.error.code` directly | No `e.message` substring parsing. Compile-time link from server-thrown reason to client-narrowed code via shared Zod-derived types. | Eliminates the type-erasure-at-JSON-boundary failure mode (validation-narrowing.md). |
| FR5 | `core/src/utils/link-targets.ts` exports `assertNeverLinkTarget(value: never): never` | (a) Function throws at runtime with a useful message including the offending value. (b) At least one consumer call site (`internal-link.ts` or `link-resolution.ts`) terminates a `switch (target.kind)` with `default: assertNeverLinkTarget(target)`. (c) Adding a new `ClassifiedLinkTarget` variant produces compile errors at every guarded site. | Mirrors `assertNeverDiskEvent` precedent. |
| FR6 | `AssetViewerLookupResult.found` field renames to `ok` | (a) Type updated. (b) All 3 consumer sites (`dispatcher.ts` plus call sites) updated. (c) Repo-wide `{ ok }` convention is now uniform across HTTP / IPC / registry-lookup envelopes. | 1-way door for in-process consumers (low blast radius — one file, three callers). |
| FR7 | `AssetViewerRegistry.register(viewer)` returns an `unregister: () => void` cleanup callback | (a) Calling `unregister()` removes the viewer's extensions from the registry map. (b) Test or hot-reload environments use the returned fn for cleanup. (c) Type signature reflects the new return value. | Aligns with React 19 ref-callback cleanup idiom (in-process.md §3.2). |
| FR8 | `AssetViewerRegistry` warns on extension-key collision; documents "last-registered wins" as the explicit ordering policy | (a) When `register()` overwrites an existing extension, log a structured warning with `viewer.exts` and the prior registrant. (b) JSDoc on `register()` names the policy explicitly. (c) If a future viewer needs explicit-priority ordering, it's a separate spec. | Defines the contract before B1 registers. |
| FR9 | Module-load smoke-test exists for `UploadResponseSchema` (per Zod v4 footgun-7 defense) | At module load OR in a unit test alongside the schema, round-trip a known-good payload for each DU variant; failure throws with `z.prettifyError`. | Cheap mechanical defense; pattern from `discriminated-unions.md`. |

### Non-functional requirements

- **Performance:** Schema validation overhead on hot path (`POST /api/upload` response) is bounded — Zod v4 typical parse time for a 5-field flat object is sub-microsecond; acceptable on every request. No streaming-size sensitivity (response is small fixed shape).
- **Reliability:** Smoke-test (FR9) catches DU-member-validation footguns at module load before a real request can hit the broken schema. Compile-time discipline (FR5, FR2 closed union) catches drift at PR-author time.
- **Security/privacy:** No new attack surface. `error.instance` correlation ID must be a UUID or other unbounded-cardinality-safe value (not file path / agent name). Existing precedent #24 attribution boundary preserved (handlers still call `extractAgentIdentity`).
- **Operability:** `error.instance` enables log lookup. `error.cause` (ES2022) chain via Pino's std serializer surfaces underlying errno / syscall / path — already in place via PR #270's cycle-49 `UploadWriteError` constructor.
- **Cost:** Added dependency: none (Zod already in repo). Added bundle weight on app: minimal — `UploadResponseSchema` adds < 1KB gzipped (Zod's tree-shaking handles unused schemas; client only imports the parse helper).

## 7) Success metrics & instrumentation

- **Adoption signal (qualitative).** Next 2-3 new HTTP routes (A7 rename, A8 search via `/api/search`, B2 upload-image/-video/-audio split) reuse `errorResponse` helper or its pattern. If they don't, the helper isn't pulling its weight; revisit shape.
- **Drift catch (compile-time).** Adding a new variant to `ClassifiedLinkTarget`, `UploadErrorCode`, or `UploadResponseSchema` produces TypeScript errors at every `assertNeverLinkTarget` site or `safeParse` consumer. Verifiable by deliberately adding a variant and running `bun run check`.
- **Type-erasure elimination (binary).** `image-upload/index.ts` no longer parses `e.message` substring back to a typed reason. Grep-able: `grep -n "e.message" packages/app/src/editor/image-upload/` returns no upload-error-parse hits.
- **No new instrumentation events.** Existing structured Pino logs already cover the upload error path; the hardening adds a typed `error.code` field name for log-grep convenience but doesn't change emission.

## 8) Current state

Source: `evidence/_init_worldmodel.md` §1 (surface inventory), §4 (cross-package connection graph), §5 (pattern audit).

- Repo-wide HTTP envelope is `{ ok: true, ... } \| { ok: false, error: 'string' }` (verified 30+ sites in `api-extension.ts`). HTTP status code layered on top.
- Repo-wide IPC envelope (where typed) is `{ ok: true } \| { ok: false; reason: '<literal-union>' }` (7+ channels in `IpcChannelMap`).
- `assertNever*` adoption is exactly ONE site (`assertNeverDiskEvent`); `PropDef`'s JSDoc claims exhaustive switches with assertNever but the helper doesn't exist (documented-but-not-realized).
- `UploadWriteError` is server-internal-only; client at `image-upload/index.ts:319` parses `e.message` substring back to `UploadWriteReason`-shaped value. NO compile-time link across the JSON boundary.
- `ClassifiedLinkTarget` is bidirectional — `app` (renderer click + paste flows) AND `server` (`backlink-index.ts:431, 496`). 9 distinct dispatch sites across 6 files.
- `AssetViewerRegistry` is empty at landing (D-A11 in 2026-04-16 spec). First consumer is typed-component-nodes Phase 2 viewers (B1 in worldmodel).
- Field-name divergence: `IpcChannelMap` uses `ok`, `AssetViewerLookupResult` uses `found`. No precedent picks one.
- Zod v4 adoption: heavy in `cli/mcp/tools/*` (~21 files); moderate in `core/src/schemas/{api,cc1}.ts` (12 schemas total); zero on HTTP route request/response shapes today.
- Standard Schema adoption: zero — verified via grep. Greenfield add.
- PR #354 typed-IPC migration is seeded as `worktree-typed-ipc-migration` (Nick), directly responding to S6's own JSDoc trigger ("Currently 22 — past the trigger").

## 9) Proposed solution (vertical slice)

### User experience / surfaces

Internal-only — surfaces are TypeScript types, JSDoc, helper functions, tests. No UI / API endpoints / CLI / docs-site changes.

#### Affected files (high-level)

| File | Change |
|---|---|
| `packages/core/src/schemas/upload.ts` *(new)* | Define `UploadResponseSchema`, `UploadErrorCodeSchema`, types via `z.infer`. Module-load smoke-test. Standard Schema satisfies clause. |
| `packages/core/src/schemas/index.ts` (or `core/src/index.ts`) | Re-export the upload schemas. |
| `packages/core/src/utils/link-targets.ts` | Add `assertNeverLinkTarget(value: never): never`. |
| `packages/server/src/upload-errors.ts` | Update `UploadWriteReason` union to align 1:1 with `UploadErrorCode` (rename mapping table or fold into core's `UploadErrorCodeSchema`). |
| `packages/server/src/api-extension.ts` (`handleUploadImage` / `handleUploadAsset` rename DELEGATED) | Replace inline `json(res, ...)` calls with `errorResponse(res, status, code, message?, instance?)` helper. Helper colocated or extracted. |
| `packages/app/src/editor/image-upload/upload-file.ts` (or wherever the client parses the upload response) | Use `safeParse(UploadResponseSchema, body)`; consume typed `result.data.error.code`. Remove `e.message` substring parsing. |
| `packages/app/src/editor/asset-dispatch/registry.ts` + `types.ts` + consumers | (a) `AssetViewerLookupResult.found → ok` field rename. (b) `register(viewer)` returns `unregister: () => void`. (c) Collision warning. (d) JSDoc ordering-model declaration. |
| `packages/app/src/editor/extensions/internal-link.ts` (and similar) | Add `default: assertNeverLinkTarget(target)` to at least one `switch (target.kind)` site. |

### System design

- **Architecture overview:** Schema-first SSOT in `core` package; server emits via `.parse()` (typed throw on shape error — module bug, not user error); client consumes via `safeParse` (typed error on shape mismatch — server bug or version skew). Helper functions on the server (`errorResponse`) and client (parse + narrow) hide the schema mechanics from per-route author.
- **Data model:** No DB changes. PM schema unchanged.
- **API/transport:** Wire shape unchanged on success path (body still serializes to JSON with same keys); error path tightens (`error: string` → `error: { code: UploadErrorCode, message: string, instance?: string }`). Wire-compatible-with-prior because clients that previously read `error: string` would break — **but** the only consumer is the in-repo client which gets updated in lockstep (no third-party clients).
- **Auth/permissions:** Unchanged. `extractAgentIdentity` continues at handler entry per precedent #24.
- **Enforcement point(s):** Compile-time at PR review (TypeScript narrowing). Module-load smoke test at process start. No runtime feature flag.
- **Observability:** Pino structured logs unchanged in emission; `error.instance` UUID added to log line as a correlation field (cardinality-safe).

#### Data flow diagram

- **Primary flow (upload success):** Client `POST /api/upload` (multipart) → server `readUploadBody` (streaming) → `handleUploadImage` validates parentDocName → atomic link → server emits `UploadResponseSchema.parse({ ok: true, src, deduped?, sha?, byteLength? })` → 200 OK + JSON body → client `safeParse(UploadResponseSchema, body)` → narrowed success path.
- **Primary flow (upload error):** Same up to error site → server emits `errorResponse(res, status, code, message?, instance)` → response body matches the error variant of `UploadResponseSchema` → client `safeParse` → narrowed error path → `result.data.error.code` is a typed literal.
- **Shadow paths to test:**
  - **nil / missing:** Client receives a non-JSON response (proxy error, network failure) → `safeParse` returns `{ success: false, error: ZodError }` → client treats as `{ code: 'network-error' }` synthetic OR rethrows. Decision: **rethrow as a separate error class** — `UploadResponseSchema` covers contract responses, not network failures.
  - **wrong type:** Server returns malformed JSON (server bug or version skew) → `safeParse` fails → client logs + rethrows. The `instance` field aids triage.
  - **conflict:** N/A for upload (no concurrent-write semantics).
  - **partial failure:** Streaming pipeline fails mid-write → existing `UploadWriteError` path with `cause` chain → maps to typed `error.code`. Existing behavior, now typed.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Module-load smoke test | DU member shape drifts (e.g., a `z.union` slipped in as a member) | Throws at process start | Process refuses to boot; CI catches | None — caught before request can land |
| Server emission | Trying to emit a code not in the typed union | Compile error in `errorResponse` helper signature | Author adds the code to the union OR routes through generic 500 | None — caught at PR time |
| Client parse | Response body doesn't match schema (server version skew) | `safeParse` returns `{ success: false, error: ZodError }` | Client logs `instance` + raw body; rethrows synthetic network error to caller | User sees network-failure UX; instance ID in log for triage |
| Client parse | Response body matches schema but `error.code` is a value the client TS doesn't know about (forward compatibility) | TS literal-union narrowing rejects unknown value at compile time on the *client*; runtime narrowing falls through to `default` branch | If we ever open the union (NG1 trigger fires), client adds `(string & {})` catch-all | Should not happen pre-NG1 trigger (closed union by policy) |
| `AssetViewerRegistry.register` | Two viewers register `'pdf'` | `console.warn` on collision | Last-registered wins; first viewer is silently displaced | Phase 2 viewer author sees warn at startup |
| `AssetViewerRegistry.lookup` | No viewer registered for the queried extension | `{ ok: false }` discriminated result | Caller falls through to OS dispatch (current behavior) | User sees default-app open (unchanged from D-A11) |

### Alternatives considered

Per-decision in §10 Decision Log. Top-level alternatives considered + rejected:

- **Alternative A:** Adopt RFC 9457 Problem Details now. **Rejected** — no multi-language consumer demand (NG2). Defer until external SDK ships.
- **Alternative B:** Brand all upload-handler params (`parentDocName`, `agentId`, `sha`). **Rejected** — heuristic from `branded-ids.md` doesn't trigger; ceremony without payoff (NG10).
- **Alternative C:** Single shared `assertNever(value: never)` helper instead of per-DU helpers. **Rejected** — codebase precedent (`assertNeverDiskEvent`) is per-DU, gives clearer error messages, more grep-able.
- **Alternative D:** Hand-roll the error-shape unification with a TypeScript-only typed union (no Zod). **Rejected** — eliminates the JSON-boundary type-erasure (FR4) only if both sides import the same TS type, which is fine; BUT misses the runtime smoke test (FR9) and the Standard Schema option (FR1.d). Zod earns its weight here.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | MCP envelope alignment is OUT OF SCOPE for this hardening; HTTP-only canonical envelope. | X | LOCKED | No (NG7 spec can revisit) | Future MCP `upload_asset` tool (NG7 in 2026-04-16) is not concrete; binding the envelope to MCP semantics now would lock a 1-way door without evidence. PR #377 MCP shim refactor lowers the cost of a future revisit. | `evidence/_init_worldmodel.md` §11 Q1 | If NG7 spec ships, it inherits `{ ok, error }` payload shape wrapped in `{ content, isError? }` MCP envelope, OR diverges cleanly. Either is open to that spec. |
| D2 | S6 (IPC reason-union normalization) is OUT OF SCOPE. PR #354 typed-IPC migration owns it. | T | LOCKED | No | Hand-rolled DU normalization now is throwaway work — PR #354 will replace the layer. Hardening adding `assertNeverIpcReason` per channel would fight the migration. | `evidence/_init_worldmodel.md` §1 row S6 + §11 Q2 | This spec contributes nothing to S6. PR #354 chooses migration shape independently. |
| D3 | Hybrid pattern: Zod `discriminatedUnion` for unions that cross JSON boundaries; per-DU `assertNever*` for in-process unions. | T | LOCKED | No | Zod earns its weight on JSON-boundary unions (runtime validation, smoke-test, Standard Schema). For in-process DUs (`ClassifiedLinkTarget`), `assertNever*` is cheaper and matches `assertNeverDiskEvent` precedent. Both patterns coexist; pick by boundary-crossing. | `evidence/type-safety-cross-reference.md` IS1, IS2, IS5; `evidence/_init_worldmodel.md` §11 Q4 | New JSON-boundary unions adopt Zod-discriminated-union pattern. New in-process unions adopt `assertNever*` pattern. |
| D4 | Field name `ok` is canonical for result-discriminated unions across HTTP / IPC / registry-lookup envelopes. Rename `AssetViewerLookupResult.found → ok`. | T | LOCKED | Yes (in-process consumer migration) | Dominant pattern (HTTP + IPC, ~30+ sites). `found` is one site (`AssetViewerLookupResult`). Cleanest fix while consumer count is low. | `evidence/_init_worldmodel.md` §10 divergence row + §5.4 | One file + 3 callers updated. Future result-DUs use `ok`. |
| D5 | Spec scope is the defensible middle cut: harden surfaces next-round work touches (A1-A9 + B1-B4 from worldmodel); defer wire-format forward-compat and S6 to triggers. | X | DIRECTED | No | User direction in `_user_outcomes.md`: "code-health polish + general hardening before next-round capability work — pick a defensible cut." Worldmodel grounded the cut by mapping concrete next-touchers. | `evidence/_user_outcomes.md`; `evidence/_init_worldmodel.md` §2 | IS1-IS5 are In Scope; OS1-OS6 are Future Work with revisit triggers. |
| D6 | `UploadResponseSchema` ships as a single default `z.discriminatedUnion('ok', [...])` with `z.object` members. Object-mode hybrid (strict server / loose client) NOT split prematurely. | T | DIRECTED | No (reversible — can split later) | Premature splitting is unjustified before an "added field broke client" incident. The default `z.object` (strips unknowns on parse) is forward-compat enough for typical drift. Split if a real conflict surfaces. | `evidence/type-safety-cross-reference.md` IS1.a | Single export shape. Client parses leniently; server emits via `parse()`. |
| D7 | `UploadResponseSchema` exported with `satisfies StandardSchemaV1<UploadResponse>`. | T | LOCKED | No | Zero runtime cost in Zod v4 (native `~standard`). Future SDK gen / form validators / oRPC / Hono / Better-fetch accept Standard Schema without pinning to Zod. Greenfield is the right time to opt in. First Standard-Schema-bearing export in this codebase — sets precedent. | `evidence/type-safety-cross-reference.md` IS1.b; SKILL.md principle #2 | Future schemas in `core/src/schemas/*` may follow this pattern; not a STOP rule (one export doesn't make a standard). |
| D8 | `UploadWriteReason` (server) and `UploadErrorCode` (wire) unify — same literal-union, exported once from `core`. Server-side error class re-uses the wire union. | T | LOCKED | Yes (consumer-import boundary) | Eliminates the JSON-boundary type-erasure (FR4). Single source of truth for "what reasons can `POST /api/upload` produce." | `evidence/_init_worldmodel.md` §10 divergence row 3 | `packages/server/src/upload-errors.ts` imports the union from core. Adding a code = single edit in core. |
| D9 | `assertNeverLinkTarget` per-DU helper (not single shared `assertNever`) co-located with `ClassifiedLinkTarget` in `link-targets.ts`. | T | LOCKED | No | Codebase precedent (`assertNeverDiskEvent`); per-DU helpers give clearer compile-error messages and are more grep-able. | `evidence/type-safety-cross-reference.md` IS2 | Pattern for future in-process unions. |
| D10 | `AssetViewerRegistry.register()` returns `unregister: () => void`. Ordering policy: last-registered wins (with collision warn). Explicit-priority is a future-spec item. | T | LOCKED | Yes (registry public surface) | Aligns with React 19 ref-callback cleanup idiom. "Last-wins" matches `Map.set` semantics; warn surfaces collisions to plugin authors. Empty-at-landing means zero friction cost. | `evidence/_init_worldmodel.md` §1 row S5 + §3 (precedent #37 doesn't constrain) | B1 (Phase 2 viewers) registers against this contract. Future explicit-priority is opt-in if surfaces. |
| D11 | `handleUploadImage → handleUploadAsset` rename. | T | DELEGATED (implementer can pick name; rename optional) | No | Function name is stale post-FR-8 unification (route accepts all file types, not just images). Cosmetic. Bot discarded as cosmetic in cycle 47. | `evidence/_init_worldmodel.md` §1 row S1 footnote | Implementer's call. If rename, also update internal references; if not, JSDoc clarifying scope is enough. |

## 11) Open questions

*Empty. Step 4 (systematic open-question extraction + prioritization) runs next per workflow.*

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | PR #354 typed-IPC migration will land BEFORE or roughly alongside this hardening's implementation; if it stalls, S6 may need to come back into scope. | MEDIUM | Check PR #354 status before this spec's implementation begins; if it's stalled or descoped, reopen NG5. | Before implementation begins | Active |
| A2 | Open PRs #380 / #374 / #372 (touching `JsxComponentMeta`) land before this hardening's implementation; this spec doesn't touch their surface. | MEDIUM | Verify merge status pre-implementation; if any are still open, sequence accordingly. | Before implementation begins | Active |
| A3 | Zod v4 native `~standard` property is stable; `satisfies StandardSchemaV1<...>` works without runtime cost. | HIGH | Verified in `evidence/type-safety-cross-reference.md`; confirmed by Zod v4 docs. | Stable until Zod 5 | Active |
| A4 | Adding a `instance: string` (UUID) correlation field to upload error responses doesn't measurably increase response size or log cardinality. | HIGH | UUID adds ~36 bytes; cardinality is unbounded but fields like this are convention (Stripe `request_id`, AWS `x-amzn-requestid`). | N/A — verify in implementation | Active |

## 13) In Scope (implement now)

### IS1 — `UploadResponseSchema` (Zod) as SSOT in `core`

- **Goal:** One canonical typed schema for `POST /api/upload` response, importable by both server emission and client consumption.
- **Non-goals:** No RFC 9457 adoption (NG2); no MCP envelope binding (NG7); no `PropDef` Zod-ification (NG4).
- **Requirements:** FR1, FR2, FR9.
- **Proposed solution:** `core/src/schemas/upload.ts` defines `z.discriminatedUnion('ok', [...])` with plain `z.object` members; module-load smoke-test parses one known-good payload per variant; export with `satisfies StandardSchemaV1<UploadResponse>`.
- **Owner / DRI:** Nick (per `_user_outcomes.md` framing).
- **Next actions:** Define schema; wire smoke test; export from `core/src/index.ts`.
- **Risks + mitigations:** Zod v4 footgun 7 (lazy DU member validation) — mitigated by smoke test (FR9) and "z.object members only" rule. Footgun 6 (transform breaks JSON Schema) — mitigated by avoiding `.transform()`; use `.overwrite()` if normalization needed.
- **What gets instrumented/measured:** `error.instance` correlation ID in Pino structured logs.

### IS2 — `assertNeverLinkTarget` exhaustiveness guard

- **Goal:** Adding a new `ClassifiedLinkTarget` variant produces compile errors at every dispatch site.
- **Non-goals:** No biome / eslint lint integration (NG8). No negative type tests (NG9).
- **Requirements:** FR5.
- **Proposed solution:** Define + export `assertNeverLinkTarget(value: never): never` in `link-targets.ts`. Adopt at least one consumer site (`internal-link.ts` or `link-resolution.ts`) as the canonical example.
- **Owner / DRI:** Nick / Miles (whoever touches asset-click dispatch next).
- **Next actions:** Define helper; pick canonical adopter site; add `default: assertNeverLinkTarget(target)`.
- **Risks + mitigations:** None substantive. Mechanical change.

### IS3 — Field-name normalization (`found` → `ok`)

- **Goal:** Single field-name convention for result-discriminated unions across HTTP / IPC / registry-lookup.
- **Non-goals:** No broader rename sweep beyond `AssetViewerLookupResult`.
- **Requirements:** FR6.
- **Proposed solution:** Rename type field; update 3 call sites.
- **Owner / DRI:** Nick.
- **Next actions:** Edit `asset-dispatch/types.ts`; update consumers.
- **Risks + mitigations:** TypeScript catches every consumer; no runtime change.

### IS4 — `AssetViewerRegistry` lifecycle hardening

- **Goal:** Plugin contract is well-shaped before Phase 2 viewers register.
- **Non-goals:** No explicit-priority ordering (Future Work); no per-ext options schema (NG4-adjacent).
- **Requirements:** FR7, FR8.
- **Proposed solution:** `register()` returns `unregister: () => void`; collision warning on duplicate ext; JSDoc names ordering policy explicitly ("last-registered wins").
- **Owner / DRI:** Nick.
- **Next actions:** Update `registry.ts` + `types.ts`; document policy in JSDoc.
- **Risks + mitigations:** Empty-at-landing means zero existing registrants to break.

### IS5 — Server-client error union sharing (eliminate JSON-boundary type-erasure)

- **Goal:** Server-thrown reason and client-parsed reason share types via Zod-derived union.
- **Non-goals:** No client-side schema generation tooling; no SDK gen.
- **Requirements:** FR3, FR4, FR8 (links to D8).
- **Proposed solution:** Server emits via typed `errorResponse` helper that produces `UploadResponseSchema`-compliant bodies. Client uses `safeParse(UploadResponseSchema, body)`; consumes typed `result.data.error.code`. Remove `e.message` substring parsing.
- **Owner / DRI:** Nick (server) + whoever owns `image-upload/upload-file.ts` (client).
- **Next actions:** Implement helper; replace inline `json(res, ...)` calls; replace client substring parser.
- **Risks + mitigations:** Network errors / non-JSON responses are out of `UploadResponseSchema`'s scope; client treats them as a separate failure class. Documented in §9 shadow paths.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Schema drift between server and client | Both import from `core/src/schemas/upload.ts`; package-internal sharing | `bun run check` passes |
| Module-load smoke test must run before any request can hit | Place at module top-level OR in a co-located unit test that imports the schema | `bun test packages/core/src/schemas/upload.test.ts` |
| Standard Schema export shape | One annotation + type test (e.g., negative type test asserting the schema satisfies `StandardSchemaV1<UploadResponse>`) | Co-located test |
| Single PR vs split PRs | Single PR — IS1-IS5 are tightly coupled (FR1 enables FR4; FR4 requires FR3; FR3 wires through FR2) | Author's call |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Zod v4 footgun 7 (lazy DU member validation) breaks `UploadResponseSchema` silently | Low | High (silent runtime breakage) | Module-load smoke test (FR9); review checklist — "members are `z.object`" only | Implementer |
| `e.message` substring parsing removal misses a call site (forgotten consumer) | Low | Medium (one stale consumer would silently fail) | grep all `e.message` in image-upload after removal; type-check should also catch since the new typed-error path returns shape, not message | Implementer + reviewer |
| `AssetViewerRegistry.register` ordering policy turns out wrong (Phase 2 wants explicit priority) | Medium | Low (additive — explicit-priority can ship as opt-in `priority?: number` field later) | Future-spec scope when Phase 2 viewer arrives | Phase 2 author |
| Standard Schema annotation confuses future Zod major (v5+) | Low | Low (one annotation, mechanically removable) | Pin Zod minor; track v5 release notes | Repo maintainers |
| PR #354 typed-IPC migration stalls, S6 inconsistencies persist | Medium | Low (this spec doesn't worsen S6) | Reopen NG5 if PR #354 deprioritizes; not this spec's concern | Nick / IPC migration owner |
| `JsxComponentMeta` in-flight PRs (#380/#374/#372) merge-conflict with this hardening's branch | Low | Low (no overlapping files unless implementer claims `core/src/registry/types.ts`) | Sequence: implement after #380/#374/#372 land | Implementer |

## 15) Future Work

### Identified

- **OS1 — Open `UploadErrorCode` for wire (open enum / `(string & {})`).** *Trigger:* MCP `upload_asset` tool ships, OR public SDK is generated. *What we know:* Closed-by-policy now via D8. Adding a code today is a 1-edit change. *Investigation needed:* Whether to use `(string & {})` (autocomplete-preserving) or full open enum, depends on consumer ergonomics at the trigger time.
- **OS2 — Adopt RFC 9457 Problem Details on `POST /api/upload` (and other public-facing routes).** *Trigger:* External SDK or multi-language consumer. *What we know:* Today's envelope is wire-compatible-with-Problem-Details by including `code` and `instance` fields; migration would add `type`, `title`, `status` URI/string and switch content-type to `application/problem+json`. *Investigation needed:* Whether to migrate all routes or just public ones; impact on existing client.
- **OS3 — Idempotency-Key header support on `POST /api/upload`.** *Trigger:* 100MB+ video uploads become routine and network-blip retry costs measurable bandwidth. *What we know:* Stripe `Idempotency-Key` header pattern is the de-facto standard; same-dir sha256 dedup acts as content-level idempotency for typical uploads. *Investigation needed:* Storage requirements for replay cache; retention window.
- **OS4 — `PropDef` as Zod schema (SSOT) + Standard Schema acceptance.** *Trigger:* Third-party descriptor registration (e.g., user-installed component plugins) OR descriptors get serialized over MCP. *What we know:* Today's `PropDef` is a hand-rolled discriminated union; would migrate to `z.discriminatedUnion('type', [...])`. PR #380 / #374 / #372 are mid-flight on `JsxComponentMeta` — coordination required. *Investigation needed:* Bundle-weight impact; whether `PropDef` ergonomics in PropPanel suffer from runtime parsing overhead.
- **OS5 — `S6` IPC reason-union normalization.** *Trigger:* PR #354 typed-IPC migration completes (or stalls and we need a near-term cleanup). *What we know:* PR #354 is seeded; targets `@electron-toolkit/typed-ipc` or `@egoist/tipc`. *Investigation needed:* PR #354's chosen library determines what shape this hardening would converge on.

### Noted

- **Lint rule integration:** `@typescript-eslint/switch-exhaustiveness-check` is opt-in; biome doesn't ship the equivalent. If biome adds it (or repo migrates to dual-linter), enable for defense-in-depth on `assertNever*` patterns.
- **Negative type tests (`@ts-expect-error` files) for canonical schemas.** Defense-in-depth nicety. Mirrors `branded-ids.md` testing pattern.
- **`handleUploadImage` → `handleUploadAsset` rename.** Cosmetic; cycle-47 bot discarded as not load-bearing. Possibly bundled into IS1's PR by the implementer (D11 DELEGATED).
- **Helper extraction:** If `errorResponse(res, status, code, message?, instance?)` helper proves out, it could promote to a shared `core/src/http/error-response.ts` for use by other routes. Defer until A7/A8/B2 land and reuse the helper.

## 16) Agent constraints

*Derived in Step 8 from finalized In Scope items. Placeholder until verification pass.*

- **SCOPE:** *TBD*
- **EXCLUDE:** *TBD*
- **STOP_IF:** *TBD*
- **ASK_FIRST:** *TBD*
