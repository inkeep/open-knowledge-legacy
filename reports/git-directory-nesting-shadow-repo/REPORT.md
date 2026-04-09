---
title: "Nesting a Shadow Bare Repo Inside .git/ — Safety Analysis"
description: "Can openknowledge's shadow attribution repo live at .git/openknowledge/history.git instead of .openknowledge/history.git? Investigates git internals, maintenance commands, transport behavior, worktree interaction, and tool precedents."
createdAt: 2026-04-08
updatedAt: 2026-04-08
subjects:
  - Git
  - Open Knowledge
topics:
  - git internals
  - repository layout
  - shadow repo architecture
---

# Nesting a Shadow Bare Repo Inside .git/ — Safety Analysis

**Purpose:** Determine whether `.git/openknowledge/history.git` is a safe location for openknowledge's shadow attribution journal, replacing the current design of `.openknowledge/history.git` in the project root (which requires a `.gitignore` entry).

---

## Executive Summary

**Yes, `.git/openknowledge/` is safe.** Empirical testing and tool precedent analysis confirm that custom subdirectories inside `.git/` are untouched by git maintenance commands (`gc`, `prune`, `fsck`, `repack`), invisible to the git transport protocol (`clone`, `push --mirror`, `fetch`), and established practice for production tools (git-lfs, git-annex, git-branchless).

The `gitrepository-layout` documentation does not provide a formal guarantee that unknown subdirs are safe, but the architectural evidence is strong: git operates on documented paths via specific code paths, not via recursive directory enumeration. No known git version has ever deleted or modified an unknown `.git/` subdirectory.

Moving from `.openknowledge/` to `.git/openknowledge/` eliminates the `.gitignore` requirement and is actually **better** for git worktree scenarios (shared shadow across worktrees vs. potentially conflicting per-worktree shadows).

**Key Findings:**
- **Safe from maintenance:** `git gc --aggressive --prune=now`, `git fsck`, `git repack` do not touch custom `.git/` subdirs (empirically confirmed).
- **Invisible to transport:** `git clone`, `git push --mirror` do not transfer custom dirs (empirically confirmed, consistent with protocol design).
- **Battle-tested pattern:** git-lfs (`.git/lfs/`, millions of users since 2015) and git-annex (`.git/annex/`, since 2010) establish the precedent.
- **Better for worktrees:** `.git/openknowledge/` is shared across worktrees via the main `.git/`; `.openknowledge/` in the working tree would create per-worktree copies.
- **One trade-off:** `rm -rf .git && git init` destroys the shadow. Acceptable because Save Version commits (the durable history) live in the project repo's commit DAG, not the shadow.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|---|---|---|
| 1 | Git internal directory structure | P0 | Deep |
| 2 | Maintenance command safety | P0 | Deep |
| 3 | Transport/clone behavior | P0 | Deep |
| 4 | Worktree interaction | P0 | Moderate |
| 5 | Tool precedents | P0 | Moderate |
| 6 | Failure modes | P0 | Moderate |
| 7 | Recommendation | P0 | Deep |

---

## Detailed Findings

### 1. Git Internal Directory Structure

**Finding:** Git's `.git/` layout is a documented, enumerated set of paths. Custom subdirectories are not part of the layout and git does not interact with them.

**Evidence:** [evidence/git-layout-docs.md](evidence/git-layout-docs.md)

The [gitrepository-layout](https://git-scm.com/docs/gitrepository-layout) documentation lists every path git manages: `HEAD`, `config`, `objects/`, `refs/`, `packed-refs`, `logs/`, `info/`, `hooks/`, `modules/`, `worktrees/`, `common/`, `index`, `shallow`, and legacy paths (`branches/`, `remotes/`).

The documentation makes **no statement** about custom subdirectories — neither guaranteeing safety nor warning against them. However, git itself already nests repo-like structures inside `.git/`:
- `.git/modules/<name>/` — full sub-repositories for gitlink submodules
- `.git/worktrees/<name>/` — per-worktree administrative state

This establishes that git's own architecture supports nested structures inside `.git/`.

**Implications:** Our `.git/openknowledge/history.git` follows a pattern git itself uses.

### 2. Maintenance Command Safety

**Finding:** No git maintenance command touches arbitrary `.git/` subdirectories. All operate on specific, documented paths.

**Evidence:** [evidence/empirical-tests.md](evidence/empirical-tests.md)

Empirically tested:

| Command | Touches custom dirs? | Tested |
|---|---|---|
| `git gc --aggressive --prune=now` | No | Yes — custom dir and contents intact |
| `git fsck` | No | Yes — no warnings about custom dirs |
| `git repack` | No | Operates only on `objects/pack/` |
| `git prune` | No | Operates only on `objects/` |
| `git clean` | No | Operates on working tree only, never inside `.git/` |
| `git maintenance run` | No | Delegates to gc/repack/pack-refs, all scoped |

Additionally: after creating shadow repo commits (with their own object database inside `.git/openknowledge/history.git/objects/`), running `git gc` on the parent did not touch the shadow's objects. The two object databases are completely isolated.

### 3. Transport/Clone Behavior

**Finding:** Custom `.git/` subdirectories are invisible to git's transport protocol. They are not cloned, pushed, fetched, or bundled.

**Evidence:** [evidence/empirical-tests.md](evidence/empirical-tests.md)

| Operation | Transfers custom dirs? | Tested |
|---|---|---|
| `git clone` | No | Custom dir absent in clone |
| `git clone --mirror` | No | Mirror is a bare repo of refs + objects only |
| `git push --mirror` | No | Mirror destination has no custom dirs |
| `git bundle` | No | Bundles contain refs + objects only |
| `git fetch` | No | Fetches refs + objects only |

**Critical safety confirmation:** `git push --mirror` does NOT push our shadow repo's refs or objects. The shadow's refs (`refs/wip/*`, `refs/checkpoints/*`) are inside `.git/openknowledge/history.git/refs/`, not `.git/refs/`. Git only pushes refs from its own ref namespace.

### 4. Worktree Interaction

**Finding:** `.git/openknowledge/` is **better** for worktrees than `.openknowledge/` in the working tree.

**Evidence:** [evidence/empirical-tests.md](evidence/empirical-tests.md), [evidence/failure-modes.md](evidence/failure-modes.md)

In a git worktree:
- `.git` in the worktree is a pointer file: `gitdir: /path/to/main/.git/worktrees/<name>`
- The main `.git/` directory is shared across all worktrees
- `.git/openknowledge/history.git` lives in the main `.git/` → shared across all worktrees

This means all worktrees share one shadow attribution journal — which is the correct behavior (attribution is per-project, not per-worktree).

By contrast, `.openknowledge/` in the project root would exist in the working tree. Each worktree checkout gets its own working tree, so each worktree would have its own `.openknowledge/` directory — potentially creating conflicting shadow repos.

**Caveat:** From a worktree, code must resolve the `.git` pointer file to find the main `.git/` directory:
```typescript
function resolveGitDir(projectRoot: string): string {
  const dotGit = resolve(projectRoot, '.git');
  if (statSync(dotGit).isFile()) {
    return readFileSync(dotGit, 'utf-8').trim().replace('gitdir: ', '');
  }
  return dotGit;
}
```

### 5. Tool Precedents

**Finding:** Multiple production-grade tools store data inside `.git/` without issues. This is an established, battle-tested pattern.

**Evidence:** [evidence/tool-precedents.md](evidence/tool-precedents.md)

| Tool | Path | Users/Age | Issues with git maintenance? |
|---|---|---|---|
| [git-lfs](https://git-lfs.com/) | `.git/lfs/` | Millions, since 2015 | None |
| [git-annex](https://git-annex.branchable.com/) | `.git/annex/` | Thousands, since 2010 | None |
| git-branchless | `.git/branchless/` | Growing, since 2021 | None |
| Various GUIs | e.g. `.git/sourcetreeconfig` | — | None |

Common characteristics across all tools:
1. Data is local-only (not transferred via clone/push)
2. Each tool manages its own cleanup/gc lifecycle
3. No interference from git's built-in maintenance
4. Fresh clones don't have the data — it's reconstructed on demand

### 6. Failure Modes

**Finding:** The only meaningful failure mode is `rm -rf .git && git init`, which destroys the shadow along with the project repo. This is acceptable given our architecture.

**Evidence:** [evidence/failure-modes.md](evidence/failure-modes.md)

| Failure mode | Impact on shadow | Acceptable? |
|---|---|---|
| `rm -rf .git && git init` | Shadow destroyed | Yes — Save Version commits are in the DAG, user explicitly chose to destroy repo |
| Fresh clone from remote | Shadow absent | Yes — `openknowledge init` recreates. Same behavior as `.openknowledge/` with `.gitignore` |
| `git worktree add` | Shadow shared (main `.git/`) | Better than `.openknowledge/` (avoids per-worktree conflicts) |
| Shallow/partial clone | No effect | Same as `.openknowledge/` |
| Bare repo conversion | Shadow moves with `.git/` | Very rare, harmless |
| Future git version collision | Theoretically possible | Extremely unlikely — git has never reused tool namespaces |

### 7. Recommendation

**Finding:** `.git/openknowledge/` is the recommended location. It's safer than `.openknowledge/` for worktrees, eliminates the `.gitignore` requirement, and follows established tool conventions.

**Trade-off summary:**

| Dimension | `.git/openknowledge/` | `.openknowledge/` (current) |
|---|---|---|
| Requires `.gitignore` entry | No | Yes |
| Survives `rm -rf .git` | No | Yes |
| Worktree behavior | Shared (correct) | Per-worktree (potentially conflicting) |
| Survives fresh clone | No | No (if `.gitignore`d) |
| Transport safety | Inherently invisible | Requires `.gitignore` to avoid committing |
| Tool precedent | git-lfs, git-annex | Some tools (e.g. `.husky/`) |
| Discovery | Hidden inside `.git/` | Visible in project root |
| Uninstall | Part of `.git/` (or explicit removal) | `rm -rf .openknowledge/` |

**The critical insight:** With our revised architecture where Save Version creates real project repo commits (D24), the shadow is an ephemeral attribution journal. Losing it is graceful degradation, not data loss. This makes the `rm -rf .git` failure mode acceptable — you're already destroying your project history when you do that.

**Init sequence for `.git/openknowledge/history.git`:**
```typescript
const shadowDir = resolve(projectGitDir, 'openknowledge/history.git');
mkdirSync(resolve(projectGitDir, 'openknowledge'), { recursive: true });
execSync(`git init --bare ${shadowDir}`);
// Unset core.bare before setting core.worktree to avoid warning
execSync(`GIT_DIR=${shadowDir} git config --unset core.bare`);
execSync(`GIT_DIR=${shadowDir} git config core.worktree ${projectRoot}`);
```

---

## Limitations & Open Questions

### Not Fully Covered
- **Windows behavior:** All tests run on macOS. Windows NTFS may have different behavior for nested git repos inside `.git/`. Deferred per NG11.
- **Git GUI behavior:** Some GUIs may display or interact with `.git/` contents differently. Not tested.

### Out of Scope
- Performance comparison of shadow repo operations at `.git/openknowledge/` vs `.openknowledge/`
- Impact on IDE git integrations (VS Code, JetBrains) that may inspect `.git/`

---

## References

### Evidence Files
- [evidence/empirical-tests.md](evidence/empirical-tests.md) — 7 empirical tests covering gc, clone, mirror, worktree, nested bare repo
- [evidence/git-layout-docs.md](evidence/git-layout-docs.md) — gitrepository-layout documentation analysis
- [evidence/tool-precedents.md](evidence/tool-precedents.md) — git-lfs, git-annex, git-branchless precedent analysis
- [evidence/failure-modes.md](evidence/failure-modes.md) — failure mode analysis and comparison

### External Sources
- [gitrepository-layout documentation](https://git-scm.com/docs/gitrepository-layout) — Official git repo structure docs
- [gitrepository-layout source](https://github.com/git/git/blob/master/Documentation/gitrepository-layout.adoc) — Git source repository
- [Git LFS](https://git-lfs.com/) — Large file storage, uses `.git/lfs/`
- [git-annex](https://git-annex.branchable.com/) — Content-addressed file management, uses `.git/annex/`
