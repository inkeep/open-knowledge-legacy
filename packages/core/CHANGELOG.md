# @inkeep/open-knowledge-core

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

## 0.1.0

### Minor Changes

- 07161e2: feat: canonical clipboard pipeline with mdast as the intermediate hub for all four clipboard paths (WYSIWYG copy/paste, Source copy/paste)

  - **Shared conversion modules**: `htmlToMdast()` + `mdastToMarkdown()` in `markdown/html-to-mdast.ts` wrap `rehype-parse` → vendor-cleanup plugins → `rehype-remark`. `markdownToHtml()` + `mdastToHtml()` in `markdown/mdast-to-html.ts` wrap `remark-rehype` → custom-node handlers → `rehype-stringify`. Both views share the same conversion path — no per-view special cases.
  - **Vendor cleanup plugins**: day-one panel of 9 rehype plugins under `markdown/rehype-plugins/` covering Google Docs, Word/MSO, Apple Cocoa (Notes/Mail/TextEdit), Gmail, Notion, VS Code, Google Sheets, Slack, and GitHub-rendered HTML. Each ships with a colocated test and a real captured paste sample as fixture. Registered in `cleanupPlugins` (also exported).
  - **Custom-node mdast promotion**: `wikiLink`, `jsxComponent` (as `mdxJsxFlowElement`), `jsxInline` (as `mdxJsxTextElement`), and `rawMdxFallback` are first-class mdast types with dedicated serialization handlers — markdown side emits canonical `[[Page]]` / `<Component/>`, HTML side emits semantic elements with `data-*` round-trip metadata (e.g. wikiLink → `<a class="wiki-link" data-target data-anchor data-alias href="#slug">`). Replaces the prior `{type:'html',value:...}` passthrough.
  - **FR-20 escape discipline**: raw source from MDX / fallback nodes lands in hast `text` nodes (auto-escaped by `rehype-stringify`), never hast `html`. Unit and fuzz tests assert no unescaped `<script>` in output.
  - **Chunked Y.Text insertion**: `chunkedYTextInsert()` in `utils/chunked-insert.ts` splits large pastes (>500KB markdown) into ~50KB segments separated by `requestAnimationFrame` to keep UI responsive on iOS Safari and slower desktops.
  - **New public exports from `@inkeep/open-knowledge-core`**: `htmlToMdast`, `mdastToMarkdown`, `htmlToMdastCleanupPlugins`, `HtmlToMdastOptions`, `markdownToHtml`, `mdastToHtml`, `chunkedYTextInsert`, `DEFAULT_CHUNK_THRESHOLD_BYTES`, `DEFAULT_CHUNK_SIZE_BYTES`, `InsertableYText`, `InsertableYDoc`, `ChunkedInsertOptions`.
  - **Precedent**: clipboard pipeline architecture codified as precedent #19 in `AGENTS.md` — mdast-canonical hub, per-view hook mechanism (PM's `clipboardTextSerializer`/`clipboardSerializer` for WYSIWYG, `EditorView.domEventHandlers` for Source), first-class custom-node mdast types, full 9-plugin cleanup panel day-one.

- 50a5d7f: feat: replace @tiptap/markdown with unified + remark pipeline

  - Swap markdown parsing/serialization from marked + @tiptap/markdown to unified + remark-parse + remark-gfm + remark-frontmatter + remark-mdx + @handlewithcare/remark-prosemirror
  - Rename ProseMirror schema nodes to mdast-canonical names: bold→strong, italic→emphasis, horizontalRule→thematicBreak, separate bulletList/orderedList→unified list+listItem
  - Add source-form fidelity preservation via position-slice walker (delimiter, fence, bullet marker recovery)
  - Add D20 escapeMark for backslash-escape round-trip of structurally-ambiguous characters
  - Add R23 autolink/void-HTML guard for remark-mdx coexistence
  - Public MarkdownManager.parse()/serialize() API preserved — no consumer changes required

### Patch Changes

- 3eb50c2: fix(bridge): close Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). Server-side agent writes now follow the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` replaces `syncTextToFragment`). Client Observer A uses conditional baseline refresh when a local debounce is pending. Extracts `applyByPrefixSuffix` to `@inkeep/open-knowledge-core` for shared use. Hardens the bridge-testing harness (FR-11 invariant watcher, FR-12 origin probe, FR-15 Scheduler DI with clock unification, FR-16 network control, FR-17 multi-client convergence fuzzer with char-granular content oracle).
- e8f4dd8: Markdown pipeline engineering health — 21 P0 requirements landing across perf measurement, code refactors, fidelity fixes, test tightening, and CI infrastructure.

  **Perf measurement:** seeded synthetic benchmark corpus + committed harness with pinned methodology (10 warm-ups, `Bun.gc(true)`, `bun@1.3.11`); re-measured baseline at 7 block counts; per-stage profile harness + published findings; calibrated perf regression gate (`max(2× p99 variance, 10% floor)`) + parse-health gate (`parseFallback.wholeDoc === 0`) in tier-2 CI.

  **Code refactors:** R23 guard `O(n·m) → O(n log n)` via pre-indexed tag-offset map + binary search (568.88ms → 4.76ms on pathological corpus); processor caching at `MarkdownManager` construction + idempotency refactor for both `remarkMdxAgnostic` and `remarkWikiLink` attachers; 2-phase merged post-parse walker (Phase A restoration + Phase B merged dispatcher) gated by one-time byte-for-byte mdast diff validator on 714 fixtures; structural PM↔mdast fix — `hydrateMarks` outside-in greedy (library patch), `Code` mark `excludes: '_'` widened via `CodeMarkFidelity` (schema widening per precedent #9), context-aware backslash-before-entity policy.

  **Fidelity:** all 6 CommonMark serialization bugs fixed. CommonMark corpus 652/652 idempotent; `KNOWN_CRASH_CEILING` lowered from 50 to 0; all 19 formerly-NORMALIZE sections promoted to byte-identity idempotence assertion.

  **Test tightening:** NG1 + NG11 byte-identity pinning; I3's `markdownDoc` arbitrary parametric blank-line joiner; 6 new PBT invariants (emphasis-cumulation, backslash-idempotence, list-nesting, html-block-edge, link-edge, image-edge) green at 1K samples; `parseWithFallback` perf bound (≤5× happy-path) + parametric `MAX_SPLIT_DEPTH` boundary test.

  **Infrastructure:** all markdown fixtures consolidated into `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` with typed loader helpers; all 7 stale `@tiptap/markdown` references removed; three CI tiers (`ci.yml` / `nightly.yml` / `weekly.yml`) calibrated against measured baselines.
