---
"@inkeep/open-knowledge": patch
---

feat: color graph nodes by directory path with adjustable depth

Graph nodes and sidebar folder icons are now colored by directory bucket using a shared path-to-color primitive in `@inkeep/open-knowledge-core`. A new depth control (↑/↓ buttons) in the graph panel header lets users dial coloring granularity from 0 (uniform) to 5 (deeply nested); the chosen depth persists to localStorage. In fullscreen mode (when the sidebar is hidden), a compact overlay legend shows the directory → color mapping.
