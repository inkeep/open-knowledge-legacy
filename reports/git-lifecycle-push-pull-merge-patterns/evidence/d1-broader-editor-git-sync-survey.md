# Evidence: Broader Editor Git-Sync Inventory

**Dimension:** D1 — Git-backed note/knowledge editors (broad inventory)
**Date:** 2026-04-15
**Sources:** GitHub repos, official docs, community forums for 21 tools

---

## Key files / pages referenced

- https://foamnotes.com/user/recipes/automatic-git-syncing.html — Foam auto-sync recipe (delegates to GitDoc or VS Code)
- https://github.com/foambubble/foam/issues/275 — Foam auto-sync request
- https://wiki.dendron.so/notes/6jpib71kvuuqjbq6txyo0qh/ — Dendron `Workspace: Sync` docs
- https://github.com/dendronhq/dendron/issues/3262 — Dendron auto-commit-on-save request
- https://github.com/dendronhq/dendron/issues/2075 — Dendron periodic workspace sync request
- https://quartz.jzhao.xyz/hosting — Quartz hosting docs (`npx quartz sync`)
- https://docs.requarks.io/storage/git — Wiki.js git storage module
- https://github.com/Requarks/wiki/issues/627 — Wiki.js sync frequency discussion
- https://github.com/gollum/gollum/issues/112 — Gollum push/pull buttons request
- https://github.com/gollum/gollum/issues/1698 — Gollum remote repo usage
- https://www.whiteboardcoder.com/2017/04/gollum-auto-sync-to-remote-git-repo.html — Gollum auto-sync workaround guide
- https://github.com/Zettlr/Zettlr/issues/1050 — Zettlr git functionality request
- https://support.typora.io/Version-Control/ — Typora version control docs (no native git)
- https://hackmd.io/s/link-with-github — HackMD GitHub sync (manual push/pull)
- https://github.com/hackmdio/hackmd-io-issues/issues/8 — HackMD auto-sync request
- https://www.getoutline.com/integrations/github-gist — Outline GitHub integration (link-preview only)
- https://github.com/outline/outline/discussions/6790 — Outline export-as-git-repo discussion
- https://github.com/BookStackApp/BookStack/issues/776 — BookStack git content storage request
- https://help.noteplan.co/article/102-sync-with-git — NotePlan git sync (manual via third-party apps)
- https://github.com/silverbulletmd/silverbullet-git — SilverBullet git plug (opt-in)
- https://community.silverbullet.md/t/git-auto-sync-commit/1568 — SilverBullet auto-sync discussion
- https://help.remnote.com/en/articles/6301627-remnote-backups — RemNote backups (cloud, no git)
- https://standardnotes.com/help/security/encryption — Standard Notes (encrypted sync, no git)
- https://docs.standardnotes.org/specification/sync/ — Standard Notes sync protocol
- https://triliumnext.github.io/Docs/Wiki/synchronization.html — Trilium sync (HTTP, no git)
- https://github.com/anyproto/any-sync — AnyType any-sync protocol (P2P, no git)
- https://github.com/AppFlowy-IO/AppFlowy-Collab — AppFlowy CRDT sync (no git)
- https://community.hedgedoc.org/t/github-sync-in-hedgedoc/385 — HedgeDoc GitHub sync request

---

## Findings

### Finding: Wiki.js is the ONLY surveyed tool with full-auto bidirectional git sync enabled by default
**Confidence:** CONFIRMED
**Evidence:** https://docs.requarks.io/storage/git

Wiki.js's git storage module runs bidirectional sync on a configurable interval (default 5 minutes). On each cycle: pull remote changes into Wiki.js, push local changes to remote. Enabled by default when git storage is configured. No other tool among 21 surveyed ships this behavior by default.

**Implications:** Full-auto bidirectional git sync exists in production but is a singleton finding.

### Finding: Gollum auto-commits locally but never auto-pushes
**Confidence:** CONFIRMED
**Evidence:** https://github.com/gollum/gollum/issues/112, https://github.com/gollum/gollum/issues/1698

Gollum (GitHub's wiki engine) creates a local git commit on every web UI save — the git log is always current with wiki state. However, no built-in remote push exists. Users must configure a `post_commit` hook or run manual `git push` to sync with a remote.

### Finding: SilverBullet has opt-in full-auto via git plug, but disabled at two levels by default
**Confidence:** CONFIRMED
**Evidence:** https://github.com/silverbulletmd/silverbullet-git, https://community.silverbullet.md/t/git-auto-sync-commit/1568

The `silverbullet-git` plug is not installed by default. When installed AND `git.autoSync: true` is configured, it runs commit+pull+push every 5 minutes. Two explicit opt-in gates required.

### Finding: 13 of 21 tools (62%) have no git content integration
**Confidence:** CONFIRMED
**Evidence:** Per-tool sources above

RemNote, Mark Text, Typora, HedgeDoc/CodiMD, Outline, BookStack, Craft, Bear, AppFlowy, AnyType, Standard Notes, Trilium Notes, and SilverBullet (default state) all use proprietary sync, iCloud, CRDT, P2P, or database storage. Git is not part of their content lifecycle.

### Finding: 6 tools have manual-only git operations
**Confidence:** CONFIRMED
**Evidence:** Per-tool sources above

Dendron (`Workspace: Sync` is user-triggered), Quartz (`npx quartz sync` is CLI-invoked), Foam (delegates to VS Code), HackMD (manual push/pull buttons), NotePlan (via third-party Working Copy), iA Writer (via Working Copy on iOS). All require explicit user action for every git operation.

### Finding: Dendron users requested periodic auto-sync; it was never implemented
**Confidence:** CONFIRMED
**Evidence:** https://github.com/dendronhq/dendron/issues/2075, https://github.com/dendronhq/dendron/issues/3262

Multiple issues requesting auto-commit-on-save and periodic sync. Dendron's `Workspace: Sync` remains manually triggered. The project was deprecated before these were implemented.

### Finding: Zettlr detects git repos but provides no git operations
**Confidence:** CONFIRMED
**Evidence:** https://github.com/Zettlr/Zettlr/issues/1050, https://github.com/Zettlr/Zettlr/issues/5148

Zettlr shows git status in the directory panel but has no commit, push, pull, or sync UI. Users must use external git tools.

---

## Per-tool classification table

| Tool | Category | Default auto-git behavior |
|------|----------|--------------------------|
| Wiki.js | (d) Full-auto both | 5-min bidirectional sync by default |
| Gollum | (c) Auto-commit only | Commits on every save; no auto-push |
| Dendron | (e) All manual | `Workspace: Sync` is user-triggered |
| Quartz | (e) All manual | `npx quartz sync` is CLI-invoked |
| Foam | (e) All manual | No native git; delegates to VS Code |
| HackMD | (e) All manual | Manual push/pull via Versions panel |
| NotePlan | (e) All manual | Via third-party Working Copy |
| iA Writer | (e) All manual | Via Working Copy on iOS |
| Zettlr | (e) All manual | Detects repos, no operations |
| SilverBullet | (f)→(d) opt-in | No git by default; full-auto if plug+config |
| RemNote | (f) No git | Own encrypted cloud sync |
| Mark Text | (f) No git | No git features |
| Typora | (f) No git | No built-in git |
| HedgeDoc/CodiMD | (f) No git | No native git |
| Outline | (f) No git | GitHub link-preview only |
| BookStack | (f) No git | DB-based page revision history |
| Craft | (f) No git | iCloud/CloudKit sync |
| Bear | (f) No git | iCloud sync |
| AppFlowy | (f) No git | CRDT cloud sync |
| AnyType | (f) No git | any-sync P2P protocol |
| Standard Notes | (f) No git | Encrypted HTTP sync |
| Trilium Notes | (f) No git | HTTP sync with SQLite |

---

## Negative searches

- Searched "auto push" "auto sync" "git sync" in Mark Text, Typora, Bear repos: no results
- Searched AppFlowy for git: found only CRDT collab layer, no git integration
- Searched AnyType: found any-sync protocol (IPFS-like P2P), no git

---

## Gaps / follow-ups

- Zettlr's git detection scope (what exactly it shows in status) is surface-level — source-level analysis not done
- Quartz v5 may have changed sync behavior — only v4 docs confirmed
