# Audit Findings — Editor Experience Gaps vs init_spike Source

**Artifact:** prior-turn gap list (13 items, Tier 1/2/3) framed against `specs/2026-04-08-typed-component-nodes/SPEC.md`
**Audit date:** 2026-04-08
**Method:** T1 (own codebase) verification of each claimed gap against `init_spike/` at HEAD (8e3845d — after PR #6 observer sync + PR #7 presence).
**Total findings:** 13 (5 High, 5 Medium, 3 Low) + 2 corrections to the original gap list.

---

## Executive Summary

Of the 13 gaps I flagged in the prior turn:

| | Count | Items |
|---|---|---|
| **Confirmed missing (code + tests)** | 8 | #1, #2, #3, #4, #7, #10, #11, #12 |
| **Partially covered** | 2 | #6 (graceful parse-fail), #8 (per-origin undo yes, per-attribute no) |
| **Substantially covered — I was wrong** | 1 | **#5 frontmatter** (17 unit tests + observer round-trip T60) |
| **Covered for common primitives, missing for uncommon** | 1 | **#9 markdown regression** (tables/lists/inline/code covered; blockquote, task list, footnotes, strike, math not covered) |
| **Missing test but low design risk** | 1 | #13 (cursor preservation — T8.3 already on Bucket 8's bug-bash list) |

**The biggest correction:** frontmatter is well-handled. Regex strip/prepend (`src/editor/extensions/frontmatter.ts`), storage in `Y.Doc` metadata map, bidirectional sync through both observers, 17 dedicated unit tests + 1 round-trip test (T60 in `observer-sync.test.ts`). Withdraw that finding.

**The biggest reinforcement:** The spike has zero custom handlers for any of: clipboard (`handlePaste`, `transformPastedHTML`, `clipboardParser`), drag-drop (`handleDrop`), keymaps, slash commands, or suggestions. `grep -r "handlePaste|handleDrop|transformPastedHTML|clipboardParser|handleKeyDown" init_spike/src` returns **no matches**. The spec's Phase 3 (inline children) creates the first editable surface inside a block component — and there's no precedent in the codebase for how any of these interactions behave there.

---

## High Severity

### [H] Finding 1: Component boundary interactions — zero coverage, and Phase 3 is where the problem first exists

**Category:** COHERENCE (original gap #1)
**Source:** T1 (own codebase)
**Location:** Gap list Tier 1 #1
**Issue:** I flagged this as missing. Confirmed: no `handleKeyDown`, no custom keymap, no test covering Backspace / Enter / Arrow across a component boundary. But the deeper point is that the *boundary doesn't exist yet*. `jsx-component.ts:22` sets `atom: true`. The node has no content region, `JsxComponentView.tsx` is wrapped in `contentEditable={false}`. The cursor cannot enter it today.

**Current code:**
```ts
// init_spike/src/editor/extensions/jsx-component.ts:19-23
export const JsxComponent = Node.create({
  name: 'jsxComponent',
  group: 'block',
  atom: true,
  priority: 60,
```

**Evidence:** `JsxComponentView.tsx:26` uses `contentEditable={false}`. No node-view `contentDOM`. The test file `jsx-component.test.ts` (13 tests) covers only `fenceFor()` and markdown round-trip — nothing about interaction.

**Status:** CONTRADICTED in framing, CONFIRMED in substance. The gap is real *for the spec's Phase 3*, not for today's code. This matters because: the spec's Phase 3 (§4) flips `content: 'block+'` and adds `<NodeViewContent />`. That single change introduces an editable boundary for the first time in the codebase, and TipTap's default keymap is known to be non-obvious at non-atom block node edges.

**Suggested resolution:** Add to SPEC §7 as a new test category **"Component boundary interactions (Phase 3)"** with at least these scenarios:
- BI01: Backspace at position 0 of children — must not delete the component wrapper
- BI02: Backspace at position 0 of children when children is empty — define behavior (convert to paragraph? delete component? placeholder?)
- BI03: Enter at last position of last child — creates new paragraph *after* component, not inside
- BI04: Arrow up from first child exits to previous document block; Arrow down from last child exits forward
- BI05: Cursor lands in children on click into the rendered component area (not on the component wrapper)

Treat this as a Phase 3 exit criterion, not a polish item — if these feel broken, Layer 3 doesn't ship.

---

### [H] Finding 2: Selection crossing the component boundary — not covered, and ProseMirror has opinions here

**Category:** COHERENCE (original gap #2)
**Source:** T1
**Location:** Gap list Tier 1 #2
**Issue:** No test in `observer-sync.test.ts`, `observers.test.ts`, `sync.spec.ts`, or `qa-scenarios.spec.ts` covers a selection that spans a component + surrounding document. Again: not testable today because `atom: true` blocks the cursor from entering. Becomes testable + critical once Phase 3 flips the content spec.

**Evidence:** grep for `Selection|selectAll|Cmd\+A|Mod-a|setTextSelection` in `init_spike/src` returns only internal ProseMirror library references in `node_modules` (not our code). Zero author-written selection tests.

**Status:** CONFIRMED MISSING

**Suggested resolution:** Same treatment as #1 — add to §7 as Phase 3 exit criteria. Minimum: (a) select from paragraph-before into children → delete; (b) select from children into paragraph-after → delete; (c) copy the mixed selection and paste elsewhere and verify structure survives. ProseMirror's default `Selection.between` behavior across node boundaries is well-defined but frequently surprising — worth a manual walkthrough before writing the test list.

---

### [H] Finding 3: Copy/paste — no handlers, no tests, high surface area

**Category:** FACTUAL (original gap #3)
**Source:** T1
**Location:** Gap list Tier 1 #3
**Issue:** Confirmed. Zero code for copy/paste customization.

**Evidence:**
```bash
$ grep -rn "handlePaste|transformPastedHTML|clipboardParser|clipboardSerializer|handleDrop" init_spike/src
# (no matches)
```
`TiptapEditor.tsx:169-183` only calls `markUserTyping()` on paste/drop events to defer the observer — it never reads the clipboard payload. The only place `paste` appears in test code is `page2.keyboard.press('Enter')` (unrelated).

**Status:** CONFIRMED MISSING

**Suggested resolution:** This one is new-scope for the typed-component-nodes spec but **unavoidable**. Four scenarios belong in §7:
- CP01: Copy a typed component → paste into plain paragraph → structure preserved
- CP02: Copy a component with children → paste *inside* another component's children → nested structure emerges (or is prevented cleanly)
- CP03: Paste raw JSX text (`<Callout type="warning">...</Callout>`) from clipboard → becomes a typed component (Phase 0's tokenizer should handle it, but the paste path currently uses ProseMirror's HTML clipboard parser, not the markdown tokenizer — verify this works)
- CP04: Paste HTML from a web page that contains uppercase-first tags (e.g., `<SVG>`) — does the custom marked tokenizer get invoked on pasted content at all? Likely **no**, because paste goes through ProseMirror's DOM parser, not marked. This is a real architectural question the spec does not address.

CP04 is the architecturally surprising one. Worth a one-liner resolution in the spec: *"Pasted HTML is parsed by ProseMirror's clipboard parser, not the custom markdown tokenizer. Typed-component detection from raw-JSX paste is out of scope for P0; pasted JSX lands as a plain text paragraph."* Or build a `transformPastedText` hook. Decide before Phase 2.

---

### [H] Finding 4: Nested component editing — only tokenizer is tested, UX is architecturally untestable today

**Category:** COHERENCE (original gap #4)
**Source:** T1
**Location:** Gap list Tier 1 #4
**Issue:** `tests/jsx-tokenizer.test.ts` has 10+ tests covering nested Callout-in-Callout parsing (both Version A and Version B tokenizers). But these tests operate on the *standalone prototype tokenizer* — `init_spike/src/editor/extensions/jsx-tokenizer.ts` is the prototype, and `jsx-component.ts` does not import it. The nested-parsing capability exists in the prototype but **is not wired into the editor**.

**Evidence:**
- `jsx-component.ts:50` — `markdownTokenName: 'code'` (reuses the default code token)
- `jsx-component.ts:52-58` — `parseMarkdown` intercepts only `token.lang === 'jsx-component'` fences
- `tests/jsx-tokenizer.test.ts:1-10` — imports from `../src/editor/extensions/jsx-tokenizer.ts` (the prototype), not from `jsx-component.ts`

So: *tokenizer correctness for nested components is tested in isolation, but the editor still parses fenced `jsx-component` blocks and no end-to-end test verifies a nested component round-tripping through the live editor*. Phase 0 of the SPEC is where this wiring happens for the first time.

**Status:** CONFIRMED PARTIAL (prototype-tested; editor-untested)

**Suggested resolution:** §4 Phase 0 already plans to wire the tokenizer via `markdownTokenName: 'jsxBlock'` with Version B. Add an explicit end-to-end test to §7: **"RT07: Nested Callout-in-Callout round-trips through Phase 0 integration"** — not just the prototype. And a Phase 3 UX test: **"NC01: Click into inner Callout's children inside an outer Tab — focus lands correctly, prop panel anchors to inner, slash command inside inner children works."**

---

### [H] Finding 5: Presence/origin-shading inside component children — zero design, zero code

**Category:** COHERENCE (original gap #10)
**Source:** T1
**Location:** Gap list Tier 2 #10
**Issue:** PR #7 (commit 8e3845d) shipped awareness + cursor rendering + per-origin undo at the document level. There is no code that considers what happens when a cursor (or origin shading) lands *inside* a node view's `contentDOM`.

**Evidence:**
- `TiptapEditor.tsx:144-162` wires `CollaborationCursor.configure({ provider, render: renderCursor })`. `renderCursor` (lines 23-43) branches on `user.type === 'agent'` for visibility only.
- No code path differentiates "cursor inside an editable region that lives inside a custom node view" from "cursor at the document top level."
- Observer A/B origin guards (`observers.ts:255, 320`) operate at the Y.Doc transaction level. They don't know about ProseMirror node view boundaries.
- `JsxComponentView.tsx` renders with `contentEditable={false}` — no contentDOM exists yet, so the question has never been asked.

**Status:** CONFIRMED MISSING. Load-bearing because Phase 3's `<NodeViewContent />` creates the first child-contentDOM in the codebase, and S5 (PR #7) presence has never been exercised against that surface.

**Suggested resolution:** Add a cross-spec risk note (§11) to typed-component-nodes: *"Presence rendering from PR #7 has not been validated against `<NodeViewContent />` regions. Verify during Phase 3: (a) agent cursor inside a Callout's children renders at the correct screen position; (b) origin shading paints on children-level edits; (c) human and agent can occupy the same component's children without visual collision."* Also add a Bucket 1↔Bucket 3 coordination line in STORIES.md — this is the concrete case that makes T1.9 load-bearing.

---

## Medium Severity

### [M] Finding 6: Malformed JSX recovery — "editor doesn't crash" is covered, "fallback UX" is not

**Category:** FACTUAL (original gap #6)
**Source:** T1
**Location:** Gap list Tier 2 #6
**Issue:** Better than I claimed. Observer B has an explicit try/catch around parse (`observers.ts:313-317`) that logs and retains the last valid XmlFragment state. So the editor stays alive on bad JSX input. *But:* there is no test that exercises this path with malformed JSX specifically, and there is no user-visible fallback — the bad content just stops propagating, silently.

**Evidence:** `observers.ts:313-317`:
```ts
} catch (error) {
  if (onError) onError(error as Error);
  else console.error('[Observer B] Parse error:', error);
}
```
No test in `observers.test.ts` feeds malformed JSX and asserts on recovery behavior. The `onError` callback is used by `TiptapEditor.tsx` but its behavior isn't user-facing.

**Status:** PARTIAL — graceful no-crash yes, graceful UX no.

**Suggested resolution:** Add one test to §7 **"ER01: Malformed JSX (unclosed tag) on disk → editor loads, shows unregistered-fallback or error block for that region, other content renders normally."** The spec already describes an "unregistered component fallback" path (§3.8) — use it for malformed inputs too, with a visible "couldn't parse this block" badge.

---

### [M] Finding 7: Slash commands — not a regression, just new work; call it out

**Category:** COHERENCE (original gap #7)
**Source:** T1
**Location:** Gap list Tier 2 #7
**Issue:** I flagged "slash commands inside component children" as missing — accurate, but misleading because **no slash command system exists at the top level either**. `grep "slash|Slash|suggestion|Suggestion" init_spike/src` returns zero matches. `@tiptap/suggestion` is not in `package.json`. This is not a regression risk, it's net-new Phase 2 work (SPEC §3.7).

**Status:** CONFIRMED MISSING (baseline, not regression)

**Suggested resolution:** The spec's §3.7 describes the feature but §7 has no "Slash commands" test category. Add:
- SC01: `/callout` at top level inserts a Callout with default props
- SC02: `/callout` inside another component's children inserts a nested Callout
- SC03: Slash menu filters as user types
- SC04: Slash menu closes on Escape with no state change

Low-risk content but worth being explicit.

---

### [M] Finding 8: Undo/redo granularity — covered at the origin level, not at the attribute level

**Category:** FACTUAL (original gap #8)
**Source:** T1
**Location:** Gap list Tier 2 #8
**Issue:** Per-origin undo is *well* covered: 8 dedicated tests in `observers.test.ts`, server-side `UndoManager` with `trackedOrigins: new Set([AGENT_WRITE_ORIGIN])` (`hocuspocus-plugin.ts:71`), HTTP endpoints `/api/agent-undo` and `/api/agent-redo`. OQ12 of the spec resolves to "default TipTap behavior." What's untested is whether a **single** undo transaction correctly captures "one prop change" vs "one children edit" as independent steps — because today there are no typed props and no editable children for that granularity to exist.

**Evidence:** `observer-sync.test.ts:335-389` — undo isolation tests pass on paragraph-level text content. No attribute-level undo test because no node has more than a single `content` attribute today.

**Status:** PARTIAL — origin-level CONFIRMED, attribute-level UNVERIFIABLE until Phase 2 exists.

**Suggested resolution:** Add to §7 after Phase 2: **"UR01: Change Callout `type` prop, then edit children, then Cmd+Z — only children edit reverts. Second Cmd+Z reverts the prop change."** If y-prosemirror groups attribute writes differently than expected (e.g., coalesces attribute updates with surrounding text edits), this test will surface it early.

---

### [M] Finding 9: Plain markdown regression — common primitives covered, tail is thin

**Category:** FACTUAL (original gap #9)
**Source:** T1
**Location:** Gap list Tier 2 #9
**Issue:** I said "no regression suite for plain markdown." Not quite — `observer-sync.test.ts` has 6 fidelity tests:
- T60: frontmatter
- T61: jsx-component void node
- T62: GFM table
- T63: nested list
- T64: fenced code block with language tag
- T65: inline formatting (bold, italic, links, images, code)

**What's NOT covered explicitly:**
- Blockquotes (StarterKit supports them, but no round-trip test)
- Task lists (extension is in `shared.ts:18-19`, but no round-trip test)
- Horizontal rules
- Headings round-trip (probably survives via `frontmatter` test implicitly, not asserted)
- **Footnotes, strikethrough, math, mermaid — none of these have extensions installed** (`package.json` confirms: no `@tiptap/extension-strike`, no footnote, no math plugin)

The spec's STORIES.md T1.7 flags Obsidian parity (math, mermaid, footnotes, collapsible callouts, inline tags) as ~3-4 day separate work. So the tail is acknowledged as work, but not as a **regression risk when Phase 0 flips the tokenizer format**. Any markdown primitive that encounters the new `jsxBlock` tokenizer boundary is at risk.

**Status:** CONFIRMED COVERED for 6 primitives; CONFIRMED UNCOVERED for the tail.

**Suggested resolution:** Before Phase 0 merges, extend §7 or add a new subsection **"Markdown primitives through the new jsxBlock tokenizer"** covering at minimum: blockquote, task list, horizontal rule, heading, raw HTML block (e.g., `<div>` lowercase — should NOT be intercepted). The critical case is uppercase HTML elements that are *not* intended as components (e.g., `<SVG>`, `<KBD>`) — the tokenizer's current design intercepts all uppercase tags, which may be too greedy.

---

### [M] Finding 10: Drag-drop / file paste — not in spec, not in code, worth a §6 out-of-scope callout

**Category:** COHERENCE (original gap #11)
**Source:** T1
**Location:** Gap list Tier 3 #11
**Issue:** Confirmed missing. STORIES.md U1.6 is an explicit user story. Not in SPEC §5 (In Scope) or §6 (Out of Scope) — so the spec is ambiguous about whether Phase 4 "Polish" is supposed to include it.

**Status:** CONFIRMED MISSING + ambiguously scoped

**Suggested resolution:** One-liner in §6 Out-of-Scope: *"Image drag-drop and file upload paste handlers (U1.6 from STORIES.md) — deferred. The editor has no clipboard/drop customization today and the typed-components work does not add any."*

---

## Low Severity

### [L] Finding 11: Performance at scale — no tests, but matches spec's stated maturity

**Category:** FACTUAL (original gap #12)
**Source:** T1
**Location:** Gap list Tier 3 #12
**Issue:** Confirmed: no scale tests anywhere in `init_spike/`. The largest test fixture is ~30 lines of markdown. No typing-latency benchmark, no large-document observer benchmark.

**Status:** CONFIRMED MISSING, but appropriate for a spike.

**Suggested resolution:** Out of scope for typed-component-nodes. Add one line in §11 Risks: *"Performance at realistic scale (1000+ blocks, 50+ typed components) is unvalidated. Acceptable for spike; becomes a release gate when the editor goes beyond internal dogfood."*

---

### [L] Finding 12: Cursor preservation during agent source-mode writes — already on Bucket 8's list

**Category:** COHERENCE (original gap #13)
**Source:** T1 + STORIES.md cross-ref
**Location:** Gap list Tier 3 #13
**Issue:** `qa-scenarios.spec.ts` and `sync.spec.ts` cover agent writes triggering WYSIWYG and source mode updates (T40/T41/T44), but do not assert cursor position stability during source-mode agent writes. STORIES.md T8.3 already flags this: *"Cursor preservation test in source mode during agent writes (V3 step 5 from TQ15 — not yet tested in browser)."*

**Status:** CONFIRMED MISSING, but already owned by Bucket 8 (Interop bug bash).

**Suggested resolution:** No change to the typed-component-nodes spec needed. Leave with Bucket 8. Cross-reference only if someone complains.

---

### [L] Finding 13: Withdraw frontmatter concern

**Category:** COHERENCE (original gap #5)
**Source:** T1
**Location:** Gap list Tier 1 #5
**Issue:** My original framing was wrong. Frontmatter handling is mature:
- `src/editor/extensions/frontmatter.ts` — strip/prepend utilities
- `frontmatter.test.ts` — 17 dedicated unit tests
- `observer-sync.test.ts` T60 — round-trip through observer cycle
- `observers.ts:176-181, 286, 311` — metadata map sync in both directions
- `TiptapEditor.tsx:338-352` — reads from `Y.Doc` metadata map on mount and reacts to updates

**Status:** WITHDRAWN (correction to original gap list)

**Suggested resolution:** Remove "frontmatter round-trip" from the list of Tier-1 gaps. Not a concern for typed-component-nodes.

---

## Confirmed Claims (summary)

The original 13-gap list was substantively right on 10 items. Specifically confirmed against source:

- **T1 own codebase:** No clipboard/paste/drop handlers exist (`grep` returns zero). No slash command system exists. No `@tiptap/suggestion` dependency. `JsxComponent` is `atom: true` with `contentEditable={false}` — no node view content region, no keymap, no selection behavior at component boundaries. PR #7's presence code does not consider contentDOM regions inside node views.
- **T1 test inventory:** `observer-sync.test.ts` covers 6 markdown primitives (frontmatter, void node, table, nested list, code fence, inline formatting). Observer/agent/origin behavior has ~100 tests. Jsx tokenizer prototype has 24 tests — but operates on the prototype file, not the integrated editor.
- **Phase 3 readiness:** The move from `atom: true` to `content: 'block+'` in the spec's §4 Phase 3 introduces the first editable region inside a custom node view in this codebase. Every UX-level gap I flagged (boundary interactions, selection, copy/paste, undo granularity, presence inside children) becomes first-class testable at that point and not before.

## Unverifiable Claims

- **Selection behavior across a (future) component boundary** (Finding 2): Cannot verify until Phase 3 lands. Noted as Phase 3 exit criterion.
- **Per-attribute undo granularity** (Finding 8): Cannot verify until Phase 2 lands structured attributes. Noted as Phase 2 exit criterion.
- **Presence rendering inside contentDOM** (Finding 5): Cannot verify until Phase 3. Noted as a Phase 3 risk with explicit cross-reference to PR #7.

---

## Recommendations to fold into SPEC.md

1. **Add new §7 test category "Component boundary interactions (Phase 3 exit criteria)"** covering BI01–BI05 from Finding 1.
2. **Add §7 "Selection and clipboard (Phase 3 exit criteria)"** covering SE01–SE02 (cross-boundary selection) and CP01–CP04 from Finding 3. Decide explicitly whether pasted raw JSX becomes a typed component or lands as plain text.
3. **Add one test RT07** in §7 "Round-Trip Fidelity" for nested Callout-in-Callout through the integrated Phase 0 tokenizer (not just the prototype).
4. **Add one risk in §11** for presence-inside-contentDOM (Finding 5) and add a Bucket 1↔Bucket 3 coordination line in STORIES.md.
5. **Add §7 "Slash commands"** as a test category (SC01–SC04) — Phase 2.
6. **Add §7 "Error recovery" test ER01** for malformed JSX with a visible fallback block.
7. **Add §7 "Markdown primitives through jsxBlock tokenizer"** regression suite for blockquote, task list, horizontal rule, heading, and uppercase-HTML-that-is-not-a-component (e.g., `<SVG>`, `<KBD>`) — Phase 0 exit criterion.
8. **Withdraw** the frontmatter concern — already handled well.
9. **Add to §6 Out of Scope:** image drag-drop / file paste handlers, with one-line rationale.
10. **Add one line in §11 Risks:** performance at realistic scale is unvalidated, acceptable for spike.

The high-leverage three are **#1 (boundary interactions)**, **#2 (selection + clipboard including the CP03/CP04 architectural question)**, and **#4 (presence inside contentDOM)**. Those are the ones that will feel broken on minute one of Phase 3 dogfood if not scoped in.
