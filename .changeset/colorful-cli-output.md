---
"@inkeep/open-knowledge": minor
---

feat: CLI colorized output, boxed banner, and NO_COLOR support

- Add colorized CLI output via picocolors with semantic color helpers (error, warning, success, info, dim, accent)
- Render Vite-style boxed startup banner using cli-boxes
- Full NO_COLOR standard compliance: NO_COLOR env var, FORCE_COLOR env var, --no-color/--color CLI flags
- Clickable URLs in startup banner via OSC 8 hyperlinks (iTerm2, modern terminals)
- MCP stdout isolation preserved — diagnostics stay on stderr
