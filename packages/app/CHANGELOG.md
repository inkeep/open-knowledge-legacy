# open-knowledge-app

## 0.0.3

### Patch Changes

- @inkeep/open-knowledge-core@0.1.1
- @inkeep/open-knowledge-server@0.1.1

## 0.0.2

### Patch Changes

- 0918570: Sidebar + editor UX polish:

  - File/folder rows get a Copy Path context action with Full Path + Relative Path submenu, backed by a new loopback-gated `GET /api/workspace` endpoint.
  - Sidebar header gains an Expand All / Collapse All dropdown (click-to-open, tooltip on hover); per-folder subtree variants in the row context menu. Bulk mutations wrap in `startTransition` so the close animation stays 60fps while hundreds of rows materialize.
  - Agent-file basename (`AGENTS.md` / `CLAUDE.md` / `SKILL.md`, case-insensitive) renders a muted `Bot` badge on the right of the row, matching the symlink `Link2` style. Tailwind v4 trailing-`!` defeats the nested-row color-override rule.
  - Theme toggle System icon: `Contrast` (was `Monitor`). Sidebar collapse tooltip: state-aware `Hide Files` / `Show Files`. Capital Case on all menu labels.
  - Internal refactor: `FileTreeHandle` imperative ref replaces the prior `createTrigger` seq-counter + `useEffect` pattern — React 19 ref-as-prop.

- Updated dependencies [3eb50c2]
- Updated dependencies [07161e2]
- Updated dependencies [1f72b85]
- Updated dependencies [e8f4dd8]
- Updated dependencies [50a5d7f]
- Updated dependencies [12ee3d6]
- Updated dependencies [0918570]
- Updated dependencies [81e2503]
- Updated dependencies [29fc273]
  - @inkeep/open-knowledge-core@0.1.0
  - @inkeep/open-knowledge-server@0.1.0
