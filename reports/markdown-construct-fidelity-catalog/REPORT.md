---
title: "Markdown Construct Fidelity Catalog: 118-Case Test Target Map for @tiptap/markdown + Yjs Bidirectional Round-Trip"
description: "Exhaustive, programmatically-verified catalog of every markdown construct we could enumerate — 118 cases across CommonMark, GFM, custom extensions, and edge cases — ranked by test priority. Identifies which constructs silently corrupt on round-trip through the @tiptap/markdown + @tiptap/y-tiptap + Yjs pipeline, with source-level root causes and decision triggers. Designed as a direct input to integration-test design: which constructs to assert on, which to skip, and why."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - "@tiptap/markdown"
  - "@tiptap/core"
  - "@tiptap/y-tiptap"
  - ProseMirror
  - TipTap
  - Yjs
  - marked
  - CommonMark
  - GFM
topics:
  - markdown round-trip fidelity
  - bidirectional editor construct catalog
  - test priority ranking
  - HTML entity corruption
  - CRDT observer bridge
---

# Markdown Construct Fidelity Catalog: 118-Case Test Target Map

**Purpose:** Give test authors and reviewers a complete, ranked, programmatically-verified list of markdown constructs that matter for a bidirectional disk ↔ editor round-trip through `@tiptap/markdown` v3.22.3 + `@tiptap/y-tiptap` + Yjs. Answer "what should we explicitly test for" at construct-level granularity, not at the "major features work" level.

Companion to [Markdown Round-Trip Fidelity Through @tiptap/markdown](../markdown-roundtrip-fidelity-tiptap/) — that report evaluated whether the pipeline was viable (verdict: yes, after 4 fixes). This report is the exhaustive test catalog built on top of that viability conclusion, with an emphasis on what the existing test suite is blind to.

---

## Executive Summary

Of 118 constructs enumerated across CommonMark 0.31.2, GFM, our custom extensions, and edge cases, **only 2 round-trip byte-identically** through `@tiptap/markdown` v3.22.3. The full Y.Doc observer bridge (`updateYFragment` + `yXmlFragmentToProsemirrorJSON`) is a **pass-through** — it introduces zero additional corruption on top of what `mdManager.parse/serialize` already does (verified across all 118 cases). Bugs are at the `@tiptap/markdown` layer, not at the CRDT layer.

The clean partition is: **2 byte-identical + 77 whitespace-only + 39 material-difference = 118.** Those 39 material-difference cases break down by impact:

- **12 ENTITY_CORRUPTION** cases — literal `&`, `<`, `>` in body text get HTML-escaped on every save. Root cause: `@tiptap/core`'s `encodeHtmlEntities` function, called unconditionally for all non-code text nodes during serialize. Affects brand names (H&M, AT&T), mathematical notation (`a < b`), any HTML in body text, and all named / numeric entities (`&copy;`, `&#169;`). Note: the raw TSV classifier counts 10 mechanical corruptions (literal `&`/`<`/`>` → `&amp;`/`&lt;`/`&gt;`). The 2 numeric-entity cases are mechanically tagged `COSMETIC_NORMALIZATION` because the `&` in `&#169;` is followed by an entity-like token, but functionally they are corruption (the author's `&#169;` → `&amp;#169;` renders wrong). Counting functionally: 12.
- **4 BACKSLASH_ESCAPE_CONSUMED** cases — the characters after `\*`, `\_`, `\[`, `\#` are **dropped entirely** on round-trip (mechanically tagged 3 STRUCTURE_CHANGE + 1 SEMANTIC_LOSS). Author-visible content loss.
- **1 LINK_REFERENCE_DEFINITION_DESTROYED** case — reference-style links (`[text][ref]` + `[ref]: url`) are inlined on every save, permanently losing the shared-definition pattern.
- **3 NON_IDEMPOTENT** cases — the serializer doesn't converge after one cycle for inline-code-with-backticks, HTML blocks, and raw frontmatter (the last is fixed by our `stripFrontmatter` wrapper).
- **~18 STRUCTURE_CHANGE** cases — markdown syntax normalized (e.g., `*` bullets → `-`, `__bold__` → `**bold**`, `1)` → `1.`). Harmless but generates git-diff noise and breaks exact-match disk tests.

The existing `conversion-fidelity.test.ts` assertion uses `words.match(/\w{3,}/g)` which is structurally blind to **every character in the P0 hit list** — `&`, `<`, `>`, punctuation, backslashes, non-word symbols. The test suite is architecturally incapable of catching the entity corruption or backslash-consumption bugs regardless of how many constructs are added to its `CONSTRUCTS` array.

**Key Findings:**

- **Only 2/118 byte-identical.** 65% whitespace-diff (cosmetic), 35% material difference.
- **Layer A (`mdManager` only) and Layer B (full Y.Doc path) produce identical output** on all 118 cases. Testing at the mdManager level is sufficient for construct-level fidelity verification.
- **12 P0 must-test cases** identified — all ENTITY_CORRUPTION + backslash-escape + link-reference. None are caught by existing tests; all require assertion tightening to catch.
- **The fix lives at one call site** — `MarkdownManager.encodeTextForMarkdown` at `@tiptap/markdown/src/MarkdownManager.ts:901-911`. Three architectural options exist, ranging from a 3-line post-process wrapper in `@inkeep/open-knowledge-core` to an upstream patch.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | Exhaustive construct enumeration across CommonMark 0.31.2, GFM, our extensions, and edge cases | Deep | P0 |
| D2 | Root cause of the HTML entity corruption bug — source-level trace through `@tiptap/markdown` + `@tiptap/core` | Deep | P0 |
| D3 | Test priority ranking — which constructs to test first, ranked by blast radius × severity × coverage gap | Deep | P0 |
| D4 | Layer A (`mdManager` only) vs Layer B (full Y.Doc observer path) equivalence | Moderate | P0 |
| D5 | Idempotence verification — does the round-trip converge after 1 cycle? | Moderate | P1 |
| D6 | Multi-client concurrent construct fidelity — does CRDT merge change round-trip behavior? | Moderate | P1 |

**Stance:** Factual with conclusions. The catalog ranks are conclusions about test priority; the construct behavior is factual from programmatic reproduction.

**Non-goals:**
- Implementing the fix. This report identifies root cause and options; spec/implementation work happens elsewhere.
- Re-deriving the architectural viability conclusion from the prior report. That's a hard pre-requisite; see companion report.
- ~~Testing multi-client concurrent edits on constructs. That's a different test class (integration-tier bidirectional edits).~~ **Now covered by D6.**
- Rewriting the `conversion-fidelity.test.ts` assertion. That's a spec-level decision; this report identifies the need.
- Testing persistence-layer round-trips (disk → server → disk). Frontmatter is handled there; tests at the mdManager layer do not simulate the full persistence path.

---

## Detailed Findings

### D1: Exhaustive construct enumeration — 118 cases across 7 categories

**Finding:** Only 2 out of 118 constructs round-trip byte-identically. 77 differ only in trailing whitespace. The remaining **39** have material differences beyond whitespace normalization (2 + 77 + 39 = 118, clean partition).

**Evidence:** [evidence/d1-construct-catalog.md](evidence/d1-construct-catalog.md), [evidence/probe-script.ts](evidence/probe-script.ts), [evidence/probe-results.tsv](evidence/probe-results.tsv)

**Categories tested:**

| Category | Count | Examples |
|---|---|---|
| `commonmark-block` | 42 | ATX+setext headings, thematic breaks, paragraphs, blockquotes (simple/nested/with-heading), lists (bullet variants, ordered variants, tight/loose, nested), code blocks (fenced/tildes/indented/with-info-string) |
| `commonmark-inline` | 17 | Inline code (simple/with-entities/with-brackets/with-backticks), emphasis (bold/italic/combined/nested), links (inline/reference/collapsed/shortcut/autolink), images, raw inline HTML |
| `gfm-extension` | 7 | Tables (simple/aligned/with-entities), task lists (checked/unchecked), strikethrough, bare-URL autolink |
| `char-content` | 28 | Literal `&`/`<`/`>` in various positions, already-encoded entities, numeric entities, named entities, backslash escapes, punctuation, single/two-char words, numbers, math operators, Unicode (emoji, CJK, RTL, accented, combining, ZWJ) |
| `custom-extension` | 7 | Wiki-links (bare/alias/section/section+alias/in-list), JSX component fenced-code, YAML frontmatter |
| `structural` | 7 | Heading+paragraph pairs, nested constructs (list-in-blockquote, code-in-list, heading-in-list), marks within headings |
| `edge-case` | 10 | Empty doc, only-whitespace, single character, very long paragraph, trailing-newline variants, no-trailing-newline, NBSP, tabs, leading spaces |

**Aggregate classification (Layer A = Layer B):**

| Class | Count | Percent |
|---|---|---|
| `WHITESPACE_DIFF` | 77 | 65% |
| `STRUCTURE_CHANGE` | 18 | 15% |
| `ENTITY_CORRUPTION` | 10 | 8% |
| `SEMANTIC_LOSS` | 8 | 7% |
| `COSMETIC_NORMALIZATION` | 3 | 3% |
| `BYTE_IDENTICAL` | 2 | 2% |

**Implications:**

- "The test suite has high pass rate" is an artifact of whitespace-normalizing assertions, not actual fidelity. 65% of our existing "passing" cases are cosmetic differences.
- Any test that asserts `input === output` on arbitrary CommonMark input will fail catastrophically. Tests must either accept a canonical normalized form OR test only invariants (content preservation, not byte equality).
- The `char-content` category (28 cases, including all entity bugs) is entirely absent from the current `CONSTRUCTS` array in `conversion-fidelity.test.ts`. The corruption is invisible not because tests are weak but because the cases are not tested at all.
- Since 2 numeric-entity cases are mechanically classified as `COSMETIC_NORMALIZATION` but functionally belong in `ENTITY_CORRUPTION`, any test framework built on the raw classifier output must be aware of this reclassification — the TSV count (10) is a lower bound on entity corruption; the practical count is 12.

**Decision triggers (when this finding matters):**

- When adding new test cases — prioritize P0 constructs from the hit list (evidence/d3-hit-list-ranked.md).
- When designing assertion strength — `.toBe()` byte-equality is fundamentally wrong for anything except the `stable: true` set; use content-level assertions that tolerate cosmetic normalization but catch semantic loss.
- When prioritizing upstream fixes vs workarounds — focus on the 10 ENTITY_CORRUPTION cases first because they affect the widest range of real content.

**Remaining uncertainty:**

- The 118 cases are comprehensive at the construct-category level but not exhaustive within each category (e.g., we didn't test every possible heading level × content-shape combination). Adding variants within a category has diminishing returns — the same serializer code path handles them all.
- Multi-client concurrent construct mutations are out of scope. If Client A edits the heading while Client B edits the same heading, the round-trip behavior may differ.

---

### D2: Root cause of HTML entity corruption — `@tiptap/core`'s `encodeHtmlEntities`

**Finding:** The literal character corruption originates in `@tiptap/core` (not `@tiptap/markdown`). The function `encodeHtmlEntities(text)` unconditionally escapes `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` for every text node during serialization unless the node is inside a code mark or code-block parent.

**Evidence:** [evidence/d2-root-cause-entities.md](evidence/d2-root-cause-entities.md)

**Source location:** `node_modules/@tiptap/core/src/utilities/htmlEntities.ts` (26 lines total).

**Call paths (two sites, same bug):**
```
MarkdownManager.serialize(json)
  ├→ renderNodeToMarkdown()          (line 923)
  │    → encodeTextForMarkdown(text, node, parentNode)
  │      → IF NOT inside code: encodeHtmlEntities(text)  ← the bug
  └→ renderNodesWithMarkBoundaries() (line 1020)
       → encodeTextForMarkdown(text, node, parentNode)
         → IF NOT inside code: encodeHtmlEntities(text)  ← same bug, different caller
```

Both call sites converge on the same `encodeTextForMarkdown` method and therefore the same `encodeHtmlEntities` call. A post-process wrapper (Option A in the fix map) covers both automatically. A per-site patch (Option B) would need to patch both sites.

**Asymmetry with decode path:** `decodeHtmlEntities` (same file) handles `&lt;`, `&gt;`, `&quot;`, `&amp;` — the 4 canonical markdown entities. It does NOT decode named entities (`&copy;`, `&mdash;`) or numeric entities (`&#169;`, `&#x2022;`). This asymmetry is what causes named/numeric entities to double-encode on round-trip: the parser reads them as literal text containing an `&`, the serializer then escapes the `&` to `&amp;`, and the result stabilizes at `&amp;copy;` which no HTML renderer decodes correctly.

**Design intent:** Per comments in the source, the encoder exists to safely serialize node text that contains actual special characters (so that subsequent markdown → HTML rendering displays them correctly). The unstated assumption is that markdown is a transport format, not a persistence format. In our architecture (where markdown IS the canonical on-disk format), that assumption breaks — entity encoding is data corruption from a git-diff and grep perspective even when it's visually identical in rendered HTML.

**Implications:**

- The fix can live in three places: (A) a post-process wrapper around `mdManager.serialize` in our own code, (B) a patch to `@tiptap/markdown`'s `encodeTextForMarkdown` to accept a disable flag, (C) a semantic rewrite that only escapes characters that form markdown syntax conflicts. Each has different tradeoffs documented in the evidence file.
- Any fix option must be applied at BOTH of our serializer call sites: `packages/server/src/persistence.ts:333,348`, `packages/server/src/agent-sessions.ts:58`, `packages/server/src/standalone.ts:169`, and (post-unification) `packages/server/src/external-change.ts`.
- A fix that does not also address the decoder asymmetry (named/numeric entities) leaves 2 of the 10 corruption cases unresolved.

**Decision triggers:**

- If the team decides to upstream a fix to `@tiptap/markdown`, it'll take weeks-to-months. Option A is the tactical answer.
- If we later migrate to an alternative markdown lib (remark, prosemirror-markdown), this specific root cause becomes irrelevant but the construct catalog still applies.
- If any future `@tiptap/markdown` v4 changelog mentions entity handling, re-run the probe to verify.

**Remaining uncertainty:**

- ~~Not verified whether `@tiptap/markdown` has an undocumented option to customize `encodeTextForMarkdown`. The full 1298-line `MarkdownManager.ts` was not exhaustively read.~~ → **Resolved in D2b below.** Full API surface exhausted; no documented option exists.
- ~~The non-trivial extension API for `encodeHtmlEntities` (e.g., passing a custom encoder via MarkdownManager options) has not been explored. If it exists, Option B would collapse to an options change.~~ → **Resolved in D2b below.** No such API exists, but a prototype monkey-patch escape hatch was found.

#### D2b: Extension API surface for customizing entity encoding

**Finding:** `@tiptap/markdown` v3.22.3 exposes **zero** documented hooks, options, or extension points to customize or disable the `encodeTextForMarkdown` → `encodeHtmlEntities` call path. The constructor accepts no encoding-related options. The `ExtendableConfig` interface has no encoding fields. The `renderMarkdown` extension handler cannot intercept child text-node encoding. The `serialize()` method has no pre/post hooks. The only existing skip mechanism (`code: true` on extensions) is not viable for general text nodes.

**Escape hatch found:** The compiled JavaScript (`dist/index.js`) emits `encodeTextForMarkdown` as a regular prototype method (not ES2022 `#private`), enabling a **prototype monkey-patch** that bypasses encoding at the root cause — 5 lines, zero fork:

```typescript
(MarkdownManager.prototype as any).encodeTextForMarkdown = function(text: string) { return text; };
```

This adds a new **Option D** to the fix taxonomy that is cheaper than upstream patching (Option B) and more precise than blind post-process decoding (Option A). The patch must be applied before any `serialize()` call and is fragile against future library changes (method rename, `#private` upgrade, or inlining).

**Evidence:** [evidence/d2b-extension-api-surface.md](evidence/d2b-extension-api-surface.md)

**Updated fix taxonomy:**

| Option | Description | Cost | Precision | Fork? |
|---|---|---|---|---|
| A | Post-process `serialize` output with blind decode | ~5 LOC | Low (blind) | No |
| B | Upstream `encodeEntities: false` option | ~3 LOC in lib | High | Yes |
| C | Semantic rewrite of encoder | ~50 LOC | Highest | Yes |
| **D** | **Prototype monkey-patch `encodeTextForMarkdown`** | **~5 LOC** | **High** | **No** |

**Recommendation sequence:** D > A > B > C. Option D acts at the root cause without forking. Pin `@tiptap/markdown` version and add a build-time assertion that the method exists on the prototype.

**Decision triggers:**

- When implementing the entity corruption fix, start with Option D. If a future `@tiptap/markdown` version breaks it, fall back to Option A.
- When filing an upstream issue/PR for Option B, reference [PR #7565](https://github.com/ueberdosis/tiptap/pull/7565) (which introduced the encoding) and propose an `encodeEntities` constructor option.

---

### D3: Test priority ranking — 12 P0, 14 P1, 17 P2, 6 P3

**Finding:** Of all 118 constructs, we ranked 49 by test priority: 12 P0, 14 P1, 17 P2, 6 P3. The P0 and P1 tiers (26 items) all have material fidelity issues from the 39-case material-difference set. P2 includes 17 regression-guard constructs that currently pass but are worth keeping (Unicode, wiki-links, task lists, strikethrough, standard emphasis, etc. — mostly `WHITESPACE_DIFF` cases). P3 includes 6 constructs that are out of scope entirely (math blocks, footnotes, definition lists, alerts, emoji shortcodes, BOM/CRLF — not in the 118-case catalog). The remaining ~69 constructs not listed in the hit list are `WHITESPACE_DIFF` cases considered implicitly covered by the cosmetic-normalization category.

**Evidence:** [evidence/d3-hit-list-ranked.md](evidence/d3-hit-list-ranked.md)

**The 12 P0 cases (ranked by blast radius × silent-failure severity × coverage gap):**

| # | Construct | Real-world example | Failure |
|---|---|---|---|
| 1 | `&` in heading text | `# H&M Store` → `# H&amp;M Store` | Silent disk corruption on every save |
| 2 | `&` in paragraph body | `Foo & Bar` → `Foo &amp; Bar` | Silent disk corruption |
| 3 | `&` in link text | `[A & B](url)` → `[A &amp; B](url)` | Silent disk corruption |
| 4 | `&` in table cell | `\| A & B \| test \|` → `\| A &amp; B \|` | Silent disk corruption |
| 5 | Literal `<` `>` in paragraph | `If a < b` → `If a &lt; b` | Silent disk corruption |
| 6 | Named entities | `&copy; 2026` → `&amp;copy; 2026` | Double-encoding; renders wrong |
| 7 | Numeric entities | `&#169; 2026` → `&amp;#169; 2026` | Double-encoding; renders wrong |
| 8 | Backslash escape `\*` | `\*star\*` → `star` | **Content dropped** — Fix site: dual-layer `@tiptap/markdown` bug. Parse: `parseInlineTokens` drops marked's `escape` token (no handler). Serialize: `encodeTextForMarkdown` doesn't re-escape `*`. See [evidence/d2c-backslash-escape-origin.md](evidence/d2c-backslash-escape-origin.md). |
| 9 | Backslash escape `\_` | `my\_var` → `myvar` | **Content dropped** — Fix site: same dual-layer bug as case 8. `escape` token with `_` dropped at parse; no re-escape at serialize. |
| 10 | Backslash escape `\[` | `\[text\]` → `text` | **Content dropped** — Fix site: same dual-layer bug as case 8. `escape` token with `[` dropped at parse; no re-escape at serialize. |
| 11 | Backslash escape `\#` | `\# Hash` → ` Hash` | **Content dropped** — Fix site: same dual-layer bug as case 8. `escape` token with `#` dropped at parse; no re-escape at serialize. Re-parse of unescaped `#` at line start produces heading (meaning change). |
| 12 | Link reference definitions | `[text][ref]\n[ref]: url` → `[text](url)` | Reference definition unrecoverable |

Cases 1-7 are **entity corruption** (silent, visually-equivalent, disk-noise). Cases 8-11 are **content loss** (characters dropped entirely, user-visible on next render). Case 12 is **structural destruction** (reference-style links inlined).

**The existing test suite catches zero of these.** The `conversion-fidelity.test.ts` assertion `words.match(/\w{3,}/g)` filters out every character in the P0 list — `&`, `<`, `>`, `\`, `*`, `_`, `[`, `]`, `#`, `(`, `)` — so all 12 cases pass silently today.

**Test additions needed:**

Each P0 case is a single test input with a specific expected output or invariant assertion. Budget: ~5 lines per test case × 12 cases = ~60 lines of test code. Plus the assertion framework tightening (switch from `/\w{3,}/g` to a strict-non-whitespace compare): ~20 lines. Total additive test budget: ~80 lines.

**Implications:**

- The existing `conversion-fidelity.test.ts` construct list (22 entries) and its assertion regex need coordinated updates. Adding the P0 cases without tightening the assertion still fails to catch them.
- Tests should be structured so that the assertion failure message pinpoints which character class failed (e.g., "entity corruption: & → &amp;" not generic "output differs from input").
- A parity-diff test is valuable: maintain an array of 41 materially-different constructs with their canonical normalized outputs, assert that each one produces the expected normalized output. This prevents drift between cycles.

**Decision triggers:**

- When reviewing a PR that touches the disk↔CRDT bridge or the markdown serialize path, consult the P0 list.
- When scoping a "fix the entity bug" story, use the P0 list as acceptance criteria.
- When adding a new markdown construct to `sharedExtensions`, run the probe script with the new construct added to `CONSTRUCTS` to classify its behavior before merging.

**Remaining uncertainty:**

- P0 #12 (link reference preservation) requires schema-level support in `@tiptap/markdown`. Existing research flagged this as a fundamental limitation; test case documents the gap rather than expecting a fix.
- Whether the 14 P1 constructs should also be tightened is a judgment call — they're currently normalized but not corrupted. Test priority depends on whether the team cares about byte-identical round-trips or only content-preservation.

---

### D4: Layer A (`mdManager`) vs Layer B (full Y.Doc observer path) equivalence

**Finding:** All 118 cases produce byte-identical output through the `mdManager`-only path and the full `mdManager → schema.nodeFromJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → mdManager` path. The CRDT observer bridge is a complete pass-through for construct fidelity.

**Evidence:** [evidence/d1-construct-catalog.md](evidence/d1-construct-catalog.md) §"Layer A vs Layer B", `probe-results.tsv` column `aMatchesB` (all rows `Y`).

**Implications:**

- **Testing at the `mdManager` level is sufficient** for construct-level fidelity verification. Constructs that break at the mdManager level break through the full bridge; constructs that pass at the mdManager level pass through the full bridge.
- **The CRDT observer bridge is correct for this class of test.** Any bug we hypothesize as "the observer bridge corrupted this construct" is actually a `@tiptap/markdown` bug that was already present. Time spent debugging the CRDT layer on these symptoms is time wasted.
- **Integration tests for bidirectional editing across constructs** (the kind proposed in the earlier integration-test discussion) should assert the same construct behavior as `mdManager` tests. They add value for testing the observer bridge's timing, concurrency, and multi-client semantics — not for testing construct fidelity.

**Decision triggers:**

- When debugging a "construct X broke after my CRDT change," first isolate via Layer A: run the probe on construct X. If it fails at Layer A, the CRDT change is innocent.
- When prioritizing fix effort, the fix goes in the markdown layer (core/server), not the editor layer (app).
- When designing integration-tier tests for construct fidelity, put them in `packages/server/src/external-change.test.ts` or similar (mdManager-level) rather than `packages/app/tests/integration/bridge-matrix.test.ts` (observer-level).

**Remaining uncertainty:**

- Equivalence holds for SINGLE-client, SINGLE-doc operations. Multi-client scenarios where two clients push conflicting construct edits may reveal divergent behavior. Not tested here.
- Equivalence does not cover the **persistence layer** (disk → server → disk). Frontmatter handling, file-write semantics, and git interactions are all outside the probe's scope.

---

### D5: Idempotence — 115/118 converge after 1 cycle; 3 don't

**Finding:** 115 of 118 constructs satisfy `serialize(parse(serialize(parse(x)))) === serialize(parse(x))` — the round-trip converges to a stable form after exactly 1 cycle. 3 constructs do not converge and are unsafe to save twice.

**Evidence:** `probe-results.tsv` column `idempotent`.

**Non-idempotent cases:**

| Construct | Pattern | Impact |
|---|---|---|
| `inline-code-with-backticks` | `` Use `` `backtick` `` here. `` | Double-backtick wrapping collapses inconsistently; each cycle may produce different output |
| `html-block-div` | `<div>HTML block</div>` | HTML escaped to entities on cycle 1, may re-encode on cycle 2 |
| `frontmatter-yaml` | `---\ntitle: My Doc\n---` | Frontmatter parsed as HR + setext heading; doesn't stabilize because heading re-renders differently each cycle |

**Implications:**

- For `frontmatter-yaml`: the production code path uses `stripFrontmatter()` before `mdManager.parse()`, so this case is never hit in production. But it DOES hit in tests that call `mdManager` directly (`conversion-fidelity.test.ts`). The test harness masks a real limitation of `mdManager` that only the `stripFrontmatter` wrapper makes safe.
- For `inline-code-with-backticks`: rare in practice but technically a convergence failure. Test authors should avoid using double-backtick code spans in test inputs, or document the non-idempotence.
- For `html-block-div`: direct consequence of the entity bug. HTML blocks are not modeled in our schema, so they become text nodes with escape sequences. Fixing the entity bug reduces this to "single-cycle convergent with escaped content" rather than non-convergent.

**Decision triggers:**

- When authoring test fixtures, avoid the three non-idempotent constructs unless you specifically want to test convergence.
- When adding frontmatter tests, test AT the persistence layer (with `stripFrontmatter` in the path), not at `mdManager` directly.

**Remaining uncertainty:**

- Longer-cycle tests (3+, 5+ cycles) were not run — cycle 2 may produce different output from cycle 1 for the 3 non-idempotent cases, but may stabilize later. Not explored.

---

### D6: Multi-client concurrent construct fidelity

**Finding:** Multi-client concurrent editing does NOT change construct fidelity. All 30 constructs tested — covering every P0 case from D3, all structural/complex constructs, and non-idempotent constructs — classify as `IDENTICAL_TO_SINGLE_CLIENT` after CRDT merge. Zero convergence failures. Zero additional corruption.

**Evidence:** [evidence/d6-multi-client-construct-pass.md](evidence/d6-multi-client-construct-pass.md), [evidence/d6-multi-client-probe.ts](evidence/d6-multi-client-probe.ts)

**Methodology:** Two `Y.Doc` instances with manual bidirectional sync via `Y.encodeStateAsUpdate` / `Y.applyUpdate` (no Hocuspocus server). Five-phase protocol: load construct → initial sync → concurrent independent edits → CRDT merge → serialize and compare. 30 constructs selected to maximize coverage of D3 P0 hit list and worst-case structural scenarios.

**Key result:** The CRDT layer is a complete pass-through for construct-level fidelity:

| Classification | Count | % |
|---|---|---|
| `IDENTICAL_TO_SINGLE_CLIENT` | 30 | 100% |
| `ADDITIONAL_LOSS` | 0 | 0% |
| `CONVERGES_DIFFERENTLY` | 0 | 0% |

**Why multi-client doesn't change fidelity:**

1. **Entity corruption fires at serialize time, not merge time.** The `encodeHtmlEntities` bug in `@tiptap/core` runs during `mdManager.serialize`, which happens AFTER CRDT merge. The merged Y.Doc content is raw text — entity encoding is applied once during serialization, identically to single-client.
2. **Backslash-escape loss happens at parse time.** The `\*` → `` content drop occurs when `mdManager.parse` processes the initial input. By the time content reaches Y.Doc, the escaped characters are already gone. CRDT merge can't compound what's already lost.
3. **Yjs convergence is unconditional.** Both clients reach byte-identical serialized output after merge for all 30 cases. Yjs's CRDT guarantee holds across all construct categories.

**Implications:**

- **D3 P0 ranking is unchanged.** Multi-client does not introduce new failure modes that would change test priority.
- **Separate multi-client construct fidelity tests are NOT needed.** The existing Layer A/B equivalence (D4) plus the proposed P0 assertion tightening (D3) are sufficient. Multi-client integration tests add value for timing/observer semantics, not construct fidelity.
- **D4's remaining uncertainty is now resolved.** D4 noted: "Multi-client scenarios where two clients push conflicting construct edits may reveal divergent behavior. Not tested here." D6 answers: no divergent behavior observed.

**Decision triggers:**

- When a CRDT-related change is proposed and someone asks "does this affect construct fidelity under multi-client?" — cite D6. The answer is no, because fidelity bugs live at the `@tiptap/markdown` layer, not the CRDT layer.
- When scoping test effort for multi-client scenarios, invest in observer timing and bridge invariant tests (bridge-matrix tier), not construct-level fidelity tests.

**Remaining uncertainty:**

- Edit-same-character-range conflicts not tested. Both clients edited different parts of the same construct; we did not test both modifying the exact same character range. This would test CRDT conflict resolution ordering, not construct fidelity.
- Observer B interaction not tested. This probe bypasses the Observer A/B bidirectional sync pipeline. In production, observer interactions with CRDT-merged content are a timing concern covered by bridge-matrix tests.
- 3+ concurrent clients not tested. Yjs is designed for N-client convergence and 2-client testing is standard, but we stopped at 2.

---

## Limitations and Open Questions

### Dimensions Not Fully Covered

- **Persistence-layer round-trip.** Tests assume `mdManager.parse/serialize` is the full pipeline. The real production pipeline adds `stripFrontmatter`/`prependFrontmatter`, disk write/read, and Hocuspocus persistence semantics. Constructs that pass at the mdManager layer may still fail at the full persistence layer for non-construct-related reasons (file encoding, line-ending handling, BOMs). Not explored here.
- **Multi-client concurrent mutation.** ~~All 118 cases tested were single-client.~~ **Partially resolved by D6:** 30 constructs tested under 2-client concurrent edit show no additional fidelity loss. Remaining gap: edit-same-character-range conflicts and 3+ client scenarios not tested.
- **Upstream version drift.** The catalog is locked to `@tiptap/markdown@3.22.3`. A future version (v3.23, v4.0) may change construct behavior. Re-run the probe after any `@tiptap/markdown` upgrade.
- **Extension interaction matrix.** We tested each custom extension (wiki-link, jsx-component) in isolation. Combinations (wiki-link inside a table cell, jsx-component inside a list item, frontmatter + wiki-link) were not enumerated. Probable but not verified to be lossless.

### Out of Scope (per Rubric)

- **Implementing the fix.** This report identifies four fix options (post-process, upstream patch, semantic rewrite, prototype monkey-patch) but does not recommend one. That's a spec-level decision.
- **Rewriting the `conversion-fidelity.test.ts` assertion.** The report identifies the regex blind spot and recommends tightening, but the exact new assertion shape and which constructs to assert `.toBe` vs content-equivalence is a test-design decision.
- **Assessing `automerge-prosemirror` or alternative CRDT stacks.** Covered in existing `automerge-prosemirror-migration-assessment` report; not re-evaluated here.
- **Testing the `@tiptap/markdown` v4 API if/when it ships.** Locked to v3.22.3.

---

## References

### Evidence Files

- [evidence/d1-construct-catalog.md](evidence/d1-construct-catalog.md) — 118-case enumeration with classifications + aggregate counts
- [evidence/d2-root-cause-entities.md](evidence/d2-root-cause-entities.md) — source-level trace through `@tiptap/core` and `@tiptap/markdown`
- [evidence/d2b-extension-api-surface.md](evidence/d2b-extension-api-surface.md) — exhaustive API surface audit for encoding bypass; prototype monkey-patch escape hatch
- [evidence/d2c-backslash-escape-origin.md](evidence/d2c-backslash-escape-origin.md) — backslash-escape origin trace across 3 pipeline layers
- [evidence/d2c-split-test.ts](evidence/d2c-split-test.ts) — split test reproduction script for backslash-escape loss
- [evidence/d3-hit-list-ranked.md](evidence/d3-hit-list-ranked.md) — P0/P1/P2/P3 ranking with decision triggers
- [evidence/probe-script.ts](evidence/probe-script.ts) — reproduction code (run via `bun probe-script.ts` from `packages/server/`)
- [evidence/probe-results.tsv](evidence/probe-results.tsv) — row-level output for all 118 cases
- [evidence/probe-summary.txt](evidence/probe-summary.txt) — aggregate class counts
- [evidence/d6-multi-client-construct-pass.md](evidence/d6-multi-client-construct-pass.md) — D6: 30-case multi-client concurrent construct fidelity analysis
- [evidence/d6-multi-client-probe.ts](evidence/d6-multi-client-probe.ts) — D6: multi-client probe script (2-client manual-sync harness)

### External Sources

- [CommonMark 0.31.2 Specification](https://spec.commonmark.org/0.31.2/) — the construct taxonomy
- [GitHub Flavored Markdown Spec](https://github.github.com/gfm/) — GFM extensions (tables, task lists, strikethrough, autolinks)
- [@tiptap/markdown on GitHub](https://github.com/ueberdosis/tiptap) — source for `MarkdownManager.ts`
- [@tiptap/core on GitHub](https://github.com/ueberdosis/tiptap) — source for `htmlEntities.ts`
- [marked v17](https://marked.js.org/) — the underlying markdown tokenizer used by `@tiptap/markdown`

### Related Research

- [Markdown Round-Trip Fidelity Through @tiptap/markdown](../markdown-roundtrip-fidelity-tiptap/) — prior viability-assessment report; this catalog builds on its conclusions
- [Yjs Dual-Key Shimmer Analysis](../yjs-dual-key-shimmer-analysis/) — deeper trace of observer firing sequence for bidirectional sync
- [Source Toggle Architecture](../source-toggle-architecture/) — WYSIWYG ↔ source-mode architecture assessment
- [MDX Round-Trip Fidelity Through CRDT-Backed Visual Editors](../mdx-crdt-roundtrip-fidelity/) — parallel investigation for the MDX superset
- [CRDT Observer Bridge Latency Analysis](../crdt-observer-bridge-latency-analysis/) — deep dive on bridge timing (relevant for integration tests)
