---
"open-knowledge-app": patch
"@inkeep/open-knowledge-server": patch
---

Sidebar + editor UX polish:

- File/folder rows get a Copy Path context action with Full Path + Relative Path submenu, backed by a new loopback-gated `GET /api/workspace` endpoint.
- Sidebar header gains an Expand All / Collapse All dropdown (click-to-open, tooltip on hover); per-folder subtree variants in the row context menu. Bulk mutations wrap in `startTransition` so the close animation stays 60fps while hundreds of rows materialize.
- Agent-file basename (`AGENTS.md` / `CLAUDE.md` / `SKILL.md`, case-insensitive) renders a muted `Bot` badge on the right of the row, matching the symlink `Link2` style. Tailwind v4 trailing-`!` defeats the nested-row color-override rule.
- Theme toggle System icon: `Contrast` (was `Monitor`). Sidebar collapse tooltip: state-aware `Hide Files` / `Show Files`. Capital Case on all menu labels.
- Internal refactor: `FileTreeHandle` imperative ref replaces the prior `createTrigger` seq-counter + `useEffect` pattern — React 19 ref-as-prop.
