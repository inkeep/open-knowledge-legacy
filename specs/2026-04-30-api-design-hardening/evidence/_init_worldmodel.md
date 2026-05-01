---
date: 2026-04-30
sources: code (audited surfaces + cross-package importers + pattern audit), specs (2026-04-16 editor-asset-and-embed-surface, 2026-04-23 cb-v2-md-foundation, 2026-04-28 cb-v2-prop-file-upload, 2026-04-08 typed-component-nodes), structured knowledge (PRECEDENTS.md, AGENTS.md / CLAUDE.md, ARCHITECTURE.md), open PRs (#380 cb-v2-descriptor-placeholder, #379 slash previews, #377 mcp-shim, #374 mermaid, #372 math), STORIES.md Bucket 1, web (RFC 9457, Zod v4 discriminated-union)
depth: full
topic: API design hardening — TypeScript contract surfaces from PR #270 (Editor asset + embed surface, streaming uploads) — bounded by next-round capability work
baseline: 5827e8c5
---

# Worldmodel — API Design Hardening (post-PR #270)

## 0. Topic framing

The user already ran a `/typescript-api-design` audit on PR #270's contract surfaces. This worldmodel does **not** re-run that audit — it grounds the *scope* by mapping the surfaces' connections, the precedents that constrain how they can change, and the concretely-planned next-round work that will touch them. Cut anchor: **next-round capability work that will inherit / propagate / re-derive these patterns**, not speculative future-proofing.

## 1. Audited contract surfaces (re-mapped, not re-audited)

| # | Surface | Path | Kind | Cross-pkg consumers (verified) |
|---|---|---|---|---|
| S1 | `POST /api/upload` handler + `{ ok, error }` envelope | `packages/server/src/api-extension.ts:4686` (`handleUploadImage`; route is `/api/upload` post-FR-8 — function name is legacy) | HTTP route | client at `packages/app/src/editor/image-upload/index.ts:319-320` (parses `e.message` as `UploadWriteReason`); future cb-v2 needs `/api/upload-video` + `/api/upload-audio` (cb-v2-prop-file-upload §6 FR-4 / SPEC §115) |
| S2 | `UploadWriteError` typed class + `UploadWriteReason` union (5 variants) | `packages/server/src/upload-errors.ts` | Typed error class | server-only; client only sees the *string* `error` field via JSON envelope. Class precedent siblings: `BridgeMergeContentLossError`, `HtmlPayloadTooLargeError`, `ChunkedInsertError`, `SyncTimeoutError`, `PreSyncDisconnectError`, `DocumentNotFoundError`, `BridgeSetupError`, `ServerCapabilityMismatchError`, `AdminFailureError`, `SuggestLinksTargetNotFoundError`, `ClientPersistenceClearTimeoutError` — repo-wide pattern is `class FooError extends Error { name = 'FooError'; }` with optional discriminator field |
| S3 | `ClassifiedLinkTarget` discriminated union (4 variants: `doc` / `external` / `anchor` / `asset`) | `packages/core/src/utils/link-targets.ts` | Domain DU | **publishes:** `core/src/index.ts:315-322`. **consumes:** `app/src/editor/internal-link-helpers.ts`, `app/src/editor/plugins/asset-context-menu.ts:88,107`, `app/src/editor/extensions/InternalLinkPropPanel.tsx:283`, `app/src/editor/extensions/link-resolution.ts:61`, `app/src/editor/extensions/internal-link.ts:141`, **also `server/src/backlink-index.ts:431,496`** (server-side classifier consumer — bidirectional usage) |
| S4 | `DiskEvent` discriminated union + `assertNeverDiskEvent` (exhaustiveness guard, exemplary pattern) | `packages/server/src/file-watcher.ts:46-83` | Domain DU + guard | `server/src/standalone.ts:36,932`, `server/src/index.ts:88` (re-export). 6 variants total: 4 markdown (`create` / `update` / `delete` / `rename` / `conflict`) + 2 asset (`asset-create` / `asset-delete`) |
| S5 | `AssetViewerRegistry` + `AssetViewer` + `AssetClickContext` + `AssetViewerLookupResult` | `packages/app/src/editor/asset-dispatch/{types,registry,dispatcher,index}.ts` | Plugin registry + DU | `dispatchAssetClick` consumed by `internal-link.ts:156`, `wiki-link-embed.ts:227`, `InternalLinkPropPanel.tsx:332`. Registry currently empty at landing (D-A11) — all viewer registration happens in *next-round* PRs (typed-component-nodes Phase 2) |
| S6 | `IpcChannelMap` typed channels (RequestChannels) — 22 total, 3 new from PR #270 (`ok:shell:open-asset`, `ok:shell:reveal-asset`, `ok:shell:show-asset-menu`) | `packages/desktop/src/shared/ipc-channels.ts` | Typed channel map | desktop-internal (preload + main + renderer). Comment at line 13 declares **scale-match trigger FU-3 at >20 channels**: "Currently 22 — past the trigger; migrate before adding more" → `@electron-toolkit/typed-ipc` or `@egoist/tipc`. **Already-on-deck migration tracked in PR #354 (Nick: `worktree-typed-ipc-migration`)** |
| S7 | `PropDef` discriminated union + `PropDefBase` + `omitOnDefault` flag | `packages/core/src/registry/types.ts` | Domain DU | 5 variants (`string` / `boolean` / `number` / `enum` / `reactnode`). Closes exhaustive switches "with `assertNever` per type-safety idioms" (line 216 self-comment) — **but no actual `assertNever` helper for `PropDef` exists in the codebase**. Cross-pkg: `core/src/index.ts:203-210` re-exports the union + every variant; `app` consumes via `from '@inkeep/open-knowledge-core'` (~69 imports across packages/app) |
| S8 | `WikiEmbed*` compat descriptors (Image / Video / Audio) | `packages/core/src/registry/built-ins.ts:783-853` | Concrete compat descriptors | Built on `CompatMeta { surface: 'compat' }` discriminator branch; 3 instances; all share a single `serializeWikiEmbed()` factory (line 575-595). Recently shipped via [US-001..US-010] (commits `5cf2603b`...`66aa190a`, 2026-04-30 same-day) |

## 2. Concretely-planned next-round capability work (the cut anchor)

Sources: open PRs, recent commits (last 50), specs/ directory most recent N, STORIES.md Bucket 1. Listed in order of how-soon-they'll-touch:

### Tier A — open PRs already in flight (this week, this worktree's lifetime)

| Item | Evidence | Surfaces it touches |
|---|---|---|
| **A1. cb-v2 descriptor placeholder (Notion-style empty-state)** | PR #380 (Nick, opened 2026-04-30 08:32). Adds `placeholder?: { label?: string; icon?: string }` to `JsxComponentMeta`. Comment in PR body explicitly names "Mermaid" as the next consumer. Adds new optional field to `JsxComponentMetaBase`. | **S7 (PropDef)** indirectly — extends `JsxComponentMetaBase` not `PropDef` itself, BUT the same union surface; **also** introduces `data-descriptor-placeholder` attr UX seam |
| **A2. Mermaid canonical descriptor (chained on math PR #372)** | PR #374 (Abraham, 2026-04-29 21:32). Re-introduces Mermaid (NG21). Lazy-imports `mermaid-js` v11 (~150 KB gz). `MermaidFence` compat (`rendersAs: 'Mermaid'`). Adds canonical 7th descriptor + 6th compat. Shows the *exact* compat-descriptor expansion path that hardening must not block. | **S7 (PropDef)** — registers new descriptor with PropDefs `chart`, `id`, `theme`. **S8** pattern repeats — compat→canonical projection |
| **A3. Math (KaTeX) canonical descriptor** | PR #372 (Abraham, 2026-04-29 21:03). $$/```math/<Math>/<InlineMath> + KaTeX. NG22. Same descriptor-expansion shape as Mermaid. | Same as A2 — **S7** |
| **A4. Slash previews** | PR #379 (Sarah, 2026-04-30 05:49). No PR body. Surface unclear from title alone — likely a renderer-side enhancement. | Likely touches descriptor metadata via slash-menu rendering; **S7** category |
| **A5. MCP shim refactor** | PR #377 (Mike, 2026-04-30 01:06). MCP runtime moves into `packages/server`; `ok mcp` becomes stdio→HTTP proxy. Removes process-wide `AGENT_LABEL`; sessions get per-connection identity from `clientInfo.name`. | **S1 (HTTP)** indirectly — MCP-tool surface routes through the same Streamable HTTP endpoint pattern. Surfaces a *future* MCP `upload_asset` (NG7 in 2026-04-16-editor-asset-and-embed-surface §3) — explicitly out-of-scope today, but the shim refactor lowers the cost |
| **A6. CRDT cache epoch recovery** | PR #376 (Mike, 2026-04-30 00:40). IDB scoping, tripwire, mismatch telemetry. | Orthogonal — doesn't touch S1-S8 directly |
| **A7. Rename consolidation + folder MCP tool** | PR #375 (Miles, 2026-04-29 21:36). Touches `managed-rename` + adds new MCP tool. | **S1 (HTTP/MCP error envelope)** — adds new write-path that should adopt whatever envelope this hardening picks |
| **A8. Search via `@orama/orama`** | PR #371 (Dimitri, 2026-04-29 20:25). Implements `/api/search`. | **S1 (HTTP envelope)** — net-new HTTP route that will inherit/establish whatever envelope shape the hardening picks |
| **A9. Typed-IPC migration seed (FU-3 trigger fired)** | PR #354 (Nick, 2026-04-28). Title: `docs(stories): typed-ipc-migration seed`. Direct response to the comment in `ipc-channels.ts:13` ("Currently 22 — past the trigger; migrate before adding more"). | **S6** — wholesale replacement target |

### Tier B — concretely-named in shipped specs as the next surface to ship

| Item | Evidence | Surfaces |
|---|---|---|
| **B1. typed-component-nodes Phase 2: Video / Audio / PDFViewer viewers** | `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md §3 NG2` ("D-F chose read-time promotion"); `specs/2026-04-23-cb-v2-md-foundation/SPEC.md §15 Future Work — Explored — Unified media rendering (NG24)" — explicitly: "amend PR #270's `wikiLinkEmbed` NodeView to import from our componentMap and dispatch extension → render our Image/Video/Audio components"; `asset-dispatch/types.ts:64` — "Registered by future PRs (PDF.js, image lightbox, video/audio inline per D-F typed-component-nodes Phase 2) via `assetViewerRegistry.register(viewer)`" | **S5** — this is the FIRST consumer that registers against `AssetViewerRegistry`. Whatever ordering / unregister / overlap policy this hardening establishes lands as ground truth here |
| **B2. cb-v2 prop file-upload (`PropDefString.accept` + `autoFocus`)** | `specs/2026-04-28-cb-v2-prop-file-upload/SPEC.md` §6 FR-1: "PropDefString gains two new optional fields: `accept?: readonly string[]` ... and `autoFocus?: boolean`". §6 FR-4: routes via MIME-prefix to `/api/upload-image`, `/api/upload-video`, `/api/upload-audio`. **Already partially landed:** `PropDefString.accept` and `PropDefString.autoFocus` are present in `core/src/registry/types.ts:71,78`. Server endpoints not yet split. | **S7** (already extended `PropDefString`); **S1** (will fork into 3 endpoints OR keep one and discriminate by MIME) |
| **B3. Mermaid descriptor's placeholder declaration** | PR #380 body, "Future considerations": "When the canonical Mermaid descriptor lands, declare `placeholder: { label: 'Add a diagram', icon: 'Workflow' }`. Will get the empty-state UX automatically." | **S7** — directly couples PR #380 (placeholder field) and PR #374 (Mermaid). Both open this week. |
| **B4. cb-v2 compound tier — Tabs / Accordions-group / Steps** | `specs/2026-04-23-cb-v2-md-foundation/SPEC.md §15 Future Work` — Explored tier (NG19). Triggers: "dev-docs customer onboarding surfaces Tabs demand; help-center audience surfaces FAQ-accordion demand." | **S7** — adds compound machinery; new descriptor variants |

### Tier C — named in long-horizon specs / STORIES.md

| Item | Evidence | Surfaces |
|---|---|---|
| **C1. MCP `upload_asset` tool for agents** | NG7 in 2026-04-16 §3: "Agents write markdown refs; binary upload is a follow-on with its own security considerations." MCP shim refactor (A5) lowers the cost. | **S1, S2** — shape of the error envelope here is what the MCP tool would surface to agents (precedent #5 contract-first MCP) |
| **C2. STORIES.md Bucket 1 U1.6** "drag-and-drop files and images" — already shipped via PR #270; Bucket 1 U1.4 "toggle a single component block between visual preview and code view" is upcoming editor surface | STORIES.md lines 33-44 | **S5, S7** indirectly |
| **C3. `ok migrate --from-obsidian-vault` CLI** | 2026-04-16 §15 — explicit successor to deleted FR-4 + FR-5. | Outside hardening scope (CLI, not contracts) |

## 3. Precedents that constrain this hardening

From `PRECEDENTS.md` (37 entries; #29 retracted slot preserved). Listed in order of how-tightly-they-bind this hardening:

| # | Precedent | How it constrains hardening |
|---|---|---|
| **#9** | **Schema is add-only forever** (PM schema; CRDT-permanent destructive-delete on narrow). | The PM schema rule itself doesn't apply to TS unions — but the **principle** does: any narrowing of a union currently consumed across packages forces multi-site rewrites. PR #310 explicitly invokes this on `PropDef` ("Precedent #9 keeps this add-only — extending with new members is free; narrowing is permanent lock-in" — `types.ts:158-159`, applied to `category` enum). |
| **#5** | **Contract-first MCP tools.** "We define the MCP protocol; clients conform." | Any error-envelope decision here that touches MCP-exposed handlers (current and future `upload_asset`) lands as the contract MCP clients code against. |
| **#14** | **Cross-CRDT sync is single-writer, server-side.** | Doesn't directly bind. Listed because user mentioned the deleted-client-side-write-path pattern as an example of what hardening should *protect against*. |
| **#18** | **Hybrid Activity + Suspense.** | Doesn't bind directly. Listed as a sibling pattern: shows how the codebase enforces invariants via watchers (`assertBridgeInvariant`) — analogous mechanism for unions would be a meta-test. |
| **#20** | **E2E test infra conventions.** | Provides the meta-test precedent (`e2e-stop-rules.test.ts` is mechanical, no allowlist) for any compile-error / assertion-coverage gate the hardening introduces. |
| **#24** | **Per-session actor identity at the CRDT origin layer** + **(a) `extractAgentIdentity` is the canonical server-side identity boundary.** | `handleUploadImage` already calls `extractAgentIdentity` at line 4728 (post-PR #270). Any new HTTP write surface (A7, A8, B2) MUST adopt the same pattern — meta-test at `attribution-sweep-coverage.test.ts` enforces. **Hardening must not invent an envelope that breaks identity-extraction.** |
| **#25** | **Classified writer IDs + subject-prefix action encoding.** Five-category writer taxonomy: `agent-<connId>` / `principal-<UUID>` / `file-system` / `git-upstream` / `openknowledge-service`. | Asset-write disk events surface as `file-system` writer (asset-create / asset-delete), agent-uploaded assets surface as `agent-<connId>` via the Y.Doc transact path. Discriminated-union expansion in S4 (`DiskEvent`) must preserve this taxonomy. |
| **#27(h)** | **Chip orchestration — 3-plugin wire-up for plain-DOM mark chips.** Asset chip extensions register via `getInteractionLayer(editor)` WeakMap. | S5's `AssetViewerRegistry` is a **separate** registry from the InteractionLayer. Hardening should not collapse them — they target different lifetimes (singleton-per-editor vs module-level). |
| **#37** | **Asset-click dispatch is a single shared surface.** All chip / NodeView / context-menu click routes go through `dispatchAssetClick`. **NEVER add `handleClickOn` / `handleDOMEvents` for asset interception.** | S5 hardening must not split the dispatcher into per-surface routes. Drop-time chips MUST register with `getInteractionLayer(editor)` — bare `<a target="_blank">` silently fails in Electron because main-process safety-net intercepts. |
| **CLAUDE.md STOP rule** | "Server-side asset admission via `createAssetServeMiddleware`." | Sibling to S1 — same factory-shared-across-host pattern; not the hardening target but informs whether hardening should extract an `createUploadHandler` factory to share with the future Vite dev path. |
| **CLAUDE.md STOP rule** | "`ConfigSchema` leaves: `.register(fieldRegistry, ...)` BEFORE `.default()` / `.optional()` / `.nullable()`." | Zod v4 wrapper-drop gotcha. Hardening that introduces Zod-validated request bodies on S1 must respect this ordering. Use the `@inkeep/open-knowledge-core` singleton. |

## 4. Cross-package connection graph

```
core/                                            server/                              app/                                desktop/
─────                                            ───────                              ────                                ────────
PUBLISHES:                                       PUBLISHES:                            PUBLISHES:                          PUBLISHES:
  ClassifiedLinkTarget (S3)         ───────►       UploadWriteError (S2)              AssetViewerRegistry (S5)            IpcChannelMap (S6)
  classifyMarkdownHref()                     ┐     UploadWriteReason                  AssetViewer                         (no cross-pkg consumers
  resolveAssetProjectPath()                  │     DiskEvent (S4)         ┐           AssetClickContext                    by design — desktop is
  PropDef (S7) + variants                    │     assertNeverDiskEvent              dispatchAssetClick                    sealed)
  JsxComponentMeta {Canonical|Compat}        │     POST /api/upload (S1)              consumes: ClassifiedLinkTarget
  WikiEmbed* compat descriptors (S8)         │     consumes:                                    PropDef, all variants
  ServerInfoResponseSchema (zod)             │       extractAgentIdentity              consumes (cross-pkg):
  PrincipalResponseSchema (zod)              │       (precedent #24)                    UploadWriteReason as STRING (parsed
  CC1 schemas (10 zod-discriminated          │       classifyMarkdownHref               from JSON `error` field — no
   union frames)                             │       (S3 — bidirectional!)             type-link with the typed class)
  upload constants (DEFAULT_*, *_RE)         │     consumes: DiskEvent (own)           
                                             └────► consumes:                           imports from desktop preload:
                                                      classifyMarkdownHref               window.okDesktop.shell.openAsset
                                                      (in backlink-index.ts —             (typed via IpcChannelMap)
                                                       server-side classifier)
```

**Key observations:**

- **S3 (`ClassifiedLinkTarget`) is consumed bidirectionally** — both `app` (renderer click + paste flows) AND `server` (`backlink-index.ts:431,496`). Narrowing or renaming a variant breaks both. Code-side audit: `classifyMarkdownHref` is called in 9 distinct sites across 6 files spanning core/app/server.
- **S1's error envelope crosses a serialization boundary** — `UploadWriteError` is server-internal-only; the *string* `e.message` ends up in JSON `{ ok: false, error: 'malformed-upload' }` and the client (`image-upload/index.ts:319`) parses that string back to a `UploadWriteReason`-shaped value. **There is no compile-time link** between server-thrown `UploadWriteError.reason` and client-parsed `e.message` content. A renamed reason variant breaks at runtime.
- **S6 (`IpcChannelMap`) is desktop-internal but the comment at line 13 explicitly notes "scale-match trigger at >20 channels"** — currently 22, migration to typed-ipc is already seeded as PR #354.
- **S5's registry is currently empty** — no production registrations. **First consumer is B1 (Phase 2 Video/Audio/PDFViewer)**. The empty-at-landing posture (D-A11) means there is **no friction cost to changing the registry's API right now**, and no friction cost to adding meta-tests that fail when a register call lacks (e.g.) `displayName`, `priority`, or `unregister` — because there are zero callers to break.
- **Repo-wide error envelope convention is `{ ok: true, data... } | { ok: false, error: string }`** — confirmed across api-extension.ts (~30+ sites just in handleAgentWriteMd / handleAgentPatch / handleAgentUndo). HTTP status codes layer on top (400 / 405 / 413 / 500 / 503 / 507).

## 5. Pattern audit — discriminated unions + assertNever + Zod + error classes

### 5.1 `assertNever*` exhaustiveness guards — sparse adoption

| Helper | Defined | Used | Coverage |
|---|---|---|---|
| `assertNeverDiskEvent` | `server/file-watcher.ts:82` | `server/standalone.ts:932` (1 site) | **EXEMPLARY** — guard exists, exported, dispatch site uses it. JSDoc at line 75-81 documents the pattern. |
| For `ClassifiedLinkTarget` (4-variant union) | (no helper) | (consumers use `switch (kind)` without guard — see `internal-link.ts:141`-..., `link-resolution.ts`, etc.) | **GAP** — 9+ dispatch sites; none gated by exhaustiveness assertion |
| For `UploadWriteReason` (5-variant union) | (no helper) | (`api-extension.ts:4699-4712` uses if/else cascade with non-exhaustive fallback to `'storage-error'`) | **GAP** — adding a new variant doesn't surface as a TS error at the cascade site |
| For `PropDef` (5-variant union) | (no helper) | `types.ts:216` self-comment: "Closes exhaustive switches with `assertNever`" — but **no `assertNever` for `PropDef`** is defined. PropPanel `switch on PropDef.type` (cb-v2-prop-file-upload §8 line 66 confirms). | **GAP per its own JSDoc claim** |
| For `JsxComponentMeta` (canonical / compat surface DU) | (no helper) | `types.ts:218` self-comment notes "runtime dispatch on `surface` discriminator" | **GAP** |
| For IPC reason unions (S6 result-discriminated unions: `'extension-blocked' / 'path-escape' / 'not-found' / 'resolve-error'` etc.) | (no helper) | (consumed in `dispatcher.ts:81` via `console.warn` — no exhaustiveness check) | **GAP** |

### 5.2 Zod adoption — patchwork, mostly schemas-as-SSOT in `cli/mcp/tools/*`

- **Heavy:** `cli/mcp/tools/*.ts` (~21 files importing `z`) — every MCP tool defines a Zod schema inline. Pattern is `inputSchema: z.object({...})` per MCP SDK contract.
- **Moderate:** `core/src/schemas/*` — `api.ts` (2 schemas: `ServerInfoResponseSchema`, `PrincipalResponseSchema`) + `cc1.ts` (10 schemas in a `discriminatedUnion('ch', [...])`). Both files use `.loose()` for forward-compat.
- **Light:** `core/config/{schema,errors,field-registry}.ts` (config validation). `server/auth-token-schema.ts` (auth). `app/editor/branch-invalidation.ts`. `cli/content/enrichment.ts`, `cli/utils/frontmatter.ts`.
- **NONE:** S1's HTTP request body parsing for `/api/upload` (multipart, not JSON). S1's response shape is **un-Zod'd** — manual `json(res, 400, { ok: false, error: '...' })` calls.
- **`z.discriminatedUnion`** appears in `core/src/schemas/cc1.ts` discriminating on `ch` field. This is the existing precedent for runtime-validated server-defined discriminated unions in this repo.
- **STOP rule from CLAUDE.md:** "`ConfigSchema` leaves: `.register(fieldRegistry, ...)` BEFORE `.default()`/`.optional()`/`.nullable()`. Zod v4 wrappers drop `_zod.parent` — metadata binds to the wrapper, not the leaf." If hardening introduces Zod-bound registry metadata, this ordering matters.

### 5.3 Typed-error classes — uniform pattern, ~12 instances

| Class | Discriminator field | Pattern |
|---|---|---|
| `UploadWriteError` | `reason: UploadWriteReason` (5-variant) | `name = 'UploadWriteError'`, ES2022 `cause` |
| `BridgeMergeContentLossError` | `info: { side, ... }` (structured) | Same shape |
| `HocuspocusAuthRejection` | `reason: HocuspocusAuthRejectionReason` (literal-union) | Same; **client side has explicit `KNOWN as const satisfies readonly HocuspocusAuthRejectionReason[]` exhaustiveness assertion at `provider-pool.ts:1007-1008`** |
| `SuggestLinksTargetNotFoundError` | (no field beyond message) | Same |
| `HtmlPayloadTooLargeError`, `ChunkedInsertError`, `SyncTimeoutError`, `PreSyncDisconnectError`, `DocumentNotFoundError`, `BridgeSetupError`, `ServerCapabilityMismatchError`, `AdminFailureError`, `ClientPersistenceClearTimeoutError` | (no field) | Bare named errors |

**Convention (de facto):** Errors carrying a categorical discriminator name the field `reason` (3 of 12). Errors carrying structured info name it `info`. The `reason` field is always a TS literal union exported alongside the class. **No precedent class uses Zod for the discriminator** — they're hand-rolled string unions.

### 5.4 Result-typed return shapes (alternative to throw)

- `IpcChannelMap` → 7+ channels return `{ ok: true } | { ok: false; reason: '...' }` (e.g., `ok:shell:open-asset`, `ok:shell:reveal-asset`, `ok:mcp-wiring:confirm`, `ok:seed:plan`).
- `SpawnOutcome` (line 44) — explicit `{ ok: true } | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }`.
- `AssetViewerLookupResult` — `{ found: true; viewer } | { found: false }`. Note: `found` not `ok` — field-name divergence visible.

**Pattern divergence:** `ok` (IPC + HTTP) vs `found` (registry lookup). No repo-wide convention picks one.

## 6. 3P landscape

| 3P | Repo adoption | Relevance |
|---|---|---|
| **Zod v4** | Adopted heavily in CLI/MCP, lightly in core/server/app. `z.discriminatedUnion` in `cc1.ts`. CLAUDE.md ordering STOP rule for `register` + `default`/`optional`/`nullable`. | If hardening picks Zod for HTTP envelope SSOT, this is the existing tool. v4 has a known [discriminator-no-longer-generic regression](https://github.com/colinhacks/zod/issues/5024) that may bite. |
| **Standard Schema** | **Zero adoption** — verified via grep. No `~standard` properties, no Standard Schema imports. | If multi-validator portability becomes a goal, it's a green-field add — no migration friction. Likely premature for internal-only contracts. |
| **RFC 9457 Problem Details** | **Zero adoption** — verified via grep on api-extension.ts (no `application/problem+json`, no `type` / `title` / `detail` fields). Repo uses `{ ok, error }` shape. | User's `_user_outcomes.md` explicitly defers RFC 9457: "RFC 9457 Problem Details + Idempotency-Key support stay deferred." |
| **`@electron-toolkit/typed-ipc` / `@egoist/tipc`** | **Not yet adopted** — but PR #354 is the migration seed, and S6's own JSDoc names them as the migration target. | Hardening shouldn't entrench S6's hand-rolled DU; it should align with the FU-3 migration shape so the rewrite isn't fighting the hardening. |

## 7. Personas / consumers

From `_user_outcomes.md` + code-verified:

| Persona | Surfaces touched | Concerns |
|---|---|---|
| **Internal devs writing next surface** (Nick — bridge / observer / CRDT / MDX; Miles — server / UI / MCP; Mike, Sarah, Dimitri, Abraham, Tim — per recent PRs) | All S1-S8. Esp. A1-A9 PR authors. | "When I write the next HTTP route, I shouldn't have to invent the error shape — there's one canonical pattern I can copy." |
| **LLM agents writing via `/api/agent-write*`** | S1 (existing handlers `handleAgentWriteMd`, `handleAgentWrite`, `handleAgentPatch`, `handleAgentUndo`) | Compare envelope: agent-write returns same shape `{ ok: true, ... } | { ok: false, error: 'string' }`. **Already convergent**, NOT divergent. |
| **Operators triaging Pino structured logs** | Server-side log emission at `[upload] dedup hit` etc. (api-extension.ts:4866) | Wants `agentId`, `agentName`, `dedup`, `mime`, `size`, `destPath`, `httpStatus` fields. Already structured. |
| **Future SDK consumers** | Deferred (per `_user_outcomes.md`: "No public-API trigger named") | Flag, don't deeply persona. |

## 8. Prior research / specs that constrain

| Source | Key constraint |
|---|---|
| `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md` | The spec PR #270 implemented; FR-1..FR-8 + 13 decisions + 14 NGs. NG7 (MCP `upload_asset`), NG13/14 (transport / URL paste) are explicitly future-deferred. |
| `specs/2026-04-23-cb-v2-md-foundation/SPEC.md` | §15 names *exactly* the next descriptor expansions: NG24 unified media rendering, NG19 compound tier, NG16 PropDef.editor override + field registry, NG17 directive syntax, NG21 Mermaid (in-flight via PR #374), NG22 KaTeX (in-flight via PR #372), NG13 user-registered components, NG14 inline-component editing. **D15 LOCKED `category` enum as add-only per precedent #9.** |
| `specs/2026-04-28-cb-v2-prop-file-upload/SPEC.md` | Already partially landed: `PropDefString.accept` + `autoFocus` are in `types.ts:71,78`. Server endpoints not yet split (FR-4: `/api/upload-image` / `/api/upload-video` / `/api/upload-audio` MIME-prefix routing). **D5 LOCKED MIME-prefix routing in helper, NOT in PropDef.** **D8 LOCKED trim Convert button + `convertibleTo` machinery from compat descriptors.** |
| `specs/2026-04-08-typed-component-nodes/SPEC.md` | §3.1 Component Registry — `JsxComponentMeta` shape. Phase 2 named at line 428 (`Typed Node Spec + Prop Panel`); §6 Scope explicitly identifies Mermaid + Audio as "Shadcn (gap fill, 2)". **D15 (built-in component set) names the canonical inventory.** |
| `specs/2026-04-21-agent-write-summaries/SPEC.md` | §6 FR2 + D5/D24 — every `recordContributor` summary routes through `normalizeSummary`. Single API-boundary truncation. **Sibling pattern** for the hardening: hardening should NOT introduce a *second* API-boundary normalization for upload error/response shapes. |
| `~/.claude/reports/inline-media-editor-survey/REPORT.md` | 16-editor cross-survey. Inline image: half support; inline video/audio: zero. Storage-source ambiguity: same `![](url)` produces inline or block depending on render. Markdown source ambiguity is invisible to authors — Obsidian's mode-mismatch is the canonical UX gap. **Ambient context for B1 (Video/Audio renderers) — not a direct constraint on contracts.** |

## 9. Convergent patterns observed

1. **Repo-wide HTTP envelope is `{ ok: true, ... } | { ok: false, error: 'string' }`.** Universal across `api-extension.ts` handlers (verified 30+ sites). HTTP status code layered on top. No RFC 9457 adoption.
2. **Repo-wide IPC envelope (where used) is `{ ok: true } | { ok: false; reason: '<literal-union>' }`.** 7+ channels. Field-name divergence: `ok` (HTTP, IPC) vs `found` (registry).
3. **Typed errors carry their discriminator on a `reason` field** (3 of 12 — others are bare named errors).
4. **Schema-as-SSOT via Zod is convention for MCP tool inputs** but NOT for HTTP routes (yet).
5. **Discriminated unions are rampant** (S3, S4, S5, S7, S8 + DiskEvent + IPC reasons + auth rejection + spawn outcome) but `assertNever` adoption is one site (`assertNeverDiskEvent`).
6. **The "scale trigger" comment pattern is well-established** — `ipc-channels.ts:13` ("Currently 22 — past the trigger; migrate before adding more"). This is a cultural signal: the codebase already accepts that some primitives have a known migration target and trip-wire.

## 10. Divergences flagged

| Divergence | Source A | Source B | Resolution |
|---|---|---|---|
| Result field name: `ok` vs `found` | `IpcChannelMap` channels → `{ ok }` | `AssetViewerLookupResult` → `{ found }` | Both shipped in PR #270. No precedent picks. UNRESOLVED — flag to user as candidate for hardening normalization. |
| `assertNever` claim vs reality on `PropDef` | `types.ts:216` JSDoc says "Closes exhaustive switches with `assertNever` per type-safety idioms" | No `assertNever` helper for `PropDef` exists; PropPanel uses bare `switch` | UNRESOLVED — JSDoc aspirational, not realized. The hardening's defensible cut. |
| `UploadWriteReason` flow type-erased at JSON boundary | Server: typed class with `reason` field | Client: parses `e.message` substring | UNRESOLVED — no compile-time link. Hardening could SSOT this via shared type re-exported from core OR pure stringly continued. |
| MCP shim refactor (PR #377) removes `AGENT_LABEL`, decentralizes identity to per-`clientInfo.name` | New convention in flight | `extractAgentIdentity` precedent #24 still binds | Likely complementary, not contradictory; flag as adjacent. |

## 11. Unresolved gaps where domain knowledge is needed

1. **Should the hardening's response/error envelope work for both HTTP routes (S1) AND MCP tools (precedent #5)?** MCP tools today return `{ content, isError? }` per MCP SDK contract — **different shape** from `{ ok, error }`. If hardening picks one canonical envelope, the answer to "MCP too?" determines whether C1 (`upload_asset` MCP tool) inherits or diverges. User did not name this in `_user_outcomes.md`.
2. **Does typed-IPC migration (PR #354 / S6) sequence before or after this hardening?** If before, hardening should pin to the new migration's typed-channel shape. If after, hardening's IPC reason-union normalization sets the migration target. Migration is "seeded" not "in flight."
3. **Are the 3 cb-v2 placeholder/Mermaid/Math PRs blockers or co-in-flight?** PR #380 introduces `placeholder?: { label?, icon? }` on `JsxComponentMeta`. If hardening claims `JsxComponentMeta` as a contract surface, it must coordinate or wait. User did not name a coordination plan.
4. **Should `assertNever` for `PropDef` / `ClassifiedLinkTarget` / `UploadWriteReason` be added, OR should the hardening introduce a Zod-discriminated-union SSOT instead** (pattern from `cc1.ts`)? Two distinct hardening shapes; user did not pick.

## 12. Confidence-provenance summary

- **CONFIRMED (multi-channel triangulation):** S1-S8 surface inventory; precedents #9, #5, #24, #25, #37; cross-package import map; typed-error class precedent count; Zod adoption distribution; A1-A9 in-flight PR list; B1-B4 spec-named next work; repo-wide `{ ok, error }` envelope convention.
- **MEDIUM (single-channel code-verified):** `assertNever*` adoption of one site; field-name `ok` vs `found` divergence; `UploadWriteReason` re-stringification at JSON boundary.
- **LOW (heuristic from PR titles only):** A4 (slash previews — no PR body); B4 (compound tier triggers).
- **Web channel MEDIUM:** RFC 9457 adoption claim (zero in repo, increased external 2024 — not a direct constraint); Zod v4 discriminator-no-longer-generic regression (sourced from one issue).

## 13. Channels run

- **Code:** verified imports + cross-package consumer counts via grep across 200+ sites.
- **Specs:** read 4 source specs (2026-04-16, 2026-04-23, 2026-04-28, 2026-04-08), §15 Future Work + §16 Agent constraints + §10 Decision log.
- **Structured knowledge:** PRECEDENTS.md (full 37-entry; ~40K chars), AGENTS.md / CLAUDE.md (full 80K chars), ARCHITECTURE.md (top 300 lines).
- **Open PRs:** 26 listed; PR bodies fetched for #380, #379, #377, #374, #372 (most relevant).
- **Recent commits:** last 50; most recent 30 directly relevant.
- **Reports:** `~/.claude/reports/inline-media-editor-survey/REPORT.md` first 120 lines.
- **STORIES.md:** Bucket 1 (lines 29-69).
- **Web (light):** RFC 9457 + Zod v4 — to confirm zero-adoption claim and surface known regressions.
- **Channels not run / N/A:** OSS repos (no companion to OK's contract layer in `~/.claude/oss-repos/`); catalog skills (none for this repo's contract surfaces).

---

## Sources

- [RFC 9457 — Problem Details for HTTP APIs (datatracker.ietf.org)](https://datatracker.ietf.org/doc/html/rfc9457)
- [Problem Details (RFC 9457): Doing API Errors Well — Swagger blog](https://swagger.io/blog/problem-details-rfc9457-doing-api-errors-well/)
- [error-iq — TypeScript-first RFC 9457 Problem Details (GitHub: JacobPC/error-iq)](https://github.com/JacobPC/error-iq)
- [Zod v4 Discriminated Union Discriminator — issue #5024 (colinhacks/zod)](https://github.com/colinhacks/zod/issues/5024)
- [Defining schemas — zod.dev/api](https://zod.dev/api)
