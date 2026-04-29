# MCP Shim — Cleanup and Layering Refactor

**Status:** Draft (initial structuring from `todo.txt`)
**Owner:** mike.r
**Date:** 2026-04-29
**Source:** `specs/2026-04-29-mcp-shim/todo.txt`

---

## 1. Problem Statement

The repo currently carries two coexisting MCP server implementations:

1. The **legacy stdio MCP server** (`packages/cli/src/mcp/server.ts` + the autostart machinery in `server-discovery.ts`), in which each editor spawned its own `ok mcp` child as a full MCP server.
2. The **new HTTP MCP** (`packages/server/src/mcp-http.ts`), where `ok start` owns one shared Streamable HTTP MCP endpoint and `ok mcp` is a thin stdio→HTTP transport bridge (`packages/cli/src/mcp/shim.ts`).

The HTTP path is what greenfield installs use, but legacy code, fixtures, and supporting machinery (G6 protocol gate, `--pin`, historical-shape detection in desktop wiring, `AGENT_LABEL` env, parent-death watch) still exist and continue to shape APIs and tests. Worse, `mcp-http.ts` reaches across packages into `cli/` for `registerAllTools`, `Config`, and `AgentIdentity` — which forced a relative-path workaround in `cli/src/mcp/tools/preview-url.ts` to dodge a `cli → server → cli` cycle. The resulting layering smell signals that the MCP runtime ended up in the wrong package.

The user's intent is greenfield — no published-install back-compat is required — so this is a chance to delete legacy code, fix the layering, and lock in the "HTTP MCP is the only impl, shim is a thin proxy" model.

---

## 2. Goals

- **G1.** `packages/server` owns the MCP runtime end-to-end: tool registry, instructions, agent identity, config, and the Streamable HTTP endpoint.
- **G2.** `ok mcp` is a deliberate thin byte/JSON-RPC proxy. No tool registration, no schema validation, no MCP server/client instantiation in the shim path beyond the SDK transport pair.
- **G3.** Delete the legacy stdio MCP server and its supporting machinery (autostart classifier, protocol mismatch remedy, protocol gate, historical-shape detection, `--pin`).
- **G4.** No cross-package imports between `packages/server` and `packages/cli` other than the natural direction (`cli → server`).
- **G5.** Session config in `mcp-http.ts` reflects the project's real loaded `Config`, not a fabricated default.
- **G6.** Documentation, specs, and tests describe a single transport model.

---

## 3. Non-Goals

- **NG1.** Backwards compatibility with previously published `@inkeep/open-knowledge` installs that wired editors to the stdio MCP child. Greenfield only.
- **NG2.** Switching the transport off of localhost HTTP (e.g., to Unix sockets / named pipes). Recorded as Future Work.
- **NG3.** Splitting the shim into its own dist artifact / npm bin for fast cold start. Recorded as Future Work.
- **NG4.** Changing the MCP tool set, tool schemas, or tool semantics. This refactor preserves behavior.
- **NG5.** Reworking `ok init`'s editor configuration migration story beyond the historical-shape classifier removal.

---

## 4. Personas / Consumers

| Consumer | What they use today | What changes |
|---|---|---|
| **Editor users** (Claude Code, Cursor, VS Code, etc.) | Editor config points at `ok mcp` (or `npx @inkeep/open-knowledge mcp`). The shim resolves the `ok start` HTTP MCP and proxies stdio JSON-RPC. | No behavior change; same wiring, smaller surface. |
| **Desktop app** | `mcp-wiring.ts` writes editor configs with `computeForce` deciding when to overwrite an existing entry. | Simplified force logic — only the canonical shape is recognized; "foreign" entries are left alone. |
| **CLI / Electron developer flows** | `--pin`, `cliPath`, `--dev-mcp` for pointing at specific binaries. | `--pin` removed; `cliPath` (Electron-bundled `ok.sh`) and `--dev-mcp` (worktree dist) cover the remaining real cases. |
| **MCP tool authors (us)** | Tool handlers live in `cli/src/mcp/tools/*` and pull in `cli/src/bash/*`, `cli/src/content/*`, `cli/src/config/*`. | Tools live in `server/src/mcp/tools/*` alongside their dependencies; CLI imports config schema/path resolvers back from server. |

---

## 5. Current State (verified)

- **Cross-package import (smell):** `packages/server/src/mcp-http.ts:6-8` imports from `'../../cli/src/config/schema.ts'`, `'../../cli/src/mcp/agent-identity.ts'`, and `'../../cli/src/mcp/tools/index.ts'`.
- **Workaround forced by the smell:** `packages/cli/src/mcp/tools/preview-url.ts:29` imports `'../../../../server/src/ui-lock.ts'` via a relative path to avoid a `cli → @inkeep/open-knowledge-server → cli` cycle.
- **Legacy stdio MCP server:** `packages/cli/src/mcp/server.ts` (~395 LOC) and `server.test.ts` (~402 LOC). Unreferenced outside its own test file.
- **Legacy autostart machinery:** `packages/cli/src/mcp/server-discovery.ts` (~637 LOC) — `ensureServerRunning`, `decideAutoStart`, `createProjectServerUrlResolver`, `classifyMcpLaunchPath`, `describeProtocolMismatchRemedy`, plus the `protocolVersion`/launch-shape remedy plumbing. The new `mcp.ts` only still imports `parseSpawnTimeoutEnv` from this file.
- **Protocol gate:** `protocolVersion` field on `ServerLockMetadata` is consumed only by `server-discovery.ts:209-260`. Once that file goes, the field has no consumer.
- **Desktop classifiers:** `packages/desktop/src/main/mcp-wiring.ts:307` has `computeForce` that delegates to `isHistoricalNpxVariant` (npx -y shape) and `isPriorCliPathShape` (M6b prior CLI path shape). Greenfield ⇒ no editor in the wild has either shape.
- **Fabricated config:** `mcp-http.ts:51-88` builds a `Config` inline with hardcoded GitHub OAuth client id, sync intervals, debounce values, etc. — independent of the project's loaded config.
- **`AGENT_LABEL`:** read once from process env at `createSessionServer` time (`mcp-http.ts:129`). With one shared server across editors, this single env value applies to every session — wrong identity model.
- **Instructions string:** `mcp-http.ts:96-103` is shorter than the legacy `cli/src/mcp/server.ts` version (which had wiki-link conventions, frontmatter rules, anti-patterns).
- **Parent-death watch:** First shim to spawn `ok start` becomes the watched parent (`OK_PARENT_PID`). When that editor closes, the server tears down — killing every other editor's session.
- **Bridge implementation:** `shim.ts:218-239` already does the right thing — `StdioServerTransport` ↔ `StreamableHTTPClientTransport`, forwards opaque JSON-RPC envelopes, no `McpServer`/`McpClient` instantiation. It just isn't documented as a deliberate choice.
- **MCP wiring duplication:** `boot.ts` and `test-harness.ts` both manually compose `createHttpServer(...)` → `/mcp` + `/api/*` + WS upgrade + keepalive. The harness's keepalive grace block is also a near-duplicate of `boot.ts`.

---

## 6. Target State

- `packages/server/src/mcp/` owns the tool registry, agent identity, logger, tool-logging, and tool implementations. Tool handler dependencies (`bash/*`, `content/enrichment.ts`, `content/shadow-log.ts`, the `Config` schema, path resolvers, `MCP_SERVER_NAME`, `OK_DIR`) move alongside.
- `packages/cli` re-imports the `Config` schema and `resolveContentDir`/`resolveLockDir` helpers from `@inkeep/open-knowledge-server`. The `cli → server` import direction is the only direction.
- `packages/cli/src/mcp/` shrinks to: `mcp.ts` (the `ok mcp` command), `shim.ts` (the bridge), and a tiny env helper for `parseSpawnTimeoutEnv`. Everything else in the directory is deleted.
- `mcp-http.ts` accepts a real loaded `Config` from boot context rather than fabricating one.
- The `protocolVersion` field is removed from `ServerLockMetadata` and from `version-constants.ts` if no other consumer remains. `runtimeVersion` remains the build-stamp.
- Desktop `mcp-wiring.ts` collapses to "overwrite when the existing entry matches today's canonical shape; otherwise leave alone." `isHistoricalNpxVariant` and `isPriorCliPathShape` are deleted.
- `--pin` is removed. `cliPath` (Electron) and `--dev-mcp` (worktree dist) cover the remaining "point at a specific binary" cases.
- A doc-block at the top of `shim.ts` declares the byte/JSON-RPC proxy strategy explicitly.

---

## 7. In Scope

Each item lists acceptance criteria the implementer can verify.

### IS-1. Delete legacy stdio MCP server (`B1`)
- Delete `packages/cli/src/mcp/server.ts` and `server.test.ts`.
- Delete the unreferenced surface of `server-discovery.ts`: `ensureServerRunning`, `decideAutoStart`, `createProjectServerUrlResolver`, `classifyMcpLaunchPath`, `describeProtocolMismatchRemedy`, plus their tests in `server-discovery.test.ts`.
- Move `parseSpawnTimeoutEnv` into `shim.ts` (or a small `shim-env.ts`); delete the rest of `server-discovery.ts`.
- **Acceptance:** `rg` finds zero non-test references to any deleted symbol; `pnpm typecheck` and `pnpm test` pass; net deletion is ≥ ~2,000 LOC including tests.

### IS-2. Delete G6 protocol gate AND the `protocolVersion` field (`B2`, tightened from todo #2)
- Remove `protocolVersion` from `ServerLockMetadata` (`packages/server/src/server-lock.ts`), from `acquireServerLock`/`updateServerLockPort` writers, and from any test fixtures (e.g. `liveLock` in `shim.test.ts`).
- Remove `SERVER_PROTOCOL_VERSION` / `PROTOCOL_VERSION` from `version-constants.ts` if nothing else consumes them. Keep `STATE_SCHEMA_VERSION` and `RUNTIME_VERSION`.
- Remove `expectedProtocolVersion` plumbing along with the `decideAutoStart`/`ensureServerRunning` deletes in IS-1.
- **Acceptance:** Lock metadata schema no longer carries `protocolVersion`; greppable for confirmation. The build-stamp distinguishing "server is from this build" is `runtimeVersion` only.

### IS-3. Move MCP runtime into the server package (`A`)
- Move `packages/cli/src/mcp/{agent-identity, logger, tool-logging, tools/}` → `packages/server/src/mcp/`.
- Move `packages/cli/src/bash/*` and `packages/cli/src/content/{enrichment,shadow-log}.ts` → `packages/server/src/`.
- Move the `Config` schema + `resolveContentDir`/`resolveLockDir` helpers + `MCP_SERVER_NAME` + `OK_DIR` to whichever of `server`/`core` the cli boot path can re-import from. (See OQ-1 below for the schema-location decision.)
- Update `cli/src/commands/*` to import config schema + path resolvers from the new home.
- Drop the relative-path workaround at `cli/src/mcp/tools/preview-url.ts:29`; everything resolves via `@inkeep/open-knowledge-server` again.
- `mcp-http.ts` and the new home for tools live in the same package — no cross-package import, no cycle.
- Update `cli/scripts/probe-*.ts` to import from server.
- **Acceptance:** Zero imports of the form `from '../../cli/...'` in `packages/server/src/`; zero imports of the form `from '../../../../server/...'` in `packages/cli/src/`. `pnpm typecheck` / `pnpm test` clean.

### IS-4. Real config plumbing for HTTP MCP sessions (`B6`)
- Thread the project's loaded `Config` through `BootServerOptions` into `createMcpHttpHandler`.
- `mcp-http.ts` consumes that config rather than calling `buildMcpConfig`. Delete `buildMcpConfig` (or shrink it to "fill defaults for fields not present in the loaded config").
- **Acceptance:** Tools that read `config.mcp.tools.read_document.historyDepth` / `config.mcp.tools.search.maxResults` reflect the values in `.open-knowledge/config.yml`; verified via a session test asserting the registered tool sees the configured values.

### IS-5. DRY the MCP wiring helper (`B3`)
- Extract a `mountMcpAndApi(httpServer, hocuspocus, mcpHttpHandler, log)` helper in `server` that mounts `/mcp`, `/api/*`, the WS upgrade handler, and the keepalive grace block. `boot.ts` and `test-harness.ts` both call it.
- **Acceptance:** No `httpServer.on('upgrade', ...)` / `/mcp` mounting code is duplicated across `boot.ts` and `test-harness.ts`. Existing harness/boot tests pass unchanged.

### IS-6. Replace `AGENT_LABEL` with per-session identity (`B4`)
- Per D-10: drop `process.env.AGENT_LABEL` reads entirely. `createSessionServer` derives identity from `clientInfo.name` (mandatory in MCP spec) once `oninitialized` fires; before that, fall back to `connectionId`. `displayName = clientInfo.name`; `colorSeed = clientInfo.name`; tie-break via `connectionId` when display logic needs to distinguish two sessions reporting the same name.
- **Acceptance:** Each MCP session reflects its initiating client. No code path reads `AGENT_LABEL`. Two simultaneous Claude Code sessions land with the same `displayName` but distinct `connectionId`s, and any UI/log surface that lists sessions disambiguates on `connectionId`.

### IS-7. Consolidate the `INSTRUCTIONS` string (`B5`)
- Reconcile the trimmed `mcp-http.ts:96-103` with the longer legacy version from `cli/src/mcp/server.ts` (wiki-link conventions, frontmatter rules, anti-patterns).
- **Acceptance:** Single canonical `buildInstructions(config)` source. Either it carries the long-form content or there is a code comment explicitly stating the trim was intentional and what was dropped.

### IS-8. Drop the parent-death watch (`B7`)
- Per D-11: delete the parent-death watch entirely. Stop reading `OK_PARENT_PID` server-side; the shim no longer sets it on spawn. `idle-shutdown.ts` becomes the sole teardown trigger.
- **Acceptance:** No code path watches `OK_PARENT_PID`. Closing the first editor that spawned the server does not tear down sibling sessions. With no clients connected, `idle-shutdown` exits the server within its configured window.

### IS-9. Remove `--pin` (todo #6)
- Delete the `'pinned'` branch of `buildManagedServerEntry` (`packages/cli/src/commands/editors.ts:110-121`).
- Delete the `--pin` flag, `cliEntryPath` plumbing, and pin-related code paths in `init.ts`.
- Delete or `// superseded by HTTP MCP shim` the cross-install spec's G7 section.
- Delete test fixtures for `mode: 'pinned'`.
- **Acceptance:** `rg --pin` finds no references in `packages/cli`. `cliPath` (Electron) and `--dev-mcp` (worktree dist) still work.

### IS-10. Collapse `computeForce` + historical-shape detection (todo #10)
- Delete `isHistoricalNpxVariant` and `isPriorCliPathShape` in `packages/desktop/src/main/mcp-wiring.ts`.
- Inline the canonical-shape `target.isCompatible(existing, '', { mode: 'published' })` check at the call sites; delete `computeForce` itself.
- Prune Fixture B (historical -y) and Fixture D (prior cliPath) from `mcp-wiring.test.ts`. Keep Fixture A (canonical) and Fixture C (canonical + custom env).
- Prune `init.test.ts` cases that assert behavior under managed-old-shapes.
- Leave `mergeManagedFields` in `editors.ts:285` alone (preserves user keys verbatim, no historical-shape baggage).
- **Acceptance:** Editor configs are overwritten only when they exactly match today's canonical published shape; foreign-customized entries are left untouched. Tests reflect this two-fixture world.

### IS-11. Declare the bridge strategy in `shim.ts` (todo #8)
- Add a doc-block at the top of `shim.ts` stating: byte/JSON-RPC proxy; deliberately no `McpServer`/`McpClient` in the shim; only protocol awareness is reading `result.protocolVersion` off the initialize response so `setProtocolVersion` matches the negotiated value on both sides.
- **Acceptance:** A future reviewer reading `shim.ts` can see the choice committed to in code, not implied.

### IS-12. End-to-end bridge test (`B9`)
- Today: 3 unit tests cover URL resolution; `mcp-http.test.ts` and `shim.test.ts` cover one half each.
- Add an in-process test: start an HTTP MCP server, point a `StdioServerTransport`-fed shim at it via in-memory streams, send `initialize`, assert response on stdout.
- **Acceptance:** A single test file exercises the full stdio → HTTP → server → HTTP → stdio path.

### IS-13. Doc + spec sweep (`B10`)
- Update to the post-refactor model:
  - `specs/2026-04-24-cross-install-version-handshake/SPEC.md` — mark superseded by HTTP MCP shim or remove G6/G7 sections.
  - `docs/content/internals/lifecycle.mdx`
  - `docs/content/guides/mcp-integration.mdx`
  - `reports/mcp-agent-attribution-implementation/REPORT.md`
- **Acceptance:** No remaining mention of "stdio MCP child", `--pin`, `protocolVersion` lock field, or the G6 protocol gate as live behavior. Where historical context matters, mark as "superseded".

---

## 8. Out of Scope / Future Work

| Item | Maturity | Rationale | Trigger to revisit |
|---|---|---|---|
| **Shim packaging as separate dist artifact** (`B8`) | Explored | Today the shim ships in `@inkeep/open-knowledge` and transitively imports `boot.ts`/Hocuspocus. A `dist/shim.mjs` with a separate `ok-mcp` bin would make `npx @inkeep/open-knowledge mcp` cold-start small/fast. Not blocking v1. | Cold-start latency complaints from editor users; or before first npm publish. |
| **Unix socket / named pipe transport** (todo #9) | Explored | Wins: no port/TIME_WAIT race, filesystem-permissioned, no `0.0.0.0` LAN exposure. Costs: Windows named-pipe code path; SDK agent-threading verification. The abstraction (`resolveMcpHttpUrl → URL string`) is socket-ready; the swap is small. | If the localhost-binding security exposure or RestartableServer port-reuse flakes become real costs. |
| **Editor config migration story revamp** (todo #10 expansion) | Identified | Beyond removing the historical-shape classifier, a deeper rework of how the desktop app reconciles managed vs. user-edited entries is plausible. Out of scope here. | A second wave of editor-shape changes (e.g., bundling moves). |
| **`runtimeVersion`-based stamp re-design** | Noted | We're keeping `runtimeVersion` as the lock's build-stamp. If we ever want a richer compatibility story, design separately. | Real-world incompatibility incident across versions. |

---

## 9. Decision Log

The user pre-decided most of these in `todo.txt`; recording them as the spec's commitments.

| # | Type | Reversibility | Decision |
|---|---|---|---|
| **D-1** | Cross-cutting | 1-way door (architecture) | The MCP runtime lives in `packages/server`. CLI re-imports config schema + path helpers from server. (Alternative considered: a new `packages/mcp`. Rejected as over-engineering for this codebase.) |
| **D-2** | Technical | 1-way door (lock schema) | Delete the `protocolVersion` field from `ServerLockMetadata`. The build-stamp is `runtimeVersion` only. |
| **D-3** | Cross-cutting | 1-way door (capability) | HTTP MCP is the only implementation. Stdio child server is deleted, not feature-flagged. |
| **D-4** | Technical | 1-way door (transport) | Localhost HTTP stays for v1. Sockets are Future Work. Add a one-line note in the shim that `resolveMcpHttpUrl → URL string` is socket-swappable. |
| **D-5** | Technical | Reversible | Bridge strategy = byte/JSON-RPC proxy via SDK transports. Documented in `shim.ts` (IS-11). The "client + stdio re-exposer" alternative is explicitly rejected because it would re-register schemas in the shim. |
| **D-6** | Cross-cutting | 1-way door (CLI flag) | Remove `--pin`. `cliPath` (Electron) and `--dev-mcp` (worktree dist) cover the real pinning use cases. |
| **D-7** | Cross-cutting | Reversible | Drop historical-shape classifiers in desktop. Greenfield ⇒ no installed editor configs to preserve. |
| **D-8** | Cross-cutting | N/A | No back-compat for previously published installs. Greenfield is the design contract. |
| **D-9** | Technical | 1-way door (package layout) | The `Config` schema, `resolveContentDir`, `resolveLockDir`, `MCP_SERVER_NAME`, and `OK_DIR` move to `packages/server`. CLI re-imports them from `@inkeep/open-knowledge-server`. (Resolves OQ-1.) |
| **D-10** | Technical | Reversible | Per-session identity comes from `clientInfo.name` (mandatory in the MCP spec — verified in `@modelcontextprotocol/sdk` `InitializeRequestSchema`: `clientInfo` is a non-optional `ZodObject`, `name` is a non-optional `ZodString`). `connectionId` (per-session UUID) remains the disambiguator when two clients report the same name (e.g., two Claude Code instances). `AGENT_LABEL` is dropped entirely. (Resolves OQ-2.) |
| **D-11** | Technical | Reversible | Drop the parent-death watch entirely; rely on `idle-shutdown` (already in `packages/server/src/idle-shutdown.ts`) for server teardown. Server lifecycle is owned by "is anyone using me?", not "is my spawner still alive?". (Resolves OQ-3.) |
| **D-12** | Process | N/A | Bundle IS-1 + IS-2 in a single PR. The deletes interlock — `server-discovery.ts:209-260` is the only consumer of `lock.protocolVersion`, so removing the field requires deleting that code first. Splitting would either leave a stranded field across PRs or require an extra "gut the gate logic" pre-step. (Resolves OQ-4.) |

---

## 10. Open Questions

| # | Type | Priority | Blocking | Question |
|---|---|---|---|---|
| ~~OQ-1~~ | — | — | — | Resolved by D-9. |
| ~~OQ-2~~ | — | — | — | Resolved by D-10. |
| ~~OQ-3~~ | — | — | — | Resolved by D-11. |
| ~~OQ-4~~ | — | — | — | Resolved by D-12. |
| **OQ-5** | Technical | P2 | Non-blocking | Should `parseSpawnTimeoutEnv` move into `shim.ts` directly, or live in a new tiny `shim-env.ts`? **Recommendation:** inline in `shim.ts` unless it's reused elsewhere (it isn't). |

---

## 11. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **R-1** | The MCP runtime move (IS-3) creates a large diff that's hard to review and easy to get wrong (test-import paths, fixture paths, mock paths). | High | Land IS-1+IS-2 first to shrink the area; do IS-3 as a single mechanical move PR with no behavior changes; rely on `pnpm typecheck` + full test suite as the safety net. |
| **R-2** | `Config` schema location (OQ-1) gets relitigated mid-move, causing churn. | Medium | Resolve OQ-1 before starting IS-3. |
| **R-3** | Removing `protocolVersion` from the lock surfaces a forgotten consumer (e.g., a doc, a script, a metric). | Low | Pre-flight `rg "protocolVersion"` across the repo and verify each hit is in legacy code being deleted. |
| **R-4** | Per-session identity (IS-6 / OQ-2) regresses agent attribution in collab/activity-log paths that read `AgentIdentity` today. | Medium | Trace `agent-id`, `agent-presence`, `agent-write-summary` consumers before swapping; add a session test asserting two clients yield two identities end-to-end into the activity log. |
| **R-5** | Bridge end-to-end test (IS-12) flakes due to in-memory stream timing. | Low | Use the SDK's existing in-memory transport plumbing if available; otherwise gate with explicit `await`s on `start()`/`connect()`. |
| **R-6** | Desktop editor users who already have managed entries from prior dev builds (custom envs, etc.) may see "foreign-customized" classification after IS-10 and not get auto-updated. | Medium (in dev), Low (greenfield contract) | Per D-8, this is acceptable. Document the manual reset path in the docs sweep (IS-13). |

---

## 12. Implementation Phasing

This is the sequencing from `todo.txt`, ratified.

| Phase | Items | Why this order |
|---|---|---|
| **P1. Shrink** | IS-1, IS-2 | Largest deletion (~2K LOC). Removes the consumer of `protocolVersion`. Clears legacy weight before the move. Single PR. |
| **P2. Reshape** | IS-10, IS-9 | Independent of P3 layout work; quick wins; reduce desktop / editors.ts surface. |
| **P3. Move** | IS-3, IS-11 | The big mechanical refactor. IS-11 (5-line doc-block) rides along. |
| **P4. Real config + polish** | IS-4, IS-5, IS-6, IS-7, IS-8 | Behavioral fixes that depend on the new layout being in place. |
| **P5. Verify + sweep** | IS-12, IS-13 | E2E test closes the testing gap; doc sweep retires legacy mental models. |

---

## 13. Acceptance / Verification (spec-level)

The refactor is complete when:

1. `packages/server/src/mcp/` exists and owns the tool registry; `packages/cli/src/mcp/` contains only `mcp.ts`, `shim.ts`, and a small env helper.
2. `rg "from '\.\./\.\./cli"` in `packages/server/src/` returns nothing; `rg "from '\.\./\.\./\.\./\.\./server"` in `packages/cli/src/` returns nothing.
3. `rg "protocolVersion"` in `packages/server/src/server-lock.ts` returns nothing; `version-constants.ts` carries no `*PROTOCOL_VERSION`.
4. `rg --pin` in `packages/cli` returns nothing; `rg "isHistoricalNpxVariant\|isPriorCliPathShape\|computeForce"` in `packages/desktop` returns nothing.
5. `shim.ts` has a doc-block at the top declaring the byte/JSON-RPC proxy strategy and the socket-swappable note on `resolveMcpHttpUrl`.
6. A new test exercises stdio → HTTP MCP → tool dispatch → response → stdout in process.
7. Two MCP sessions in the same `ok start` produce two distinct `AgentIdentity` values (no `AGENT_LABEL` reliance).
8. Closing the first editor that spawned `ok start` no longer tears down sibling editor sessions.
9. `pnpm typecheck` and `pnpm test` are green across all packages.
10. The four doc/spec files in IS-13 reflect the post-refactor model (or are explicitly marked superseded).

---

## 14. References

- Source todo: `specs/2026-04-29-mcp-shim/todo.txt`
- Verified files: `packages/server/src/mcp-http.ts`, `packages/cli/src/mcp/shim.ts`, `packages/cli/src/mcp/tools/preview-url.ts`, `packages/cli/src/mcp/server-discovery.ts`, `packages/desktop/src/main/mcp-wiring.ts`
- Related spec to sweep: `specs/2026-04-24-cross-install-version-handshake/SPEC.md` (G6/G7 sections become superseded)
