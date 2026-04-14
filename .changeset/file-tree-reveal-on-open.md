---
"@inkeep/open-knowledge": patch
---

fix: file sidebar reveals the active file on navigation

When the active document changes from any entry point (graph click, direct URL, wikilink, rename, browser back/forward), the file sidebar now expands ancestor folders and scrolls the active row into view. Expansion is recomputed per render as `(ancestors ∪ userExpanded) \ userCollapsed`, so a user's manual collapse of the active file's folder sticks until they navigate elsewhere. Adds `aria-current="page"` on the active row and roving tabindex for keyboard access; no focus steal.
