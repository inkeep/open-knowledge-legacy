# Open Knowledge

Bun monorepo (`bun@1.3.11`) — CRDT collaboration server + editor, packaged as `@inkeep/open-knowledge` CLI.

## Monorepo Structure

```
packages/
  core/    — @inkeep/open-knowledge-core (shared extensions, types, utils)
  server/  — @inkeep/open-knowledge-server (Hocuspocus server library)
  cli/     — @inkeep/open-knowledge (published CLI + MCP)
  app/     — React editor frontend (private)
  desktop/ — @inkeep/open-knowledge-desktop (Electron app, private)
docs/      — Next.js docs site (Fumadocs)
```

## Commands

```bash
bun install                          # Install all workspace dependencies
cd packages/app && bun run dev       # Start dev server (Vite + Hocuspocus on port 5173)
cd docs && bun run dev               # Start docs dev server (Next.js + Fumadocs)
bun run --filter=@inkeep/open-knowledge-desktop dev   # Launch Electron app in dev mode (macOS)
bun run build                        # Build all packages via turbo (cli, app, docs)
bun run build:desktop                # Build desktop bundle via electron-vite (no DMG; see packages/desktop for build:mac / build:mac:unsigned)
cd packages/cli && bun run build     # Build CLI only (tsdown → dist/)
```

### Quality gates

```bash
bun run check                        # THE gate — lint + typecheck + unit + integration + fidelity (~20-30s warm)
bun run check:full:parallel          # Full suite: check + e2e (turbo parallel, ~2 min warm)
bun run lint                         # Biome check (lint + format + imports) across workspace
bun run format                       # Biome check --write (auto-fix lint + format + imports)
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck per package
cd packages/<pkg> && bun test           # Unit tests per package
```

`bun run check`** is the canonical quality gate for agents and developers.** Run it after every implementation iteration. It composes `biome check .` + `turbo run typecheck test test:integration test:conversion test:fidelity` — lint, typecheck, unit tests, integration (bridge-matrix), conversion fidelity, and round-trip fidelity invariants. Each tier has its own turbo task with independent cache keys — editing one test file re-runs only its tier, not the entire gate. Warm replay when nothing changed is \\<50ms.

**Before the final push on any PR that touches Playwright E2E test files** (`packages/app/tests/stress/*.e2e.ts`), also run `bun run check:full:parallel`. This includes `test:e2e` which runs the CI-specific Playwright file subset — `bun run check` does NOT include e2e. The CI `test:e2e` script runs a fixed list of 6 files (see `packages/app/package.json`), which is a DIFFERENT set from `bunx playwright test` (which runs all `*.e2e.ts` via `testMatch`). Changes that pass `bunx playwright test` locally can fail `test:e2e` in CI due to different parallelism profiles and CC1 broadcast cadence. The pre-push hook runs `bun run check` (fast); `check:full:parallel` is the agent/developer responsibility before the final PR push.

### CI tier structure

Three CI tiers, calibrated against measured baselines (US-016 / SPEC R9). Turbo tasks in `turbo.json` are the canonical task list; workflow files in `.github/workflows/` dispatch them.

| Tier | Cadence | Workflow | Scope | Budget |
| ---- | ------- | -------- | ----- | ------ |
| 1    | Every PR + push to `main` | `.github/workflows/ci.yml` | lint, typecheck, unit, integration, conversion, fidelity (1K PBT samples, includes bridge-observer-conversion PBT per `specs/2026-04-19-ci-signal-quality/` FR-1). Playwright E2E on `ubuntu-64gb`. No bridge fuzz or server-authoritative stress jobs — both removed from CI on 2026-04-19 per the CI signal quality spec; sampled on-demand via `bun run measure:fuzz` / `measure:stress` (see Measurement scripts section). | 15 min (p95 warm local baseline ≈ 2m30s) |
| 2    | On demand (`workflow_dispatch`) | `.github/workflows/nightly.yml` | perf regression gate (`test:perf:regression`), parse-health gate (`test:health`), `parseWithFallback` perf bound (`test:perf:fallback`), R15 guard (`test:perf:r15-guard`). Fuzz + full stress were removed on 2026-04-19 per the CI signal quality spec — sample ad-hoc via `bun run measure:fuzz` / `measure:stress`. | 30 min per job |
| 3    | On demand (`workflow_dispatch`) | `.github/workflows/weekly.yml` | elevated-sample PBT (`STRESS_FIDELITY=1` → 10K fast-check runs), perf-trend benchmark artifact upload | 60 min |

**Where to add a new test.** Tier 1 if it enforces a correctness invariant that must hold on every PR AND is deterministic (zero architectural-residual flake tolerance). Tier 2 if it's a perf / health regression gate that needs stable multi-run variance to avoid flake. Tier 3 if it's an elevated-sample PBT (10K+ fast-check runs) or a trend artifact the team reviews weekly. Tiers 2 and 3 run on-demand only — the scheduled triggers were retired while this project is pre-production (no consumer for background signal; tier-1 catches regressions at merge time). Developers fire them via the GitHub Actions UI ("Run workflow") or `gh workflow run <nightly|weekly>.yml` when stress-testing a risky change.

**When to re-enable `schedule:` triggers.** The retirement is driven by "pre-production + no consumer" — the criterion to flip it back is any of: (a) a product stakeholder (oncall, support, customer-facing team) begins consuming post-merge regression signal, (b) tier-1 green rate drops below its G1 ≥95% target long enough that trend data from the nightly becomes load-bearing for diagnosis, or (c) a new signal class lands in tier 2/3 that tier 1 provably cannot catch (e.g., long-tail perf drift). Flipping the trigger back on is a one-line YAML edit in the relevant workflow + an AGENTS.md tier table footnote recording the rationale.

**Architectural CRDT residual is NOT a CI signal.** The dual-CRDT (Y.XmlFragment + Y.Text) topology has an intrinsic three-way merge residual (D4-LOCKED in `specs/2026-04-16-bridge-correctness/` until H2 2026+). Tests that exercise that residual — `bridge-convergence.fuzz.test.ts`, `server-authoritative-stress.test.ts` — are invocable but are NOT part of any automated tier. Sample their rate via `bun run measure:fuzz` / `measure:stress`; see the Measurement scripts section below. See `specs/2026-04-19-ci-signal-quality/SPEC.md` for the full rationale (G1: PR-tier green rate ≥95% on correct code; NG6: no automated regression detection for architectural residual — accepted cost).

### Measurement scripts (ad-hoc, not CI)

Human-invoked scripts for sampling the architectural CRDT residual rate. Not part of CI. Results append to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl` — the git history of that file is the trend record.

| Script | What it measures | Typical invocation |
|--------|------------------|--------------------|
| `bun run measure:fuzz` | Bridge-convergence fuzz seed-failure rate across an arbitrary seed budget | `bun run measure:fuzz --seeds 1000 --context "pre-PR-218 baseline"` |
| `bun run measure:stress` | Server-authoritative 5-client × 30s convergence outcome for one seed | `bun run measure:stress --seed 42 --context "investigate #206"` (duration is hard-coded to 30s internally — the script accepts no `--duration` override, per "no config that lies") |

**When to run:**
- Before merging a PR that touches `packages/server/src/server-observers.ts`, `packages/core/src/bridge/**`, or Y.js / Hocuspocus deps in `bun.lock`.
- When investigating a suspected rate shift reported by a teammate.
- During bridge-correctness spec work (`specs/2026-04-16-bridge-correctness/`).

**Querying the log:** `jq` one-liners are documented in the script file headers (`packages/app/scripts/measure-fuzz.sh`, `measure-stress.sh`) and in `specs/2026-04-16-bridge-correctness/evidence/residual-measurements-SCHEMA.md`.

**Why this isn't in CI:** per NG6 of `specs/2026-04-19-ci-signal-quality/SPEC.md`, the architectural residual cannot be eliminated within the current topology and its ~2-3% per-seed rate across 75 seeds mathematically guarantees >80% PR-red on correct code if enforced. The team convention is: sample ad-hoc, commit the JSONL record as part of any bridge-touching PR, review the file's git history for trend signal. Dep-runner drift goes unnoticed until a bridge-touching PR runs the script — accepted cost.

**Perf gate calibration.** Threshold is `max(2× p99 variance, 10% absolute floor)` per block size. Baseline lives in `packages/core/tests/perf/baseline.json`. Synthetic-regression tests in `tests/perf/regression-gate.test.ts` prove the gate fires on injected slowdown.

**E2E perf baselines.** Playwright perf assertions (currently QA-022 `paste-fidelity.e2e.ts`) read `packages/app/tests/stress/perf-baseline.json`. The assertion shape is `p50 < max(2 × p50Baseline, absolute-floor)` — 2× the median locks in regression signal, the absolute floor (e.g. 32ms for 60fps frame-time) absorbs CI runner-speed variance without tripping. Baselines are captured from the **median-of-5 p50** across consecutive post-merge CI runs (never local), are append-only with git blame trail, and updates require user approval per the protocol in `packages/app/tests/stress/perf-baseline-update.md`. Follow the same shape for any future Playwright perf test — add a new top-level key (`qaXXX`) and extend the assertion; do not invent a second baseline file.

**Nightly E2E stability surveillance.** `.github/workflows/nightly-e2e-stability.yml` runs the full Playwright suite with `--repeat-each=3 --workers=1` at 09:00 UTC daily. On failure it auto-opens a GitHub issue labeled `e2e-flake` with the run URL and artifact pointers. **This is the sole flake-detection tier** — it does not block PR merges, but per `specs/2026-04-17-e2e-observability-determinism/evidence/d-q5-amendment-2026-04-19.md` it is the primary signal since PR-tier Playwright runs with `failOnFlakyTests: false` (retry-success is not promoted to red). The nightly catches slow-burn drift that PR-tier retries would absorb silently — a test that passes 99/100 accumulates a 1% tail only visible under `--repeat-each`. Label setup is one-time: `gh label create e2e-flake --color FBCA04 --description "Surfaced by Nightly E2E stability workflow"`.

### Agent simulator (requires dev server running)

```bash
cd packages/app
bun run src/server/agent-sim.ts                      # Single agent write
bun run src/server/agent-sim.ts --rapid 5            # 5 writes, 100ms apart
bun run src/server/agent-sim.ts --markdown           # Markdown write
bun run src/server/agent-sim.ts --markdown --rapid 5 # 5 markdown writes
```

## Conventions

- ESM everywhere (`"type": "module"`)
- Biome for lint/format (config at root `biome.jsonc`)
- Tests co-located with source: `foo.test.ts` next to `foo.ts`
- TypeScript strict mode, `verbatimModuleSyntax: true`
- Workspace deps use `"workspace:*"` in package.json

### Post-ship corrigendum annotations on shipped specs

When a shipped spec contains a factual claim that subsequent work proves wrong, do **not** rewrite the original prose — shipped specs are moment-in-time artifacts, and silent prose edits create drift between the spec and its surrounding evidence/changelog. Instead, append a corrigendum breadcrumb on the same line in this exact shape:

```
<original prose unchanged><br>_[Corrected YYYY-MM-DD post-ship: <one-sentence correction>. Authoritative fix in <pointer>.]_
```

Rules:
- The breadcrumb is italicized, bracketed, dated, and points at the canonical fix location (typically `AGENTS.md` plus a follow-up spec directory).
- Apply the breadcrumb to **every** occurrence of the corrected claim in the same doc — leaving one updated and another stale defeats the purpose. The second and subsequent breadcrumbs may shorten to "same correction as the breadcrumb at line N above" plus the same pointer.
- The original prose stays intact in front of the `<br>`. Never mix annotation prose into the original line.
- The follow-up spec carries the full correction rationale; the breadcrumb is a discoverability pointer, not an explanation.

Originated 2026-04-16 in `specs/2026-04-16-post-ship-docs-polish/` (D4).

### Architectural precedents (greenfield directive, 2026-04-13)

Thirty-two numbered rules govern how work lands in this repo. Code comments cite them as `precedent #N` across ~50 sites. Full rationale, enforcement, and evidence pointers live in [PRECEDENTS.md](./PRECEDENTS.md) — the list below is a jump index.

1. **Typed transaction origins** — `LocalTransactionOrigin` objects; paired-write markers opt in at definition
2. **Generic primitives over specific ones** — Name for extensibility, not first-caller
3. **Structured event schemas** — `{actor, timestamp, action, visibility}`; don't grow ad-hoc fields
4. **Shared computation, per-surface rendering** — Render-deciding logic in one module; surfaces apply only
5. **Contract-first MCP tools** — Clients conform; required params are required
6. **Mode state as enums** — No boolean flags for >2 states
7. **Remove broken capabilities rather than shipping them** — Confidently-broken UI > feature absence
8. **Long-lived identity vs session concerns** — Agent ID stable; pass boundaries ephemeral
9. **Schema is add-only forever** — Never remove/narrow PM nodes, attrs, content exprs, or mark excludes
10. **Opaque-but-content-bearing nodes for Y.Item identity** — `atom:false, content:'text*'` for raw-content atoms
11. **Minimize CRDT mutation in sync bridges** — Content-gate delete+insert; hybrid diff3+DMP; origin-aware reconciliation
12. **XmlFragment-authoritative, Y.Text mirrors** — `applyAgentMarkdownWrite` template; no rebuild-from-Y.Text
13. **Bridge invariants auto-enforced and property-verified** — Watchers + scheduler DI + structural races + fuzzer coverage gate
14. **Cross-CRDT sync is single-writer, server-side** — Client cross-CRDT write paths removed, not gated
15. **Idempotent micromark-extension attachers** — Singleton extensions; check-before-push
16. **Phase-ordered visitor dispatchers** — Split along dependency boundary when passes consume each other
17. **Byte-for-byte equivalence validators gate high-risk refactors** — One-time ratchet; delete after green
18. **Hybrid Activity + Suspense + `use(promise)`** — Subscription-source async, bounded pool, warm provider
19. **Clipboard pipeline is mdast-canonical** — All four paths route through mdast hub
20. **E2E test infrastructure conventions** — Seven sub-rules; mechanical STOP rule gate
21. **Ancestor-priority for auto-revealing tree-state derivations** — Auto-reveal + user-toggle merge shape
22. **Shell-script conventions for repo tooling** — Six sub-rules for bash library code
23. **Async socket errors at the boundary** — Classify EPIPE/ECONNRESET at upgrade; no userspace pre-filter
24. **Direct PM dispatch for nested editors** — CM-in-PM dispatches PM transactions, not y-codemirror.next direct Y.Text binding
25. **Compound components bridge via DOM data-attributes** — Tabs/Accordion state crosses NodeView portals via `data-active-tab`, not React Context
26. **All user content visible and editable** — No `display:none` on `NodeViewContent`; render failures degrade to nested CM source editor
27. **Selection state as typed PM PluginState** — `SelectionStatePlugin` is single source of truth for selection-adjacent surfaces; read-only over doc
28. **`data-*` attributes over className toggling** — Composable orthogonal runtime states via single-attribute selectors, not class combinatorics
29. **CSS custom-property tokens scoped via `[data-component-type]`** — Per-block-type visual tuning via `--*` overrides, not new class selectors
30. **Innermost-wins visible chrome via state, not `:has()`** — `data-has-child-selected` propagated by plugin store; beats `:has()` on perf + compat
31. **Floating UI for selection-anchored overlays** — `useSelectionAnchoredPopover` + `computeSelectionAnchor`; no ad-hoc `position: absolute`
32. **A11y codified in the selection plugin, not retrofitted per-block** — `role="group"`, `aria-live` announcer, forced-colors / reduced-motion from plugin + descriptor

### Resolving `bun.lock` merge conflicts

`bun.lock` is a binary-ish file that cannot be merged textually. When rebasing or merging produces a conflict in `bun.lock`, do **not** attempt to hand-edit it. Instead:

```bash
git checkout <base-branch> -- bun.lock   # accept the base branch's lockfile
bun install                              # regenerate with your branch's dependency changes
git add bun.lock
git rebase --continue                    # (or git merge --continue)
```

Where `<base-branch>` is whichever branch you're rebasing onto or merging from (e.g. `main`, `feat/init-spike`).

Bun does not yet auto-resolve lockfile conflicts (tracked in [oven-sh/bun#17717](https://github.com/oven-sh/bun/issues/17717)), so this manual step is required.

## Package: core

Shared extensions, types, constants, and pure utility functions. **No React or Node.js server dependencies** — browser + Node compatible.

- `src/markdown/` — unified + remark pipeline (see "Markdown Pipeline" below)
- `src/extensions/shared.ts` — sharedExtensions array (THE schema source of truth)
- `src/extensions/frontmatter.ts` — strip/prepend frontmatter utilities for observer sync (Y.Text ↔ Y.Map bridge)
- `src/extensions/jsx-component.ts` — JsxComponent TipTap extension (`content: 'block*'`, `isolating: true`, `defining: true`). Attrs: `componentName`, `kind`, `attributes`, `sourceRaw`, `sourceDirty`, `props`. Descriptor-dispatched at render time via the registry. Widened from atom to block container in Component Blocks v2.
- `src/extensions/jsx-inline.ts` — JsxInline PM node for inline MDX elements (`content: 'text*'`, `isolating: false`, zero attrs). Text content IS the source — no `sourceDirty`, no `sourceRaw`, no descriptor dispatch. Renders as visible inline source text in WYSIWYG.
- `src/extensions/raw-mdx-fallback.ts` — RawMdxFallback PM node for degraded MDX blocks (`content: 'text*'`, atom-false)
- `src/extensions/list.ts` — Unified list + listItem extension wrapping prosemirror-flat-list (D15)
- `src/extensions/escape-mark.ts` — EscapeMark PM mark for backslash-escape preservation (D20)
- `src/extensions/*-fidelity.ts` — Source-text fidelity extensions preserving markers, delimiters, styles, and raw forms (schema + attrs only; markdown dispatch moved to `markdown/handlers.ts`)
- `src/registry/` — Component descriptor registry subsystem (single source of truth for descriptors; `built-ins.ts` is the hand-authored manifest, `createRegistry()` returns the runtime `ComponentRegistry` with wildcard `'*'` fallback)
  - `types.ts` — `PropDef` (discriminated union: string/boolean/number/enum/reactnode) + `JsxComponentMeta` (name, props, icon, category, searchTerms, emptyChildName)
  - `built-ins.ts` — Manifest of 17 built-in component descriptors (Callout, Card, Cards, Steps, Step, Tabs, Tab, Accordions, Accordion, Files, Folder, File, ImageZoom, Banner, TypeTable, InlineTOC, Audio). Mermaid was removed 2026-04-21 (placeholder stub was non-functional — no SVG rendering); existing `<Mermaid />` content auto-converts to `rawMdxFallback` via the wildcard path. Un-defer framework at `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`.
  - `index.ts` — `createRegistry()` factory returning `ComponentRegistry` (get/set/has/entries), pre-populated with built-ins + wildcard `'*'` fallback
- `src/types/awareness.ts` — AwarenessState, AwarenessUser, ActivityEntry
- `src/constants/activity.ts` — Flash timing constants + eviction utils
- `src/constants/ok-dir.ts` — `OK_DIR = '.open-knowledge'` (canonical project-marker constant; CLI re-exports for compatibility with its existing callers, and desktop imports directly)
- `src/desktop-bridge.ts` — `OkDesktopBridge` interface — canonical shape of the Electron `window.okDesktop` surface. Documentation anchor; desktop's runtime consumer is a duplicated copy in `packages/desktop/src/shared/bridge-contract.ts` (see Package: desktop for why the duplication is deliberate)
- `src/utils/identity.ts` — getIdentity, generateRandomName, generateRandomColor

**Key constraint:** `sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption.

## Package: server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, shadow repo, and HTTP API.

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → shadow git)
├── API Extension (onRequest hook — reads file index from watcher)
├── Server Observer Extension (server-authoritative cross-CRDT sync — precedent #14)
├── Agent Sessions (DirectConnection + UndoManager per agent)
├── Content Filter (gitignore + config exclude/include filtering)
├── File Watcher (@parcel/watcher → chokidar fallback — owns in-memory file index)
├── HEAD Watcher (.git/HEAD → BatchBegin/BatchEnd lifecycle)
├── Shadow Repo (.git/openknowledge/ — attribution journal)
├── Reconciliation (three-way merge for external writes)
├── Shadow Branch GC (orphaned ref cleanup)
└── CC1 Broadcaster (pure-signal push over __system__ Y.Doc — derived-view invalidation)
```

### CC1 push-over-awareness (derived-view invalidation)

The CC1 broadcaster is the shared push primitive for derived views (file list, backlinks, future graph panels). Rather than each consumer polling its own REST endpoint, the server emits a pure signal (`{v:1, ch, seq}`) when the underlying data changes, and clients re-fetch the channel's canonical endpoint.

**Transport.** A dedicated `__system__` Y.Doc. The server pre-materializes it at startup via `hocuspocus.openDirectConnection('__system__')` so DiskEvents that arrive before any browser connects have a broadcast target. Every client opens `__system__` via `ProviderPool` on app mount; the signal is delivered via `Document#broadcastStateless(payload)`.

**Contract (v1).** `{v:1, ch:string, seq:number}`. `ch` is a flat kebab-case string (`'files'`, `'backlinks'`, `'graph'`); `seq` is per-channel monotonic from server startup. No event kind, no path, no docName — clients respond by re-fetching the channel's REST endpoint. Unknown `v` or unparseable payload: log at WARN + skip; never disconnect. See `packages/server/README.md` for the one-page contract reference.

**Coalescing.** 100 ms trailing-edge debounce per channel. A burst (e.g. `git checkout` of 200 files) collapses to a single signal.

**Channel ownership.** `ch:'files'` fires on `create | delete | rename` DiskEvents only (`update` / `conflict` do not change the file list). V0-3 will emit `ch:'backlinks'` from the backlink-index update path inside `persistence.ts`. Each channel's semantics are owned by its emitter.

**Cross-cutting skip surface.** `__system__` is not a content doc. Every subsystem that keys off `documentName` short-circuits via the single `isSystemDoc()` helper in `cc1-broadcast.ts`: persistence, file-watcher, content-filter, reconciliation, backlink-index, agent-sessions, external-change, frontmatter cache, server-observer-extension. Reserved-name policy: `ContentFilter` rejects `__system__.md` at admit time, and `POST /api/create-page` returns 400 on that name.

**Status.** Server-side primitive landed (PR #106). Client-side consumer (ProviderPool pin, `main.tsx` mount, `FileSidebar` subscriber, Playwright L2 test) lands in a follow-up.

**File discovery:** The file watcher is the single source of truth for "what content files exist." It maintains a filtered in-memory index populated at startup and kept in sync via watcher events. The documents API reads from this index (no independent filesystem walk). Filtering uses `ContentFilter` which unions `.gitignore` rules with `config.content.exclude` patterns; exclusion supersedes inclusion.

### Shadow repo & branch runtime

The shadow repo is a bare git repo at `.git/openknowledge/` (integrated mode) or `.openknowledge/` (standalone mode, no project `.git/`). It stores per-writer WIP refs, upstream-import commits, and checkpoint refs — never touches the project repo's ref namespace or object store.

**Branch-scoped state:** `reconciledBase` (the three-way merge base) is `Map<branch, Map<docName, string>>`. On branch switch, the active scope switches to the target branch's map. WIP refs are namespaced as `refs/wip/<branch>/<writer-id>`.

**Branch switch protocol:** On `BatchBegin` the server parks current Y.Doc in-memory state to shadow refs via `parkBranch()`. On `BatchEnd` with `cross-branch` kind, Y.Docs reset from disk, `reconciledBase` scope switches, and parked WIP from a prior visit is restored via three-way merge (`restoreBranchWIP`).

**Writer lock:** Only one active writer instance may mutate a given shadow root. The lock file at `<shadowDir>/lock` contains pid, hostname, startedAt, worktreeRoot. Stale locks from dead processes are auto-replaced.

### `bootServer` — canonical HTTP-wrapping entry point

`packages/server/src/boot.ts` exports `bootServer(opts: BootServerOptions): Promise<BootedServer>` — the shared wrapper that composes `createServer()`, the `node:http` listener, the server-lock port-write (`acquireServerLock` → `listen(0)` → `updateServerLockPort`), and the optional `ok ui` sibling + idle-shutdown primitives. Consumers:

- **CLI `ok start`** (`packages/cli/src/commands/start.ts`) — thin Commander wrapper. `bootStartServer` is now a delegation layer; CLI-specific concerns (MCP detached-spawn stderr capture, Commander logging, `runInit` auto-init) are layered on top of `bootServer`.
- **Electron utility** (`packages/desktop/src/utility/server-entry.ts`) — calls `bootServer({ attachUiSibling: false, idleShutdownMs: null })` so no `ok ui` sibling is spawned and the 30-minute idle-shutdown timer is not attached (D36 in the Electron spec).
- **Vite dev plugin** (`packages/app/src/server/hocuspocus-plugin.ts`) — unchanged. Calls `createServer()` directly because the Vite HTTP server already provides the listener; it does not need `bootServer`'s composition.

Opt-out flags on `BootServerOptions`:

| Flag | Default | Purpose |
|---|---|---|
| `attachUiSibling` | `true` | Auto-spawn `ok ui` when `ui.lock` is absent/stale. Electron passes `false`. |
| `idleShutdownMs` | `30 * 60 * 1000` (30 min) | Tear down the collab process after the threshold of zero WS clients. Pass `null` to disable (Electron). |
| `skipAutoInit` | `false` | Bypass `initContent` auto-scaffold of `.open-knowledge/` on first start. |

`BootedServer` returns `{ httpServer, destroy, port, ready, serverInstance, lockDir }` — the shape `bootStartServer` has always returned; renamed on extraction for canonical naming.

### Server process lock

One `createServer()` instance at a time per content directory. The lock file at `<contentDir>/.open-knowledge/server.lock` contains `{ pid, hostname, port, startedAt, worktreeRoot }`. `acquireServerLock()` runs at the top of `createServer()` before any side effects; a live same-host PID holding the lock throws `ServerLockCollisionError`, stale locks (dead PID, different host, corrupt JSON) are replaced with a warning.

`port: 0` is the sentinel for "starting, not yet bound." CLI/Vite callers invoke `updateServerLockPort(lockDir, realPort)` after `http.listen()` resolves so MCP discovery reads the real port. The mutation is ownership-guarded — a process whose pid does not match refuses to rewrite.

`bun run dev` (Vite plugin) and `open-knowledge start` share this lock, so running both against the same content directory fails the second invocation fast. Different content directories are unaffected.

**CC8 shutdown ordering.** The server lock is the LAST thing released in `destroy()`. Phase ordering: (1) stop watchers, (2) drain agent sessions, (3) L1 flush, (4) L2 flush, (5) release shadow lock, (6) release server lock. Phase 6 runs inside a `try/finally` so a mid-shutdown throw still releases the lock — otherwise the next start would see a stale lock from a process that cleanly exited.

### Symlinks

Symlinks inside the content directory are fully supported. Design rationale and edge-case catalog: [reports/symlink-handling-file-sync-crdt/REPORT.md](reports/symlink-handling-file-sync-crdt/REPORT.md).

**Realpath-based identity.** The file watcher indexes by canonical path (`realpathSync`). Two paths resolving to the same inode (e.g. `CLAUDE.md` → `AGENTS.md`) share a single Y.Doc. The `aliasMap` on `WatcherHandle` maps alias docNames to their canonical counterpart.

**Symlink-preserving atomic writes.** Persistence resolves `realpath(requestedPath)` before writing, then places the tmp file next to the canonical target. `rename(tmp, canonical)` replaces content without touching symlinks along the chain (port of the `write-file-atomic` pattern).

**Escape-safe default.** If `realpath` resolves outside `contentDir`, the write is refused with a `symlink-escape` error. No allowlist config in this iteration.

**Broken symlink fallback.** If `realpath` throws `ENOENT` (target missing), persistence falls back to a direct write at the original path, creating a regular file.

**Cyclic symlink rejection.** `ELOOP` from `realpath` is propagated as an error. The startup walk uses a `visitedInodes` set to prevent infinite directory traversal.

**UI.** Alias entries in the file sidebar show a Link2 icon badge. Hovering displays a tooltip with the target path and canonical docName.

**Windows caveat.** Symlinks on Windows require Developer Mode, but the server only reads/traverses symlinks (never creates them), so no elevated privilege is needed.

**Known non-goals:** hardlink detection, UI for creating symlinks, cross-filesystem EXDEV handling, retroactive drift scanning, git-level symlink preservation.

### API Endpoints

| Method | Path                          | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/document`               | Read live Y.Text state (bypasses persistence debounce; `?docName=` param) |
| POST   | `/api/agent-write`            | Agent write via Y.Text                                                    |
| POST   | `/api/agent-write-md`         | Agent markdown write via Y.Text (append/prepend/replace)                  |
| POST   | `/api/agent-patch`            | Targeted find/replace on live Y.Text — only matched span mutated          |
| POST   | `/api/agent-undo`             | Undo last agent edit (agent-write origin only)                            |
| POST   | `/api/agent-redo`             | Redo last undone agent edit                                               |
| GET    | `/api/agent-undo-status`      | Check canUndo/canRedo                                                     |
| POST   | `/api/test-reset`             | Reset document (E2E test isolation, `?docName=` param)                    |
| POST   | `/api/save-version`           | Save Version — project repo commit + shadow checkpoint                    |
| GET    | `/api/metrics/reconciliation` | Reconciliation counters (reconcile, conflict, batch, branch switch, park) |
| GET    | `/api/metrics/parse-health`   | Parse health counters (total, fallback, degraded blocks per doc)          |
| GET    | `/api/rescue`                 | List rescue buffers (dirty docs from deleted/branch-switched files)       |
| GET    | `/api/rescue/:docName`        | Retrieve a specific rescue buffer (text/markdown)                         |
| GET    | `/api/link-graph`             | Backlink graph with frontmatter metadata (`cluster`, `category`, `tags` on doc nodes) |

### Key files

- `src/standalone.ts` — `createServer()` factory; wires HEAD watcher callbacks (park on BatchBegin, reconcile/restore on BatchEnd)
- `src/persistence.ts` — `createPersistenceExtension()`; branch-scoped `reconciledBase` (`Map<branch, Map<docName, string>>`), batch-in-progress gating
- `src/shadow-repo.ts` — `initShadowRepo()`, `commitWip()`, `commitUpstreamImport()`, `parkBranch()`, `readParkedState()`, `saveVersion()`
- `src/shadow-lock.ts` — `acquireLock()` / `releaseLock()` for exclusive shadow-root writer access
- `src/server-lock.ts` — `acquireServerLock()` / `updateServerLockPort()` / `readServerLock()` / `releaseServerLock()` + `ServerLockCollisionError`. One server per contentDir; advertises real port for MCP discovery
- `src/process-alive.ts` — `isProcessAlive(pid)` shared between shadow-lock and server-lock
- `src/head-watcher.ts` — `startHeadWatcher()`; tracks `lastKnownBranch`, classifies `BatchKind` (within-branch / cross-branch / detached-head)
- `src/shadow-branch-gc.ts` — `gcShadowBranches()` — orphaned WIP ref cleanup with 24h grace period, branch rename detection
- `src/reconciliation.ts` — `reconcile()` — three-way merge dispatcher (noop / clean / merged / conflicts / refused)
- `src/file-watcher.ts` — `startWatcher()` + writeTracker; emits `DiskEvent` unions (create / update / delete / rename / conflict)
- `src/metrics.ts` — in-memory counters: reconcile, conflict, batch, upstreamImport, rescueBuffer, branchSwitch, park, serverObserverFiresA/B
- `src/external-change.ts` — `applyExternalChange()` (throwing) + `createExternalChangeHandler()` (error-swallowing wrapper); unified disk→CRDT bridge for both CLI and dev plugin
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/page-identity.ts` — `extractPageTitle()`, `extractFrontmatterScalar()`, `parseFrontmatterMetadata()` — regex-based frontmatter field extraction (no YAML dependency)
- `src/api-extension.ts` — HTTP API; includes save-version, rescue buffer, link-graph, and metrics endpoints
- `src/cc1-broadcast.ts` — `CC1Broadcaster` + `isSystemDoc()` helper; pure-signal push over `__system__` Y.Doc (contract v1, 100 ms debounce)
- `src/server-observers.ts` — `setupServerObservers()` + `OBSERVER_SYNC_ORIGIN`; server-authoritative Observer A (XmlFragment→Y.Text) and Observer B (Y.Text→XmlFragment) with per-document baseline. Settlement dispatch via `doc.on('afterAllTransactions', ...)` — one fire per outermost `doc.transact()` drain, Observer A before Observer B (precedent #13(b)). `onDispatch` test hook emits `ObserverDispatchKind` ('none' | 'a' | 'b') for Mutation-H validation.
- `src/server-observer-extension.ts` — `createServerObserverExtension()`; Hocuspocus extension wiring via `openDirectConnection` per-document at `afterLoadDocument`, cleanup at `afterUnloadDocument`

## Package: cli

Commander.js v14 CLI published as `@inkeep/open-knowledge`.

### CLI Commands

| Command | Description |
|---------|-------------|
| `open-knowledge` / `open-knowledge start` | Start Hocuspocus server + serve React app |
| `open-knowledge init` | Scaffold `.open-knowledge/` and register MCP server in `.mcp.json` |
| `open-knowledge mcp` | Start MCP stdio server (disk-only or connects to running Hocuspocus — port auto-discovered via `server.lock`) |

Bin names: the CLI ships two bins — `open-knowledge` (long form) and `ok` (short alias). Both point to the same entrypoint. Distribution strategy, install UX, telemetry posture, and related LOCKED / NEVER / NOT NOW decisions are codified in **`specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md`** — read it before making changes to `packages/cli/package.json` bin config, install docs, or anything telemetry-related.

### Config system

Hierarchical YAML in `.open-knowledge/` directories:

- `~/.open-knowledge/config.yml` — user-level defaults
- `./.open-knowledge/config.yml` — workspace-level overrides
- Precedence: CLI flags > ENV > workspace > user > Zod defaults

### Output & color system

- `src/ui/colors.ts` — Semantic color helpers wrapping picocolors (error, warning, success, info, dim, accent)
- `src/ui/banner.ts` — Vite-style boxed startup banner (cli-boxes + picocolors)
- Respects `NO_COLOR`, `FORCE_COLOR` env vars and `--no-color`/`--color` CLI flags per no-color.org
- Color helpers import picocolors directly; `cli.ts` propagates `--no-color`/`--color` to env vars for other libraries in the dependency tree

### Key files

- `src/cli.ts` — Commander.js entry point (shebang), early color detection
- `src/commands/start.ts` — start command (Hocuspocus + static assets + colored output); calls `updateServerLockPort` post-listen; idempotent SIGINT/SIGTERM shutdown routed through `destroy()`
- `src/commands/mcp.ts` — MCP stdio server command; `discoverServerUrl()` reads `<contentDir>/.open-knowledge/server.lock` for zero-config port discovery. Precedence: `--port` override > live lock with port > 0 > disk-only fallback
- `src/config/paths.ts` — Shared `resolveContentDir(config, cwd)` / `resolveLockDir(contentDir)` so `start.ts` and `mcp.ts` cannot disagree on where the lock lives
- `src/ui/colors.ts` — Color scheme + semantic helpers
- `src/ui/banner.ts` — Startup banner rendering
- `src/config/schema.ts` — Zod config schema with defaults
- `src/config/loader.ts` — YAML config hierarchy loader

## Package: app

React editor frontend — TipTap WYSIWYG + CodeMirror source mode with real-time CRDT collaboration.

### Editor architecture

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds here via y-codemirror.next
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution side-channel

Cross-CRDT sync (server-authoritative — precedent #14):
  Server Observer A: XmlFragment → Y.Text  (origin: OBSERVER_SYNC_ORIGIN)
  Server Observer B: Y.Text → XmlFragment  (origin: OBSERVER_SYNC_ORIGIN)
Client observers maintain baselines only — cross-CRDT write paths deleted.
```

#### Hybrid Activity + Suspense render tree (precedent #18)

Document-open UX is built on React 19.2's `<Activity>`, Suspense, `use(promise)`, `startTransition`, and `react-error-boundary` composed per precedent #18. The render tree for `EditorArea` is:

```
<EditorActivityPool>                                     ← LRU-bounded at ACTIVITY_MOUNT_LIMIT = 3
  {mountList.map(entry =>
    <Activity mode={entry.docName === activeDocName ? 'visible' : 'hidden'}>
      <ScrollPreservingContainer>                        ← per-Activity scroller (save/restore scrollTop)
        <DocumentErrorBoundary                           ← PER-ACTIVITY scoped (see below)
          activeDocName={entry.docName}
          resetKeys={[entry.docName]}
        >
          <Suspense fallback={<EditorSkeleton />}>       ← PER-ACTIVITY scoped (see below)
            <DocumentBoundary docName provider>          ← use(syncPromise(docName, provider))
              <SourceEditor .../>                        ← dual-editor concurrent mount
              <TiptapEditor .../>                          (display:none mode toggle)
            </DocumentBoundary>
          </Suspense>
        </DocumentErrorBoundary>
      </ScrollPreservingContainer>
    </Activity>
  )}
</EditorActivityPool>
```

**Why the error boundary + Suspense live INSIDE each Activity, not above the pool.** React 19.2 `<Activity mode="hidden">` silences *suspends* in the hidden subtree (by design — pending `use(promise)` calls don't trigger an ancestor Suspense fallback) but does NOT intercept *synchronous throws* from `use(rejectedPromise)`. A single global boundary above the pool lets any hidden doc's cached rejected `syncPromise` re-throw into the visible UI on every render — verified as a regression in Playwright tests QA-023 and QA-024 before refactor. Per-Activity scoping confines each error to its own subtree: hidden-Activity fallbacks render into hidden DOM (display:none via Activity) and become visible again naturally on revisit, which is exactly the UX for cached-rejection persistence. `resetKeys={[entry.docName]}` is stable per Activity instance — errors clear only via imperative "Try again" (recycle), "Back to previous" (invalidate + nav), or Activity eviction from the MRU mount list. Do not collapse this back to a global boundary.

Navigation flow: `openDocumentTransition(docName)` (from `DocumentContext`) wraps `openDocument` in `startTransition` — React keeps the previously-visible Activity entry rendered while the next one's `syncPromise` suspends, delivering content-continuity (SPEC G2). `NavigationPendingBar` (rendered in `packages/app/src/components/EditorPane.tsx` immediately under `EditorHeader`, gated on `isPending` from the shared `useTransition()`) escalates through 4 visual tiers (0–5s subtle, 5–15s visible + "Loading doc…", 15–25s "taking longer", 25–30s "Try again?") before `sync-promise.ts` hard-rejects at 30s and the ErrorBoundary takes over.

`ACTIVITY_MOUNT_LIMIT = 3` is intentionally smaller than `MAX_POOL = 10` because Y.js observers do not pause in Activity hidden mode — bounding mounted editors caps observer-CPU cost regardless of pool size. Pool-resident-but-not-mounted docs keep their warm provider for fast Suspense-gated remount (cold mount, warm content — `hasSynced=true` so `syncPromise` resolves immediately). See `packages/app/src/components/EditorActivityPool.tsx` and precedent #18(c).

### Presence & awareness

- Human cursors via CollaborationCursor (WYSIWYG) + yCollab (Source)
- Agent activity flash via Y.Map('activity') → CSS @keyframes
- Per-origin undo via server-side UndoManager
- Agent writes use `dc.document.transact(fn, 'agent-write')` (not `conn.transact()`)
- Source-mode toggle disabled when `provider.status !== 'connected'` (FR-7a) — prevents stale Y.Text display during disconnect

### Theming

Dark/light/system theme via `next-themes` (class strategy). Key pieces:

- `index.html` inline script reads `localStorage('ok-theme-v1')` and sets `.dark` before React hydrates (FOUC prevention)
- `main.tsx` wraps the app in `<ThemeProvider>` (attribute `class`, default `system`)
- `src/components/ThemeToggle.tsx` — dropdown toggle in the editor header
- `SourceEditor.tsx` uses a CodeMirror `Compartment` to hot-swap `oneDark` theme on `resolvedTheme` change
- `globals.css` defines dark overrides via Tailwind's `.dark` selector for ProseMirror content, callouts, and custom components

### Dev mode

The Vite plugin (`src/server/hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-server` — single `bun run dev` starts Vite + Hocuspocus + file watcher on port 5173. The plugin participates in the same `server.lock` as the published CLI, so `bun run dev` and `open-knowledge start` against the same content directory are mutually exclusive — the second invocation fails fast with `ServerLockCollisionError`.

### Source-view minimal polish

Small set of always-on CM6 decorations for source mode: broken-link squiggly (wikilinks + link-refs), strikethrough rendering, list hanging-indent on wrap, and code wrap-preserve-indent. Tables get structure/layout classes (hanging indent only) — no background, no border, no cell bands, no font-size/line-height change. No heading/blockquote/frontmatter decorations.

- `src/editor/source-polish/` — ViewPlugin (viewport-scoped lezer walk for strikethrough, list, fenced-code, and table decorations) + StateField (doc-wide cross-scan for broken link-ref detection; skips matches inside `FencedCode`/`CodeBlock`/`InlineCode` via the Lezer tree)
- `src/editor/markdown-code-languages.ts` — explicit `codeLanguages` allowlist for fenced-code syntax highlighting (~12 languages, lazy-loaded per block; NOT `@codemirror/language-data`)
- Broken-wikilink detection lives in `src/editor/plugins/wiki-link-source.ts` (extends the existing plugin's `pagesCache` check), not in `source-polish/`
- CSS: all `.cm-*` classes in `globals.css` under the `/* Source-view minimal polish */` comment block

### Key files

- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next; wires `createSourcePolishExtension()` + `codeLanguages` allowlist + GFM
- `src/editor/observers.ts` — Client-side observer baseline tracking (cross-CRDT write paths deleted; writes are server-authoritative per precedent #14)
- `src/editor/provider-pool.ts` — LRU-bounded HocuspocusProvider pool (`MAX_POOL = 10`); sets client-side `forceSyncInterval: 5000` (SPEC D8, secondary defense against `synced`-never-fires; primary safety net is the 30s `syncPromise` timeout); emits pool-change notifications consumed by `DocumentContext`; invalidates `syncPromise` cache entries on provider destroy/recycle
- `src/editor/sync-promise.ts` — Subscription-source async primitive (precedent #18(d)); module-level `Map<docName, CacheEntry>` cache; bridges HocuspocusProvider `'synced'` to `use(promise)`; 30s timeout → `SyncTimeoutError`, pre-sync close → `PreSyncDisconnectError`; `invalidateSyncPromise(docName)` tears down without rejecting (called by `provider-pool` on destroy/recycle and by retry); reserved `DocumentNotFoundError` for future use
- `src/editor/document-transition.ts` — Pure `createOpenDocumentTransition(openDocument, startTransition)` helper — wraps `openDocument` calls in a React transition so the previously-revealed subtree stays visible through the suspending re-render (precedent #18(f))
- `src/editor/navigation-retry.ts` — Pure `createNavigationRetryHandler({ invalidateSyncPromise, openDocumentTransition, getActiveDocName })` — composes the two-step retry contract (invalidate cached promise, then re-enter via transition) consumed by `NavigationPendingBar` tier-3 "Try again?"
- `src/editor/is-system-doc.ts` — Client-side mirror of the server's `cc1-broadcast.ts:isSystemDoc` check; `ProviderPool.open` and `EditorActivityPool` both filter via this helper (SPEC DX7 defense-in-depth)
- `src/editor/DocumentContext.tsx` — React context owning the `ProviderPool` singleton; exposes `openDocument`, `openDocumentTransition` (transition-wrapped), `isPending` (single shared `useTransition()` so every consumer of `useDocumentTransition()` sees the same pending state), `poolEntries` (MRU-sorted read-only snapshots), and `pinnedDoc`/`pin`/`unpin` for agent-nav suppression
- `src/components/DocumentBoundary.tsx` — Deliberately tiny Suspense-unwrap bridge (`use(syncPromise(docName, provider))` then render children); placed inside each `<Activity>` entry; see precedent #18(d)
- `src/components/DocumentErrorBoundary.tsx` — `react-error-boundary` wrapper scoped PER-ACTIVITY (one instance inside each `<Activity>` in `EditorActivityPool`, not a single global boundary). `fallbackRender` + `resetKeys={[entry.docName]}` (stable per Activity — never auto-resets on nav, since per-Activity scoping handles visibility). `onReset` distinguishes two imperative-api paths: "Try again" recycles the errored doc's pool entry (retry ordering load-bearing per precedent #18(e) — recycle destroys the cached rejected promise before state clears); "Back to previous" invalidates the errored doc's `syncPromise` cache entry then triggers hash nav. Maps thrown values to error copy via the exported pure `errorCopy(error)`; renders "Try again" primary + "Back to previous document" secondary affordances
- `src/components/EditorActivityPool.tsx` — Renders one `<Activity>` per most-recently-active doc up to `ACTIVITY_MOUNT_LIMIT = 3` (decoupled from `MAX_POOL = 10` per precedent #18(c)); exports the pure `computeActivityMountList(entries, activeDocName, limit)` helper (active doc always force-included, system docs filtered). Preserves the dual-editor concurrent-mount pattern (SourceEditor + TiptapEditor with `display:none` toggle) so mode swap doesn't re-run editor effects
- `src/components/EditorSkeleton.tsx` — Suspense fallback rendered only on cold load when no prior Activity entry is visible; `role="status"` `aria-busy="true"`. Extracted from the inline definition previously at `EditorArea.tsx`
- `src/components/NavigationPendingBar.tsx` — 4-tier escalating progress indicator (0–5s subtle strip → 5–15s visible + "Loading doc…" → 15–25s "taking longer" text → 25–30s "Try again?" button). Injectable `clock` for deterministic unit tests; exports the pure `computeTier(elapsedMs)` mapping. `role="status"` `aria-live="polite"` per SPEC DX5/F13
- `src/editor/source-polish/` — source-view decorations (ViewPlugin + StateField + unit tests)
- `src/editor/markdown-code-languages.ts` — fenced-code syntax highlighting allowlist
- `src/components/ThemeToggle.tsx` — Dark/light/system theme toggle
- `src/components/FileSidebar.tsx` — Sidebar shell; header `+` dropdown opens `NewItemDialog` for file/folder creation
- `src/components/FileTree.tsx` — Tree rendering; folder-row "New file here" / "New folder here" context-menu entries, empty-state "Create your first page" CTA, subscribes to `documents-events` for immediate post-create refresh
- `src/components/NewItemDialog.tsx` — Unified file/folder creation dialog (`kind: 'file' | 'folder'`); shared by header `+`, row context menu, empty-state CTA, `Cmd/Ctrl+Alt+N` shortcut, and broken wiki-link flow
- `src/components/GraphView.tsx` — Force-directed graph visualization (`react-force-graph-2d`); cluster-based node coloring, metadata tooltips
- `src/components/GraphPanel.tsx` — Graph controls shell; renders `GraphLegend` in fullscreen Explore mode
- `src/components/GraphLegend.tsx` — Cluster color legend (fullscreen Explore only; max 10 entries)
- `src/components/graph-colors.ts` — Deterministic hash-to-color mapping for cluster names (16-color palette, theme-aware)
- `src/components/graph-view-utils.ts` — `DocGraphNode` type, tooltip HTML generation, graph data helpers
- `src/presence/PresenceBar.tsx` — Presence bar component
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button

## Package: desktop

Electron desktop app — `@inkeep/open-knowledge-desktop`, private. Launches the editor as a native macOS app. **Status: M1 shipped; M2 signed-DMG scaffolding landed** (fuses flip, afterSign notarize+staple+verify, electron-builder hook wiring, `workflow_dispatch` CI). M2 end-state DOD (Universal DMG green end-to-end under real Apple creds) is blocked on the bun-workspace universal-merge SHA-parity gap — see [`specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC.md`](specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC.md) §6. Auto-update, URL scheme, keyring Device Flow, MCP first-launch wiring, CLI-on-PATH menu item remain deferred — see [`specs/2026-04-11-electron-desktop-app/SPEC.md`](specs/2026-04-11-electron-desktop-app/SPEC.md) §14 (M3–M7) for the milestone plan and [`packages/desktop/README.md`](packages/desktop/README.md) for the operational detail.

### Process model

One editor BrowserWindow ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir` (D6 in the Electron spec). Enforced by the shipped `server.lock` contract. Plus one UI-only Navigator BrowserWindow (no utility attached) that acts as a persistent launcher (D24 revised — every project pick spawns a new editor window; D3 revised — there is no switch-in-place UX).

### Key files

- `packages/desktop/src/main/index.ts` — app lifecycle, single-instance lock, menu bar, `runClean` on boot
- `packages/desktop/src/main/window-manager.ts` — `createProjectWindow` spawns BrowserWindow + utility, tracks `Map<BrowserWindow, ProjectContext>`, collision dispatch
- `packages/desktop/src/main/navigator-window.ts` — `createNavigatorWindow` persistent launcher
- `packages/desktop/src/main/state-store.ts` — electron-store wrapper for recents + window bounds (Zod-validated, corrupt-file recovery)
- `packages/desktop/src/main/shell-allowlist.ts` — `shell.openExternal` scheme allowlist (D47: `https | http | mailto | openknowledge`)
- `packages/desktop/src/preload/index.ts` — `contextBridge.exposeInMainWorld('okDesktop', ...)` with preload-side listener wrappers (electron/electron#33328)
- `packages/desktop/src/utility/server-entry.ts` — `bootServer({ attachUiSibling: false, idleShutdownMs: null })` + IPC handshake + macOS poll-based parent-death detection (D49)
- `packages/desktop/src/shared/{ipc-channels,ipc-events,ipc-handler,ipc-invoke}.ts` — typed IPC channel map (D14 hand-rolled, no tRPC)
- `packages/desktop/src/shared/bridge-contract.ts` — desktop-local copy of `OkDesktopBridge` (canonical shape in `@inkeep/open-knowledge-core/src/desktop-bridge.ts` — duplication is deliberate; see README)
- `packages/app/src/components/NavigatorApp.tsx` — React component rendered when `window.okDesktop?.config.mode === 'navigator'`
- `packages/app/src/lib/use-collab-url.ts` — short-circuits on `window.okDesktop?.config.collabUrl` before the `/api/config` poll path

### IPC discipline (D19)

Never call `ipcMain.handle` / `ipcRenderer.invoke` directly. Use `createHandler` / `createInvoker` from `packages/desktop/src/shared/ipc-*.ts`. Biome's GritQL rule `no-loosely-typed-webcontents-ipc` fails lint on violations. Allowlist (wrapper implementations themselves): `src/shared/ipc-handler.ts`, `src/shared/ipc-invoke.ts`, `src/preload/index.ts`.

### Running locally

```bash
bun install                                               # postinstall rebuilds native modules; skip with ELECTRON_SKIP_REBUILD=1
bun run --filter=@inkeep/open-knowledge-desktop dev        # macOS, opens Navigator window
bun run build:desktop                                     # electron-vite build (no DMG)
bun run --cwd packages/desktop build:mac:unsigned         # Local unsigned DMG smoke (see packages/desktop/README.md §M2)
bun run --cwd packages/desktop build:mac                  # Signed + notarized DMG (requires CSC_LINK + APPLE_* creds)
```

## CRDT Bridge Architecture

The editor uses a **dual-representation** CRDT model: Y.XmlFragment (WYSIWYG via TipTap) and Y.Text (source mode via CodeMirror), connected by server-authoritative bidirectional observers (precedent #14).

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here (tree structure)
├── Y.Text('source')          ← CodeMirror binds here (flat string)
│
│  Server Observer A: XmlFragment → Y.Text  (origin: OBSERVER_SYNC_ORIGIN)
│  Server Observer B: Y.Text → XmlFragment  (origin: OBSERVER_SYNC_ORIGIN)
│  Client observers: baseline tracking only (cross-CRDT write paths deleted)
│
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution
```

### Three invariants

1. **Bridge invariant:** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` — must hold after every propagation path settles.
2. **Baseline invariant:** Observer A's `lastSyncedXmlMd` must match the current XmlFragment state. Staleness causes incorrect diffs. (Server-side: `setupServerObservers()` in `server-observers.ts`; client-side: `setupObservers()` in `observers.ts`.)
3. **Item-preservation invariant:** Sync operations must not replace CRDT Items whose content at the target position already matches what would be written. Ensures `Y.UndoManager({ trackedOrigins })` consumers see correct origin attribution through bridge cycles. (See Architectural precedent #9.)

### Propagation matrix (4 write surfaces x 3 read targets)

| Write Surface             | → Y.Text                         | → XmlFragment                | → Disk               |
| ------------------------- | -------------------------------- | ---------------------------- | -------------------- |
| W1: WYSIWYG (XmlFragment) | Server Observer A                | (direct)                     | Persistence debounce |
| W2: Source (Y.Text)       | (direct)                         | Server Observer B             | Persistence debounce |
| W3: Agent API             | applyAgentMarkdownWrite + CRDT sync (WebSocket) | applyAgentMarkdownWrite on server | Persistence debounce |
| W4: Disk (file watcher)   | applyExternalChange              | applyExternalChange          | (direct)             |
| Undo/Redo (V0-14 pending) | applyAgentUndo (V0-14 template — see §7e of bridge-convergence SPEC) | applyAgentUndo (V0-14) | Persistence debounce |

### transaction.local semantics

- **Local transactions** (`transaction.local === true`): Mutations on the same Y.Doc instance.
- **Remote transactions** (`transaction.local === false`): Arrive via HocuspocusProvider WebSocket sync.
- **Client observers:** fire on local transactions; skip remote (origin guards prevent double-sync). Client observers no longer write the derived CRDT (precedent #14).
- **Server observers:** fire on BOTH local (`applyAgentMarkdownWrite`, `applyExternalChange`) AND remote (client edits arriving via WebSocket). The server is the single coordination point for cross-CRDT sync.
- **Critical:** Layer A unit tests use `transaction.local=true` — NOT the same code path as production.

### Observer A (XmlFragment → Y.Text)

**Server-side (write path)** — `packages/server/src/server-observers.ts`:
- Origin: `OBSERVER_SYNC_ORIGIN` (`LocalTransactionOrigin` object per precedent #1 — `context.origin === 'observer-sync'`, `skipStoreHooks: true`)
- **Path A** (Y.Text in sync with baseline): uses `diffLines` with a content-comparison gate — skips paired delete+insert when Y.Text already has the added content at that offset, preserving CRDT Items
- **Path B** (Y.Text diverged from baseline): uses hybrid diff3+DMP three-way merge (`mergeThreeWay`), then `applyFastDiff` (character-level DMP `diff_main`) for minimal CRDT mutations. Handles D8 deduplication, sub-line conflicts, and delete/edit conflicts losslessly (see `specs/2026-04-15-lossless-bridge-merge/SPEC.md`). `mergeThreeWay`'s post-condition (`assertContentPreservation` — invariant c + order-preservation) throws `BridgeMergeContentLossError` in dev/test; prod logs + silent `saveInMemoryCheckpoint` + returns `err.info.result` so the editor stays responsive (precedent #11(b), SPEC 2026-04-16 §6 R1/R7, D3-LOCKED)
- Settlement-dispatched via `doc.on('afterAllTransactions', ...)` — observer callbacks set `xmlDirty` on non-self, non-paired transactions; handler runs the sync once per drain (precedent #13(b), SPEC 2026-04-16 §6 R4, D5-LOCKED). No wall-clock debounce, no injected `Scheduler`.
- Also handles frontmatter sync (reads `Y.Map('metadata').get('frontmatter')` and prepends on serialize)
- Fires on both `transaction.local=true` (server-side writes) and `transaction.local=false` (client edits arriving via WebSocket)

**Client-side (shell only, no CRDT writes)** — `packages/app/src/editor/observers.ts`:
- Origin: `ORIGIN_TREE_TO_TEXT` (object identity retained for `BRIDGE_ENFORCING_ORIGINS` membership; no cross-CRDT write performed)
- Observer A callback is a no-op under precedent #14 (server owns XmlFragment → Y.Text propagation on its own doc). The subscription keeps the callback slot wired for future read-side instrumentation and symmetric teardown.

### Observer B (Y.Text → XmlFragment)

**Server-side (write path)** — `packages/server/src/server-observers.ts`:
- Origin: `OBSERVER_SYNC_ORIGIN`
- Parses Y.Text markdown via `mdManager.parse()`, applies to XmlFragment via `updateYFragment()`
- Handles frontmatter sync: reads `stripFrontmatter(md)` and writes `Y.Map('metadata').set('frontmatter', ...)`
- After `updateYFragment`, canonicalizes Y.Text via `applyFastDiff` if the raw Y.Text bytes differ from the post-update serialization (preserves the bridge invariant `ytext === serialize(fragment)` after every B drain — replaces the debounce-era reliance on Observer A's subsequent Path B firing). The canonicalization write runs under `OBSERVER_SYNC_ORIGIN` so observers self-skip the inner drain.
- Settlement-dispatched via `afterAllTransactions` (same handler as Observer A; A runs before B within one drain).

**Client-side (shell only)** — `packages/app/src/editor/observers.ts`:
- Origin: `ORIGIN_TEXT_TO_TREE` (object identity retained for the enforcing set)
- Observer B callback performs diagnostic parse validation: attempts `mdManager.parse(body)`; transient mid-edit errors (`SyntaxError`, `VFileMessage`, "Invalid content for node" `RangeError`) swallowed at debug log. Non-transient failures fire `onSyncError('text-to-tree', err)`. No CRDT write; no debounce; no typing-defer state (deleted in US-011 — D14 DELEGATED outcome = option (a) DELETE).

### applyAgentMarkdownWrite (XmlFragment-authoritative — precedent #10)

- File: `packages/server/src/agent-sessions.ts`
- **Replaces the deleted `syncTextToFragment`** (FR-9 in `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md`). Called by all three agent-write handlers (`handleAgentWrite`, `handleAgentWriteMd`, `handleAgentPatch`) in `api-extension.ts`.
- Flow: (1) read current server XmlFragment (reflects all CRDT-synced content including concurrent client WYSIWYG typing); (2) serialize to markdown; (3) compose agent's delta at the markdown level per `'append'` / `'prepend'` / `'replace'` position; (4) parse composed markdown and apply to XmlFragment via `updateYFragment` (structural diff preserves user-content Items); (5) mirror the canonical post-fragment markdown to Y.Text via `applyFastDiff` (character-level DMP `diff_main`; minimal mutation, preserves non-agent Y.Text Items and their origins). See `packages/server/src/agent-sessions.ts:applyAgentMarkdownWrite` for the reference implementation.
- **STOP:** Never write raw markdown directly to Y.Text on the server and then rebuild XmlFragment from it — that's the Bug-A/Bug-D anti-pattern. Compose at markdown-level, apply to XmlFragment via `updateYFragment`, mirror Y.Text via `applyFastDiff`. V0-14's future `applyAgentUndo` handler must follow this same template (see §7e of the bridge-convergence SPEC + `evidence/bug-d-mechanism.md`).

### Origin-guard truth table

All transaction origins are `LocalTransactionOrigin` **object references** (precedent #1) exported from their owning module. Identity-based matching in `Set.has` / `Y.UndoManager.trackedOrigins` / `attachBridgeInvariantWatcher` enforcing sets requires the exact object ref — a string literal or a reconstructed object with the same shape will NOT match.

**Paired-write origins** declare `context.paired: true` at their definition site (precedent #1 extension). `isPairedWriteOrigin(origin) === origin?.context?.paired === true` — no hardcoded registry. Observer A AND Observer B both short-circuit symmetrically (synchronously refresh `lastSyncedXmlMd`, cancel any pending debounce). `specs/2026-04-16-bridge-correctness/SPEC.md` §6 R0-R0c; mutation validation in `specs/2026-04-16-bridge-correctness/meta/mutation-validation.md`.

**Server observers** (write cross-CRDT sync — `server-observers.ts`):

| Transaction Origin                                      | Server Observer A (tree→text)                          | Server Observer B (text→tree)                          |
| ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `OBSERVER_SYNC_ORIGIN` (server self-writes)             | — (self)                                               | SKIP                                                   |
| `AGENT_WRITE_ORIGIN` (applyAgentMarkdownWrite, paired)  | Short-circuit: refresh baseline, cancel debounceA      | Short-circuit: refresh baseline, cancel debounceB      |
| `FILE_WATCHER_ORIGIN` (applyExternalChange, paired)     | Short-circuit: refresh baseline, cancel debounceA      | Short-circuit: refresh baseline, cancel debounceB      |
| `ROLLBACK_ORIGIN` (api-extension.ts, paired)            | Short-circuit: refresh baseline, cancel debounceA      | Short-circuit: refresh baseline, cancel debounceB      |
| `MANAGED_RENAME_ORIGIN` (api-extension.ts, paired)      | Short-circuit: refresh baseline, cancel debounceA      | Short-circuit: refresh baseline, cancel debounceB      |
| Remote-arrived (no origin; `local=false`)               | Sync                                                   | Sync                                                   |

**Client observers** (baseline tracking only — `observers.ts`; cross-CRDT write paths deleted per precedent #14):

| Transaction Origin                                      | Client Observer A (baseline only)                 | Client Observer B (baseline only) |
| ------------------------------------------------------- | ------------------------------------------------- | --------------------------------- |
| `ORIGIN_TREE_TO_TEXT` (observers.ts)                    | — (self)                                          | SKIP                              |
| `ORIGIN_TEXT_TO_TREE` (observers.ts)                    | SKIP                                              | — (self)                          |
| `AGENT_WRITE_ORIGIN` (agent-sessions.ts)                | Skip local; conditional baseline refresh on remote (Bug-B fix) | Baseline refresh         |
| `FILE_WATCHER_ORIGIN` (external-change.ts)              | Baseline refresh                                  | Baseline refresh                  |
| `ROLLBACK_ORIGIN` (api-extension.ts)                    | Baseline refresh                                  | Baseline refresh                  |
| `OBSERVER_SYNC_ORIGIN` (server-observers.ts)            | Baseline refresh                                  | Baseline refresh                  |
| `undefined` (WebSocket remote / local WYSIWYG typing)   | Baseline refresh                                  | Baseline refresh                  |

## Testing

### Test file naming convention

- `*.test.ts` — Bun test runner (unit, integration, stress). Auto-discovered by `bun test`.
- `*.e2e.ts` — Playwright E2E tests. Auto-discovered by `playwright.config.ts` (`testMatch: /.*\.e2e\.ts$/`). Run the CI-specific Playwright file subset via `bun run test:e2e` (from `packages/app`) — the same set dispatched by `.github/workflows/ci.yml`. `bunx playwright test` runs every `*.e2e.ts` under `testMatch` and may diverge from CI's selection.
- **Do not use **`*.spec.ts` — Bun auto-discovers both `.test.ts` and `.spec.ts`, which causes collisions when Playwright files use `.spec.ts` (`@playwright/test`'s `test()` throws outside the Playwright runner).

### Test layers

| Layer       | Type                                                              | Location                                                                                                    | Command                                                    |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A           | Unit (client baseline)                                            | `packages/app/src/editor/observers.test.ts` (client cross-CRDT write paths deleted per precedent #14; server owns them. Old Layer A stress shards `observers.stress.{s1-s8-s9,s2,s4,s5-s6}.test.ts` and Layer D `observers.fuzz.test.ts` were deleted because they tested removed code paths.) | `bun run test` (unit) |
| B           | HTTP + server-side CRDT                                           | `packages/app/tests/stress/stress-api.ts`                                                                   | `bun run tests/stress/stress-api.ts` (needs dev server)    |
| C           | Playwright E2E                                                    | `packages/app/tests/stress/crdt-stress.e2e.ts`, `tests/stress/ux-interactions.e2e.ts`, `tests/stress/docs-open.e2e.ts` (hybrid-render nav: F1-F11+F13, precedent #18) | `bunx playwright test`                                     |
| Integration | Tier 1 bridge matrix + C1-C10 server-authoritative                | `packages/app/tests/integration/bridge-matrix.test.ts`, `c1-*.test.ts` through `c10-*.test.ts`              | `bun run test`                                             |
| Fidelity    | PBT invariants (I1-I11) + 6 handler-specific PBTs + CommonMark/GFM corpus + P0 entity/escape + bridge-observer-conversion PBT | `packages/app/tests/fidelity/` (I1-I10 + handler PBTs + `bridge-observer-conversion.test.ts`); `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (I11) | `bun run test:fidelity` + core unit suite (I11 runs in `bun run test`) |

> **Removed on 2026-04-19 per `specs/2026-04-19-ci-signal-quality/SPEC.md`:**
> - Layer D (multi-client convergence fuzz, `bridge-convergence.fuzz.test.ts`) — test file preserved; invoke ad-hoc via `bun run measure:fuzz` (see Measurement scripts above).
> - Stress layer (5-client × 30s convergence, `server-authoritative-stress.test.ts`) — test file preserved; invoke ad-hoc via `bun run measure:stress`.
> Both exercised the architectural CRDT residual (dual-CRDT topology, D4-LOCKED until H2 2026+). Running them in CI produced >80% PR-red on correct code — mathematically inevitable given the per-seed race rate × seed count. Detection of conversion-class regressions (design-goal lossless, distinct from CRDT merge) moved to the new `bridge-observer-conversion.test.ts` at the Fidelity layer.

### Tier 1 integration harness

Files: `packages/app/tests/integration/test-harness.ts`, `packages/app/tests/integration/network-control.ts`

**Core primitives:**
- `createTestServer()` → spins up real Hocuspocus with HTTP/WebSocket on OS-assigned random port
- `createTestClient(port, docName?, { skipInvariantWatcher?, syncControl? })` → connects HocuspocusProvider + wires `setupObservers()`. Default attaches FR-11 watcher; opt out for tests that deliberately drive divergence. `syncControl: true` wraps the WebSocket with `ControllableWebSocket` exposing `pauseSync()` / `resumeSync()`.
- `createTestClients(port, { count, docName?, perClientOptions? })` → first-class multi-client factory (FR-14). All clients join the same docName (auto-generated if not given).
- `assertAllConverged(clients, { timeout?, pollIntervalMs? })` → polls until every client has identical ytext + identical fragment + bridge invariant holds on each; throws `ClientConvergenceError` on timeout.
- `getFreePort()` → kernel-allocated port (Hocuspocus `Server.listen(0)` fails due to falsy guard)
- Server uses `debounce: 200` (not production 2s) for fast disk tests

**Bridge invariant watcher (FR-11 / US-005):**
- `attachBridgeInvariantWatcher(doc, opts?)` → attached by default in `createTestClient`. Fires on every `afterTransaction` whose origin is a `LocalTransactionOrigin` object-ref in the enforcing set: `ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE`, `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `OBSERVER_SYNC_ORIGIN` (every entry is the actual object ref, not a string). On violation throws `BridgeInvariantViolationError` with origin + unified diff. Settled-state assertion is `assertAllConverged`'s job (FR-14), not the watcher's — no quiescence timer, no magic numbers.

**Origin-preservation probe (FR-12 / US-006):**
- `createItemOriginProbe(ytext, { trackedOrigins: Array<LocalTransactionOrigin>, captureTimeout? })` → wraps `Y.UndoManager`. API: `recordCapture(label?)`, `assertCaptureIntact(label?)`, `capturedContent()`, `undoStackLength()`, `cleanup()`. Use to verify Items survive bridge cycles without origin laundering. `trackedOrigins` must contain object refs — strings fail identity match.

**Server-side state inspector (FR-13 / US-002):**
- `getServerState(server, docName): ServerDocState | null` → returns `{ ytext, fragment, md, fullMd, frontmatter, metaMap, activityMap, connectionCount }` or `null` if doc not loaded. Encapsulates the `(server.instance as any).hocuspocus.documents.get(...)` access — tests should use this helper instead of reaching into hocuspocus internals.

**Structural quiescence gate (bridge-correctness US-010 / SPEC 2026-04-16 §6 R5):**
- `awaitDocQuiescence(doc, opts?)` in `packages/app/tests/integration/test-harness.ts` → resolves once the doc has been quiet on `afterAllTransactions` for N consecutive microtasks (default 2). Use instead of wall-clock `wait(ms)` when a test needs to await pending observer work (including the settlement dispatcher's inner OBSERVER_SYNC_ORIGIN cascades) to settle. Does NOT cover inter-doc / inter-client WebSocket propagation — combine with `assertAllConverged` for that.
- Observer dispatch hook for unit tests: the server observer accepts `onDispatch?: (kind: ObserverDispatchKind) => void` in `SetupServerObserversOpts`, invoked once per drain with `'none' | 'a' | 'b'`. Used by T8/T9/T10 paired-write regression tests to assert paired drains dispatch `'none'` (reverting either paired-write branch produces `'a'` or `'b'`). See `packages/server/src/server-observers.test.ts`.

**Network control (FR-16 / US-010, `network-control.ts`):**
- `ControllableWebSocket` — WebSocket proxy with minimal `pauseInbound()` / `resumeInbound()`. Use via `createTestClient(port, docName, { syncControl: true })` then `client.pauseSync()` / `client.resumeSync()`. Default is passthrough — zero change in default test coverage. Deliberately no `delaySync` / `dropInbound` / `inspectSyncQueue` in v1 (FR-16 minimal surface — add when a concrete reproducer motivates them).

**Regression gates committed by US-011 / US-012:**
- `bridge-convergence-regression.test.ts` — primary 4-test regression harness for Bug-A + Bug-B (renamed from `observer-a-baseline-absorption-repro.test.ts`).
- `bug-a-mechanism-isolation.test.ts`, `bug-c-real-reachability.test.ts` — empirical reachability reproducers.
- `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` — skip-guarded (FR-10); V0-14 unskips when wiring per-agent UM + agent-undo handler.

**Mutation validation gates (server-authoritative bridge, US-012):**
- **Mutation E:** revert server Observer B attachment → C2 + concurrent-source-mode fuzzer seeds fail with XmlFragment duplicates.
- **Mutation F:** revert server Observer A's `skipStoreHooks: true` → persistence-feedback-loop detected as disk-write thrashing.
- **Mutation G:** revert FR-7 deletion of client Observer A/B write paths → C1, C2, C3 fail with multi-writer RGA interleave. Validates the client write-path deletion is load-bearing.
- Documented in `specs/2026-04-15-server-authoritative-observer-bridge/meta/mutation-validation.md`.

### Writing a new integration test

```typescript
import { createTestServer, createTestClient, agentWriteMd, assertBridgeInvariant, wait } from './test-harness';

let server: TestServer;
beforeAll(async () => { server = await createTestServer(); });
afterAll(async () => { await server.cleanup(); });

test('my propagation test', async () => {
  await testReset(server.port);
  await wait(300);
  const client = await createTestClient(server.port);
  try {
    // Write via one surface, verify another
    await agentWriteMd(server.port, '# Test');
    await wait(500);
    expect(client.ytext.toString()).toContain('Test');
    assertBridgeInvariant(client.ytext, client.fragment);
  } finally {
    client.cleanup();
  }
});
```

### Per-test docName isolation

Integration tests use per-test docNames via `createTestClient(port)` which auto-generates `test-${randomUUID()}`. Tests are safe to run concurrently (`test.concurrent()`, multiple `bun test` processes in the same worktree) because:

1. Each test's Y.Doc is uniquely named and independent.
2. Observer A's typing-defer state is per-doc (`WeakMap<Y.Doc, TypingState>`).
3. `/api/test-reset` is scoped to a specific docName via `?docName=` query param.

**Exception:** tests that verify shared-state behavior (initial sync, test-reset semantics) explicitly pass `'test-doc'` and do not run concurrently with each other.

Client lifecycle is inside the test body via `try/finally` — NOT via `beforeEach/afterEach`. This is required for `test.concurrent()` correctness (the shared `let client` pattern races under concurrent mode).

**Playwright E2E tests** (`packages/app/tests/stress/*.e2e.ts`) follow the same isolation principle. Each test creates its own unique doc via `POST /api/create-page` and seeds content via `POST /api/agent-write-md` with an explicit `docName` + `position: 'replace'`. Navigation uses sidebar-scoped locators (`[data-slot="sidebar-container"]`) or direct hash URL (`page.goto(\`${BASE}/#/${docName}\`)`). **STOP:** Do not use hardcoded `'test-doc'` in Playwright tests — Playwright runs with parallel workers by default and shared doc names cause cross-worker CRDT state corruption. The reference pattern is `docs-open.e2e.ts`'s `seedDocs` helper. Also: the API body key for write mode is `position` (not `mode`) — `mode: 'replace'` silently falls back to `append`.

### Observer bridge coverage

Changes to `observers.ts` or `server-observers.ts` require **multi-client test coverage**, not just single-client tests. A remote peer's WYSIWYG edit can arrive as a Y.Text-only transaction during a local user's mid-sync on XmlFragment — this creates divergence states that single-client tests cannot reproduce. PR #43's multi-client test matrix proved this is a real production trigger. The C1-C9 integration tests (`packages/app/tests/integration/c1-*.test.ts` through `c9-*.test.ts`) exercise the full server-authoritative bridge under multi-client concurrent writes.

### Playwright policy

Playwright E2E tests run on every PR. The Playwright suite covers DOM-binding and user-interaction regressions that unit/integration tests cannot reach (e.g., TipTap NodeView rendering, CodeMirror key bindings, presence UI). Do not skip Playwright in CI; do not add Playwright tests for pure bridge-logic changes — those belong in `bridge-matrix.test.ts` and `observers.test.ts`.

**PR-tier flake policy (2026-04-19, per `specs/2026-04-17-e2e-observability-determinism/evidence/d-q5-amendment-2026-04-19.md`):** `failOnFlakyTests: false` globally. Retry-success does NOT promote to PR-red. Persistent-flake detection is `nightly-e2e-stability.yml`'s sole responsibility — it runs `bunx playwright test --repeat-each=3 --workers=1` nightly and auto-opens a GitHub issue labeled `e2e-flake` on consistent failure. If you encounter a flaky PR test, do NOT add `failOnFlakyTests: true` as a one-line fix — that unwinds a deliberate D-Q5 amendment. Investigate the flake, add a condition-based wait per precedent #20(a), and let the nightly catch persistent regressions.

### Fuzz + stress replay (ad-hoc only — not CI)

Fuzz and stress tests are no longer part of any automated tier (see "Measurement scripts" above; full rationale in `specs/2026-04-19-ci-signal-quality/SPEC.md`). For investigation and seed replay:

```bash
# Direct bun test invocation (preserves existing seed-replay envs):
STRESS_FUZZ_SEED=42 bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts
STRESS_SEED=42      bun test packages/app/tests/stress/server-authoritative-stress.test.ts

# Or via the wrapper scripts that append a JSONL record to the trend log:
bun run measure:fuzz   --seed-replay 42 --context "reproduce flake from PR #218"
bun run measure:stress --seed 42         --context "reproduce flake from PR #218"
```

Fuzz tests write snapshots to `/tmp/fuzz-*` on failure for deterministic reproduction.

## Concurrent Development

### VITE_PORT for custom port

```bash
VITE_PORT=9999 bun run dev        # Dev server on port 9999 (strict: fails if taken)
bun run dev                        # Default port 5173 (not strict)
```

### Port isolation for tests

- **Tier 1 integration tests:** `getFreePort()` allocates kernel-assigned random ports. Zero coordination needed.
- **Playwright tests:** `VITE_PORT` env var passed via `playwright.config.ts` webServer command. Set `VITE_PORT=<random>` for concurrent runs.
- `reuseExistingServer: false` in playwright.config.ts prevents stale server contamination.

### Detecting stale dev servers

```bash
ps aux | grep vite                 # Find running Vite processes
lsof -i :5173                     # Check what's using default port
```

### Worktree isolation

Each worktree has its own content directory. The test harness creates a fresh `tmpDir` per test run — no shared state between worktrees.

**ProseMirror-model duplication in nested worktrees:** Worktrees at `.claude/worktrees/X/` are nested inside the parent repo directory. Bun resolves workspace packages (e.g., `@inkeep/open-knowledge-core`) by walking up the directory tree — finding the parent repo's `packages/core/` and its `node_modules/` first, not the worktree's. When the parent's `prosemirror-model` instance differs from the worktree's, `PmNode.fromJSON()` fails with "looks like multiple versions of prosemirror-model were loaded."

**Fix:** Run `bun install` from the worktree root to create worktree-local `node_modules/`. The dev server is unaffected (Vite `resolve.dedupe` handles it). For test files, prefer direct relative imports (`../../packages/core/src/...`) over workspace imports (`@inkeep/open-knowledge-core`). See `reports/bun-prosemirror-model-dedup/REPORT.md`.

### Multi-agent local workflows

This repo supports multiple agents (or agents + manual dev servers) running concurrently without coordination:

- **Two agents, same worktree:** Each bun process gets its own port (`getFreePort`), its own Hocuspocus tmpdir (`mkdtempSync`), its own Y.Docs, and its own module state.
- **Two agents, separate worktrees:** Stronger isolation via filesystem separation.
- **Agent running Playwright + developer running **`bun run dev`**:** Playwright config sets `OK_TEST_CONTENT_DIR` to an isolated tmpdir; the manual dev server uses the default `packages/content/`. No contention.

No environment variables must be set by hand for any of these scenarios.

## Known Pitfalls

### STOP rules

- **STOP:** Server-side agent writes MUST use the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` in `agent-sessions.ts`, precedent #10). A naive rebuild-from-Y.Text pattern destroys concurrent user XmlFragment content (Bug-A / Bug-D in `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md`). V0-14's future `applyAgentUndo` handler must follow the same pattern — see `evidence/bug-d-mechanism.md` for the template.
- **STOP:** `syncTextToFragment` has been deleted (FR-9). Do not recreate or reintroduce a rebuild-from-Y.Text pattern. If you need to sync Y.Text → XmlFragment on the server, use the XmlFragment-authoritative composition pattern from `applyAgentMarkdownWrite`.
- **STOP:** Don't bypass `writeTracker` or `skipStoreHooks`. The write tracker prevents self-write feedback loops between persistence and file watcher. `skipStoreHooks` prevents persistence from re-saving a file we just loaded.
- **STOP:** Any new server-side subsystem that keys off `documentName` MUST call `isSystemDoc()` at its entry point (see `cc1-broadcast.ts`). Forgetting leaks state into the `__system__` pseudo-doc — e.g. a `.__system__.md` file on disk, a backlink-index entry, a reconciledBase entry. `server-observer-extension.ts` short-circuits on `isSystemDoc()` in `afterLoadDocument`. The L1 integration test (`packages/app/tests/integration/cc1-broadcast.test.ts`) asserts zero `__system__` state across every audited subsystem after broadcasts.
- **STOP:** Server-side observer cross-CRDT writes MUST use `OBSERVER_SYNC_ORIGIN`. Do not re-add client-side cross-CRDT write paths in `observers.ts` (deleted code under precedent #14). See Mutation G in `specs/2026-04-15-server-authoritative-observer-bridge/meta/mutation-validation.md`.
- **STOP:** Do NOT catch `BridgeMergeContentLossError` and swallow it outside the Observer A Path B wiring in `server-observers.ts`. `mergeThreeWay` always asserts content preservation; the one production catch site emits structured `bridge-merge-content-loss` telemetry, queues a silent `saveInMemoryCheckpoint` via `queueMicrotask`, and applies the merge as-computed (SPEC §10 D3 LOCKED). Adding a second catch site silently drops the observability signal and breaks the Notion-style recovery UX. See `specs/2026-04-16-bridge-correctness/SPEC.md` §6 R7/R7b and Mutation H in `specs/2026-04-16-bridge-correctness/meta/mutation-validation.md`.
- **STOP:** Do NOT remove or widen the typed paired-write marker (`LocalTransactionOrigin.context.paired`). Any new origin that atomically mutates BOTH Y.XmlFragment and Y.Text in a single `doc.transact(..., ORIGIN)` block MUST declare `context.paired: true` so Observer A + Observer B both short-circuit symmetrically (precedent #1 extension; bridge-correctness SPEC §6 R0). Adding such an origin without the marker re-surfaces the observer-layer amplification class that US-001/US-002 regression-tests T8/T9/T10 guard against.
- **STOP:** Do not add Y.js observers, CRDT-update handlers, or awareness listeners inside an `<Activity>` subtree without accounting for hidden-mode CPU cost. Y.js observers are NOT React effects and do NOT pause when Activity flips to `hidden` — a hidden Activity entry with a live provider still processes every remote-peer update at full cost. If the cost matters (multi-client collaboration, large docs, remote Hocuspocus), bound the Activity-mount count explicitly via an `ACTIVITY_MOUNT_LIMIT`-style derivation (precedent #18(c); reference: `EditorActivityPool.computeActivityMountList`). For truly per-document observers, prefer wiring them off the pool (which is bounded independently) rather than off the editor component's mount lifecycle.
- **STOP:** Do not replace the hybrid render tree (`DocumentErrorBoundary` → `Suspense` → `EditorActivityPool` → `Activity` → `DocumentBoundary`) with a pure key-based remount pattern (e.g. `<Editor key={activeDocName} />`). The hybrid is load-bearing for the flash-free content-continuity UX delivered by SPEC G1-G2-G5 and precedent #18(b). If you need to add a new write surface, wrap it in its own `DocumentBoundary` (Suspense-ready) rather than short-circuiting the tree. See `packages/app/src/components/EditorArea.tsx` for the canonical shape.
- **STOP (V0-14 agent-undo, future spec):** V0-14's `applyAgentUndo` handler is a NEW server-side write surface and MUST satisfy all of the following simultaneously:
  1. **Use the XmlFragment-authoritative composition pattern** from `applyAgentMarkdownWrite` (precedent #10, #12) — never rebuild XmlFragment from Y.Text (Bug-A/Bug-D anti-pattern).
  2. **Fire under a new `LocalTransactionOrigin` object-ref** (e.g. `AGENT_UNDO_ORIGIN`) distinct from `OBSERVER_SYNC_ORIGIN` and `AGENT_WRITE_ORIGIN` (precedent #1). Server Observer A/B already early-exit on the `AGENT_WRITE_ORIGIN` paired-write path; V0-14 inherits that behavior only if the new origin is similarly added to the origin-guard truth table in `server-observers.ts` with the "already-in-sync early-exit" classification.
  3. **Extend the FR-17 fuzzer op set** (`packages/app/tests/stress/bridge-convergence.fuzz.test.ts`) with an `agent-undo` op kind AND extend the conversion PBT (`packages/app/tests/fidelity/bridge-observer-conversion.test.ts`) with a matching chain if the new surface traverses any of the conversion functions covered there. The D18 coverage gate (precedent #13(d)) fails `bun run measure:fuzz` until the fuzzer op is added; the fidelity PBT update is what makes the signal fire at PR tier. Both are required — the fuzzer sidesteps automated CI enforcement as of 2026-04-19 (`specs/2026-04-19-ci-signal-quality/`), so the fidelity PBT is the PR-blocking gate for conversion-class regressions.
  4. **Do NOT re-add client-side cross-CRDT write paths** — even if convenient for client-side undo UX. Mutation G enforces that the deletion is load-bearing; any reintroduction re-surfaces the 2-4% multi-client RGA-interleave race.
  5. **Depend on the event-loop serialization guarantee** from the server-authoritative spec §7a + A7 — `applyAgentUndo` runs as a synchronous `doc.transact()` block with the subsequent observer fires as `setTimeout` callbacks. No defensive mutex needed under Node.js/Bun's single-threaded Y.Doc model.
  6. **Unskip** `packages/app/tests/integration/bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (skip-guarded per FR-10).

  Reference template: `packages/server/src/agent-sessions.ts:applyAgentMarkdownWrite` (lines 68-113). Evidence: `specs/2026-04-14-bridge-convergence-under-concurrent-writes/evidence/bug-d-mechanism.md`.

### WARN rules

- **WARN:** Markdown round-trip is not always stable. E.g., `## H\nP` normalizes to `## H\n\nP` (paragraph after heading gets a blank line). Test with `serialize(parse(md)) !== md` to find constructs that normalize.
- **WARN:** Server Observer A's `lastSyncedXmlMd` (in `server-observers.ts`) must be refreshed on ALL XmlFragment changes, not just user edits. A stale baseline produces incorrect diffs that destroy content.
- **WARN:** Layer A tests use `transaction.local=true`. This does NOT exercise the same code path as production where WebSocket updates arrive with `transaction.local=false`.
- **WARN:** `hocuspocus.configure({ extensions: [...] })` REPLACES the extensions array (object spread). Use `hocuspocus.configuration.extensions.push()` to add extensions without losing existing ones.
- **WARN:** TipTap's `editor.view` is a throwing proxy before the ProseMirror mount completes — touching `editor.view.dom` during the recycle→remount race (provider pool recycle, Activity mode flip cold path, etc.) crashes the nearest ErrorBoundary with an opaque "Unknown error". Use `editor.editorView` (non-throwing alternative) to check mount state, and subscribe to the `'create'` event before accessing `view.dom`. See `packages/app/src/editor/TiptapEditor.tsx` for the reference pattern (fixed alongside the hybrid-render precedent #18).
- **WARN:** React 19.2 `<Activity mode="hidden">` unmounts the hidden subtree's DOM. A scroll container that wraps multiple Activity mounts will lose `scrollTop` on every mode flip because `scrollHeight` collapses and the browser auto-clamps. **Each Activity mount must own its own scroll container** (see `EditorActivityPool.tsx` + `ScrollPreservingContainer` — capture `scrollTop` via a scroll listener, restore via a layout effect + `ResizeObserver` retrying until tall enough). `<Activity>` preserves React state; per-mount scroll containers preserve DOM scroll state. Precedent #18 covers this invariant for any future subscription-source Activity pool.
- **WARN:** Never narrow a PM mark's `excludes` field. Precedent #9 (schema is add-only forever) covers mark attrs — `excludes` is part of that contract. US-017 deliberately widened the `Code` mark by replacing `@tiptap/extension-code`'s `excludes: '_'` with `excludes: ''` via `CodeMarkFidelity` (`packages/core/src/extensions/code-mark-fidelity.ts`). This lets emphasis/strong coexist with inline code per CommonMark (e.g. `*a \`*\`*`) and is load-bearing for Emphasis + Backslash idempotence. Reverting to `excludes: '_'` — including via a Tiptap upgrade that reinstates the upstream default — would reintroduce those idempotence failures AND narrow the schema in the precedent #9 sense. If a future change needs different co-exclusion behavior, widen further; do not narrow.

### CM6 footgun: do NOT gate syntax-tree reads on `syntaxTreeAvailable()`

`syntaxTreeAvailable(state, pos)` from `@codemirror/language` reflects the *deepest pending sublanguage*, not the outer markdown tree. When a fenced-code block declares a language (e.g. ` ```typescript `), CM6 lazy-loads `@codemirror/lang-javascript`; during that load, `syntaxTreeAvailable()` returns `false` — but the outer markdown tree (with `FencedCode`, `Blockquote`, `Table`, ListItem nodes) is already complete. Early-returning `Decoration.none` on that gate silently disables every decoration the moment any known-language code block enters the viewport, and the disable sticks for the doc's lifetime.

Instead, use the appropriate rebuild strategy for your plugin type:

- **ViewPlugin:** detect tree mutation via `syntaxTree(update.startState) !== syntaxTree(update.state)` in `update()`, so decorations reattach when a later parse advance lands. See `packages/app/src/editor/source-polish/view-plugin.ts`.
- **StateField:** early-return on `!tr.docChanged` to avoid re-scanning on cursor moves, focus, and scroll; the outer markdown tree is always complete when a `docChanged` transaction arrives. See `packages/app/src/editor/source-polish/broken-ref-field.ts`.

Both patterns skip `syntaxTreeAvailable()`. We hit this during the source-view polish implementation — the initial impl gated on it, observed the silent disable on any fenced code, and switched to the tree-mutation / docChanged guards above.

### Logging conventions

Two `console.warn` styles coexist by design — pick the one that matches your use case:

1. **Bracket-prefixed strings** (most subsystems): `console.warn('[file-watcher] dropped event', ...)`, `console.warn('[CC1] broadcaster error', ...)`. Use for ad-hoc operational warnings where the consumer is a human reading dev-server output.
2. **Structured JSON** (parse-health, R6 block-level fallback, R13 y-prosemirror schema-throw): `console.warn(JSON.stringify({ event: 'mdx-block-fallback', offset, reason }))`. Use for events that are (a) counted in aggregate (`packages/core/src/metrics/parse-health.ts`), (b) machine-consumable by log aggregators, or (c) referenced in test assertions via `packages/app/tests/fidelity/expect-parse-event.ts`. Shape follows the Outline / Biome / esbuild stderr-JSON pattern (`specs/2026-04-13-mdx-tolerant-parsing/evidence/observability-pattern.md`).

A structured event that only exists to help a human debug should use the bracket style; an event that's counted or tested programmatically should use the JSON style. Don't convert one to the other without understanding which consumers depend on the shape.

## Debug Tooling

### Observer instrumentation

Add logging to `observers.ts` to trace sync behavior:

```typescript
// In Observer A callback:
console.log('[Observer A]', { ytextLen: ytext.toString().length, fragLen: serializeFragment(fragment).length, lastSyncedLen: lastSyncedXmlMd.length });
```

### Round-trip stability check

```typescript
const roundTripped = mdManager.serialize(mdManager.parse(md));
if (roundTripped !== md) console.warn('Non-canonical markdown:', { original: md.length, roundTripped: roundTripped.length });
```

### Bridge invariant check

```typescript
const textNorm = stripTrailingWhitespace(ytext.toString());
const fragNorm = stripTrailingWhitespace(serializeFragment(fragment));
console.assert(textNorm === fragNorm, 'Bridge invariant violated');
```

### Fuzz replay for deterministic reproduction

```bash
STRESS_FUZZ_SEED=<seed-from-failure> bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts
```

Check `/tmp/fuzz-*` for the snapshot of the failing state.

## Research references

`reports/` contains \~55 prior-art research reports on the tech stack, editor architecture, CRDT collaboration, search engines, MCP tool design, competitive landscape, and related topics. Each report has a `REPORT.md` synthesis and `evidence/` files. See `reports/CATALOGUE.md` for the full index. Key reports:

- `reports/npm-global-cli-packaging/` — CLI packaging research (7 dimensions)
- `reports/auto-persistence-version-history-patterns/` — Auto-persistence and version history
- `reports/bun-module-resolution-extensions/` — Bun module resolution extensions
- `reports/onboarding-multiproject-ux/` — Onboarding multiproject UX
- `reports/crdt-observer-bridge-latency-analysis/` — CRDT observer bridge latency analysis

## Storage-layer fidelity contract

**Storage never sanitizes; render-time layers do.** Raw HTML, backslash escapes, and all literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline).

### Fidelity invariants (I1-I11 active)

| ID  | Invariant                   | Description                                                                                         |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| I1  | Identity                    | `serialize(parse(md)) === md` for supported constructs                                              |
| I2  | Character preservation      | Every literal char in input appears in output — no entity encoding                                  |
| I3  | Normalization canonicality  | `f(f(x)) === f(x)` — double round-trip equals single round-trip                                     |
| I4  | Idempotence                 | `serialize(parse(X))` applied twice produces identical output                                       |
| I5  | Layer A === Layer B         | mdManager path and Y.Doc path produce the same output                                               |
| I6  | Multi-client preservation   | Content survives Y.Doc state sync between clients                                                   |
| I7  | Cross-path consistency      | All write paths produce equivalent serialized output                                                |
| I8  | Crash resistance            | `parse()` never throws non-SyntaxError on fuzzed input; `SyntaxError` allowed only for matched `{…}` with non-JS content |
| I9  | Guard completeness          | After `protectFromMdx`, remark-mdx never encounters an unmatched `<` or unclosed `{` that crashes  |
| I10 | Structural crash resistance | Nested / truncated / interleaved constructs (dangerous chars inside marks, half-typed JSX, etc.) parse without unexpected errors |
| I11 | R23 guard precision         | After `protectFromMdx`, valid MDX (self-closing, paired, attrs/URLs/expressions) survives unchanged — no false-positive PUA replacements. Complements I9 (completeness). PBT at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (1K runs default, 10K under `STRESS_FIDELITY=1`). Originates in `specs/2026-04-13-mdx-tolerant-parsing/` §M4 / §D2 and ships with the R23 guard family. |

PBT invariants I1-I10 live in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`. I11 lives at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (colocated with the R23 guard it covers; runs under core's unit suite rather than `test:fidelity`). US-014 added six handler-specific PBTs alongside the I-numbered set — `invariant-emphasis-cumulation.test.ts`, `invariant-backslash-idempotence.test.ts`, `invariant-list-nesting.test.ts`, `invariant-html-block-edge.test.ts`, `invariant-link-edge.test.ts`, `invariant-image-edge.test.ts` — targeting the specific bug shapes characterized in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r6-failure-modes.md`.

### Irreducible gaps (by design)

- **NG1:** Blank-line count between blocks normalizes (ProseMirror schema limitation)
- **NG2:** GFM table column widths normalize
- **NG3:** Constructs outside our extension set (math `$$`, footnotes, alerts) are NOT semantically preserved
- **NG4:** No storage-layer HTML sanitization — raw HTML passes through unchanged
- **NG5:** HTML entity references (`&amp;` `&lt;` `&gt;`) in source markdown are decoded to literal characters on first parse and remain as literals — the entity form is not preserved
- **NG6:** Non-ambiguous backslash escapes (e.g., `\foo`) lose the backslash on round-trip — only CommonMark §2.4 structurally-ambiguous escapes are preserved via `escapeMark`
- **NG7:** MDX `---` inside a JSX block parses as `thematicBreak` — escape to `\---` or wrap in code fence
- **NG8:** Block-level GFM (tables, tasklists) inside inline `<Note>...</Note>` flattens to inline text — use `<Note>\n\n...\n\n</Note>` form for block children
- **NG9:** Unicode Private Use Area characters U+E000–U+E004 in source content are reserved as internal sentinels by `autolink-void-html-guard.ts` (R23 guard). U+E000 replaces `<` in protected patterns, U+E001 replaces `>`, U+E002 replaces `:` inside autolink URLs (defeats remark-gfm autolink-literal), U+E003 replaces `@` inside autolink URLs (defeats remark-gfm email autolink), U+E004 replaces `{` in unmatched brace positions (defeats remark-mdx expression parser). Source content containing these codepoints may be corrupted by the guard's restoration pass. These PUA characters are not assigned by Unicode and are rare in legitimate content; if encountered in real documents, the guard's sentinel bytes must be remapped to a less-contested PUA range.
- **NG10:** A thematicBreak at document start is normalized from `---` to `***` on serialize. `---` at document position 0 is indistinguishable from empty YAML frontmatter under `remark-frontmatter`; re-parsing `---\n\n<content>` tokenizes differently than `***\n\n<content>`, breaking idempotence (I3/I4/I5/I7). Non-doc-start thematicBreaks preserve `sourceRaw` faithfully. Implemented in `packages/core/src/markdown/to-markdown-handlers.ts:thematicBreak`.
- **NG11:** Documents consisting only of ignore-typed mdast nodes (yaml frontmatter, toml frontmatter, footnoteDefinition) receive a synthesized empty paragraph so the PM doc satisfies `doc.content: 'block+'`. Observed input like `---\n\n---` (empty YAML frontmatter) or a file containing only `[label]: url` reference definitions without body content round-trips to an empty document. Implemented in `packages/core/src/markdown/pipeline.ts:ensureNonEmptyDoc`.

### Markdown pipeline dependency discipline

- `@handlewithcare/remark-prosemirror` pinned to exact version `0.1.5` (no caret). A `bun patch` in `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch` carries two coupled fixes: (a) PR #3 (empty-text-node + NBSP whitespace preservation); (b) US-017 replacement of `hydrateMarks` with an outside-in greedy nesting algorithm. The upstream partition-by-`marks[0]` strategy loses nested emphasis+strong shape when spans share one mark — the replacement walks marks outside-in so `[a[E], b[code]]`-style spans reconstruct faithfully. Patches are coupled; re-port them together on any upstream bump.
- MDX agnostic pair (`mdast-util-mdx`, `micromark-extension-mdx`) pinned as a coupled unit — bump together. `micromark-extension-mdx` (agnostic mode, no acorn) replaced `micromark-extension-mdxjs` (strict mode)
- **Upgrade protocol:** Before bumping any dependency, re-run the 118-case fidelity probe (`tech-probes/r1-preflight-gate/`) and full invariant suite (`bun run test:fidelity`). Verify both remark-prosemirror patch hunks still apply cleanly
- Failed patch surfaces at install time (fail-loud via `patchedDependencies`)
- **Pre-flight probe baseline:** 97/118 whitespace-only, 13/13 P0 entity/escape — see `tech-probes/r1-preflight-gate/REPORT.md`

### Markdown Pipeline — System Design

The markdown pipeline uses `unified + remark` for parsing and serialization, with `@handlewithcare/remark-prosemirror` bridging mdast ↔ ProseMirror.

**Parse direction:**

```
[R23 protectFromMdx pre-pass on source bytes]
  ↓
remark-parse → remark-frontmatter → remarkMdxAgnostic →
remark-gfm → remarkWikiLink →
restoreFromMdx (Phase A) →
mergedPostParseWalkerPlugin (Phase B: autolink-promotion +
  doc-start-thematic-fix + position-slice + unknown-mdast-guard) →
ensureNonEmptyDoc → remarkProseMirror (handlers map mdast → PM JSON)
```

Post-parse tree traversal is **two phases** (reduced from five by US-007/US-008, gated by the US-007 byte-for-byte mdast-equivalence validator): Phase A is a standalone visitor that restores PUA sentinels to literal `<`, `>`, `:`, `@`, `{` in text/URL/title/alt fields; Phase B is a single `unist-util-visit` dispatcher that merges the four remaining passes, internally ordering pass-5 (unknown-mdast guard, with `SKIP`) → pass-2 (autolink promotion) → pass-4 (position slice). Pass-3 (doc-start thematic fix) runs once as a tree-level pre-step before the visit. Phase A stays separate because Phase B's autolink regex requires the literal characters that Phase A restores.

**Serialize direction:**

```
fromProseMirror (PM JSON → mdast) → remark-stringify + custom mdast-util-to-markdown handlers
```

**Processor caching (US-006).** `MarkdownManager` builds one parse processor and one serialize processor at construction via `createParseProcessor` / `createSerializeProcessor`, then reuses them across every `parse()` / `serialize()` call. `remarkMdxAgnostic` and `remarkWikiLink` push to `data().micromarkExtensions`; their attachers are idempotent under re-entry via module-level singleton extension values.

**Handler tiers:**

- **Tier A (passthrough):** root, paragraph, text, blockquote, table/row/cell, image, inlineCode, delete
- **Tier B (fidelity):** emphasis, strong, heading, code, thematicBreak, break, list, listItem — reads `node.data.*` from position-slice walker
- **Tier C (custom):** link/linkReference, definition (R12 override), html, MDX nodes, wikiLink

**Position-slice walker** (`position-slice.ts`): runs as pass-4 inside Phase B's merged dispatcher. Slices original source at `node.position.start.offset` to recover authoring-form delimiters (emphasis `*`/`_`, fence char, bullet marker, etc.). Attaches `node.data.sourceDelimiter`, `node.data.sourceFenceChar`, etc.

**D20 escapeMark:** PM-level mark applied to text runs whose source contained a backslash escape of a structurally-ambiguous char (`\#`, `\*`, `\_`, etc. per CommonMark §2.4). Position-slice walker tags, serialization handler re-emits the backslash.

**Key files:**

- `packages/core/src/markdown/pipeline.ts` — unified pipeline factory (`createParseProcessor`, `createSerializeProcessor`, `parseMd`, `serializeMd`, `ensureNonEmptyDoc`)
- `packages/core/src/markdown/index.ts` — MarkdownManager wrapper (parse/serialize, processor caching)
- `packages/core/src/markdown/handlers.ts` → `index.ts` — mdast→PM + PM→mdast handler tables
- `packages/core/src/markdown/to-markdown-handlers.ts` — fidelity-aware serialization overrides
- `packages/core/src/markdown/merged-walker.ts` — Phase B merged dispatcher (autolink promotion + doc-start thematic fix + position slice + unknown-mdast guard)
- `packages/core/src/markdown/position-slice.ts` — source-form recovery (pass-4 inside merged-walker)
- `packages/core/src/markdown/autolink-promotion.ts` — `<scheme:uri>` text → semantic link (pass-2)
- `packages/core/src/markdown/doc-start-thematic-fix.ts` — root-position empty yaml → thematicBreak (pass-3 pre-step)
- `packages/core/src/markdown/unknown-mdast-guard.ts` — unknown mdast type → rawMdxFallbackMdast (pass-5)
- `packages/core/src/markdown/wiki-link-micromark.ts` — micromark tokenizer for `[[Page]]` syntax
- `packages/core/src/markdown/autolink-void-html-guard.ts` — R23 guard (pre-pass `protectFromMdx` + Phase A `restoreFromMdx`); pre-indexed offset maps + binary search per US-005
- `packages/core/src/markdown/remark-mdx-agnostic.ts` — agnostic MDX mode (no acorn validation)
- `packages/core/src/markdown/parse-with-fallback.ts` — block-level split-then-rejoin fallback for crash-class MDX
- `packages/core/src/markdown/mdast-augmentation.ts` — TypeScript type augmentation for custom mdast types
- `packages/core/src/markdown/fixtures/` — canonical fixture corpus (`commonmark`, `gfm`, `mdx`, `wiki-links`, `frontmatter`, `ng-pinned`, `perf`) with typed loader helpers in `fixtures/index.ts`

**Schema names (mdast-canonical, D16/D17):** `strong` (not bold), `emphasis` (not italic), `thematicBreak` (not horizontalRule). Unified `list` + `listItem` (not separate bulletList/orderedList/listItem).

## Changesets

```bash
bun run changeset        # Create a new changeset
bun run version          # Apply pending changesets
bun run release          # Publish to npm
```

## Code Style

- React Compiler is enabled for this repo. Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler unless a maintainer explicitly requests an exception
- Use `use()` instead of `useContext()` (React 19 pattern)
- In React components, prefer Tailwind CSS utility classes via `className` instead of inline `style` props. Only use inline styles when there is no practical Tailwind expression for the requirement
- Prefer existing shadcn components before building custom UI primitives. If the needed shadcn component is not installed yet, suggest installing it rather than reimplementing it from scratch


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

| Task                             | Don't                        | Do                                              |
| -------------------------------- | ---------------------------- | ----------------------------------------------- |
| List a markdown-heavy dir        | `Bash: ls specs/`            | `exec("ls specs/")`                             |
| Find all SPEC.md files           | `Glob: **/SPEC.md`           | `exec("find specs -name SPEC.md")`              |
| Summarize specs across the repo  | `Agent(Explore): "…"`        | `exec("head -25 specs/*/SPEC.md")` + `search`   |
| Search a phrase across markdown  | `Grep: "pattern" *.md`       | `search({ query: "pattern" })`                  |
| Read an individual spec          | `Read: specs/foo/SPEC.md`    | `read_document({ path: "specs/foo/SPEC.md" })`  |

**Source code and everything else** (`.ts`, `.py`, `package.json`, …): native `Read` / `Grep` / `Glob`.

**Writing.** Edits to in-scope `.md` / `.mdx` go through `write_document` / `edit_document` only. Native `Edit` / `sed` land as anonymous `upstream` imports — you lose agent attribution in the shadow repo.

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
