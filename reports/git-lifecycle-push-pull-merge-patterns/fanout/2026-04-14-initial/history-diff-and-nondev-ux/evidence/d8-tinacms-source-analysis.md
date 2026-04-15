# Evidence: D8 — TinaCMS Source-Level Analysis

**Dimension:** D8.1, D8.2, D8.3, D8.4, D8.5, D8.6, D8.7, D8.8 (TinaCMS specifics)
**Date:** 2026-04-14
**Sources:** https://github.com/tinacms/tinacms (source), https://tina.io/docs/ (official docs)

---

## Key files / pages referenced

- `packages/tinacms-gitprovider-github/src/index.ts` — `GitHubProvider` class implementing `GitProvider` interface
- https://tina.io/docs/tinacloud/editorial-workflow — protected branches, branch model, PR creation
- https://tina.io/docs/faq — local dev mode, localhost:4001 data layer
- https://tina.io/docs/self-hosted/overview — self-hosted vs cloud vs local modes

---

## Findings

### Finding: GitHub Contents API integration — each save is a separate commit
**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms-gitprovider-github/src/index.ts`:

`onPut(key, value)`:
1. Constructs path via `rootPath` + file key
2. SHA retrieval via `repos.getContent()` (required for updates; silent failure for new files)
3. Base64-encodes content via `js-base64`
4. Calls `repos.createOrUpdateFileContents()` with path, content, commit message, branch, SHA
5. Uses Octokit REST client

`onDelete(key)`:
1. Same path construction
2. SHA lookup via `repos.getContent()`
3. If SHA exists, `repos.deleteFile()` with commit message and branch
4. Throws `"Could not find file [path] in repo [owner]/[repo]"` if file not found

**Atomicity limitation:** Each file operation is a separate API call and a separate commit. Multi-file saves produce multiple sequential commits. No use of GitHub's Git Tree API for batch operations.

### Finding: Default commit message is static; configurable via constructor option
**Confidence:** CONFIRMED
**Evidence:** Default: `"Edited with TinaCMS"`. Configurable via `commitMessage` option in `GitHubProvider` constructor. No per-file or content-aware messages.

### Finding: Maximum git terminology abstraction for content editors
**Confidence:** CONFIRMED
**Evidence:** Content editors see:
- "Save" (not "commit")
- "Branch" exposed but simplified (modal prompts for branch name when saving to protected branch)
- "Pull Request" surfaced as link only ("View Pull Request")
- No push/pull/fetch/merge in editor UI
- "Protected branch" is the only git-native concept exposed

### Finding: Branch protection + PR model prevents conflicts architecturally
**Confidence:** CONFIRMED
**Evidence:** Protected branches prevent direct saves. Editors are forced through branch + PR workflow. Multiple editors can work simultaneously on different branches. Merge conflicts only surface at PR merge time through GitHub's web interface. TinaCMS has no conflict resolution surface.

### Finding: Three deployment modes with different git transport
**Confidence:** CONFIRMED
**Evidence:**

| Mode | Git transport | Branch switching | Auth |
|------|--------------|-----------------|------|
| Local dev | Filesystem (direct read/write) | N/A | None |
| Tina Cloud | GitHub Contents API | Runtime (URL-based) | TinaCloud auth |
| Self-hosted | Custom GitProvider impl | Build-time only | Custom |

Local mode uses `http://localhost:4001` for data layer, does not work in production.

### Finding: Force-push is architecturally impossible via GitHub Contents API
**Confidence:** CONFIRMED
**Evidence:** GitHub Contents API does not support force-push semantics. This is a safety net by architecture, not by feature choice.

### Finding: Retreat-to-CLI is minimal — drops to GitHub web UI, not terminal
**Confidence:** CONFIRMED
**Evidence:** Retreat scenarios:
1. PR merge conflicts → GitHub's web conflict resolution UI
2. Branch cleanup → GitHub or git CLI
3. Schema migration errors → Tina CLI re-run

The key distinction: TinaCMS's retreat mode drops to GitHub's web UI (a more capable interface) rather than raw git CLI. The abstraction holds better because failure modes are handled by the platform.

---

## Gaps / follow-ups

- GitHub Git Tree API for batch atomic commits is a known gap — worth investigating whether TinaCMS has plans to adopt it
- Self-hosted mode's custom GitProvider implementations (GitLab, Bitbucket) are not deeply investigated
