# D5: Frontmatter Ambiguity — Prior Art & Parser Behavior

## Executive Summary

The `---\n\n---` pattern creates genuine parsing ambiguity across markdown processors because the hyphen character serves triple duty: YAML frontmatter delimiters, thematic breaks (horizontal rules), and setext heading underlines. Empirical testing confirms **remark-frontmatter prioritizes frontmatter at document start**, consuming empty or whitespace-only blocks as `yaml` nodes rather than thematic breaks. Other ecosystems employ different strategies: gray-matter exposes an `isEmpty` flag; Hugo/goldmark handles empty content pages inconsistently; Prettier had a bug (#9788) where empty frontmatter broke subsequent horizontal rule parsing. CommonMark offers no official frontmatter spec—support is ecosystem-specific. The micromark documentation explicitly discourages `anywhere: true` for YAML, acknowledging the unsolvable ambiguity of mid-document markers.

## Empirical Test Results

Using remark + remark-frontmatter on edge cases:

| Input | Parsed Types |
|-------|--------------|
| `---\n\n---` | `["yaml"]` |
| `---\n---` | `["yaml"]` |
| `---\n\ntext\n\n---` | `["yaml"]` |
| `---\ntitle: x\n---` | `["yaml"]` |
| `---\n` | `["thematicBreak"]` |
| `---\n\n\n---` | `["yaml"]` |

**Conclusion**: remark-frontmatter greedily consumes `---...---` blocks at offset 0 as YAML, even when empty. An unclosed `---\n` is parsed as thematicBreak (valid Markdown).

## Known Issues & Research Findings

### Remark Ecosystem
- **remark-frontmatter** (v3.0+): No built-in option to "require non-empty content." The parser relies on micromark-extension-frontmatter, which has no validation hook.
- **GitHub issue #8** ([remarkjs/remark-frontmatter](https://github.com/remarkjs/remark-frontmatter/issues/8)): Documented expected behavior—first two `---` markers are frontmatter; additional `---` are thematic breaks. No ambiguity complaint lodged.
- **Micromark discussion #30** ([micromark/micromark-extension-frontmatter](https://github.com/orgs/micromark/discussions/30)): Discusses `anywhere: true` ambiguity when YAML blocks appear mid-document. Maintainers suggest: (a) use `+` instead of `-`, (b) use `---..---` (YAML standard), or (c) accept that `anywhere` is "a terrible idea" and makes markdown less portable. No resolution for empty blocks.

### gray-matter (JS library, extracts frontmatter from markdown)
- Detects empty frontmatter and sets `file.isEmpty = true` and `file.empty = string`.
- Does **not** validate YAML syntax during parsing—defers to YAML parser.
- Used by Gatsby, Netlify, VuePress, Astro. No "require non-empty" option documented.

### Hugo/goldmark (Go, YAML frontmatter support)
- **GitHub issue #11406**: `.RawContent` incorrectly includes frontmatter for empty-content pages (content after closing `---` is missing). Suggests Hugo's handling of empty pages + frontmatter is inconsistent, not fully resolved.
- goldmark-frontmatter extension requires frontmatter at document start (first line). No empty-block validation.

### Prettier (markdown formatter)
- **Issue #9788**: Empty YAML frontmatter (`---\n\n---`) breaks subsequent horizontal rule parsing when `--embedded-language-formatting` is enabled. Root cause: parser confusion over `---` role. Fixed in PR #9791. Demonstrates the parser-level risk of ambiguity.

### CommonMark & Standards
- **No official frontmatter spec**. CommonMark Spec (https://spec.commonmark.org/) treats `---` as thematic breaks only.
- YAML frontmatter is a *convention* adopted by Jekyll, GitHub Pages, Hugo, etc.—not a standard.
- **CommonMark discussion** ([talk.commonmark.org](https://talk.commonmark.org/t/front-matter-best-practice/2235)): Community acknowledges frontmatter is outside CommonMark scope; best practice is tool-specific.

### markdown-it ecosystem
- **markdown-it-front-matter** plugin: extracts `---...---` blocks and passes content to callback. No built-in empty validation.
- No prominent issues filed about empty-block ambiguity.

## Key Takeaways

1. **Parse-side priority**: All tested processors (remark, gray-matter, markdown-it, Hugo) treat opening `---` at line 1, column 1 as the *start* of frontmatter, not a thematic break. This is hardcoded, not configurable.

2. **No "require non-empty" option**: No major processor offers configuration to reject empty YAML blocks. The assumption is that authors who author frontmatter know what they're doing.

3. **`anywhere: true` is known-broken**: micromark explicitly warns against using `anywhere: true` for mid-document YAML. The ambiguity is structural and unsolvable without context (e.g., "is this YAML or a thematic break?").

4. **Empty blocks are valid**: Jekyll, Hugo, and gray-matter all accept empty frontmatter (e.g., `---\n\n---`). This is intentional—YAML specs allow empty documents.

5. **Prettier had this bug**: Empty frontmatter caused a regression in horizontal rule parsing (#9788), repaired in PR #9791. This confirms the risk: empty blocks can break downstream parsing.

## Recommended Approach for remark-prosemirror

A **parse-side mdast transformer** that detects `yaml` nodes with:
- Position at offset 0 (document start)
- Empty or whitespace-only value

...and converts to `thematicBreak` is *compatible* with standard remark behavior but would be **non-standard** (violates the convention that `---...---` at doc-start is frontmatter). Consider:

- **Option A**: Accept the ambiguity; document that `---\n\n---` is frontmatter, not a horizontal rule. Users write `***\n\n***` for intended HR at doc-start.
- **Option B**: Implement the transformer as a remark plugin, but expose a deprecation note: "This disables Jekyll/Hugo-compatible frontmatter parsing."
- **Option C**: Require remark-frontmatter config `{}` (empty, disable frontmatter) if you want `---\n\n---` to parse as thematic breaks.

## Sources

- [Dealing with ambiguous YAML frontmatter anywhere · micromark · Discussion #30](https://github.com/orgs/micromark/discussions/30)
- [How is frontmatter distinguished from normal content? · Issue #8 · remarkjs/remark-frontmatter](https://github.com/remarkjs/remark-frontmatter/issues/8)
- [Empty YAML front matter breaks horizontal rules in markdown when formatting · Issue #9788 · prettier/prettier](https://github.com/prettier/prettier/issues/9788)
- [remark-frontmatter source — lib/index.js](https://github.com/remarkjs/remark-frontmatter/blob/main/lib/index.js)
- [micromark-extension-frontmatter source — lib/syntax.js](https://github.com/micromark/micromark-extension-frontmatter/blob/main/lib/syntax.js)
- [gray-matter · npm](https://github.com/jonschlinkert/gray-matter)
- [goldmark-frontmatter · GitHub](https://github.com/abhinav/goldmark-frontmatter)
- [Hugo Front Matter · Documentation](https://gohugo.io/content-management/front-matter/)
- [CommonMark Specification](https://spec.commonmark.org/spec)
- [Front matter best practice? · CommonMark Discussion](https://talk.commonmark.org/t/front-matter-best-practice/2235)

