# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-16-clipboard-mdast-canonical/SPEC.md`
**Audit date:** 2026-04-16
**Total findings:** 10 (2 HIGH, 4 MEDIUM, 4 LOW)

Summary:
- **HIGH (2):** FR-12 and §13 Next-Action #6 reference the `clipboardTextSerializer` + `clipboardSerializer` mechanism that D14/FR-1/§16 explicitly replaced with DOM-level `handleDOMEvents.copy/cut/dragstart`. This is a cross-section coherence failure that will mislead an implementer.
- **MEDIUM (4):** `NG4` name collision between spec's own NG4 (Image paste) and CLAUDE.md's fidelity-invariant NG4 referenced throughout §3/§6/§16; wikiLink HTML shape in Q1 contradicts FR-8 wording about "no data-attrs"; Source paste Branch B (text/x-gfm → markdown string inserted) adds a branch the research report's Part 3 §D22 did not sketch; §8's characterization of `rawMdxFallback` renderHTML conflates the NodeView's `<pre>` with the `renderHTML` function's output (the `<pre>` lives only in the NodeView).
- **LOW (4):** D9's 6-plugin panel doesn't cover 3 fingerprints from D13 heuristics (GSheets, Slack, GitHub rendered) — arguably consistent with research Part 2 §D11 day-one list, but worth noting. D14 references "BlockNote `copyExtension.ts:183-199`" when the handler plumbing (handleDOMEvents registration) is actually at lines 210-235; lines 183-199 are the `copyToClipboard` body. §6 FR-18 mentions `index.ts:515,530,563` line offsets — two match, one (515 for `event:'unknown-mdast-type'`) is actually slightly off (the event string is at line 515 but the `console.warn` call begins at 513). FR-13 references "D8 LOCKED" but D8 in the decision log is the ambiguous-paste decision (correct); the audit confirms D8 and D15 together lock both policy and config-vs-hardcoded — minor tidiness issue that FR-13's citation could be clearer by also naming D15.

---

## High Severity

### [H] Finding 1: FR-12 and §13 Next-Action #6 contradict D14 / FR-1 / §16 on the WYSIWYG copy-cut mechanism

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §6 FR-12 (line 115), §13 Next Actions item 6 (line 344), vs. §6 FR-1 (line 104), §10 D14 (line 301), §16 SCOPE (line 431)
**Issue:** The spec's D14 is explicit: **refines D3's mechanism to use DOM-level `handleDOMEvents.copy/cut/dragstart` instead of PM's `clipboardTextSerializer` + `clipboardSerializer` dual hooks.** FR-1 and §16 SCOPE restate this as the chosen mechanism. But FR-12 and §13 Next-Action #6 still refer to `clipboardTextSerializer` + `clipboardSerializer` as the cut/copy plumbing. An implementer reading top-to-bottom will see conflicting prescriptions for exactly which PM/TipTap API to wire.
**Current text:**
- FR-1 (line 104): "via a single DOM-level `handleDOMEvents.copy/cut/dragstart` handler that runs one shared pipeline invocation"
- D14 (line 301): "use DOM-level `handleDOMEvents.copy/cut/dragstart` (BlockNote's pattern), NOT PM's `clipboardTextSerializer` + `clipboardSerializer` dual hooks"
- FR-12 (line 115): "WYSIWYG cut via PM's unified copy-and-cut handler (our `clipboardTextSerializer` + `clipboardSerializer` fire on both)."
- §13 Next Actions 6 (line 344): "Wire WYSIWYG clipboard: `clipboardTextSerializer` + `clipboardSerializer` + `handlePaste` in `TiptapEditor.tsx`."
- §16 SCOPE (line 431): "`packages/app/src/editor/TiptapEditor.tsx` (handleDOMEvents.copy/cut/dragstart + handlePaste per D14)"
**Evidence:** `@types/prosemirror-view` / `prosemirror-view@1.41.8/dist/index.d.ts:818` confirms `clipboardSerializer?: DOMSerializer` (D14's rationale for the refinement holds — the `DOMSerializer` return type is precisely why the refinement is warranted). BlockNote reference at `/Users/edwingomezcuellar/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts:210-235` confirms `handleDOMEvents.copy/cut/dragstart` as the production pattern D14 is referencing.
**Status:** INCOHERENT
**Suggested resolution:**
- At §6 FR-12, replace "WYSIWYG cut via PM's unified copy-and-cut handler (our `clipboardTextSerializer` + `clipboardSerializer` fire on both)" with "WYSIWYG cut via the same DOM-level `handleDOMEvents.copy/cut/dragstart` handler registered in FR-1 — `cut` shares the copy MIME-writing path plus a selection-delete transaction."
- At §13 Next Actions item 6, replace "`clipboardTextSerializer` + `clipboardSerializer` + `handlePaste`" with "`handleDOMEvents.copy/cut/dragstart` + `handlePaste` per D14."

### [H] Finding 2: Spec NG4 (Image paste) collides with fidelity-invariant NG4 (Storage-layer sanitization) referenced across §3, §6, §16

**Category:** COHERENCE
**Source:** L1
**Location:** §3 NG4 (line 46), §3 NG7 (line 49), §6 NFR Security/privacy (line 128), §16 EXCLUDE (line 442)
**Issue:** The spec declares its own NG4 as "Image paste" (§3 line 46). Elsewhere the spec cites "our NG4 storage-fidelity invariant" (§3 NG7 line 49) and "NG4 storage-fidelity invariant" (§6 NFR line 128) — but that's CLAUDE.md's NG4 ("No storage-layer HTML sanitization — raw HTML passes through unchanged"), not the spec's. The research report (R18 Archetype Z context) and D10 ("Consistent with R18 + CLAUDE.md NG4") use "NG4" meaning CLAUDE.md's invariant. A reader who sees "matches NG4 storage-fidelity invariant" in §6 will scan the spec's §3 non-goals, find NG4 = "Image paste," and be confused.
**Current text (examples):**
- §3 NG4 (line 46): "[NOT NOW] NG4: Image paste..."
- §3 NG7 (line 49): "XSS is a render-layer concern (R18 Archetype Z + our NG4 storage-fidelity invariant)."
- §6 NFR Security/privacy (line 128): "Matches NG4 storage-fidelity invariant."
- §16 EXCLUDE (line 442): "Image paste / file handler (`packages/app/src/editor/image-upload/`) — NG4"
**Evidence:** CLAUDE.md's "Irreducible gaps (by design)" section defines NG4 as "No storage-layer HTML sanitization — raw HTML passes through unchanged." Research report line 448 uses the same convention ("our NG4 invariant" = storage-layer sanitization policy).
**Status:** INCOHERENT
**Suggested resolution:** Disambiguate consistently. Two clean paths:
- Rename spec's NG4 (Image paste) to a fresh non-colliding ID (e.g., reorder the list; Image paste becomes NG-IMG or similar), keeping references to "CLAUDE.md NG4" explicit.
- OR keep spec's NG4 = Image paste and replace every "NG4 storage-fidelity invariant" / "our NG4 storage-fidelity invariant" reference with "CLAUDE.md's storage-fidelity invariant" or "the no-storage-layer-sanitization invariant." The second path is surgical and preserves numbering.
Minimum edit: change §3 NG7, §6 NFR, and §16 EXCLUDE so the two meanings of "NG4" are distinguishable.

---

## Medium Severity

### [M] Finding 3: Q1's HTML shape for wikiLink contradicts FR-8's "NOT the OK-private data-attr form"

**Category:** COHERENCE
**Source:** L1
**Location:** §6 FR-8 (line 111), §11 Q1 (line 308)
**Issue:** FR-8 states the HTML emission for custom nodes is "canonical rendered form (e.g., wikiLink → `<a class="wiki-link" href="...">target</a>`), NOT the OK-private data-attr form." But Q1's resolved shape is `<a class="wiki-link" data-target data-anchor data-alias href="#slug">` — semantic anchor **with** data-attrs. That's arguably a hybrid form. The contradiction is: Q1's shape is not "NOT the OK-private data-attr form" — it includes data-attrs for the OK-private trio (target, anchor, alias). An implementer could reasonably read FR-8 as "no data-* attrs" and strip them, producing a form inconsistent with Q1.
**Current text:**
- FR-8 (line 111): "HTML emission is canonical rendered form (e.g., wikiLink → `<a class="wiki-link" href="...">target</a>`), NOT the OK-private data-attr form"
- Q1 resolution (line 308): "wikiLink→`<a class="wiki-link" data-target data-anchor data-alias href="#slug">`"
**Evidence:** Current `WikiLink.renderHTML` at `packages/core/src/extensions/wiki-link.ts:101-119` emits `<span data-wiki-link data-target=... data-alias=... data-anchor=... data-resolved=...>text</span>`. The FR-8 wording was intended to reject this *span-wrapper + data-attr* form; Q1 keeps data-attrs on an `<a>`. Consistent with *semantic* tagging but not with "NOT the OK-private data-attr form."
**Status:** INCOHERENT
**Suggested resolution:** At FR-8 (line 111), revise the parenthetical example to match Q1 — either drop "NOT the OK-private data-attr form" or rewrite as "using semantic elements (e.g., `<a>`) rather than the current span-wrapper form; OK-private metadata may persist as data-* attributes on the semantic element for round-trip."

### [M] Finding 4: Source paste Branch B (text/x-gfm) appears in spec §9 but not in research Part 3 §D22's sketch

**Category:** FACTUAL / COHERENCE (evidence-synthesis fidelity)
**Source:** L4
**Location:** §6 FR-5 (line 108), §9 item 4 (Source paste branches, lines 236-240)
**Issue:** Spec §9 item 4 describes Source paste as a 5-branch dispatcher parallel to WYSIWYG, including "Branch B → markdown string inserted" (text/x-gfm → markdown text insert). Research Part 3 §D22 (REPORT.md:983-1031) lists only 3 explicit branches (VS Code, data-pm-slice, generic HTML) plus a fall-through to CM6 default, and does NOT include a text/x-gfm branch. Spec FR-5 says "mirrors WYSIWYG's 5-branch dispatcher" — the mirroring adds a branch the research report's Source sketch omitted. Not incorrect per se (symmetry is a legitimate architectural choice), but it's a spec-level extension, not a research-report finding.
**Current text (spec):**
- §9 item 4 Source paste Branch B (line 238): "Branch B → markdown string inserted."
**Evidence:** REPORT.md:987-1031 (Source paste code sketch) omits text/x-gfm detection. REPORT.md:1027-1028 groups "Branches 4, 5" as "CM6 default handles text/plain" — leaving only 3 explicit branches.
**Status:** INCOHERENT (spec's framing "mirrors the 5-branch dispatcher" is architecturally sound but not a direct research-report citation)
**Suggested resolution:** At FR-5 (line 108), note that text/x-gfm branch for Source paste is a spec-level symmetry extension beyond research Part 3 §D22's original 3+fallthrough sketch — or explicitly cite "parallel to WYSIWYG FR-3 per research Part 2 §Recommendation line 557" for Branch B's origin.

### [M] Finding 5: §8 characterization of rawMdxFallback renderHTML conflates NodeView and renderHTML output

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 "Current state (how it works today)" — Custom nodes paragraph (line 164)
**Issue:** Spec says: "rawMdxFallback: `renderHTML` → `<div data-raw-mdx-fallback data-raw-badge="raw" data-reason="..."><pre>source</pre></div>`." Actual `renderHTML` at `packages/core/src/extensions/raw-mdx-fallback.ts:48-60` returns `['div', {data-raw-mdx-fallback: '', data-raw-badge: 'raw', data-reason: ..., contenteditable: 'false', class: 'raw-mdx-fallback'}, 0]` — no `<pre>`. The `<pre>` appears only in the `addNodeView` contentDOM (line 74-81). This matters because spec implementers using `renderHTML` (which is also what TipTap's `getHTML()` / serializeForClipboard uses) will NOT produce the `<pre>` the spec depicts.
**Current text (line 164):** "rawMdxFallback: `renderHTML` → `<div data-raw-mdx-fallback data-raw-badge="raw" data-reason="..."><pre>source</pre></div>`."
**Evidence:** `packages/core/src/extensions/raw-mdx-fallback.ts:48-60`:
```ts
renderHTML({ HTMLAttributes }) {
  return [
    'div',
    { 'data-raw-mdx-fallback': '', 'data-raw-badge': 'raw', 'data-reason': HTMLAttributes.reason, contenteditable: 'false', class: 'raw-mdx-fallback' },
    0,
  ];
},
```
The `<pre>` is in the NodeView (line 74).
**Status:** CONTRADICTED (minor — characterization is close but imprecise)
**Suggested resolution:** At §8 line 164, revise to: "rawMdxFallback: `renderHTML` → `<div data-raw-mdx-fallback data-raw-badge='raw' data-reason='...' class='raw-mdx-fallback' contenteditable='false'>text content</div>`. The inner `<pre>` visual wrapper lives only in `addNodeView`, not in `renderHTML`'s output." This matters because clipboard serialization takes `renderHTML`'s path, not the NodeView's.

### [M] Finding 6: §8 characterization of wikiLink renderHTML omits the `data-resolved` attribute

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 Custom nodes — wikiLink line (line 161)
**Issue:** Spec §8 says: "wikiLink: `renderHTML` → `<span data-wiki-link data-target=... data-alias=... data-anchor=... data-resolved=...>text</span>`." This is correct. But then FR-8 says the HTML emission must be "NOT the OK-private data-attr form." Q1's approved shape for wikiLink's `<a>` drops `data-resolved`. This isn't a spec error about the current state, but a nudge-worthy clarity issue for the implementer: is `data-resolved` intentionally dropped from the new form, or is it an oversight? The spec doesn't say. Given the spec's detailed attention to wikiLink, worth noting.
**Current text (line 161):** "wikiLink: `renderHTML` → `<span data-wiki-link data-target=... data-alias=... data-anchor=... data-resolved=...>text</span>`. `parseHTML` matches."
**Evidence:** `packages/core/src/extensions/wiki-link.ts:101-119` confirms `data-resolved` is emitted by the current `renderHTML`. Q1 approved shape is `<a class="wiki-link" data-target data-anchor data-alias href="#slug">` — no `data-resolved`.
**Status:** UNVERIFIABLE (intent not stated)
**Suggested resolution:** At Q1 (line 308), note explicitly whether `data-resolved` is intentionally dropped from the HTML emission (it's server-computed state, probably not useful to clipboard consumers) or whether it carries over. Single sentence.

---

## Low Severity

### [L] Finding 7: D9's 6-plugin panel doesn't cover 3 fingerprints in D13 detection heuristics

**Category:** COHERENCE
**Source:** L1
**Location:** §10 D9 (line 296), FR-9 (line 112), §16 SCOPE (lines 419-425)
**Issue:** Research Part 2 §D13 lists 10 detection heuristics including fingerprints for Google Sheets (`<google-sheets-html-origin`), Slack (`c-message_kit__`), and GitHub rendered (`.commit-link` / `[data-hovercard-type]`). D9's "full set of 6" covers GDocs, Word, Cocoa, Gmail, Notion, VS Code — NOT these three. The spec is consistent with research Part 2 §D11 recommendation (which also lists only those 6 plugins) but a reader cross-referencing D13 may notice the gap. Not a bug; all three sources will fall through to the "generic HTML" branch cleanly.
**Current text (D9 line 296):** "Day-one source cleanup panel is the **full set of 6 rehype plugins**: GDocs, Word (mso-*), Cocoa (Notes/Mail/TextEdit/Pages), Gmail, Notion-whitespace-preserve, VS Code structural fallback."
**Evidence:** Research REPORT.md:607-618 (D13 detection heuristics) and REPORT.md:563-569 (D11 plugin list). D11 ships 6 plugins; D13 lists 10 source types with fingerprints. Delta: Google Sheets, Slack, GitHub rendered.
**Status:** UNVERIFIABLE (intentional scope narrowing vs oversight)
**Suggested resolution:** At D9 line 296, add a one-sentence note: "Sources without dedicated cleanup (Google Sheets, Slack, GitHub rendered, etc.) fall through to the generic HTML → rehype-remark branch; add plugins iteratively per D11 if real-world paste samples show cleanup needs."

### [L] Finding 8: D14's line-range reference to BlockNote `copyExtension.ts:183-199` omits handler plumbing

**Category:** FACTUAL
**Source:** T2 (oss-repos)
**Location:** §10 D14 (line 301), Rationale section
**Issue:** D14 cites "BlockNote `packages/core/src/api/clipboard/toClipboard/copyExtension.ts:183-199` as the reference." Lines 183-199 contain the `copyToClipboard` function body (the payload: `event.preventDefault()` + `clipboardData.setData` for three MIMEs). But the actual "DOM-level handler" architecture D14 is citing lives at lines 210-235 (the `addProseMirrorPlugins()` + `new Plugin({ props: { handleDOMEvents: { copy, cut, dragstart } } })` plumbing). Reader who opens the referenced line range will see only the payload, not the registration pattern.
**Current text (D14 line 301):** "BlockNote `packages/core/src/api/clipboard/toClipboard/copyExtension.ts:183-199` as the reference."
**Evidence:** Verified at `/Users/edwingomezcuellar/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts`:
- Lines 176-199: `copyToClipboard` function body.
- Lines 210-235: `addProseMirrorPlugins()` with `handleDOMEvents: { copy, cut, dragstart }`.
**Status:** STALE / imprecise citation
**Suggested resolution:** At D14 line 301, expand the reference to `copyExtension.ts:176-235` (covers both the payload function and the `handleDOMEvents` registration) or explicitly cite the two ranges.

### [L] Finding 9: FR-18's structured-JSON example event name not in existing codebase

**Category:** COHERENCE
**Source:** L4
**Location:** §6 FR-18 (line 121)
**Issue:** FR-18 says: "Performance instrumentation via structured JSON `console.warn` (mirrors existing `mdx-block-fallback` + `unknown-mdast-type` patterns). Threshold: paste > 250ms, copy > 100ms. Event shape: `{event: 'clipboard-slow-op', op, view, elapsed_ms, branch, source, html_bytes}`." The existing JSON-warn event names (`mdx-block-fallback` at `parse-with-fallback.ts:36,59,69`; `unknown-mdast-type` at `index.ts:515,530,563`) are verified. The new event name `clipboard-slow-op` is net-new. FR-18 also references the existence of a "slow" operation count; the existing pattern counts failures, not slow operations. Not an error, just a nudge — the citation says "mirrors" but the event purpose (perf instrumentation vs parse fallback) is different. A reader may expect perf counters of the same shape. Low severity.
**Current text:** "mirrors existing `mdx-block-fallback` + `unknown-mdast-type` patterns"
**Evidence:** `packages/core/src/markdown/parse-with-fallback.ts:35-37,57-62,67-73` emit `mdx-block-fallback` / `mdx-whole-doc-fallback`; `packages/core/src/markdown/index.ts:513-519, 528-534, 561-567` emit `unknown-mdast-type`. All existing patterns are *failure counters*, not slow-op counters.
**Status:** UNVERIFIABLE (not wrong; pattern is shape, not semantics)
**Suggested resolution:** At FR-18 line 121, tighten "mirrors existing patterns" to "mirrors the JSON-shape convention of existing `mdx-block-fallback` / `unknown-mdast-type` warnings; purpose is perf instrumentation rather than parse-fallback counting."

### [L] Finding 10: A6 claim "Grepped its source — no copy/paste event overrides" is unverified in the audit

**Category:** FACTUAL
**Source:** T1 / T3
**Location:** §12 Assumptions A6 (line 324)
**Issue:** A6 claims `y-codemirror.next@0.3.5` does not intercept copy/paste events, status "Verified" with verification plan "Grepped its source — no copy/paste event overrides. Y.Text binding is transaction-level only." The audit did not re-grep y-codemirror.next's source to re-verify. If the verification was done during spec work and the conclusion was logged, that's fine; but the spec should cite the grep target (a file/line or a version-pinned statement) to make the verification portable.
**Current text:** "HIGH | Grepped its source — no copy/paste event overrides. Y.Text binding is transaction-level only. | N/A (verified) | Verified"
**Evidence:** Not re-verified in this audit. `y-codemirror.next` is listed in `packages/app/package.json` — would need a direct grep to re-confirm. The claim is plausible (CM6 extensions typically work at the transaction/ChangeSet layer, not DOM events) but the spec's verification trail is "grepped" without specifics.
**Status:** UNVERIFIABLE (from this audit)
**Suggested resolution:** At A6 line 324, record the grepped file path + absence-of-match so the verification is reproducible ("searched `node_modules/y-codemirror.next@0.3.5/dist/*` for `handleDOMEvents|addEventListener.*(copy|cut|paste)` — zero hits"). Optional but improves audit trail.

---

## Confirmed Claims (summary)

**Track T1 (own codebase) — confirmed:**
- `packages/app/src/editor/TiptapEditor.tsx:97-103` `clipboardTextParser` exists and parses text/plain as markdown (§8 ✓)
- `packages/core/src/extensions/wiki-link.ts:101-119` `renderHTML` emits `<span data-wiki-link ...>` (§8 ✓)
- `packages/core/src/extensions/jsx-component.ts:38-40` `renderHTML` emits `<div data-jsx-component data-content=...>` (§8 ✓)
- `packages/core/src/extensions/jsx-inline.ts:54-64` `renderHTML` emits `<span data-jsx-inline data-source-raw=... contenteditable='false'>` (§8 ✓)
- `packages/core/src/markdown/index.ts:687-723` custom-node mdast handlers all emit `{type: 'html', value: ...}` (§8 ✓)
- `packages/core/src/markdown/parse-with-fallback.ts:36,59,69` and `index.ts:515,530,563` emit structured JSON console.warn — existing pattern for FR-18 to mirror (FR-18 ✓)
- `packages/core/package.json` has `unified`, `remark-parse`, `remark-stringify`, `remark-frontmatter`, `remark-gfm` — absent `rehype-*` packages (A1 ✓)
- `packages/app/src/editor/observers.ts:69,79` — typed `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` objects (FR-5 invariant claim ✓)
- `packages/app/src/editor/SourceEditor.tsx` exists with `EditorView` extension architecture (§13 ✓)
- `packages/app/tests/stress/paste-fidelity.e2e.ts` exists (§7 ✓)
- `packages/app/src/editor/plugins/` contains no existing clipboard extension (§13 Next Actions ✓)

**Track T2 / T3 (3P dependencies / OSS) — confirmed:**
- `node_modules/prosemirror-view/dist/index.d.ts:818` defines `clipboardSerializer?: DOMSerializer` — verifies D14's rationale for refinement (D14 ✓)
- `node_modules/prosemirror-view/dist/index.d.ts:652-654` defines `handleDOMEvents` prop (FR-1 ✓)
- `node_modules/prosemirror-view/dist/index.js:2813, 2853-2854` emit and query `data-pm-slice` (FR-3 Branch C ✓)
- `node_modules/prosemirror-view/dist/index.js:3645,3651,3662,3691` PM's `doPaste` uses `shiftKey`-derived `plain` flag (FR-17 ✓)
- `node_modules/prosemirror-model/dist/index.d.ts:808` `createAndFill(attrs, content, marks)` accepts Fragment (FR-1, FR-19 ✓)
- `node_modules/@codemirror/view/dist/index.js:5074-5087` CM6 `handlers.paste` reads text/plain only (§8 ✓)
- `node_modules/@codemirror/view/dist/index.js:5128-5156` CM6 `handlers.copy = handlers.cut` writes text/plain only via setData at 5149 (§8 ✓)
- `node_modules/@codemirror/view/dist/index.d.ts:1198` `EditorView.domEventHandlers(handlers): Extension` is public API (A5 ✓)
- BlockNote `packages/core/src/api/clipboard/toClipboard/copyExtension.ts:176-235` — `handleDOMEvents: { copy, cut, dragstart }` is the production pattern (D14 ✓)
- Milkdown `packages/plugins/plugin-clipboard/src/index.ts:45-64` — Google Docs regex unwrap (D9 evidence ✓)
- rehype-parse / rehype-remark / remark-rehype / rehype-stringify are all active, current, compatible with unified (A1 ✓)

**Track T4 (web verification) — confirmed:**
- Safari/WebKit rejects `text/markdown` from ClipboardItem.write (research Part 1 §D2 ✓, NG5 ✓)
- rehype ecosystem active, node 16+ compat (A1 ✓)

**Coherence lenses — confirmed across:**
- L1 (cross-finding contradictions) — 2 HIGH + 3 MEDIUM findings, others pass
- L2 (confidence-prose) — confidence labels match prose certainty (no finding)
- L3 (missing conditionality) — conditionality appropriately scoped (no finding)
- L4 (evidence-synthesis fidelity) — finding 4 raised; other pivotal claims check out
- L5 (summary coherence) — §9 overview, §6 table, and §10 Decision Log mostly align
- L6 (stance consistency) — greenfield posture consistent
- L7 (inline source attribution) — load-bearing claims cite file:line or research section

---

## Unverifiable Claims

- **A2 bundle size <50KB (MEDIUM confidence):** Requires post-implementation measurement. Acceptable per spec's verification plan.
- **A4 Observer B typing-defer handles 1MB paste (MEDIUM confidence):** Requires empirical benchmark. Acceptable per spec's verification plan.
- **NFR "1MB Google Docs clipboard (largest realistic paste) must complete html→mdast→insert within <500ms desktop, <1s iOS Safari":** Target set; measurement deferred to post-implementation. Acceptable.
- **FR-14 `isMarkdown(text)` heuristic threshold `min(3, floor(lineCount/5))`:** Claimed to follow Outline's pattern. Not re-verified against Outline's source in this audit; research report claims it, but the cited Outline source file wasn't opened. Low-impact concern — the heuristic is specified, reproducible, and testable.
