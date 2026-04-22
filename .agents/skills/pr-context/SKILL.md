---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — implement/github-sync vs main |
| **Author** | miles-kt-inkeep |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `5a7478eeb59a2bef5209d568e214e84c3b99f1c6` |
| **Size** | 30 commits · +8105/-46 · 64 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
76b20dc [US-001] URL parser + GitHub app config + sync/github config schema
de2e948 [US-002] Token store with OS keychain + file fallback
e8b3e70 [US-003] Add 5-class git error taxonomy with classifyGitError
e8125a7 [US-004] Add gh detection + auth resolution chain (Tiers A/B/C/none)
8f3e448 [US-005] Add git credential helper subcommand (auth git-credential get)
922e003 [US-006] Add Device Flow auth + auth login subcommand
2aa4f65 [US-007] Add auth status/repos/signout/pat subcommands + @octokit/rest
e8676cb [US-008] Add clone command with progress, auth injection, and auto-init
ab4f6e2 [US-009] Add GitHandle factory + parentGitMutex (D32 serialization)
eea54a0 [US-010] Add HEAD-drift check to standalone.ts (FR11)
83d7726 [US-011] Add SyncEngine state machine + wire into createServer lifecycle
11a5f17 [US-013] SyncEngine push cycle: squash-before-push + content-scope
4052d11 [US-014] Add ConflictStore — conflict persistence + resolution logic
4efb94a [US-015] SyncEngine conflict + error handling integration
637d0b5 [US-016] SyncEngine state persistence + restart recovery
43dc94f [US-017] Git identity resolution chain (FR20a)
74f344d [US-018] Sync endpoints + CC1 sync-status channel
3a14700 [US-019] Local-op security contract + clone relay endpoint
b72f049 [US-020] Auth relay endpoints (/api/local-op/auth/*)
edcb7fa [US-021] CLI sync/push/pull commands
3ffbd5e [US-022] WIP: Checkpoint version rename + rollback parent commit scaffolding
be06f71 [US-022] Checkpoint version: toasts + MCP output rename
042d901 [US-023] SyncStatusBadge + use-git-sync-status hook
477abca [US-024] ConflictBanner + ConflictResolver side sheet
906452f [US-025] DiffView conflictMode with per-hunk Accept/Reject
b8802f0 [US-026] CloneDialog component
2fc7584 [US-027] AuthModal component (Device Flow + PAT + identity prompt)
e0457d3 [US-028] Editor integration — AuthModal, CloneDialog, sync wiring
67fad02 use password library for PAT cli
5a7478e validate github host and a add docs
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 docs/content/guides/cli-reference.mdx              | 218 +++++
 docs/content/guides/configuration.mdx              |  24 +
 docs/content/guides/getting-started.mdx            |  28 +-
 docs/content/guides/github-sync.mdx                | 183 ++++
 docs/content/guides/meta.json                      |   9 +-
 docs/content/internals/server-lifecycle.mdx        |   8 +-
 docs/content/internals/service-topology.mdx        |  26 +-
 docs/content/overview.mdx                          |  14 +-
 packages/app/src/components/AuthModal.tsx          | 513 ++++++++++++
 packages/app/src/components/CloneDialog.tsx        | 367 ++++++++
 packages/app/src/components/ConflictBanner.tsx     |  40 +
 packages/app/src/components/ConflictResolver.tsx   | 292 +++++++
 packages/app/src/components/DiffView.tsx           |  82 +-
 packages/app/src/components/EditorHeader.tsx       |  52 +-
 packages/app/src/components/EditorPane.tsx         |  51 +-
 packages/app/src/components/SyncStatusBadge.tsx    | 240 ++++++
 packages/app/src/components/TimelinePanel.tsx      |   2 +-
 packages/app/src/hooks/use-git-sync-status.ts      |  70 ++
 packages/app/src/lib/cc1.ts                        |   4 +-
 packages/cli/package.json                          |   4 +
 packages/cli/src/auth/device-flow.ts               |  64 ++
 packages/cli/src/auth/gh-detect.test.ts            |  22 +
 packages/cli/src/auth/gh-detect.ts                 |  24 +
 packages/cli/src/auth/resolve-auth.test.ts         | 120 +++
 packages/cli/src/auth/resolve-auth.ts              |  63 ++
 packages/cli/src/auth/token-store.test.ts          | 140 ++++
 packages/cli/src/auth/token-store.ts               | 148 ++++
 packages/cli/src/cli.ts                            |  16 +
 .../cli/src/commands/auth/git-credential.test.ts   | 133 +++
 packages/cli/src/commands/auth/git-credential.ts   |  70 ++
 packages/cli/src/commands/auth/index.ts            |  30 +
 packages/cli/src/commands/auth/login.ts            | 110 +++
 packages/cli/src/commands/auth/pat.ts              |  61 ++
 packages/cli/src/commands/auth/repos.ts            |  51 ++
 packages/cli/src/commands/auth/signout.ts          |  21 +
 packages/cli/src/commands/auth/status.ts           |  65 ++
 packages/cli/src/commands/auth/validate-host.ts    |  22 +
 packages/cli/src/commands/clone.ts                 | 153 ++++
 packages/cli/src/commands/pull.ts                  |  28 +
 packages/cli/src/commands/push.ts                  |  28 +
 packages/cli/src/commands/start.ts                 |   3 +
 packages/cli/src/commands/sync.ts                  | 114 +++
 packages/cli/src/config/schema.ts                  |  34 +
 packages/cli/src/github/app-config.ts              |  22 +
 packages/cli/src/github/url.test.ts                | 290 +++++++
 packages/cli/src/github/url.ts                     |  84 ++
 packages/cli/src/mcp/tools/save-version.ts         |   2 +-
 packages/server/src/api-extension.ts               | 853 ++++++++++++++++++-
 packages/server/src/conflict-storage.test.ts       | 222 +++++
 packages/server/src/conflict-storage.ts            | 225 +++++
 packages/server/src/error-classification.test.ts   | 295 +++++++
 packages/server/src/error-classification.ts        | 461 +++++++++++
 packages/server/src/git-handle.test.ts             |  58 ++
 packages/server/src/git-handle.ts                  |  55 ++
 packages/server/src/git-identity.test.ts           | 134 +++
 packages/server/src/git-identity.ts                | 140 ++++
 packages/server/src/git-mutex.ts                   |  28 +
 packages/server/src/local-op-security.test.ts      | 225 +++++
 packages/server/src/local-op-security.ts           | 141 ++++
 packages/server/src/shadow-repo.ts                 |   2 +-
 packages/server/src/standalone.ts                  | 136 +++
 packages/server/src/sync-engine.ts                 | 920 +++++++++++++++++++++
 packages/server/src/sync-timing.test.ts            |  78 ++
 packages/server/src/sync-timing.ts                 |  33 +
 64 files changed, 8105 insertions(+), 46 deletions(-)
```

Full file list (including untracked files when present):

```
docs/content/guides/cli-reference.mdx
docs/content/guides/configuration.mdx
docs/content/guides/getting-started.mdx
docs/content/guides/github-sync.mdx
docs/content/guides/meta.json
docs/content/internals/server-lifecycle.mdx
docs/content/internals/service-topology.mdx
docs/content/overview.mdx
packages/app/src/components/AuthModal.tsx
packages/app/src/components/CloneDialog.tsx
packages/app/src/components/ConflictBanner.tsx
packages/app/src/components/ConflictResolver.tsx
packages/app/src/components/DiffView.tsx
packages/app/src/components/EditorHeader.tsx
packages/app/src/components/EditorPane.tsx
packages/app/src/components/SyncStatusBadge.tsx
packages/app/src/components/TimelinePanel.tsx
packages/app/src/hooks/use-git-sync-status.ts
packages/app/src/lib/cc1.ts
packages/cli/package.json
packages/cli/src/auth/device-flow.ts
packages/cli/src/auth/gh-detect.test.ts
packages/cli/src/auth/gh-detect.ts
packages/cli/src/auth/resolve-auth.test.ts
packages/cli/src/auth/resolve-auth.ts
packages/cli/src/auth/token-store.test.ts
packages/cli/src/auth/token-store.ts
packages/cli/src/cli.ts
packages/cli/src/commands/auth/git-credential.test.ts
packages/cli/src/commands/auth/git-credential.ts
packages/cli/src/commands/auth/index.ts
packages/cli/src/commands/auth/login.ts
packages/cli/src/commands/auth/pat.ts
packages/cli/src/commands/auth/repos.ts
packages/cli/src/commands/auth/signout.ts
packages/cli/src/commands/auth/status.ts
packages/cli/src/commands/auth/validate-host.ts
packages/cli/src/commands/clone.ts
packages/cli/src/commands/pull.ts
packages/cli/src/commands/push.ts
packages/cli/src/commands/start.ts
packages/cli/src/commands/sync.ts
packages/cli/src/config/schema.ts
packages/cli/src/github/app-config.ts
packages/cli/src/github/url.test.ts
packages/cli/src/github/url.ts
packages/cli/src/mcp/tools/save-version.ts
packages/server/src/api-extension.ts
packages/server/src/conflict-storage.test.ts
packages/server/src/conflict-storage.ts
packages/server/src/error-classification.test.ts
packages/server/src/error-classification.ts
packages/server/src/git-handle.test.ts
packages/server/src/git-handle.ts
packages/server/src/git-identity.test.ts
packages/server/src/git-identity.ts
packages/server/src/git-mutex.ts
packages/server/src/local-op-security.test.ts
packages/server/src/local-op-security.ts
packages/server/src/shadow-repo.ts
packages/server/src/standalone.ts
packages/server/src/sync-engine.ts
packages/server/src/sync-timing.test.ts
packages/server/src/sync-timing.ts
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~322276 bytes across ~64 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.Codex/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 98b7586aab607586890b6efc58d98a453dd5a6b3 -- path/to/file.ts`
> - Full diff: read `.Codex/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
