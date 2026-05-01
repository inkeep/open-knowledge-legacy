---
date: 2026-04-29
type: meta
sources:
  - "Code: packages/core/src/markdown/details-accordion-promoter.ts (existing transformer)"
  - "Code: packages/core/src/markdown/callout-transformer.ts (the structural model cited in D16)"
  - "Code: packages/core/src/markdown/autolink-void-html-guard.ts:95 (LOWERCASE_JSX_CANONICAL_TAGS)"
  - "Code: packages/core/src/markdown/pipeline.ts:155-179 (parse-chain wiring)"
  - "Code: packages/core/src/markdown/image-promoter.ts (sibling promoter — runs after details promoter)"
  - "Code: packages/core/src/markdown/mdast-to-hast-handlers.ts (mdxJsxFlowHandler dispatch site)"
  - "Code: packages/core/src/markdown/to-markdown-handlers.ts:340-381 (mdxJsxFlowElement handler with htmlBoundary path)"
  - "Code: packages/core/src/markdown/index.ts:1019-1048 (jsxComponent PM→mdast handler — pristine vs dirty path)"
  - "Code: packages/core/src/registry/built-ins.ts:713-754 (HtmlDetailsAccordion compat descriptor)"
  - "Test: packages/app/tests/fidelity/invariant-i19.test.ts (I19 — the existing fidelity invariant for <details>)"
  - "Spec: specs/2026-04-29-clipboard-component-contract-and-byte-preservation/SPEC.md §D16"
  - "Evidence: specs/2026-04-29-.../evidence/q1-byte-preservation-matrix.md §J1.A.8"
  - "Evidence: specs/2026-04-29-.../evidence/q4-q6-q8-toclipboardhast-contract.md §HtmlDetailsAccordion"
  - "Report: reports/cb-v2-iframe-embed-pattern/REPORT.md (D1 + D6 — paired-vs-self-closing PUA carve-out)"
  - "Runtime trace (this session): mdManager.parseToMdast('<details>...</details>') returns paragraph > text in the production parse path; isolated full-chain unified() pipeline returns mdxJsxFlowElement(HtmlDetailsAccordion) correctly"
  - "Test run (this session): bun test packages/app/tests/fidelity/invariant-i19.test.ts → 8 pass / 11 fail (single-line, multi-paragraph, props-shape, PBT all fail)"
---

# Q27 — HtmlDetailsAccordion implementation design

## Context — what's locked (D16) and what we're designing

D16 reads as a fresh feature: extend `LOWERCASE_JSX_CANONICAL_TAGS` to include `details`, and add a new `details-transformer.ts` mirroring `callout-transformer.ts`. Q1 §J1.A.8 marked the round-trip as `BUG (UNVERIFIED)` based on the assumption that no inbound transformer existed.

**Both premises are stale.** Code-verified during this design pass:

1. `packages/core/src/markdown/details-accordion-promoter.ts` already exists (~325 LoC) and IS the inbound transformer the spec asks for. It already promotes both single-line and multi-paragraph `<details>...</details>` to `mdxJsxFlowElement(name='HtmlDetailsAccordion')` with `open` / `name` / `id` / summary-text → `defaultOpen` / `name` / `id` / `title` mapping.
2. It is already wired in `pipeline.ts:170` between Phase A `restoreFromMdx` and `imagePromoterPlugin` — the exact slot D16 specifies (precedent #16 phase-B walker, after PUA restoration).
3. The descriptor `HtmlDetailsAccordion` exists in `built-ins.ts:713-754` with the `htmlBoundary` to-markdown contract, the I19 fidelity invariant lives in `packages/app/tests/fidelity/invariant-i19.test.ts`, and the canonical/compat coverage tests reference it.
4. **`LOWERCASE_JSX_CANONICAL_TAGS` extension does nothing for `<details>`.** Per the iframe-pattern report's D1 finding (and a direct read of `autolink-void-html-guard.ts:221`), the carve-out only triggers on the self-closing form (`match.endsWith('/>')`). `<details>...</details>` is paired and never reaches that branch — so adding `'details'` to the set is a dead-letter edit that the iframe report explicitly carved out as out-of-scope follow-up (cite: REPORT.md §D1.3 + §D6 caveat).

What's actually broken — observed in this session: **the existing transformer does not fire when invoked through `MarkdownManager.parseToMdast` / `parseMd`**. I19's 11 failing tests prove the production parse path returns `paragraph > text > "<details>...</details>"`, NOT `mdxJsxFlowElement(HtmlDetailsAccordion)`. A manual unified() chain that mirrors `pipeline.ts` byte-for-byte (parse → frontmatter → mdx-agnostic → gfm → wiki-link → github-alerts → callout-transformer → restoreFromMdx → details-promoter → image-promoter → merged-walker) returns the correct `mdxJsxFlowElement` shape. The discrepancy is between the manual chain and the cached `parseProcessor` MarkdownManager builds — root cause not yet localized.

So the work this design covers is:

- Reframe Q27 around the **actual** failure mode (production parse path).
- Confirm the transformer's design, recognizer, attribute taxonomy, and phase ordering are correct as shipped.
- Define the test surface that proves the bug fixed — and that catches future regressions.
- Confirm the four-arm contract holds once the production parse-path bug is resolved (no further design work on the transformer, descriptor, dispatch site, or to-markdown handler).
- Skip the `LOWERCASE_JSX_CANONICAL_TAGS` extension — it does nothing for paired `<details>`. Document why so the spec can drop that half of D16.

## callout-transformer.ts pattern (the model)

The pattern D16 names. Captured here so the design comparison is concrete.

| Aspect | `callout-transformer.ts` |
|---|---|
| **Plugin shape** | `export function calloutTransformerPlugin() { return (tree: Root, file: VFile) => { visit(tree, 'blockquote', (node, index, parent) => { ... }) } }`. Standard Unified attacher returning a single transformer; uses `unist-util-visit` keyed on the source mdast type. |
| **Source mdast it consumes** | `blockquote` nodes that `remark-github-alerts` has tagged with `data.hName='div'` + class `ok-alert-<type>`. Re-inspects the original source bytes at `node.position.start.offset` to pick up the raw type token + foldable marker (`+`/`-`) + explicit title — neither of which the upstream plugin preserves. |
| **Output mdast** | `mdxJsxFlowElement` with `name: 'GFMCallout'` (compat descriptor). Position copied verbatim from the blockquote so Phase B's position-slice walker attaches `data.sourceRaw = source.slice(start, end)` — the original `> [!NOTE]\n> body` bytes. |
| **Phase ordering** | Registered in `pipeline.ts:162` AFTER `remarkGithubAlerts` (which produces the tagged input shape) and BEFORE Phase A `restoreFromMdx`. **Distinct from where the details promoter has to run** — callout works on a tagged-blockquote shape that exists pre-restore; details has to wait until after restoreFromMdx puts literal `<` `>` back into text. |
| **Test coverage** | No standalone `*.test.ts` adjacent to it; coverage rides on `handlers.test.ts` + `handlers.mdx.test.ts` (callout fixture path) + the I-series PBTs + `mdast-augmentation.ts` round-trip discipline. Pattern: rely on the surface-level fidelity tests, not unit-level transformer-isolated assertions. |
| **Why a custom ~150-LoC blockquote visitor instead of fork-and-extend** | The upstream `remark-github-alerts` plugin already handles error-prone opener-line tokenization (case-insensitivity, marker validation, title extraction, body-stripping). The transformer is strictly additive on top of that output; if the upstream proves problematic the visitor stays as escape hatch (one file changes). Same architectural posture applies to details: keep the recognizer minimal-surface, key off post-Phase-A text, no blockquote-style upstream tagger to consume. |

## Existing details-accordion-promoter.ts (already on `main`, mirrors the pattern)

Verified by reading `packages/core/src/markdown/details-accordion-promoter.ts` end-to-end and running the trace in this session.

| Aspect | Status |
|---|---|
| **Filename and location** | `packages/core/src/markdown/details-accordion-promoter.ts`. Adjacent to `callout-transformer.ts`, `image-promoter.ts`, `autolink-promotion.ts` — same directory, same filename convention (suffix `-promoter` vs callout's `-transformer` is a minor naming inconsistency the spec can leave alone or rename in finalize; both names exist in the codebase, both cited in `pipeline.ts` as comments). |
| **Plugin shape** | `export function detailsAccordionPromoterPlugin() { return (tree: Root) => { visit(tree, (node) => { if ('children' in node && Array.isArray(node.children)) promoteInParent(node) }) } }`. Same Unified attacher shape as callout-transformer. Visits every parent-like node and runs `promoteInParent` on its children array — necessary because the recognizer works at the children-array level, not at a per-node level (it has to span sibling paragraphs for the multi-paragraph form). |
| **Detection logic** | Two recognizer regexes plus a children-array sweeper: `SINGLE_LINE_DETAILS_RE = /^<details(\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>\s*$/` matches a single paragraph whose entire text value is `<details>...</details>`. `OPENER_RE = /^<details(\s[^>]*)?>(?:\s*<summary>([\s\S]*?)<\/summary>)?[\s\S]*$/` and `CLOSER_RE = /^\s*<\/details>\s*$/` together drive `findOpenerMatch`, which scans forward in the children array for the matching closer paragraph (handles the multi-paragraph case where opener / body / closer land as separate sibling paragraphs after Phase A restoration). |
| **Reconstruction logic** | `parseDetailsAttrs(rawAttrs)` is a small ad-hoc tokenizer over the opener tag's attribute string; recognizes `open` (boolean shorthand → `defaultOpen: true`), `name="..."` / `name='...'` / `name=bare`, and `id="..."` / `id='...'` / `id=bare`. Other attrs are silently dropped — γ `sourceRaw` preserves them on disk verbatim (per the file header comment). `buildAccordionAttrs` builds the `MdxJsxAttribute[]` array, emitting `defaultOpen`/`name`/`id` only when present and `title` only when summary text is non-empty after `.trim()`. The replacement `mdxJsxFlowElement` carries `name: 'HtmlDetailsAccordion'` (compat descriptor, NOT canonical `Accordion`) and copies the position span (single-line: paragraph position; multi-paragraph: opener.start → closer.end). |
| **Edge cases handled** | (1) Single-line form on one paragraph; (2) Multi-paragraph form across N+2 sibling paragraphs (opener + N body + closer); (3) Same-paragraph opener-with-body-but-no-closer is conservatively rejected by `findOpenerMatch` (refuses to match if any body candidate paragraph contains `</details>`); (4) Empty body emits no children; (5) Empty title (whitespace-only summary) emits no `title` attr; (6) Boolean / single-quoted / double-quoted / bare attr values all parse via `parseDetailsAttrs`'s attr regex. |
| **Edge cases NOT handled** | (1) Nested `<details>` inside `<details>` — the post-Phase-A shape is "opener paragraph + body paragraphs + closer paragraph", which doesn't survive nesting (the inner `<details>` body would itself be paragraph-text). The recognizer would match the outer span only; the inner `<details>` text would be carried through as text inside the body paragraphs. Acceptable v1 behavior — disk bytes round-trip via γ sourceRaw because position-slice covers the full outer span. (2) Malformed HTML (unclosed opener, mismatched tags) — `findOpenerMatch` rejects (refuses to match if body candidate contains `</details>`); the malformed bytes survive as paragraph-text. (3) `<details>` inside an `<Accordion>` body — same treatment as (1); irrelevant in practice. |
| **Phase ordering — already correct** | Registered in `pipeline.ts:170` AFTER Phase A `restoreFromMdx` and BEFORE `imagePromoterPlugin` + `mergedPostParseWalkerPlugin` (Phase B). Header comment ties this to precedent #16: "Phase A must run before Phase B; details promoter sits between them so the recognizer keys off literal `<`/`>` (Phase A's output) and Phase B's position-slice walker captures the emitted node's position into `data.sourceRaw`." This ordering is correct as shipped. |

## What about LOWERCASE_JSX_CANONICAL_TAGS?

D16 says to extend it with `'details'`. **This is a no-op edit.**

The Set is consulted in `autolink-void-html-guard.ts` at two carve-out sites:

1. **Line 221** — first pass over `LOWERCASE_HTML_TAG_RE` matches: `if (LOWERCASE_JSX_CANONICAL_TAGS.has(tag) && match.endsWith('/>')) return match;` — only exempts self-closing `<tag .../>`. Bare `<tag>` falls through to PUA-protect.
2. **Line 293** — final catch-all over remaining `<` characters: `const lowercaseCanonicalMatch = /^<([a-z][a-z0-9]*)([^>]*)\/>/.exec(lookahead); if (lowercaseCanonicalMatch && LOWERCASE_JSX_CANONICAL_TAGS.has(...))` — same pattern, self-closing only.

`<details>` is paired (`<details>...</details>`), never self-closing. Adding `'details'` would only affect a hypothetical `<details/>` (zero-content self-closing form, unused in practice). It does NOT change how `<details>` (paired-tag) flows through the guard.

The iframe-pattern report (`reports/cb-v2-iframe-embed-pattern/REPORT.md` §D1.3 + §6 risk row) explicitly documents this: "the carve-out requires `/>`; paired-form HTML void-style stays PUA-guarded as plaintext." It carves the paired-form exemption out as future work for iframe and notes the same constraint applies to any paired-tag canonical descriptor.

So the round-trip path for `<details>...</details>` is:

```
"<details>...</details>" source bytes
  → protectFromMdx: PUA-substitute every <, >  →  "details.../details"
  → remark-parse: parses as a paragraph with one text child whose .value contains the PUA bytes
  → restoreFromMdx (Phase A): walks the tree, replaces PUA bytes with literal < and > in the text node's .value
  → text node's .value is now "<details>...</details>" (literal)
  → detailsAccordionPromoterPlugin: visits root, sees paragraph(text("<details>...")), recognizer matches, replaces with mdxJsxFlowElement(HtmlDetailsAccordion)
  → mergedPostParseWalkerPlugin: position-slice attaches data.sourceRaw onto the new flow element
  → remarkProseMirror: emits jsxComponent(HtmlDetailsAccordion) PM node
```

The PUA round-trip is the entire mechanism — the `LOWERCASE_JSX_CANONICAL_TAGS` set isn't on this path.

**Recommendation: drop the tag-set extension half of D16.** It's a no-op and would mislead future readers about how `<details>` flows through the parse pipeline. Document the asymmetry the iframe report calls out (the carve-out is for self-closing `/>` lowercase canonicals only; paired-tag canonicals like `details` flow through PUA-and-back-and-promote, NOT through the carve-out).

## Proposed details-transformer.ts

The transformer the spec asks for is the file already at `packages/core/src/markdown/details-accordion-promoter.ts`. No new file needed; no rename needed (the existing name is consistent with `image-promoter.ts`).

What needs investigation, NOT design: **why doesn't it fire through `MarkdownManager.parseToMdast`?** Two observations from this session:

1. In isolation, calling `detailsAccordionPromoterPlugin()` directly on a hand-built tree `{root, [paragraph, [text "<details>...</details>"]]}` returns the correct `mdxJsxFlowElement(HtmlDetailsAccordion)`.
2. A manually-constructed `unified()` chain that uses every plugin `pipeline.ts` uses, in the same order, and runs `processor.parse(...) → file.value=source → processor.runSync(...)`, produces the correct `mdxJsxFlowElement(HtmlDetailsAccordion)` output.
3. `mdManager.parseToMdast('<details><summary>Q</summary>Answer</details>')` returns `paragraph > text > "<details>...</details>"` — the transformer is silently skipped. The `mdManager.parseProcessor` is built by the same `createParseProcessor` factory.

The discrepancy is between (2) and (3). Hypothesis space (in priority order — implementation should test these in order):

- **H1: Frozen-processor mutation.** `unified()` processors are frozen on first use; subsequent `.use()` calls don't mutate. `createParseProcessor` calls `processor.freeze()` eagerly. Possible: the manual chain in this session was un-frozen during construction (no `.freeze()`), allowing late `.use()` calls to compose; the cached MarkdownManager processor is frozen and may have bypassed the registration order somewhere. Resolution: add a `.freeze()` to the manual chain and re-trace.
- **H2: Plugin-attacher reentrancy.** `pipeline.ts` header docstring mentions: "the attacher for `remarkMdxAgnostic` and `remarkWikiLink` is made idempotent under re-entry via module-level singleton extension values." If `detailsAccordionPromoterPlugin` is shared across MarkdownManager instances and there's a module-level state issue, the second-or-later instance's tree could miss the visitor.
- **H3: Tree-mutation timing.** `mergedPostParseWalkerPlugin` is the single Phase-B `unist-util-visit` callback dispatching position-slice + autolink-promotion + doc-start-thematic-fix + unknown-mdast-guard. It runs AFTER details-promoter. Possible: the merged walker rewrites or wraps the emitted `mdxJsxFlowElement` in a way that breaks the PM-mapping (jsxComponent dispatch).
- **H4: PM-handler dispatch.** `parseToMdast` returns BEFORE remark-prosemirror, so PM mapping isn't on the path. But `parseMd` calls `processor.stringify(transformed)` which does invoke remark-prosemirror; if there's a handler-side regression that flattens `mdxJsxFlowElement(HtmlDetailsAccordion)` back to text, the test assertion in I19 would also fail. (The `parseToMdast` test in this session shows the regression is upstream of remark-prosemirror — `parseToMdast` returns paragraph-text, so the transformer itself is being skipped.)

Of these, H1 is the most likely. The fix is mechanical and would be discovered by `bun test packages/app/tests/fidelity/invariant-i19.test.ts` going green. **Implementation should start by reproducing the discrepancy under instrumentation** — log inside `detailsAccordionPromoterPlugin`'s returned transformer (e.g., `console.error('details-promoter visited', tree)`), run the I19 test, and observe whether the transformer is invoked on each test or skipped.

## LOWERCASE_JSX_CANONICAL_TAGS extension

**Per the section above: drop this half of D16.** Document the asymmetry (paired-tag promoters like details/iframe-paired flow through PUA round-trip; self-closing canonicals like img/video/audio flow through the tag-set carve-out) in the spec corrigendum or the autolink-void-html-guard.ts inline comment.

If the spec keeps the tag-set extension for symmetry-of-thought reasons, the exact one-line edit is:

```diff
- const LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img', 'video', 'audio']);
+ const LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img', 'video', 'audio', 'details']);
```

Behavioral effect: zero. `<details>` still flows through PUA + restore + transformer. `<details/>` (zero-content self-closing) would now reach remark-mdx as `mdxJsxFlowElement{name:'details', children:[]}` instead of being PUA-protected — but no real authoring path produces that form, the descriptor doesn't expect it, and no test covers it. The existing `mdast-to-hast-handlers.ts` `HTML_PRIMITIVE_TAGS` set (`{img, video, audio}`, line 72) would also not include `details`, so the cross-app emission would fall to `<pre class="mdx-component">` for `<details/>` — adding `'details'` to BOTH sets would be needed to make it cross-app-renderable; given that `<details/>` is unused, doing so is dead code.

Recommendation again: drop the extension. If kept for documentation purposes (spec internal consistency), add an inline comment at line 95 saying "details is included symbolically; self-closing `<details/>` is not a real authoring form, the paired form goes through PUA → restoreFromMdx → details-accordion-promoter."

## Test plan

The right tests already exist. They're failing today (11 of 19 in I19 are red) and that failure IS the Q27 signal.

| Tier | Location | What it covers | Status today |
|---|---|---|---|
| **Unit (handler-level)** | `packages/core/src/markdown/handlers.test.ts` (existing fixtures) | Indirect — covers details via the surface API of `mdManager.parse`. | UNVERIFIED — implementer should add a focused unit test on the transformer in isolation: `detailsAccordionPromoterPlugin()(handBuiltTree)` → expect `mdxJsxFlowElement(HtmlDetailsAccordion)`. This locks the recognizer behavior independent of pipeline composition issues. |
| **Integration (parse path)** | `packages/app/tests/fidelity/invariant-i19.test.ts` | Per the file header: (1) prop-shape equivalence with `<Accordion>`; (2) γ pristine round-trip; (3) PBT over arbitrary title + body. | **11 tests fail.** Going green is the success criterion. |
| **Integration (cross-arm)** | New: `packages/app/tests/integration/clipboard-htmldetails.e2e.ts` (or extend the existing paste-fidelity suite once Q11 lands) | OK→OK round-trip via FR-13-first text/plain → mdManager.parse → HtmlDetailsAccordion descriptor. Cross-app emission via `toClipboardHast` → real `<details><summary>...` HTML in clipboard. Disk persistence via `to-markdown-handlers.ts:349-356` htmlBoundary path. | NEW work. The existing I19 covers (a) and (c); the cross-app emission and OK→OK paste arms are not yet covered end-to-end. |
| **PBT (existing)** | `invariant-i19.test.ts` PBT block (lines 185-211) | Single-line `<details>` and `<details open>` over arbitrary title + body characters. | Both PBT cases fail today. Failure shrinks to `["a", "A_"]` (counterexample title + body) — a hint the transformer recognizes title="a" body="A_" but emits a non-pristine round-trip; investigate after the H1 fix lands. |
| **Edge case (nested)** | NEW: add to I19 | `<details><summary>Outer</summary>\n\n<details><summary>Inner</summary>X</details>\n\n</details>` round-trip. Per "edge cases NOT handled" above: outer span captures full bytes via γ sourceRaw; inner is text-in-paragraph until edited. Test asserts disk round-trip is byte-identical (the strong claim) and props-shape on the outer node matches the inner-as-text-body assumption. | NEW. |
| **Edge case (malformed)** | NEW: add to I19 | `<details><summary>X</summary>body` (no closer). Should land as paragraph-text per the conservative-reject behavior in `findOpenerMatch`. Disk round-trips byte-identical. | NEW. |
| **Edge case (attrs not in honored set)** | NEW: add to I19 | `<details class="custom" data-foo="bar"><summary>X</summary>Y</details>`. Honored attrs (`open` / `name` / `id`) become props; non-honored attrs are dropped from the descriptor's props but preserved via γ sourceRaw on disk. Test: parse → expect `class` and `data-foo` absent from `props`; mdRoundTrip(html) → expect input bytes back verbatim. | NEW. |
| **Cross-app (toClipboardHast)** | When the toClipboardHast contract lands (separate work, locked in D10/D11/D15) | `descriptor.toClipboardHast(node, ctx)` emits `<details>...</details>` real HTML for cross-app paste. The existing `mdxJsxFlowHandler` in `mdast-to-hast-handlers.ts` already routes correctly because the descriptor emits `mdxJsxFlowElement{name: 'HtmlDetailsAccordion'}` from its `serialize` (built-ins.ts:741-752). | Tests for this arm land alongside the toClipboardHast contract implementation. |

Convergence: **fix the production parse path bug (H1), then I19 goes green, then add the 3 NEW edge-case tests, then close Q27.**

## Integration with the full contract

Four arms of the contract per the user prompt. Verify each.

### Arm 1 — Inbound parse (source-form `<details>` → `HtmlDetailsAccordion`)

**Mechanism (already designed and shipped):** `protectFromMdx` PUA-encodes `<` `>`; remark-parse produces `paragraph > text > <PUA-encoded body>`; Phase A `restoreFromMdx` swaps PUA back to literal; `detailsAccordionPromoterPlugin` recognizes the literal `<details>...</details>` text and replaces with `mdxJsxFlowElement(HtmlDetailsAccordion)`; Phase B `mergedPostParseWalkerPlugin` attaches `data.sourceRaw` from the position span; remark-prosemirror's `jsxComponent` mdast→PM handler maps to a `jsxComponent` PM node with `componentName: 'HtmlDetailsAccordion'` + `sourceRaw` attr.

**Verification:** I19's "props shape after parse" block + "single-line ↔ Accordion structural equivalence" block. Both BLOCKED by H1; once unblocked, both pass.

**Status:** ✓ contract holds, BLOCKED on H1 fix.

### Arm 2 — Disk persistence (HtmlDetailsAccordion → `<details>` markdown)

**Mechanism (already shipped):** PM `jsxComponent` → mdast via `index.ts:1019-1048` (pristine path emits `data.sourceRaw` verbatim; dirty path dispatches `descriptor.serialize` which returns `mdxJsxFlowElement{name:'HtmlDetailsAccordion', data:{htmlBoundary:{opener, closer}}}`). The mdxJsxFlowElement → markdown handler in `to-markdown-handlers.ts:340-381` checks for `data.sourceRaw` first (pristine path), falls through to `data.htmlBoundary` next (compat-with-prop-edits path), emitting `${opener}\n\n${childContent}\n\n${closer}`.

**Verification:** I19's "γ pristine preservation" block — 7 fixture cases (single-line, multi-paragraph, with attrs, embedded in surrounding prose). All BLOCKED by H1.

**Status:** ✓ contract holds, BLOCKED on H1 fix.

### Arm 3 — Outbound clipboard text/html (HtmlDetailsAccordion → real `<details>` HTML for cross-app paste)

**Mechanism (designed in D15, lands as part of the toClipboardHast contract work, NOT this transformer):** When user copies an HtmlDetailsAccordion node, the PM→mdast handler emits `mdxJsxFlowElement{name:'HtmlDetailsAccordion', ...}` (pristine or dirty path either way produces a node with `name='HtmlDetailsAccordion'`). The mdast→hast `mdxJsxFlowHandler` in `mdast-to-hast-handlers.ts:148-173` dispatches by mdast type, NOT by descriptor-name lookup. With the toClipboardHast hook (not yet implemented — separate contract work), it would call `descriptor.toClipboardHast(node, ctx)` for `HtmlDetailsAccordion`, which returns the `<details><summary>{title}</summary>{body}</details>` hast tree per `q4-q6-q8-toclipboardhast-contract.md` §"HtmlDetailsAccordion" (lines 344-378).

**Critical dependency:** the `mdxJsxFlowHandler` dispatch site receives `mdxJsxFlowElement{name:'HtmlDetailsAccordion'}` regardless of whether the inbound transformer fired correctly — because the OUTBOUND path produces this shape from PM via the descriptor's `serialize`. So the toClipboardHast contract works for HtmlDetailsAccordion even WITHOUT the inbound transformer fix. (This is what `q4-q6-q8-toclipboardhast-contract.md` §"HtmlDetailsAccordion" line 158 was getting at: "The compat descriptor's serialize emits `mdxJsxFlowElement{name:'HtmlDetailsAccordion'}` which DOES reach `mdxJsxFlowHandler` at clipboard time.")

**Status:** ✓ contract holds INDEPENDENTLY of Q27. Ships with the toClipboardHast contract work.

### Arm 4 — OK→OK round-trip via FR-13-first text/plain markdown route

**Mechanism (relies on Arms 1+2 holding):** User copies HtmlDetailsAccordion in OK. text/plain = `mdManager.serialize(slice→docJson)` emits `<details><summary>X</summary>\n\nbody\n\n</details>` (htmlBoundary path, Arm 2). User pastes into another OK doc; FR-13-first dispatches to text/plain markdown route; `mdManager.parse(text)` runs the inbound transformer (Arm 1) and reproduces an HtmlDetailsAccordion PM node. Disk bytes match the source bytes (modulo trailing newline normalization).

**Verification:** I19's γ pristine block (lines 111-142) — `mdRoundTrip(c.md)` runs `mdManager.parse → mdManager.serialize` and asserts byte-for-byte equality. This IS the OK→OK arm test.

**Status:** ✓ contract holds, BLOCKED on H1 fix (Arm 1 dependency).

**Summary table:**

| Arm | Mechanism owner | Status | Blocker |
|---|---|---|---|
| 1. Inbound parse | `details-accordion-promoter.ts` (existing) | Designed correctly | H1 production-path bug |
| 2. Disk persist | `to-markdown-handlers.ts:340-381` htmlBoundary + `built-ins.ts:725-753` serialize | Shipped & working (covered by I19 γ block) | Same H1 — I19 γ block fails today because Arm 1 fails first |
| 3. Outbound clipboard | `descriptor.toClipboardHast` (separate work, D15 LOCKED, not yet implemented) | Independent of Q27 | toClipboardHast contract implementation |
| 4. OK→OK round-trip | Arms 1 + 2 composing through FR-13-first | Designed correctly | H1 (Arm 1 dependency) |

## Risks + open questions

1. **R1 — H1 root cause may not be H1.** This design assumed the production parse path bug is most likely H1 (frozen-processor mutation). It's also possible H2 (plugin-attacher reentrancy via module-level singleton state) or some other artifact of the test environment. Implementer should approach diagnosis empirically: instrument the transformer with a `console.error` log; run `bun test packages/app/tests/fidelity/invariant-i19.test.ts`; observe whether the log fires per test or not at all. If the log doesn't fire, the transformer isn't being called → diagnose unified() chain. If it fires but produces wrong output, diagnose the recognizer or downstream walker.

2. **R2 — When did this break?** I19 was added in commit 7242822b (cb-v2-md-foundation, PR #310, the same commit that added the descriptor). Either it was added green-but-flawed (a stub that never worked) or a subsequent change regressed it without anyone running this specific test. Check: `git log -p packages/app/tests/fidelity/invariant-i19.test.ts` to confirm I19 has been red since introduction, OR `git bisect` between PR #310 and HEAD on a single I19 case. Useful for understanding the regression scope and whether other latent invariants exist.

3. **OQ1 — Should the inline-position case (`<details>` inside a paragraph mid-prose, e.g. `Before <details>...</details> after.`) be supported?** Today's transformer requires the paragraph's ENTIRE text value to match `SINGLE_LINE_DETAILS_RE` (`^...$` anchors). Inline `<details>` would not match. CommonMark/HTML semantics make inline `<details>` unusual — it's a flow-level element by HTML spec. Recommendation: explicitly mark this as out-of-scope (NG-track). If the spec wants it, the transformer would need to split the surrounding paragraph at the recognized span — significantly more complex.

4. **OQ2 — Does the `LOWERCASE_JSX_CANONICAL_TAGS` extension belong in this spec at all?** Per the analysis above it's a no-op. Recommendation: drop from D16 to keep the spec accurate. If kept, the rationale should explicitly say "symbolic — paired `<details>` flows through PUA round-trip not the carve-out."

5. **OQ3 — Should D16 be re-locked as "investigate why details-accordion-promoter.ts doesn't fire in production parse path; fix; verify I19 green; remove the LOWERCASE_JSX_CANONICAL_TAGS clause"?** That reframing matches the actual code state. Without the reframing, future readers will look for `details-transformer.ts` and find `details-accordion-promoter.ts` instead, then wonder if a second file is needed.

6. **R3 — Naming inconsistency.** The codebase has `image-promoter.ts`, `details-accordion-promoter.ts`, `callout-transformer.ts`, `autolink-promotion.ts`, `wiki-link-mdast-promotion.test.ts`. Five files; four naming conventions. `details-transformer.ts` (D16's name) would add a sixth. Recommendation: use the existing `details-accordion-promoter.ts` (no rename), document the existing convention drift in a follow-up cleanup, but don't pile on a new variant in this spec.
