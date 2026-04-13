# Evidence: Bun Workspace Module Resolution

**Dimension:** Bun workspace module resolution mechanics
**Date:** 2026-04-13
**Sources:** bun docs, oven-sh/bun issues, local repo investigation

---

## Key files / pages referenced

- [Bun Workspaces docs](https://bun.com/docs/pm/workspaces)
- [Bun Overrides and resolutions](https://bun.com/docs/pm/overrides)
- [Issue #23725: Duplicate installations with different content hashes](https://github.com/oven-sh/bun/issues/23725)
- [Issue #8594: bun dedupe feature request](https://github.com/oven-sh/bun/issues/8594) — closed, not planned
- [Issue #14774: Overrides in sub-packages not applied](https://github.com/oven-sh/bun/issues/14774)
- [Bun 1.3.2 changelog: isolated installs](https://bun.com/blog/bun-v1.3.2)

---

## Findings

### Finding: Bun hoisted install (configVersion=0) creates two physical copies
**Confidence:** CONFIRMED
**Evidence:** Local repo — `node_modules/prosemirror-model` and `node_modules/.bun/prosemirror-model@1.25.4/node_modules/prosemirror-model` have different inodes (different physical files).

**Implications:** Two separate module instances can be loaded by the runtime, causing `instanceof` failures. This is the underlying mechanism for the "multiple versions" error even with a single version in the lockfile.

### Finding: Worktrees inherit parent node_modules
**Confidence:** CONFIRMED
**Evidence:** Worktrees at `.claude/worktrees/X/` have no `node_modules`. Module resolution walks up to the parent repo's `node_modules`. Workspace symlinks (`node_modules/@inkeep/open-knowledge-core → ../../packages/core`) point to the parent's source, not the worktree's.

**Implications:** Tests in worktrees may load the wrong version of workspace packages. Running `bun install` per-worktree is required.

### Finding: `bun dedupe` does not exist
**Confidence:** CONFIRMED
**Evidence:** [Issue #8594](https://github.com/oven-sh/bun/issues/8594) — closed as "not planned".

---

## Gaps / follow-ups

- Bun isolated installs (configVersion=1) may resolve the two-copy issue but requires lockfile migration
