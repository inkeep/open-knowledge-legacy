# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-21-editor-mode-persistence/SPEC.md`
**Audit date:** 2026-04-21
**Total findings:** 11 (3 HIGH, 5 MEDIUM, 3 LOW)

Coverage: all 7 coherence lenses (L1-L7), all 5 factual tracks (T1-T5). Codebase verification performed against baseline commit `c29a5a14`. Evidence files d1-d8 read in full.

---

## High Severity

### [H1] Cross-window-sync effect silently overrides `modeBeforeDiffRef` restoration on diff exit

**Category:** COHERENCE (internal logic)
**Source:** L1 (cross-finding contradiction between §7.4 code and §7.5 table)
**Location:** §7.4 (Integration at `EditorPane`) + §7.5 row "Handle exit preview" + R1 mitigation + AC for FR-6 / E2E T5

**Issue:** The proposed integration code has a latent logic bug that will break FR-6 whenever the user's persisted preference differs from their pre-diff session mode. The `useEffect(..., [persistedMode, editorMode])` guard `if (editorMode === 'diff') return;` only runs at effect execution time, which is AFTER `editorMode` has already been updated by `handleExitPreview`'s `setEditorMode(modeBeforeDiffRef.current)`. The next effect run will therefore pass the guard and call `setEditorMode(persistedMode)`, overriding the session pre-diff restoration.

Concrete failure trace:
1. User preference is WYSIWYG (persisted). User is in WYSIWYG. `persistedMode === 'wysiwyg'`, `editorMode === 'wysiwyg'`.
2. User toggles to Source via the header → `setEditorMode('source')` + `setPersistedMode('source')`. Now `persistedMode === 'source'`, `editorMode === 'source'`. Effect re-runs, guard passes, `setEditorMode('source')` — no-op. OK.
3. User enters diff → `modeBeforeDiffRef = 'source'`, `setEditorMode('diff')`. Effect re-runs, guard `editorMode === 'diff'` returns. OK.
4. A cross-tab flip happens in Tab B (user flips to WYSIWYG in Tab B) → `storage` event fires in Tab A. Hook's handler calls `setMode('wysiwyg')` in Tab A → `persistedMode === 'wysiwyg'`. Effect re-runs in Tab A, `editorMode === 'diff'`, guard returns. OK.
5. User exits diff in Tab A → `setEditorMode('source')` (from `modeBeforeDiffRef.current`). Effect re-runs, `editorMode === 'source'`, guard passes (not diff), `setEditorMode('wysiwyg')`. **Session pre-diff Source mode is lost** — user sees WYSIWYG despite FR-6's "exiting diff SHALL restore the session pre-diff mode."

This directly contradicts FR-6 AC ("If user is in Source, enters diff, exits diff → returns to Source") whenever cross-tab activity happens during diff. §7.5 claims "Handle exit preview" behavior is "Unchanged" — it is not unchanged; the new effect now competes with it.

Even without cross-tab activity, the same pattern is reachable if `RAW_MDX_NAV_EVENT` fires during diff (per §7.5 the RAW_MDX handler "persists to localStorage") — though the spec's §7.4 integration code does not actually show `onRawMdxNav` being updated to call `setPersistedMode`, so the spec is internally inconsistent on this point as well.

**Current text (§7.4):**
```typescript
useEffect(() => {
  if (editorMode === 'diff') return;
  setEditorMode(persistedMode);
}, [persistedMode, editorMode]);
```

**Evidence:** `packages/app/src/components/EditorPane.tsx:80-84` (current `handleExitPreview`); the §7.4 integration effect; R1 mitigation claim; E2E T5 definition (does not cover cross-tab-during-diff).

**Status:** INCOHERENT

**Suggested resolution:**
- Drop `editorMode` from the effect's dependency array (only re-run on `persistedMode` change), OR
- Add an explicit `modeBeforeDiffRef.current` synchronization after diff exit (also set `modeBeforeDiffRef.current = persistedMode` on cross-tab flip), OR
- Guard the effect on a separate ref that tracks "last applied persistedMode" so diff exit doesn't trigger re-application.
Also add an E2E case covering cross-tab flip DURING diff + subsequent diff exit — this is the specific hole in T5.

---

### [H2] FR-4 acceptance criterion cites Playwright "dual-context" test; Playwright `BrowserContext`s do not share localStorage by default

**Category:** FACTUAL (T4/T5 — web verification of tool capability)
**Source:** T4 (Playwright BrowserContext isolation semantics)
**Location:** §6.1 FR-4 AC, §8.3 T3 description

**Issue:** FR-4's AC says "In a Playwright dual-context test: flip mode in context A, observe context B's editor switches without any user action." But Playwright's [`BrowserContext` is by design an isolated "incognito-like session"](https://playwright.dev/docs/api/class-browsercontext) with its own storage state — contexts do NOT share localStorage with each other unless you explicitly load a shared `storageState` file or reuse the context. The `storage` event also does not cross context boundaries in Chromium.

The correct Playwright primitive for testing cross-tab storage-event sync is:
- One `BrowserContext` (`browser.newContext()`)
- Two pages inside it (`context.newPage()` × 2), which share localStorage and will dispatch `storage` events across each other.

OR for cross-window Electron testing:
- `@playwright/test` electron mode (`_electron.launch()`) + two BrowserWindow instances — which do share localStorage per D3/D6 evidence.

The current wording in FR-4 AC is contradicted by Playwright's own semantics and would cause the E2E test to fail-for-the-wrong-reason. §8.3 T3 has the same issue in weaker form ("Open same doc in tabs A and B" — if "tabs" means contexts, same bug; if "tabs" means pages in the same context, the AC works).

**Current text (FR-4 AC):** "In a Playwright dual-context test: flip mode in context A, observe context B's editor switches without any user action."

**Evidence:** Playwright API documentation for `BrowserContext`; D8 evidence file line 46-48 (next-themes pattern requires same-origin sharing, which is a storage-level semantic Playwright contexts break).

**Status:** CONTRADICTED (by Playwright semantics)

**Suggested resolution:** Reword FR-4 AC to "one BrowserContext, two Pages" or explicitly say "two BrowserWindows sharing the same context" (for Electron). Update §8.3 T3 likewise. If the goal is to exercise Electron-multi-window behavior, prefer the `_electron.launch()` + 2-BrowserWindow variant — that's the scenario driving the spec anyway (per §1 Complication + §2 Multi-window Electron user persona + A3).

---

### [H3] A3 assumption's confidence label (HIGH) is stronger than the evidence supports; evidence only covers localStorage sharing, not `storage` event dispatch across BrowserWindows

**Category:** COHERENCE (L2 confidence-prose misalignment) + FACTUAL (T4)
**Source:** L2, plus T4 web verification
**Location:** §12 A3

**Issue:** A3 claims "`storage` event fires reliably across Chromium BrowserWindows in Electron" at HIGH confidence, justified by "Chromium web standard; Electron uses upstream Chromium. Documented in research D6." But D6 evidence (verified by direct read) ONLY documents that localStorage is LevelDB-backed and origin-shared across BrowserWindows. D6 says nothing about the `storage` event specifically firing across BrowserWindows — only across same-origin pages.

The `storage` event is a DOM spec (not an Electron spec); in Chromium browser it fires on *other Window objects from the same origin*. For Electron-multi-window, the question of whether separate BrowserWindows count as "other Window objects from the same origin" is empirically TRUE (ad-hoc web verification confirms this), but this is not actually "documented in research D6." The evidence-to-claim mapping is weaker than stated.

Not wrong, but overconfident. The spec should either cite a correct source (I verified it works via web search but the spec references a source that doesn't say so), or downgrade confidence to MEDIUM + plan to verify in the E2E test harness.

**Current text (A3):** "Chromium web standard; Electron uses upstream Chromium. Documented in research D6."

**Evidence:** D6 evidence file — no mention of `storage` event; only localStorage LevelDB-sharing. D8 evidence file line 206-207 mentions storage-event adoption across tabs but not BrowserWindows.

**Status:** INCOHERENT (citation misattribution); external claim itself (storage event fires across BrowserWindows) is likely CORRECT per ad-hoc verification but not covered by cited evidence.

**Suggested resolution:** Either (a) add a standalone verification task to the spec's assumption-verification plan (run a small E2E probe that opens 2 Electron BrowserWindows, writes localStorage in one, asserts `storage` event fires in the other — and only then lock A3 to HIGH), or (b) downgrade A3 to MEDIUM with a "to-verify in E2E harness" breadcrumb, or (c) cite a source that actually documents the cross-BrowserWindow `storage` event behavior (Electron docs or Chromium spec).

---

## Medium Severity

### [M1] FR-2 acceptance criterion ("first frame, no flash") is not actually proven by the cited Playwright technique

**Category:** COHERENCE (L7 evidence-claim mapping)
**Source:** L7 + T4
**Location:** §6.1 FR-2, §8.3 T1

**Issue:** FR-2 AC states "Source editor is visible on first frame; WYSIWYG is never visible during mount. Verified via Playwright with `waitForLoadState('load')` + immediate DOM query." But `waitForLoadState('load')` fires after all dependent resources have loaded — which is AFTER React has had time to render. An intermediate WYSIWYG flash that lasted a few ms could easily be invisible to that timing. To prove "no flash" you need either (a) video-capture + frame-by-frame analysis, (b) a unit-level assertion on the useState initializer (which doesn't need Playwright), or (c) asserting on a `data-editor-mode` attribute or pre-render class that was set by the inline script — and proving no WYSIWYG-coded DOM node existed prior to the paint.

The proposed AC is a necessary condition for no-FOUC but not sufficient. Passing it does not prove FR-2. The weak link: `waitForLoadState('load')` is not "first frame."

**Current text:** "Verified via Playwright with `waitForLoadState('load')` + immediate DOM query."

**Evidence:** Playwright docs on `waitForLoadState`; MDN on `load` event timing.

**Status:** INCOHERENT (AC too weak to prove claim)

**Suggested resolution:** Either (a) sharpen the AC — assert that the inline script has set `window.__OK_EDITOR_MODE__` before `DOMContentLoaded` and that the first-rendered WYSIWYG/Source DOM subtree matches the persisted pref, or (b) add a unit-level test that reproduces the FOUC-prevention contract at the `useState` initializer level (no Playwright needed), or (c) drop the "first frame" claim and reframe FR-2 as "the initial React mount uses the persisted mode" — which is testable via a React rendering test rather than Playwright timing.

---

### [M2] NFR-1 references a "baseline" with no pointer to the perf-baseline mechanism required by CLAUDE.md

**Category:** COHERENCE (L5 summary-implementation gap)
**Source:** L5
**Location:** §6.2 NFR-1

**Issue:** NFR-1 AC says "Playwright perf test shows no regression against baseline." But per CLAUDE.md (reference: `packages/app/tests/stress/perf-baseline.json` + `packages/app/tests/stress/perf-baseline-update.md`), perf baselines in this repo have a specific shape (keyed per-test like `qaXXX`) and a strict update protocol ("captured from median-of-5 p50 across consecutive post-merge CI runs"). The spec does not reference this mechanism, does not name a perf test, and does not propose a new baseline key. "No regression" is therefore unverifiable as currently specified.

Given inline script access to localStorage is documented in D4 as "< 1 ms," the spec could reasonably choose to drop NFR-1's "Playwright perf" test and instead ship a unit-level perf assertion (e.g., measure `localStorage.getItem` timing). The current AC is unimplementable without baseline plumbing that isn't scoped.

**Current text:** "Inline script executes in < 1 ms (localStorage access is microseconds; single read + single attribute set). Playwright perf test shows no regression against baseline."

**Evidence:** CLAUDE.md lines around "E2E perf baselines" (~line 90); `packages/app/tests/stress/perf-baseline.json` existence.

**Status:** UNVERIFIABLE as specified

**Suggested resolution:** Either (a) drop the Playwright perf test from NFR-1 and assert the microsecond-bound via a unit benchmark, or (b) explicitly add a new `qaXXX` key to the perf-baseline system + scope the update-protocol follow-up, or (c) downgrade NFR-1 to a soft observation ("no expected perf impact").

---

### [M3] NFR-4 acceptance criterion depends on Electron-packaged Playwright harness that does not exist in repo

**Category:** COHERENCE (L5 + scope leak)
**Source:** L5, T1
**Location:** §6.2 NFR-4

**Issue:** NFR-4 AC says "Playwright runs pass in both `bun run dev` web mode and Electron packaged build smoke." But the repo's desktop package (`packages/desktop`) has `build:mac:unsigned` for local DMG smoke tests, and CLAUDE.md describes this as a manual post-build smoke test, not an automated Playwright run. There is no existing `_electron.launch()` or equivalent Playwright-Electron harness in `packages/app/tests/`.

This means NFR-4's AC either (a) requires scoping-in new infrastructure (automated Electron-Playwright harness) that the §5.1 scope row S6 does not include, OR (b) will be verified manually — which the spec should explicitly say. As written, NFR-4 is either understated-scope or unverifiable.

Note: this is a scope-leak concern, not a technical impossibility. Playwright does support Electron via `_electron.launch()`, but setting it up as new infrastructure would be a meaningful addition that the spec's "In Scope" table does not list.

**Current text:** "Playwright runs pass in both `bun run dev` web mode and Electron packaged build smoke."

**Evidence:** CLAUDE.md "Package: desktop" section + "Running locally" subsection; `packages/desktop/package.json` scripts.

**Status:** UNVERIFIABLE as specified OR scope leak

**Suggested resolution:** Either (a) explicitly note that NFR-4 Electron verification is manual-QA (not automated Playwright), dropping the "Playwright runs pass" claim, or (b) add infrastructure scope to S6 (an `_electron.launch()` harness) + scope it properly. Option (a) matches the spec's §9 Rollout pragmatism; option (b) is a substantial scope expansion.

---

### [M4] `RAW_MDX_NAV_EVENT` integration is described in §7.5 "Behavior after" but not shown in §7.4 integration code

**Category:** COHERENCE (L1 cross-finding contradiction)
**Source:** L1
**Location:** §7.4 integration vs §7.5 table row 2

**Issue:** §7.5 row 2 claims the RAW_MDX_NAV_EVENT listener's behavior after this spec will be "`setEditorMode('source')` + persists to localStorage." But §7.4 shows only the modified `handleModeChange` and the cross-window sync effect — the current `onRawMdxNav` handler in `packages/app/src/components/EditorPane.tsx:93-99` is NOT modified in the spec's proposed code. If an implementer follows §7.4 literally, RAW_MDX_NAV behavior will be "unchanged" (only `setEditorMode('source')`, no persist) — contradicting §7.5.

This is a silent divergence in the spec itself. An implementer must either (a) infer the §7.5 change and add `setPersistedMode('source')` to `onRawMdxNav`, or (b) follow §7.4 literally and leave RAW_MDX_NAV unchanged. Which is it?

Minor sub-concern: persisting 'source' on RAW_MDX_NAV changes the user's preference based on a system-triggered event (clicking a fallback node). The spec argues "MATCHES user intent" but this is debatable — the user may have been forced into source to fix a parse error and not mean to set their global preference. Worth explicitly deciding in the spec.

**Current text:** §7.5 row 2: "`setEditorMode('source')` + persists to localStorage (so if user leaves source via this event, it becomes their new preference) — MATCHES user intent"

**Evidence:** `packages/app/src/components/EditorPane.tsx:93-99` (current onRawMdxNav); spec §7.4 code samples (do not show this change).

**Status:** INCOHERENT (self-contradictory)

**Suggested resolution:** Pick one:
- (a) Explicitly update §7.4 integration code to show the modified `onRawMdxNav` calling `setPersistedMode('source')`, OR
- (b) Change §7.5 to say RAW_MDX_NAV behavior is unchanged (session-only flip, not persisted — likely the safer UX choice for a system-triggered mode switch).

---

### [M5] `ok-theme-v1` cited as the repo's existing inline-FOUC precedent but is NOT an inline-FOUC script

**Category:** FACTUAL (T1 codebase) + COHERENCE (L4 evidence-synthesis fidelity)
**Source:** T1, L4
**Location:** §7.2 "Pattern mirrors next-themes' ThemeScript (documented in research D4 evidence)"; §16.2 baseline code references ("`packages/app/src/main.tsx:48` — `ok-theme-v1` precedent (next-themes)")

**Issue:** The spec treats `ok-theme-v1` as a precedent for the inline-FOUC script pattern it proposes to add. Direct read of `packages/app/src/main.tsx:48` shows `ok-theme-v1` is only the `storageKey` prop passed to next-themes' `ThemeProvider` — there is NO inline FOUC script for theme in the repo's `index.html` (verified by direct read of `packages/app/index.html`; only `<meta name="color-scheme" content="light dark" />` + the root div + the module script).

D4 evidence (line 64-71) caught this discrepancy explicitly: "CLAUDE.md previously documented an inline FOUC script for theme — but the actual file is minimal; `next-themes` handles theme FOUC internally via its `ThemeScript` component. For editor mode, no equivalent exists today."

The spec's §16.2 characterization of `main.tsx:48` as the "`ok-theme-v1` precedent (next-themes)" is precise. But §7.2's "Pattern mirrors next-themes' ThemeScript" suggests the mirroring is of an already-present in-tree pattern, when in reality it's the first inline FOUC script to land in this repo's `index.html`. CLAUDE.md's own claim (its theming section near line 420: "`index.html` inline script reads `localStorage('ok-theme-v1')`") is itself stale/incorrect — this spec risks propagating the stale claim.

This does not invalidate the proposed design (which is correct — the inline script pattern IS next-themes' approach, just delivered via a React component rather than an index.html script). But the characterization "matches repo convention" is misleading: for localStorage KEY NAMING, yes (`ok-*-v1` shape); for FOUC SCRIPT DELIVERY, no — this would be the first in-repo.

**Current text (§7.2):** "Pattern mirrors next-themes' ThemeScript (documented in research D4 evidence), but hand-rolled for one key instead of importing a library."
**Current text (D5 in Decision Log):** "Matches repo convention (`ok-theme-v1`, `ok-pin-v1`)."

**Evidence:** `packages/app/index.html` (current, 18 lines — no inline script); `packages/app/src/main.tsx:48` (storageKey only); D4 evidence file lines 64-71.

**Status:** INCOHERENT (partial misattribution of precedent)

**Suggested resolution:** Reword §7.2 to be explicit — "Pattern mirrors next-themes' `ThemeScript` component (which is next-themes' own internal inline-script injection). We hand-roll the equivalent script in `index.html` for editor mode because (unlike theme) there's no library to import." In the Decision Log D5, clarify that the `ok-*-v1` convention precedent is for KEY NAMING, while the inline-FOUC-script pattern is NEW to this repo's `index.html`. Also surface a note that CLAUDE.md's claim about an inline FOUC script for theme is stale — worth flagging for a follow-up corrigendum per CLAUDE.md's own post-ship protocol.

---

## Low Severity

### [L1] `previousDocName` / `onNavigateBack` / `onRecycle` props appear in `DocumentErrorBoundary` but not in the EditorPane's current usage per spec §16.2

**Category:** FACTUAL (T1 codebase)
**Source:** T1
**Location:** §16.2 Related PRs / baseline code references

**Issue:** Minor — not a spec defect per se, but §16.2 enumerates baseline code references as "complete" for context; the `EditorActivityPool`-level integration (which the spec explicitly says is a "consumer unchanged") has evolved beyond what the spec's reference list captures. This doesn't affect correctness; flagging only for future-reader orientation.

**Evidence:** `packages/app/src/components/EditorActivityPool.tsx:307-338` (visible in direct read) — `DocumentErrorBoundary` consumes `previousDocName`, `onNavigateBack`, `onRecycle` which tie back to `EditorPane` via DocumentContext, not via direct prop passing.

**Status:** CONFIRMED (not contradicted); reference list is incomplete but not wrong.

**Suggested resolution:** Optional — no action required for this spec. If a future maintainer finds §16.2 useful as an orientation document, expand it; otherwise leave as-is.

---

### [L2] Spec title says "Persistence" but the persisted quantity is also auto-synced across windows — "Persistence & Cross-Window Sync" would be more accurate

**Category:** LOW (L5 summary coherence)
**Source:** L5
**Location:** Title

**Issue:** The title "Editor Mode Persistence" emphasizes persistence-across-reload, but FR-4 + §7.3 storage-event handler + R4 explicitly scope LIVE auto-apply cross-window sync as a first-class feature. A reader who skims only the title may miss the cross-window-sync behavior. Not a defect, just a discoverability note.

**Current text:** "# Editor Mode Persistence"

**Status:** CONFIRMED (minor presentation)

**Suggested resolution:** Optional retitle to "Editor Mode Persistence & Cross-Window Sync" or similar. Or leave as-is and rely on §1 Resolution for full framing.

---

### [L3] D2 decision rationale cites next-themes for "what user last chose" framing; next-themes actually supports `system` / `auto` mode

**Category:** LOW (L4 evidence-synthesis precision)
**Source:** L4
**Location:** §10 Decision Log D2

**Issue:** D2 rationale says "Matches next-themes' pattern of 'what user last chose.'" next-themes explicitly supports an `auto` / `system` tier (it's the whole point of the `enableSystem` flag — see main.tsx:46). The accurate framing would be: "next-themes supports `system` because OS-level light/dark signal exists; editor mode has no analogous OS signal, so we don't ship a `system` tier."

Not wrong in outcome, just imprecise in rationale. Unlikely to cause implementation confusion.

**Current text:** "Matches next-themes' pattern of 'what user last chose.'"

**Evidence:** `packages/app/src/main.tsx:45-46` (`defaultTheme="system"`, `enableSystem`).

**Status:** INCOHERENT (minor rationale slip, correct conclusion)

**Suggested resolution:** Rephrase D2 to: "No OS-level 'editor mode' signal exists. next-themes ships `system` because `prefers-color-scheme` exists; no analog for editor mode means `system` would just be another name for a hardcoded default — no value."

---

## Confirmed Claims (summary)

Spot-checked and verified during the audit; no action needed:

**Codebase (T1):**
- A1 verified: no `session.fromPartition` in `packages/desktop/src/main/window-manager.ts` (direct read, 483 lines, zero matches for `session.` or `fromPartition`)
- `EditorPane.tsx:23` — `EditorMode` type definition confirmed at exact line
- `EditorPane.tsx:26` — `useState<EditorMode>('wysiwyg')` confirmed at exact line
- `EditorPane.tsx:41` — `modeBeforeDiffRef` confirmed at exact line
- `EditorPane.tsx:126` — `handleModeChange` confirmed at exact line
- `main.tsx:48` — `storageKey="ok-theme-v1"` confirmed
- `DocumentContext.tsx:114` — `PIN_STORAGE_KEY = 'ok-pin-v1'` confirmed
- `EditorHeader.tsx:477` — `onModeChange(v === 'source' ? 'source' : 'wysiwyg')` confirmed
- `EditorActivityPool.tsx:319` — `isSourceMode ? 'h-full' : 'hidden'` CSS class swap confirmed
- `packages/app/package.json` `test:e2e` script takes explicit file list — spec's "add the new file" claim is verifiable
- `packages/app/tests/stress/fr-7a-disconnect-source-mode.e2e.ts` exists (FR-7a existing behavior)
- `reports/source-toggle-architecture/` directory exists (cross-reference valid)

**External (T3/T4/T5):**
- next-themes storage-event handler at 16 lines — verified via direct quote in D8 evidence matches their canonical source
- tldraw `BroadcastChannel` approach verified via D8 evidence + source link
- Excalidraw focus-based pattern verified via D8 evidence + issue link
- VS Code "Reload Window required" behavior verified via D8 + D3 evidence
- Obsidian `obsidian-force-view-mode-of-note` plugin precedent verified via D7 evidence
- HedgeDoc URL-as-state pattern verified via D1/D5 evidence
- Electron localStorage LevelDB-shared-across-BrowserWindow verified via D6 evidence + ad-hoc web search (confirmed both: localStorage and storage-event firing across BrowserWindows — see H3 for the attribution fix needed)

**Coherence (lenses):**
- L6 stance consistency: spec maintains a prescriptive stance throughout, appropriate for a spec artifact (distinct from the underlying research report's factual stance). No drift.
- The artifact overall is well-structured and internally disciplined; most findings are edge-case precision issues rather than foundational errors.

---

## Unverifiable Claims

- **The `storage` event behavior across Electron BrowserWindows (A3)** — web search confirms general consensus but no citation in the spec's evidence files directly supports the cross-BrowserWindow `storage` event dispatch (distinct from localStorage sharing). See H3.
- **NFR-1's "< 1 ms inline script" claim at absolute level** — likely true (localStorage.getItem is microseconds, a single attribute write is trivial), but no benchmark data in the spec or evidence files. Unverifiable from the spec alone; likely fine in practice.
- **NFR-3's "Bundle size delta < 500 B compiled"** — likely true for ~50 lines of TypeScript but not proven without compiling; unverifiable from the spec alone.

---

## Summary

The spec's core design is sound and mostly coheres with its evidence base. The three HIGH-severity findings all concern **the edge cases where specification meets implementation**: H1 is a latent logic bug in the proposed `useEffect`; H2 is a Playwright API mismatch in an acceptance criterion; H3 is a confidence overstatement.

The five MEDIUM findings are about acceptance-criterion rigor (M1, M2, M3), implementation divergence between §7.4 and §7.5 (M4), and precedent misattribution (M5).

LOW findings are minor polish items.

No findings invalidate the spec's core D1-D8 decisions — those are well-grounded in the research. The spec can land with HIGH/MEDIUM findings addressed; LOW findings are optional polish.
