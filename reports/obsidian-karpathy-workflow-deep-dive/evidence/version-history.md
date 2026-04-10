# Evidence: Git Integration Plugins for Obsidian

## Obsidian Git (Primary Plugin)

### Vital Statistics
| Metric | Value |
|--------|-------|
| GitHub Stars | 10,200+ |
| Total Downloads | 2,300,000+ |
| Recent Downloads (30d) | ~66,000 |
| Repository | [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) |
| Original Author | denolehov |
| Current Maintainer | Vinzent03 (since March 2021) |
| Documentation | [Git Documentation (Obsidian Publish)](https://publish.obsidian.md/git-doc/Start+here) |

**Source:** [GitHub — Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git)
**Source:** [ObsidianStats — Git plugin](https://www.obsidianstats.com/plugins/obsidian-git)

### Core Features

#### Auto-Commit & Sync
- Configurable auto commit-and-sync interval (recommended: 10-15 minutes)
- "Auto commit-and-sync after stopping file edits" trigger
- Auto-pull on Obsidian startup
- Commit on close (via settings)
- Submodule support (desktop only)

#### Source Control View
- Stage/unstage individual files
- Commit with message directly in Obsidian
- View changed, staged, and untracked files
- Visual distinction between file states

#### Diff View
- Unified diff view: added, deleted, modified lines
- Split diff view: side-by-side comparison
- In-editor gutter signs: added, modified, deleted lines/hunks (desktop only)
- Stage and reset changes directly from gutter signs
- Commands to navigate between hunks
- Open from source control view or via command palette

#### History View
- Browse commit logs
- See commit message, author, date, changed files per commit
- Navigate through repository history

### Platform Support
| Platform | Status | Notes |
|----------|--------|-------|
| Windows | Full | Recommended |
| macOS | Full | Recommended |
| Linux | Full | Avoid Snap/Flatpak; use AppImage |
| Android | Experimental | Highly unstable; uses isomorphic-git |
| iOS | Experimental | Highly unstable; uses isomorphic-git |

### Mobile Limitations
- No SSH authentication
- Limited repository size (memory constraints)
- No rebase merge strategy
- No submodules
- Risk of crashes / buffer overflow on resource-constrained devices

**Source:** [GitHub — Vinzent03/obsidian-git README](https://github.com/Vinzent03/obsidian-git)

### Merge Conflict Handling
- Conflict files created during pull operations
- Users must resolve conflicts manually (edit conflict markers in source mode)
- No visual merge conflict resolution UI inside Obsidian
- Feature request for better conflict handling exists (Issue #803)
- Workaround: custom git merge drivers (e.g., for Readwise integration)

**Source:** [GitHub — obsidian-git Issue #803 — Conflict Handling](https://github.com/Vinzent03/obsidian-git/issues/803)
**Source:** [Charles Desneuf — Solving Obsidian + Readwise Merge Conflicts](https://blog.charlesdesneuf.com/articles/solving-obsidian-readwise-merge-conflicts-with-a-custom-git-driver/)

## Version History Diff Plugin

### Overview
- By kometenstaub
- Adds diff view for: Obsidian Sync versions, File Recovery snapshots, Git commits
- Line-by-line or side-by-side views (configurable)
- Git: click to copy commit hash (shift-click for full hash)
- Adds command to open Obsidian's native Sync history view

**Source:** [GitHub — kometenstaub/obsidian-version-history-diff](https://github.com/kometenstaub/obsidian-version-history-diff)

## Edit History Plugin

### Overview
- By antoniotejada
- Automatic per-note edit history in compressed `.edtz` files
- Activity calendar + dropdown for browsing edits
- Configurable frequency, size, and age limits
- History files auto-update on note rename/delete

**Source:** [GitHub — antoniotejada/obsidian-edit-history](https://github.com/antoniotejada/obsidian-edit-history)

## Version Control Plugin

### Overview
- Intentional per-note snapshots with meaningful names
- In-file branching (not Git branches)
- Advanced side-by-side diffs
- Timeline search and writing stats
- Optional auto-saves as safety net
- All local, no external dependencies

**Source:** [ObsidianStats — Version Control plugin](https://www.obsidianstats.com/plugins/version-control)

## Auto Git Sync (Alternative)

### Overview
- Lightweight alternative by alavna
- Auto-commits, pushes, and pulls vault via git
- Simpler than Obsidian Git; fewer features

**Source:** [GitHub — alavna/obsidian-auto-git-sync](https://github.com/alavna/obsidian-auto-git-sync)

## Karpathy Workflow Implications

| Aspect | Assessment |
|--------|-----------|
| Git as version control | Best option for tracking LLM changes; full commit history is permanent |
| Auto-commit frequency | 10-15 min intervals mean LLM bursts could span multiple commits or miss some |
| Agent attribution | Git commit messages CAN encode agent vs human (with discipline) |
| Diff review | Strong in-Obsidian diff capabilities for reviewing agent output |
| Revert granularity | Full Git power: revert files, commits, lines — but requires Git knowledge |
| Merge conflicts | No visual resolution in Obsidian; must use external tools or source mode |
| Mobile support | Weak; LLM wiki workflow is desktop-only for practical purposes |
