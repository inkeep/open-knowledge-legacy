# Evidence: Obsidian Editing Modes and LLM-Generated Content

## Live Preview Mode — Detailed Behavior

### What Renders vs What Stays Raw
Live Preview (CodeMirror 6, introduced v0.13) renders markdown inline, showing raw syntax only on the cursor's active line.

| Feature | Live Preview Behavior | Reading View Behavior |
|---|---|---|
| Tables | Render when cursor outside. LaTeX inside cells breaks (pipe conflicts) | Render correctly including LaTeX |
| Nested lists | Render inline; deep nesting (4+) has occasional indentation issues | Render correctly |
| Code blocks | Syntax highlighted via Prism.js (~300 languages); known bug where text after code block styled as code | Render correctly |
| LaTeX math | Renders via MathJax; jumpiness when editing near math blocks; `\biggr`/`\big` issues | Renders correctly |
| Footnotes | **Do NOT render** — show as raw `[^1]` text | Render fully with clickable links |
| Callouts | Render fully; LaTeX inside callouts does NOT render while cursor is inside | Render correctly |
| Mermaid | Renders inline when cursor outside block | Renders correctly |

### Key Forum Sources
- LaTeX in tables breaks Live Preview: https://forum.obsidian.md/t/markdown-table-with-latex-formulas-breaks-in-live-preview-looks-good-in-read-mode/37101
- Footnotes not rendered in Live Preview: https://forum.obsidian.md/t/footnotes-are-not-rendered-in-live-preview-mode/75904
- Footnotes in callouts fail: https://forum.obsidian.md/t/footnote-references-in-callouts-dont-display-correctly-in-live-preview/62784
- Callouts + LaTeX issue: https://forum.obsidian.md/t/callouts-admonitions-do-not-render-latex-in-live-preview/44594
- Math jumpiness: https://forum.obsidian.md/t/latex-preview-jumpiness/53612
- Math discrepancy LP vs Reading: https://forum.obsidian.md/t/discrepancy-between-handling-of-math-blocks-in-live-preview-and-reading-view/44319
- Code block rendering bug: https://forum.obsidian.md/t/markdown-rendering-all-text-treated-as-code-after-codeblock-in-live-preview/44903
- Nested markdown rendering: https://forum.obsidian.md/t/live-preview-mode-nested-markdown-immediate-rendering/67214
- LP vs Reading very different: https://forum.obsidian.md/t/live-preview-and-reading-mode-are-very-different/87552

## Source Mode
Pure CodeMirror 6 text editor. Syntax highlighting (bold/italic markers colored, headings sized, code blocks highlighted via Prism.js). No inline rendering. CM6 syntax highlighting stops after several hundred lines of code in a single code block.
- CodeMirror discussion: https://discuss.codemirror.net/t/syntax-highlighting-not-working-on-large-documents/7579

## Obsidian Markdown Flavor
CommonMark + GFM + Obsidian extensions:
- Wikilinks `[[]]`
- Embeds `![[]]`
- Callouts `> [!type]`
- Highlights `==text==`
- Comments `%%text%%`
- Block IDs `^id`
- YAML frontmatter properties

Sources:
- https://help.obsidian.md/obsidian-flavored-markdown
- https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/SKILL.md

## Common LLM-Generated Patterns That Break in Obsidian

| Pattern | Problem |
|---|---|
| HTML tags (`<div>`, `<details>`, `<summary>`) | Markdown inside HTML tags is NOT rendered — intentional design |
| Escaped newlines (`\n` literals) | LLMs streaming via SSE produce literal `\n` strings |
| Code fence wrappers (` ```markdown `) | LLMs wrap entire responses requiring cleanup |
| Standard markdown links `[text](file.md)` | Works but loses rename-tracking vs `[[file]]` wikilinks |
| LaTeX pipes in tables `$\|x\|$` | Breaks table parser |
| Non-CommonMark edge cases | Some tight list / lazy continuation behaviors differ |

Sources:
- No markdown inside HTML: https://forum.obsidian.md/t/no-markdown-inside-html-tags/26517
- Newline issues: https://yingjiezhao.com/en/articles/Solving-Markdown-Newline-Issues-in-LLM-Stream-Responses/
- Pipe rendering in tables: https://forum.obsidian.md/t/math-latex-wrong-pipe-vert-rendering-in-tables-in-live-preview/73704/3
- CommonMark compliance: https://forum.obsidian.md/t/obsidian-markdown-does-not-conform-to-commonmark/112726

## Best Mode for Reviewing LLM Output
**Reading View** is best for review — footnotes, complex tables with math, and nested callouts all render correctly. For editing/correcting, **Source Mode** to see and fix raw markdown directly.
