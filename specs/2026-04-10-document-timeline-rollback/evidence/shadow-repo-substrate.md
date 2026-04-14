---
type: evidence
source: codebase trace + parent spec
confidence: HIGH
created: 2026-04-10
---

# Shadow Repo Substrate — What's Available for Timeline

## Ref Structure (per branch)

| Ref pattern | Created by | Survives Save Version? | Content |
|-------------|-----------|----------------------|---------|
| `refs/wip/<branch>/<writer-id>` | `commitWip()` on L2 debounce (30s) | **No** — deleted by `saveVersion()` | Per-writer auto-save commits |
| `refs/wip/<branch>/upstream` | `commitUpstreamImport()` on HEAD move | **No** — deleted by `saveVersion()` | Upstream change snapshots |
| `refs/wip/<branch>/human-<sessionId>` | `parkBranch()` on branch switch | Yes (until branch GC) | Parked Y.Doc state + disk snapshot |
| `refs/checkpoints/<branch>/<project-sha>` | `saveVersion()` | **Yes** — permanent | Full tree snapshot at Save Version time |

## Commit Metadata Available

Each shadow commit stores:
- **Author name + email**: writer identity (human name, agent ID, "upstream")
- **Committer**: always "openknowledge" 
- **Message**: structured format (`WIP auto-save <ISO>`, `upstream: import from <sha>..<sha>`, `checkpoint: Save Version → project commit <sha>`)
- **Timestamp**: author date (ISO-8601)
- **Parent chain**: each commit points to previous (enables traversal)
- **Tree**: full content snapshot (retrievable via `git show <sha>:<docName>`)

## Key Functions in shadow-repo.ts

```typescript
// Create a simple-git instance for the shadow repo
shadowGit(shadow: ShadowHandle): SimpleGit

// Per-writer WIP commits
commitWip(shadow, writer: WriterIdentity, contentRoot, message, branch?): Promise<string>

// Upstream import commits  
commitUpstreamImport(shadow, contentRoot, oldHead, newHead, branch?): Promise<string>

// Save Version (creates project commit + checkpoint + resets WIP)
saveVersion(shadow, projectRoot, contentRoot, writers, branch?): Promise<SaveVersionResult>

// Park/restore for branch switches
parkBranch(shadow, branch, sessionId, documents): Promise<string | null>
readParkedState(shadow, branch, sessionId, docName): Promise<{markdown, diskSnapshot} | null>
```

## WIP Ref Lifecycle Problem

The critical issue for timeline: `saveVersion()` calls `update-ref -d` on all `refs/wip/<branch>/*` refs after creating the checkpoint. This means:

1. WIP commits become **orphaned** (no ref points to them)
2. They're still reachable via **reflog** temporarily
3. `git gc` will eventually collect them
4. Timeline cannot show inter-checkpoint WIP history from before the last Save Version

**Options:**
- A) Stop deleting WIP refs → unbounded ref growth
- B) Archive before delete (rename to `refs/archive/wip/<branch>/<checkpoint-sha>/<writer>`)
- C) Accept ephemeral — WIP history only available until next Save Version
- D) Merge WIP commit chains into checkpoint ref's parent chain before deletion

## Query Patterns Needed

**List commits for a document across all writers:**
```bash
# Enumerate all writer refs for current branch
git for-each-ref --format='%(refname)' refs/wip/<branch>/

# For each ref, get file-specific history
git log <ref> --format='%H %aI %an %s' -- <docName>

# Get file content at a specific commit
git show <sha>:<docName>

# Diff between two versions
git diff <sha1>:<docName> <sha2>:<docName>
```

**List checkpoints:**
```bash
git for-each-ref --format='%(refname) %(objectname) %(authordate:iso-strict) %(subject)' refs/checkpoints/<branch>/
```

## Existing API Surface

| Endpoint | Relevant? | Notes |
|----------|-----------|-------|
| `POST /api/save-version` | Yes | Creates checkpoints; could return updated timeline |
| `GET /api/document` | Yes | Returns current doc content; baseline for diff |
| `GET /api/rescue` | Tangential | Rescue buffers are a different recovery mechanism |

**No history/timeline endpoints exist yet.**

## Rollback Path (CRDT-mediated)

To restore document to version at commit `<sha>`:
1. `git show <sha>:<docName>` → get historical markdown
2. Parse markdown → ProseMirror JSON
3. Apply to Y.Doc via `updateYFragment` in a transaction
4. Transaction propagates to all connected clients via Hocuspocus
5. `reconciledBase` updates on next `onStoreDocument`
6. L1 debounce flushes new (old) content to disk
7. L2 debounce creates new WIP commit in shadow

This is architecturally identical to how `handleExternalChange` works — the "external change" is just coming from the shadow repo instead of disk.
