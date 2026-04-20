# Evidence: Why Full-Auto Bidirectional Git Sync Is Rare

**Dimension:** D4 — Root-cause analysis
**Date:** 2026-04-15
**Sources:** GitHub issue threads, blog posts, git mailing list, engineering blog posts

---

## Key files / pages referenced

- https://github.com/Vinzent03/obsidian-git/issues/340 — Obsidian-Git: merge conflicts not supported on mobile
- https://github.com/Vinzent03/obsidian-git/issues/803 — Obsidian-Git: conflict handling for multi-device
- https://github.com/Vinzent03/obsidian-git/issues/872 — Obsidian-Git: auto-merge option to prioritize remote
- https://github.com/Vinzent03/obsidian-git/issues/683 — Obsidian-Git: index.lock contention
- https://github.com/Vinzent03/obsidian-git/issues/906 — Obsidian-Git: mobile merge conflict resolution
- https://github.com/desktop/desktop/issues/10995 — GitHub Desktop: automatic pushing and pulling request
- https://github.com/desktop/desktop/issues/9145 — GitHub Desktop: automatic fetch and pull
- https://github.com/desktop/desktop/issues/8167 — GitHub Desktop: auto-pull confusion
- https://github.com/desktop/desktop/issues/1128 — GitHub Desktop: auto-fetch triggers 2FA prompts
- https://github.com/microsoft/vscode/issues/62058 — VS Code: git autopush request (revisited)
- https://github.com/microsoft/vscode/issues/14885 — VS Code: auto push on commit (original, Nov 2016)
- https://github.com/microsoft/vscode/issues/23951 — VS Code: disable git.autofetch by default
- https://github.com/logseq/logseq/issues/429 — Logseq: auto-merge conflicts via isomorphic-git
- https://github.com/logseq/logseq/issues/713 — Logseq: merges with conflicts not supported
- https://github.com/isomorphic-git/isomorphic-git/issues/841 — isomorphic-git: merge conflict support
- https://isomorphic-git.org/docs/en/merge.html — isomorphic-git merge docs
- https://github.com/jesseduffield/lazygit/issues/4647 — lazygit: auto push feature request
- https://git.vger.kernel.narkive.com/9Rkrrepp/push-race-condition — Git push race condition incident
- https://git.vger.kernel.narkive.com/C2pdDglK/race-condition-in-git-push-mirror-can-cause-silent-ref-rewinding — Git push --mirror race
- https://github.blog/2015-04-30-git-2-4-atomic-pushes-push-to-deploy-and-more/ — Git 2.4 atomic pushes
- https://martinfowler.com/bliki/SemanticConflict.html — Martin Fowler on semantic conflicts
- https://discourse.joplinapp.org/t/git-for-file-syncing/9474 — Joplin: Laurent rejects git as sync backend
- https://dev.to/lostintangent/providing-a-real-time-compliment-for-git-based-collaboration-1aah — VS Live Share: git not built for sync
- https://lwn.net/Articles/442841/ — dvcs-autosync (LWN.net, 2011) — early full-auto attempt
- https://git-annex.branchable.com/automatic_conflict_resolution/ — git-annex: auto-resolution creates .variant files
- https://git-annex.branchable.com/not/ — git-annex: what it is not
- https://nesbitt.io/2025/12/24/package-managers-keep-using-git-as-a-database.html — git as database limitations
- https://www.figma.com/blog/how-figmas-multiplayer-technology-works/ — Figma: CRDT, not git
- https://linear.app/now/scaling-the-linear-sync-engine — Linear: custom sync engine
- https://www.notion.com/blog/how-we-made-notion-available-offline — Notion: custom offline sync
- https://tina.io/docs/faq — TinaCMS: Content API, not local git
- https://community.hedgedoc.org/t/github-sync-in-hedgedoc/385 — HedgeDoc: GitHub sync unresolved

---

## Findings

### Finding: Seven root causes explain the rarity of full-auto git sync
**Confidence:** CONFIRMED (causes A-D, F-G); INFERRED (cause E — circumstantially cited, no single definitive source)

**Cause A: Git's merge model requires human arbitration.**
Git's three-way merge detects conflicts but cannot resolve them. In automated sync, conflicts either block the operation or are resolved by policy (`--ours`/`--theirs`), silently discarding one side's changes. The `isomorphic-git` library (used by Obsidian-Git mobile and Logseq) throws `MergeNotSupportedError` by default — it cannot even attempt conflict resolution.

**Evidence:** isomorphic-git issue #841; Obsidian-Git issues #340, #803, #872, #906; Logseq issues #429, #713; Martin Fowler on semantic conflicts.

**Cause B: Push-pull serialization bottleneck.**
Git's "fast-forward only" push constraint means: before you can push, you must have pulled all remote changes. With two devices auto-syncing, Device A pushes; Device B's auto-push fails with "non-fast-forward"; B must auto-pull, resolve any conflicts, then retry. This retry loop is inherently serial. CRDT-based sync engines (Figma, Linear, Notion) were designed specifically to avoid this serialization by making concurrent writes commutative.

**Evidence:** Git push documentation; git mailing list race condition incident; Git 2.4 atomic pushes blog post.

**Cause C: Mobile git implementations cannot merge.**
iOS and Android cannot install native git. Tools use `isomorphic-git` (JavaScript reimplementation), which throws `MergeNotSupportedError` on any conflict during pull. Auto-pull on mobile is structurally unsafe when divergence exists.

**Evidence:** isomorphic-git issue #841, docs; Obsidian-Git issue #340; Logseq mobile discussions.

**Cause D: Credential management is incompatible with headless automation.**
HTTPS tokens expire; SSH keys may need passphrase entry. GitHub deprecated password auth in August 2021. Background auto-push cannot present a UI prompt when credentials fail. GitHub Desktop issue #1128 explicitly cites: auto-fetch was "prompting for 2FA token" on every background cycle.

**Evidence:** GitHub Desktop issues #1128, #10995; VS Code issue #23951.

**Cause E: Commit history pollution.**
Every auto-commit creates a machine-generated commit message ("auto commit," "backup"). High-frequency auto-commits clutter `git log`, make `git bisect` unreliable, and make repository history unreadable.

**Evidence:** git commit granularity literature; circumstantially cited by Obsidian-Git, Logseq communities.

**Cause F: index.lock contention.**
Git uses `.git/index.lock` for exclusive write access. If an auto-commit timer fires during an auto-pull (or user-triggered git operation), the second process fails with "Another git process seems to be running." The lock file must be manually deleted.

**Evidence:** Obsidian-Git issue #683; Microsoft documentation on index.lock.

**Cause G: Unit of operation mismatch.**
Git's fundamental unit is the commit — a deliberate named snapshot. Note-taking and collaborative editing require per-keystroke or sub-second granularity. Joplin's author stated: "The unit of operation for Joplin is a file read or write, and the unit for git is the commit."

**Evidence:** Joplin forum (Laurent Cozic direct statement); VS Live Share blog post (Jonathan Carter/Microsoft).

### Finding: Specific issue threads document rejected auto-push requests
**Confidence:** CONFIRMED

- **GitHub Desktop #10995:** Auto pushing and pulling requested; not implemented. GitHub Desktop maintains fetch-only for background operations.
- **GitHub Desktop #9145:** Auto fetch + auto pull requested; not implemented.
- **VS Code #62058 / #14885:** Auto-push requested. Maintainer (joaomoreno) recommended post-commit hooks instead, calling them "by far the best option." Not built into VS Code.
- **VS Code #23951:** Users requested even auto-fetch be opt-in, citing credential prompts and performance.
- **lazygit #4647:** Auto push requested; not implemented.

### Finding: Five collaboration tools explicitly built custom sync instead of using git
**Confidence:** CONFIRMED

- **Joplin:** Laurent Cozic rejected git citing unit-of-operation mismatch, mobile bundling impossibility, credential complexity, unresolvable conflicts, and rebase/rollback fragility.
- **SiYuan:** Built DejaVu (content-addressed snapshot engine with chunk-level deduplication + AES-256 + distributed mutex). README states "data synchronization through third-party synchronization disks is not supported, otherwise data may be corrupted."
- **Figma:** CRDT-inspired property-level sync at 33ms ticks. Git never a candidate — the design targets millisecond latency.
- **Linear:** Event-sourced SyncAction objects + WebSocket deltas + IndexedDB persistence. Sub-second collaborative issue tracking.
- **Notion:** CRDT-based block-level offline sync + push-based WebSocket updates.

### Finding: dvcs-autosync (2011) is the earliest documented full-auto git attempt
**Confidence:** CONFIRMED
**Evidence:** https://lwn.net/Articles/442841/

LWN.net covered dvcs-autosync in 2011 — a daemon that watched for file changes, auto-committed, and auto-pushed/pulled. The article noted no encryption support, performance issues with large binaries, and no conflict resolution mechanism. Designed for single-user use where the push destination is trusted.

### Finding: git-annex's auto-conflict resolution defers to renamed files, not true resolution
**Confidence:** CONFIRMED
**Evidence:** https://git-annex.branchable.com/automatic_conflict_resolution/

When `git annex sync` encounters a merge conflict, it renames both versions with `.variant-AAA`/`.variant-BBB` suffixes. Documentation explicitly states "manual intervention is required afterward." This is the most honest documentation of what full-auto bidirectional git sync actually delivers: it defers conflicts into accumulating renamed files.

---

## Failure mode taxonomy (11 modes documented with evidence)

| ID | Failure mode | Severity | Evidence source |
|----|-------------|----------|----------------|
| F1 | Non-fast-forward push rejection | Blocking | Git docs, mailing list race incident |
| F2 | Merge conflict requiring human resolution | Blocking | isomorphic-git #841, Obsidian-Git #803/#872 |
| F3 | Semantic conflicts (undetectable by text diff) | Silent corruption | Martin Fowler, Phil Haack |
| F4 | Binary file merge impossibility | Blocking | Git Advanced Merging docs |
| F5 | index.lock contention from concurrent operations | Blocking | Obsidian-Git #683 |
| F6 | isomorphic-git MergeNotSupportedError on mobile | Blocking | isomorphic-git #841, Obsidian-Git #340 |
| F7 | Credential/auth interruption in background | Blocking | GitHub Desktop #1128, VS Code #23951 |
| F8 | Commit history pollution from auto-commit | Degradation | Commit granularity literature |
| F9 | Repository size growth from binary metadata | Degradation | git-annex "not" page, Nesbitt 2025 |
| F10 | Concurrent push race (server-level) | Silent data loss | Git mailing list, atomic push blog |
| F11 | Rebase/history-rewriting breaks sync consumer | Blocking | Joplin forum (Laurent) |

---

## Negative searches

- No direct statement from Linus Torvalds or git core maintainers on auto-push: NOT FOUND
- No explicit design document from GitHub Desktop team explaining fetch-only philosophy: NOT FOUND
- No Obsidian-Git maintainer statement explaining why auto-pull defaults to 0: NOT FOUND (behavior documented, rationale implicit)
- No peer-reviewed paper specifically on "git as sync protocol limitations": NOT FOUND (closest is CRDT literature)

---

## Gaps / follow-ups

- GitHub Desktop issue #10995 content not fully accessible (401 on API fetch) — summary inferred from search context
- Logseq git-auto README contains no rationale for push-only design — the choice is undocumented
