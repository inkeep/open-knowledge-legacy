# Evidence: Web-to-Markdown Conversion Fidelity

## Sources
- [Turndown GitHub](https://github.com/mixmark-io/turndown)
- [Turndown GFM Plugin](https://github.com/mixmark-io/turndown-plugin-gfm)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Readability Algorithm Analysis](https://webcrawlerapi.com/blog/mozilla-readability-algorithm-readabilityjs)
- [PDF-to-Markdown Deep Dive](https://jimmysong.io/blog/pdf-to-markdown-open-source-deep-dive/)

## What Gets Lost in HTML-to-Markdown

| Content Type | Outcome |
|-------------|---------|
| **Complex tables** (merged cells, rowspan, nested) | Degraded or raw HTML fallback. Turndown GFM plugin has colspan but NOT rowspan. |
| **Interactive elements** (forms, widgets) | Stripped entirely |
| **CSS layouts** (multi-column, grid, flexbox) | Linearized to single column |
| **iframes/embeds** | Typically stripped by clippers |
| **JS-rendered content** (SPAs, React) | Content never seen by clipper |
| **Footnotes** | Work in Obsidian reading view; [broken in Live Preview](https://forum.obsidian.md/t/footnotes-are-not-rendered-in-live-preview-mode/75904) |
| **Math/LaTeX** | Defuddle handles well; most other tools lose it |
| **`<details>/<summary>`** | Flattened to plain text |
| **Image maps, canvas, video/audio** | Dropped or fallback text |

## Turndown Library Limitations

- **Aggressive escaping**: Regex-based, produces unnecessary backslashes
- **Tables without `<thead>`**: Fall back to raw HTML ([Issue #89](https://github.com/domchristie/turndown/issues/89))
- **Tables with complex elements** (e.g., `<h5>` headers): Left as HTML ([Joplin #9885](https://github.com/laurent22/joplin/issues/9885))
- **Nested tables**: Not GFM-converted
- **Multi-line cell content**: Collapsed to single lines
- **Non-Markdown elements**: Text content only, HTML structure dropped
- **Whitespace issues**: Non-ASCII whitespace breaks inline formatting
- **No semantic preservation**: `<article>`, `<nav>`, `<aside>`, `<details>` all flattened

## Mozilla Readability Failure Modes

The content extraction layer (runs before Turndown):

1. **Not enough text**: List pages, galleries, short announcements
2. **Too many links**: Navigation outscores actual content
3. **Fragmented content**: Articles split across many small blocks
4. **Malformed DOM**: Bad nesting → wrong container scored
5. **Heavy chrome**: Header/sidebar has more text than article
6. **JavaScript apps**: Empty HTML shells
7. **`isProbablyReaderable()`** explicitly described as producing "both false positives and false negatives"

**Core tradeoff**: Too aggressive cleanup → lost text. Too soft → junk retained. Heuristics are brittle.

## Obsidian-Flavored Markdown Extensions (beyond GFM)

| Feature | Syntax | Standard? |
|---------|--------|-----------|
| Wikilinks | `[[note]]` | Obsidian-specific |
| Block references | `[[note#^blockid]]` | Obsidian-specific |
| Embeds | `![[note]]` | Obsidian-specific |
| Callouts | `> [!type]` | Obsidian-specific (13+ types) |
| Math (inline/block) | `$...$` / `$$...$$` | LaTeX |
| Mermaid diagrams | ` ```mermaid ` | Widely supported |
| Highlights | `==text==` | Not standard |
| Comments | `%% comment %%` | Obsidian-specific |
| YAML frontmatter | `---` block | Widely supported |

**Web Clipper does NOT produce Obsidian-specific extensions** — output is standard GFM. Wikilinks, callouts, etc. must be added post-clip.

## Image Handling

- **Default**: External URL references (`![alt](https://...)`) — require internet, break on removal
- **Local download**: Requires Local Images / Local Images Plus plugin as post-processing
- **Supported formats**: .avif, .bmp, .gif, .jpeg, .jpg, .png, .svg, .webp
- **SVG**: Static rendering, scripting sanitized
- **Animated GIFs**: Supported
- **Responsive images**: `<picture>/<srcset>` collapsed to single URL
- **Captions**: HTML `<figure>/<figcaption>` → image + emphasized text (semantic meaning lost)

## PDF-to-Markdown Quality

| Tool | Strengths | Weaknesses |
|------|-----------|------------|
| **MinerU** | Best formula recognition, LaTeX output, table HTML preservation | High resource usage, GPU recommended |
| **Marker** | Good structure, 95.67% accuracy benchmark | Typos on fuzzy scans, weaker complex tables |
| **Mathpix** | Gold standard formula recognition | Commercial (paid), 86.43% broader accuracy |
| **MarkItDown** (Microsoft) | Simple, multi-format | Plain text only, no heading levels |

Obsidian plugins: Marker PDF to MD, pdf2md (Mistral OCR), PDF Folder to Markdowns, PDFMD.

## Content Type Fidelity Spectrum

| Content Type | Estimated Fidelity | Key Losses |
|-------------|-------------------|------------|
| Blog posts, essays | 90-95% | Minor formatting |
| Documentation | 85-90% | Tabs, interactive examples |
| Wikipedia | 80-85% | Infoboxes, complex tables |
| Academic papers (HTML) | 70-80% | Math, citation structure |
| Academic papers (PDF) | 60-80% | Varies wildly by tool |
| Twitter/X | 40-60% | Threading, media, auth required |
| Reddit | 40-60% | Comment threading, auth barriers |
| News (no paywall) | 80-90% | Minor |
| News (paywall) | 0-30% | Depends on browser access |
| GitHub READMEs | 90-95% | Relative links break |
| SPAs/JS-heavy | 0-40% | Content invisible without rendering |

## Obsidian Rendering Quirks

- **HTML-in-Markdown**: Obsidian does NOT render markdown syntax inside HTML elements. `<div>**bold**</div>` → literal asterisks.
- **HTML sanitization**: `<script>` blocked. Supported: `<u>`, `<s>`, `<span>`, `<div>`, `<iframe>` (sandboxed), tables.
- **MathJax**: Equations randomly stop rendering; inconsistencies when switching notes; breaks when mixed with lists.
- **Mermaid**: Bundles v11.4 (arrow rendering bugs fixed in 11.5+). Fails on iOS <17. PDF export fails.
- **Footnotes**: Reading view only. Not in Live Preview, callouts, or tables.

## Key Insight for Karpathy Workflow

Karpathy's workflow **tolerates imperfect raw capture** because the LLM is the reader, not a human requiring pixel-perfect fidelity. Markdown provides "just enough structure — headings, emphasis, code fences — to give agents reliable parsing anchors."

For text-heavy web content (articles, docs, blog posts), the pipeline delivers **85-95% of meaningful information**. The biggest gaps are:
1. Content extraction (Readability) — heuristic, brittle
2. Pre-rendering (JavaScript) — SPAs invisible without headless browser
3. Not the markdown conversion itself
