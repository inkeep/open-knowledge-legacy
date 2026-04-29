# Open Knowledge

Bun monorepo (`bun@1.3.13`) — CRDT collaboration server + editor, packaged as `@inkeep/open-knowledge` CLI.

This file is the agent-facing index. It names the load-bearing commands, STOP rules, and conventions. **Depth lives elsewhere**: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PRECEDENTS.md`](./PRECEDENTS.md), per-package READMEs, `specs/`, and `reports/`. Follow the pointers — don't re-derive them from this file.

## What belongs in this file

This file loads on every agent session — every byte trades against instruction adherence. **Hard cap 40,000 chars (pre-commit errors); soft warning at 35,000.** Per-section research + audit: [`reports/agents-md-size-reduction/REPORT.md`](reports/agents-md-size-reduction/REPORT.md).

Before adding anything, ask: *would removing this cause an agent to make a mistake a linter can't catch?* If yes, inline. If no, link out — point, don't embed. (`@path` imports do **not** save context — they expand at load time. Use prose references.)

**Inline:** STOP / WARN rules that fire repo-wide; canonical commands; repo-wide conventions (ESM, Biome, `workspace:*`); one-paragraph package and editor-substrate orientations; names of architectural invariants the user must hold while editing; "use Y not X" tool-routing guidance.

**Reference (don't embed):** subsystem deep dives → `ARCHITECTURE.md`; precedent enumerations + rationale → [`PRECEDENTS.md`](./PRECEDENTS.md); per-package internals → `packages/<pkg>/README.md`; tutorials, step-by-steps, code examples → a skill, or the relevant `tests/README.md`; spec text, decision logs, NG enumerations → the spec directory.

Stop signs this file is growing wrong: status banners ("M3 shipped"), milestone checklists, post-mortem narrative ("we got burned by …"), full enumerations (every endpoint, every `D#`, every `NG#`), tutorial-form code examples, multi-paragraph rationale for a single rule (move it to a comment at the protected call site).

When you add a STOP / WARN rule, delete the rule it absorbs — net char delta should approach zero on routine maintenance.

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
bun run notices                      # Regenerate THIRD_PARTY_NOTICES.md (drift-checked in `bun run check`)

cd packages/app && bun run dev       # Dev server (Vite + Hocuspocus on 5173)
cd docs && bun run dev               # Docs (Next.js + Fumadocs)
bun run --filter=@inkeep/open-knowledge-desktop dev   # Electron dev (macOS)
cd packages/<pkg> && bunx tsc --noEmit && bun test    # Per-package
```

**`bun run check` is the canonical agent gate.** Run it after every iteration. It composes `biome check .` + turbo's `typecheck test test:integration test:conversion test:fidelity`. Each tier has an independent cache key — warm replay is <50ms. It does **not** include Playwright E2E; use `check:full:parallel` when your PR touches `packages/app/tests/stress/*.e2e.ts`. CI's `test:e2e` runs a fixed 6-file subset (see `packages/app/package.json`), which can diverge from `bunx playwright test`.

**CI tiers** (workflows in `.github/workflows/`): Tier 1 `ci.yml` (every PR + push to `main`: lint/typecheck/unit/integration/conversion/fidelity + Playwright E2E, 15 min); Tier 2 `nightly.yml` (workflow\_dispatch — perf regression, parse-health, R15 guard); Tier 3 `weekly.yml` (workflow\_dispatch — 10K-sample PBT under `STRESS_FIDELITY=1`, perf-trend artifact). Scheduled triggers are retired while pre-production — re-enable criteria in [`specs/2026-04-19-ci-signal-quality/SPEC.md`](specs/2026-04-19-ci-signal-quality/SPEC.md).

**PR-tier has `failOnFlakyTests: false`** — retry-success does NOT promote to red. Persistent-flake detection is the job of `.github/workflows/nightly-e2e-stability.yml` (09:00 UTC, `--repeat-each=3 --workers=1`; auto-opens an issue labeled `e2e-flake`).

**Architectural CRDT residual is NOT a CI signal.** Dual-CRDT topology has an intrinsic \~2-3% per-seed merge residual (D4-LOCKED until H2 2026+). Fuzz + stress (`bridge-convergence.fuzz.test.ts`, `server-authoritative-stress.test.ts`) preserved but invoked ad-hoc via `bun run measure:fuzz` / `measure:stress`; results append to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`. Run before merging a PR that touches `packages/server/src/server-observers.ts`, `packages/core/src/bridge/**`, or Y.js/Hocuspocus deps.

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

36 numbered rules (with #29 retracted 2026-04-23 — slot preserved to keep citations stable) govern how work lands here; code cites them as `precedent #N` across ~50 sites. **Canonical source: [`PRECEDENTS.md`](./PRECEDENTS.md)** — read the relevant entry before touching a cited site or adding a new pattern that sits alongside one.

## Packages

**`core`** — shared extensions, markdown pipeline, pure utilities. Browser+Node compatible (no React, no server deps). Key constraint: `sharedExtensions` (in `src/extensions/shared.ts`) MUST stay in sync between core/server/app — drift causes silent data corruption. Markdown pipeline details: see [Markdown Pipeline](#markdown-pipeline) below.

**`server`** — Hocuspocus CRDT server library: persistence, file-watcher, agent sessions, shadow repo, HTTP API, server-authoritative observer bridge, CC1 broadcast, agent-presence map, server-instance-ID authority signal. See [`packages/server/README.md`](packages/server/README.md). Canonical boot entry point is `bootServer()` in `packages/server/src/boot.ts` (called by CLI `ok start`, Electron utility, `bunServer` path). Server lock at `<contentDir>/.open-knowledge/server.lock` prevents multi-server-per-contentDir collisions. Shadow repo at `<projectRoot>/.git/open-knowledge/` stores per-writer WIP refs + upstream-import + checkpoint — writer-ID taxonomy (precedent #25) has five categories: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. CRDT restart recovery is client-side; see Client-side Yjs persistence below.

**`cli`** — Commander.js v14 CLI published as `@inkeep/open-knowledge`; two bins (`open-knowledge` + `ok`). Commands: `ok start | init | mcp`. Hierarchical YAML config in `.open-knowledge/config.yml` (precedence: flags > env > workspace > user > defaults). MCP stdio server auto-discovers the running Hocuspocus port via `server.lock`. Distribution strategy: [`specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md`](specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md).

**`app`** — React editor frontend: TipTap WYSIWYG + CodeMirror source mode, real-time CRDT collaboration. Dev mode (`bun run dev`) serves Vite + Hocuspocus on port 5173 from one process via `packages/app/src/server/hocuspocus-plugin.ts` — shares the same `server.lock` as `open-knowledge start`, so both against the same contentDir is mutually exclusive.

**`desktop`** — Electron macOS app (`@inkeep/open-knowledge-desktop`, private). Windows/Linux parity deferred. See [`packages/desktop/README.md`](packages/desktop/README.md). Process model: one editor `BrowserWindow` ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir`. IPC discipline: never `ipcMain.handle`/`ipcRenderer.invoke` directly — always via `createHandler`/`createInvoker` from `src/shared/ipc-*.ts` (Biome GritQL rule `no-loosely-typed-webcontents-ipc` enforces).

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

| Surface                  | → Y.Text                | → XmlFragment           | → Disk               |
| ------------------------ | ----------------------- | ----------------------- | -------------------- |
| W1 WYSIWYG (XmlFragment) | Server Observer A       | (direct)                | Persistence debounce |
| W2 Source (Y.Text)       | (direct)                | Server Observer B       | Persistence debounce |
| W3 Agent API             | applyAgentMarkdownWrite | applyAgentMarkdownWrite | Persistence debounce |
| W4 Disk (file watcher)   | applyExternalChange     | applyExternalChange     | (direct)             |
| W5 Agent Undo            | applyAgentUndo          | applyAgentUndo          | Persistence debounce |

**Full observer design** (server-authoritative Path A/B, settlement dispatch via `afterAllTransactions`, origin-guard truth tables, paired-write markers, `applyAgentMarkdownWrite` reference implementation): [`ARCHITECTURE.md`](./ARCHITECTURE.md) + the four spec directories under `specs/2026-04-1[4-6]-*/`. `packages/server/src/server-observers.ts` is the canonical implementation.

**Agent-write attribution** — every mutating POST handler in `api-extension.ts` calls `extractAgentIdentity(body)` at entry before any Y.Doc mutation (FR-5, D42, precedent #24). Meta-test at `packages/app/tests/integration/attribution-sweep-coverage.test.ts` scans the route registry and fails if a handler omits it or is missing from the allowlist. Writes use `session.dc.document.transact(fn, session.origin)` — the per-session frozen origin object (precedent #24, D32).

**Agent presence** lives on `__system__` Y.Doc awareness as a map-valued `agentPresence: Record<agentId, AgentPresenceEntry>` (see `packages/server/src/agent-presence.ts`). Per-doc awareness would stomp across concurrent agents — each Hocuspocus `Document` has one shared `Awareness` with a single `clientID`. Cleanup is deterministic via the MCP keepalive WS (`/collab/keepalive` handler in `boot.ts`). Metrics at `GET /api/metrics/agent-presence` (diagnostic-only; clients don't poll).

**CC1 push-over-awareness** — pure-signal push primitive for derived views. Contract v1: `{v:1, ch:string, seq:number}`. 100 ms trailing-edge debounce per channel. Emitter: `packages/server/src/cc1-broadcast.ts`. Subsystems keyed off `documentName` MUST short-circuit via `isSystemDoc()` (STOP rule below). Channels: `server-info` (instanceId+branch), `branch-switched` (clients clear IDB + recycle), `disk-ack` (per-doc SV watermark for mismatch-recycle baseline-selection), `files`/`backlinks`/`graph` (derived-view invalidation). Client-side persistence + restart-recovery topology: see [`packages/server/README.md`](packages/server/README.md) §"CRDT server-restart recovery".

## Testing

**Naming convention.** `*.test.ts` for Bun (unit, integration, stress). `*.e2e.ts` for Playwright. **Never use `*.spec.ts`** — Bun auto-discovers both and causes collisions (Playwright's `test()` throws outside the Playwright runner).

**Layers.**

| Layer       | Scope                                         | Command                                                  |
| ----------- | --------------------------------------------- | -------------------------------------------------------- |
| Unit        | Per-package `*.test.ts`                       | `bun test` (per package) or `bun run test`               |
| Integration | Bridge matrix + C1-C10 server-authoritative   | `bun run test` (turbo task `test:integration`)           |
| Fidelity    | PBT invariants I1-I11 + handler PBTs + corpus | `bun run test:fidelity`                                  |
| E2E         | Playwright                                    | `bun run test:e2e` (CI subset) or `bunx playwright test` |
| Ad-hoc      | Fuzz / stress (architectural residual)        | `bun run measure:fuzz` / `measure:stress`                |

**Integration harness** at `packages/app/tests/integration/test-harness.ts` exposes `createTestServer`/`createTestClient(s)`/`assertAllConverged`/`attachBridgeInvariantWatcher`/`createItemOriginProbe`/`getServerState`/`awaitDocQuiescence`. Use per-test docNames (auto-generated `test-${randomUUID()}`) so tests run concurrently. Network control: `network-control.ts` (`ControllableWebSocket`, `client.pauseSync()`/`resumeSync()` via `syncControl: true`).

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
- **VITE\_PORT** env var for custom port (`VITE_PORT=9999 bun run dev`, strict). Default 5173 (not strict).

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
- **Server-side disk writes go through `fs-traced.ts` wrappers.** Use `tracedWriteFile` / `tracedRename` / `tracedMkdir` / `tracedUnlink` (+ `*Sync`) from `packages/server/src/fs-traced.ts` rather than importing raw `node:fs` write functions in production paths — every disk write needs an `fs.*` span with bounded-cardinality attributes. `@opentelemetry/instrumentation-fs` does not work on Bun (oven-sh/bun#6546). Test-only code is exempt.
- **Don't emit unbounded-cardinality span/metric attributes.** Raw paths, document content, and free-form user strings on histograms or high-volume span attributes blow up Tempo's index and Prometheus label storage. Normalize first: paths → `normalizeFsPath` + `classifyFsPath` from `fs-traced.ts` (last-two-segments + role); identifiers → pre-validated UUIDs / enums. Safe pre-normalized span attrs: `doc.name`, `shadow.writer`, `agent.write_position`, `http.route`.
- **Client-persistence ordering on `server-instance-mismatch`:** buffer → `clearData()` → `recycleAllEntries`. Reversing duplicates (stale IDB + new clientID → markers twice). Auth-token Zod-validated via `parseHocuspocusAuthToken`. Ref: `provider-pool.ts`.
- **No OK sidecars in user-content paths.** OK state lives in `<contentDir>/.open-knowledge/`; no `.frontmatter.yml`, no per-doc sidecars, no `_meta.json` / `_index.md`. Writes via `applyAgentMarkdownWrite` / `applyAgentUndo`. Spec: [`specs/2026-04-25-config-edit-paths/SPEC.md`](specs/2026-04-25-config-edit-paths/SPEC.md).
- **`ConfigSchema` leaves: `.register(fieldRegistry, ...)` BEFORE `.default()`/`.optional()`/`.nullable()`.** Zod v4 wrappers drop `_zod.parent`; metadata binds to the wrapper, not the leaf. Use the `@inkeep/open-knowledge-core` singleton; coverage test enforces.

## WARN rules

- Markdown round-trip isn't always stable. `## H\nP` normalizes to `## H\n\nP`. Check `serialize(parse(md)) !== md` to find normalizing constructs.
- Observer A's `lastSyncedXmlMd` must refresh on ALL XmlFragment changes, not just user edits. Stale baseline → incorrect diffs → content loss.
- Layer A unit tests use `transaction.local=true` — NOT the same code path as production (`local=false` on WebSocket updates). Relying only on unit coverage misses remote-peer divergence.
- `hocuspocus.configure({ extensions: [...] })` REPLACES the extensions array (object spread). Use `hocuspocus.configuration.extensions.push()` to add without losing existing.
- TipTap's `editor.view` is a throwing proxy before ProseMirror mount. Touching `editor.view.dom` during recycle/remount crashes the nearest ErrorBoundary with "Unknown error". Use `editor.editorView` (non-throwing alternative) and subscribe to `'create'` before accessing `view.dom`. Reference: `packages/app/src/editor/TiptapEditor.tsx`.
- React 19.2 `<Activity mode="hidden">` unmounts the hidden subtree's DOM. Scroll containers that wrap multiple Activity mounts lose `scrollTop` on every flip. **Each Activity mount must own its own scroll container** — see `EditorActivityPool.tsx` + `ScrollPreservingContainer`.
- Playwright's `_electron.launch({ args: [url] })` does NOT fire the macOS `open-url` Apple Event — URL arrives via `process.argv` (second-instance path only), NOT the cold-start queue-then-flush. Tests that need true Apple-Event delivery must shell out to `execSync('open -g "openknowledge://..."')`. Reference: `packages/desktop/tests/smoke/deep-link.e2e.ts`.
- `syntaxTreeAvailable()` from `@codemirror/language` reflects the DEEPEST pending sublanguage, not the outer markdown tree. Gating decorations on it silently disables them whenever a fenced-code language block enters the viewport. For ViewPlugin: detect `syntaxTree(update.startState) !== syntaxTree(update.state)`. For StateField: early-return on `!tr.docChanged`. Reference: `packages/app/src/editor/source-polish/`.
- `OTEL_SDK_DISABLED` follows OTel convention — only the literal `"false"` enables the SDK; `"true"`, `"1"`, empty, unset all keep it disabled. Frontend gate `VITE_OTEL_ENABLED` is the inverse (must be `"true"`) and is a Vite build-time env — set it before `bun run dev` starts.
- `bun run dev` gets OTel for free: the dev plugin's `createServer()` call internally runs `initTelemetry()`. Don't re-add a separate `initTelemetry()` call in the plugin — redundant no-op.
- Buffer-and-replay on `server-instance-mismatch` is memory-only: tab crash mid-recycle loses the buffer; the null-SV guard discards unacked state by design.

**Logging conventions.** Two `console.warn` styles coexist: (1) bracket-prefix (`[file-watcher] ...`) for ad-hoc ops warnings read by humans; (2) structured JSON (`console.warn(JSON.stringify({event, ...}))`) for events counted in aggregate or asserted in tests. Don't convert one to the other without knowing the consumers.

## Observability (OpenTelemetry)

Opt-in, dev-focused. Default builds: SDK disabled on the server (`OTEL_SDK_DISABLED=false` enables — note the literal-string sentinel, see WARN rules), bundle-eliminated on the frontend (`VITE_OTEL_ENABLED=true` enables; build-time env). Zero overhead when off.

**Local stack + getting started:** [`docker/otel-dev/README.md`](docker/otel-dev/README.md). Compose the LGTM stack (Grafana + Tempo + Loki + Prometheus + OTel Collector); collector listens on `14318` (HTTP) / `14317` (gRPC), Grafana on `3001`. Browser → fetch → HTTP server span → agent-write → persistence → `fs-traced` writes → shadow-repo all chain into one Tempo trace. Pino logs carry `trace_id` / `span_id` for trace↔log correlation.

**Canonical sites.** SDK init + `withSpan` / `getMeter` helpers: [`packages/server/src/telemetry.ts`](packages/server/src/telemetry.ts). The only sanctioned path for `fs.*` spans: [`packages/server/src/fs-traced.ts`](packages/server/src/fs-traced.ts) (`tracedWriteFile` / `tracedRename` / `tracedMkdir` / `tracedUnlink` + `*Sync` variants; reuse its `normalizeFsPath` + `classifyFsPath` to keep cardinality bounded). Lazy browser SDK: [`packages/app/src/telemetry-impl.ts`](packages/app/src/telemetry-impl.ts). Hocuspocus WS trace propagation (query-param, since the browser `WebSocket` API can't set headers): [`packages/app/src/editor/collab-otel.ts`](packages/app/src/editor/collab-otel.ts).

**Adding a span / metric:** wrap the call site with `withSpan('my.operation', { attributes }, async () => { … })`; for disk writes use the `traced*` wrappers; namespace repo-specific attributes / metrics under `ok.*` / `agent.*` / `shadow.*` / `persistence.*` / `doc.*` and follow OTel semconv for `http.*` / `fs.*` / `db.*`. Cardinality discipline is the STOP rule above; HTTP-initiated paths inherit `traceparent` automatically via `onRequest`, WS-initiated paths are independent roots.

Full PRD + scope-expansion amendment §17 (the full-chain scope): [`specs/2026-04-09-otel-instrumentation/SPEC.md`](specs/2026-04-09-otel-instrumentation/SPEC.md).

## Symlinks

Symlinks inside content directories are supported. Realpath-based identity (file watcher indexes by canonical path; two paths resolving to the same inode share a Y.Doc). Atomic writes resolve `realpath(requestedPath)` then place the tmp file next to the canonical target. Escape-safe: realpath outside `contentDir` → refuse with `symlink-escape`. Full edge-case catalog: [`reports/symlink-handling-file-sync-crdt/REPORT.md`](reports/symlink-handling-file-sync-crdt/REPORT.md).

## Markdown pipeline

`unified + remark` for parsing + serialization; `@handlewithcare/remark-prosemirror` (pinned `0.1.5`, patched) bridges mdast ↔ ProseMirror. Two post-parse phases: Phase A restores PUA sentinels, Phase B dispatches autolink-promotion + doc-start-thematic-fix + position-slice + unknown-mdast-guard in one `unist-util-visit`. Handler tiers: A passthrough / B fidelity / C custom. Pinned + patched dependencies fail-loud via `patchedDependencies`.

**Schema names are mdast-canonical:** `strong` (not bold), `emphasis` (not italic), `thematicBreak` (not horizontalRule). Unified `list` + `listItem`.

**Upgrade protocol.** Before bumping any markdown dependency: re-run the 118-case fidelity probe at `tech-probes/r1-preflight-gate/` and the full invariant suite (`bun run test:fidelity`). Verify both remark-prosemirror patch hunks still apply cleanly.

Full pipeline design, file-by-file mapping, and handler tier listings: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md`](specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md), and `packages/core/src/markdown/*`.

### Storage-layer fidelity contract

**Storage never sanitizes; render-time layers do.** Raw HTML, backslash escapes, literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline).

**Invariants I1-I11** (PBTs in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`; I11 at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts`) cover identity, character preservation, normalization canonicality, idempotence, Layer A===B, multi-client preservation, cross-path consistency, crash resistance + guard completeness, and R23 guard precision. Six handler-specific PBTs (emphasis, backslash, list-nesting, html-block-edge, link-edge, image-edge) target bug shapes characterized in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r6-failure-modes.md`.

**Irreducible gaps (NG1-NG11).** Round-trip drops blank-line counts, GFM table column widths, math/footnotes/alerts, non-ambiguous `\foo` backslashes; storage never sanitizes HTML; entity refs decode literal; MDX `---` inside JSX is thematicBreak; block GFM inside inline `<Note>` flattens; U+E000–U+E004 PUA reserved as R23 guard sentinels; doc-start `---` → `***`; ignore-typed-only docs get a synthesized empty paragraph. Full enumeration: [`specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md`](specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md).

## Code style

- **React Compiler is enabled.** Do NOT add `forwardRef`, `memo`, `useMemo`, or `useCallback` — rely on the compiler unless a maintainer explicitly requests an exception.
- Use `use()` instead of `useContext()` (React 19).
- Prefer Tailwind `className` over inline `style` props.
- Prefer existing shadcn components over custom primitives. If the needed shadcn component isn't installed, suggest installing it.

### Comment discipline (code comments, not docs)

Comments explain the non-obvious **why** — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment wouldn't confuse a future reader, don't write it. Well-named identifiers explain the **what**; don't duplicate them in prose.

**Don't cite the process that produced the code.** Spec paths, internal decision numbers (`D5`, `LOCKED`, `NOT NOW`, …), non-goal tags (`NG2`), AC / US / FR numbers, audit-finding IDs (`DC-M4`, `Mutation H`), dated audit-trail narratives ("post-ship amendment", "Per 2026-04-21 review"), and feature-work / milestone tags (`M3`, `V0-14`) all rot. They belong in the PR body or commit message, not source. When one appears next to substance worth keeping, strip the citation and keep the substance; when the whole comment only exists to cite, delete it.

**Exempt — keep these:** STOP / WARN rules and cross-file contracts (already codified above); external standards with stable numbering (`CommonMark §2.4`, `RFC 3986`, upstream issue numbers like `electron/electron#32600`); `precedent #N` references (target [`PRECEDENTS.md`](./PRECEDENTS.md), an intentionally long-lived rulebook); explicit drift warnings between sibling source files when TypeScript can't catch the divergence (e.g. the `HandoffFailureReason` four-way mirror in `packages/core/src/handoff/types.ts`).

Rule of thumb: if the "why" is the task ticket, a review suggestion, or a spec paragraph, put it in the PR body and leave the code alone. If it's a permanent structural reason a future reader would stub their toe on, write that reason without the dated pointer.

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full system design (CRDT bridge, observers, markdown pipeline)
- [`PRECEDENTS.md`](./PRECEDENTS.md) — 36 numbered architectural precedents + rationale
- Per-package docs — [`packages/server/README.md`](packages/server/README.md), [`packages/desktop/README.md`](packages/desktop/README.md), [`packages/core/src/bridge/README.md`](packages/core/src/bridge/README.md), `packages/core/tests/{health,perf}/README.md`, `packages/app/tests/perf/README.md`
- [`reports/CATALOGUE.md`](reports/CATALOGUE.md) — \~130 prior-art research reports
- `specs/` — per-feature specs (datestamped subdirs)
- `stories/`, `projects/`, `strategy/` — product planning surfaces

## Open Knowledge MCP

This repo's `.md` / `.mdx` files (under `content.dir`, matching `content.include`, not in `content.exclude` or `.gitignore` — see [`.open-knowledge/config.yml`](.open-knowledge/config.yml); default `**/*.md` under `.`) are CRDT documents. When the Open Knowledge MCP server is registered for this project, route reads, listings, searches, and writes through its tools — never native `Read` / `Grep` / `Glob` / `Edit` / `Bash ls|find|cat|sed`. Native bypasses lose attribution (writes land as anonymous `file-system` per precedent #25), miss frontmatter / backlinks / recent-edit signal, and break the live preview the user is watching. MCP wiring varies per host (Claude Code / Codex / Cursor / Windsurf / VS Code–class) and tools may not appear as a top-level `exec` symbol — use the host's "call MCP tool" flow; that still counts as available.

| Task                            | Native (don't)            | OK MCP (do)                                    |
| ------------------------------- | ------------------------- | ---------------------------------------------- |
| List a markdown-heavy dir       | `Bash: ls specs/`         | `exec("ls specs/")`                            |
| Find all SPEC.md files          | `Glob: **/SPEC.md`        | `exec("find specs -name SPEC.md")`             |
| Summarize specs across the repo | `Agent(Explore): "…"`     | `exec("head -25 specs/*/SPEC.md")` + `search`  |
| Search a phrase across markdown | `Grep: "pattern" *.md`    | `search({ query: "pattern" })`                 |
| Read an individual spec         | `Read: specs/foo/SPEC.md` | `read_document({ path: "specs/foo/SPEC.md" })` |
| Edit / create a markdown doc    | `Edit` / `Write` / `sed`  | `edit_document` / `write_document`             |

Subagents (`Explore`, `general-purpose`) use native tools internally and bypass MCP — keep markdown exploration on the main thread; subagents remain appropriate for `.ts` / `.py` / config exploration.

**`docName` argument is extension-less.** `write_document({ docName: "foo" })` writes `foo.md`; passing `"foo.md"` produces `foo.md.md`.

**Escape hatch (narrow).** Native tools on in-scope `.md` / `.mdx` are allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after an MCP call you tried failed. In the latter case, prefix a user-visible sentence with `Open Knowledge MCP unavailable:` so the bypass is auditable. Don't take the hatch because you skipped the client's MCP path.

**Server-running fallback.** If a write returns "Hocuspocus server is not running", start it with `open-knowledge start` (via Bash) and retry — never fall back to native `Edit` for in-scope markdown.

**Preview — open once if the server asks.** The user watches edits land in a browser preview. After a write, the response carries `previewUrl`; only when `warning: { action: "attach-preview-once" }` is also present is no browser attached. Open it then, one-shot (Claude Code Desktop: `preview_start("open-knowledge-ui")`; other hosts: their open-URL tool, or `open <url>` on macOS, or surface the URL in chat). Otherwise do nothing — server-push pushes focus to the open tab on each subsequent write. Never construct preview URLs by hand. Don't take `preview_screenshot` after each write — the CRDT response is the confirmation. Contract: [`specs/2026-04-24-preview-attach-once-per-session/SPEC.md`](specs/2026-04-24-preview-attach-once-per-session/SPEC.md) (supersedes the per-edit mandate in `specs/2026-04-15-preview-url-pre-edit/`).

**Authoring.** Wiki-link liberally: `[[Page Title]]`. Redlinks ("this should exist") are fine; backlink density is how the KB stays navigable. When you add or edit a child doc in a folder with a hub (`INDEX.md`, `README.md`, `REPORT.md`, `SPEC.md`, or a file matching the folder name), update the hub interleaved with child writes — the hub becomes a live progress bar in the preview.

Source code and everything outside the path contract: native `Read` / `Edit` / `Grep` / `Bash` as usual.
