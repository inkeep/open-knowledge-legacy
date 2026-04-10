# Evidence: Obsidian Web Clipper Technical Analysis

## Source
- GitHub: [obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper)
- Docs: [help.obsidian.md/web-clipper](https://help.obsidian.md/web-clipper)
- Defuddle: [github.com/kepano/defuddle](https://github.com/kepano/defuddle)
- Blog: [stephango.com/obsidian-web-clipper](https://stephango.com/obsidian-web-clipper)

## Architecture

The Web Clipper is an open-source browser extension with a 3-stage pipeline:

1. **Extraction** — Uses Defuddle (purpose-built by kepano, replaces Mozilla Readability) for content extraction plus CSS selectors, Open Graph data, and JSON-LD schema.org metadata.
2. **AI Processing (optional)** — "Interpreter" feature sends prompt variables to configurable LLM providers (Anthropic, OpenAI, Gemini, Azure OpenAI, Ollama) for extraction/summarization.
3. **Template Processing** — Variables resolved, filter chains applied, final markdown rendered.

### Content Transfer Mechanism
- Dual-channel: `obsidian://new` URI carries metadata; system clipboard carries full note body.
- URI length limited to 2,000-8,000 chars depending on browser/OS.
- "Legacy Mode" encodes everything in URI (~2,000 char limit).
- Requires Obsidian 1.7.2+ for long content on Windows/Edge.
- **Limitation**: Temporarily overwrites user's clipboard during clip.

### Highlighter Subsystem
- Persistent highlights stored in browser IndexedDB.
- Survive browser sessions — highlights reappear on revisit.
- Accessible via `{{highlights}}` template variable.
- Three modes: inline (`==highlight==`), replacement (list), standalone.

## Output Format

- Standard GFM markdown with YAML frontmatter.
- Filename fully configurable via template (`{{title}}` default, supports `|safe_name` filter).
- Note location configurable per template (static folder like `Clippings/` or dynamic like `{{domain}}/`).
- Three creation modes: new note, append to existing, add to daily note.

## Metadata Variables (5 categories)

| Category | Examples | Access Method |
|----------|----------|---------------|
| **Preset** | `{{title}}`, `{{url}}`, `{{author}}`, `{{published}}`, `{{content}}`, `{{fullHtml}}`, `{{words}}` | Auto-extracted |
| **Meta** | `{{meta:property:og:title}}`, `{{meta:name:description}}` | HTML meta tags |
| **Schema.org** | `{{schema:@Article:datePublished}}`, `{{schema:author}}` | JSON-LD structured data |
| **Selector** | `{{selector:h1}}`, `{{selectorHtml:.main-content}}` | CSS selectors |
| **Prompt** | `{{"a summary of the page"}}`, `{{"list of key arguments"}}` | LLM-powered (requires Interpreter) |

## Template System

- JSON-based templates with: `schemaVersion`, `name`, `behavior`, `triggers`, `noteNameFormat`, `path`, `properties`, `noteContentFormat`, `context`.
- **50+ built-in filters** with chainable pipe syntax: `{{variable|filter1|filter2}}`.
- **Auto-trigger matching**: URL patterns (prefix or regex) or schema.org type matching.
- Community repositories: [obsidian-community/web-clipper-templates](https://github.com/obsidian-community/web-clipper-templates), [kepano/clipper-templates](https://github.com/kepano/clipper-templates).

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome, Edge | Full support |
| Firefox (desktop + Android) | Full support |
| Safari (macOS, iOS, iPadOS) | Supported, some iOS bugs ([#597](https://github.com/obsidianmd/obsidian-clipper/issues/597)) |
| Brave, Arc, Orion | Works via Chrome Web Store |
| Vivaldi, Opera | Inconsistent behavior reported |

## Clipping Modes

1. **Article extraction** (default) — Defuddle extracts main content (`{{content}}`)
2. **User selection** — `{{selection}}` / `{{selectionHtml}}`
3. **Highlights** — persistent, accumulative across visits
4. **Full page HTML** — `{{fullHtml}}`
5. **CSS selector targeting** — `{{selector:cssSelector}}`

## Defuddle vs Mozilla Readability

Defuddle is explicitly designed as a Readability replacement:
- "More forgiving, removes fewer uncertain elements"
- Purpose-built standardization for code blocks (detects `pre > code`, strips highlighting spans)
- Math/LaTeX: Detects MathJax, KaTeX, MathML → standardized MathML with `data-latex` attribute
- Footnotes: Rewrites to standardized ordered list format
- Extracts more metadata including schema.org data

## Critical Limitations

1. **No local image download** — Images remain as external URLs ([Issue #37](https://github.com/obsidianmd/obsidian-clipper/issues/37)). Workaround: Local Images Plus plugin.
2. **Code block language misidentification** — ([Issue #405](https://github.com/obsidianmd/obsidian-clipper/issues/405))
3. **Twitter/X clipping fails** — Only captures banner image ([Issue #676](https://github.com/obsidianmd/obsidian-clipper/issues/676))
4. **Reddit content truncation** — Stops at first link in some cases
5. **Complex HTML tables** — Merged cells, nested tables degrade (inherent markdown limitation)
6. **Multi-column layouts** — Linearized to single column
7. **Clipboard-based transfer** — Temporarily overwrites user clipboard
8. **No offline clipping** — Requires loaded browser page
9. **Highlights not synced across browsers/devices** — IndexedDB is per-browser

## Karpathy Workflow Relevance

**Strengths for raw ingest:**
- Template system enables consistent, structured capture with rich metadata
- Defuddle handles math/LaTeX well (critical for technical content)
- AI Interpreter can extract structured data at clip time
- CSS selector targeting enables site-specific templates

**Gaps for raw ingest:**
- No image download means raw sources have fragile external dependencies
- No batch/programmatic clipping — each page must be clipped manually
- Complex content types (Twitter, Reddit, SPAs) have poor support
- No API for automated ingest pipelines
