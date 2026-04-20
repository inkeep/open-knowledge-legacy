# @inkeep/open-knowledge

## 0.2.0

### Minor Changes

- 7fb215b: feat(bridge): correctness guardrail, silent recovery UX, and settlement-based propagation for the dual-CRDT observer bridge (Y.XmlFragment ↔ Y.Text).

  **Paired-write symmetry (Bucket 0).** Adds a typed `context.paired: true` marker to the four origins that atomically write both CRDTs inside one `doc.transact()` block — `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`. Server Observer A and Server Observer B now short-circuit symmetrically on paired-write drains via a semantic predicate (`context.paired === true`), closing the prior Observer-B asymmetry that could re-propagate RGA-level corruption under concurrent typing. `MANAGED_RENAME_ORIGIN` is now exported and included in `BRIDGE_ENFORCING_ORIGINS`.

  **Loud-on-content-loss merge (Bucket A).** `mergeThreeWay` now asserts a maximal-unique-line-substring post-condition with a weak order-preservation side-check (`assertContentPreservation`). Violations throw `BridgeMergeContentLossError` in tests so regressions surface; production swallows the error, emits a structured `bridge-merge-content-loss` JSON log, and queues a silent named checkpoint via the new `saveInMemoryCheckpoint` shadow-repo primitive so the editor keeps responding. Users can recover the pre-merge state via the existing TimelinePanel — no toast, no banner. The algorithm's academic-proven limits (Khanna-Kunal-Pierce 2007) are turned into observable, recoverable events rather than silent byte loss.

  **TimelinePanel kind-aware rendering.** Checkpoint rows render with distinct icon + label per kind: `Save Version` (diamond, existing), `bridge-merge-loss` (amber alert-triangle, "Before concurrent merge @ …"), `external-change-rescue` (sky file-archive, "External change recovered @ …"). Pure helpers `checkpointVariant` + `checkpointHeadlineLabel` are exported for tests.

  **Rescue-buffer consolidation.** Reconcile-delete and branch-switch rescue paths now write `external-change-rescue` checkpoints to `refs/checkpoints/<branch>/*` via `saveInMemoryCheckpoint`. `/api/rescue` + `/api/rescue/:docName` merge flat-file (shutdown-flush, retained) and timeline-ref (new) sources — response rows carry a `source: 'flat' | 'timeline'` discriminator.

  **Settlement-based observer dispatch (Bucket B).** Server Observer A + Observer B now run from `doc.on('afterAllTransactions', ...)` — one fire per outermost `doc.transact()` drain, Observer A before Observer B so any Y.Text write from A is visible to B. The 50 ms wall-clock debounce is gone. Client observer debounce machinery is deleted (per precedent #14, the client is baseline-only). A new grep gate (`packages/server/src/bridge-no-wallclock.test.ts`) fails CI if wall-clock `setTimeout` reappears in either bridge-observer file.

  **Telemetry.** New `bridgeMergeContentLoss` and `bridgeMergeCheckpointCreated` counters exposed via the existing `GET /api/metrics/reconciliation` endpoint. Structured log events (`bridge-merge-content-loss`, `bridge-merge-checkpoint-created`) follow the existing JSON-log convention.

  **Elevated fuzz coverage.** `bridge-convergence.fuzz.test.ts` now runs 200 seeds per PR (`STRESS_FUZZ_PR=1`, wired in `ci.yml`), 10 000 seeds nightly (`STRESS_FUZZ_NIGHTLY=1`, wired in `nightly.yml`), and logs the resolved seed count at startup for CI visibility. Default local runs remain 25 seeds to keep the dev loop fast.<br>_[Corrected 2026-04-19 post-ship: automated fuzz tier removed from CI and nightly per `specs/2026-04-19-ci-signal-quality/SPEC.md` (FR-2 / D-Q1 LOCKED). `STRESS_FUZZ_PR` and `STRESS_FUZZ_NIGHTLY` env wirings deleted from both workflows; the fuzz test file is preserved and invoked ad-hoc via `bun run measure:fuzz`.]_

  **Fuzz structural quiescence.** Tests now use `awaitDocQuiescence(doc)` instead of `wait(ms)` around `pauseSync`/`resumeSync` — race reproduction is event-ordered, not wall-clock.

  Precedents #1, #11(b), and #13(b) in `AGENTS.md` are updated to reflect the shipped behavior.

## 0.1.1

### Patch Changes

- ee1fc3a: Bundle and minify the published CLI. `tsdown` now produces two minified bundles (`dist/cli.mjs` for the `bin`, `dist/index.mjs` for the `exports` field) with third-party deps inlined, replacing the previous 148-file unbundled output. Native addon deps (`@parcel/watcher`, `chokidar`, `simple-git`) stay external so their `.node` binaries resolve at runtime. Tarball drops from 2.1 MB → 1.6 MB packaged and 660 → 40 files.

## 0.1.0

### Minor Changes

- dc84735: feat: CLI colorized output, boxed banner, and NO_COLOR support

  - Add colorized CLI output via picocolors with semantic color helpers (error, warning, success, info, dim, accent)
  - Render Vite-style boxed startup banner using cli-boxes
  - Full NO_COLOR standard compliance: NO_COLOR env var, FORCE_COLOR env var, --no-color/--color CLI flags
  - Clickable URLs in startup banner via OSC 8 hyperlinks (iTerm2, modern terminals)
  - MCP stdout isolation preserved — diagnostics stay on stderr

- 748f63e: Unify wiki → content config, mirrored catalogs

  - **Config**: `wiki` section replaced by `content` with `dir`, `include`, `exclude`
    - `content.dir` defaults to `.` (project root)
    - `content.include`/`exclude` are glob patterns for tracked content files
  - **MCP tool**: `init-wiki` renamed to `init-content`
  - **Mirrored catalogs**: INDEX.md catalogs generated inside `.open-knowledge/catalogs/` instead of in-place next to source files

  Unify wiki → content config, mirrored catalogs

  - **Config**: `wiki` section replaced by `content` with `dir`, `include`, `exclude`
    - `content.dir` defaults to `.` (project root)
    - `content.include`/`exclude` are glob patterns for tracked content files
  - **MCP tool**: `init-wiki` renamed to `init-content`
  - **Mirrored catalogs**: INDEX.md catalogs generated inside `.open-knowledge/catalogs/` instead of in-place next to source files

- 1f72b85: feat: exclude git-ignored files from document system

  The file watcher now maintains a filtered in-memory file index, replacing the slow `readdirSync` in the documents API. Filtering uses a unified `ContentFilter` that combines `.gitignore` rules with `config.content.exclude` patterns. The `content.include` and `content.exclude` config fields are now wired end-to-end. Response time for `GET /api/documents` dropped from ~35s to ~2-5ms.

- 6517724: Finish the fullscreen graph surfaces by adding `Orphans` and `Hubs` views inside `GraphPanel`, with a visible orphan-mode toggle for `No Incoming`, `No Outgoing`, and `Both`.

  The `get_orphans` MCP tool and the backing server API now share the same three-mode orphan contract, so agents can query disconnected pages by graph lens instead of only the default fully-disconnected view.

- ce09519: feat: add `get_history` and `save_version` MCP tools, fix IPv6 MCP connectivity

  - Add `get_history` MCP tool wrapping GET /api/history for querying document version history with filtering and pagination
  - Add `save_version` MCP tool wrapping POST /api/save-version for creating checkpoint commits
  - Update `rollback_to_version` description to reference `get_history` instead of raw API endpoint
  - Fix MCP server discovery using `localhost` instead of `127.0.0.1` to support IPv6-only server bindings

- 20dfb13: Image upload + asset resolution: sibling-co-located storage, filter reinterpretation, shortest-path hybrid references, SVG support.

  - **Storage**: Uploaded images land as siblings of the editing `.md` file (not a flat `uploads/` dir). Multiple `.md` files can reference the same image via relative paths.
  - **Config**: `content.uploadsDir` removed. `content.include`/`content.exclude` schema unchanged — interpretation extended so allowlisted asset extensions (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) in directories containing ≥1 included `.md` file are auto-included. `exclude`/gitignore continues to supersede.
  - **Serving**: Filter-aware `sirv` middleware over `contentDir` (both dev plugin and standalone CLI). Filter-excluded paths return 404. `X-Content-Type-Options: nosniff` preserved.
  - **References**: Editor inserts bare filename for sibling uploads (`![](screenshot.png)`). New `shortestImageRef(assetPath, mdPath)` helper returns bare filename when co-located, else root-relative-with-leading-slash.
  - **SVG**: Now accepted at upload — consistent with the storage-fidelity precedent. Rendered via `<img src>` only; inline `<svg>` embedding remains unsupported in the editor.
  - **Security**: Upload endpoint requires `parentDocName` form field, normalizes it (rejects absolute paths, `..` segments, NUL), verifies destination is `isWithinContentDir`, and checks `realpathSync` on the destination directory to defeat symlink escape. Existing magic-bytes MIME check, 10 MB cap, atomic `openSync('wx')` write, and numeric-suffix collision retry preserved.
  - **Paste naming**: Clipboard pastes without a meaningful filename synthesize `pasted-YYYYMMDD-HHMMSS.<ext>`.
  - **Supersedes**: #41 (Sarah's original PR — every preserved contribution kept; three load-bearing decisions reworked per the spec).

- 35803ea: `open-knowledge init` now appends a load-bearing "Open Knowledge" section to root `CLAUDE.md` and `AGENTS.md` (idempotent via `<!-- open-knowledge:begin -->` markers; dedups symlinked files via `realpath`). The appended section nudges agents toward `exec`, `write_document`/`edit_document`, and `[[wiki-links]]`. Use `--force` to overwrite the block in place.

  The `exec` MCP tool now auto-scopes recursive `grep -r` / `find` invocations with `--exclude-dir=` / `-not -path` for known non-wiki directories (`node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `.nuxt`, `coverage`, `.cache`, `.parcel-cache`, `.vercel`, `.open-knowledge`). Observed speedup on a real repo: ~210× (56.6s → 0.27s). User-provided `--exclude-dir` / `-not` / `-prune` disables injection for that stage.

- f5e19dd: feat(mcp): add managed document rename with backlink rewrite

  Add the `rename_document` MCP tool and the backing managed rename server flow so page renames update inbound wiki-links plus supported internal inline Markdown links instead of leaving stale references behind.

  Managed rename now uses a persisted recovery journal for crash-safe rollback, updates already-loaded documents through the live Y.Doc path, and keeps sidebar file rename on the graph-safe endpoint while folder rename stays on the lower-level path rename flow.

- d4c2b06: feat: `open-knowledge init` now configures MCP for multiple editors

  - Interactive multi-select prompt asks which tools you use (Claude Code, Cursor, VS Code, Windsurf)
  - Writes each editor's MCP config to its expected location and format
  - `--editor` flag for non-interactive use (e.g. `--editor cursor,vscode` or `--editor all`)
  - Falls back to Claude Code only when stdin is not a TTY

- 51c48d8: Add semantic color bloom to the graph visualization. The `/api/link-graph` endpoint now returns frontmatter metadata (`cluster`, `category`, `tags`) on doc nodes. Graph nodes are colored by cluster using a deterministic 16-color palette, with rich HTML tooltips showing metadata on hover and a cluster legend in fullscreen Explore mode.
- 81e2503: feat: add suggest_links discovery and precision patch targeting

  - add a `suggest_links` MCP tool and `/api/suggest-links` endpoint for deterministic missing-link discovery
  - add title-aware and alias-aware mixed live-or-disk scanning that skips already-linked and non-prose regions
  - add optional offset-aware `edit_document` patch targeting so follow-up edits can address an exact mention

- 29fc273: feat: symlink-safe file sync

  Symlinks inside the content directory are now fully supported. The file watcher indexes documents by canonical path (`realpath`), deduplicating aliases that point to the same file into a single Y.Doc. Persistence writes target the canonical path so atomic rename never breaks symlink chains. Symlinks that escape the content directory are refused, cyclic symlinks are rejected, and broken symlinks fall back to direct writes. The `/api/documents` endpoint surfaces alias metadata (`isSymlink`, `canonicalDocName`, `targetPath`), and the file sidebar renders a Link2 badge with a hover tooltip for symlinked entries.

- e5bfff4: feat: `open-knowledge init` command and MCP workflow tools

  - Add `open-knowledge init` CLI subcommand to scaffold `.open-knowledge/` and register the MCP server in `.mcp.json`
  - Add three MCP workflow tools: `init-wiki`, `ingest`, and `research` with structured skill-style descriptions (Use when / Triggers on)
  - MCP server auto-generates INDEX.md catalogs via file watcher on `.open-knowledge/`

- d901f56: feat: Zero-Ceremony Resume — dual-process lifecycle + MCP auto-spawn

  Behavior changes operators should know about:

  - **`ok mcp` auto-spawns `ok start` by default.** When `ok mcp` starts with no
    live `server.lock`, it detach-spawns the current `@inkeep/open-knowledge`
    binary with `start` as a sibling process (re-exec via `process.execPath` —
    not `npx`, so the sibling is pinned to the same version the MCP client is
    running). Opt out via the `OK_MCP_AUTOSTART=0` env var or
    `mcp.autoStart: false` config. A pre-existing live lock is always connected
    regardless of the opt-out (opt-out only suppresses the spawn path).
  - **`server.port` default changed from `3000` to `0`.** `ok start` now asks
    the kernel for a free port by default; the resolved port is written to
    `server.lock` for MCP discovery. To keep the old behavior, set
    `server.port: 3000` in `.open-knowledge/config.yml` or pass `--port 3000`.
  - **New `ok ui` command.** The React editor now runs in its own sibling
    process (default port 3000; respects `PORT` env / `--port`). `ok start`
    auto-spawns it when `ui.lock` is absent. A `GET /api/config` endpoint on
    `ok ui` bootstraps the React app's HocuspocusProvider with the live
    collab URL read from `server.lock`.
  - **New utility commands:** `ok status`, `ok stop`, `ok clean`.
  - **`ok init` defaults changed.** Non-TTY invocations now write MCP config
    for every detected editor (Claude, Cursor, VS Code, Windsurf) — previously
    only Claude. TTY pre-selects all detected editors. `--editor <all|claude|...>`
    preserved.
  - **`.claude/launch.json` scaffolding updated.** Entry now launches
    `@inkeep/open-knowledge ui` (not `start`) with `autoPort: true`. Existing
    entries from earlier versions are detected as stale and flagged with a
    WARN pointing at `ok init --force`.

  See `docs/content/internals/lifecycle.mdx` and `docs/content/guides/mcp-integration.mdx`
  for the full lifecycle reference.

- fe89406: Zero-config bunx packaging: chokidar as default file watcher with @parcel/watcher as optional native accelerator, React app assets bundled into dist/public/, auto-init on first start

### Patch Changes

- 3eb50c2: fix(bridge): close Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). Server-side agent writes now follow the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` replaces `syncTextToFragment`). Client Observer A uses conditional baseline refresh when a local debounce is pending. Extracts `applyByPrefixSuffix` to `@inkeep/open-knowledge-core` for shared use. Hardens the bridge-testing harness (FR-11 invariant watcher, FR-12 origin probe, FR-15 Scheduler DI with clock unification, FR-16 network control, FR-17 multi-client convergence fuzzer with char-granular content oracle).
- 25357e1: Exclude `dist/**/*.map` from the published npm tarball. Source maps ship full TypeScript source via `sourcesContent`; dropping them from the tarball keeps maps available locally for debugging while the published package is ~46% smaller (3.9 MB → 2.1 MB, 1284 → 660 files).
- 12b6157: ci: Playwright E2E suite is now deterministic and debuggable on failure

  - **Event-coupled waits.** Removed all 73 `page.waitForTimeout(N)` magic
    sleeps and the 1 `waitUntil: 'networkidle'` from the E2E suite. Every
    wait now couples to a real signal (CRDT propagation, menu render,
    selection flush, debounce). CI contention no longer causes spurious
    failures from "200ms should be enough" gone wrong.
  - **Failure observability.** On CI, every test failure now uploads the
    Playwright HTML report + `test-results/` (trace, video, screenshot)
    with 14-day retention. Configure: `retries: 2`, `failOnFlakyTests:
true` (retry-success still fails the PR), `trace: 'on-first-retry'`,
    `video: 'retain-on-failure'` at 1280×720, `screenshot: 'only-on-
failure'`. Developers can `bunx playwright show-trace` on the
    downloaded artifact instead of re-running locally to reproduce.
  - **Named flake fixes.** Resolved 4 named flakes from main CI:
    sidebar-folder (under user investigation), QA-022 chunked-paste perf
    (now baseline-relative — `max(2 × p50Baseline, 32ms)` reading from
    `perf-baseline.json`), crdt-stress S6 (root cause: `/api/config`
    404 was logged as critical-error by an over-strict filter),
    docs-open F11 (root cause: `Promise.all` of clicks didn't preserve
    array order — sequential awaits restore determinism).
  - **PR #188 absorbed fixes.** Cherry-picked from Andrew's PR #188:
    Branch C wikiLink parseHTML priority-100, `wrapAsInlineCode` mark
    handler with 9 unit tests, FR-19 `<pre>` regex tightening
    (`/<pre[\s>]/`), FR-15 Source empty-selection preventDefault.
  - **DEV-gating.** `window.__agentFlashState` writes wrapped in
    `if (import.meta.env.DEV)` so production bundles tree-shake the test
    hook. STOP rule prevents future ungated `window.__*` assignments
    outside the documented allowlist.
  - **STOP rule enforcement.** New mechanical test
    (`tests/integration/e2e-stop-rules.test.ts`) fails CI on any
    reappearance of `page.waitForTimeout`, `waitUntil: 'networkidle'`,
    busy-wait `Promise+setTimeout`, `page.pause`, webkit-skip ratchet,
    inner-helper-import (must use barrel), or ungated `window.__` write.
    Zero allowlist; per-pattern failure messages list `file:line`.
  - **Architectural precedent #20** added to `AGENTS.md` documenting the
    E2E test-infra conventions for future contributors.

  User-facing impact: faster CI feedback on real regressions, no more
  "flake or real?" guessing, debuggable failures from CI artifacts alone.

- ffac734: fix: file sidebar reveals the active file on navigation

  When the active document changes from any entry point (graph click, direct URL, wikilink, rename, browser back/forward), the file sidebar now expands ancestor folders and scrolls the active row into view. Expansion is recomputed per render as `(ancestors ∪ userExpanded) \ userCollapsed`, so a user's manual collapse of the active file's folder sticks until they navigate elsewhere. Adds `aria-current="page"` on the active row and roving tabindex for keyboard access; no focus steal.

- 02c2211: Improve editor hitbox focus by making TiptapEditor and SourceEditor fill the full height of their containers, so clicking anywhere in the editor area activates focus.
- e8f4dd8: Markdown pipeline engineering health — 21 P0 requirements landing across perf measurement, code refactors, fidelity fixes, test tightening, and CI infrastructure.

  **Perf measurement:** seeded synthetic benchmark corpus + committed harness with pinned methodology (10 warm-ups, `Bun.gc(true)`, `bun@1.3.11`); re-measured baseline at 7 block counts; per-stage profile harness + published findings; calibrated perf regression gate (`max(2× p99 variance, 10% floor)`) + parse-health gate (`parseFallback.wholeDoc === 0`) in tier-2 CI.

  **Code refactors:** R23 guard `O(n·m) → O(n log n)` via pre-indexed tag-offset map + binary search (568.88ms → 4.76ms on pathological corpus); processor caching at `MarkdownManager` construction + idempotency refactor for both `remarkMdxAgnostic` and `remarkWikiLink` attachers; 2-phase merged post-parse walker (Phase A restoration + Phase B merged dispatcher) gated by one-time byte-for-byte mdast diff validator on 714 fixtures; structural PM↔mdast fix — `hydrateMarks` outside-in greedy (library patch), `Code` mark `excludes: '_'` widened via `CodeMarkFidelity` (schema widening per precedent #9), context-aware backslash-before-entity policy.

  **Fidelity:** all 6 CommonMark serialization bugs fixed. CommonMark corpus 652/652 idempotent; `KNOWN_CRASH_CEILING` lowered from 50 to 0; all 19 formerly-NORMALIZE sections promoted to byte-identity idempotence assertion.

  **Test tightening:** NG1 + NG11 byte-identity pinning; I3's `markdownDoc` arbitrary parametric blank-line joiner; 6 new PBT invariants (emphasis-cumulation, backslash-idempotence, list-nesting, html-block-edge, link-edge, image-edge) green at 1K samples; `parseWithFallback` perf bound (≤5× happy-path) + parametric `MAX_SPLIT_DEPTH` boundary test.

  **Infrastructure:** all markdown fixtures consolidated into `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` with typed loader helpers; all 7 stale `@tiptap/markdown` references removed; three CI tiers (`ci.yml` / `nightly.yml` / `weekly.yml`) calibrated against measured baselines.

- 95259a3: feat: indicate when an editor doc does not yet exist on disk

  - EditorHeader shows a "New file" badge next to the filename when navigating to a non-existent document; disappears after the file is created
  - WYSIWYG mode shows contextual placeholder text: "Start writing to create this page…" for new docs, "Start writing…" for empty existing docs
  - Source (Markdown) mode shows the same contextual placeholder text via a CodeMirror Compartment

- 107e2ef: fix(observers): preserve CRDT Item identity through Observer A bridge cycles

  Observer A (Y.XmlFragment → Y.Text) now preserves CRDT Items whose content at their position already matches what the sync would write, fixing **origin-laundering** that broke `Y.UndoManager({ trackedOrigins })` consumers — Items written under `'agent-write'` origin no longer get replaced by Items under `'sync-from-tree'` origin.

  Two-path implementation:

  - **Path A** (Y.Text in sync with baseline): `applyIncrementalDiff` adds a content-comparison gate before each adjacent REMOVED+ADDED hunk; if Y.Text already has the added value at that offset, both `delete` and `insert` are skipped — preserving CRDT Item identity for any unchanged region.
  - **Path B** (Y.Text diverged from baseline): `applyUserDelta` is rewritten to use DMP `patch_make` + `patch_apply` (canonical three-way merge) so same-line concurrent edits (user WYSIWYG + agent API write) merge correctly, preserving Item-equal prefix/suffix regions via `applyByPrefixSuffix`.
  - New optional `ObserverDeps.onMergeFailed` callback + `console.warn` diagnostic when DMP `patch_apply` reports failed patches.

  Server-side cleanup: removed the two dead `Y.Map('conflicts')` write stanzas in `standalone.ts` (zero consumers; reconciliation logic, `incrementConflict()`, and the `{ kind: 'conflicts' }` return type all preserved).

  Adds `AGENTS.md` precedent #9 documenting the three unclaimed bridge-quality patterns and introduces a third invariant (Item-preservation) to the CRDT Bridge Architecture section.

  Internal change — no public API surface changes.

- Initial publish
- 12ee3d6: Add a dead-link audit surface to the server API and expose it through the MCP tool surface.
- 94b8a19: fix: eliminate silent data loss on graceful shutdown

  `createServer().destroy()` had two compounding bugs that could silently drop up to 10 seconds of user typing on every Ctrl+C / SIGTERM:

  1. `hocuspocus.flushPendingStores()` is fire-and-forget (`void` return) — awaiting it awaited nothing
  2. The L2 git-commit flush ran before L1 markdown drain, so it drained an empty queue

  The fix adds a `flushAllStoresAndWait()` helper that installs a one-shot `afterUnloadDocument` extension hook (the same pattern `@hocuspocus/server`'s own `Server.destroy()` uses internally), reorders destroy phases correctly (watchers → sessions → L1 drain → L2 git → shadow repo release), and adds a cached-Promise idempotency guard so concurrent shutdown signals (e.g., SIGINT + SIGTERM) share a single teardown. A configurable `destroyTimeoutMs` (default 10s) bounds the flush to prevent hangs from misbehaving `onStoreDocument` hooks. Structured shutdown logs are emitted on every exit. If the L1 flush hits its timeout ceiling, each still-loaded document's in-memory Y.Doc is dumped to `<shadow-gitDir>/rescue/<docName>.md` (best-effort per document) so the user can recover edits via the existing `GET /api/rescue` and `GET /api/rescue/:docName` endpoints, even when `onStoreDocument` itself is hung.
