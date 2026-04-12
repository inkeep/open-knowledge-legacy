# Post-Merge Audit Findings

**Artifact:** specs/2026-04-08-typed-component-nodes/SPEC.md
**Audit date:** 2026-04-08
**Trigger:** PR #7 (`8e3845d feat: presence & awareness UX`) merged after spec was finalized at baseline `5597eb7`. Spec depends on observer architecture that PR #7 substantively changed.
**Total findings:** 7 (3 high, 3 medium, 1 low)
**Scope:** Decision-implicating findings only — prior coherence audit (`audit-findings.md`) addressed text-level issues. This audit re-examines the spec against the new code reality.

---

## High Severity

### [PM-H1] Prop panel edits bypass the new typing-defer mechanism — Phase 2 has an unaddressed concurrent-write race

**Category:** FACTUAL (decision-implicating)
**Source:** T1 (Own codebase trace)
**Location:** SPEC.md §3.6 (Prop Panel UI) + §6 In Scope ("Observer sync compatibility (no changes to observer layer)") + §11 Risks (R6)

**Issue:** PR #7 introduced `markUserTyping()` (observers.ts:66) as the *sole* signal that tells Observer B to defer its destructive `updateYFragment` while the user is editing. The function is called only from DOM event listeners on `editor.view.dom` (keydown, paste, drop, cut — TiptapEditor.tsx:171-183). The spec's D14 prop panel is a popover. `init_spike/src/components/ui/tooltip.tsx:34` already uses Radix `*Primitive.Portal`, and a Radix Popover (the natural primitive for D14) will likewise portal to `document.body`. Keydown and click events inside a portaled popover do NOT bubble to `editor.view.dom`, so prop panel mutations never call `markUserTyping()`.

**Concrete race:**
1. T=0: User clicks dropdown in popover → React onChange → `editor.commands.updateAttributes('jsxComponentEditable', { type: 'error' })` → ProseMirror tr → XmlFragment delta. Observer A debounces 50ms.
2. T=0: Concurrently, agent POSTs `/api/agent-write-md` → `dc.document.transact(() => ytext.insert(...), 'agent-write')`. Observer B debounces 50ms.
3. T=50: Whichever observer fires *first* defines the outcome.
   - **If Observer B fires first** (no typing-defer because `lastUserTypedAt === 0`): it serializes the *current* XmlFragment (which has the user's prop change) into `currentBody`, compares to `body = ytext.toString()` (which has the agent's content but not the user's prop change). They differ → early-exit misses → `updateYFragment(parse(body))` runs → XmlFragment is **replaced** with the parsed agent state, which has `type="warning"` (the old prop value, not the user's change). The user's prop change is silently lost.
   - The TYPING_DEFER_MS guard that protects keystroke edits does not protect prop panel edits.

**Evidence:**
- `init_spike/src/editor/observers.ts:66-68` — `markUserTyping()` is the only mechanism that updates `lastUserTypedAt`
- `init_spike/src/editor/observers.ts:276-282` — Observer B's defer condition is gated entirely on `Date.now() - lastUserTypedAt < TYPING_DEFER_MS`
- `init_spike/src/editor/TiptapEditor.tsx:171-183` — `markUserTyping` is bound only to `editor.view.dom` keydown/paste/drop/cut events
- Radix Popover (Tiptap UI patterns) renders into a portal — events do not bubble to the editor DOM
- `init_spike/src/editor/observers.ts:288-301` — Observer B early-exit only fires when `currentBody === body` byte-for-byte; if they differ at all, `updateYFragment` runs and replaces the tree

**Why it matters:** This contradicts the spec's §6 In Scope claim "Observer sync compatibility (no changes to observer layer)" and §13 EXCLUDE "The server-side persistence and observer layers should require ZERO changes." A correct fix requires *either* (a) Phase 2 wires every prop panel mutation to call `markUserTyping()` before/during `updateAttributes`, *or* (b) the observer layer changes its defer signal from "user typed via DOM" to "any local non-sync XmlFragment transaction". Both options modify the bargain the spec made with the observer layer.

**Status:** STALE (the spec's "no observer changes" claim no longer holds; spec did not anticipate the typing-defer mechanism)

**Suggested resolution:**
- Add a new test scenario in §7 (e.g., **CE05**: "Prop panel update during concurrent agent write — both edits preserved") and **OS06**: "Prop panel update never destroyed by concurrent Observer B fire"
- Update §3.6 to require the prop panel implementation to call `markUserTyping()` from every change handler (text input keydown, dropdown onChange, toggle onCheckedChange) — either directly, or by re-firing keydown on `editor.view.dom`
- Update §13 EXCLUDE to acknowledge the carve-out: "The observer layer requires zero *internal* changes, but the prop panel UI must signal local activity via the existing `markUserTyping()` API to participate in the typing-defer protection."
- Add R9 to §11 Risks: "Prop panel mutations bypass typing-defer protection — concurrent agent writes can overwrite user prop changes during the 50ms Observer A debounce window. Mitigation: prop panel calls `markUserTyping()` on every change handler."

---

### [PM-H2] Observer B early-exit makes raw JSX byte-determinism a load-bearing requirement, but Phase 0 acceptance criteria don't test it

**Category:** FACTUAL (decision-implicating)
**Source:** T1 (Own codebase trace) + L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md §4 Phase 0 (steps 5-10), §2 Tertiary success criterion, §10 Assumptions

**Issue:** PR #7 added an early-exit to Observer B (`observers.ts:288-301`):
```ts
const currentBody = mdManager.serialize(currentJson);
if (currentBody === body) {
  // Tree and text are already in sync — skip updateYFragment
}
```
This optimization is the *only* thing preventing Observer B from running `updateYFragment` (a destructive tree replacement) on every Y.Text observation. The early-exit fires only when `serialize(parse(jsx)) === jsx` byte-for-byte (the raw JSX produced by the markdownTokenizer must serialize back to the *exact* string in Y.Text — same whitespace, same trailing newlines, same indentation, same attribute order).

The prototype tests (`jsx-tokenizer-prototype.test.ts:237-280`) verify round-trip stability with `cycle1.trim() === md` followed by `cycle2 === cycle1` — note the `.trim()` on cycle 1. This confirms that the *first* parse-then-serialize cycle introduces a trailing newline (or other whitespace) that the original raw JSX did not have. The prototype tests pass because `cycle2 === cycle1` (cycle 2 is byte-stable), but Observer B's early-exit compares without `.trim()` and uses cycle-1 semantics (parse Y.Text → serialize XmlFragment → compare to Y.Text).

**Concrete consequence:**
1. Agent writes raw JSX `<Callout type="warning">x</Callout>` to Y.Text (no trailing newline)
2. Observer B fires. `currentBody` (serialize of XmlFragment, after parse) = `<Callout type="warning">x</Callout>\n` (with trailing newline)
3. `body` (Y.Text) = `<Callout type="warning">x</Callout>` (no trailing newline)
4. `currentBody !== body` → early-exit misses → `updateYFragment` runs → tree is replaced
5. Observer A then fires (XmlFragment changed via Observer B), origin guard skips it
6. lastSyncedXmlMd is now stale relative to Y.Text — every subsequent Observer A run will compute a spurious user delta

**Why it matters:** When the user is editing inside a `jsxComponentEditable`'s `NodeViewContent` and an agent writes anywhere in the document, every Observer B fire that misses the early-exit will run `updateYFragment`, which is known to disrupt cursor position inside content holes. This invalidates the spec's §2 Tertiary criterion ("Source mode editing of component JSX round-trips correctly through the observer cycle") and the implicit assumption in §11 R2 that observer shimmer is a low risk.

The spec's Phase 0 step 5 requires "all 24 test cases from prototype" to pass — but those tests use `.trim()` and don't validate the byte-identity property the new Observer B requires. Phase 0 will pass while Observer B silently degrades.

**Evidence:**
- `init_spike/src/editor/observers.ts:288-301` — early-exit byte comparison
- `init_spike/src/editor/extensions/jsx-tokenizer-prototype.test.ts:240-255` — `cycle1.trim() === md` pattern
- `init_spike/src/editor/observers.test.ts:710-730` — existing "Observer B early-exits when XmlFragment already matches Y.Text" test uses `md.trim() === serializedBody.trim()`, confirming the trim-tolerance pattern
- The spec's D11 confidence claim ("Prototype: 24/24 tests pass") does not test cycle-1 byte-identity

**Status:** STALE (claim that "no changes to observer layer" are needed didn't anticipate the early-exit's byte-identity requirement)

**Suggested resolution:**
- Add explicit Phase 0 acceptance criterion: **"Raw JSX serialize/parse is cycle-1 byte-identical for all production-shape JSX inputs"** — same as the existing tests but without `.trim()`
- Add Phase 0 step (between current 5 and 6): "Verify Observer B early-exit fires for raw-JSX no-op observations. Test: write raw JSX to Y.Text, wait for Observer B, then write the *exact same* raw JSX again — assert no updateYFragment calls (count tree mutations or observe XmlFragment events)."
- Either fix the markdownTokenizer's renderMarkdown to include the trailing newline produced by the parse path (so cycle 1 is byte-stable), OR explicitly normalize the comparison in Observer B (which is an observer-layer change the spec must acknowledge)
- Add to §11 Risks: "R10: Raw JSX serialization not byte-stable on cycle 1 → Observer B early-exit misses → tree replacement on every observation → cursor disruption inside NodeViewContent. Mitigation: cycle-1 byte-identity test in Phase 0; if violated, normalize trailing whitespace in renderMarkdown."

---

### [PM-H3] Spec's Tertiary success criterion is now factually wrong about how Observer A serializes typed components

**Category:** FACTUAL (decision-implicating, but smaller blast radius than H1/H2)
**Source:** T1 (Own codebase trace) + L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md §2 Tertiary criterion ("Observer sync is transparent")

**Issue:** The spec describes Observer A as "serializes typed components to raw JSX in Y.Text" — i.e., Observer A reads the XmlFragment and writes the full result to Y.Text. But PR #7's Observer A no longer writes the full serialization; it computes an incremental delta:

```ts
// observers.ts:227-248
const md = mdManager.serialize(json);
if (lastSyncedXmlMd === md) return;
const currentText = ytext.toString();
if (currentText === lastSyncedXmlMd) {
  applyIncrementalDiff(ytext, currentText, md);
} else {
  applyUserDelta(ytext, lastSyncedXmlMd, md);  // ← user-delta path
}
```

When the XmlFragment has BOTH a user prop change AND content from a recent agent write that hasn't been observed yet (because Observer B hasn't run yet), Observer A enters the `applyUserDelta` path, computing `diffLines(lastSyncedXmlMd, md)` and trying to inject just the user's change into Y.Text. For typed components, the diff is computed at the line level over **serialized JSX strings**. A single attribute change like `type="warning"` → `type="error"` produces a diff that depends on whether the JSX is single-line or multi-line:

- **Single-line JSX** (`<Callout type="warning">x</Callout>` → `<Callout type="error">x</Callout>`): one removed line, one added line. `applyUserDelta` deletes the old line by content match and inserts the new line. Works.
- **Multi-line JSX** (opening tag on its own line): only the opening-tag line changes. The diff is line-aligned. Works.
- **Multi-line JSX with the user simultaneously editing children**: now multiple non-adjacent lines change. The applyUserDelta `indexOf` matching may find the wrong line (e.g., a duplicate `</Callout>` close tag elsewhere in the doc) and corrupt the result.

Beyond correctness, the spec's description doesn't match what an implementer reading Phase 0 would expect. The spec needs to acknowledge that Observer A is now delta-based and that the line-content matching in `applyUserDelta` interacts non-trivially with how raw JSX is serialized (line breaks, indentation, attribute order).

**Evidence:**
- `init_spike/src/editor/observers.ts:125-174` — `applyUserDelta` function definition
- `init_spike/src/editor/observers.ts:147-152` — line-content matching via `indexOf`, which can match the wrong line if the same line content appears elsewhere
- SPEC.md §2 Tertiary: "Observer A (XmlFragment → Text) serializes typed components to raw JSX in Y.Text"

**Status:** STALE / INCOHERENT

**Suggested resolution:**
- Rewrite §2 Tertiary criterion to: "Observer A computes an incremental delta between the last-synced XmlFragment markdown and the current XmlFragment markdown, then applies only that delta to Y.Text via line-level diff. For typed components, a prop change appears as a line-replacement (single-line JSX) or as a tag-line replacement (multi-line JSX). Observer B parses raw JSX via the custom markdownTokenizer."
- Add §11 Risk R11: "applyUserDelta line-content matching can mis-target when the same JSX line appears multiple times (e.g., two `<Callout>` opening tags with identical attributes elsewhere in the doc, or a stray `</Callout>` close tag). Mitigation: serialize each component on its own line block with deterministic context lines that disambiguate; add a regression test for repeated identical JSX nodes."
- Update §10 Assumption A6 (new): "applyUserDelta correctly handles typed-component diffs when the same JSX line appears multiple times in the document. **Verification:** add test where two `<Callout type="warning">` blocks exist and the user changes one prop — assert only that block is mutated."

---

## Medium Severity

### [PM-M1] Spec baseline commit is stale (`5597eb7`) and the drift now contains semantic changes the spec depends on

**Category:** COHERENCE
**Source:** L1 (Cross-finding) + spec discipline (baseline drift check)
**Location:** SPEC.md frontmatter (`**Baseline commit:** 5597eb7`)

**Issue:** The spec frontmatter pins baseline at `5597eb7` (PR #6 merge). Since then `8e3845d` (PR #7) has merged with substantive changes to four files the spec analyzed:
- `init_spike/src/editor/observers.ts` — +320 lines, fundamentally restructured (delta-based Observer A, typing-defer Observer B, early-exit, applyUserDelta)
- `init_spike/src/editor/TiptapEditor.tsx` — +292 lines, new awareness/cursor wiring, flash plugin, markUserTyping listener
- `init_spike/src/editor/extensions/shared.ts` — confirmed `StarterKit.configure({ undoRedo: false })` (relevant for IC06)
- `init_spike/src/editor/observers.test.ts` — +390 lines including "Concurrent edit race conditions (regression)" suite

The spec was finalized against PR #6's simpler observers and explicitly claimed "no changes to the observer layer" (§6) and "ZERO changes" to "the server-side persistence and observer layers" (§13). The new observer layer is materially different in ways the spec must reckon with (see PM-H1, PM-H2, PM-H3).

**Evidence:** `git diff 5597eb7..HEAD --stat init_spike/` shows 4545 insertions / 176 deletions across 37 files in the spec's primary working area.

**Status:** STALE

**Suggested resolution:**
- Update SPEC.md frontmatter: `**Baseline commit:** 8e3845d` (or current HEAD at finalization)
- Add to §10 Assumptions: "A6: The presence/awareness/per-origin-undo system from PR #7 (commit `8e3845d`) coexists with typed component nodes without modification to the awareness or undo layers. **Verification:** Phase 2 manual test — multi-tab WYSIWYG edit a typed component with cursors visible in both tabs."
- Add a §15 (or expand §13) "Architecture context: post-PR-#7 observer model" subsection that briefly summarizes the observer behavior the spec depends on, so a future implementer reading this in isolation has the right mental model

---

### [PM-M2] §7 Test Scenarios do not cover the new race conditions or the early-exit dependency

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md §7 (Test Scenarios), specifically "Observer Sync Compatibility" and "Concurrent Editing" subsections

**Issue:** The OS01–OS05 and CE01–CE04 scenarios were authored against PR #6's observers. They cover the "happy path" but do not exercise:
1. Observer B early-exit on no-op for raw JSX (depends on PM-H2)
2. Observer A's `applyUserDelta` path with typed components (depends on PM-H3)
3. Prop panel edit during concurrent agent write (depends on PM-H1)
4. Prop panel edit while user is also editing children (multi-channel local activity)
5. Round-trip stability through Observer B's tree-replacement path with raw JSX

Without these tests, Phase 2/3 will appear "green" while shipping the bugs PM-H1/H2/H3 describe.

**Evidence:** `init_spike/src/editor/observers.test.ts:665-766` shows PR #7 added a "Concurrent edit race conditions (regression)" suite — but only for plain markdown, not for raw JSX or prop attributes. The pattern exists; the spec needs to require it for typed components.

**Status:** INCOHERENT (test coverage doesn't match the architecture's actual sensitivity points)

**Suggested resolution:** Add to §7:

| ID | Scenario | Expected |
|----|----------|----------|
| **OS06** | Raw JSX cycle-1 byte-identity: parse then serialize a typed Callout produces the exact original string (no trailing whitespace, no attribute reordering, no indentation drift) | Byte-identical |
| **OS07** | Observer B no-op early-exit fires for raw JSX: write raw JSX to Y.Text, observe Observer B updateYFragment, write the same raw JSX again — assert no second updateYFragment call | Early-exit fires |
| **OS08** | Observer A applyUserDelta with typed components: seed XmlFragment with two `<Callout>` blocks with identical content, change one prop, verify only the changed block is mutated in Y.Text | Only intended block changes |
| **CE05** | Prop panel update + concurrent agent write race: User A clicks dropdown, agent POSTs `/api/agent-write-md` within 50ms — verify both edits land | Both preserved |
| **CE06** | Prop panel edit while user is editing children in WYSIWYG (same component, different sub-region) — verify both apply | Both preserved |

---

### [PM-M3] §2 Quaternary "Component registry is extensible" claim doesn't account for the new schema-immutability constraint

**Category:** FACTUAL (minor implementation gotcha)
**Source:** T1 (Own codebase trace)
**Location:** SPEC.md §2 Quaternary, OQ1 resolution

**Issue:** The spec resolves OQ1 as "Init-time scan of `src/components/`. Static during session (TipTap schema immutable after init)." This is correct, but the spec doesn't explicitly call out that this means: **the editor must read the registry once before constructing the schema, and the schema must include all attribute names from all registered components**.

`TiptapEditor.tsx:53` calls `getSchema(sharedExtensions)` at module top-level — outside React lifecycle. For dynamic per-component attributes (D6), this means either:
(a) The schema-construction step must run after the registry is loaded (currently it runs synchronously at module load), or
(b) `JsxComponentEditable` declares a single generic `props: { default: {} }` JSON attribute and parses individual props from it (loses per-prop LWW from D2/D6), or
(c) The schema is regenerated when the registry changes — but `editorSchema` is captured at module top-level and used as a singleton

The spec's D6 commits to "Single extension with formal attributes derived from registry at init" which presumes (a) — but Phase 1 will need to refactor `TiptapEditor.tsx`'s schema construction to be deferred until the registry has loaded, which is a non-trivial change to the singleton provider initialization.

**Evidence:**
- `init_spike/src/editor/TiptapEditor.tsx:53` — `const editorSchema = getSchema(sharedExtensions);` runs at module top-level
- `init_spike/src/editor/extensions/shared.ts` — `JsxComponent` is included unconditionally; no registry-aware initialization
- `init_spike/src/server/persistence.ts:28` (per CLAUDE.md) — server-side MarkdownManager constructed from sharedExtensions; same constraint applies server-side

**Status:** STALE (the spec assumes schema construction is registry-aware, but the current code constructs it at module load)

**Suggested resolution:**
- Add to Phase 1 step 1: "Refactor `editorSchema` (TiptapEditor.tsx:53) and server-side MarkdownManager (persistence.ts:28) to defer schema construction until after the component registry has loaded. Both constructions are currently at module top-level and must be moved into a registry-aware initializer."
- Add to §11 Risks: "R12: Schema construction order — `editorSchema` and `mdManager` are currently created at module load, before the registry exists. Phase 1 must refactor to defer both. Mitigation: registry loads synchronously at server startup before any module that constructs a schema imports."

---

## Low Severity

### [PM-L1] §13 EXCLUDE statement is overly absolute given PR #7's observer changes

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** SPEC.md §13 EXCLUDE

**Issue:** EXCLUDE says: "The server-side persistence and observer layers should require ZERO changes (if they do, something is wrong with the serialization compatibility)." This was true at the spec's baseline (PR #6) where the observer layer was a thin diff applier. PR #7 added the typing-defer + early-exit machinery, and Phase 2 will need to participate in the typing-defer protocol (via PM-H1's resolution). The "zero changes" framing is now an over-promise.

**Status:** INCOHERENT (with PR #7 reality, not internally)

**Suggested resolution:** Reword to: "The server-side persistence layer should require ZERO changes. The observer layer requires no *internal* modifications, but Phase 2's prop panel implementation must participate in the typing-defer protocol introduced by PR #7 — every prop mutation handler must call `markUserTyping()` (exported from `observers.ts`) so Observer B defers its tree replacement during prop edits, the same way it does for keystroke edits."

---

## Items Investigated but NOT findings

### Concern E (presence interaction with prop panel) — no decision-implicating issue found

The new server-side UndoManager (`hocuspocus-plugin.ts`) tracks only `'agent-write'` origin on Y.Text. Prop panel `updateAttributes` produces ProseMirror transactions (XmlFragment), which:
- Do NOT carry the `'agent-write'` origin (so the server-side UndoManager ignores them — correct)
- Reach Y.Text only via Observer A with origin `'sync-from-tree'` (so the server-side UndoManager ignores those too — correct)
- Are tracked by the browser-side y-prosemirror UndoManager (provided by `@tiptap/extension-collaboration`'s yUndoPlugin, which is the WYSIWYG ⌘Z source since `StarterKit.configure({ undoRedo: false })` disables the local history)

Per-user undo is therefore correctly scoped: each user's WYSIWYG ⌘Z reverses their own prop edits and child-text edits in chronological order. The IC06 test scenario ("Undo inside children — Only children edits undo, not prop changes") is achievable as standard chronological undo (the spec's prose is a bit misleading but the test is sound). No spec change required.

The agent-flash UX (PR #7) highlights regions on agent activity. For typed component agent writes the flash will fire correctly (it observes `Y.Map('activity')`, which agent writes still update). The flash currently highlights all lines or append/prepend regions, not specific component instances — a UX gap, but not a P0 blocker. **Mention as Future Work, not a finding.**

### Concern F (TiptapEditor extensions conflict) — no P0 conflict

`yCursorPlugin` (the only ProseMirror plugin PR #7 added beyond Collaboration) is a standard pattern that works inside non-atom nodes with NodeViewContent (table cells use the same pattern). The `markUserTyping` keydown listener on `editor.view.dom` will receive bubbled keystrokes from inside `<NodeViewContent />` regions because they are part of the same DOM tree. The agent-flash UI in `TiptapEditor.tsx` is pure DOM attribute updates — no ProseMirror plugin interaction. The CodeMirror flash plugin is source-side only.

The one subtle issue: `useEffect` listener wiring runs on mount, and the editor reference (`editor.view.dom`) only exists after `useEditor()` resolves. For Phase 2, a popover that lives outside `editor.view.dom` (Radix portal) won't bubble events — see PM-H1, which is the only real concern.

### Cycle-1 stability of the existing observer.test (line 710-730 trim-tolerant assertion)

The existing test "Observer B early-exits when XmlFragment already matches Y.Text" uses `md.trim() === serializedBody.trim()` to verify the synced state. This is consistent with the cycle-1 normalization that PM-H2 flags. The test passes today because plain paragraphs and headings serialize cycle-1 byte-identical except for a possible trailing newline. PM-H2's concern is whether raw JSX has the *same* property — and the prototype tests' use of `.trim()` strongly suggests it does NOT, because the prototype authors had to add `.trim()` to make the test pass.

---

## Confirmed Claims (summary)

**T1 (Own codebase trace, post-PR-#7):**
- Observer A is now delta-based (`lastSyncedXmlMd` snapshot, `applyUserDelta` for divergent state) — CONFIRMED `observers.ts:198, 125-174, 216-253`
- Observer B has typing-defer (TYPING_DEFER_MS = 300ms) — CONFIRMED `observers.ts:53, 274-282`
- Observer B has early-exit on `currentBody === body` — CONFIRMED `observers.ts:288-301`
- `markUserTyping` is bound only to editor.view.dom (keydown/paste/drop/cut) — CONFIRMED `TiptapEditor.tsx:171-183`
- `JsxComponent` extension is unchanged structurally (still atom: true, fenced format) — CONFIRMED `jsx-component.ts:22-31` (Phase 0 will replace this)
- `StarterKit.configure({ undoRedo: false })` — CONFIRMED `extensions/shared.ts:15`
- Server-side `UndoManager` tracks only `'agent-write'` origin on Y.Text — CONFIRMED via CLAUDE.md description and `hocuspocus-plugin.ts:50-90` references
- Tooltip uses Radix `Portal` (proxy for the popover Phase 2 will introduce) — CONFIRMED `components/ui/tooltip.tsx:34`

**Spec internal coherence (post-PR-#7 cross-check):**
- D2 (props as top-level attributes) is still architecturally sound — CONFIRMED, no PR #7 conflict
- D8 (two node types: jsxComponentEditable + jsxComponentVoid) is still sound — CONFIRMED
- D10 (children parsing via marked.lexer + helpers.parseBlockChildren) is unaffected by PR #7 — CONFIRMED
- D11/D12 (markdownTokenizer + Version B tokenizer) — architecturally CONFIRMED, but cycle-1 byte-identity is now load-bearing in a way the prototype didn't test (see PM-H2)
- D14 (popover prop panel) — CONFIRMED architecturally, but the popover-portal interaction with markUserTyping is a new constraint (see PM-H1)

## Unverifiable Claims

| Claim | What was checked | Why unverifiable |
|---|---|---|
| Whether `applyUserDelta`'s line-content matching corrupts a multi-Callout document with identical JSX lines | Read the function source, traced the diff logic. Worst-case scenario constructed manually (PM-H3). | Would require running the actual function with crafted inputs — couldn't do that without running tests. The risk is real but the actual probability depends on the corpus. Recommended as a regression test in PM-H3. |
| Whether Radix Popover (Phase 2 D14) actually portals — checked Radix Tooltip uses Portal as a proxy | Read `components/ui/tooltip.tsx`. | Phase 2 hasn't been built yet. The popover primitive Phase 2 chooses might not portal — but the standard Radix and shadcn-ui Popover does, and the spec D14 cites "popover" as the primitive. If Phase 2 chooses a non-portaled implementation, PM-H1 may not apply. |
