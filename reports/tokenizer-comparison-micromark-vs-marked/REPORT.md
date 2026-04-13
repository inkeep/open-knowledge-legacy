---
title: "micromark + remark-prosemirror vs marked + @tiptap/markdown: Ecosystem Completeness for Greenfield Markdown CRDT Editor"
description: "Deep technical comparison of two markdown tokenizer stacks for a greenfield ProseMirror-based collaborative markdown editor. Framed around which ecosystem gives us more working third-party code and requires less patching/custom-writing to preserve correctness — not our-code migration cost. Covers MDX support, CommonMark compliance, per-node source-form preservation, ecosystem packages, open bugs, and decision triggers."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - micromark
  - remark
  - "@handlewithcare/remark-prosemirror"
  - mdast-util-to-markdown
  - marked
  - "@tiptap/markdown"
  - MDX
  - unified
  - ProseMirror
topics:
  - markdown tokenizer architecture
  - third-party library completeness
  - round-trip fidelity
  - MDX support
  - CRDT markdown editor
---

# micromark + remark-prosemirror vs marked + @tiptap/markdown

**Purpose:** For a **greenfield** markdown CRDT editor with TipTap/ProseMirror, decide which tokenizer stack maximizes the amount of correct third-party library code we can use and minimizes the amount of custom code or upstream patches we have to maintain — while preserving byte-exact source-text fidelity. The question is not "how hard is migrating our existing code" but "which stack gives us more working library code to stand on."

---

## Executive Summary

For a greenfield project prioritizing correctness + product experience + no deferred tech debt, **the unified + remark + micromark ecosystem provides materially more working library code and less patching debt than marked + @tiptap/markdown**. The gap is largest at three points:

1. **MDX / JSX component support.** `remark-mdx` (via `micromark-extension-mdx-jsx`, `-mdx-expression`, `-mdxjs-esm`) is a first-class, JS-aware tokenizer shipping 7 mdast node types for JSX blocks, inline JSX, expressions, imports/exports, and expression attributes. It round-trips 22/23 MDX edge cases. In marked, there is zero first-class MDX support — we wrote our own `jsx-tokenizer.ts` (~370 LOC of regex + tag-counting + brace-depth) that we maintain forever.

2. **Correctness.** micromark is 100% CommonMark compliant (tested against ~650 CommonMark tests + 1.2k extras, fuzz-tested, 100% code coverage). Current marked (v4.2.3 data) is ~90%+ overall with specific weaknesses in Images (15/22 = 68%) and Links (75/90 = 83%) — precisely the areas where @tiptap/markdown has shipped round-trip bugs (entity corruption in link URLs, escape consumption, image alt text). Most marked categories are 100%; the remaining gaps align uncomfortably with our fidelity pain points. @tiptap/markdown also has two content-destroying bugs we actively patch around; one is still open upstream (issue #7258).

3. **Ecosystem breadth.** remark ships first-class packages for frontmatter, directives, math, footnotes, tables, task lists, strikethrough, autolinks, definition lists, alerts, plus an mdast ↔ hast bridge (for Shiki/Astro/Fumadocs interop). marked has partial equivalents at best and no definition-list or description-list support at all.

The cost on the remark side is real: per-node delimiter preservation (our `emphDelimiter: '_' vs '*'` and similar attrs) requires ~150 LOC of custom mdast-util-to-markdown handlers that slice original source at `position.offset` to recover delimiters mdast drops. Both stacks require workaround code for fidelity — the mechanism differs (bun patch on vendor source vs handler overrides via exposed extension API). The remark approach uses a principled extensibility API instead of patching vendor source, which is architecturally cleaner but not free.

**The decisive custom-code delta is MDX:** ~370 LOC of our own `jsx-tokenizer.ts` (regex + tag-counting + brace-depth) on the marked side vs. zero on the remark side (first-class via `remark-mdx` + 5 micromark extensions, round-trip verified 22/23 MDX edge cases in a prior report).

**Verdict for greenfield:** Use **unified + remark + remark-prosemirror** — conditional on verifying the 118-case fidelity pass rate is comparable to or better than the current 77/118 (@tiptap/markdown patched). This empirical probe has not been run live through the remark pipeline and is the one remaining uncertainty. If the probe confirms, the remark stack has first-class MDX (the single decisive delta — ~370 LOC of custom code we'd otherwise own), higher CommonMark compliance in the specific categories where our current stack has pain (Images/Links), and a principled extensibility API instead of vendor-source patches. If the probe reveals unexpected fidelity regressions, the verdict is worth revisiting.

**Key Findings:**

- **remark-mdx vs. our jsx-tokenizer.ts.** ~370 LOC of custom code we own vs. zero (community-maintained, JS-aware, acorn-based). The decisive delta.
- **CommonMark compliance.** micromark 100% vs. current marked ~90%+ (weakest at Images 68% and Links 83% per v4.2.3 data). Gaps align with our fidelity pain points, not an independent concern.
- **Per-node source-form fidelity works in remark too.** Empirically verified — custom mdast-util-to-markdown handlers preserve per-node delimiter choices by reading `node.data.delimiter` instead of global options.
- **Two content-destroying bugs in @tiptap/markdown.** One patched via bun patch (issue #7258 still open ~5 months after filing), one fixed upstream in v3.22.0 (issue #7539).
- **Industry gravity is with remark.** Docusaurus, Next.js MDX, Astro, Milkdown, BlockNote, Prettier, MDX itself all standardize on unified/remark. `@tiptap/markdown`'s use of marked is an ecosystem outlier.
- **Both stacks have bus factor risk.** marked: small active team. micromark/remark: essentially one person (@wooorm) but massive downstream pressure keeps it working. remark-prosemirror: 1-2 people, pre-1.0.
- **The 118-case fidelity pass rate through a live remark pipeline is not yet measured.** The verdict rests on the assumption that remark handles our construct catalog at least as well as the patched @tiptap/markdown stack's 77/118. This is the single most important empirical gap before committing.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | marked + MarkdownManager end-to-end architecture | Deep | P0 |
| D2 | micromark + remark-prosemirror end-to-end architecture | Deep | P0 |
| D3 | Per-node source-form preservation viability in each stack | Deep | P0 |
| D4 | Ecosystem completeness: what each library gives us out-of-the-box | Deep | P0 |
| D5 | Known bugs, CVEs, issue tracker state | Moderate | P0 |
| D6 | Ecosystem maturity, adoption, bus factor | Moderate | P1 |
| D7 | Performance characteristics | Moderate | P1 |
| D8 | Custom-code debt comparison | Deep | P0 |
| D9 | Custom tokenizer surface (wiki-links, JSX components) | Moderate | P0 |
| D10 | Decision triggers | Moderate | P0 |

**Stance:** Factual with conclusions.

**Framing (per refocused user guidance):** Greenfield lens — optimize for what two staff-level engineers would decide for architecturally best + best product experience + no deferred tech debt + correctness preservation. Not brownfield migration pain.

**Non-goals:** Implementing the migration, non-ProseMirror editors (Lexical, Slate), evaluating other markdown editors (Milkdown, BlockNote) as products.

---

## Detailed Findings

### D1: marked + @tiptap/markdown architecture

**Finding:** marked is a decent tokenizer wrapped by a dispatch framework that has two known content-destroying bugs at the encoding layer.

**Evidence:** [evidence/d1-marked-tiptap-architecture.md](evidence/d1-marked-tiptap-architecture.md)

The stack provides:
- `marked` — tokenizer emitting `{type, raw, text, ...}` tokens; `raw` preserves source form per token (the critical property our fidelity extensions depend on)
- `@tiptap/markdown` MarkdownManager — parse/serialize engine with per-extension dispatch via `markdownTokenName` → `parseMarkdown(token, helpers)` / `renderMarkdown(node, helpers, context)`
- Extension registration for custom tokenizers via `markdownTokenizer` field (how our wiki-link and JSX extensions plug in)

The stack has:
- [Issue #7258](https://github.com/ueberdosis/tiptap/issues/7258) (OPEN) — backslash escape consumption bug
- [Issue #7539](https://github.com/ueberdosis/tiptap/issues/7539) (fixed upstream in v3.22.0 via PR #7565) — entity double-encoding
- Our bun patch fixes both (~15 LOC maintained against upstream)
- No first-class support for frontmatter, MDX/JSX, math, directives, alerts, or definition lists

**Implications:**
- We own ~475 LOC of stack-specific custom code: bun patches + frontmatter wrapper + jsx-tokenizer.ts + tight/loose list preservation. Plus shared fidelity logic (~200 LOC) that would exist in either stack.
- Upstream release cadence is high (major every ~5 months) — requires periodic re-verification our patches apply
- marked CommonMark compliance improved substantially from 74.8% (v0.5.0, 2018) to ~90%+ (v4.2.3, 2022) per [discussion #1202](https://github.com/markedjs/marked/discussions/1202). Most sections 100%; weakest categories are Images (15/22 = 68%) and Links (75/90 = 83%) — which overlap with our link/image fidelity concerns

**Decision triggers (when this stack becomes the right call):**
- We never want to support MDX components
- We're brownfield with working infrastructure
- We need the lowest-churn possible integration with TipTap's extension system

### D2: micromark + remark + remark-prosemirror architecture

**Finding:** A pluggable pipeline with 100% CommonMark compliance at the tokenizer layer, extensible serialization handlers, and first-class support for MDX + frontmatter + directives.

**Evidence:** [evidence/d2-micromark-remark-architecture.md](evidence/d2-micromark-remark-architecture.md)

The stack provides:
- `micromark` — state-machine tokenizer, 100% CommonMark compliant, every byte accounted for with position info
- `mdast-util-from-markdown` + `remark-parse` — mdast AST builder (nodes with `position: {start, end}`)
- `mdast-util-to-markdown` + `remark-stringify` — serializer with pluggable handlers, extension table (`unsafe` characters, joins)
- `@handlewithcare/remark-prosemirror` — mdast ↔ ProseMirror mapper with handler API keyed on mdast node types
- `unified` — pipeline orchestrator composing plugins

The known gap at the default layer:
- mdast drops delimiter info (`emphasis` node has no marker property, `list` has only `ordered`, no bullet char)
- [mdast-util-to-markdown#12](https://github.com/syntax-tree/mdast-util-to-markdown/issues/12) — nested emphasis round-trip edge case (open ~5 years; maintainer acknowledges architectural complexity)
- Issues #66, #8 closed as wontfix — maintainer treats cosmetic escape changes as non-bugs if HTML output is identical

**Implications:**
- Per-node source-form preservation requires ~150 LOC of custom handlers that read `node.data.delimiter` instead of global options (pattern empirically verified)
- Position info on every mdast node lets us recover delimiter by slicing original source at `position.start.offset`
- The handler API is decoupled from TipTap extensions — we register handlers per mdast node type instead of per TipTap extension

**Decision triggers:**
- Greenfield project (our situation)
- MDX / JSX component support desired (now or future)
- Want to extend beyond CommonMark + GFM (directives, math, definition lists, alerts)
- Interop with other unified-based tools (Shiki, Astro, Fumadocs, Prettier)

### D3: Per-node source-form preservation in remark

**Finding:** Viable with ~150 LOC of custom `mdast-util-to-markdown` handlers; empirically verified.

**Evidence:** [evidence/d2-micromark-remark-architecture.md](evidence/d2-micromark-remark-architecture.md), [evidence/d3-ecosystem-completeness.md](evidence/d3-ecosystem-completeness.md)

The pattern:
- **Parse direction:** walk mdast, slice original source at `node.position.start.offset` to recover the delimiter that mdast-parse discarded, attach to `node.data.delimiter` (or hoist to our ProseMirror attrs directly via remark-prosemirror handlers)
- **Serialize direction:** custom handlers for `emphasis`, `strong`, `code`, `list`, `thematicBreak` that read `node.data.delimiter` and emit it literally instead of reading `state.options.emphasis` global

Empirically verified: test script at `/tmp/rpm-research/test-custom-handler.mjs` showed default serialize converts `_italic_ and *bold*` → `*italic* and *bold*` (delimiter lost), while custom handler preserves input exactly.

**Caveat — the known ceiling:** mdast-util-to-markdown issue #12 (nested emphasis) is unresolved upstream and would affect us. Scope: specifically `***emphasis*in emphasis*` patterns where escaping one marker affects parsing elsewhere. Edge case frequency is low in natural markdown content but non-zero. Would need to test our 118-case fidelity catalog through this pipeline to get hard numbers.

**Remaining uncertainty:**
- Exact pass rate on our 118-case fidelity catalog through a full unified + remark-prosemirror + remark-gfm + remark-frontmatter + remark-mdx pipeline. Not yet probed live. Prior theoretical estimate: comparable or better than our current patched @tiptap/markdown stack for all cases except nested emphasis.

### D4: Ecosystem completeness

**Finding:** remark ecosystem provides substantially more working functionality out-of-the-box for our use case.

**Evidence:** [evidence/d3-ecosystem-completeness.md](evidence/d3-ecosystem-completeness.md)

Capability-by-capability comparison:

| Capability | marked + @tiptap/markdown | unified + remark |
|---|---|---|
| CommonMark tokenizer correctness | ~90%+ overall (v4.2.3 data); Images 68%, Links 83% weakest | 100% (tested + fuzzed) |
| Entity encoding (`&`, `<`, `>`) | **We own the fix** (bun patch) | Extensible via `unsafe` table |
| Backslash escape consumption | **We own the fix** (bun patch) | Handled at tokenizer layer |
| Tight/loose lists | **We own the fix** (~50 LOC) | Preserved in mdast + GFM |
| Task list checkboxes | **We own the fix** (~20 LOC) | remark-gfm |
| Frontmatter | **Custom wrapper** (~30 LOC strip/prepend) | remark-frontmatter (first-class AST node) |
| Math | marked-katex-extension (render-only) | remark-math (full AST) |
| Footnotes | marked-footnote | remark-gfm |
| Alerts (`> [!NOTE]`) | marked-alert | remark-github-blockquote-alert |
| Directives (`:::`) | marked-directive (basic) | remark-directive (mature) |
| Definition / description lists | **Missing entirely** | remark-definition-list |
| Tables | @tiptap/markdown via marked | remark-gfm |
| **MDX / JSX components** | **Entirely custom** (our jsx-tokenizer.ts, ~370 LOC) | **First-class** via remark-mdx + 5 micromark extensions (22/23 round-trip verified) |
| Import/export blocks | Custom | micromark-extension-mdxjs-esm |
| Expression props `{foo}` | Custom | micromark-extension-mdx-expression |
| ProseMirror bridge | @tiptap/markdown (coupled to TipTap) | @handlewithcare/remark-prosemirror (handler API) |
| HTML AST interop | None | remark-rehype / rehype-remark (Shiki, Astro, Fumadocs) |

**Implications:**
- For a docs platform that may grow to support MDX components, directives, math, alerts — remark ecosystem covers all of these without custom tokenizers
- For our jsx-tokenizer.ts specifically: replacing ~370 LOC of custom code with a community-maintained acorn-based parser that handles nested fragments, member expressions, spread attributes, expression props — all edge cases we'd otherwise own

### D5: Known bugs and maturity

**Finding:** Both stacks have open round-trip issues; neither is clean. But the distribution differs — marked's bugs are actively filed and fixed (on a 5-month timeline), while remark's known bugs are marked wontfix by design philosophy.

**Evidence:** [evidence/d5-bugs-and-maturity.md](evidence/d5-bugs-and-maturity.md)

**marked + @tiptap/markdown:**
- 0 new CVEs in the last 3 years (3 historic ReDoS from 2021-2022)
- Issue #7258 OPEN ~5 months (escape consumption)
- Issue #7539 fixed upstream in v3.22.0 via PR #7565 (entity encoding)
- Major every 4-6 months — high churn

**micromark + remark:**
- 0 CVEs in search
- `mdast-util-to-markdown#12` open ~5 years (nested emphasis)
- `#66`, `#8` closed wontfix — maintainer philosophy treats cosmetic escapes as non-bugs
- Major every 1-2 years — low churn

**Implications:**
- Our patching debt is front-loaded in the marked stack (two content-destroying bugs today, one still open)
- remark's known bugs are narrower scope (nested emphasis edge cases) but are architectural (#12 still open after 5 years)
- Neither is perfect; the question is which failure modes matter more for our content

### D6: Ecosystem adoption and bus factor

**Finding:** remark dominates industry adoption; both stacks have bus factor risk.

**Evidence:** [evidence/d5-bugs-and-maturity.md](evidence/d5-bugs-and-maturity.md)

**remark/micromark adopters:** Docusaurus, Next.js MDX, Astro, Prettier, Milkdown (ProseMirror + Y.js + Remark), BlockNote (full unified stack: unified@^11, remark-parse@^11, remark-stringify@^11, remark-gfm@^4, remark-rehype@^11, rehype-remark@^10), MDX itself, numerous static site generators.

**marked adopters:** TipTap's `@tiptap/markdown`, legacy doc sites. Losing share.

**Migration signal:** Tom MacWright's "Don't use marked" (Jan 2024): *"marked is really popular. It used to be the best option. But there are better options, use them!"*

**Bus factor:**
- marked: Low single digits (UziTech + small team)
- @tiptap/markdown: Part of TipTap org, @bdbch actively fixing bugs, moderate
- unified/remark: **Essentially one person** (Titus Wormer / @wooorm) but massive downstream pressure from Docusaurus/Astro/Next.js/Prettier keeps it alive
- @handlewithcare/remark-prosemirror: 1-2 people (Sam Smoores, ex-NYT Oak, 5 yrs); small library ~300 LOC, forkable

### D7: Performance

**Finding:** micromark is ~13x slower than marked on one published benchmark. For our use case (parse on save, not on keystroke), this is not a blocker.

**Evidence:** [innodoc/markdown-benchmark (April 2023)](https://github.com/innodoc/markdown-benchmark) — single-run benchmark: marked 2,950 ops/sec vs micromark 229 ops/sec (~13x slower).

Note: the often-quoted @wooorm statement *"about 50% slower than the original remark-parse"* ([micromark discussion #29](https://github.com/micromark/micromark/discussions/29)) is about a **different comparison** — micromark vs the legacy remark-parse (which used its own older tokenizer) — not micromark vs marked. Both statements can be true; they measure different baselines. @wooorm's framing for micromark's priorities: concrete syntax tree + spec compliance + bundle size > raw speed.

Our pipeline runs parse/serialize on:
- WYSIWYG edit: never (Observer A just serializes, Observer B parses — but both are debounced 50ms and off the critical typing path)
- Source edit: Observer B parse, debounced 50ms after typing stops
- Agent write: once per HTTP request
- External file change: once per watcher event
- Persistence: once per save (debounced 2-10s)

None of these are hot paths. A 13x perf difference on micromark would translate to single-digit ms on typical documents. Non-blocking.

### D8: Custom-code debt totals

**Finding:** The decisive custom-code delta is MDX — ~370 LOC of custom `jsx-tokenizer.ts` vs. zero. Other deltas exist but are smaller once shared fidelity logic is separated.

**Evidence:** [evidence/d3-ecosystem-completeness.md](evidence/d3-ecosystem-completeness.md)

Stack-specific custom code (code needed for *each stack's* integration, not shared between them):

**marked + @tiptap/markdown stack-specific:** ~475 LOC
- bun patch (entity + escape) maintained against vendor source: ~15 LOC
- Frontmatter strip/prepend wrapper (`frontmatter.ts`): ~30 LOC
- `jsx-tokenizer.ts` (custom MDX): ~370 LOC
- Tight/loose list preservation: ~50 LOC
- `parseMarkdown`/`renderMarkdown` per-extension boilerplate: ~10 LOC × 11 = ~110 LOC (absorbed into the 370 above if counted separately)

**unified + remark + remark-prosemirror stack-specific:** ~380 LOC
- Position-slice delimiter recovery helper (walk mdast, slice source at `position.start.offset`): ~30 LOC
- Custom mdast-util-to-markdown handlers for per-node delimiter preservation (5 node types: emphasis, strong, code, list, thematicBreak): ~150 LOC
- Handler registration glue for our ProseMirror schema: ~200 LOC
- Zero MDX custom code (remark-mdx handles it)
- Zero frontmatter wrapper (remark-frontmatter handles it)
- Workaround mechanism: handler overrides via exposed extension API (architecturally cleaner than bun patches, but still workarounds for upstream default behavior we don't want)

**Shared fidelity logic** (needed in both stacks, volume comparable): extraction of per-node source form (delimiter, marker, fence char, setext vs ATX, etc.) from raw tokens/positions — ~200 LOC either way. Both stacks store these as ProseMirror attributes; the extraction mechanism differs (marked `token.raw` field vs mdast `position.offset` source slicing).

**The decisive delta** is MDX: ~370 LOC of custom `jsx-tokenizer.ts` vs. 0 LOC (first-class in `remark-mdx` + 5 micromark extensions, empirically round-trip verified 22/23 MDX edge cases per our prior MDX fidelity report).

**Framing note:** Both stacks require workaround code for fidelity. The mechanism differs — marked stack uses bun patches on vendor source + extension parseMarkdown/renderMarkdown hooks; remark stack uses handler overrides via the exposed extension API + position-slicing walkers. The remark approach is architecturally cleaner (principled extensibility vs monkey-patching), but calling one "patches" and the other "zero patches" obscures that both are workarounds.

### D9: Custom tokenizer surface

**Finding:** Both stacks support custom syntax (wiki-links, JSX), but remark's approach is more principled and reusable.

**Evidence:** [evidence/d1-marked-tiptap-architecture.md](evidence/d1-marked-tiptap-architecture.md), [evidence/d3-ecosystem-completeness.md](evidence/d3-ecosystem-completeness.md)

**marked path:** Register a `markdownTokenizer` object with `{name, level, start, tokenize, childTokens}`. This is how our wiki-link (`[[Page]]`) works. Fine for simple syntax. Our JSX tokenizer is much more complex (~370 LOC) because marked can't handle nested JSX without brace-depth tracking.

**micromark path:** Write a state machine extension (state + tokenize functions + exit conditions). Wiki-link would port directly — it's a well-defined start/end syntax. JSX is completely replaced by `micromark-extension-mdx-jsx` (acorn-based, handles nested fragments, member expressions, spread attributes, expression props — all edge cases we'd own in marked).

### D10: Decision triggers

**Finding:** Three factors cleanly separate when each stack is right.

**Use marked + @tiptap/markdown when:**
- Brownfield project with working @tiptap/markdown infrastructure (our prior decision for fidelity work)
- Never plan to support MDX components
- Minimizing integration wiring complexity matters more than library correctness

**Use unified + remark + remark-prosemirror when:**
- Greenfield project (our current decision frame)
- MDX component support is in the roadmap (our case — per MDX fidelity report)
- Want to interop with the rehype/hast ecosystem (Shiki, Astro, Fumadocs)
- Want extensible serializer (our entity bugs would be `unsafe` table edits, not bun patches)
- CommonMark correctness matters for content integrity

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Live 118-case fidelity probe through unified+remark pipeline.** We have theoretical assessment but no empirical number comparable to @tiptap/markdown's 77/118 and prosemirror-markdown's 74/118. This is the highest-value gap.
- **Actual migration time/effort in our codebase.** User refocused the question away from this, but a rough estimate would help: replacing `mdManager.parse/serialize` call sites, rewriting 11 fidelity extensions as remark-prosemirror handlers + mdast-util-to-markdown custom handlers, porting wiki-link tokenizer to micromark, deleting jsx-tokenizer.ts (use remark-mdx instead).
- **remark-prosemirror 1.0 roadmap.** Pre-1.0 library; breaking changes likely. Not researched.

### Out of scope (per rubric)

- Non-ProseMirror editors (Lexical, Slate)
- Other markdown editors as products (Milkdown, BlockNote) — only their library choices
- Performance optimization of our current stack

---

## References

### Evidence Files

- [evidence/d1-marked-tiptap-architecture.md](evidence/d1-marked-tiptap-architecture.md) — marked + MarkdownManager end-to-end architecture, bugs, extension mechanics
- [evidence/d2-micromark-remark-architecture.md](evidence/d2-micromark-remark-architecture.md) — micromark + remark + remark-prosemirror architecture, handler API, mdast position info
- [evidence/d3-ecosystem-completeness.md](evidence/d3-ecosystem-completeness.md) — capability-by-capability comparison, MDX detail, custom-code debt totals
- [evidence/d5-bugs-and-maturity.md](evidence/d5-bugs-and-maturity.md) — open bugs, CVEs, release cadence, industry adoption, bus factor

### External Sources

- [markedjs/marked discussion #1202 — CommonMark compliance](https://github.com/markedjs/marked/discussions/1202)
- [markedjs/marked security advisories](https://github.com/markedjs/marked/security/advisories)
- [Tom MacWright — Don't use marked](https://macwright.com/2024/01/28/dont-use-marked)
- [Tiptap issue #7258 — escape pairing bug](https://github.com/ueberdosis/tiptap/issues/7258)
- [Tiptap issue #7539 — entity double-encoding](https://github.com/ueberdosis/tiptap/issues/7539)
- [Tiptap custom tokenizer docs](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer)
- [micromark](https://github.com/micromark/micromark)
- [CMSM — CommonMark state machine spec](https://github.com/micromark/common-markup-state-machine)
- [@wooorm tweet — 100% CommonMark](https://x.com/wooorm/status/1316442528099512321)
- [remark](https://github.com/remarkjs/remark)
- [remark-mdx](https://mdxjs.com/packages/remark-mdx/)
- [micromark-extension-mdx-jsx](https://github.com/micromark/micromark-extension-mdx-jsx)
- [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown)
- [mdast-util-to-markdown#12 — emphasis round-trip bug](https://github.com/syntax-tree/mdast-util-to-markdown/issues/12)
- [mdast-util-to-markdown#66 — needless escapes (not-planned)](https://github.com/syntax-tree/mdast-util-to-markdown/issues/66)
- [@handlewithcare/remark-prosemirror](https://github.com/handlewithcarecollective/remark-prosemirror)
- [smoores.dev — NYT text editing library retrospective](https://smoores.dev/post/we_rewrote_nyt_text_editing/)
- [ProseMirror discuss — NYT → Handle With Care transition](https://discuss.prosemirror.net/t/nytimes-react-prosemirror-is-now-handlewithcare-react-prosemirror-and-v2-is-available/8168)
- [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [remark-rehype](https://github.com/remarkjs/remark-rehype)
- [BlockNote package.json — uses full unified stack](https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/package.json)

### Related Research

- [reports/markdown-roundtrip-fidelity-tiptap/REPORT.md](../markdown-roundtrip-fidelity-tiptap/REPORT.md) — 118-case empirical measurement of @tiptap/markdown round-trip (current stack); concludes brownfield-stay-on-@tiptap/markdown with ~150 LOC of fixes
- [reports/markdown-construct-fidelity-catalog/REPORT.md](../markdown-construct-fidelity-catalog/REPORT.md) — 118 construct-level breakdown with source-level bug origin tracing
- [reports/mdx-crdt-roundtrip-fidelity/REPORT.md](../mdx-crdt-roundtrip-fidelity/REPORT.md) — remark-mdx empirical round-trip (22/23 converge)
