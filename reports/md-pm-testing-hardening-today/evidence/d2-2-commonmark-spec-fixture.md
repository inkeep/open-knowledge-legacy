---
dimension: D2.2 — CommonMark spec test suite as differential fixture
date: 2026-04-19
sources:
  - github.com/commonmark/commonmark-spec
  - github.com/wooorm/commonmark.json
  - npmjs.com/package/commonmark-spec
  - github.com/github/cmark-gfm
  - github.com/mdx-js/specification
---

# Evidence: D2.2 — CommonMark spec test suite as differential fixture

## Key sources referenced
- [github.com/commonmark/commonmark-spec](https://github.com/commonmark/commonmark-spec) — source of truth for spec.txt and spec_tests.py
- [github.com/wooorm/commonmark.json](https://github.com/wooorm/commonmark.json) — Titus Wormer's JSON mirror of the spec examples
- [npmjs.com/package/commonmark-spec](https://www.npmjs.com/package/commonmark-spec) — official npm publication
- [github.com/github/cmark-gfm/blob/master/test/spec.txt](https://github.com/github/cmark-gfm/blob/master/test/spec.txt) — GFM extension tests
- [github.github.com/gfm/](https://github.github.com/gfm/) — formal GFM spec (rendered)
- [github.com/mdx-js/specification](https://github.com/mdx-js/specification) — archived MDX spec repo

---

## Findings

### Finding: CommonMark spec examples number ~650, distributed as both embedded text and JSON
**Confidence:** CONFIRMED
**Evidence:** From [commonmark-spec README](https://github.com/commonmark/commonmark-spec):

> "over 500 embedded examples which serve as conformance tests"

Micromark's README states "~650 CommonMark tests" (tested against current spec revision). The [commonmark.json](https://github.com/wooorm/commonmark.json) npm package returns "approximately 627 test items" at version 0.31.0 (January 2024).

Format of each example object:
```json
{
  "markdown": "Foo\nBar\n---\n",
  "html": "<h2>Foo\nBar</h2>\n",
  "section": "Setext headings",
  "number": 65
}
```

**Implications:**
- The corpus is small enough to iterate thousands of times in a test suite (well under a second per parser on modern hardware)
- Two npm packages provide the JSON: official `commonmark-spec` and `commonmark.json` — both are consumable from TypeScript/Bun without Python tooling
- Section labels allow slicing by feature area (e.g., tests only affecting "Tables", "Emphasis and strong emphasis")

### Finding: The canonical test oracle in CommonMark is normalized HTML, not AST
**Confidence:** CONFIRMED
**Evidence:** [test/spec_tests.py](https://github.com/commonmark/commonmark-spec/blob/master/test/spec_tests.py) in the commonmark-spec repo:

> `if normalize: actual_html = normalize_html(actual_html) + '\n'`
> `expected_html = normalize_html(expected_html) + '\n'`

Normalization is delegated to a separate `normalize_html()` function (in `normalize.py`), which ignores insignificant whitespace and attribute ordering. The `--no-normalize` flag disables it.

**Implications:**
- Cross-parser comparison at the HTML level requires the same normalization to be meaningful
- The `normalize_html()` logic is a known, re-implementable algorithm — markedjs/[html-differ](https://github.com/markedjs/html-differ) provides an equivalent JS implementation ("ignores whitespaces (spaces, tabs, new lines etc.) inside start and end tags" and normalizes attribute order)
- AST comparison is NOT the canonical approach, even for the reference parsers

### Finding: GFM has its own spec.txt (strict superset of CommonMark)
**Confidence:** CONFIRMED
**Evidence:** [github/cmark-gfm test/spec.txt](https://github.com/github/cmark-gfm/blob/master/test/spec.txt) is ~10,212 lines / ~212 KB of markdown with embedded `example` blocks. [The GitHub Blog announcement](https://github.blog/engineering/user-experience/a-formal-spec-for-github-markdown/) confirms:

> "GFM is a strict superset of CommonMark"

Extension areas: tables, strikethrough, task lists, autolinks, disallowed raw HTML.

**Implications:**
- GFM extension tests are embedded in the same example format as CommonMark spec.txt
- They can be extracted with the same tooling (spec_tests.py --dump-tests)
- No separate GFM-only JSON package exists on npm — must be extracted from cmark-gfm's repo
- Expected-HTML oracle is identical in shape to CommonMark's

### Finding: MDX has no formal spec test corpus
**Confidence:** CONFIRMED (via direct inspection of the archived spec repo)
**Evidence:** The [mdx-js/specification](https://github.com/mdx-js/specification) repo is explicitly "Archived info on MDX language and AST definitions." Per MDX's current documentation:

> "Most of the specification information is now on the website mdxjs.com, and there are micromark extensions that function as reference implementation"

**Implications:**
- No fixture-style corpus for MDX exists
- Reference behavior = whatever micromark-extension-mdxjs produces
- For MDX, differential testing collapses to "micromark + mdx extension" vs itself — effectively an identity oracle
- Scope limitation: MDX does not contribute new JS-vs-JS differential material

### Finding: Wiki-link has no formal test corpus or multi-implementation standard
**Confidence:** CONFIRMED (negative result via targeted searches)
**Evidence:**
- Web searches for "wiki-link markdown spec test vector" return only Obsidian forum threads and help posts discussing user preferences, not specifications
- Obsidian itself is closed-source and provides no test fixtures
- The npm package `remark-wiki-link` (used in the parent pipeline per parent worldmodel) is a remark plugin with its own unit tests but no cross-implementation corpus

**Implications:**
- Any differential testing for wiki-link features has no external fixture to reference — must be hand-written
- The remark plugin is effectively both the spec and the implementation

### Finding: spec.txt is already vendored into multiple parser repos
**Confidence:** CONFIRMED
**Evidence:**
- `markdown-it/markdown-it/test/fixtures/commonmark/spec.txt` exists ([direct link](https://github.com/markdown-it/markdown-it/blob/master/test/fixtures/commonmark/spec.txt))
- micromark ships `test/commonmark.js` that consumes the spec via the commonmark.json package
- `commonmark-spec` npm package is maintained and versioned to spec version

**Implications:**
- A consumer project can either: (a) install `commonmark-spec` from npm and avoid vendoring, or (b) copy spec.txt and run its own extractor
- The JSON publication is version-tagged (0.31.x tracks current CommonMark)

---

## Gaps / follow-ups
- Exact count of GFM-specific extension tests (separate from inherited CommonMark tests) not confirmed in primary sources; cmark-gfm's spec.txt does not publish a categorized count
- No centralized npm package for "CommonMark + GFM" combined JSON fixture — must be assembled from two sources
