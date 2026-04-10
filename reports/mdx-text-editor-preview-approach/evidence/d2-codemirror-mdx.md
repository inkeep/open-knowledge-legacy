# Evidence: D2 — CodeMirror for MDX Editing

**Dimension:** CodeMirror 6 MDX editing capabilities
**Date:** 2026-04-03
**Sources:** CodeMirror official docs, @codemirror/lang-markdown, @codemirror/lang-javascript, CodeMirror forum, react-codemirror, codemirror-rich-markdoc, MDXEditor

---

## Key files / pages referenced

- https://github.com/codemirror/lang-markdown — @codemirror/lang-markdown source
- https://www.npmjs.com/package/@codemirror/lang-markdown — npm package
- https://codemirror.net/examples/mixed-language/ — Mixed-language parsing guide
- https://discuss.codemirror.net/t/how-to-syntax-highlight-mdx-in-codemirror-v6/8849 — Forum discussion
- https://github.com/codemirror/lang-javascript — JavaScript/JSX language support
- https://github.com/uiwjs/react-codemirror — React wrapper
- https://github.com/segphault/codemirror-rich-markdoc — Rich Markdoc plugin (Obsidian-like)
- https://codemirror.net/ — CodeMirror 6 homepage

---

## Findings

### Finding: CodeMirror 6 has NO built-in MDX language mode
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/how-to-syntax-highlight-mdx-in-codemirror-v6/8849

A December 2024 forum post asks: "Does CodeMirror v6 have support for MDX syntax highlighting?" The user notes that the markdown support "doesn't show how to do JSX highlighting inline in Markdown, ala MDX." As of the post date, no answer or solution was provided. No @codemirror/lang-mdx package exists. No community MDX language mode has been published to npm.

### Finding: @codemirror/lang-markdown provides markdown support with nested code language highlighting
**Confidence:** CONFIRMED
**Evidence:** https://github.com/codemirror/lang-markdown, https://www.npmjs.com/package/@codemirror/lang-markdown

The package provides:
- Markdown syntax highlighting (CommonMark)
- `codeLanguages` option: accepts array of language descriptions or a function, enabling fenced code blocks to be parsed with nested language syntax highlighting
- Autocompletion source that completes HTML tags when `<` is typed
- GFM table support

The `markdown()` function configures highlighting with `base: markdownLanguage` and `codeLanguages: languages` parameters. This gives you syntax highlighting for ```jsx, ```typescript etc. code blocks within markdown.

What it does NOT provide: JSX syntax highlighting for inline JSX components in the markdown flow (the MDX pattern where `<MyComponent prop="value">` appears between paragraphs).

### Finding: CodeMirror 6 supports mixed-language parsing via parseMixed()
**Confidence:** CONFIRMED
**Evidence:** https://codemirror.net/examples/mixed-language/

CodeMirror handles composite languages (e.g., JavaScript inside HTML `<script>` tags) via `parseMixed()`. The HTML parser can be configured to mount the JavaScript parser within `<script>` nodes. This is the mechanism that COULD be used to add JSX highlighting inside markdown — by treating JSX blocks in MDX as nested language regions.

However: This requires custom parser integration. The markdown parser would need to identify MDX JSX regions and delegate to the JavaScript/JSX parser. This is non-trivial custom work.

### Finding: @codemirror/lang-javascript supports JSX
**Confidence:** CONFIRMED
**Evidence:** https://github.com/codemirror/lang-javascript

The `@codemirror/lang-javascript` package supports JSX through configuration options and includes an extension that automatically inserts JSX close tags. If MDX JSX regions can be identified by the markdown parser, the JavaScript/JSX parser can handle highlighting within those regions.

### Finding: Building an MDX language mode for CodeMirror 6 is achievable but requires custom work
**Confidence:** INFERRED
**Evidence:** Mixed-language parsing docs, markdown language, JavaScript language

The approach would be:
1. Use @codemirror/lang-markdown as the base parser
2. Use the `parseMixed()` API to detect JSX block regions (lines starting with `<ComponentName`) and delegate to the JavaScript/JSX parser
3. Handle import/export statements at the top of the file as JavaScript regions
4. Handle MDX expression syntax `{expression}` as JavaScript regions

This is conceptually similar to how HTML+JavaScript mixed parsing works, but requires custom integration since no off-the-shelf solution exists. Estimated complexity: moderate — the parser boundaries are well-defined (JSX blocks, import/export lines, curly-brace expressions).

### Finding: @uiw/react-codemirror is the standard React wrapper
**Confidence:** CONFIRMED
**Evidence:** https://github.com/uiwjs/react-codemirror

@uiw/react-codemirror is the most widely used React wrapper for CodeMirror 6 (14.2k GitHub stars). It supports all CodeMirror extensions and provides React-friendly APIs. This is what the MDX playground tutorial uses.

### Finding: codemirror-rich-markdoc demonstrates the "Obsidian-like" pattern for CodeMirror 6
**Confidence:** CONFIRMED
**Evidence:** https://github.com/segphault/codemirror-rich-markdoc

This plugin renders rich markdown inline in CodeMirror 6 using Markdoc for rendering. Two mechanisms:
1. CSS class hiding: wraps markdown syntax in `cm-markdoc-hidden` class, hiding formatting while preserving highlighting
2. Block widgets: replaces complex elements (tables, blockquotes, custom tags) with rendered HTML widgets

When cursor enters a rendered block, the widget disappears and source text is revealed. This is the "Obsidian Live Preview" pattern in CodeMirror 6.

Limitations: Only 3 commits, minimal maintenance. Known bugs with cursor positioning, image syntax, header spacing. Performance issue: recomputes on every operation rather than targeted updates. BUT: It proves the pattern is possible in CodeMirror 6 for custom markup languages (Markdoc tags are similar to MDX components).

### Finding: CodeMirror vs Monaco for MDX editing — CodeMirror is the better fit
**Confidence:** INFERRED
**Evidence:** https://sourcegraph.com/blog/migrating-monaco-codemirror, various comparison articles

| Dimension | CodeMirror 6 | Monaco |
|-----------|-------------|--------|
| Bundle size | ~300KB core (modular, tree-shakeable) | 5-10MB uncompressed |
| Mobile support | Excellent (primary CM6 motivation) | Poor (not designed for mobile) |
| Markdown/MDX | lang-markdown + extensible | No markdown mode |
| Customization | Highly modular, extension-based | Full IDE by default |
| Yjs integration | y-codemirror.next (maintained) | y-monaco (less mature) |
| Production use | Obsidian, HackMD, Sourcegraph | VS Code, GitHub.com |
| Architecture | Functional, immutable state | OOP, VS Code-derived |

CodeMirror is the better fit because: (1) much smaller bundle, (2) markdown language support exists, (3) modular architecture allows custom MDX extensions, (4) better mobile support for a web editor, (5) y-codemirror.next is more mature than y-monaco for Yjs collaboration. Monaco's advantage (TypeScript IntelliSense) is irrelevant for MDX editing.

---

## Gaps / follow-ups

* No working MDX language mode for CodeMirror 6 exists. Building one would require custom parser integration via parseMixed(). The feasibility is high but the work has not been done.
* The codemirror-rich-markdoc plugin proves the inline rendering pattern but is unmaintained. A production MDX editor would need a custom implementation.
