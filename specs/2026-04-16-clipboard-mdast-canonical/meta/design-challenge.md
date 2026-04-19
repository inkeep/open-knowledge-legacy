# Design Challenge Findings — Clipboard Round-Trip with Markdown (mdast-canonical)

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-16-clipboard-mdast-canonical/SPEC.md`
**Challenge date:** 2026-04-16
**Total findings:** 12 (3 HIGH, 6 MEDIUM, 3 LOW)

**Summary posture.** The spec is well-grounded in a thorough research substrate. The mdast-canonical hub framing is correct. However, the spec carries three latent 1-way-door risks that warrant fresh eyes before scope-freeze: (1) D3/D14's replacement of PM DOMSerializer with `mdast-to-html` for WYSIWYG copy sacrifices a load-bearing interop hint (`data-pm-slice`) that OK→OK and OK→Linear/Outline round-trip depends on, (2) D7's custom-node mdast promotion has a narrower, reversible alternative that the spec rejects without adequate evidence, (3) D9's six-plugin day-one panel couples decision timing (ship all six now) to decision nature (cost per plugin is fungible) in a way that inflates scope without improving quality. The remaining findings are smaller scope gaps and documentation clarifications.

---

## High Severity

### [H] Finding 1: D3 + D14 drop `data-pm-slice` from our own copy output — OK→OK and OK→Linear/Outline lose the "PM-origin passthrough" signal that Branch 3 of our paste dispatcher depends on

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (stakeholder gap)
**Location:** §10 D3, D14, §6 FR-2, §9 "Alternatives considered" bullet 2, §9 Branch 3 of paste dispatcher
**Issue:** The spec's WYSIWYG copy emits `text/html` via `mdast-to-html` (canonical rendered HTML), explicitly rejecting PM's `DOMSerializer`. Its stated rationale: "no OK-private `data-*` markup leaks to clipboard" and "same HTML rendering across both views." Simultaneously, the paste dispatcher (FR-3, Branch 3) uses `html.includes('data-pm-slice')` to route PM-origin clipboard (ourselves, Linear, Outline, other TipTap editors) to PM's native `parseFromClipboard` for lossless round-trip.

**Current design:** From D3: *"WYSIWYG copy writes BOTH text/plain (markdown) AND text/html (canonical rendered HTML via mdast-to-html, NOT PM DOMSerializer)."* From D14: *"PM's `clipboardSerializer` type is `DOMSerializer` — bridging to our canonical HTML string requires a clunky subclass."*

**Challenge:** If we replace PM DOMSerializer with `mdast-to-html` for our OWN copy output, our text/html no longer contains `data-pm-slice`. Concretely:

- **OK tab A → OK tab B paste:** Branch 3 (`html.includes('data-pm-slice')`) doesn't trigger; we fall to Branch 4 (generic HTML), which runs `htmlToMdast` → `remark-stringify` → `MarkdownManager.parse` → PM. This is lossy for anything that markdown round-trip loses (see NG1–NG11 in CLAUDE.md: blank-line counts, thematicBreak `---`/`***` normalization, backslash escapes outside §2.4, GFM table column widths). The user journey in §5 ("Another OK tab | Cmd+C → paste → identical document state") is NOT satisfied under the proposed design; it's satisfied today by accident because PM DOMSerializer preserves `data-pm-slice`.
- **OK → Linear / Outline / BlockNote (other TipTap):** They use PM's native `parseFromClipboard` on receipt; that's built to consume `data-pm-slice`. Without it, they fall back to their schema `parseDOM` rules. Fidelity may degrade in ways we can't control or audit.
- **Evidence we're overlooking:** Research Part 2 §D13 explicitly calls `data-pm-slice` *"the single highest-leverage heuristic."* Research Part 2 §D14-11 (Outline) shows cross-editor PM-origin passthrough is the established pattern. We're about to break this for our own editor's primary interop case without citing evidence that destinations don't want `data-pm-slice` — they all do.

The rejection rationale ("`data-*` markup leaks to clipboard") cites greenfield cleanliness, but `data-pm-slice` isn't OK-private — it's a cross-editor PM ecosystem contract. It's what Linear, Outline, Notion-via-TipTap, BlockNote, and we ALL use to pass rich content losslessly between TipTap-family editors. Treating it as "leakage" conflates namespaced editor markup (TipTap decoration classes, NodeView wrapper classes — genuinely OK-private) with a PM-ecosystem slice-carrier attr.

**Evidence supporting challenge:**
- `/Users/edwingomezcuellar/projects/open-knowledge/reports/tiptap-clipboard-round-trip-markdown/evidence/d12-d13-cross-app-matrix-detection.md` lines 116–138 documents `data-pm-slice` as the canonical PM-ecosystem roundtrip contract, with "very low" false-positive risk across all TipTap siblings.
- The spec's own §5 journey "Another OK tab | Cmd+C → paste → identical document state" is weakened under the proposed design.
- NG1 (blank-line normalization) and NG10 (thematicBreak `---`→`***` at doc start) in CLAUDE.md confirm markdown round-trip is not lossless — markdown-only round-trip for OK→OK loses content the PM-slice path preserves.
- Research Part 3 §D20-2 points 1–2 actually acknowledge this: *"Source view has no PM — MUST use mdast-to-html"* is the forcing function. But the conclusion *"therefore both views should use mdast-to-html"* commits a non-sequitur: the right conclusion is *"each view emits the richest HTML it can authoritatively produce"*, which is PM DOMSerializer for WYSIWYG (cheap, lossless PM slice, adds `data-pm-slice`) and `mdast-to-html` for Source (no PM available).

**Alternative:** Emit **two HTML concatenations** on WYSIWYG copy:

1. **Primary**: PM DOMSerializer output (includes `data-pm-slice`) — satisfies OK→OK, OK→Linear/Outline, and every other TipTap-ecosystem destination.
2. **Fallback semantics**: every non-TipTap destination already ignores unknown attrs (`data-pm-slice`, `data-wiki-link`, etc.). Gmail, Slack, Notion, Apple Notes all strip unrecognized data-attrs during their own paste sanitization. So "leakage" is a non-concern for real destinations.
3. **Source view**: keep `mdast-to-html` as the only path, accept that Source→Source or Source→OK-WYSIWYG round-trip loses PM-slice fidelity (which is identical to today's pre-spec behavior for Source → anywhere).

Alternatively (more aggressive): if the cross-view symmetry argument is truly load-bearing, use `mdast-to-html` but **also emit a `data-pm-slice` attribute on the outer wrapper** that encodes the PM slice context. This is ~6 lines of wrapping logic and preserves the PM-ecosystem passthrough contract. Consult `prosemirror-view/src/clipboard.ts` for the serialization format.

**Trade-off:** Gained — lossless OK→OK and OK→Linear/Outline round-trip (currently working, silently regressed by the spec). Lost — a slightly less "clean" HTML payload containing one well-known PM-ecosystem attribute. Cost asymmetry is large: NG1/NG10-class round-trip losses are permanent data corruption for the user; an extra attr in clipboard HTML is invisible to destinations that don't consume it.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) revert D3's mdast-to-html requirement for WYSIWYG copy and keep PM DOMSerializer (accept cross-view asymmetry as intentional because the views have different substrates), or (b) keep `mdast-to-html` as the HTML body but emit `data-pm-slice` on the outer wrapper to preserve the PM-ecosystem roundtrip contract, or (c) measure the actual content loss on OK→OK markdown-only roundtrip against our fidelity corpus — if it's zero for the 99% case, then accept the simpler design. Add a §5 acceptance test: "WYSIWYG copy from tab A → paste into tab B produces a PM doc whose JSON is byte-equal to the source doc." Today this passes; post-spec it fails for any doc containing NG1/NG10-class content.

---

### [H] Finding 2: D9's six-plugin day-one cleanup panel conflates "all-DIY cost" with "all-day-one necessity" — greenfield ≠ shipping unexercised code

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** §10 D9, evidence/d9-rehype-cleanup-landscape.md, §6 FR-9
**Issue:** D9 LOCKED commits to shipping six rehype cleanup plugins (GDocs, MSO, Cocoa, Gmail, Notion-whitespace, VS Code-structural-fallback) on day one, citing: (a) "no OSS packages exist for vendor cleanup — all-DIY regardless of scope," (b) "each plugin is small (~20-100 LoC)," (c) "greenfield posture: no deferred tech debt."

**Current design:** From D9: *"ship all 6 as part of v1. Total new code ~500-800 LoC including tests. Deferred-panel alternative would add the missing 4 as a follow-up PR later; no architectural difference; cost is equivalent."*

**Challenge:** The evidence supports two conclusions, and the spec picks the one that expands scope without improving correctness:
1. "All six are DIY" correctly refutes the hypothesis "we can OSS-adopt a cleanup suite." That's a valid finding.
2. But it does NOT imply "therefore ship all six day-one." Four of the six are speculative: Cocoa meta, Gmail classes, Notion whitespace, VS Code structural fallback. None has been validated against a real OK user report. We have no usage data.

Greenfield posture means "no deferred tech debt," not "all theoretically-useful code day one." Code that's never executed is the classic source of bit-rot — a rehype plugin that handled `gmail_*` classes in 2026-04 but gets silently invalidated when Gmail updates its markup in 2027 is worse than no plugin at all (it gives users a false sense that paste-from-Gmail is tested and works). The Google Docs and Word cleanups are strongly-evidenced: research Part 2 confirms they're the #1 and #3 paste sources by frequency across our personas, and CKEditor has battle-tested reference code we can port. The other four are based on "someone might paste from here."

Research Part 2's OWN recommendation at the end of §D17 conflicted with D9:
> *"Start with narrow source cleanup. Ship Branches 1, 2, 4, 5 on day one (mechanical / settled). Ship Branch 3 with ONLY Google Docs cleanup initially (most common rich-text source). Add Word, Gmail, Apple Cocoa, Slack, Notion-whitespace-skip, VS Code-structural-fallback as user feedback surfaces them."*

D9 silently overrules Part 2 §D17 without rebutting it. The "Q5 superseded by D9" note in §11 doesn't address the architectural argument that *shipping more cleanup plugins widens the maintenance surface faster than user-reported pain.*

Research Part 2 §D9-3 argument "cost is equivalent, architectural difference nil" is the wrong cost-model. The operative asymmetry is:
- Ship 2 plugins now, 4 plugins on first user report each: each added plugin is accompanied by a real paste sample the user complained about. Plugins are tested against ground truth.
- Ship 6 plugins now: 4 of them are tested against synthetic evidence only (our port of CKEditor / BlockNote / Keystatic patterns). When real vendor markup drifts, we find out via user report anyway — but now we have 4 weakly-maintained plugins that accumulate dead code first.

**Evidence supporting challenge:**
- `evidence/d9-rehype-cleanup-landscape.md` §Finding D9-3 justification: *"Each plugin is small + small test file; patterns well-documented."* This justifies the decision being REVERSIBLE, not the decision to SHIP EAGERLY.
- The spec's own §15 Future Work "CKEditor-grade Word list reconstruction" catalogues real known-unknowns (we don't know whether Word paste is a priority use case). Similar uncertainty applies to the other four plugins — there's no survey data saying OK users paste from Cocoa apps.
- Research Part 2 §D17 Decision triggers: "**How aggressive is the source-cleanup panel on day 1?** (Ship GDocs only vs full panel.) Narrower is safer. User feedback surfaces priorities." The research itself frames this as genuinely debatable.

**Alternative:** Ship **two plugins day-one** (GDocs + MSO-styles, per research §D17's explicit recommendation), wrap their invocation sites in a composable pipeline where adding plugin #3 is a one-line registration in a `cleanupPlugins: []` array in `html-to-mdast.ts`. Document the remaining four in §15 Future Work with a template: "Add when a user reports that paste from $VENDOR doesn't round-trip cleanly." Add a telemetry signal for detected-but-uncleaned sources (e.g., `ch: 'clipboard-source-detected', source: 'gmail', hasCleanup: false`) so we see when a user pastes from Gmail but we don't yet have a cleanup plugin wired.

**Trade-off:** Gained — smaller surface, no unexercised code, telemetry-driven plugin prioritization, preserved ability to add any of the four deferred plugins as a <200-LoC PR when a user reports pain. Lost — the "feature complete" day-one delight of supporting every vendor we've heard of. But that delight is theoretical — users don't care that we support Gmail until they paste from Gmail and it fails; they don't know we don't support Gmail day-one unless we tell them.

**Status:** CHALLENGED
**Suggested resolution:** Demote D9 from LOCKED to DIRECTED; ship GDocs + MSO plus the pipeline scaffolding + telemetry day one, schedule others per real user reports. Or: keep D9 locked but explicitly cite what (beyond greenfield philosophy) argues against Part 2 §D17's recommendation. The research substrate actively disagrees with D9; the spec should either surface counter-evidence or defer to the research.

---

### [H] Finding 3: D14's DOM-level `handleDOMEvents` pattern for WYSIWYG copy/cut/dragstart introduces a 1-way-door with TipTap extension priority semantics

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) + DC1 (simpler alternative)
**Location:** §10 D14, §6 FR-1, FR-12, FR-16
**Issue:** D14 LOCKED commits to overriding copy/cut/dragstart at the DOM level via `handleDOMEvents.copy/cut/dragstart` with `event.preventDefault()` + `return true`, suppressing PM's default `serializeForClipboard`. The rationale: "PM's `clipboardSerializer` type is `DOMSerializer` — bridging to our canonical HTML string requires a clunky subclass that re-parses the string to DocumentFragment."

**Current design:** From D14: *"Single handler writes both MIMEs from one pipeline invocation, `event.preventDefault()` + return true suppresses PM's default `serializeForClipboard`. Symmetric with Source view's `domEventHandlers.copy/cut`."*

**Challenge:** Three latent problems with the DOM-level approach that the spec doesn't surface:

1. **Extension-priority interaction.** TipTap's `handleDOMEvents.copy` is part of the ProseMirror plugin chain — the FIRST plugin to return `true` wins. Adding our clipboard DOM handler mid-stack creates a priority hazard: any future TipTap extension (or third-party plugin added by a consumer) that also wants `handleDOMEvents.copy` will silently break or silently override our handler depending on plugin ordering. With `clipboardTextSerializer` + `clipboardSerializer` (PM's documented hooks), PM's own composition protocol explicitly merges contributions via `someProp` truthy-return semantics (research Part 1 §D1 — *"direct editor props win first, then direct plugins, then state plugins"*). The spec sacrifices a composable API for a less-composable one.

2. **Drag-and-drop coupling.** Research Part 1 §D7 clearly documents that **internal drag-and-drop does NOT re-enter** `clipboardTextSerializer` — internal drops reuse `view.dragging.slice` directly. This means PM's hooks don't leak into internal DnD. The DOM-level `dragstart` handler, however, fires on BOTH internal and external drags. FR-16 tries to address this ("drag from external app into WYSIWYG → rich HTML routed through paste pipeline") but the acceptance criterion says "existing drag tests continue to pass" without explaining how. The DOM-level path has to manually check whether this is an internal-drag-start (in which case we skip our handler so PM's saved-slice machinery still works) or external. The test matrix in §9 doesn't enumerate internal-DnD scenarios.

3. **`clipboardSerializer`-as-DOMSerializer-subclass is not "clunky."** The argument is that bridging from canonical HTML string → DocumentFragment → PM's string-serializer is a round-trip. But the DOMSerializer interface is `serializeFragment(fragment): DocumentFragment`; we can simply return a subclass whose `serializeFragment()` produces `{} as DocumentFragment` with an override — it's a *fragment* builder, not a string builder. The actual bridge is: parse our `mdast-to-html` string output into a DocumentFragment via `DOMParser`, return that — this is one function call, not a round-trip. The spec's "clunky" critique doesn't hold up under inspection.

The alternative (`clipboardTextSerializer` + `clipboardSerializer`) is the path every surveyed PM editor uses (Milkdown, Outline, Keystatic, tiptap-markdown — see research Part 1 §D3). Only BlockNote uses DOM-level (`handleDOMEvents.copy`), and they do it because they write THREE MIME types (blocknote/html + text/html + text/plain=MD). We only write two — PM's hooks handle two MIMEs natively.

**Evidence supporting challenge:**
- Research Part 1 §D1 documents PM's clipboard hook composition model in detail and notes it specifically avoids the drag-and-drop conflation.
- Research Part 1 §D3 table: 4 out of 5 surveyed markdown-copy editors use `clipboardTextSerializer` + leave `clipboardSerializer` alone. Only BlockNote uses DOM-level, and they had a forcing function (3 MIMEs).
- Research Part 1 §D7 table explicitly shows `clipboardTextSerializer` + `clipboardSerializer` fire on `copy | cut | dragstart` *without* polluting internal drop — which is exactly what we want.
- Research Part 3 §D21 recommends `domEventHandlers` for Source because CM6 has no equivalent to PM hooks. That's a CM6 constraint, not a WYSIWYG one. Symmetry-for-symmetry's-sake is cited in D14 but the research doesn't recommend WYSIWYG DOM-level — only Source.

**Alternative:** Use PM's documented hooks for WYSIWYG:
- `clipboardTextSerializer: (slice, view) => string` — emits markdown.
- `clipboardSerializer: { serializeFragment(fragment: Fragment): DocumentFragment }` — returns our canonical HTML parsed as DocumentFragment. Implementation sketch (~15 lines total):
  ```ts
  clipboardSerializer: {
    serializeFragment(fragment) {
      try {
        const mdast = pmToMdast(fragment /* wrap in topNodeType.createAndFill if needed */);
        const html = mdastToHtml(mdast);
        return new DOMParser().parseFromString(`<div data-pm-slice="0 0 []">${html}</div>`, 'text/html').body.firstElementChild as any;
      } catch (err) {
        return DOMSerializer.fromSchema(fragment.type.schema).serializeFragment(fragment);
      }
    }
  }
  ```
  This keeps `data-pm-slice` (addresses Finding 1), uses PM's composition model, and preserves drag-and-drop semantics.

**Trade-off:** Gained — composable TipTap extension stack, preserved internal-DnD fast path, documented PM contract, preserved `data-pm-slice`. Lost — a small string-to-DocumentFragment conversion (single `DOMParser().parseFromString` call, microseconds).

**Status:** CHALLENGED
**Suggested resolution:** Re-audit D14 against the two concerns above. If DOM-level really is the right answer, document in the spec why `clipboardSerializer` as a DOMSerializer-like object (even if not a true DOMSerializer subclass) is unworkable — and how the drag-and-drop internal-vs-external distinction is preserved. Otherwise switch to PM's documented hook pair. Related: this finding composes with Finding 1 (the HTML output can preserve `data-pm-slice` easily in either implementation, but it's more natural in the PM-hook implementation).

---

## Medium Severity

### [M] Finding 4: D7 custom-node mdast promotion has a narrower, reversible alternative that the spec doesn't explore

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §10 D7, §6 FR-8, §9 "Alternatives considered" bullet 5
**Issue:** D7 commits to promoting `wikiLink`, `jsxComponent`, `jsxInline`, `rawMdxFallback` from `html` passthrough mdast nodes to first-class mdast types, with new PM→mdast handlers, new mdast→markdown handlers (replacing existing), new mdast→hast handlers. The rejection rationale for the simpler alternative: *"breaks HTML emission to external destinations (wikiLink `[[Page]]` would render literal)."*

**Current design:** From D7: *"Custom-node mdast emission: promote from html passthrough to first-class types with distinct markdown- and HTML- serialization handlers."*

**Challenge:** A narrower alternative exists: leave the existing PM→mdast handlers unchanged (they emit `{type: 'html', value: '[[Page]]'}` etc. — this works for markdown round-trip), and add a **single remark plugin `remarkExtractCustomNodes` applied ONLY in the mdast→HTML branch**. This plugin walks the mdast tree and converts `html`-typed nodes whose `value` matches `/^\[\[.+?\]\]$/` into a hast `a.wiki-link`, `jsxComponent`-like raw-source into hast `pre.mdx-component`, etc. The existing PM→mdast handlers stay untouched; only the mdast→HTML branch gets the new behavior.

Advantages over full promotion:
- **Touches fewer files.** No edits to `packages/core/src/markdown/index.ts` PM→mdast handlers (risky area), no new `mdast-augmentation.ts` types, no changes to existing `to-markdown-handlers.ts` (markdown round-trip path stays bitwise-identical).
- **Narrower blast radius.** If the new handlers have a bug, only clipboard `text/html` is affected — not Y.Doc persistence, not Observer B bridge, not fidelity tests.
- **Reversible.** If custom-node HTML rendering reveals edge cases we didn't anticipate, we rip out the single plugin without touching anything else.
- **Testable in isolation.** The plugin is a hast transformer; test input is an mdast tree, test output is hast. No mock PM schema needed.

The rejection rationale (*"breaks HTML emission"*) is a strawman — it assumes the html-passthrough goes straight to `rehype-stringify`, which literally emits `value` as-is. But that's exactly what the new plugin fixes: intercept these `html` nodes at the mdast→hast boundary and convert them to structured hast.

**Evidence supporting challenge:**
- Existing PM→mdast handlers at `packages/core/src/markdown/index.ts:687-723` already correctly emit `{type: 'html', value: '...'}` for all four custom nodes (verified). Markdown round-trip is known-working.
- The only failing behavior is HTML emission. We don't need to fix markdown emission; we need to fix HTML emission.
- The D7 rationale includes the word "greenfield" — i.e., the justification is stylistic ("first-class types are architecturally-correct"), not functional. Greenfield posture ≠ over-engineering.

**Alternative:** Implement `remarkExtractCustomNodes` (or equivalently, `rehypeInjectCustomNodes` applied after `remark-rehype`) as a single-file unified plugin. ~80-120 LoC including tests. Leave all existing PM→mdast handlers alone. Document in the spec that this is the narrow-boundary approach; if D7's full promotion is ever needed (for, say, richer MDX handling), it's a subsequent refactor that's additive.

**Trade-off:** Gained — narrower scope, fewer files touched, preserved bitwise markdown round-trip, easier rollback. Lost — a slightly less "canonical" mdast that still carries `html`-typed nodes for custom types. The cost of impurity is small; the custom-node `html` values are well-formed markdown, not opaque strings.

**Status:** CHALLENGED
**Suggested resolution:** Document the narrow alternative in D7's Decision Log entry. If full promotion is chosen, state the specific benefits the narrow approach would lose (e.g., "we want to add MDX component serialization with full type-safety later, and the promotion is forward-looking"). If those benefits are weak, pick the narrow approach.

---

### [M] Finding 5: D15's hard-coded `prioritizeMarkdownOverHTML: true` is less reversible than the "Reversible (config can be added)" label suggests

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §10 D15, §6 FR-13
**Issue:** D15 hard-codes markdown-first on ambiguous paste with *"Reversible (config can be added)"* note. The symmetric argument cited: "matches R18 Archetype D canonical text/plain = markdown."

**Challenge:** Adding a config later is only "reversible" in the literal code sense. The compatibility issue is that once downstream consumers (documentation, user muscle memory, support articles, agent behavior patterns) embed the default, flipping it (or even surfacing a config surface that reveals a `prioritizeHTMLOverMarkdown` path) creates a surprising behavior change. Research Part 2 §D14-5 documents that Plate picks the opposite default (`prioritizeHTMLOverMarkdown`) — reasonable staff engineers disagree.

Concrete ambiguous-paste case: a user copies a Word document that contains code blocks (Word emits the code as HTML `<p class=MsoNormal>` with space indents + `text/plain` with literal backticks ` ``` `). Markdown-first parses the `text/plain` as a fenced code block (good); HTML-first parses the Word HTML (lossy bullet-indent mess). Markdown-first wins *here*. But for rich Gmail content (Word tables, complex formatting), HTML-first preserves more structure than parsing `text/plain`'s plain-text fallback as "markdown."

The isMarkdown heuristic (FR-14) is supposed to gate this — but the heuristic fails on a specific case: *a short Gmail email whose text/plain has exactly 3 URLs gives 6 link-weight signals ≥ threshold 3, so we parse it as markdown instead of using the rich HTML.* The failure mode is: user pastes a short formatted email, gets plaintext-with-URLs instead of a formatted email.

**Evidence supporting challenge:**
- Research Part 2 §D14-3 documents BlockNote's markdown-first default + the escape hatches they provide (`plainTextAsMarkdown`, per-paste override via `pasteHandler({event, editor, defaultPasteHandler})`).
- Research Part 2 §D14-5 documents Plate's opposite default.
- The spec's FR-14 `isMarkdown` heuristic threshold `min(3, floor(lineCount/5))` was taken from Outline; Outline doesn't also apply HTML detection — they use it as a single gate, which is different from our usage as one branch in a 5-branch dispatcher.

**Alternative:** Ship `prioritizeMarkdownOverHTML: true` as default but expose it as an option on the clipboard extension's editorProps — a one-liner config surface, no documentation bloat. The Cmd+Shift+V escape hatch (FR-17) covers the "I want literal text" case; a config covers the "I want HTML-first for my specific deployment" case. Second alternative: make the `isMarkdown` threshold adaptive based on whether text/html is present — raise the threshold (say, to `max(5, floor(lineCount/3))`) when HTML is also present, so only clearly-markdown text/plain wins over rich HTML.

**Trade-off:** Gained — user/consumer flexibility without spec churn; clean opt-out for niche cases; no surprise if we ever want to change the default. Lost — a tiny bit of surface area in editor configuration.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) expose the toggle at extension config level day-one (3 lines of code, hedges a behavioral bet we can't confidently win), or (b) document the specific case that forced hard-coding and the specific signals that would justify a future flip — so we know when to revisit.

---

### [M] Finding 6: FR-18's 250ms paste threshold for 1MB Google Docs paste is unverified — the spec lacks napkin math, and iOS Safari is especially risky

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §6 FR-18, §6 NFR "Performance", §12 A4
**Issue:** FR-18 sets a 250ms paste threshold for instrumentation. The NFR says *"A 1MB Google Docs clipboard (largest realistic paste) must complete html→mdast→insert within the user-gesture window (<500ms on desktop; <1s on iOS Safari). Measure post-implementation."* A4 assumption: *"Observer B's typing-defer (TYPING_DEFER_MS=300ms) handles large (1MB) Source paste without visible lag"* with confidence MEDIUM.

**Challenge:** The spec acknowledges this is unverified, but the 250ms threshold and the 500ms/1s targets are napkin-math-free. Research Part 2 §D15-5 claims rehype-parse "typically microseconds-to-low-ms for 1MB" — sourced as INFERRED. Concrete concerns:

1. **Pipeline stages stack.** For WYSIWYG paste of 1MB HTML: rehype-parse → ~6 cleanup plugins (each walks the hast tree) → rehype-remark → mdast→PM handlers → `updateYFragment`. Each stage is a tree walk. For Source paste: same + `remark-stringify` + Y.Text insert + **Observer B re-parse of the new Y.Text content** (which re-runs our whole markdown pipeline). Observer B's 300ms TYPING_DEFER just delays when the re-parse starts — it does not bound the re-parse duration.

2. **Observer B re-parse is O(doc size), not O(paste size).** If a 10MB doc already existed and the user pastes 1MB, Observer B re-parses 11MB of markdown. This is the per-keystroke re-parse cost for Y.Text changes. 11MB through our remark pipeline (with frontmatter, mdx-agnostic, position-slice walker, remark-prosemirror) is plausibly >1s on iOS Safari.

3. **iOS Safari is especially thin.** Mobile Safari's V8-equivalent is JSC with lower throughput than desktop. A 250ms threshold for WARN-level logging is fine; a 500ms-desktop/1s-iOS Safari target without prior measurement is an unbounded commitment.

4. **No fallback.** The spec's three-layer fallback (D12) covers conversion throws, not slow performance. If a paste takes 3s, the user sees a frozen UI — there's no progress indicator, no cancel, no "this is taking a while" message.

**Evidence supporting challenge:**
- Research Part 2 §D15-5 `"typically microseconds-to-low-ms for 1MB"` is INFERRED, not measured.
- CLAUDE.md documents `TYPING_DEFER_MS=300` and `DEBOUNCE_MS=50` — Observer B's re-parse path is NOT bounded by these; they're delay-before-start knobs.
- Risk table §14 flags "Observer-B re-parse latency on 1MB+ paste causes visible lag" with likelihood LOW, impact MEDIUM, but mitigation is "Benchmark (A4); if visible, add paste-size warning + offer paste-as-plain via UI" — i.e., the mitigation is reactive, not preventive.

**Alternative:** Before scope-freeze, run three benchmarks (each is <1 hour to construct):
1. rehype-parse + rehype-remark + mdast→PM on a canonical 1MB Google Docs paste sample — desktop + iOS Safari emulation.
2. Source paste of 1MB markdown into a doc that already has 10MB of content — measure Observer B re-parse time.
3. Measure Y.Text insertion of 1MB content into a Y.Doc that's already Hocuspocus-synced — measure the WebSocket echo time.

If any breaches the target, add a paste-size guard (e.g., "for pastes >500KB, show a confirmation dialog 'Paste 1.2MB?' with format-preserving vs plain-text options"). This is a user-facing mitigation, not just instrumentation. Second option: chunk the Y.Text insert into 100KB batches with `await new Promise(requestAnimationFrame)` between — yields the main thread so UI stays responsive.

**Trade-off:** Gained — actual performance numbers driving the design; user-facing mitigation for large pastes; reduced risk of iOS Safari regressions at launch. Lost — ~4 hours of benchmarking work before scope-freeze.

**Status:** CHALLENGED
**Suggested resolution:** Add a spec section §7.x "Performance budget with evidence" that documents the three benchmarks and resulting numbers. If any benchmark breaches the target, add a large-paste guard to §6 as FR-20. The spec's A4 should move from "Active" to "Verified before scope-freeze."

---

### [M] Finding 7: Scope gap — table-specific handling across vendors has distinct HTML shapes that the 6-plugin panel doesn't explicitly address

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §3 NG3, §10 D9, §14 Risks
**Issue:** §14's risk table says *"rehype-remark converts some GFM constructs (tables with complex colspan) unexpectedly — MITIGATION: Day-one tests cover basic GFM; complex Word-style tables deferred to NG3."* But the spec treats "Word-style tables" as a Word-exclusive concern (deferred to NG3 "CKEditor-grade Word list reconstruction"). This misses the broader table paste problem.

**Challenge:** Table paste is vendor-divergent even BEFORE Word-list-reconstruction complexity:

- **Google Sheets:** `<google-sheets-html-origin><table data-sheets-value='{"1":3,"3":42}' data-sheets-formula="=2*R[0]C[-1]">...</table>`. The data is in custom attributes, not cell content. A naive rehype-remark pass produces an empty table or renders literal JSON.
- **Google Docs:** tables are wrapped in `<div dir="ltr"><table>` (handled by GDocs cleanup) but cell contents have per-char styling spans that survive cleanup; rehype-remark preserves the spans as nested text nodes → ugly cell content.
- **Word:** nested tables / merged cells produce `rowspan`/`colspan` attrs that `hast-util-to-mdast` can emit as GFM table cells but only for simple rectangular tables — GFM tables have no colspan syntax.
- **Apple Numbers:** same Cocoa HTML Writer shape as Notes but with table-specific cell-count metadata.
- **Copying a table from the docs site or any rendered GFM markdown:** simpler, but the whole point is "copy from anywhere, get structured content."

The spec's NG3 defers one specific class (Word list reconstruction) to future work. Table paste isn't clearly in or out of scope. The GDocs cleanup plugin in D9 handles wrapper unwrapping — but the INNER table cell content (with per-char style spans) is not covered. A user pasting a Google Docs table today will get... what? Unclear. The spec doesn't say.

**Evidence supporting challenge:**
- `evidence/d12-d13-cross-app-matrix-detection.md` line 82: Google Sheets detection is HIGH confidence but cleanup is `strip outer <google-sheets-html-origin>, inner <style>`. No mention of preserving `data-sheets-value` or `data-sheets-formula` (which carry the actual values).
- Research Part 2 §D15-5 doesn't mention table-specific performance either.
- The spec's §5 user journey doesn't list "paste a table from Google Docs" as a test case, but it does list "Gmail rich HTML → bold/headings/lists" — which is strictly smaller than a table paste.

**Alternative:** Either explicitly add "basic GFM table paste from GDocs/Gmail/Apple Notes" as FR-X with per-vendor acceptance criteria, OR add a §3 non-goal ("NG9: Table paste fidelity beyond simple rectangular tables") with a clear boundary (e.g., "any paste containing a table renders a best-effort GFM table; colspan/rowspan tables may lose structure"). Today the spec is silent, which means implementers will discover the issue during E2E testing.

**Trade-off:** Gained — clarity on what's supported day-one; no "table paste works... sort of" surprises. Lost — either more scope (if in) or a more-detailed non-goals list (if out).

**Status:** CHALLENGED
**Suggested resolution:** Pick explicit in/out for tables, update §3 or §6 accordingly. Add a specific test case in paste-fidelity.e2e.ts for the chosen boundary (basic GFM table from GDocs, pass-or-fail criteria stated).

---

### [M] Finding 8: Image paste (NG4) boundary is ambiguous — a Cmd+V from Google Docs containing text AND image falls into unclear territory

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §3 NG4, §9 "wrong type" shadow path
**Issue:** NG4 says *"Image paste (including base64 embedding from Word RTF sibling data) — Revisit if: image paste is prioritized; separate spec."* §9's data flow shadow paths note: *"wrong type: binary MIME (image/png) → ignore in this spec; covered by existing file-handler extension."*

**Challenge:** Users don't paste "just an image" — they paste a selection from Google Docs that contains prose AND embedded images. Or they paste from Gmail that has inline images (cid: references). The spec's "image paste is out of scope" doesn't tell us:

- What happens to `<img>` tags inside a pasted rich HTML payload? Does rehype-remark preserve them as mdast `image` nodes? Then on markdown serialization we get `![alt](googleusercontent-url)` which... points to googleusercontent (a URL that requires Google auth — will 403 for anyone else who renders the doc).
- What happens to `cid:image001` references from Gmail? These are broken on paste unconditionally (the image data is in `text/rtf` sibling data which NG4 defers).
- What if the clipboard has BOTH text/html with inline images AND image/png (the image rendered separately)? Does the "ignore binary MIME" handling mean the image is lost even though we CAN extract it from text/html as a URL reference?

The scope boundary "image paste is out of scope" is clear only for a literal "paste a PNG file" action. The much more common case — "paste a Google Docs excerpt containing an image" — has no clear boundary.

**Evidence supporting challenge:**
- Research Part 2 §D14-8 documents CKEditor's `replaceImagesSourceWithBase64(documentFragment, rtfData)` as "unique — CKEditor is the only source." The spec acknowledges this but doesn't say what our non-handling produces.
- Research Part 2 §D15-5 claims hast-util-to-mdast maps `<video>/<audio>` → links, and SVG is ignored by default. `<img>` behavior is unstated.
- Google Docs HTML samples (evidence/d12-d13) show `<img src="googleusercontent-url">` inline in the HTML output. Our rehype-remark pipeline will produce `![alt](url)` markdown that may or may not render.

**Alternative:** Explicitly state the day-one `<img>` handling:
- **Option A**: Preserve as `![alt](url)` markdown. Document that `cid:` and `blob:` URLs won't resolve; user sees broken image placeholder; they manually re-upload.
- **Option B**: Strip all `<img>` during rehype cleanup. User sees text-only paste; they manually add images.
- **Option C**: Preserve as `<!-- [image: alt, url: ...] -->` comment. User can see they had an image and re-upload deliberately.

Each has different UX. Today the spec implicitly picks Option A (default rehype-remark behavior) without saying so.

**Trade-off:** Gained — clarity of user expectations; no surprise broken-image behavior. Lost — slightly more spec text; potential additional rehype cleanup plugin.

**Status:** CHALLENGED
**Suggested resolution:** Add to §6 FR or §3 NG a sentence per image handling scenario. The most user-friendly approach: default to Option A, add a rehype plugin `rehypeStripInlineImages` that can be toggled on via extension config (for users who paste a lot from content behind auth walls and don't want broken images).

---

### [M] Finding 9: "Extend existing paste-fidelity.e2e.ts" — the existing harness supports text/plain + text/html simulation, but not the full copy-side validation

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §7 "Instrumentation," §13 Next actions item 8, §15 Identified "Playwright cross-browser clipboard virtualization strategy"
**Issue:** The spec repeatedly says "Extend existing paste-fidelity.e2e.ts" as a test action. Verified: the file exists and uses `new DataTransfer()` + `new ClipboardEvent()` + `dispatchEvent` to simulate paste. This works for PASTE-side tests (injecting clipboard data). But COPY-side tests (verifying what we write to the clipboard) need different infrastructure — either `page.evaluate` with `navigator.clipboard.read()` (requires permission + HTTPS) or intercepting `event.clipboardData.setData` calls.

**Challenge:** The spec lists 11 copy scenarios (§5 WYSIWYG copy matrix) that need verification. None of these can be validated with the current harness's `pasteText` pattern. The §15 Identified note "Playwright cross-browser clipboard virtualization strategy — Current E2E uses Playwright's clipboard API; need to verify it covers all five branches + cross-view" acknowledges this as a follow-up but doesn't block scope-freeze.

Concretely:
- To test "WYSIWYG Cmd+A + Cmd+C produces clipboard text/html containing `<strong>`," we need to trigger a copy event, intercept the setData calls, verify both MIMEs were written with the right content.
- Playwright's `page.context().grantPermissions(['clipboard-read', 'clipboard-write'])` enables `navigator.clipboard.read()` on `about:blank` but not on arbitrary origins without CORS.
- In headless Chrome, clipboard permissions require explicit grants and often don't cross origins cleanly.

The research report Part 3 and the spec both use the phrase "extend existing paste-fidelity.e2e.ts" but paste-fidelity only tests paste-side.

**Evidence supporting challenge:**
- Verified: `packages/app/tests/stress/paste-fidelity.e2e.ts` only exercises paste. The `pasteText` helper uses DataTransfer injection, which simulates paste but doesn't round-trip through copy.
- Playwright docs: clipboard access requires permission and HTTPS (our dev server is localhost HTTP, which works in Chromium but not trivially in Safari).

**Alternative:** Add a test harness helper `simulateCopyAndRead(selection)` that:
1. Sets the selection in the editor.
2. Dispatches a synthetic `copy` event.
3. Intercepts `event.clipboardData.setData` via a monkey-patched `DataTransfer` or via a `copy` event capture handler that reads `event.clipboardData` before `preventDefault`.
4. Returns `{ plain, html }`.

This is ~30 lines of helper code but makes copy-side E2E testing possible in all browsers without clipboard-permission dance. Document the helper in §13 Next actions explicitly; don't bury it in §15 Identified.

**Trade-off:** Gained — ability to run full copy+paste round-trip tests in CI with deterministic behavior. Lost — a small amount of harness development work.

**Status:** CHALLENGED
**Suggested resolution:** Upgrade §15 Identified "Playwright cross-browser clipboard virtualization strategy" to §13 Next actions; specify the harness helper API; add at least 5 copy-side test scenarios (WYSIWYG → plain, WYSIWYG → HTML with wikiLink, Source → plain, Source → HTML, empty-selection no-op) to the day-one test coverage. Without this, FR-1/FR-2/FR-4's acceptance criteria ("Cmd+A + Cmd+C produces clipboard X") are unverifiable in CI.

---

## Low Severity

### [L] Finding 10: Module names `html-to-mdast.ts` and `mdast-to-html.ts` are consistent with existing conventions in `packages/core/src/markdown/`

**Category:** DESIGN
**Source:** DC1 (naming review — low-stakes)
**Location:** §10 D13, §13 Next actions
**Issue:** The spec proposes `packages/core/src/markdown/html-to-mdast.ts` and `mdast-to-html.ts`. Existing files in the directory follow several naming conventions.

**Current design:** Confirmed — new module names match D13's "colocates with existing unified pipeline."

**Challenge:** Survey of existing files:
- `pipeline.ts`, `index.ts` — infrastructure
- `handlers.ts`, `to-markdown-handlers.ts` — handler tables
- `autolink-promotion.ts`, `autolink-void-html-guard.ts`, `doc-start-thematic-fix.ts`, `fence-regions.ts`, `parse-with-fallback.ts`, `position-slice.ts`, `ref-def-hoist.ts`, `remark-mdx-agnostic.ts`, `unknown-mdast-guard.ts`, `wiki-link-micromark.ts` — feature-specific transformation modules
- `mdast-augmentation.ts` — type augmentation

`html-to-mdast.ts` and `mdast-to-html.ts` fit the feature-specific-transformation naming pattern. One suggestion: the spec's §13 step 5 mentions `mdast-to-hast-handlers.ts` (new — custom-node HTML rendering per D7/Q1). If `mdast-to-html.ts` wraps a unified pipeline that internally calls `mdast-to-hast-handlers.ts`, the naming correctly reflects layering. This is fine — just flagging for implementation-time review.

**Evidence supporting challenge:** Surveyed file list in `packages/core/src/markdown/`.

**Alternative:** None needed — names hold up.

**Status:** CONFIRMED (naming is consistent)
**Suggested resolution:** No change. Flagging only because the design-challenge protocol asked about it.

---

### [L] Finding 11: Decision log IDs D1–D15 are ordered by accretion, not dependency — mild readability improvement possible

**Category:** DESIGN
**Source:** DC1 (clarity review — low-stakes)
**Location:** §10 Decision log
**Issue:** The Decision log has 15 decisions. IDs appear in accretion order (D1-D2 are library choices, D3-D5 are per-path decisions, D6 is detection, D7 is custom nodes, D8 is ambiguity, D9 is cleanup panel, D10 is security, D11-D12 are regression/fallback, D13 is layout, D14 is mechanism-refinement, D15 is config hard-coding). The spec references decisions as "D3/D14/D15 pattern of one-way doors," etc.

**Challenge:** D14 "mechanism refinement for WYSIWYG copy/cut/dragstart" is a clarification of D3's implementation approach — conceptually D3.1 or D3a. D15 "markdown-first hard-coded" is a clarification of D8's ambiguity decision — conceptually D8.1 or D8a. Flat numbering loses hierarchy. A careful reader tracking "what are all the 1-way doors" has to scan all 15 rows to find D3, D10, D14 — they're scattered.

**Evidence supporting challenge:** Spec's own `1-way?` column has 4 `1-way` decisions (D3, D4, D10, cross-view mdast-to-html amendment) — they're easier to find if grouped.

**Alternative:** Re-key as D1 (libraries), D2 (copy-HTML path), D2.1 (mechanism refinement), D3 (Source-copy-HTML symmetry), D4 (source-paste routing), etc. — grouped by concern. Or keep flat but add a "Dependencies" column listing which earlier decisions each depends on.

**Trade-off:** Gained — clearer cross-references. Lost — churn on every existing cross-reference (`D3/D7/D15 per §10`). Not worth the churn mid-spec.

**Status:** CHALLENGED
**Suggested resolution:** Keep D1-D15 as-is at this point in the process (renumbering mid-spec creates broken cross-refs elsewhere). Consider adopting the dependency-column pattern for future specs.

---

### [L] Finding 12: D10 "no DOMPurify" claim is nearly-correct but `mdast-to-html`'s custom-node handlers need verification

**Category:** DESIGN
**Source:** DC2 (security stakeholder)
**Location:** §10 D10, §12 A3, §14 Risks
**Issue:** D10 LOCKED commits to "No paste-time DOMPurify / storage-layer sanitization." Rationale: rehype-remark structurally drops script tags; existing render-layer sanitization remains sufficient.

**Challenge:** The claim holds for the PASTE direction (HTML → mdast → PM, scripts structurally dropped). But the COPY direction now renders mdast → HTML via our new `mdast-to-html.ts` with custom-node handlers (Q1 resolutions: jsxComponent → `<pre class="mdx-component"><code>escaped</code></pre>`, jsxInline → `<span class="mdx-inline">children</span>`, rawMdxFallback → `<pre class="mdx-fallback"><code>raw</code></pre>`).

Security concern: if a jsxComponent's `content` attr contains a `<script>` tag (because the user authored MDX with a `<script>` component), Q1's "escape and wrap in `<pre><code>`" is supposed to escape-on-emit. The spec depends on the escape being correct. Two places to verify:
- `mdast-to-hast-handlers.ts` correctly HTML-entity-encodes `<`, `>`, `&`, `"`, `'` in the source string before injecting into hast text nodes.
- `rehype-stringify` does NOT un-escape in a later pass.

**Evidence supporting challenge:**
- A3 says *"existing render-layer DOMPurify handles `htmlBlock`; new clipboard HTML is structurally-constrained by rehype pipeline."* This conflates the paste direction (structurally constrained) with the copy direction (programmatic HTML construction). Copy-direction safety depends on our handler code being correct, not on unified's structural guarantees.
- §14 Risk #1 "Custom-node HTML rendering introduces subtle escaping bugs" lists this at MEDIUM/MEDIUM; mitigation "Per-node test coverage; security review during implementation; render-layer DOMPurify as safety net." "Safety net" is at the docs site, not the destination app. When the user pastes OK-copied HTML into Gmail, Gmail's sanitizer handles it — so this is lower stakes than the risk table suggests, IF we trust destination sanitization.

**Alternative:** Add an explicit mdast-to-html.test.ts test case: `jsxComponent` whose `content` attr is `<script>alert(1)</script>` — verify the emitted HTML contains `&lt;script&gt;alert(1)&lt;/script&gt;` and NOT `<script>alert(1)</script>`. Similarly for jsxInline whose `sourceRaw` contains a script. Add a fuzz test that generates random custom-node content including HTML entities, XML namespaces, null bytes, etc., and asserts the output has no unescaped `<script>` substring.

**Trade-off:** Gained — confidence in escape correctness; explicit security-level test coverage. Lost — ~5 test cases (trivial).

**Status:** CHALLENGED
**Suggested resolution:** Add "Security: custom-node HTML escape correctness" as an explicit FR or amendment to FR-8; require the test suite enumerated above before scope-freeze.

---

## Confirmed Design Choices (summary)

The following design choices survive challenge with strong evidence:

**Architectural hub (mdast-canonical):** The mdast-canonical hub choice for all four clipboard paths is well-supported by the research substrate. Source view has no PM (forcing function), unified ecosystem is already installed, and the four paths compose cleanly through the hub. (Lens DC3 — framing validity)

**Turndown rejection (D1):** The rejection of Turndown for rehype-remark holds. Research Part 2 §D10 documents a legitimate architectural fit for unified, native GFM, tree-only flow, MDX passthrough. Turndown's 3.7M weekly DLs don't create ecosystem value for us because our stack doesn't participate in Turndown's rule-sharing ecosystem; we already have remark handlers that rehype-remark plugs into directly. (Lens DC1 — simpler alternative doesn't apply; they're compared head-to-head in the research)

**Paste-dispatcher shape (FR-3, D6):** The 5-branch dispatcher (VS Code MIME → text/x-gfm → data-pm-slice → generic HTML → text/plain) is well-supported across multiple surveyed editors (BlockNote, Milkdown, Outline use variations). Evaluation order with higher-fidelity branches first is correct. (Lens DC1, DC2 — no simpler alternative or stakeholder gap)

**No paste-time DOMPurify (D10 base claim):** For the PASTE direction, rehype-remark's structural sanitization is correct. Finding 12 flags a specific copy-direction gap, not the base claim. (Lens DC2 — security posture is correct for paste; minor gap for copy)

**Cmd+Shift+V escape hatch (FR-17, Q3):** Universal plain-paste escape via `event.shiftKey` matches industry-standard UX. (Lens DC1, DC2 — straightforward)

**Code-block paste short-circuit (FR-10):** BlockNote pattern of "paste into code block → plain text only" matches user expectation. (Lens DC2 — handles the ambiguous case well)

**Source view copy asymmetry closure (D4, FR-4):** While the user intuition argument ("I see `**bold**`, I expect literal `**bold**`") has weight, the design trade-off is defensible given: (a) Cmd+Shift+V escape hatch, (b) destinations select MIME by own content model (GitHub reads text/plain; Gmail reads text/html — both legs served), (c) greenfield symmetry. (Lens DC3 — the asymmetry argument I might have been discounting IS acknowledged but not dispositive)

**Schema is untouched (CLAUDE.md §9 compliance):** All clipboard work is at the mdast/pipeline layer; no schema narrowing. This is the most important architectural invariant and the spec respects it completely. (Lens DC2 — schema-add-only precedent honored)

---

## Note on DC3 (framing validity)

The Problem Statement's Complication cites four dimensions: (1) human clipboard ergonomics, (2) agent-assisted content flow, (3) greenfield posture, (4) observer bridge invariant. The Resolution (canonical mdast pipeline) follows from dimensions 1+2+3 symmetrically — each dimension, on its own, would motivate the proposed solution. Dimension 4 (observer bridge) is a constraint, not a motivator. The intersection reasoning holds: we wouldn't build this if we only had (1) (Obsidian-style text-only paste would suffice) or only (2) (agents write via MCP, not clipboard). We build it because the human-ergonomics bar AND the agent-copy-path matter in the same product. Framing passes DC3.

No critical framing issues found. The only framing nitpick: the Complication mentions "incrementally bolting on clipboard handling per-view without a canonical pipeline would set the wrong precedent" — this is a true statement about greenfield posture, but it's a secondary justification, not the primary problem. The primary problem is the functional gap (rich HTML paste silently loses formatting; copy doesn't emit markdown). A reader primed to question whether framing is post-hoc might wonder whether "greenfield precedent" was added to strengthen an otherwise-functional-only argument. That's weak evidence of framing post-hocness — not enough to change severity, but worth a one-sentence edit.
