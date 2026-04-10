# Evidence: Image, Chart, and Rendering Capabilities in Obsidian

## Image Embedding
Two syntaxes:
- Wiki-style: `![[image.png]]` (default)
- Standard markdown: `![alt](path/to/image.png)`
- Toggle in Settings > Files & Links > "Use [[Wikilinks]]"
- Supported formats: PNG, JPG, GIF, SVG, WebP, BMP
- External URLs: `![](https://...)`

Source: https://forum.obsidian.md/t/correct-link-format-for-embedding-images/67352

## Image Sizing
- Width only: `![[image.png|500]]` (maintains aspect ratio)
- Width x height: `![[image.png|500x300]]`
- Standard markdown: `![alt|500](image.png)`

Source: https://forum.obsidian.md/t/resize-image/6517

## External Image Auto-Refresh (CRITICAL ISSUE)

**Obsidian caches rendered images in memory (Electron/Chromium). When an external script overwrites an image file, Obsidian does NOT auto-refresh the displayed image.**

Workarounds:
1. "Reload app without saving" command (Cmd+Shift+P)
2. Close and reopen the note
3. Restart Obsidian entirely
4. **Best for scripts**: Append cache-busting query param or use unique filename per generation (e.g., `plot_v2.png`), then update the link

This is a longstanding feature request with NO native solution as of April 2026.

Sources:
- Auto-refresh request: https://forum.obsidian.md/t/automatically-refresh-images-when-the-image-file-changes/45331
- Cache bug: https://forum.obsidian.md/t/cache-not-updated-after-image-modification/83112

## SVG Support
- File reference `![[diagram.svg]]`: Works
- Inline SVG (`<svg>` tags in markdown): Works in Reading Mode of same note but breaks when embedded in another note
- Known issues: SVG cropping, SVGs not rendering in Page Preview hover
- Plugin for improved SVG: https://github.com/BlueZeeKing/obsidian-svg

Sources:
- Inline SVG embedding issue: https://forum.obsidian.md/t/embedding-a-note-which-contains-an-inline-svg/55077
- SVG cropping: https://forum.obsidian.md/t/svg-rendering-cropped/24121

## Chart/Graphing Plugins

| Plugin | Basis | Downloads | Last Updated | LLM-Friendly? |
|---|---|---|---|---|
| Obsidian Charts | Chart.js | ~282K | ~2 yrs ago (v3.9.0) | Yes — YAML/JSON in code blocks |
| Obsidian Plotly | Plotly.js | Lower | v0.0.6 (2021) | Partial — JSON/YAML blocks |
| Charts View | D3.js-based | Moderate | Active | Yes — CSV/data-driven |
| Dataview + Charts | DataviewJS | Millions | Active | JS code blocks |

GitHub repos:
- Obsidian Charts: https://github.com/phibr0/obsidian-charts
- Obsidian Plotly: https://github.com/Dmytro-Shulha/obsidian-plotly
- Charts View: https://github.com/caronchen/obsidian-chartsview-plugin
- Dataview: https://github.com/blacksmithgu/obsidian-dataview

**For LLM-generated content**: Obsidian Charts is most practical — LLM outputs ` ```chart ``` ` YAML block that renders natively. For static matplotlib output, saving PNGs and embedding is simpler.

## LaTeX Math Rendering
- Engine: **MathJax** (not KaTeX) natively
- Inline: `$...$`
- Display: `$$...$$`
- Supports: fractions, matrices, integrals, Greek letters, align environments
- Custom macros via Extended MathJax plugin using `preamble.sty` in vault root
- LLM-generated math works well — most LLMs output standard LaTeX

Sources:
- Extended MathJax: https://www.obsidianstats.com/plugins/obsidian-latex
- KaTeX settings discussion: https://forum.obsidian.md/t/setting-options-for-katex-rendering/75190

## Callouts / Admonitions (Built-in)
Syntax:
```
> [!note] Title
> Content here
```
12 built-in types: `note`, `abstract`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`

- Foldable with `+`/`-` after type
- Custom types via CSS snippets
- Fully LLM-compatible

Source: https://help.obsidian.md/callouts

## Other Rendering Capabilities

| Feature | Support | Details |
|---|---|---|
| Mermaid diagrams | Built-in | No plugin needed |
| PlantUML | Plugin | Online server or local JAR; https://github.com/joethei/obsidian-plantuml |
| HTML | Partial | Basic HTML in Reading Mode; full via iframe plugins |
| iframe renderer | Plugin | https://github.com/natarslan/obsidian-iframe-renderer |
| Local HTML embed | Plugin | https://github.com/Poesy-Lab/obsidian-local-html-embed |
| D3.js | Plugin (experimental) | https://github.com/r-tae/obsidian-d3js |
| Execute Code | Plugin | Run Python/JS inline; https://github.com/twibiral/obsidian-execute-code |

Source for Mermaid: https://www.xda-developers.com/mermaid-best-feature-obsidian/

## Obsidian Publish Compatibility

| Feature | Works in Publish? |
|---|---|
| Images | Yes |
| LaTeX math | Yes |
| Mermaid diagrams | Yes |
| Callouts | Yes |
| Basic HTML | Yes |
| Community plugin content | NO |
| Charts, Plotly, PlantUML | NO |
| D3, Execute Code | NO |

For publishing with plugin content, alternatives: Quartz (https://quartz.jzhao.xyz/) or Hugo export.

Source: https://help.obsidian.md/publish/limitations
