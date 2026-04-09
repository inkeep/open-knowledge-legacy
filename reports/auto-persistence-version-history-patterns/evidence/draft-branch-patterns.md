# Evidence: Draft Branch Persistence Patterns (D6)

**Dimension:** D6 — Draft/experiment branch implementation
**Date:** 2026-04-08
**Sources:** git-worktree docs, WordPress/Contentful/Sanity/Strapi draft models, CodeRabbit worktree-runner

---

## Key sources referenced
- git-worktree documentation — https://git-scm.com/docs/git-worktree
- Sanity drafts model — https://www.sanity.io/docs/content-lake/drafts
- Contentful Preview API — https://www.contentful.com/developers/docs/references/content-preview-api/
- CodeRabbit git-worktree-runner — https://github.com/coderabbitai/git-worktree-runner

---

## Findings

### Finding: Four viable patterns exist, each with distinct trade-offs
**Confidence:** CONFIRMED
**Evidence:**

| Pattern | Isolation | Merge | Complexity | Best for |
|---------|-----------|-------|-----------|----------|
| Git worktree | Full filesystem | Git merge | High | Long-lived experiments |
| Standard branch | File-level (atomic switch) | Git merge | Medium | Short-lived drafts |
| Shadow copy | Directory-level | Manual | Low | Quick disposable edits |
| Hocuspocus document namespacing | CRDT-level | Application-level | Medium | Real-time co-editing in drafts |

**Implication:** For Open Knowledge, Hocuspocus document namespacing + standard git branches is the recommended combination for v1.

### Finding: Sanity's document ID prefix pattern is the closest CMS analog
**Confidence:** CONFIRMED
**Evidence:** Sanity uses `drafts.{documentId}` prefix for draft documents, bare `{documentId}` for published. Publishing copies from prefixed to bare. Also has `versions.{release-name}.{documentId}` for content releases.

**Implication:** The Hocuspocus document naming pattern (`drafts/my-experiment/article.md` vs `article.md`) directly mirrors Sanity's approach at the CRDT level.

### Finding: No CMS platform uses actual branching/merging — all use linear draft-to-published
**Confidence:** CONFIRMED
**Evidence:** WordPress: status field (`draft` → `publish`). Contentful: dual APIs. Sanity: prefix swap. Strapi: three statuses. None use version control branching.

**Implication:** Open Knowledge's git-branch-based drafts are fundamentally more powerful but also more complex than any CMS precedent. The CMS patterns inform UX vocabulary ("Draft", "Published") but not architecture.

### Finding: Git worktrees work well for AI agent workflows
**Confidence:** CONFIRMED
**Evidence:** CodeRabbit's git-worktree-runner automates worktree creation/cleanup for AI code review. VS Code and JetBrains support worktrees as separate workspaces. Each worktree must be on a unique branch.

**Implication:** Worktrees are viable for the TQ22 pattern (draft isolation). Each draft worktree would have its own Hocuspocus document namespace and file watcher.

---

## Gaps / follow-ups
- Worktree disk space impact for large KBs not measured
- Interaction between worktree-based drafts and the WIP ref pipeline needs implementation design
