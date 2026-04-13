# Evidence: Fix Approaches

**Dimension:** Fix approaches — overrides, exports maps, Vite resolve.dedupe, per-worktree install
**Date:** 2026-04-13
**Sources:** Vite docs, bun docs, repo investigation, TipTap community patterns

---

## Key files / pages referenced

- `packages/app/vite.config.ts` — existing `resolve.dedupe` configuration
- [Vite resolve.dedupe docs](https://vite.dev/config/shared-options#resolve-dedupe)
- [pnpm Git Worktrees guide](https://pnpm.io/11.x/git-worktrees)
- [TipTap @tiptap/pm release notes](https://tiptap.dev/blog/release-notes/new-pm-package-and-upgrade-guide-for-beta-210)

---

## Findings

### Finding: Vite resolve.dedupe already handles the browser path
**Confidence:** CONFIRMED
**Evidence:** `vite.config.ts` lists 19 prosemirror packages + react + yjs in `resolve.dedupe`. Browser runtime is fully deduplicated.

### Finding: Bun test runner path has NO equivalent dedup mechanism
**Confidence:** CONFIRMED
**Evidence:** `bun test` resolves modules via bun's native resolver, which does not honor Vite's `resolve.dedupe`. Two physical copies = two module instances.

### Finding: Per-worktree `bun install` is the correct fix for worktrees
**Confidence:** CONFIRMED
**Evidence:** pnpm's git worktrees documentation explicitly recommends per-worktree `node_modules`. Each worktree needs correct workspace symlinks pointing to its own branch's source files.

### Finding: Root `package.json` overrides can pin versions but don't fix physical dedup
**Confidence:** CONFIRMED
**Evidence:** Bun supports `overrides` (npm) and `resolutions` (Yarn). Only root-level overrides work ([Issue #14774](https://github.com/oven-sh/bun/issues/14774)). However, since only one version exists in the lockfile already, version pinning doesn't address the two-physical-copy issue.

### Finding: Bun isolated installs (configVersion=1) would eliminate the two-copy issue
**Confidence:** INFERRED
**Evidence:** [Bun 1.3.2 changelog](https://bun.com/blog/bun-v1.3.2) — isolated installs use pnpm-style symlink structure with a shared content-addressed store. Single physical copy per version. Migration requires lockfile regeneration.

---

## Recommended approach (ranked)

1. **Immediate:** Run `bun install` in each worktree (workaround, zero risk)
2. **Short-term:** Migrate to `configVersion: 1` isolated installs (eliminates root cause)
3. **Already done:** Vite `resolve.dedupe` (covers browser path)
4. **Not needed:** `overrides` for prosemirror-model (version pinning doesn't help, physical dedup is the issue)
