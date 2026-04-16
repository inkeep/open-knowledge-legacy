---
"@inkeep/open-knowledge": minor
---
feat: CLI colorized output, boxed banner, and NO\_COLOR support

- Add colorized CLI output via picocolors with semantic color helpers (error, warning, success, info, dim, accent)
- Render Vite-style boxed startup banner using cli-boxes
- Full NO\_COLOR standard compliance: NO\_COLOR env var, FORCE\_COLOR env var, --no-color/--color CLI flags
- Clickable URLs in startup banner via OSC 8 hyperlinks (iTerm2, modern terminals)
- MCP stdout isolation preserved — diagnostics stay on stderr



feat: CLI colorized output, boxed banner, and NO\_COLOR support

- Add colorized CLI output via picocolors with semantic color helpers (error, warning, success, info, dim, accent)
- Render Vite-style boxed startup banner using cli-boxes
- Full NO\_COLOR standard compliance: NO\_COLOR env var, FORCE\_COLOR env var, --no-color/--color CLI flags
- Clickable URLs in startup banner via OSC 8 hyperlinks (iTerm2, modern terminals)
- MCP stdout isolation preserved — diagnostics stay on stderr
