# Open Knowledge

Bun monorepo (`bun@1.3.13`) — CRDT collaboration server + editor, packaged as `@inkeep/open-knowledge` CLI.

This file is the agent-facing index. It names the load-bearing commands, STOP rules, and conventions. **Depth lives elsewhere**: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PRECEDENTS.md`](./PRECEDENTS.md), per-package READMEs, `specs/`, and `reports/`. Follow the pointers — don't re-derive them from this file.

## Monorepo

```
packages/
  core/    — @inkeep/open-knowledge-core (shared extensions, types, utils)
  server/  — @inkeep/open-knowledge-server (Hocuspocus server library)
  cli/     — @inkeep/open-knowledge (published CLI + MCP)
  app/     — React editor frontend (private)
  desktop/ — @inkeep/open-knowledge-desktop (Electron app, private)
docs/      — Next.js docs site (Fumadocs)
```

Package-specific context lives in each package's `README.md`. The MCP substrate lives in `packages/cli/src/mcp/` and `.open-knowledge/`.

## Commands

```bash
bun install                          # Install workspace dependencies
bun run check                        # THE quality gate (lint + typecheck + unit + integration + fidelity)
bun run check:full:parallel          # check + e2e (required before final push on PRs touching *.e2e.ts)
bun run lint                         # Biome
bun run format                       # Biome --write
bun run build                        # turbo build (cli, app, docs)
bun run build:desktop                # electron-vite (no DMG; see packages/desktop)
bun run changeset                    # Create changeset

cd packages/app && bun run dev       # Dev server (Vite + Hocuspocus on 5173)
cd docs && bun run dev               # Docs (Next.js + Fumadocs)
bun run --filter=@inkeep/open-knowledge-desktop dev   # Electron dev (macOS)
cd packages/<pkg> && bunx tsc --noEmit && bun test    # Per-package
```

**`bun run check` is the canonical agent gate.** Run it after every iteration. It composes `biome check .` + turbo's `typecheck test test:integration test:conversion test:fidelity`. Each tier has an independent cache key — warm replay is <50ms. It does **not** include Playwright E2E; use `check:full:parallel` when your PR touches `packages/app/tests/stress/*.e2e.ts`. CI's `test:e2e` runs a fixed 6-file subset (see `packages/app/package.json`), which can diverge from `bunx playwright test`.

**CI tiers** (workflows in `.github/workflows/`): Tier 1 `ci.yml` (every PR + push to `main`: lint/typecheck/unit/integration/conversion/fidelity + Playwright E2E, 15 min); Tier 2 `nightly.yml` (workflow_dispatch — perf regression, parse-health, R15 guard); Tier 3 `weekly.yml` (workflow_dispatch — 10K-sample PBT under `STRESS_FIDELITY=1`, perf-trend artifact). Scheduled triggers are retired while pre-production — re-enable criteria in [`specs/2026-04-19-ci-signal-quality/SPEC.md`](specs/2026-04-19-ci-signal-quality/SPEC.md).

**PR-tier has `failOnFlakyTests: false`** — retry-success does NOT promote to red. Persistent-flake detection is the job of `.github/workflows/nightly-e2e-stability.yml` (09:00 UTC, `--repeat-each=3 --workers=1`; auto-opens an issue labeled `e2e-flake`).

**Architectural CRDT residual is NOT a CI signal.** Dual-CRDT topology has an intrinsic ~2-3% per-seed merge residual (D4-LOCKED until H2 2026+). Fuzz + stress (`bridge-convergence.fuzz.test.ts`, `server-authoritative-stress.test.ts`) preserved but invoked ad-hoc via `bun run measure:fuzz` / `measure:stress`; results append to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`. Run before merging a PR that touches `packages/server/src/server-observers.ts`, `packages/core/src/bridge/**`, or Y.js/Hocuspocus deps.

**Perf calibration.** Unit perf gate: `max(2× p99 variance, 10% absolute floor)`; baseline `packages/core/tests/perf/baseline.json`. E2E perf: `packages/app/tests/stress/perf-baseline.json`, median-of-5 p50 across post-merge CI runs; append-only; updates need approval per `perf-baseline-update.md`.

**Agent simulator** (dev server required): `cd packages/app && bun run src/server/agent-sim.ts [--rapid N] [--markdown]`.

## Conventions

- ESM everywhere (`"type": "module"`)
- Biome for lint/format (`biome.jsonc`)
- Tests co-located: `foo.test.ts` next to `foo.ts`
- TypeScript strict, `verbatimModuleSyntax: true`
- Workspace deps use `"workspace:*"`

**`bun.lock` merge conflicts** — do not hand-edit:

```bash
git checkout <base-branch> -- bun.lock
bun install
git add bun.lock
git rebase --continue   # or git merge --continue
```

Bun's lockfile auto-resolution is tracked in [oven-sh/bun#17717](https://github.com/oven-sh/bun/issues/17717).

**Post-ship corrigendum annotations.** Never rewrite prose in shipped specs. Append a breadcrumb on the same line: `<original><br>_[Corrected YYYY-MM-DD post-ship: <one-sentence correction>. Authoritative fix in <pointer>.]_`. Apply to every occurrence in the same doc. Pattern originates in [`specs/2026-04-16-post-ship-docs-polish/`](specs/2026-04-16-post-ship-docs-polish/) (D4).

## Architectural precedents

27 numbered rules govern how work lands here; code cites them as `precedent #N` across ~50 sites. **Canonical source: [`PRECEDENTS.md`](./PRECEDENTS.md)** — read the relevant entry before touching a cited site or adding a new pattern that sits alongside one.

## Packages

**`core`** — shared extensions, markdown pipeline, pure utilities. Browser+Node compatible (no React, no server deps). Key constraint: `sharedExtensions` (in `src/extensions/shared.ts`) MUST stay in sync between core/server/app — drift causes silent data corruption. Markdown pipeline details: see [Markdown Pipeline](#markdown-pipeline) below.

**`server`** — Hocuspocus CRDT server library: persistence, file-watcher, agent sessions, shadow repo, HTTP API, server-authoritative observer bridge, CC1 broadcast, agent-presence map. See [`packages/server/README.md`](packages/server/README.md). Canonical boot entry point is `bootServer()` in `packages/server/src/boot.ts` (called by CLI `ok start`, Electron utility, `bunServer` path). Server lock at `<contentDir>/.open-knowledge/server.lock` prevents multi-server-per-contentDir collisions. Shadow repo at `<projectRoot>/.git/open-knowledge/` stores per-writer WIP refs + upstream-import + checkpoint — writer-ID taxonomy (precedent #25) has five categories: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`.

**`cli`** — Commander.js v14 CLI published as `@inkeep/open-knowledge`; two bins (`open-knowledge` + `ok`). Commands: `ok start | init | mcp`. Hierarchical YAML config in `.open-knowledge/config.yml` (precedence: flags > env > workspace > user > defaults). MCP stdio server auto-discovers the running Hocuspocus port via `server.lock`. Distribution strategy: [`specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md`](specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md).

**`app`** — React editor frontend: TipTap WYSIWYG + CodeMirror source mode, real-time CRDT collaboration. Dev mode (`bun run dev`) serves Vite + Hocuspocus on port 5173 from one process via `packages/app/src/server/hocuspocus-plugin.ts` — shares the same `server.lock` as `open-knowledge start`, so both against the same contentDir is mutually exclusive.

**`desktop`** — Electron macOS app (`@inkeep/open-knowledge-desktop`, private). Milestones M1-M6 shipped (signed-DMG scaffolding, auto-update, `openknowledge://` URL scheme, keyring E2E, CLI-on-PATH, first-launch MCP consent). Windows/Linux parity (M7) deferred. See [`packages/desktop/README.md`](packages/desktop/README.md) and the per-milestone specs under `specs/2026-04-2*-m[2-6]-*/SPEC.md`. Process model: one editor `BrowserWindow` ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir`. IPC discipline: never `ipcMain.handle`/`ipcRenderer.invoke` directly — always via `createHandler`/`createInvoker` from `src/shared/ipc-*.ts` (Biome GritQL rule `no-loosely-typed-webcontents-ipc` enforces).

## Editor substrate

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds (y-codemirror.next)
├── Y.Map('metadata')         ← frontmatter cache
├── Y.Map('agent-flash')      ← agent write-flash side-channel (D57)
└── Y.Map('agent-effects')    ← bounded activity-log ring-buffer (D49)

Server Observer A: XmlFragment → Y.Text  (OBSERVER_SYNC_ORIGIN)
Server Observer B: Y.Text → XmlFragment  (OBSERVER_SYNC_ORIGIN)
Client observers: baseline tracking only (write paths deleted — precedent #14)
```

**Three invariants** (assert before/after every propagation):

1. **Bridge invariant:** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`.
2. **Baseline invariant:** Observer A's `lastSyncedXmlMd` matches current XmlFragment state. Staleness → incorrect diffs.
3. **Item-preservation invariant:** Sync operations must not replace Items whose content at the target position already matches. Preserves `Y.UndoManager({ trackedOrigins })` attribution through bridge cycles.

**Write surfaces:**

| Surface                   | → Y.Text                | → XmlFragment              | → Disk                  |
| ------------------------- | ----------------------- | -------------------------- | ----------------------- |
| W1 WYSIWYG (XmlFragment)  | Server Observer A       | (direct)                   | Persistence debounce    |
| W2 Source (Y.Text)        | (direct)                | Server Observer B          | Persistence debounce    |
| W3 Agent API              | applyAgentMarkdownWrite | applyAgentMarkdownWrite    | Persistence debounce    |
| W4 Disk (file watcher)    | applyExternalChange     | applyExternalChange        | (direct)                |
| W5 Agent Undo             | applyAgentUndo          | applyAgentUndo             | Persistence debounce    |

**Full observer design** (server-authoritative Path A/B, settlement dispatch via `afterAllTransactions`, origin-guard truth tables, paired-write markers, `applyAgentMarkdownWrite` reference implementation): [`ARCHITECTURE.md`](./ARCHITECTURE.md) + the four spec directories under `specs/2026-04-1[4-6]-*/`. `packages/server/src/server-observers.ts` is the canonical implementation.

**Agent-write attribution** — every mutating POST handler in `api-extension.ts` calls `extractAgentIdentity(body)` at entry before any Y.Doc mutation (FR-5, D42, precedent #24). Meta-test at `packages/app/tests/integration/attribution-sweep-coverage.test.ts` scans the route registry and fails if a handler omits it or is missing from the allowlist. Writes use `session.dc.document.transact(fn, session.origin)` — the per-session frozen origin object (precedent #24, D32).

**Agent presence** lives on `__system__` Y.Doc awareness as a map-valued `agentPresence: Record<agentId, AgentPresenceEntry>` (see `packages/server/src/agent-presence.ts`). Per-doc awareness would stomp across concurrent agents — each Hocuspocus `Document` has one shared `Awareness` with a single `clientID`. Cleanup is deterministic via the MCP keepalive WS (`/collab/keepalive` handler in `boot.ts`). Metrics at `GET /api/metrics/agent-presence` (diagnostic-only; clients don't poll).

**CC1 push-over-awareness** — pure-signal push primitive for derived views (file list, backlinks, graph). Contract v1: `{v:1, ch:string, seq:number}`. 100 ms trailing-edge debounce per channel. Emitter: `packages/server/src/cc1-broadcast.ts`. Every subsystem keyed off `documentName` MUST short-circuit via the single `isSystemDoc()` helper in that file (STOP rule below).

## Testing

**Naming convention.** `*.test.ts` for Bun (unit, integration, stress). `*.e2e.ts` for Playwright. **Never use `*.spec.ts`** — Bun auto-discovers both and causes collisions (Playwright's `test()` throws outside the Playwright runner).

**Layers.**

| Layer       | Scope                                                | Command                                                |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Unit        | Per-package `*.test.ts`                              | `bun test` (per package) or `bun run test`             |
| Integration | Bridge matrix + C1-C10 server-authoritative          | `bun run test` (turbo task `test:integration`)         |
| Fidelity    | PBT invariants I1-I11 + handler PBTs + corpus        | `bun run test:fidelity`                                |
| E2E         | Playwright                                           | `bun run test:e2e` (CI subset) or `bunx playwright test` |
| Ad-hoc      | Fuzz / stress (architectural residual)               | `bun run measure:fuzz` / `measure:stress`              |

**Integration harness** at `packages/app/tests/integration/test-harness.ts` exposes `createTestServer()`, `createTestClient(port, docName?, opts?)`, `createTestClients(port, {count})`, `assertAllConverged(clients, {timeout?})`, `attachBridgeInvariantWatcher(doc)`, `createItemOriginProbe(ytext, {trackedOrigins})`, `getServerState(server, docName)`, `awaitDocQuiescence(doc)`. Use per-test docNames (auto-generated `test-${randomUUID()}`) so tests run concurrently. Network control primitives: `network-control.ts` — `ControllableWebSocket`, `client.pauseSync()`/`resumeSync()` via `syncControl: true`.

**Playwright policy.** Runs on every PR. `failOnFlakyTests: false` globally — persistent-flake detection is the nightly's job. Each test creates its own unique doc via `POST /api/create-page` and seeds via `POST /api/agent-write-md` with explicit `docName` + `position: 'replace'`. **STOP: do not hardcode `'test-doc'` in Playwright tests** — workers run in parallel and shared names cause cross-worker CRDT corruption. Reference pattern: `docs-open.e2e.ts`'s `seedDocs` helper.

**Observer bridge coverage.** Changes to `observers.ts` or `server-observers.ts` require multi-client integration tests (C1-C10), not just single-client ones. PR #43's matrix proved single-client tests miss remote-peer WYSIWYG divergence.

**Fuzz seed replay:**

```bash
STRESS_FUZZ_SEED=<seed> bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts
STRESS_SEED=<seed>      bun test packages/app/tests/stress/server-authoritative-stress.test.ts
```

Snapshots on failure write to `/tmp/fuzz-*`.

## Concurrent development

- **Same worktree, two agents:** each bun process gets its own port (`getFreePort`), its own Hocuspocus tmpdir, its own Y.Docs, its own module state. No config needed.
- **Separate worktrees:** stronger isolation via filesystem.
- **Agent running Playwright + dev server:** Playwright sets `OK_TEST_CONTENT_DIR` to an isolated tmpdir; `bun run dev` uses `packages/content/`. No contention.
- **VITE_PORT** env var for custom port (`VITE_PORT=9999 bun run dev`, strict). Default 5173 (not strict).

**Worktree gotcha — `bun install` after `git worktree add`.** Worktrees nested at `.claude/worktrees/X/` inherit `node_modules` via Bun's upward-walk resolution, causing ProseMirror-model dedup failures (`PmNode.fromJSON()` throws "multiple versions of prosemirror-model"). Also causes spurious `bun run knip` reports (missing `docs/.source/` postinstall artifacts). **Always run `bun install` in the worktree before `bun run check` or `git push`.** Full analysis: [`reports/bun-prosemirror-model-dedup/REPORT.md`](reports/bun-prosemirror-model-dedup/REPORT.md).

## STOP rules

Load-bearing safety rules. Each is enforced by code review; many are also enforced by tests. Violations have cost the team time — don't relearn them.

- **Server-side Y.Doc transactions MUST use `session.dc.document.transact(fn, session.origin)`.** Never `session.dc.transact(fn)` — the per-session frozen origin is mandatory (precedent #24, D32). Omitting it routes writes to `openknowledge-service` and breaks per-session undo (UM's `trackedOrigins` Set-identity match silently skips the transaction).
- **Server-side agent writes use the XmlFragment-authoritative pattern** (`applyAgentMarkdownWrite` / `applyAgentUndo` in `packages/server/src/agent-sessions.ts`, precedent #10). Never rebuild XmlFragment from raw Y.Text — that's the deleted `syncTextToFragment` / Bug-A / Bug-D anti-pattern. Reference: [`specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md`](specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md).
- **Don't bypass `writeTracker` or `skipStoreHooks`.** `writeTracker` prevents persistence↔file-watcher feedback loops; `skipStoreHooks` prevents persistence from re-saving a file we just loaded.
- **`isSystemDoc()` gate at every documentName-keyed entry point.** Any new server-side subsystem that keys off `documentName` MUST call `isSystemDoc()` at its entry (see `cc1-broadcast.ts`). Forgetting leaks state into the `__system__` pseudo-doc. L1 test `packages/app/tests/integration/cc1-broadcast.test.ts` asserts zero `__system__` state across every audited subsystem. `ContentFilter` rejects `__system__.md` at admit time; `POST /api/create-page` returns 400.
- **Server-side observer cross-CRDT writes use `OBSERVER_SYNC_ORIGIN`.** Do NOT re-add client-side cross-CRDT write paths in `observers.ts` (deleted under precedent #14; Mutation G in [`specs/2026-04-15-server-authoritative-observer-bridge/meta/mutation-validation.md`](specs/2026-04-15-server-authoritative-observer-bridge/meta/mutation-validation.md) validates the deletion).
- **Only one `BridgeMergeContentLossError` catch site.** The site in `server-observers.ts` Observer A Path B emits structured `bridge-merge-content-loss` telemetry, queues a silent `saveInMemoryCheckpoint` via `queueMicrotask`, applies the merge as-computed (SPEC §10 D3 LOCKED). A second catch site silently drops the observability signal. Reference: [`specs/2026-04-16-bridge-correctness/SPEC.md`](specs/2026-04-16-bridge-correctness/SPEC.md) §6 R7/R7b.
- **Paired-write origins MUST declare `context.paired: true`.** Any new origin that atomically mutates BOTH Y.XmlFragment and Y.Text in a single `doc.transact(..., ORIGIN)` must opt in via the typed marker (precedent #1 extension, SPEC §6 R0). `isPairedWriteOrigin(origin)` is a structural check — no hardcoded registry. Omitting re-surfaces the observer-amplification class that US-001/US-002 regression tests T8/T9/T10 guard against.
- **Don't add Y.js observers inside an `<Activity>` subtree without `ACTIVITY_MOUNT_LIMIT`-style bounding.** Y.js observers are NOT React effects and do NOT pause when Activity flips to `hidden` — a hidden entry with a live provider still processes every remote-peer update. For per-document observers, wire them off the bounded pool, not the editor component's mount lifecycle (precedent #18(c); reference: `EditorActivityPool.computeActivityMountList`).
- **Don't collapse the hybrid render tree** (`DocumentErrorBoundary` → `Suspense` → `EditorActivityPool` → `Activity` → `DocumentBoundary`) to a pure `<Editor key={activeDocName} />` pattern. The hybrid is load-bearing for the flash-free UX (SPEC G1-G2-G5, precedent #18(b)). Add new write surfaces by wrapping them in their own `DocumentBoundary`. Canonical shape: `packages/app/src/components/EditorArea.tsx`.
- **Agent-undo contract.** `applyAgentUndo(session, scope)` in `agent-sessions.ts` is the only sanctioned server-side undo write surface. Must satisfy: (1) XmlFragment-authoritative composition from `applyAgentMarkdownWrite`; (2) fires under per-session `session.undoOrigin` (distinct from `session.origin`; `captureTransaction: tr => tr.origin !== session.undoOrigin` keeps undo-of-undo off the stack); (3) fuzzer + conversion-PBT coverage per `specs/2026-04-14-*/SPEC.md` FR-17; (4) no client-side cross-CRDT writes (Mutation G); (5) single `doc.transact()` block — no defensive mutex. Full evidence: [`specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md`](specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md) §8.4.
- **`recordContributor` summaries route through `normalizeSummary`** (`packages/server/src/agent-write-summary.ts`). Single API-boundary truncation point — don't scatter trimming/type-checking across handlers. Whitespace-only inputs classify as `absent` and don't count as adoption. SPEC: [`specs/2026-04-21-agent-write-summaries/SPEC.md`](specs/2026-04-21-agent-write-summaries/SPEC.md) §6 FR2 + D5/D24.
- **`handleRename` / `handleRollback` guard `extractAgentIdentity` + `recordContributor` on explicit `agentId`.** In-editor Restore posts with no identity; the default `claude-1/Claude` fallback would attribute every human-driven rollback to Claude (D22 LOCKED 1-way-door, NG12). Adding attribution by default is scope-extension.
- **Don't narrow PM mark `excludes` fields.** Precedent #9 covers mark attrs as add-only. US-017 widened `Code` via `CodeMarkFidelity` (`excludes: ''`) to let emphasis/strong coexist with inline code per CommonMark. Reverting via a Tiptap upgrade reintroduces idempotence failures.
- **`shell.openPath` single-source discipline (2026-04-23).** Exactly two call sites in the main process: `openAssetSafely` at `packages/desktop/src/main/asset-allowlist.ts` and the `ok:shell:open-asset` handler registration at `packages/desktop/src/main/index.ts` that delegates to it. Do NOT add a third. `shell.openPath` dispatches to the OS content handler by extension — every unguarded call site is a potential RCE vector (Joplin/Obsidian/Zettlr research in [`reports/electron-os-integration-patterns/`](reports/electron-os-integration-patterns/) D5). Any new renderer-initiated "open this file on disk" surface must route through the existing IPC → `openAssetSafely` three-check gate (containment + existence + `EXECUTABLE_BLOCKLIST_EXTENSIONS`). Extend the IPC channel or add a sibling handler that reuses `openAssetSafely`; don't call `shell.openPath` directly.
- **Asset click interception goes through InteractionLayer only (2026-04-23).** Click routing goes through `createMarkInteractionBridgePlugin` (for `link` marks) or `createAssetContextMenuPlugin` (contextmenu) — NEVER `handleClickOn` / `handleDOMEvents` on a ProseMirror plugin (precedent #19(b)). The renderer dispatcher (`dispatchAssetClick` in `packages/app/src/editor/asset-dispatch/`) is the single entry point; every bridge/plugin routes there. Adding a second click-intercept mechanism fragments routing and re-introduces the Gap 3b / Gap 4 failure class.
- **No `upload.*` user-facing config + no runtime `.obsidian/app.json` reader (2026-04-24).** `ConfigSchema` has no `upload` section; `UploadConfig` / `DEFAULT_UPLOAD_CONFIG` / `PartialUserUploadConfig` / `resolveUploadConfig` / `detectObsidianVault` were deleted. Every value is a module-level constant in `packages/core/src/constants/upload.ts` (`DEFAULT_ATTACHMENT_FOLDER_PATH`, `DEFAULT_EMIT_FORMAT`, `DEFAULT_DEDUP_MODE`, `DEFAULT_DEDUP_UI`, `WIKI_EMBED_EXTENSIONS`). Re-adding any knob requires a spec with a concrete user request. Do NOT re-add a runtime reader of `.obsidian/app.json` — Obsidian-refugee onboarding is the future one-shot `ok migrate --from-obsidian-vault` CLI, not runtime coupling to a proprietary closed-source schema. Reference: [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-24).
- **Server-side disk writes go through `fs-traced.ts` wrappers.** Never import `writeFile` / `rename` / `mkdir` / `unlink` directly from `node:fs` (or `node:fs/promises`) in server code that might run in production paths — use `tracedWriteFile` / `tracedRename` / `tracedMkdir` / `tracedUnlink` (or `*Sync` variants) from `packages/server/src/fs-traced.ts` so every disk write emits an `fs.*` span with bounded-cardinality path attributes. `@opentelemetry/instrumentation-fs` does NOT work on Bun (oven-sh/bun#6546, #26536); the hand-rolled wrappers are the sanctioned path. Exception: test-only code and one-shot scripts that never run in production don't need wrapping. Reference: [`specs/2026-04-09-otel-instrumentation/SPEC.md`](specs/2026-04-09-otel-instrumentation/SPEC.md) §17 US-010.
- **Don't emit unbounded-cardinality span/metric attributes.** Raw absolute paths, document content, user free-form strings on histograms or high-volume span attributes will blow up Tempo's index and Prometheus's label cardinality. Normalize before emitting: paths → last-two-segments + a `*.role` classifier (reference: `fs-traced.ts`'s `normalizeFsPath` + `classifyFsPath`); identifiers → pre-validated UUIDs / enums. Safe spans tag `doc.name`, `shadow.writer`, `agent.write_position`, `http.route` (pre-normalized). Reference: [`specs/2026-04-09-otel-instrumentation/SPEC.md`](specs/2026-04-09-otel-instrumentation/SPEC.md) §17 US-010 cardinality rule.
- **Serve-side asset admission goes through widened `ASSET_EXTENSIONS` + `Content-Disposition` dispatch (2026-04-24b).** The Vite plugin's sirv middleware at `packages/app/src/server/hocuspocus-plugin.ts:404+` MUST set `Content-Disposition: inline` for `INLINE_RENDERABLE_EXTENSIONS` (image/pdf/video/audio subset) and `attachment` for everything else admitted by the content filter. Narrowing `ASSET_EXTENSIONS`, removing the Content-Disposition dispatch, or dropping the SPA-fallback 404 guard silently refutes SPEC D-M accept-all + R7 and re-surfaces the `.m4v`-class dogfood bug (new tab serves `text/html` instead of the asset). `.md`/`.mdx` direct-URL requests bypass the dispatch (edge case — forcing attachment would break dev-tool `curl` of markdown paths). Reference: [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-24b).
- **`EXECUTABLE_BLOCKLIST_EXTENSIONS` includes macOS-installer + URL-file + cross-platform-package classes (2026-04-24b).** Do not narrow. Covered: `.dmg`/`.pkg`/`.mpkg`/`.scpt`/`.applescript`/`.terminal`/`.prefpane` (macOS installer + script + system-UI), `.webloc`/`.inetloc`/`.fileloc` (URL-file, CVE-2022-22590 class), `.jar`/`.appimage`/`.deb`/`.rpm`/`.msix`/`.appx`/`.ipa`/`.apk` (cross-platform packages), `.pif`/`.scr`/`.lnk`/`.url` (Windows shortcut + PE executables). Consumed by `openAssetSafely` (`packages/desktop/src/main/asset-allowlist.ts`) and `matchAssetUrl` (`packages/desktop/src/main/asset-safety-net.ts`). Reference: [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-24b) + [`reports/electron-os-integration-patterns/REPORT.md`](reports/electron-os-integration-patterns/REPORT.md) D4.
- **FR-A5 `wikiLinkEmbed` NodeView wires drop-time clicks through the dispatcher (2026-04-24b).** `packages/app/src/editor/extensions/wiki-link-embed.ts` (app-layer) mounts a per-instance NodeView over core's `WikiLinkEmbed` that registers with `getInteractionLayer(editor)` and routes non-image chip clicks through `dispatchAssetClick`. Do NOT revert to bare `<a target="_blank">` fallback — pre-fix, this path silently failed in Electron (`setWindowOpenHandler` denied with no feedback). Image extensions render as `<img>` with no registration (inline display; click is a PM-selection concern). Pattern mirrors `wiki-link.ts:98-200`. Reference: [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-24b).

## WARN rules

- Markdown round-trip isn't always stable. `## H\nP` normalizes to `## H\n\nP`. Check `serialize(parse(md)) !== md` to find normalizing constructs.
- Observer A's `lastSyncedXmlMd` must refresh on ALL XmlFragment changes, not just user edits. Stale baseline → incorrect diffs → content loss.
- Layer A unit tests use `transaction.local=true` — NOT the same code path as production (`local=false` on WebSocket updates). Relying only on unit coverage misses remote-peer divergence.
- `hocuspocus.configure({ extensions: [...] })` REPLACES the extensions array (object spread). Use `hocuspocus.configuration.extensions.push()` to add without losing existing.
- TipTap's `editor.view` is a throwing proxy before ProseMirror mount. Touching `editor.view.dom` during recycle/remount crashes the nearest ErrorBoundary with "Unknown error". Use `editor.editorView` (non-throwing alternative) and subscribe to `'create'` before accessing `view.dom`. Reference: `packages/app/src/editor/TiptapEditor.tsx`.
- React 19.2 `<Activity mode="hidden">` unmounts the hidden subtree's DOM. Scroll containers that wrap multiple Activity mounts lose `scrollTop` on every flip. **Each Activity mount must own its own scroll container** — see `EditorActivityPool.tsx` + `ScrollPreservingContainer`.
- Playwright's `_electron.launch({ args: [url] })` does NOT fire the macOS `open-url` Apple Event — URL arrives via `process.argv` (second-instance path only), NOT the cold-start queue-then-flush. Tests that need true Apple-Event delivery must shell out to `execSync('open -g "openknowledge://..."')`. Reference: `packages/desktop/tests/smoke/deep-link.e2e.ts`.
- `syntaxTreeAvailable()` from `@codemirror/language` reflects the DEEPEST pending sublanguage, not the outer markdown tree. Gating decorations on it silently disables them whenever a fenced-code language block enters the viewport. For ViewPlugin: detect `syntaxTree(update.startState) !== syntaxTree(update.state)`. For StateField: early-return on `!tr.docChanged`. Reference: `packages/app/src/editor/source-polish/`.
- `OTEL_SDK_DISABLED` follows OTel convention: only the literal string `"false"` enables the SDK. Any other value (`"true"`, `"1"`, empty, unset) keeps it disabled. Misreading this as "boolean" sends people down an hour of wondering why no traces appear when they set `OTEL_SDK_DISABLED=0`. Frontend gate `VITE_OTEL_ENABLED` is the inverse (must equal `"true"` to enable) and is a Vite build-time env — setting it AFTER `bun run dev` starts has no effect on the current bundle.
- The dev plugin runs `createServer()` from `@inkeep/open-knowledge-server` (no longer constructs Hocuspocus directly — changed in PR #293). `createServer()` calls `initTelemetry()` internally, so `bun run dev` gets OTel for free when the env vars are set. Don't re-add a separate `initTelemetry()` call in the plugin — it'd be a redundant no-op (init is idempotent) but noise in the init sequence.

**Logging conventions.** Two `console.warn` styles coexist: (1) bracket-prefix (`[file-watcher] ...`) for ad-hoc ops warnings read by humans; (2) structured JSON (`console.warn(JSON.stringify({event, ...}))`) for events counted in aggregate or asserted in tests. Don't convert one to the other without knowing the consumers.

## Observability (OpenTelemetry)

OTel instrumentation is **opt-in** and **dev-focused**. Default builds have the SDK disabled on the server and bundle-eliminated on the frontend — zero overhead when off.

**Turn it on + see traces:** full getting-started is in [`docker/otel-dev/README.md`](docker/otel-dev/README.md). Three commands: `docker compose up -d`, export env vars (`OTEL_SDK_DISABLED=false OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318 VITE_OTEL_ENABLED=true VITE_OTEL_COLLECTOR_URL=http://localhost:14318`), `bun run dev`. Grafana at **http://localhost:3001** (anonymous admin, no login).

**What's instrumented:** browser UserInteraction / DocumentLoad / Fetch → HTTP server span (with `traceparent` extraction) → agent-write → persistence load/store → `fs.writeFile` / `fs.rename` / `fs.mkdir` (via `fs-traced.ts`) → `persistence.commitToWipRef` → `shadow.commitWip`. Full app→disk chain as one trace when fetch-initiated. Metrics: `http.server.request.duration`, `ok.persistence.load/store/git_commit.duration`, `ok.file_watcher.events`. Pino log records carry `trace_id` / `span_id` for trace↔log correlation in Grafana.

**Canonical sites:**

- [`packages/server/src/telemetry.ts`](packages/server/src/telemetry.ts) — SDK init (`initTelemetry`, `shutdownTelemetry`), helpers (`withSpan`, `withSpanSync`, `setActiveSpanAttributes`, `getTracer`, `getMeter`). SDK 2.x, Bun-compatible (`BasicTracerProvider` + `AsyncLocalStorageContextManager`).
- [`packages/server/src/fs-traced.ts`](packages/server/src/fs-traced.ts) — the ONLY sanctioned path for adding a disk-write span. Every new `writeFile` / `rename` / `mkdir` call site in the server package goes through these wrappers.
- [`packages/app/src/telemetry.ts`](packages/app/src/telemetry.ts) + [`telemetry-impl.ts`](packages/app/src/telemetry-impl.ts) — lazy-loaded browser SDK. Dynamic import gates the ~45 KB OTel bundle behind `VITE_OTEL_ENABLED === 'true'` — nothing ships when off.
- [`packages/app/src/editor/collab-otel.ts`](packages/app/src/editor/collab-otel.ts) — Hocuspocus WebSocket trace-context propagation (query param, since browser `WebSocket` can't set headers).
- [`docker/otel-dev/`](docker/otel-dev/) — the local Grafana LGTM stack (Grafana + Tempo + Loki + Prometheus + OTel Collector). README has port layout, env vars, and troubleshooting.

**Adding a new span** (agents + humans):

1. Identify the operation. Is it a ≥1ms unit worth measuring, and a named boundary in the codebase (function, hook, handler)? If yes, it gets a span; if it's 5 lines of CPU-bound arithmetic, it doesn't.
2. Wrap the call site:

   ```typescript
   import { withSpan } from './telemetry.ts';  // or from @inkeep/open-knowledge-server

   await withSpan('my.operation', { attributes: { 'my.attr': value } }, async () => {
     // existing code
   });
   ```

   `withSpan` handles exception recording + status + `span.end()` — just write the body.

3. If you need to read the active span without a reference (e.g. to add attributes deep in a call chain), use `setActiveSpanAttributes({ ... })`.
4. If the operation writes to disk, use `tracedWriteFile` / `tracedRename` / `tracedMkdir` / `tracedUnlink` (async) or `*Sync` variants from `fs-traced.ts` — do NOT import raw `fs` and wrap it yourself.
5. Attribute keys: follow OTel semantic conventions (`http.*`, `db.*`, `fs.*`, `file.*`, etc.). Repo-specific attributes use namespaced prefixes (`ok.*`, `agent.*`, `shadow.*`, `persistence.*`, `doc.*`).
6. **Cardinality check:** attributes with an unbounded value space (raw paths, user IDs, document content) will blow up Tempo's index. Normalize or classify before emitting — `fs-traced.ts`'s `fs.path` + `fs.path.role` pattern is the reference.

**Adding a new metric:**

```typescript
import { getMeter } from './telemetry.ts';

// Lazy-init at first use (meter is a no-op when disabled, so allocation is cheap).
const hist = getMeter().createHistogram('ok.my_subsystem.duration', {
  description: 'What this measures',
  unit: 's',
});
hist.record(elapsedSeconds, { 'bounded.label': value });
```

- Namespace: `ok.<subsystem>.<metric_name>`. Standard OTel names (`http.*`) when they apply.
- Units follow semconv: seconds (`s`), bytes (`By`), counts unitless.
- Histogram labels must be bounded-cardinality. Never put raw paths, user IDs, or free-form strings on a metric.

**Adding trace context to a new write surface:** if the surface receives an HTTP request, the server's `onRequest` extension already extracts the incoming `traceparent` header — just wrap the handler body with `withSpan`. If it's a WebSocket-initiated path, the server-side `onConnect` extraction of `traceparent` from `requestParameters` is deferred (see [`specs/2026-04-09-otel-instrumentation/SPEC.md`](specs/2026-04-09-otel-instrumentation/SPEC.md) §17.4) — your span will be an independent root, which is fine.

Full PRD + decisions + non-goals + user stories: [`specs/2026-04-09-otel-instrumentation/SPEC.md`](specs/2026-04-09-otel-instrumentation/SPEC.md). **§17 is the scope-expansion amendment** (2026-04-23) — read before adding non-trivial instrumentation.

## Symlinks

Symlinks inside content directories are supported. Realpath-based identity (file watcher indexes by canonical path; two paths resolving to the same inode share a Y.Doc). Atomic writes resolve `realpath(requestedPath)` then place the tmp file next to the canonical target. Escape-safe: realpath outside `contentDir` → refuse with `symlink-escape`. Full edge-case catalog: [`reports/symlink-handling-file-sync-crdt/REPORT.md`](reports/symlink-handling-file-sync-crdt/REPORT.md).

## Markdown pipeline

`unified + remark` for parsing + serialization; `@handlewithcare/remark-prosemirror` (pinned `0.1.5`, patched) bridges mdast ↔ ProseMirror. Two post-parse phases: Phase A restores PUA sentinels, Phase B dispatches autolink-promotion + doc-start-thematic-fix + position-slice + unknown-mdast-guard in one `unist-util-visit`. Handler tiers: A passthrough / B fidelity / C custom. Pinned + patched dependencies fail-loud via `patchedDependencies`.

**Schema names are mdast-canonical:** `strong` (not bold), `emphasis` (not italic), `thematicBreak` (not horizontalRule). Unified `list` + `listItem`.

**Upgrade protocol.** Before bumping any markdown dependency: re-run the 118-case fidelity probe at `tech-probes/r1-preflight-gate/` and the full invariant suite (`bun run test:fidelity`). Verify both remark-prosemirror patch hunks still apply cleanly.

Full pipeline design, file-by-file mapping, and handler tier listings: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md`](specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md), and `packages/core/src/markdown/*`.

### Storage-layer fidelity contract

**Storage never sanitizes; render-time layers do.** Raw HTML, backslash escapes, literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline).

**Invariants I1-I11** (PBTs in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`; I11 at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts`):

- I1 Identity · I2 Character preservation · I3 Normalization canonicality · I4 Idempotence · I5 Layer A===B · I6 Multi-client preservation · I7 Cross-path consistency · I8/I9/I10 Crash resistance + guard completeness · I11 R23 guard precision

Six handler-specific PBTs alongside (emphasis, backslash, list-nesting, html-block-edge, link-edge, image-edge) target bug shapes characterized in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r6-failure-modes.md`.

**Irreducible gaps (NG1-NG11).** Blank-line count normalizes (NG1); GFM table column widths normalize (NG2); math/footnotes/alerts outside extension set not preserved (NG3); no storage-layer HTML sanitization (NG4); entity refs decode to literal characters (NG5); non-ambiguous `\foo` backslashes drop on round-trip (NG6); MDX `---` inside JSX parses as thematicBreak (NG7); block GFM inside inline `<Note>` flattens (NG8); U+E000–U+E004 PUA codepoints reserved as R23 guard sentinels (NG9); doc-start `---` normalizes to `***` (NG10); docs of only ignore-typed mdast get a synthesized empty paragraph (NG11). Full details: spec §§ and inline code docs.

## Code style

- **React Compiler is enabled.** Do NOT add `forwardRef`, `memo`, `useMemo`, or `useCallback` — rely on the compiler unless a maintainer explicitly requests an exception.
- Use `use()` instead of `useContext()` (React 19).
- Prefer Tailwind `className` over inline `style` props.
- Prefer existing shadcn components over custom primitives. If the needed shadcn component isn't installed, suggest installing it.

### Comment discipline (code comments, not docs)

Comments explain the non-obvious **why** — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment wouldn't confuse a future reader, don't write it. Well-named identifiers explain the **what**; don't duplicate them in prose.

**Do NOT cite the process that produced the code.** The following all rot and belong in the PR body or commit message, not in source:

- SPEC paths — `specs/2026-04-21-open-in-agent-desktop/SPEC.md §6.4`, `Governing spec: …`.
- Internal decision numbers — `D5`, `D8`, `D24`, `LOCKED`, `DIRECTED`, `NOT NOW`, `per D44 case (a)`.
- Non-goal tags — `NG2`, `per NG6`, `NG3 — no beta channel`.
- Acceptance-criteria / user-story / functional-requirement numbers — `AC9 asserts`, `US-007 wires a mock`, `FR-8 "Warning logged"`, `MQ1`.
- Audit finding IDs — `DC-M4`, `DC-L7`, `Review M5`, `Review Minor #1`, `audit M6`, `Mutation H`.
- Dated audit-trail narratives — `post-ship amendment`, `post-implementation fix`, `Per post-ship review`, `2026-04-21 amendment`.
- Feature-work or milestone tags that mean nothing after the work ships — `M3`, `V0-14`, `V0-1 shipped`, `added for …`.

When one of these appears next to substance worth keeping, strip the citation and keep the substance. When the whole comment only exists to cite, delete it.

**Exempt — keep these:**

- STOP / WARN rules and cross-file contracts (the ones already codified in the "Known Pitfalls" and "STOP rules" sections of this file).
- External standards with stable numbering: `CommonMark §2.4`, `RFC 3986`, `OAuth 2.1 §4.1.3`, upstream issue numbers like `electron/electron#32600`.
- `precedent #N` references in this repo — they target [PRECEDENTS.md](./PRECEDENTS.md), which is an intentionally curated long-lived rulebook (not a rotating spec).
- Explicit drift warnings between sibling source files when TypeScript can't catch the divergence (e.g. the `HandoffFailureReason` four-way mirror in `packages/core/src/handoff/types.ts`).

**Rule of thumb before writing a comment:** if the "why" is the task ticket, a review suggestion, or a spec paragraph, put it in the PR body and leave the code alone. If it's a permanent structural reason a future reader would stub their toe on, write the permanent reason without the dated pointer.

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full system design (CRDT bridge, observers, markdown pipeline)
- [`PRECEDENTS.md`](./PRECEDENTS.md) — 27 numbered architectural precedents + rationale
- Per-package docs — [`packages/server/README.md`](packages/server/README.md), [`packages/desktop/README.md`](packages/desktop/README.md), [`packages/core/src/bridge/README.md`](packages/core/src/bridge/README.md), `packages/core/tests/{health,perf}/README.md`, `packages/app/tests/perf/README.md`
- [`reports/CATALOGUE.md`](reports/CATALOGUE.md) — ~130 prior-art research reports
- `specs/` — per-feature specs (e.g. `2026-04-14-bridge-convergence-under-concurrent-writes/`, `2026-04-16-bridge-correctness/`, `2026-04-18-agent-identity-attribution-foundation/`, `2026-04-19-ci-signal-quality/`, `2026-04-21-agent-write-summaries/`)
- `stories/`, `projects/`, `strategy/` — product planning surfaces

<!-- open-knowledge:begin -->

## Open Knowledge

This repo uses Open Knowledge — collaborative markdown via MCP. **`.open-knowledge/config.yml`** (with optional `~/.open-knowledge/config.yml`; CLI/env may override) is the **path contract**: `content.dir` is the root for relative paths; `content.include` lists globs that **add** markdown; `content.exclude` lists globs that **remove** paths. Nothing else defines scope — not folder names, not "docs vs code." `.gitignore` still applies. When MCP is connected, the server's instructions echo the **resolved** `dir` / `include` / `exclude` for this session — treat that table and the YAML as two views of the same rules.

**Default mental model (no jargon):** unless this project narrowed `content.include`, **every `.md` and `.mdx` under `content.dir`** is an Open Knowledge document — including under `specs/`, `reports/`, `docs/`, etc. If `content.include` is non-default, read `config.yml` once per turn so you do not mis-classify paths.

**STOP — your host's built-in file tools on in-scope `.md` / `.mdx`.** When this workspace has Open Knowledge MCP configured (for example via root `.mcp.json`), you **must not** reach for native tools on in-scope markdown. Same failure mode as native `Edit` on them: no frontmatter, no backlinks, no shadow-repo activity, no recent-edit signal. The ban is broader than just `Read` / `Grep` / `Glob` — it names every common rationalization:

- **Native `Read` / `Grep` / `Glob` on in-scope `.md` / `.mdx`** — the original case.
- **`Bash ls` / `Bash find` / `Bash cat` on dirs containing in-scope markdown** — use `exec("ls …")` / `exec("find … -name '*.md'")` / `exec("cat …")` instead. Native returns bare names; `exec` returns frontmatter, backlink counts, and recent-activity per child.
- **Glob patterns that target markdown** (`**/*.md`, `**/SPEC.md`, or any dir known to be markdown-heavy like `specs/**`, `reports/**`, `stories/**`, `projects/**`, `docs/**`) — use `exec` with `find`, or `list_documents({ dir })`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native `Read` / `Grep` / `Glob` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via `exec` / `search`. Subagents remain appropriate for **source-code** exploration (`.ts`, `.py`, configs, etc.).

**MCP wiring varies by client:** Claude Code, Codex, Cursor, Windsurf, VS Code–class clients, and others surface MCP differently — server labels are user-defined; tools may not appear as a top-level symbol named `exec`. **If Open Knowledge is registered**, route markdown reads through its `exec` / `search` / `read_document` tools using **your client's documented MCP invocation** (including any generic "call MCP tool" flow). **That counts as available.** Not seeing `exec` in a flat tool list is **not** the escape hatch.

**Escape hatch (narrow).** Native `Read` / `Grep` / `Glob` on `.md` / `.mdx` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you **tried** an MCP call and it failed — then start a user-visible sentence with `Open Knowledge MCP unavailable:`. Never use the hatch because you skipped your client's MCP path.

**Reads and searches on markdown:** Open Knowledge `exec` (or `read_document` / `search`) — same payloads whether your client invokes them directly or through MCP. Examples: `exec("cat docs/auth.md")`, `exec("ls reports/")`, `exec("grep -rn karpathy specs/ | head -10")`.

**Listings too.** `exec("ls <dir>/")` is how you list a directory — it returns per-child frontmatter, recursive markdown counts, and the most-recently-updated doc per subdir. Plain `Bash ls` returns just names.

**Anti-patterns at a glance:**

| Task                            | Don't                     | Do                                             |
| ------------------------------- | ------------------------- | ---------------------------------------------- |
| List a markdown-heavy dir       | `Bash: ls specs/`         | `exec("ls specs/")`                            |
| Find all SPEC.md files          | `Glob: **/SPEC.md`        | `exec("find specs -name SPEC.md")`             |
| Summarize specs across the repo | `Agent(Explore): "…"`     | `exec("head -25 specs/*/SPEC.md")` + `search`  |
| Search a phrase across markdown | `Grep: "pattern" *.md`    | `search({ query: "pattern" })`                 |
| Read an individual spec         | `Read: specs/foo/SPEC.md` | `read_document({ path: "specs/foo/SPEC.md" })` |

**Source code and everything else** (`.ts`, `.py`, `package.json`, …): native `Read` / `Grep` / `Glob`.

**Writing.** Edits to in-scope `.md` / `.mdx` go through `write_document` / `edit_document` only. Native `Edit` / `sed` land as anonymous `file-system` writes (classified writer per precedent #25) — you lose per-agent attribution in the shadow repo.

**Preview before edit (REQUIRED).** You MUST follow this sequence every time you call `write_document` or `edit_document`:

1. Call `get_preview_url` to obtain the browser URL for the target doc.
   - If it returns `null`, the server is not running. Start it with `open-knowledge start` (or `preview_start`), then call `get_preview_url` again — the server writes a lock file that this tool reads.
   - NEVER guess or manually construct the preview URL — always use the URL returned by `get_preview_url`.
2. Open that URL in your preview browser so the user can see the document.
3. Only then call `write_document` / `edit_document` — the CRDT edit will stream live into the already-open editor.

NEVER call `write_document` or `edit_document` without first navigating the preview browser to the doc. The user expects to watch every edit land in real time. Write-tool responses include `previewUrl` (when resolvable) and a `warning` when no client is currently attached to the doc.

**No screenshots after edits.** Do NOT take `preview_screenshot` after every `edit_document` / `write_document`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

**Linking.** When authoring, link liberally with `[[Page Title]]` wiki-links. Redlinks are fine — they signal "this should exist." Every noun-phrase naming another document should be a link. Backlink density is how this knowledge base stays navigable for the next agent.

**Cadence — maintain hubs as you go.** When you create or edit a child doc in a folder that has a hub doc (`INDEX.md`, `README.md`, `REPORT.md`, `SPEC.md`, or a file whose name matches the folder name — e.g. `reports/r1/r1.md`), update the hub to reflect the change before the next child. Interleaved child → hub → child → hub makes the hub the live progress bar and the browser-based editor follows your focus cleanly. Orphan writes get a soft hint in the `write_document` response pointing to the likely hub.

**Server must be running.** If `write_document` or `edit_document` returns a "Hocuspocus server is not running" error, start it with `open-knowledge start` (via Bash) and retry. NEVER fall back to native `Edit` / `Write` for in-scope markdown — always use the MCP write tools so edits go through the CRDT layer with proper attribution.

**Non-markdown files.** Use native `Read` / `Edit` / `Grep` / `Bash` for source code, configs, and anything outside the path contract in `config.yml`: under `content.dir`, matching `content.include`, not removed by `content.exclude` or `.gitignore`.
<!-- open-knowledge:end -->
