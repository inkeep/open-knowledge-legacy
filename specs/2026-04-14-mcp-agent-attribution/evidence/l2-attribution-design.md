---
title: L2 Attribution Design — Contributor Accumulator
date: 2026-04-14
sources:
  - packages/server/src/persistence.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/shadow-repo.ts
---

# Evidence: L2 Attribution Design

## The debounce problem

L1 (CRDT → disk): fires after 2s Hocuspocus debounce. Writes .md file. Calls scheduleGitCommit().
L2 (disk → git): fires 30s after last L1 write. Snapshots content directory into WIP commit.

If Agent A writes at T=0 and Agent B writes at T=1s, both within the same L2 window, the
single WIP commit contains both agents' changes merged into the file. The git diff cannot
distinguish which bytes came from which agent.

## Why per-agent commits don't work

commitWip() snapshots the entire content directory. If two agents wrote to the same file within
one L2 window, committing twice (once per agent) produces two commits with identical diffs — 
misleading attribution. Agent A appears to have written Agent B's content.

## Chosen approach: commit message metadata

WIP commit stays attributed to `server` (honest — it's a combined snapshot).
Contributors listed in commit message body via structured `ok-contributors:` block.

### Accumulator design

Server-local Map populated at write time in API handlers, drained at L2 commit time:

```typescript
const pendingContributors = new Map<string, Map<string, string>>();
//                              docName → agentId → displayName
```

### Commit message format

```
WIP auto-save 2026-04-14T15:00:00Z

ok-contributors:
  agent-abc123 claude-code intro.md,setup.md
  agent-def456 cursor auth-flow.md
```

### Timeline flow

```
Agent A calls write_document
  → API handler writes to Y.Doc
  → recordContributor("intro.md", "agent-abc", "claude-code")
  → [2s] L1: writes intro.md to disk → scheduleGitCommit()

Agent B calls write_document
  → recordContributor("auth.md", "agent-def", "cursor")
  → [2s] L1: writes auth.md → scheduleGitCommit() (resets timer)

  → [30s silence]
  → L2: commitToWipRef()
    → reads pendingContributors
    → builds commit message with ok-contributors block
    → commits to shadow repo
    → clears pendingContributors
```

### Reader changes

shadow-log.ts extends git log format from `%H|%aI|%an|%s` to include `%b` (body).
Parses `ok-contributors:` block into new `contributors` field on ShadowCommit.
