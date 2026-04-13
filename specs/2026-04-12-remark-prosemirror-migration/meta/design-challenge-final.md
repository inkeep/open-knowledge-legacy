# Design Challenge Findings — Final Pass

**Artifact:** specs/2026-04-12-remark-prosemirror-migration/SPEC.md
**Challenge date:** 2026-04-12
**Pass:** Final (post R1 probe GO, post D15-D17 schema redesign, post R19-R22 amendments)
**Total findings:** 8 (3 high, 4 medium, 1 low)

Scope: stress-test design assumptions that became load-bearing after the probe verdict and schema redesign, but were not themselves re-exercised by the probe. Prior-pass findings (`design-challenge.md`) that remain live are referenced but not duplicated.

---

## High Severity

### [H] Finding 1: R19 unified-list extension has never been exercised against `prosemirror-flat-list` in any probe

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R19, §17.2, §17.3, §18.1, §19.6

**Issue:** The R1 probe used `prosemirror-schema-basic` (per §19.6 and the probe report — it uses the `code` node from basic schema in Gate 4). It never composed `prosemirror-flat-list` into the schema, never registered TipTap `Node.create({ name: 'list' })` wrapping flat-list's `NodeSpec`, and never validated that remark-prosemirror handlers can produce the nested `list > listItem+` shape R19 prescribes. The spec itself (§19.6) flags this as an unresolved implementer choice between:

- **A:** flat-list's native flat schema (list items are direct doc children + depth attr) — forces the mdast↔PM handler to flatten/re-nest trees
- **B:** nested NodeSpec matching mdast — diverges from flat-list's native shape, losing "drop-in utilities" value

§17.2 prescribes Path B ("`list` containing `listItem+`"). §19.6 says "Neither is inherently right. The probe should prototype both and pick based on which produces cleaner handler code." These two statements contradict each other: §17.2 is LOCKED via D15, §19.6 defers the same question to the implementer.

**Current design:** "list (attrs: ordered, start, spread; via prosemirror-flat-list wrapper — D15)" (§17.2, LOCKED).

**Alternative:** Either (a) demote D15's schema specifics from LOCKED to DIRECTED pending a focused list-integration probe (est. half-day), or (b) explicitly adopt flat-list's native flat schema and move the nesting concern into the mdast↔PM handler layer.

**Trade-off:** D15 locks a schema shape that hasn't been prototyped against the library it depends on. The implementer will hit this on day 1 of R19 and will either: (i) choose Path A and invalidate §17.2's nested NodeSpec, or (ii) choose Path B and find flat-list's input rules / keymap / commands assume the flat shape and don't transplant cleanly. Either path requires re-litigating a LOCKED decision.

**Status:** CHALLENGED
**Suggested resolution:** Add a 2-hour list-integration probe to validate: (1) which schema shape (A vs B) composes with remark-prosemirror with less handler code, (2) that Tab/Shift-Tab scoping (OQ1) works without breaking outer-editor keybindings, (3) that TaskList checkbox NodeView renders in both shapes. Either lock the probe-winning shape, or demote D15's schema specifics to "LOCKED: adopt prosemirror-flat-list; DIRECTED: specific NodeSpec TBD by first-day probe."

---

### [H] Finding 2: Schema-rename (D16/D17) assumes TipTap command routing survives — validated by one evidence doc, not by an integration test

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R21, §10 D16/D17, §17.3

**Issue:** D16/D17 claim `toggleBold()` still works after renaming the mark schema name from `bold` → `strong`. The supporting evidence is `reports/full-stack-pm-crdt-markdown-editor-ideal/fanout/.../d5-command-coupling.md`, which argues from TipTap source inspection: `toggleBold` is just a command-map key; the handler body calls `commands.toggleMark(this.name)` where `this.name` resolves to the (renamed) schema name.

This reasoning is correct in isolation but skips two real integration surfaces:

1. **`StarterKit.configure({ bold: false, italic: false, horizontalRule: false })`** — the disable list uses the StarterKit's internal extension keys (lowercase extension names), which may or may not be the same as the schema mark name. If StarterKit's Bold extension is named `bold` internally but our fidelity extension sets `name: 'strong'`, we get two marks registered with different names, not one replacing the other. Nothing in the spec or evidence confirms which convention StarterKit uses.
2. **UI components** (`slash-command/items.ts`, `bubble-menu/BlockTypeSelector.tsx`, PresenceBar, etc.) that call `editor.isActive('bold')` / `editor.isActive({ type: 'strong' })` use the schema name. R22 enumerates only the 26 `MarkdownManager` import-path changes. It does NOT enumerate the `isActive('bold')` / `toggleBold` / input-rule callsites that now reference the old name.

**Current design:** "Rename marks to mdast-canonical: bold→strong, italic→emphasis. y-prosemirror + PM core are fully name-agnostic. Low-friction TipTap `extend({ name: '...' })` config." (D16)

**Alternative:** Run a 30-min smoke test against the current app: rename `BoldFidelity.name` to `'strong'`, run the editor, verify Cmd-B still bolds, verify serialization still outputs `**x**`, verify bubble menu "Bold" button highlights when cursor is in bold. Land the result as evidence (inline in the spec or in `evidence/schema-rename-tiptap-smoke.md`) before implementation starts.

**Trade-off:** The probe investment is hours; the cost of wrong-assumption is an implementation-time dead-end where toggleBold invisibly breaks because StarterKit's Bold extension is still registered under `bold` and shadows the fidelity `strong`. The current spec would leave the implementer to discover this at commit 1 (dependencies) or commit 3 (handlers).

**Status:** CHALLENGED
**Suggested resolution:** Either (a) add a schema-rename TipTap smoke-test probe, or (b) re-scope R21 to include an explicit audit step for `editor.isActive(...)` / input-rule / keyboard-shortcut callsites plus a verification that `StarterKit.configure()` disable keys match the renamed schema names. Current R21 ("rename file + rename export + update import paths + update StarterKit.configure") under-specifies the UI-layer implications.

---

### [H] Finding 3: "Match-or-beat baseline" + 21 failing cases is a de facto regression budget the spec has not priced

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §6 R1/R13/G4, §7 M1, probe REPORT.md breakdown

**Issue:** The probe shows 97/118 pass (26% improvement) but 21 failing cases remain:
- 8 SEMANTIC_LOSS (HTML entities decoded, raw HTML under MDX, task-list `[x]` dropped, GFM autolink wrapped)
- 8 STRUCTURE_CHANGE (GFM table padding, blockquote soft-break collapse, ATX trailing hashes, nested emphasis, `&lt;tag&gt;` escape)
- 3 COSMETIC_NORMALIZATION
- 2 ERROR (`<https://example.com>` autolink + bare `<br>` — mis-parsed as MDX fragments; **this is a new MDX-interaction failure mode**)

The spec frames all 21 as "pre-existing gaps per NG5" or "same behavior as current stack." The probe report even says "not new regressions." But that claim doesn't survive inspection of two specific rows:

1. **GFM autolink `<https://example.com>` erroring under the new pipeline** is not the same behavior as marked — marked parses it as an autolink. Under the new stack, remark-mdx mis-claims the `<` as JSX and raises an error. This is a **new regression**, surfaced by the MDX-everywhere pipeline, that affects content our users can realistically write (autolinks are standard CommonMark).
2. **Bare `<br>`** has the same class of regression — it is valid HTML block-level content in our current stack (NG4: raw HTML passes through) but now fails under remark-mdx JSX-claiming.

The spec's G4 says "byte-exact source-text fidelity equal to or better than the current patched @tiptap/markdown pipeline on the 118-case catalog." A strict reading of that goal is "no case that currently passes may newly fail." Two cases that currently succeed now error. M1 (118-case pass rate ≥77/118) is a numerical gate that can hide per-case regressions — net improvement with per-case losses.

**Current design:** "≥77/118 whitespace-only" (R1 gate). "match-or-beat current" (G4). No per-case diff between old-failing and new-failing is enumerated in §7 or the spec body.

**Alternative:** Replace the aggregate "match-or-beat" gate with a per-case delta table: `old: pass / new: fail` = **regression**, blocks migration; `old: fail / new: fail` = pre-existing, acceptable; `old: fail / new: pass` = improvement. The probe TSV already has this data — it just hasn't been turned into a diff. Land that diff as explicit evidence and let the two true regressions (`<url>` autolink, bare `<br>`) be scoped as in-migration fixes or documented deferrals with user sign-off.

**Trade-off:** The current framing under-states user-visible impact: an autolink `<https://example.com>` erroring (rather than normalizing) during a round-trip is a hard failure mode with worse UX than the entity-decode cases. If left unscoped, an agent writing markdown containing an autolink could get a save-time crash.

**Status:** CHALLENGED
**Suggested resolution:** (1) Materialize the old-pass / new-fail diff from the probe TSV. (2) Reclassify any true new regressions out of the "pre-existing" bucket. (3) Either scope the regressions as in-migration fixes (probably a paragraph-level disambiguation handler for bare `<url>` and HTML-block detection ahead of MDX) or document them as NG with explicit user acknowledgment. Do NOT let "97 > 77" satisfy the G4 acceptance criterion without a per-case inspection.

---

## Medium Severity

### [M] Finding 4: The `mdxJsxFlowElement` handler is the biggest unknown in the implementation, but R8's acceptance criterion is "existing JSX round-trip tests pass"

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R8, §19.7 implementation learnings, probe Gate 5

**Issue:** The probe's Gate 5 (MDX multiline expression I3 stability) passed, but only because the placeholder handler drops attributes + children (probe REPORT line 73: "round-trips on pass 1 to `<Chart />`, then passes 2–3 are byte-identical"). I3 converges because the handler degrades to a stable empty form. The **real** `mdxJsxFlowElement` handler must serialize attributes + children verbatim, and nothing in the probe validates that this production handler achieves I3 stability.

R8 acceptance is "Verify existing JSX round-trip tests pass." Existing JSX tests in `jsx-component.test.ts` test code-fence JSX (```` ```jsx-component ````), not native MDX — and per R13 that file is REWRITTEN, so "existing tests pass" is a no-op acceptance criterion for R8 in practice.

The real test coverage is R16 (e) "MDX flow/text/expression/esm round-trip (22/23 cases from `mdx-crdt-roundtrip-fidelity` report)." That's where production handler correctness will be measured. But R8 itself is silent on how rich attribute serialization must be (spread attrs? expression attrs? boolean shorthand? JSX fragments?).

**Current design:** R8: "Handler for `mdxJsxFlowElement` (and `mdxJsxTextElement`) maps to `jsxComponent`/`jsxInline` PM atoms. Delete `jsx-tokenizer.ts`. Verify existing JSX round-trip tests pass." Plus §19.7 note: "production handler needs full attribute + child traversal."

**Alternative:** Expand R8 acceptance to enumerate the attribute forms that must round-trip:
- String literal: `<X name="value" />`
- Expression: `<X name={value} />`
- Multi-line object expression: `<X data={{\n  key: value\n}} />` (must also satisfy I3 per mdx-js/mdx#2533)
- Spread: `<X {...props} />`
- Boolean shorthand: `<X disabled />` (mdx-js/mdx#2608)
- Member expression: `<Docs.Link />`
- Self-closing vs paired: `<X />` vs `<X></X>` (byte-identity on original form)
- Children: text, inline marks, nested components, block children

And fold those into R8's acceptance as concrete cases, sourced from the existing `mdx-crdt-roundtrip-fidelity/23-case` catalog.

**Trade-off:** R8 as written lets an implementer ship a 40-LOC handler that passes a trivial test and misses half of the real MDX authoring surface (which is D13's sprint goal). Tightening R8 surfaces the scope clearly before implementation begins.

**Status:** CHALLENGED
**Suggested resolution:** Rewrite R8's acceptance criterion to enumerate the 8-10 MDX attribute / child shapes that must round-trip byte-identically. Cross-reference R16 (e) so the test coverage and the requirement acceptance are aligned.

---

### [M] Finding 5: R5 amendment leaves escape-preservation mechanism undecided — forces implementer judgment on a schema decision

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §6 R5, probe REPORT §"Fix path"

**Issue:** R5 now says: *"Recommended: a PM-level `escapeMark` on the text run, OR an `escapedText` inline atom node. Either approach is additive and handler-scoped — no pipeline shape change."*

Two load-bearing consequences of "either approach":

1. **The two approaches have different implications for Y.js + collaboration.** A mark can extend across multiple text runs and participate in normal mark toggling; an atom is opaque, indivisible, and will fragment runs (every `\#` becomes a separate node). A user typing over a backslash-escape will produce different Y.Doc deltas and different observer-sync behavior depending on which was chosen.
2. **The decision affects the mdast↔PM handler shape.** A mark handler needs to detect escape-containing source slices and wrap them; an atom handler needs to split text nodes at escape boundaries. These are different handler signatures with different edge-case behavior for adjacent escapes, escaped-emphasis `\*`, etc.

Leaving this open in the spec means the implementer makes a schema-level decision (new mark or new node) at implementation time without the spec's decision process gating it. That's a D15-class decision (schema redesign) being delegated to PR-author discretion.

**Current design:** "Recommended: … escapeMark … OR … escapedText atom. Either approach is additive."

**Alternative:** Add a D20 decision that picks one path. Rationale: `escapeMark` is less disruptive to Y.Doc runs, aligns with how `sourceDelimiter` is attribute-carried on other nodes, and avoids fragmenting text runs — but locks out the case where the escape is between mark boundaries (e.g., `**bold\*word**`). `escapedText` atom is more faithful but fragments runs. Pick one with evidence; don't defer to the implementer.

**Trade-off:** The probe's 1/13 P0 miss is a single-character bug. The spec's deferral makes it *look* like a trivial fix path, but in practice it's a schema decision with UX + collaboration implications that deserve the same D15-level scrutiny.

**Status:** CHALLENGED
**Suggested resolution:** Add D20 locking either `escapeMark` or `escapedText` with explicit rationale covering: Y.Doc run-fragmentation behavior, interaction with adjacent marks, handler complexity. If this can't be resolved from research alone, add a one-day probe that prototypes both against the P0 case `text \# more` plus the harder case `**bold\*word**`.

---

### [M] Finding 6: Rollback path (R18) assumes git-revert works, but D18's bun-patch on remark-prosemirror makes revert non-trivial

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 R18, §10 D18, §9 Rollback Path

**Issue:** R18 promises: "If post-merge a critical regression surfaces … a single-commit revert restores the patched @tiptap/markdown stack." The rollback story rests on atomicity: one PR adds unified+remark+patch, one revert removes them. But D18 adds a bun patch on `@handlewithcare/remark-prosemirror@0.1.5` via `patchedDependencies`. If the revert happens and reintroduces `@tiptap/markdown@3.22.3`'s patch file and `patchedDependencies` entry, both patch files need to land in the revert commit. A `git revert` does this, but the install-time patch application order becomes: bun sees the old `@tiptap/markdown` patch entry, fetches 3.22.3, applies the old patch. Fine — unless the reverted state includes the new remark-prosemirror patch path accidentally left in `patchedDependencies`.

More concretely: the spec doesn't describe how the rollback is tested. If a post-merge emergency needs `git revert` and a hot-install on CI, we need to know that `bun install` succeeds on the reverted state without human intervention. This is testable now by doing a dry-run revert on a branch.

**Current design:** "single-commit git revert restores the prior stack" (§9 Rollback path). "PR #65 precedent validates approach" (Q14).

**Alternative:** Add a "Rollback rehearsal" step to §13 Deployment / rollout: on the migration branch, immediately before merge, create a scratch branch that is `git revert HEAD`, run `bun install` + `bun run check`, confirm green. Land the proof as a comment on the PR. Takes ~15 minutes, makes the rollback real.

**Trade-off:** Without the rehearsal, R18 is a promise, not a verified procedure. In a production incident at 2am, "git revert and re-install" is the kind of thing that surfaces surprise dependency issues (e.g., patch file race, lockfile conflict).

**Status:** CHALLENGED
**Suggested resolution:** Add a rollback-rehearsal item to §13. Alternatively, note in R18 that the rollback procedure has been rehearsed and reference the evidence.

---

### [M] Finding 7: The probe's 100% position-data coverage was measured on 9 inputs — not the full 118 catalog

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §6 R5, §12 A1, probe Gate 6

**Issue:** A1 is marked CONFIRMED, citing "100% position data coverage across 9 sample inputs." Gate 6 passed, but 9 diverse samples ≠ exhaustive verification for a pipeline that must operate over every construct in the 118-case catalog + user-authored content. The risk §14 row "Position-slice recovery returns invalid data" is now Medium likelihood / Medium impact with fallback behavior specified — good — but A1 claims CONFIRMED on thin evidence.

Specifically, position data absence is documented for synthetic nodes and plugin-mutated nodes, and the plugin chain now includes remark-directive, remark-frontmatter, remark-mdx, and the position-slice walker itself. Nodes produced by `containerDirective` / `leafDirective` / MDX normalization are the most likely to have missing or out-of-bounds position data, and none of the 9 probe samples appear to exercise the directive + MDX + GFM composition path with nested structures.

**Current design:** "A1 | Position-slice … | CONFIRMED | R1 probe: 100% position data coverage across 9 sample inputs."

**Alternative:** Run the position-walker against all 118 catalog inputs and report the coverage percentage. Adjust A1 to reflect the full-catalog number (probably still 100% or very near it, but honest). If any construct returns out-of-bounds positions, explicitly enumerate them and confirm the fallback-to-default path works.

**Trade-off:** The probe harness already exists and already processes all 118 cases. Adding a position-data-coverage assertion to each run is ~10 LOC and would elevate A1 from "9-sample CONFIRMED" to "118-sample CONFIRMED."

**Status:** CHALLENGED
**Suggested resolution:** Re-run the probe's position-coverage check against all 118 cases, update A1's confidence justification with the real number, document any specific node types that fail the check.

---

## Low Severity

### [L] Finding 8: §18 change manifest lists `frontmatter.test.ts` as KEEP, but §18.2 doesn't mention `wiki-link.test.ts`

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §18.2 DELETE, §18.3 MODIFY, §18.6 tests

**Issue:** §18.3 says `wiki-link.ts` keeps its schema (inline atom) and removes `markdownTokenizer`. §18.6 enumerates test file changes but does not mention the existing wiki-link test file. Is it KEEP (unchanged), REWRITE (now tests the micromark path), or does it not exist? R7 says "Preserves current wiki-link test coverage" but doesn't say where or how.

This is a low-severity inventory completeness gap in an implementation-grounding section that aspires to be exhaustive.

**Current design:** §18.6 enumerates helpers.ts, test-harness.ts, 21 import-only files, jsx-tokenizer-prototype.test.ts (DELETE), jsx-component.test.ts (REWRITE), frontmatter.test.ts (KEEP). No mention of wiki-link tests.

**Alternative:** Add a line to §18.6: "wiki-link.test.ts — KEEP (schema tests unchanged); test coverage for the micromark tokenizer itself lives in `packages/core/src/markdown/wiki-link-micromark.test.ts` (NEW)."

**Trade-off:** Minor; an implementer will notice and resolve quickly. Included for manifest completeness.

**Status:** CHALLENGED
**Suggested resolution:** Add the wiki-link test entry to §18.6; mention the new micromark-tokenizer test file in §18.1.

---

## Confirmed Design Choices (summary)

### DC1 coverage (simpler alternatives)
- **Hybrid marked-parse + remark-stringify** — correctly rejected via D13 (MDX sprint goal requires MDX tokenizer, which marked lacks). The prior-pass finding is now satisfied.
- **prosemirror-remark** — rejected at source-code level via `reports/mdast-prosemirror-bridge-source-comparison`. Solid evidence.
- **Compat shim** — D2/D10 hold. PR #65 precedent + greenfield data state make atomic swap the right call.

### DC2 coverage (stakeholder gap)
- **Call-site containment (A5/Q8)** — 27 references, 100% in `packages/core/src/extensions/`. Verified.
- **Performance (A7)** — off critical typing path, 50ms debounced. Acceptably bounded.
- **Pre-flight probe as hard gate (D3)** — the probe actually ran, produced evidence, surfaced the `\#` miss early. Gate earned its keep.
- **remark-prosemirror dormancy (D1/D18)** — prior-pass [H] Finding 2 addressed via evidence/dependency-activity-assessment.md + PR #3 bun patch. Residual risk acknowledged.

### DC3 coverage (framing validity)
- **No-deferred-tech-debt framing** — still the legitimate driver. Greenfield-data + brownfield-behavior is the honest framing and the spec now reflects it.
- **Single atomic PR phasing** — commit sequence in §9 is coherent and resumable.

---

## What the prior-pass findings look like now

| Prior finding | Status |
|---|---|
| F1 — Phantom evidence (tokenizer-comparison report) | **Acknowledged** via Q15 + `evidence/dependency-activity-assessment.md`; tracked as copy-into-main. Acceptable. |
| F2 — remark-prosemirror maturity risk | **Mitigated** by D18 (bun patch for PR #3) + pinned 0.1.5 + explicit dependency-activity-assessment. Residual 0.x risk is now named, not hand-waved. |
| F3 — MDX #2533 absence | **Resolved**: §14 risk row + R16 test coverage line (b) + §19.5 note + probe Gate 5 validated it. |
| F4 — hybrid alternative | **Resolved** by D13. |
| F5 — Position-slice fallback | **Resolved** in spec text (§14) + partially in probe (§A1). See F7 above for residual concern. |
| F6 — Greenfield framing | **Resolved**: §1 now says "greenfield data … but brownfield behavior contracts." |
| F7 — §16 vs D12 remark-directive inconsistency | **Resolved** in §16 (`remark-directive` explicitly named as IN SCOPE). |
