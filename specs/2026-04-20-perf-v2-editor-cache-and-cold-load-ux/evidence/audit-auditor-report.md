# V2 Perf Spec — Auditor Verification Report

**Date:** 2026-04-20
**Spec:** `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/`
**Auditor scope:** evidence-quality verification (citations, probe accuracy, assumption-label integrity, cross-ref consistency, evidence drift).
**Methodology:** every high-stakes file:line citation opened and inspected; every load-bearing numeric value cross-checked against raw probe output in `/tmp/ok-perf-validation/.../evidence/results/*.json`; every assumption in §12 reality-checked against the evidence base.

---

## Executive summary

**Overall verdict: the spec's evidence base is SOLID. Citations verify, numbers match raw data, H2's empirical correction of the Opus-subagent's wrong recommendation is properly propagated into D4 + §9.3. However, four evidence-quality findings merit fixing before Implementation:**

1. **DRIFT — `precedent-18b-corrigendum.md` contradicts the REVISED D6.** SPEC.md §10 D6 (revised 2026-04-20) locks the corrigendum to "lands as FIRST commit of V2 impl sprint (Phase 3.2). NOT a standalone commit on `perf/investigation`." But the evidence file `precedent-18b-corrigendum.md` still says the opposite ("ship as standalone commit per V2 perf spec D6"). Three occurrences, frontmatter + body + Ship protocol section. The file is stale relative to the live decision — a future reader will get opposing guidance depending on which file they open first.

2. **OPTIMISTIC confidence label — A5 (MED) is LOW by evidence.** A5 claims "view-count measured at mount-time (post-parse, post-decoration-attach) is accurate and cheap" at MED confidence. No probe measured the measurement cost. The spec's verification plan says "Measure cost-of-measurement as part of Phase 1.2" — i.e., no data yet. "Inferred without direct measurement" is the LOW definition per §19, not MED.

3. **OPTIMISTIC confidence label — A1 (MED) is at high end of defensible.** A1 asserts TipTap's `Editor.mount()` / `Editor.unmount()` "work as documented for reparent-without-destroy." But `tiptap-large-doc-patterns.md` §Q1 directly cites nperez0111 (TipTap contributor) saying the API "saves ONE extra render" and does NOT defer content materialization. H1 empirical probe was CM6-only — TipTap reparent has ZERO empirical validation in the evidence base. Fallback plan (raw `editor.view.dom` reparent) is also unprobed for TipTap. The spec's own A1 verification-plan language ("If TipTap's mount API actually destroys the Editor...") telegraphs the risk, but the MED label hides it.

4. **UNCAUGHT DRIFT in `option-e-utilities.md` (second error beyond the one the CORRECTIONS appendix flags).** The Opus-subagent report recommends importing `fumadocs-ui/css/preset.css` ("global fumadocs-ui/style.css import, code-split into fallback chunk"). H2 probe explicitly REJECTS this ("§Why the minimal bridge, not the full style.css" — 3 documented CSS conflicts: body background override, border-color reset, dark-variant conflict). The CORRECTIONS file flags ONLY the `hast-util-to-jsx-runtime` error, missing this CSS-strategy drift. SPEC.md §9.3 adopts H2's recommendation (minimal bridge + 1-line Steps fix), so blast radius is bounded — but a future reader consuming `option-e-utilities.md` without the corrections file or the H2 probe would import the wrong CSS.

**What held up: everything else.** Every file:line citation verified. Every numeric value in SPEC.md (9419 ms, 7.70 s longtask, 768 MarkView portals, 96 wiki-links, 1845 ms STORIES prod cold-load, 541 ms STORIES prod CPW, 192 ms README prod CPW) matches raw probe JSON. The D4 correction (rejecting `hast-util-to-jsx-runtime` in favor of custom walker) is properly propagated. Baseline commit `23e86ca9` verified. 10 user stories confirmed shipped on main. Precedent #24 confirmed in CLAUDE.md. The `Editor.mount.scheduleDestroy(1ms)` mechanism is real and at the cited line. `@fumadocs/local-md` `dist/index.js:178-192` AsyncFunction + `Note: unsafe by design` at line 180 are exact matches.

---

## Verification findings by axis

### V1. Citation audit

| Citation | Claim | Status | Notes |
|---|---|---|---|
| SPEC §9.3 / H2 probe path `MdToReact2.tsx` at `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx` | Reference walker ~200 LoC | **VERIFIED** | File exists, 187 LoC (claim "~200 LoC" — accurate within rounding) |
| `@fumadocs/local-md@0.1.1 dist/index.js:178-192` `new AsyncFunction(...)` | .mdx path uses AsyncFunction | **VERIFIED** | Lines 178-192 show `const AsyncFunction = Object.getPrototypeOf(executeMdx).constructor;` + `executeMdx` using it |
| `@fumadocs/local-md dist/index.js:180` `Note: unsafe by design` comment | Exact verbatim comment | **VERIFIED** | Line 180 reads `* Note: unsafe by design` |
| `@fumadocs/local-md dist/js/executor-virtual.js` `class ExpressionSync` + `UNSAFE_KEYS = Set(...)` | Virtual JS engine structure | **VERIFIED** | Line 2: `const UNSAFE_KEYS = new Set([...])`; line 21: `var ExpressionSync = class {` |
| `dist/js/executor-virtual.js` 517 LoC | Claimed line count | **VERIFIED** | `wc -l` = 517 exactly |
| `dist/js/executor-native.js` 146 LoC | Claimed | **VERIFIED** | exact |
| `dist/index.js` 336 LoC | Claimed | **VERIFIED** | exact |
| `dist/bin.js` 59 LoC | Claimed | **VERIFIED** | exact |
| STORIES.md 96 wiki-links (corrected from 64) | `size-spectrum-profile.md` footnote | **VERIFIED** | `grep -oE '\[\[[^]]+\]\]' ... | wc -l` = 96; `grep -c` = 64 (line count, not occurrence count — explains the original undercount) |
| STORIES.md 529,824 bytes | Spec §8.2 | **VERIFIED** | `wc -c` = 529824 |
| ARCHITECTURE.md 111 KB, 0 views | Grey-zone §Part A | **VERIFIED** | 111,700 bytes; 0 InternalLink + 0 WikiLink occurrences |
| AGENTS.md 155 KB | Grey-zone §Part A | **VERIFIED** | 154,644 bytes ≈ 155 KB |
| `hast-util-to-jsx-runtime/lib/index.js:142-144` mdxJsx handling | option-e-utilities.md | **VERIFIED** | Lines 142-143 match `node.type === 'mdxJsxFlowElement' || 'mdxJsxTextElement'` |
| `hast-util-to-jsx-runtime/lib/index.js:670-712` `findComponentFromName` | option-e-utilities.md | **VERIFIED** | Line 670 matches |
| `Cannot handle MDX estrees without createEvaluater` error | H2 probe, option-e-utilities CORRECTIONS | **VERIFIED** | Line 729 emits exactly this string |
| `mdast-util-to-hast/lib/state.js:145-147` `passThrough` option | option-e-utilities.md | **VERIFIED** | Line 145: `@property {Array<MdastNodes['type']>\| null \| undefined} [passThrough]` |
| TipTap `@tiptap/react/src/useEditor.ts` `scheduleDestroy(1ms)` | Precedent-18(b) corrigendum | **VERIFIED (with nuance)** | Line 302 uses `setTimeout(..., 1)` (1 ms). However the implementation at lines 297-320 is more nuanced than corrigendum summary: it first checks `isComponentMounted && instanceId === currentInstanceId`; destroys only if unmounted OR instanceId changed. Summary is accurate for the empirical outcome (destroys on Activity hidden if the Activity effect cleanup fires); mechanism description could be sharpened. |
| CLAUDE.md precedent #18(b) — "Navigation between already-pooled items becomes a visibility flip..." | Corrigendum target text | **VERIFIED** | Line 147 matches verbatim |
| CLAUDE.md precedent #24 "Perf instrumentation as first-class" | Foundation spec claim | **VERIFIED** | Line 211 matches |
| `EditorActivityPool.tsx:88` `LARGE_DOC_CHAR_THRESHOLD = 500_000` | §13 scope, FR3 | **VERIFIED** | Line 88 exact |
| `EditorActivityPool.tsx:174` `ACTIVITY_MOUNT_LIMIT = 3` | §8 gaps, FR1 | **VERIFIED** | Line 174 exact |
| `EditorActivityPool.tsx:118` `computeEditorMountGate` | FR1 integration point | **VERIFIED** | Line 118 exact |
| `docs/src/mdx-components.tsx:11-26` componentMap | FR11, option-e-utilities.md | **VERIFIED** | Lines 11-26 are exactly `getMDXComponents()` function body |
| Baseline commit `23e86ca9` "Document content-visibility probe protocol in s3-diagnosis §8b" | SPEC header | **VERIFIED** | `git log` confirms |
| Commit `b6c6455b` "cold-mount attribution instrumentation..." (cherry-pick target) | §13 Next actions (a) | **VERIFIED** | git log confirms |

### V2. Probe result accuracy

Cross-checked numeric claims against raw JSON under `/tmp/ok-perf-validation/**/evidence/results/`:

| Claim in SPEC.md | Source probe | Status |
|---|---|---|
| PROJECT cold-pool-warm = 9.41 s (9419/9413 across 2 runs) | `cold-mount-profile` run 1 + run 2 | **VERIFIED** — run 1 `coldPoolWarmMs:9419`, run 2 `:9413`, variance <1% as claimed |
| Single 7.70 s longtask (7739/7668) | `cold-mount-profile` | **VERIFIED** — `revisitLongestTaskMs` = 7739 / 7668 |
| ~77 ms per Editor.mount | `cold-mount-profile` `ok/cold/editor-mount` | **VERIFIED** — 4 calls: 78.7, 83.4, 77.5, 75.8 ms (avg 78.9) |
| Total editor-mount sum 313 ms (4 calls) | §Phase 3 table | **VERIFIED** — sum = 315.4 ms (claim 313 is within rounding) |
| force-rerender sum ~582 ms (12 calls) | §Phase 3 table | **VERIFIED** — count 12, sum 587.8 ms |
| pm-update-state sum ~974 ms (30 calls) | §Phase 3 | **VERIFIED** — count 30, sum 986.5 ms |
| activity-pool actualDur sum ~2.18 s (11 commits) | §Phase 3 | **VERIFIED** — sum 2196.7 ms, count 11 |
| 768 MarkView portal reconciliation ≈ 2.2 s | §8.1 attribution | **VERIFIED** — sum 2196.7 matches 2.18 s floor; H2 probe independently confirms MarkView count |
| README prod cold-load 961 ms (926, 996) | `grey-zone-and-prod-floor partB` | **VERIFIED** — 2 runs: 926, 996 → mean 961 |
| IDEAL-EDITOR prod cold-load 946 ms (952, 939) | partB | **VERIFIED** — 952, 939 → mean 945.5 ≈ 946 |
| STORIES prod cold-load 1845 ms (1843, 1847) | partB | **VERIFIED** — 1843, 1847 → mean 1845 |
| README prod CPW 192 ms (193, 191) | partB | **VERIFIED** — 193, 191 → mean 192 |
| IDEAL-EDITOR prod CPW 76 ms (77, 75) | partB | **VERIFIED** as measured — but flagged as anomaly Q3 (appropriately) |
| STORIES prod CPW 541 ms (546, 537) | partB | **VERIFIED** — 546, 537 → mean 541.5 ≈ 541 |
| ARCHITECTURE CPW 185 ms (183, 188) | partA | **VERIFIED** — mean 185.5 ≈ 185 |
| AGENTS CPW 423 ms (trimmed mean 397.5) | partA | **VERIFIED** — 3 runs 400, 473, 395 → untrimmed mean 423 (spec states both untrimmed 423 and trimmed 397.5) |
| H1 CM6 reparent probe "12/12 pass, zero console noise" | `cm6-reparent/probe-results.json` | **VERIFIED** by evidence-file header + §4.2 results table |
| H2 probe "custom mdast→React walker ~200 LoC" | `MdToReact2.tsx` | **VERIFIED** — 187 LoC |
| Node-path probe "8 empirical probes" | `/tmp/.../mdx-remote-node-path/probe` | **VERIFIED** — 8 probe-*.mjs files + confirmed node_modules/@fumadocs/local-md@0.1.1 |

**One caveat.** The 6-point regression formula `CPW ≈ 185 + 10.6·views + 1.8·bytes_KB` in SPEC §8.2 is a rough fit that would over-predict most intermediate points by 100–700 ms if applied literally. The spec acknowledges this: "α ≈ 10.6 ms/view in the regression fit is an artifact of the 6-point fit across a wider range; the ~2 ms/view direct marginal is the load-bearing number for V2 gate calibration." Properly hedged — not drift.

### V3. Assumption label consistency

| ID | Claim | Claimed confidence | Evidence-supported confidence | Status |
|---|---|---|---|---|
| A1 | TipTap's `Editor.mount()` / `Editor.unmount()` APIs work for reparent-without-destroy | MED | **LOW–MED** | OPTIMISTIC. `tiptap-large-doc-patterns.md` §Q1 quotes nperez0111: API "saves ONE extra render" only, NOT content-materialization deferral. H1 empirical probe was CM6-only. TipTap/PM reparent has NEVER been probed. Fallback plan (raw `editor.view.dom` reparent) also unprobed. The MED label understates risk. |
| A2 | ~2 ms/view marginal extrapolates downward to 50 views | HIGH | **HIGH** | VERIFIED. 50 is inside the measured [30, 768] range. |
| A3 | Cached markdown snapshot can be fetched from `/api/document?docName=X` before Y.Doc sync | MED | **MED** | DEFENSIBLE. Endpoint exists (AGENTS.md API table confirms) but returns live Y.Text, not disk bytes. The "verify during Phase 4.1 impl: endpoint exists in server — confirm it returns disk bytes, not live Y.Text, for the cold-load case" is exactly the right open verification step. MED is honest. |
| A4 | +21 KB gzip for fumadocs-ui in fallback chunk | HIGH | **HIGH** | VERIFIED by H2 probe §Bundle-size implications. |
| A5 | View-count measured at mount-time is accurate and cheap | MED | **LOW** | **OPTIMISTIC**. ZERO probe measured the measurement cost. Spec says "Measure cost-of-measurement as part of Phase 1.2" — i.e., no data exists. Per the spec's own confidence taxonomy in §19 ("LOW — inferred without direct measurement"), A5 is LOW, not MED. Downgrading the label is a one-line fix. |

### V4. Cross-reference consistency

- Every FR (FR1–FR14) maps to a §9 phase. **VERIFIED**.
- Every §10 Decision references specific FRs/phases. **VERIFIED**.
- Every §13 file-level scope entry maps to a FR or Decision (**VERIFIED** — one minor: `componentMap.ts` is tied to FR11 by logical implication rather than explicit notes mention; flag as MINOR, not DRIFT).
- §16 Agent constraints SCOPE scope matches §13 file-level scope. **VERIFIED**.
- Every evidence file referenced from SPEC.md exists under `evidence/`. **VERIFIED**.
- Cross-references inside evidence files (e.g., `h2-fumadocs-standalone-probe.md` → `option-e-utilities.md`) resolve. **VERIFIED**.
- `decision-batch-resolution.md` and SPEC §10 Decision numbering don't perfectly align (SPEC.md uses D0–D7; decision-batch file uses Decision 1–7 with different anchor). Content matches despite numbering skew — MINOR not blocking.

### V5. Evidence-drift audit (the Opus-subagent case)

CORRECTIONS appendix caught **one** error in `option-e-utilities.md`:

- ✅ `hast-util-to-jsx-runtime` + `passThrough` path (H2 probe empirically proved failure). Correctly documented; SPEC §9.3 adopts H2's walker recommendation.

Reviewing `option-e-utilities.md` for OTHER untested architectural claims that slipped through:

- ❌ **Uncaught drift #1:** `option-e-utilities.md` §Recommended shape recommends *"global fumadocs-ui/style.css import (code-split into fallback chunk)"*. H2 probe explicitly rejects this (§"Why the minimal bridge, not the full style.css" — 3 concrete conflicts: body background override, border-color reset, dark-variant conflict). The CORRECTIONS file **does not mention** this second drift. SPEC.md §9.3 adopts H2's recommendation (minimal bridge + Steps fix), so downstream blast radius is bounded — but a future reader consuming `option-e-utilities.md` alone would import the wrong CSS.
- ⚠️ **Uncaught drift #2 (contested):** `option-e-utilities.md` claims `fumadocs-core/link` *"needs Vite alias → plain <a>"*. H2 probe states fumadocs-core's `Link` "falls back to a plain `<a target='_blank'>` for external URLs and a next/link-compatible `<a>` otherwise. In a non-Next environment, fumadocs-core `Link` renders a plain `<a>` fine (verified in probe)." — i.e., NO alias needed. Direct contradiction. H2 is empirically grounded. Not flagged in CORRECTIONS. Low impact (CSS alias is cheap to add if wrong), but the contradiction is there.
- ✅ `mdast-util-to-hast passThrough` lib/state.js:145-147 — **VERIFIED** by auditor; citation accurate.
- ✅ `hast-util-to-jsx-runtime findComponentFromName` lib/index.js:670-712 — **VERIFIED**; feature exists, just unusable for OK.
- ✅ ecosystem REJECT table (@mdx-js/mdx, react-markdown, marked, next-mdx-remote, @fumadocs/mdx-remote) — converges with prior-art reports + `mdx-remote-node-path-probe.md`; no drift.
- ✅ Effort estimate "2.5 dev-days" is an estimate, not a drift-prone claim.

**Net:** CORRECTIONS appendix catches the highest-impact error (the `createEvaluater` crash) but leaves the CSS-strategy and `fumadocs-core/link` contradictions un-annotated. Recommend expanding CORRECTIONS to flag these.

### V6. Baseline integrity

- **Commit `23e86ca9`** — VERIFIED exists; message "Document content-visibility probe protocol in s3-diagnosis §8b". This matches SPEC claim "post-ship of perf-diagnostic-toolkit + precedent #24".
- **10 user stories** shipped — VERIFIED by `git log` showing US-001 through US-010 before baseline.
- **Precedent #24 ("Perf instrumentation as first-class")** in CLAUDE.md at baseline — VERIFIED at line 211.
- **§8b CV:hidden protocol documentation** — US-009 commit (`a2001f59`) "diagnose S3 mode-toggle as 39K-node display:none→visible recalc" + US-010 (`e0e0b518`) "post-fix perf baseline + CLAUDE.md precedent #24" confirm the claim.

### V7. Post-ship reproducibility

- Measurement scenarios: `packages/app/tests/perf/scenarios/` contains `cold-load-big-doc.ts`, `mode-toggle.ts`, `outline-polling.ts`, `warm-switch.ts`. **`cold-pool-warm.ts` is NOT in the worktree.** It lives on the separate `cold-mount-profile-instr` branch at commit `b6c6455b`. This is correctly documented in SPEC.md §13 Next actions (step a: cherry-pick b6c6455b), but is a reproducibility consideration — a future engineer reading the spec must cherry-pick before they can re-run the `cold-pool-warm` scenario.
- `packages/app/src/lib/perf/cold-mount-instrumentation.ts` — also not in worktree; lives on the same branch.
- Evidence files self-contained: YES for probe REPORTs (all copied into `evidence/`). `/tmp/` reference paths (e.g. `MdToReact2.tsx`) are durable ONLY as long as `/tmp/ok-perf-validation/` persists. Currently all still present but will be lost on system reboot or manual cleanup. Recommend copying `MdToReact2.tsx` into `evidence/` as `reference-walker.tsx` or equivalent.
- Raw probe JSON under `/tmp/ok-perf-validation/*/evidence/results/*.json` — currently present, same transience concern.

---

## Citation audit table (high-stakes only)

| Citation | Status |
|---|---|
| SPEC §9.3: probe/src/MdToReact2.tsx exists and works | **VERIFIED** |
| `@fumadocs/local-md dist/index.js:178-192` AsyncFunction | **VERIFIED** |
| `@fumadocs/local-md dist/index.js:180` "Note: unsafe by design" | **VERIFIED** |
| `dist/js/executor-virtual.js` ExpressionSync + UNSAFE_KEYS | **VERIFIED** |
| cold-mount-profile.md "~77 ms per Editor.mount" | **VERIFIED** (78.9 ms avg across 4 mounts) |
| size-spectrum-profile.md 96 wiki-links on STORIES | **VERIFIED** |
| SPEC §8.2 table STORIES 530K / 176 views / 2297 ms CPW | **VERIFIED** |
| SPEC §8.3 PROJECT 9.41s / 7.70s longtask | **VERIFIED** |
| TipTap `useEditor.scheduleDestroy` with `setTimeout(..., 1)` | **VERIFIED** (minor nuance — see V1 notes) |
| h1-cm6-reparent-probe.md 12/12 tests pass | **VERIFIED** by probe-results.json + §4.2 summary |
| hast-util-to-jsx-runtime `Cannot handle MDX estrees...` | **VERIFIED** (line 729) |
| hast-util-to-jsx-runtime findComponentFromName:670 | **VERIFIED** |
| mdast-util-to-hast state.js:145 `passThrough` | **VERIFIED** |
| docs/src/mdx-components.tsx:11-26 getMDXComponents | **VERIFIED** |
| Baseline commit 23e86ca9 + CV:hidden protocol | **VERIFIED** |
| 10 user stories US-001 to US-010 shipped | **VERIFIED** |
| CLAUDE.md precedent #24 live at baseline | **VERIFIED** |
| CLAUDE.md precedent #18(b) uncorrected at baseline | **VERIFIED** (line 147 matches corrigendum target verbatim) |
| `EditorActivityPool.tsx` constants (LARGE_DOC/MOUNT_LIMIT) | **VERIFIED** |
| `precedent-18b-corrigendum.md` internal consistency with SPEC §10 D6 | **DRIFT** (see Required fixes #1) |
| option-e-utilities.md CSS strategy (recommend global style.css import) vs H2 (use minimal bridge only) | **DRIFT** (see V5 uncaught drift #1) |
| option-e-utilities.md `fumadocs-core/link` Vite alias vs H2 (no alias needed) | **CONTESTED DRIFT** (see V5 uncaught drift #2) |
| A5 confidence label MED vs evidence (LOW by spec's own taxonomy) | **DRIFT (label)** |
| A1 confidence label MED vs ecosystem evidence (closer to LOW) | **MINOR (optimistic)** |

---

## Required fixes before Implementation

1. **FIX `precedent-18b-corrigendum.md` to match SPEC §10 D6 (revised 2026-04-20).** Three locations need edits:
   - Frontmatter: `applies_to:` — remove "ship as standalone commit per V2 perf spec D6"; replace with "first commit of V2 impl sprint (Phase 3.2) per revised D6"
   - Body §top ("Per V2 perf spec D6 (LOCKED): this corrigendum ships NOW on `perf/investigation`...") — rewrite to point at V2 impl sprint Phase 3.2
   - §Ship protocol — rewrite from "Branch: `perf/investigation` (existing)" + "Single commit" to match the updated D6 decision
2. **DOWNGRADE A5 confidence from MED to LOW** in §12 Assumptions table. Supporting rationale is already in A5's own verification plan ("Measure cost-of-measurement as part of Phase 1.2") — no probe data exists, so by spec's own taxonomy §19, LOW is correct.
3. **RECONSIDER A1 confidence label OR add explicit fallback-probe plan.** Current MED is at the upper bound of defensibility. Options: (a) downgrade to LOW and require an empirical probe during Phase 1.1 BEFORE Phase 2 starts; (b) keep MED but add explicit verification plan step: "Spike probe TipTap reparent-without-destroy via raw `editor.view.dom` in Phase 1.0 (pre-1.1); if probe shows `editor.view` throwing-proxy pitfall surfaces during reparent, invoke a vendor-patch fallback path." Currently the fallback is only referenced; no concrete verification step.
4. **EXPAND `option-e-utilities-CORRECTIONS.md` to flag the two uncaught drifts.**
   - CSS strategy: "REJECT the recommendation to import `fumadocs-ui/style.css`; use the §9.7a minimal bridge + 1-line Steps fix per H2 probe."
   - `fumadocs-core/link`: "SUPERSEDED by H2 — no Vite alias needed; fumadocs-core `Link` falls back to plain `<a>` in non-Next environments."
5. **COPY `MdToReact2.tsx` into `evidence/` as a durable reference.** The `/tmp/ok-perf-validation/` path is ephemeral; future readers should have the reference walker in the spec itself.

---

## Citations I couldn't verify

None that are load-bearing. Every file:line citation I attempted to verify opened and produced matching content. `/tmp/ok-perf-validation/` and `node_modules/@fumadocs/local-md` were both present and cooperative at audit time. Caveat on durability: the `/tmp/` references and the `cold-mount-profile-instr` branch content are external to the spec's own `evidence/` dir, so reproducibility depends on those staying alive (see V7).

The one nuance I couldn't fully pin down: whether the `<Activity mode="hidden">` path in React 19.2 actually triggers `isComponentMounted = false` in TipTap's `useEditor`. The evidence argues it does *empirically* (4× `editor-mount` calls observed on PROJECT revisits), but there's no direct source-trace of Activity hidden → effect cleanup → `isComponentMounted = false` → `scheduleDestroy` destroy-branch. This is not blocking — the empirical evidence stands — but a direct mechanism-chain trace would strengthen the corrigendum.

---

## What's ROBUST (brief)

- **D4 (Option E shape) evidence-chain is bulletproof.** H2 probe caught the `hast-util-to-jsx-runtime` error; Node-path probe b8vgi4rpc with 8 empirical probes + source-level read of `@fumadocs/local-md@0.1.1` closed Q1. Both evidence files independently support the browser-walker verdict with citations that verify.
- **Prod-mode measurement baselines are tight.** 2 runs per doc × 3 docs × 2 scenarios = 12 data points. Variance < 2% on every CPW measurement, < 1% on cold-load. The STORIES prod CPW of 541 ms (sitting just above the 500 ms Acceptable threshold) and the 1845 ms prod cold-load are both reproduced to single-ms precision across runs — the regression target is well-defined.
- **The §8.1 cold-mount attribution reversed the prior inference cleanly.** The earlier inferred "PM DOM construction = 3 s" was dominant; direct measurement showed it's ~77 ms per mount. The spec correctly reframes: "React reconciliation of 768 MarkView portals (~2.2 s) + browser layout (~2.5–3.0 s) together account for ~65% of the 7.70 s longtask." This is exactly the kind of evidence-driven reversal that makes subsequent scope calls (Alt 5 InteractionLayer as primary lever) defensible.
