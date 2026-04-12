---
name: AGENTS.md / CLAUDE.md convention across template repos
description: How ~/agents and ~/openbolts handle agent-onboarding docs at root and per-package
sources:
  - ~/agents/AGENTS.md, ~/agents/CLAUDE.md
  - ~/openbolts/AGENTS.md, ~/openbolts/CLAUDE.md
  - ~/openbolts/packages/* (no per-package files)
  - ~/agents/agents-api/, ~/agents/agents-manage-ui/ (no per-package files)
  - open-knowledge/init_spike/CLAUDE.md (the anomaly)
confidence: HIGH
---

# AGENTS.md / CLAUDE.md convention

## Pattern across both template repos

Both `~/agents` and `~/openbolts` use the same convention:

- **Single canonical `AGENTS.md` at the repository root** — real file, large (32K and 65K respectively)
- **`CLAUDE.md` at the repository root as a symlink** → `AGENTS.md`
- **No per-package `AGENTS.md` or `CLAUDE.md`** — verified by `ls` on multiple package dirs in both repos and by glob

```bash
# ~/agents
-rw-r--r--@ 1 ...  32674 Mar 29 22:37 /Users/edwingomezcuellar/agents/AGENTS.md
lrwxr-xr-x  1 ...      9 Feb 20 14:09 /Users/edwingomezcuellar/agents/CLAUDE.md -> AGENTS.md

# ~/openbolts
-rw-r--r--@ 1 ...  65893 Apr  7 05:59 /Users/edwingomezcuellar/openbolts/AGENTS.md
lrwxr-xr-x@ 1 ...      9 Feb 21 14:01 /Users/edwingomezcuellar/openbolts/CLAUDE.md -> AGENTS.md

# Per-package check (~/openbolts/packages/*/AGENTS.md, CLAUDE.md): NO MATCHES
# Per-package check (~/agents/agents-api/, agents-manage-ui/): NO MATCHES
```

## Current state in open-knowledge

```bash
# Repo root: NEITHER file exists
# ls: /Users/edwingomezcuellar/projects/open-knowledge/AGENTS.md: No such file or directory
# ls: /Users/edwingomezcuellar/projects/open-knowledge/CLAUDE.md: No such file or directory

# init_spike: CLAUDE.md only, as a real file (NOT a symlink), no AGENTS.md sibling
-rw-r--r--@ 1 ... 7679 Apr  8 11:52 init_spike/CLAUDE.md

# docs: NEITHER file exists
```

**Open-knowledge is the anomaly:**
- No root-level agent doc at all
- The only agent doc is `init_spike/CLAUDE.md` — a real file, not a symlink, not paired with an `AGENTS.md`
- This means agents that follow the AGENTS.md convention have nothing to read at the root, and Claude Code (which prefers CLAUDE.md) has to discover the nested file

## Migration target

Adopt the template convention:

1. Create `open-knowledge/AGENTS.md` as the canonical file
2. Create `open-knowledge/CLAUDE.md` as a symlink → `AGENTS.md`
3. Migrate the content from `init_spike/CLAUDE.md` into `AGENTS.md`:
   - Commands/dev cycle section — adapted to root-level workspace commands (turbo run, root install, per-package filters)
   - Architecture section — kept verbatim, paths updated from `src/...` to `packages/<editor-name>/src/...` if anything is path-qualified
   - Key files section — paths updated to `packages/<editor-name>/src/...`
   - Research references section — links rewritten from `../../reports/` to `./reports/` (root-relative)
4. Delete `init_spike/CLAUDE.md` (formerly `packages/<editor-name>/CLAUDE.md` after move)
5. **Optional (Q5):** Create a small `packages/<editor-name>/README.md` for code-specific architecture notes that don't belong in the cross-cutting AGENTS.md. The template repos don't do this — each has only the root file. Recommendation: don't create one unless there's content that doesn't fit.

## Symlink syntax

Both templates use a relative symlink at root:

```bash
cd /Users/edwingomezcuellar/projects/open-knowledge
ln -s AGENTS.md CLAUDE.md
```

This produces `CLAUDE.md -> AGENTS.md` (9 bytes — exact match for both template repos).

## Content sections to include in root AGENTS.md

Cross-cutting sections that apply to the workspace as a whole:
- Repo overview (open-knowledge purpose, scope)
- Workspace layout (`packages/editor`, `packages/docs`, `specs/`, `reports/`, etc.)
- Dev cycle (the commands a contributor or agent runs)
  - Root install
  - Root check (typecheck + lint + test + build via turbo)
  - Per-package commands via filter (`turbo run dev --filter=@open-knowledge/<editor-name>`)
  - Husky gates
- Verification rules (e.g. "before declaring done, run `bun run check`")
- Quality bar
- Research references (root-relative links)

Editor-specific sections (currently in init_spike/CLAUDE.md):
- CRDT observer sync architecture
- Presence & awareness
- API endpoints
- Key files

These editor-specific sections belong in root AGENTS.md as a "Packages" subsection — modeled on how openbolts's 65K AGENTS.md covers each package in its file. Verify openbolts's structure when actually writing AGENTS.md to align with the established style.
