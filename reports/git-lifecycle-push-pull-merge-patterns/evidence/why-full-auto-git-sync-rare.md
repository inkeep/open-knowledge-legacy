# Evidence: Why Full-Auto Bidirectional Git Sync Is Rare

**Dimension:** Full-auto git sync prevalence (Path C extension near Theme 8)
**Date:** 2026-04-15
**Sources:** GitHub issues (Obsidian-Git, GitHub Desktop, VS Code, GitKraken feedback), engineering blogs (Linear, Figma, Logseq), community forums

---

## Key files / pages referenced
- [Vinzent03/obsidian-git #59](https://github.com/denolehov/obsidian-git/issues/59) — Original auto-pull feature request
- [Vinzent03/obsidian-git #114](https://github.com/Vinzent03/obsidian-git/issues/114) — workspace.json conflict on multi-device
- [Vinzent03/obsidian-git #803](https://github.com/Vinzent03/obsidian-git/issues/803) — Conflict resolution UI request
- [Vinzent03/obsidian-git #340](https://github.com/denolehov/obsidian-git/issues/340) — Mobile merge unsupported (isomorphic-git)
- [desktop/desktop #2191](https://github.com/desktop/desktop/issues/2191) — Auto-sync after commit request (closed, `future-proposal`)
- [desktop/desktop #8551](https://github.com/desktop/desktop/issues/8551) — Auto-fetch interval not configurable (declined)
- [microsoft/vscode #14885](https://github.com/microsoft/vscode/issues/14885) — Auto-push request (closed, use post-commit hook)
- [microsoft/vscode #62058](https://github.com/microsoft/vscode/issues/62058) — Revisited; result was `git.postCommitCommand` (manual)
- [logseq/git-auto](https://github.com/logseq/git-auto) — Push-only shell script (no pull)
- [haydenull/logseq-plugin-git #56](https://github.com/haydenull/logseq-plugin-git/issues/56) — Conflict resolution request
- [GitDocumentDB blog](https://gitddb.com/blog/) — Git-as-sync-backend limitations
- [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — Why not git (implicit)
- [tonsky.me — Local, first, forever](https://tonsky.me/blog/crdt-filesync/) — CRDTs guarantee conflict-free merge; git does not
- [Logseq community — Is git reliable for sync?](https://discuss.logseq.com/t/discussion-is-git-the-only-truly-reliable-self-hosted-sync-for-multiple-devices-in-2025/33502)

---

## Findings

### Finding: Every surveyed git tool defaults to fetch-only or manual for remote operations; none defaults to full-auto bidirectional sync
**Confidence:** CONFIRMED
**Evidence:** Default configurations across 6 tools:

| Tool | Auto-fetch | Auto-pull | Auto-push | Source |
|------|-----------|-----------|-----------|--------|
| Obsidian-Git | No (0) | No (0) | No (0) | Settings defaults |
| GitHub Desktop | Yes (1h) | No | No | Background fetch loop |
| VS Code | No (`git.autofetch` default false) | No | No | Settings schema |
| GitKraken | Yes (1 min) | No | No | Preferences > General |
| Logseq (git-auto) | N/A | No | Yes (flag `-p`) | Shell script |
| Logseq (plugin-git) | N/A | Opt-in | Opt-in | Plugin settings |

**Implications:** The industry pattern is: fetch is safe (read-only, updates tracking refs), pull modifies the working tree (risk of conflicts), push is public (affects shared state). Tools are comfortable automating the safe read but not the two write operations.

### Finding: Merge conflicts on non-user-edited metadata files are the primary blocker for auto-pull
**Confidence:** CONFIRMED
**Evidence:** Obsidian-Git issues [#114](https://github.com/Vinzent03/obsidian-git/issues/114), [#74](https://github.com/denolehov/obsidian-git/issues/74), [Discussion #709](https://github.com/Vinzent03/obsidian-git/discussions/709)

`.obsidian/workspace.json` is mutated on every app launch. `data.json` contains plugin timestamps (`lastAutoBackup`). Both produce guaranteed merge conflicts across devices before any user content edit occurs. Mobile backend (isomorphic-git) throws `MergeNotSupportedError` on any conflict ([#340](https://github.com/denolehov/obsidian-git/issues/340)), leaving users completely stuck.

### Finding: Maintainers of developer tools explicitly reject auto-push as out of scope
**Confidence:** CONFIRMED
**Evidence:**
- GitHub Desktop maintainer @niik on [#2191](https://github.com/desktop/desktop/issues/2191): "beyond the scope of our current roadmap" (closed with `future-proposal` label, never implemented despite the old Mac client having it)
- VS Code maintainer @rebornix on [#14885](https://github.com/microsoft/vscode/issues/14885): closed, recommending git `post-commit` hook instead. Rationale: auto-push is a git-level concern, not an editor concern
- VS Code revisited in [#62058](https://github.com/microsoft/vscode/issues/62058): shipped `git.postCommitCommand` (v1.69, June 2022) — a dropdown on the Commit button. Manual per-click, not automatic
- GitKraken: two feature requests on feedback board ([#278052](https://feedback.gitkraken.com/suggestions/278052/auto-push-on-commit-option-to-commit-and-push), [#262501](https://feedback.gitkraken.com/suggestions/262501/option-to-automatically-push-to-remotes-after-committing)) — neither implemented

### Finding: Sync-engine apps bypass git entirely because git's merge model requires human intervention
**Confidence:** CONFIRMED
**Evidence:**
- Linear uses custom CRDT/last-write-wins per property — discussed by Tuomas Artman at [localfirst.fm #15](https://www.localfirst.fm/15) and [devtools.fm #61](https://www.devtools.fm/episode/61)
- Figma uses CRDT-inspired per-property last-writer-wins; Evan Wallace's [multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) does not mention git — it is outside the design space for sub-second editing
- [tonsky.me](https://tonsky.me/blog/crdt-filesync/): CRDTs guarantee conflict-free merge; git does not
- [GitDocumentDB](https://gitddb.com/blog/): explicitly catalogs git limitations as sync backend — human conflict resolution, low throughput, no real-time updates
- Logseq built proprietary sync (whole-page, not line-level) to avoid git's conflict model ([community thread](https://discuss.logseq.com/t/discussion-is-git-the-only-truly-reliable-self-hosted-sync-for-multiple-devices-in-2025/33502))
- Andrew Nesbitt's ["Package managers keep using git as a database"](https://nesbitt.io/2025/12/24/package-managers-keep-using-git-as-a-database.html) — catalogs structural limitations: no locking, no indexes, no constraints

### Finding: Six structural reasons are cited across sources for why full-auto git sync fails
**Confidence:** CONFIRMED (synthesized from multiple sources)
**Evidence:** Recurring across issue threads, blogs, and community discussions:

1. **Merge conflicts require human judgment.** Git's three-way merge produces conflict markers that cannot be resolved programmatically without semantic understanding of the content.
2. **Metadata file churn.** App-specific files (`.obsidian/workspace.json`, plugin `data.json`, `.logseq/`) mutate on every launch, creating guaranteed conflicts before any user edit.
3. **No mobile merge support.** isomorphic-git (used by Obsidian-Git mobile) cannot perform merge at all — any conflict is fatal.
4. **Push is a public action.** Developer tools treat push as requiring explicit intent because it affects shared branches. Auto-pushing half-finished work or broken builds is a team coordination risk.
5. **No real-time channel.** Git operates via process-per-query (one network round-trip per push/pull). Sub-second sync requires persistent connections (WebSocket, SSE) that git does not provide.
6. **Storage/performance degradation.** Frequent auto-commits bloat history. Git was designed for deliberate, semantic commits — not continuous autosave.

---

## Negative searches

- Searched for git tools that default to full-auto bidirectional sync: NOT FOUND. No tool in the surveyed landscape defaults to auto-pull + auto-push. The closest is Obsidian-Git which exposes both intervals but defaults both to 0 (disabled).
- Searched for "auto push" in GitKraken docs: NOT FOUND as a feature. Only "Commit and Push" button exists.

---

## Gaps / follow-ups

- JJ (jujutsu) VCS automatic operation coalescing — may represent a different approach to the auto-sync problem
- Working Copy (iOS git client) auto-sync behavior not surveyed
- Detailed analysis of git-annex assistant's auto-sync model (partially covered in C4 evidence)
