---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-core": patch
---

fix(outline): skip `#` comments inside fenced code blocks when extracting headings

Previously, `extractHeadings` scanned line-by-line with a naive ATX regex and counted any `# …` as a heading — including lines inside ` ```yaml `, ` ```bash `, or ~~~ code blocks. TipTap's WYSIWYG DOM correctly renders those as code, so the outline's heading list grew one entry longer than the DOM, and every click after the first fenced `#` scrolled to the *next* real heading instead of the intended one (most visibly: clicking "9) Risks / unknowns" in a spec with a YAML fence landed on "10) Decision Log").

The source-mode outline click handler had the symmetric bug — its own line scan also double-counted fenced `#` lines.

Both now delegate to a shared `createCodeFenceTracker` helper in core that follows CommonMark §4.5 fence semantics (3+ backticks or tildes, ≤3 leading spaces, closing fence matches opening char and length, no closing info string).
