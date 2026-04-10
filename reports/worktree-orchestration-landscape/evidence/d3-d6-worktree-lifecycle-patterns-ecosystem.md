# Evidence: Worktree Lifecycle Patterns — Ecosystem Survey

**Dimension:** D3 (Git Worktree Mechanics) + D6 (Merge Problem) — cross-cutting lifecycle patterns
**Date:** 2026-04-03
**Sources:** Web search, OSS repos, official documentation

---

## Key sources referenced

- [pnpm Git Worktrees guide](https://pnpm.io/next/git-worktrees) — official March 2026 guide
- [pnpm issue #9935](https://github.com/pnpm/pnpm/issues/9935) — macOS APFS clonefile fallback
- [Bun Install internals](https://bun.com/blog/behind-the-scenes-of-bun-install) — clonefile/hardlink chain
- [Cline Worktrees docs](https://docs.cline.bot/features/worktrees) — `.worktreeinclude` pattern
- [Roo Code Worktrees docs](https://docs.roocode.com/features/worktrees) — `.worktreeinclude` pattern
- [cline/kanban](https://github.com/cline/kanban) — symlinks for gitignored files
- [Turborepo 2.8 worktree support](https://dasroot.net/posts/2026/03/monorepo-management-nx-turborepo-best-practices/) — shared task cache
- [Claude Code issue #26725](https://github.com/anthropics/claude-code/issues/26725) — stale worktrees
- [Claude Code issue #38287](https://github.com/anthropics/claude-code/issues/38287) — silent branch deletion
- [Claude Code issue #27753](https://github.com/anthropics/claude-code/issues/27753) — worktree auto-deleted with commits
- [GitLab Job Artifacts docs](https://docs.gitlab.com/ci/jobs/job_artifacts/) — `artifacts:when: on_failure`
- [Temporal Worker Shutdown](https://docs.temporal.io/encyclopedia/workers/worker-shutdown) — graceful shutdown model
- [Inngest Cancellation](https://www.inngest.com/docs/features/inngest-functions/cancellation) — cleanup events
- [K8s graceful shutdown](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace) — preStop + SIGTERM
- [Agent Situations](https://github.com/dave1010/agent-situations) — shell evaluation at prompt time
- [Cursor Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)
- [LangChain Context Engineering](https://docs.langchain.com/oss/python/langchain/context-engineering)

---

## Finding 1: pnpm global virtual store is the state-of-the-art solution for worktree node_modules

**Confidence:** CONFIRMED
**Evidence:** [pnpm Git Worktrees guide](https://pnpm.io/next/git-worktrees) (March 2026)

pnpm's `enableGlobalVirtualStore: true` setting shares a single content-addressable store across all worktrees. Each worktree's `node_modules` contains only symlinks. ~63% disk savings with 3 worktrees. `packageImportMethod: auto` attempts clonefile (CoW) first → hardlink → copy. Official guide published specifically for git worktree workflows.

**Bun** uses clonefile on macOS by default, hardlinks on Linux (fallback chain: clonefile → ioctl_ficlone → hardlink → copyfile). No cross-worktree shared store.

**Cline and Roo Code** implement `.worktreeinclude` — gitignore-style patterns specifying which ignored files to copy into worktrees. Flat copy, not CoW. **Cline Kanban** uses symlinks instead of copies.

**Turborepo 2.8** added git worktree support — shared task cache across worktrees, but `node_modules` delegated to the package manager.

**Implications:** `cp --reflink=auto` is a reasonable fallback, but pnpm's store is the proper solution. For Bun-based projects (like OpenBolts), `bun install` with its native clonefile support is already fast in fresh worktrees.

---

## Finding 2: Dirty worktree preservation is poorly implemented across the ecosystem

**Confidence:** CONFIRMED
**Evidence:** Claude Code issues #26725, #38287, #27753

**Claude Code** has known data loss bugs: cleanup checks uncommitted changes but NOT unpushed commits — branches with committed but unpushed work get silently deleted. Recoverable via `git fsck` until `git gc` runs. Multiple open issues.

**Cline** keeps source worktrees after merge (opt-in) but has no crash recovery.

**Codex** worktrees survive session termination by design (separate git checkouts). No automatic GC.

**CI/CD pattern:** GitLab's `artifacts:when: on_failure` / CircleCI's `store_artifacts when: always` is the standard for preserving outputs on failure.

**IDE pattern:** JetBrains Local History is the gold standard — automatic filesystem-level versioning independent of git, surviving crashes. VS Code has `files.hotExitBeforeClose`.

**Implications:** Safe worktree cleanup must check BOTH uncommitted changes AND unpushed commits (Claude Code only checks the former). JetBrains' approach of "always preserve, never auto-delete" is safest.

---

## Finding 3: No agent tool implements proactive branch collision detection

**Confidence:** CONFIRMED
**Evidence:** Full ecosystem survey — only Sandcastle does this

Git's built-in guard (`fatal: '<branch>' is already checked out`) is a hard error. Every agent tool either generates unique branch names (Claude Code: `claude/<session-id>`, Cline: generated defaults) or catches the git error reactively. Nobody does a proactive `git worktree list --porcelain` check before `git worktree add`.

**Implications:** Proactive check is ~10ms and produces a user-friendly error. Unique name generation avoids collisions by convention but doesn't protect against explicit `branch` mode conflicts.

---

## Finding 4: Stale worktree GC is weak across the ecosystem; Docker's tiered model is the reference

**Confidence:** CONFIRMED
**Evidence:** git-gc docs, Claude Code issues, Docker Build GC docs

**git:** `gc.pruneworktreesexpire` defaults to 3 months. `git worktree prune` cleans references to deleted directories. This is the only widely-deployed automatic GC.

**Claude Code:** startup-time cleanup with `cleanupPeriodDays` — but reported as unreliable. Nested worktrees form, VS Code sessions never trigger cleanup.

**Docker's tiered policy:** (1) ephemeral cache > 2.76GB or unused > 48h, (2) stale > 60d, (3) exceeding storage limit. Automatic via `docker system prune -f` in cron.

**Implications:** A robust worktree GC would use Docker's tiered approach: time-based (age) + size-based (disk usage) + reference-count (uncommitted/unpushed), with configurable grace periods.

---

## Finding 5: Temporal and K8s have the most mature signal handling patterns

**Confidence:** CONFIRMED
**Evidence:** Temporal Worker Shutdown docs, K8s best practices

**Temporal:** Graceful shutdown period → stop polling → let in-flight activities complete → cancel context after timeout. The most relevant model for agent orchestration — agents are like activities.

**K8s:** Two-phase: preStop hook (infrastructure cleanup) → SIGTERM (application cleanup) → grace period → SIGKILL. `terminationGracePeriodSeconds` default 30s.

**Node.js:** Process groups (`options.detached = true`, `process.kill(-pid)`) for killing child process trees. `child.kill()` only kills the direct child, not descendants.

**Inngest:** Cancellation emits a system event; cleanup implemented as a separate function triggered by that event. Cannot stop in-flight steps.

**Implications:** For OpenBolts: register SIGINT/SIGTERM handlers, use AbortController for in-flight work, use process groups for subprocess cleanup, implement a grace period before forced cleanup.

---

## Finding 6: Shell expression preprocessing is an emerging pattern with multiple implementations

**Confidence:** CONFIRMED
**Evidence:** Agent Situations repo, Cursor docs, LangChain docs

**[Agent Situations](https://github.com/dave1010/agent-situations)** (CC0 licensed) is the closest direct analog. YAML definitions with `run` type: shell command evaluated at prompt time, output injected as context. Philosophy: "Shell prompts render state for humans; Situations render state for agents."

**Cursor:** Dynamic Context Discovery — file pattern matching activates context rules. Agent Requested rules let the LLM decide relevance.

**LangChain:** `@dynamic_prompt` decorator for store-aware prompts, `InjectedToolArg` for runtime context injection.

**GitHub Actions:** `${{ }}` expressions evaluated at parse time from contexts (`github.*`, `env.*`, `secrets.*`).

**Terraform:** `data` sources resolve external state during `terraform plan`.

**Implications:** The pattern of "resolve dynamic context before prompt submission" is well-established across build/deploy tools. Sandcastle's `!`command`` inline syntax is novel but the concept is not. Agent Situations' YAML approach is more structured and composable.

---

## Negative searches

- Searched for proactive worktree collision detection in any agent tool besides Sandcastle → NOT FOUND
- Searched for reflink-aware worktree setup in any agent tool besides Sandcastle → NOT FOUND (pnpm's store approach is superior but operates at package manager level, not worktree level)
- Searched for agent-orchestration-specific signal handling libraries → NOT FOUND (everyone rolls their own from Node.js primitives)

---

## Summary: Ecosystem Maturity by Pattern

| Pattern | Maturity | Best-in-class | Gap for OpenBolts |
|---------|----------|---------------|-------------------|
| Worktree dependency setup | Mature | pnpm global virtual store | Bun's clonefile is already fast; pnpm is better for shared stores |
| Dirty preservation | Weak | Sandcastle (programmatic), JetBrains (always-preserve) | Check unpushed commits, not just uncommitted changes |
| Collision detection | Non-existent | Sandcastle only | Trivial to implement, nobody else bothers |
| Stale GC | Basic | git gc (3-month default) | Docker's tiered model is the reference design |
| Signal handling | Mature | Temporal (graceful period + activity completion) | Wire AbortController + process groups + grace period |
| Dynamic prompt context | Emerging | Agent Situations (YAML), Cursor (file patterns) | Could adopt Agent Situations' model or Sandcastle's inline syntax |
