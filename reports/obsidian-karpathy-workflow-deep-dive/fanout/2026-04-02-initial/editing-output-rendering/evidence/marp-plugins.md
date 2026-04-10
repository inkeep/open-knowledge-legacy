# Evidence: Marp Presentation Plugins for Obsidian

## All Known Marp Plugins (April 2026)

| Plugin | GitHub | Downloads | Last Update | Stars | Score |
|---|---|---|---|---|---|
| Marp Slides (samuele-cozzi) | https://github.com/samuele-cozzi/obsidian-marp-slides | 32,149 | May 2024 (v0.45.6) | 183 | 56/100 |
| Marp (JichouP) | https://github.com/JichouP/obsidian-marp-plugin | 14,642 | Aug 2023 (v1.5.0) | 165 | 47/100 |
| Marp Extended (mhenze-exaring) | https://github.com/mhenze-exaring/marp-extended-plugin | Low | Dec 2025 (v0.2.2) | 3 | N/A |
| Marp Presentations (bjesuiter) | https://github.com/bjesuiter/obsidian-marp-presentations | Minimal | Early stage | ~few | N/A |

Sources for scores: https://www.obsidianstats.com/plugins/marp-slides, https://www.obsidianstats.com/plugins/marp

## Plugin Details

### Marp Slides (Most Popular)
- Preview in sidebar/split tab
- Export to HTML/PDF/PPTX/images
- Custom CSS themes
- Auto-reload preview
- Limitation: Not updated in ~11 months; 27 open issues

### Marp (JichouP)
- Requires Node.js for export (uses `npx`)
- Preview via ribbon button or command palette
- Exports PDF/PPTX/HTML
- Limitation: Last release Aug 2023 (~2.5 years stale)

### Marp Extended (Newest, Most Feature-Rich)
- Bidirectional editor sync
- Mermaid diagrams (cached SVG)
- Extended markdown syntax (`///` directives, `:::` containers, `==highlight==`)
- MathJax/KaTeX
- Standalone CLI
- Limitation: Only 3 stars; very early adoption; requires Chrome/Chromium for PDF/PPTX

## Capabilities Matrix

| Capability | Supported? | Notes |
|---|---|---|
| Preview slides in Obsidian | Yes | Sidebar, split pane, or tab |
| Export to PDF | Yes | Requires Node.js + Chrome/Chromium |
| Export to PPTX | Yes | Same requirement |
| Present directly from Obsidian | Partial | HTML preview; no true fullscreen presenter mode |
| Custom Marp themes | Yes | Load CSS from vault folders |
| Images in slides | Yes | Embedded as Base64 in exports |
| Code blocks | Yes | Standard Marp markdown |
| Math (LaTeX) | Yes | MathJax or KaTeX (Marp Extended) |

## Marp vs Slides Extended (reveal.js)

Slides Extended (successor to Advanced Slides):
- 29,210 downloads, score 62/100
- Actively maintained (March 2026, 235 stars)
- Uses reveal.js
- Supports animated transitions, fragments, speaker notes, interactive elements
- Source: https://www.obsidianstats.com/plugins/slides-extended

**Key differences**: Slides Extended has animations and interactivity; Marp has cleaner static output (PDF/PPTX) and simpler syntax. For LLM-generated static decks and PDF export, Marp is better.

## LLM Compatibility
Marp format is straightforward: standard markdown with `---` slide separators and YAML frontmatter (`marp: true`, `theme:`, `paginate:`). LLMs handle this reliably. Only edge case: Obsidian wikilinks `[[...]]` are not Marp syntax — LLM output should use standard markdown links.

## Karpathy Context
Karpathy mentions Marp for presentations from his knowledge base. The outputs get filed back into the wiki. Works well because Marp format is pure markdown. Friction point: Obsidian's Marp plugins are not as polished as standalone Marp CLI, so Karpathy may use Marp CLI or VS Code's Marp extension alongside Obsidian.

Source: https://deepakness.com/raw/llm-knowledge-bases/
