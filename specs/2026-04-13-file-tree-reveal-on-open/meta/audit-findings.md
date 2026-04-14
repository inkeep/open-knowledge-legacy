# Audit Findings

**Artifact:** `specs/2026-04-13-file-tree-reveal-on-open/SPEC.md`
**Audit date:** 2026-04-13
**Total findings:** 5 (2 high, 2 medium, 1 low)

Scope: factual + coherence audit of a small UI behavior spec. Focus per instructions: code citations, React `useState` initializer behavior, `scrollIntoView({block:'nearest'})` semantics, `ux-interactions.e2e.ts:184-211` claim, six-entry-point enumeration, and internal Decision Log ↔ rest-of-spec coherence.

Baseline commit verified: `496a06d` matches current `HEAD` of branch `spec/file-tree-reveal-on-open`.

---

## High Severity

### [H] Finding 1: §13 Next actions contradicts D6 on useEffect deps

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** SPEC.md §13 (line 222) vs. §10 D6 (line 197)

**Issue:** §13 prescribes the implementation step `Add useEffect keyed on [activeDocName, documents] to union ancestors.` D6 LOCKED resolves the deps to `[activeDocName]` *only* — adding `documents` to the deps array is the exact regression D6 was created to prevent (re-firing on every 5s poll, overwriting manual collapses, breaking `ux-interactions.e2e.ts:184-211`).

**Current text (§13):** "Add `useEffect` keyed on `[activeDocName, documents]` to union ancestors."

**Current text (D6):** "Reveal effect fires on `activeDocName` change only; deps are `[activeDocName]`, not `[activeDocName, documents]`."

**Evidence:** `meta/_changelog.md` records this as an explicit correction during backlog probe ("D6 updated during negative-space extraction. Initial sketch had `useEffect(..., [activeDocName, documents])`...Corrected to `[activeDocName]` only."). The cascade did not reach §13.

**Status:** INCOHERENT
**Suggested resolution:** Update §13 line 222 to `Add useEffect keyed on [activeDocName] to union ancestors.` The implementer would otherwise follow §13's literal instruction and ship the regression.

---

### [H] Finding 2: §9 failure-modes table prescribes "retry on next documents update," contradicting D6

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** SPEC.md §9 (line 178) vs. §10 D6 (line 197); also reinforced by §14 Risks (line 242) which is *consistent* with D6

**Issue:** The failure-modes row for "Reveal effect / activeDocName not in tree yet" says recovery is `Effect retries on next documents update via dependency array`. This is the original-sketch behavior that D6 explicitly rejected. The Risks table (line 242) and Should-requirement (line 91, "added optimistically") both reflect the post-D6 design (no retry; ancestor strings pre-seeded into expandedPaths, folders render expanded once doc appears via natural re-render). Two competing models of how the race is handled now coexist in the spec.

**Current text (§9):** "Effect retries on next `documents` update via dependency array"

**Status:** INCOHERENT
**Suggested resolution:** Rewrite the recovery cell to match D6: e.g., "Ancestor paths are pre-seeded from the docName string; when the doc appears in `documents` on next poll, it renders inside already-expanded folders. No effect re-fire needed." Same fix applies to §8 known-gap line 123 ("Need retry-on-tree-update") which is also a stale pre-D6 statement.

---

## Medium Severity

### [M] Finding 3: §1 enumerates "Six navigation entry points" but the table also lists hash writes that aren't a #/<doc> navigation

**Category:** FACTUAL / COHERENCE
**Source:** T1 (codebase) + L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §1 (lines 15–24) and `evidence/navigation-flow.md` lines 21–26

**Issue:** Two small mismatches in the enumeration:

1. The §1 table lists `WikiLinkView.tsx:251/255/258/266` as a single row "Wiki-link click (WYSIWYG)", but line 266 is `handleCreated` (post-create-new-document navigation), not a wiki-link click. It is still an entry point that changes `activeDocName`, but characterizing it as "wiki-link click" is imprecise. Evidence file uses the broader phrase "wiki-link click variants."
2. Evidence file (`navigation-flow.md`) lists `FileSidebar.tsx:362` (post-delete clear: `window.location.hash = ''`) as a hash-write surface but spec §1 omits it. This omission is correct under the strict reading "writes `#/<docName>`" — line 362 writes `''` — but evidence inconsistently lists it. A reader cross-referencing the two files will be briefly confused about whether there are 6 or 7 entry points.

Neither error invalidates the design (the reveal effect is keyed on `activeDocName` change; D5 makes this entry-point-agnostic regardless of count). But the enumeration is load-bearing rhetoric for the "six entry points" framing.

**Status:** CONTRADICTED (mild)
**Suggested resolution:** Either (a) split WikiLinkView 266 into its own row "Post-create wiki-link nav" and clarify, or (b) loosen the row label to "Wiki-link click + create variants." Reconcile evidence file vs. SPEC count (note that 362 writes `''` and is therefore not counted; or include it with a note that it clears, not navigates).

---

### [M] Finding 4: §13 Next actions describes scroll-into-view ref keyed on activeDocName without restating D7's instant-vs-smooth split

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** SPEC.md §13 (line 223) and `evidence/sidebar-collapse-state.md` lines 98–100

**Issue:** D7 (LOCKED) prescribes `behavior: 'instant'` on the initial mount activation and `behavior: 'smooth'` on subsequent activations, tracked via `isInitialActivationRef`. §13 Next actions says only "Wire scroll-into-view ref keyed on `activeDocName`." The implementation sketch in `evidence/sidebar-collapse-state.md` (line 99) hard-codes `behavior: 'smooth'` and never references the `'instant'` initial-mount case. An implementer reading either the Next actions list or the evidence sketch would miss the D7 behavior split.

**Status:** INCOHERENT (omission)
**Suggested resolution:** Add a Next-action bullet referencing D7 ("track first-activation ref to choose `'instant'` vs `'smooth'`"). Update the evidence sketch comment or add a TODO line so the sketch doesn't silently embed a contradiction with D7.

---

## Low Severity

### [L] Finding 5: §1 cites `App.tsx:37` for the hashchange listener; the relevant useEffect spans 29–39

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** SPEC.md §1 (line 24); `App.tsx:29-39` (verified)

**Issue:** The cited line `App.tsx:37` is the `addEventListener` call. The full listener (with the navigation logic) is the useEffect block at lines 29–39. Evidence file already uses the more accurate `App.tsx:23-39` range (line 32 of evidence). Minor inconsistency between SPEC and evidence; both are technically pointing at the right surface.

**Status:** CONFIRMED-with-imprecision
**Suggested resolution:** Either accept as-is (the line is unambiguous) or update §1 to `App.tsx:29-39` for consistency with evidence.

---

## Confirmed Claims (summary)

**Code citations verified at HEAD (`496a06d`):**
- `FileSidebar.tsx:78-82` — `useState(() => ...)` initializer for `collapsed`. Confirmed.
- `FileSidebar.tsx:320` — post-rename `window.location.hash = #/${nextActiveDocName}`. Confirmed.
- `FileSidebar.tsx:418` — sidebar file click `window.location.hash = #/${docName}`. Confirmed.
- `FileSidebar.tsx:413` — `selectedPath={activeDocName}` prop threading. Confirmed.
- `FileSidebar.tsx` line 206 (re evidence) — `{node.children.length > 0 && !collapsed && ...}` short-circuit. Confirmed (lines around 168–215, exact line offset shifted by surrounding code; the construct exists and behaves as described).
- `GraphView.tsx:243` — `if (node.id) window.location.hash = #/${node.id}` inside `onNodeClick`. Confirmed.
- `BacklinksPanel.tsx:93` — `window.location.hash = #/${backlink.source}`. Confirmed.
- `WikiLinkView.tsx:251, 255, 258, 266` — four hash writes, all real (251/255/258 are click variants; 266 is post-create). Confirmed.
- `App.tsx:29-39` — single hashchange listener calling `openDocument(docNameFromHash())`. Confirmed.
- `DocumentContext.tsx:76-80` — `openDocument` calls `getPool().open()` + `setActive()`. Confirmed.

**Behavior claims verified:**
- React `useState(initializer)` runs the initializer only once at mount; prop changes do not re-invoke it. Confirmed (React docs, longstanding behavior).
- `scrollIntoView({block: 'nearest'})` is effectively a no-op when the element is already in view (CSSOM View Module §scroll-an-element-into-view: "nearest" produces minimum scroll delta to reveal; when fully visible the delta is zero). Confirmed.
- `ux-interactions.e2e.ts:184-211` covers the folder-row click toggle cycle (collapse → expand → navigate → collapse) for `sidebar-folder/nested-doc`. Confirmed exact line range.

**Coherence checks that passed:**
- §6 Should requirement (line 91), §14 Risks row 3 (line 242), and D6 (line 197) all describe the same post-D6 model (deps `[activeDocName]` only, optimistic ancestor seeding, no retry).
- D1/D2/D3/D5/D8 are mutually consistent and consistent with §9 design narrative.
- Non-goals (§3) and Future Work (§15) align — alias-aware reveal correctly classified as Explored.

## Unverifiable Claims

- Assumption A3 ("Manual folder toggles happen far less often than activations in practice") — empirical claim with no current data, marked MEDIUM confidence with a 2-week dogfooding verification plan. Appropriate handling for the spec's stage.
- Risk impact assessments (LOW/MEDIUM) in §14 — calibration-by-judgment; no factual error, not externally verifiable.
