# Evidence: D10 — HTML→Markdown Library Evaluation

**Dimension:** D10 (pivot library for HTML paste: Turndown vs rehype-remark vs alternatives)
**Date:** 2026-04-15
**Sources:** npm, GitHub, bundlephobia (rate-limited), Obsidian community, unified ecosystem docs, CommonMark forum.

---

## Summary table

| Library | Version | Stars | Last activity | Weekly DLs | License | TS types | GFM built-in? | Extensible? | Output | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **Turndown** | 7.2.4 | 11.1k | 2026-04-03 (active) | ~3.7–4M | MIT | `@types/turndown` (DT) | No — plugin `turndown-plugin-gfm` (dormant since 2017) | Rich rule API | string | **Viable primary; industry default** |
| **rehype-remark** | 10.0.1 (2025-04-02) | 98 | 2025-04 (stable) | tens of k | MIT | First-party `.d.ts` | **Yes, natively** via `hast-util-to-mdast` | unified plugin + handlers | mdast tree | **Recommended primary — architectural fit** |
| **hast-util-to-mdast** (engine) | 10.1.2 (2025-01) | 43 | 2025-01 (active) | tens of k | MIT | First-party `.d.ts` | Yes | handlers/nodeHandlers | mdast tree | (Used transitively) |
| **node-html-markdown** | 2.0.0 (2025-11-14) | 260 | 2025-11 (moderate) | small | MIT | First-party TS | Partial | Translator API | string | Niche (perf-critical only) |
| **html-to-md** | small | 159 | sustained | small | MIT | Partial | Partial | Tag-listener API | string | Not recommended |
| **marked** (inverse) | n/a | — | — | — | — | — | — | — | n/a | **NOT FOUND** (MD→HTML only) |

All CONFIRMED via GitHub/npm. Bundle sizes INFERRED (bundlephobia rate-limited; verify locally before lock-in).

---

## Findings

### Finding D10-1: Turndown — the industry default, imperfect fit (CONFIRMED)

**Maintenance signals:**
- 476 commits, last 2026-04-03; active maintenance under `mixmark-io/` (repo moved from `domchristie/` after a dormant period).
- 109 open issues, 30 open PRs — backlog exists but triage is happening.
- 3.69M–4.0M weekly downloads (Snyk / npm). Dominant by 2 orders of magnitude.
- Sole production dep: `@mixmark-io/domino` (server-side DOM; tree-shakes in browser).
- TypeScript: `@types/turndown` in DefinitelyTyped. Feature requests #230, #359 for in-repo types remain open.

**Output quality:**
- All core markdown: headings (ATX/setext), lists (nested, configurable marker), code blocks (fenced/indented, configurable char), links (inline/reference), images, strong/emphasis (configurable delimiter), strikethrough, HR, hard break.
- **GFM is NOT built-in.** `turndown-plugin-gfm` last released 2017-12-19 — effectively frozen. 124 stars, still works (Obsidian's Advanced Paste uses it in production) but unsupported.
- Unknown tags → text content with block separation. `keep(filter)` preserves as literal HTML; `remove(filter)` strips. Right mechanism for MDX passthrough if desired.
- Attribute handling: ignored by default; replacement functions receive DOM node for introspection.

**Known bugs:**
- `&lt;` entity decoding (#152, open since 2016) — literal `<html>` in output. Usually fine for clipboard HTML (entities decoded on parse) but testable.
- Whitespace leaking from HTML into markdown (#361, #394, #264).
- Tables dropped without plugin (#416).

**Obsidian precedent:** `kxxt/obsidian-advanced-paste` uses Turndown + gfm plugin in production. Exposes `turndown` as a utility to user transform functions. This is the working precedent in the market.

**Google Docs wrapper handling:** widely solved in community (`<b style="font-weight:normal" id="docs-internal-guid-">` unwrap) but NOT built-in. Must write your own rule.

**Integration shape with our pipeline:**
- Output: markdown string → feeds `MarkdownManager.parse(md)`.
- Two parsers in pipeline (Turndown's DOM + our remark). One string round-trip — markdown escapes have to cross the Turndown→our boundary cleanly.

### Finding D10-2: rehype-remark — the unified-native fit (CONFIRMED)

**Maintenance signals:**
- v10.0.1 published 2025-04-02. 98 stars — low visibility but institutional (rehypejs org under unifiedjs).
- 126 commits, 0 open issues, 0 open PRs — stable, not dead.
- Node 16+, ESM only. MIT. First-party `.d.ts`.
- Plugin is ~dozens of lines; real work done by `hast-util-to-mdast`.

**Engine (`hast-util-to-mdast` 10.1.2):**
- 43 stars, active (last commit 2025-01-28).
- Ships 30 element-specific handlers: a, base, blockquote, br, code, comment, del, dl, em, heading, hr, iframe, img, inline-code, input, li, list, media, p, q, select, strong, table, table-cell, table-row, text, textarea, wbr, plus root/index dispatch.
- **GFM native:** `<table>` → mdast `table`; `<del>`/`<s>`/`<strike>` → `delete`; `<input type="checkbox">` → GFM task list. No plugin needed.
- SVG ignored by default; preservable via custom handler emitting `{type:'html', value: toHtml(node)}`.
- `<video>`/`<audio>` → links (per README).

**Output quality:** better than Turndown on tables/strike/tasks out of the box. **mdast tree output** — no string-level escape pass; mdast structure is direct input to our existing mdast→PM handlers. No re-escape risk.

**Extensibility (unified plugin + handler idiom):**
- `handlers: {tagName: (state, element, parent) => mdastNode}` merges into defaults.
- `nodeHandlers` for custom hast types.
- `state.patch()`, `state.one()`, `state.all()` for recursive walks.

**Wiki-link support:** a handler for `a[href^="[["]` emits `{type: 'wikiLink', value: 'Page'}` — an mdast type our pipeline already handles.

**MDX passthrough (the architectural win):** a handler for recognized component tags emits `mdxJsxFlowElement` — an mdast type our existing handlers consume. **Zero string round-trip for MDX content.** This is strictly better than Turndown, which requires serializing JSX-as-text and re-parsing it.

**Vendor-specific heuristics:** NOT FOUND as built-ins. Custom pre-process via a `rehype-*` plugin (e.g., `rehype-strip-google-docs-wrapper`, `rehype-demote-bold-span-to-strong`) — same idiom as our existing remark plugins.

### Finding D10-3: Our pipeline's existing unified footprint makes rehype-remark strictly-better integration (INFERRED)

Current pipeline (`packages/core/src/markdown/pipeline.ts`):
```
remark-parse → remark-gfm → remark-frontmatter → remarkMdxAgnostic
  → wiki-link micromark extension → R23 autolink guard
  → position-slice walker → remarkProseMirror (mdast → PM JSON)
```

We are already the "full unified" codebase. Adding rehype-parse + rehype-remark extends laterally.

**With Turndown:**
```
HTML → Turndown (separate DOM parser) → markdown string → our remark → mdast → handlers → PM JSON
```
Two parsers; string round-trip.

**With rehype-remark:**
```
HTML → rehype-parse → hast → rehype-remark (= hast-util-to-mdast) → mdast → our handlers → PM JSON
```
One parser; tree-only until final PM step.

**Bigger win — direct HAST→mdast→PM:** because our mdast→PM handlers already know `wikiLink`, `mdxJsxFlowElement`, `jsxComponent`, etc., a `rehype-remark` handler can emit those mdast types directly. Preserved MDX round-trip end-to-end with zero string pass. Unique to the unified ecosystem.

### Finding D10-4: node-html-markdown — perf niche, not ours (CONFIRMED NOT RELEVANT)

- 260 stars, 144 commits, 9 open issues, 3 PRs; v2.0.0 2025-11-14.
- Benchmark: 1.59× faster than Turndown at 100kB scale (17ms vs 27ms). Built for scraping throughput.
- TS first-party; MIT; `TranslatorConfig` extensibility (thinner than Turndown).
- GFM partial; task lists UNCERTAIN.
- **Perf advantage irrelevant for clipboard paste.** No Obsidian-class adoption.

### Finding D10-5: html-to-md — too niche (CONFIRMED NOT RECOMMENDED)

- 159 stars, 196 commits, 3 open issues.
- 10KB gzip claim, zero deps, 200+ unit tests (README).
- `skipTags`/`ignoreTags`/`aliasTags`/`renderCustomTags`/`tagListener` — thinner API.
- No production-editor adoption found.

### Finding D10-6: marked — not bidirectional (CONFIRMED NOT FOUND)

- marked is strictly MD→HTML. CommonMark thread (talk.commonmark.org/t/899) + markedjs discussions #2153, #737: no reverse path.
- Community consensus defers to Turndown.

---

## Output-quality comparison matrix

| Feature | Turndown | Turndown+GFM | rehype-remark | node-html-markdown | html-to-md |
|---|---|---|---|---|---|
| Basic blocks (h, p, bq, hr) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lists (nested/mixed) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Code (inline + fenced) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Images + links (w/ title) | ✓ | ✓ | ✓ | ✓ | ✓ |
| GFM tables | ✗ | ✓ | **native** | partial | partial |
| GFM strikethrough | ✗ | ✓ | **native** | ✓ | ✓ |
| GFM task lists | ✗ | ✓ | **native** | uncertain | uncertain |
| HTML entity fidelity | bug #152 | bug | correct (mdast-level) | unknown | unknown |
| Raw-HTML passthrough | `keep()` | `keep()` | custom handler → `{type:'html'}` | `renderCustomTags` | `renderCustomTags` |
| Vendor HTML (GDocs/Word/VS Code) | none built-in | none | none | none | none |

---

## Integration complexity ranking

1. **rehype-remark** — fits as two new unified plugins; handlers use same idiom as our existing mdast→PM handlers; MDX and wiki-link pass through without string serialization.
2. **Turndown** — ~5 lines glue + rule registrations for MDX/wiki-links and GDocs cleanup; string round-trip; matches Obsidian's production stack.
3. **node-html-markdown** — same shape as Turndown; smaller community.
4. **html-to-md** — same shape as Turndown; thinner API; least-tested.

---

## Recommendation

**Primary: rehype-remark + rehype-parse.** Architecturally correct for our stack. Native GFM. Same plugin idiom as the rest of our pipeline. First-party TS. MDX/wiki-link handlers stay inside our existing mdast handler table with zero string round-trip. Institutional backing (unified collective).

**Fallback / dual-source verification: Turndown + turndown-plugin-gfm + custom rules.** Consider only if a blocking rehype-remark issue surfaces during implementation, OR as a second serializer in a fidelity-fuzz test suite (belt-and-suspenders).

**Not recommended:** node-html-markdown (perf niche), html-to-md (too thin), marked (not bidirectional).

---

## Gaps / follow-ups

- **Bundle sizes** UNCERTAIN — bundlephobia rate-limited research attempts. Recommend local `bun add` measurement before final lock-in.
- **Pre-cleanup plugin** (strip GDocs wrapper, strip Word `mso-*`, strip Cocoa `Apple-*`) must be written regardless of library choice. Discussed in D12+D13 evidence.

---

## Sources

All accessed 2026-04-15.

- https://github.com/mixmark-io/turndown (stars, commits, open issues/PRs)
- https://raw.githubusercontent.com/mixmark-io/turndown/master/package.json
- https://raw.githubusercontent.com/mixmark-io/turndown/master/README.md
- https://github.com/mixmark-io/turndown-plugin-gfm (dormant since 2017-12-19)
- https://github.com/rehypejs/rehype-remark (v10.0.1, 2025-04-02)
- https://raw.githubusercontent.com/rehypejs/rehype-remark/main/readme.md
- https://github.com/syntax-tree/hast-util-to-mdast (10.1.2, 2025-01-28)
- https://raw.githubusercontent.com/syntax-tree/hast-util-to-mdast/main/readme.md
- https://github.com/syntax-tree/hast-util-to-mdast/tree/main/lib/handlers
- https://github.com/crosstype/node-html-markdown (v2.0.0, 2025-11-14)
- https://github.com/stonehank/html-to-md
- https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/turndown/index.d.ts
- https://github.com/mixmark-io/turndown/issues/152 (entity decoding bug)
- https://github.com/mixmark-io/turndown/issues/359 (TS types feature request, open)
- https://github.com/mixmark-io/turndown/issues/416 (tables missing without plugin)
- https://npmtrends.com/node-html-markdown-vs-turndown-vs-html-to-md-vs-rehype-remark
- https://security.snyk.io/package/npm/turndown (~3.69M DLs)
- https://unifiedjs.com/explore/package/rehype-remark/
- https://github.com/kxxt/obsidian-advanced-paste (Obsidian community Turndown usage)
- https://talk.commonmark.org/t/is-a-reverse-conversion-html-to-markdown-possible/899
- https://github.com/markedjs/marked/discussions/2153
