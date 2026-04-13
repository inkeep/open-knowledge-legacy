---
title: "Bun Workspace ProseMirror-Model Deduplication"
description: "Root cause analysis and fix recommendations for prosemirror-model duplication in bun workspaces — 'looks like multiple versions of prosemirror-model were loaded' error when importing through workspace packages. Covers bun module resolution mechanics, ProseMirror instanceof detection, TipTap @tiptap/pm strategy, and fix approaches."
createdAt: 2026-04-13
updatedAt: 2026-04-13
subjects:
  - Bun
  - ProseMirror
  - TipTap
  - "@tiptap/pm"
topics:
  - module resolution
  - dependency deduplication
  - monorepo workspace
---

# Bun Workspace ProseMirror-Model Deduplication

**Purpose:** Diagnose why `MarkdownManager.serialize()` fails with "looks like multiple versions of prosemirror-model were loaded" in local bun worktrees (but not CI), and determine the architecturally correct fix.

---

## Executive Summary

The error is NOT about different versions — it's about **different physical module instances of the same version**. Bun's hoisted install mode (`configVersion: 0`) creates two separate copies of every package: one hoisted at `node_modules/<pkg>` and one in `node_modules/.bun/<pkg@version>/`. These have different inodes, producing different JavaScript module instances with different constructor references. ProseMirror's `Fragment.from()` uses `instanceof` to detect nodes from its own module instance — cross-instance nodes fail, triggering the error.

**Key Findings:**
- **Vite path (browser) is already fixed** — `resolve.dedupe` in vite.config.ts consolidates to one instance. No action needed.
- **Bun test runner path has no dedup mechanism** — `bun test` uses bun's native resolver, which doesn't honor Vite config. The two-copy layout can produce two instances.
- **Worktrees compound the issue** — worktrees share the parent's `node_modules`, where workspace symlinks point to the parent's source (not the worktree branch). `bun install` per-worktree is required.
- **The long-term fix is migrating to bun isolated installs** (`configVersion: 1`) which uses a pnpm-style symlink structure with a shared content-addressed store — one physical copy per version.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | Bun workspace module resolution mechanics | Deep | P0 |
| 2 | ProseMirror `instanceof` dedup patterns | Deep | P0 |
| 3 | TipTap `@tiptap/pm` re-export strategy | Moderate | P0 |
| 4 | Fix approaches and tradeoffs | Deep | P0 |
| 5 | Real-world TipTap/ProseMirror monorepo patterns | Moderate | P1 |

---

## Detailed Findings

### 1. Bun Workspace Module Resolution

**Finding:** Bun's hoisted install (`configVersion: 0`) creates two physical copies of every package — one hoisted, one in `.bun/` store — with different inodes.

**Evidence:** [evidence/bun-workspace-resolution.md](evidence/bun-workspace-resolution.md)

**The worktree compounding factor:** Git worktrees at `.claude/worktrees/X/` have no `node_modules`. Module resolution walks up to the parent repo's `node_modules`. Workspace symlinks there (`@inkeep/open-knowledge-core → ../../packages/core`) resolve to the parent's source, not the worktree's branch. This means:
1. Tests may load the wrong branch's source code
2. The dependency graph through workspace packages traverses a different module resolution tree than direct imports

**Why CI passes:** CI runs `bun install` in a clean checkout. All symlinks are fresh, all dependencies resolve consistently. The two-copy layout doesn't cause issues because the ESM loader (used by bun in production) deduplicates by URL — but this deduplication is fragile and depends on consistent resolution paths.

### 2. ProseMirror instanceof Detection

**Finding:** `Fragment.from()` detects duplication via `nodesBetween` heuristic — if an object has `.nodesBetween` but fails `instanceof Node`, it's from a different module instance.

**Evidence:** [evidence/prosemirror-instanceof.md](evidence/prosemirror-instanceof.md)

**Implications:** The error is about **module identity** (same physical file = same constructor), not **version identity** (same semver). Two copies of prosemirror-model@1.25.4 from different paths produce different `Fragment` and `Node` constructors.

### 3. TipTap @tiptap/pm Re-exports

**Finding:** `@tiptap/pm/model` is a pure pass-through re-export (`export * from "prosemirror-model"`). It does NOT bundle or vendor prosemirror-model.

**Evidence:** Confirmed by reading `@tiptap/pm/dist/model/index.js` in node_modules.

**Implications:** Deduplicating `prosemirror-model` in any resolution mechanism (Vite `resolve.dedupe`, bun overrides, etc.) automatically covers `@tiptap/pm/model`. The re-export adds a resolution hop but not a new copy. PR #94's import migration from `prosemirror-model` to `@tiptap/pm/model` was correct for consistency but doesn't directly fix the two-copy issue.

### 4. Fix Approaches

**Evidence:** [evidence/fix-approaches.md](evidence/fix-approaches.md)

| Fix | Scope | Risk | Status |
|-----|-------|------|--------|
| **Vite `resolve.dedupe`** | Browser runtime | None | Already applied (19 PM packages) |
| **Per-worktree `bun install`** | Worktree dev | Low | Missing — should be documented |
| **Migrate to isolated installs (configVersion: 1)** | All paths | Medium | Recommended — eliminates root cause |
| **Root `overrides` for PM** | Version pinning only | Low | Not useful (single version already) |
| **`parseSafe()` server fallback** | Server crash resistance | None | Applied in PR #101 |

**Recommended approach (ranked by priority):**

1. **Document per-worktree `bun install` requirement** in CLAUDE.md's "Worktree isolation" section. This is the immediate fix for all developers experiencing the issue.

2. **Migrate to `configVersion: 1` (isolated installs)** by running `bun install --config-version=1` and regenerating `bun.lock`. This switches to pnpm-style virtual store with symlinks — one physical copy per version. The lockfile format changes, requiring all developers to re-install. This is the root cause fix.

3. **`parseSafe()` on server paths** (already applied in PR #101) provides crash resistance regardless of dedup state — files with `{non-JS}` degrade gracefully instead of showing blank.

### 5. Real-World Patterns

**Finding:** TipTap's own monorepo uses pnpm (not bun). The `@tiptap/pm` package was created specifically for monorepo dedup. Novel (vercel/novel) uses a flat app, no monorepo. The bun + worktree combination is uncommon — most bun monorepos don't use git worktrees.

**Implications:** There is no established "bun monorepo + git worktrees + prosemirror" pattern to follow. The closest reference is pnpm's git worktrees documentation, which explicitly requires per-worktree `node_modules`.

---

## Limitations & Open Questions

### Not Fully Confirmed
- Whether `configVersion: 1` fully eliminates the issue for workspace package imports (needs testing after migration)
- Whether bun's ESM dedup-by-URL is deterministic in the two-copy hoisted layout, or if it's a race condition

### Out of Scope
- General bun vs node comparison
- ProseMirror internals beyond dedup
- Vite configuration beyond resolve.dedupe

---

## References

### Evidence Files
- [evidence/bun-workspace-resolution.md](evidence/bun-workspace-resolution.md) — Bun's hoisted install mechanics, worktree symlink behavior, known issues
- [evidence/prosemirror-instanceof.md](evidence/prosemirror-instanceof.md) — Fragment.from() detection, instanceof identity semantics
- [evidence/fix-approaches.md](evidence/fix-approaches.md) — Fix options ranked with tradeoffs

### External Sources
- [Bun Workspaces](https://bun.com/docs/pm/workspaces)
- [Bun Isolated Installs](https://bun.com/docs/pm/isolated-installs)
- [Bun 1.3.2 Changelog](https://bun.com/blog/bun-v1.3.2)
- [ProseMirror Issue #1070 — Multiple versions loaded](https://github.com/ProseMirror/prosemirror/issues/1070)
- [TipTap Issue #577 — Original report](https://github.com/ueberdosis/tiptap/issues/577)
- [TipTap @tiptap/pm Release Notes](https://tiptap.dev/blog/release-notes/new-pm-package-and-upgrade-guide-for-beta-210)
- [pnpm Git Worktrees](https://pnpm.io/11.x/git-worktrees)
