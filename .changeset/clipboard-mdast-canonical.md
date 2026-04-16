---
"@inkeep/open-knowledge-core": minor
---

feat: canonical clipboard pipeline with mdast as the intermediate hub for all four clipboard paths (WYSIWYG copy/paste, Source copy/paste)

- **Shared conversion modules**: `htmlToMdast()` + `mdastToMarkdown()` in `markdown/html-to-mdast.ts` wrap `rehype-parse` → vendor-cleanup plugins → `rehype-remark`. `markdownToHtml()` + `mdastToHtml()` in `markdown/mdast-to-html.ts` wrap `remark-rehype` → custom-node handlers → `rehype-stringify`. Both views share the same conversion path — no per-view special cases.
- **Vendor cleanup plugins**: day-one panel of 9 rehype plugins under `markdown/rehype-plugins/` covering Google Docs, Word/MSO, Apple Cocoa (Notes/Mail/TextEdit), Gmail, Notion, VS Code, Google Sheets, Slack, and GitHub-rendered HTML. Each ships with a colocated test and a real captured paste sample as fixture. Registered in `cleanupPlugins` (also exported).
- **Custom-node mdast promotion**: `wikiLink`, `jsxComponent` (as `mdxJsxFlowElement`), `jsxInline` (as `mdxJsxTextElement`), and `rawMdxFallback` are first-class mdast types with dedicated serialization handlers — markdown side emits canonical `[[Page]]` / `<Component/>`, HTML side emits semantic elements with `data-*` round-trip metadata (e.g. wikiLink → `<a class="wiki-link" data-target data-anchor data-alias href="#slug">`). Replaces the prior `{type:'html',value:...}` passthrough.
- **FR-20 escape discipline**: raw source from MDX / fallback nodes lands in hast `text` nodes (auto-escaped by `rehype-stringify`), never hast `html`. Unit and fuzz tests assert no unescaped `<script>` in output.
- **Chunked Y.Text insertion**: `chunkedYTextInsert()` in `utils/chunked-insert.ts` splits large pastes (>500KB markdown) into ~50KB segments separated by `requestAnimationFrame` to keep UI responsive on iOS Safari and slower desktops.
- **New public exports from `@inkeep/open-knowledge-core`**: `htmlToMdast`, `mdastToMarkdown`, `htmlToMdastCleanupPlugins`, `HtmlToMdastOptions`, `markdownToHtml`, `mdastToHtml`, `chunkedYTextInsert`, `DEFAULT_CHUNK_THRESHOLD_BYTES`, `DEFAULT_CHUNK_SIZE_BYTES`, `InsertableYText`, `InsertableYDoc`, `ChunkedInsertOptions`.
- **Precedent**: clipboard pipeline architecture codified as precedent #15 in `AGENTS.md` — mdast-canonical hub, per-view hook mechanism (PM's `clipboardTextSerializer`/`clipboardSerializer` for WYSIWYG, `EditorView.domEventHandlers` for Source), first-class custom-node mdast types, full 9-plugin cleanup panel day-one.
