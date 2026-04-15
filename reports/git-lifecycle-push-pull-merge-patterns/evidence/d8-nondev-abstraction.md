# Evidence: D8 Non-Developer Abstraction Patterns

**Dimension:** D8 — Auto-commit, terminology, safety nets, conflict handling, TinaCMS architecture, collaboration, retreat-to-CLI
**Date:** 2026-04-14
**Sources:** Obsidian-Git, TinaCMS, Logseq, SiYuan/Dejavu, Joplin (source-level for Obsidian-Git + TinaCMS; docs for others)

---

## Key files / pages referenced

- `Vinzent03/obsidian-git` `src/automaticsManager.ts` — interval/debounce scheduling, `promiseQueue`
- `Vinzent03/obsidian-git` `src/main.ts` — vault events, `autoCommitDebouncer`
- `Vinzent03/obsidian-git` `src/constants.ts` — defaults: `commitMessage: "vault backup: {{date}}"`, `pullBeforePush: true`
- `Vinzent03/obsidian-git` `src/gitManager/simpleGit.ts` — `push()` with no `--force`, merge strategy
- `Vinzent03/obsidian-git` `src/gitManager/isomorphicGit.ts` — `diff3Merge`, `MergeNotSupportedError`
- `Vinzent03/obsidian-git` `CHANGELOG.md` — v2.27.0: "backup" → "commit-and-sync"
- `tinacms/tinacms` `packages/tinacms-gitprovider-github/src/index.ts` — `GitHubProvider.onPut()`, `onDelete()`
- [TinaCMS editorial workflow docs](https://tina.io/docs/tinacloud/editorial-workflow)
- [SiYuan/Dejavu](https://github.com/siyuan-note/dejavu/blob/main/sync.go) — block-level merge, 7-min temporal guard
- [Joplin conflict docs](https://joplinapp.org/help/apps/conflict/) — Conflicts notebook
- [Logseq git-auto](https://github.com/logseq/git-auto) — 60s interval, fixed message
- Obsidian-Git Issues: [#906](https://github.com/Vinzent03/obsidian-git/issues/906), [#803](https://github.com/Vinzent03/obsidian-git/issues/803), [#340](https://github.com/Vinzent03/obsidian-git/issues/340), [#204](https://github.com/denolehov/obsidian-git/issues/204)

---

## Findings

### Finding: Where git operations execute determines abstraction quality
**Confidence:** CONFIRMED
**Evidence:** TinaCMS `index.ts`, Obsidian-Git `simpleGit.ts` + `isomorphicGit.ts`, SiYuan `sync.go`

Three models: (1) Server-side API (TinaCMS) — highest abstraction, lowest retreat. (2) Custom non-git sync (SiYuan, Joplin) — avoids git entirely. (3) Client-side git wrapper (Obsidian-Git, Logseq) — full compatibility, full failure surface.

### Finding: TinaCMS per-file commit model — no batching
**Confidence:** CONFIRMED
**Evidence:** `tinacms/tinacms` `packages/tinacms-gitprovider-github/src/index.ts`

`onPut(key, value)` flow: construct path → retrieve file SHA → base64 encode → `repos.createOrUpdateFileContents()`. Each save = separate commit. Git Tree API not used. Default message: `"Edited with TinaCMS"`.

### Finding: Obsidian-Git mobile merge conflicts are a broken capability
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/gitManager/isomorphicGit.ts`, Issues [#906](https://github.com/Vinzent03/obsidian-git/issues/906), [#803](https://github.com/Vinzent03/obsidian-git/issues/803), [#340](https://github.com/Vinzent03/obsidian-git/issues/340)

`isomorphic-git` throws `MergeNotSupportedError` with message `"Merge with conflicts is not supported yet"`. No in-app resolution path.

### Finding: Obsidian-Git "backup" → "commit-and-sync" rename in v2.27.0
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `CHANGELOG.md` — v2.27.0 (2024-09-18)

"Rename 'backup' to 'commit and sync' with a much better settings page." Primary action abstracted; advanced settings preserve git terminology.

### Finding: Six CLI retreat scenarios in Obsidian-Git
**Confidence:** CONFIRMED
**Evidence:** Issues [#906](https://github.com/Vinzent03/obsidian-git/issues/906), [#204](https://github.com/denolehov/obsidian-git/issues/204), [#803](https://github.com/Vinzent03/obsidian-git/issues/803), [Discussion #616](https://github.com/Vinzent03/obsidian-git/discussions/616)

(1) Mobile merge conflicts, (2) auth failures, (3) Snap/Flatpak sandboxing, (4) corrupted git state, (5) force operations, (6) complex `.gitignore`.

### Finding: TinaCMS retreats to GitHub web UI, not CLI
**Confidence:** CONFIRMED
**Evidence:** [TinaCMS docs](https://tina.io/docs/tinacloud/editorial-workflow)

3 retreat scenarios all drop to GitHub web UI: PR merge conflicts, branch cleanup, schema migration. Abstraction degrades gracefully to a more capable interface rather than a less capable one.

### Finding: SiYuan uses content-aware block-level merge with temporal guard
**Confidence:** CONFIRMED
**Evidence:** [SiYuan/Dejavu sync.go](https://github.com/siyuan-note/dejavu/blob/main/sync.go)

Parses document tree for block-level merge. Fold-attribute changes treated as non-essential and discarded. 7-minute temporal guard: cloud update 7+ min older → local wins; local 7+ min older → cloud wins.

### Finding: All non-dev tools target single-user multi-device
**Confidence:** CONFIRMED
**Evidence:** Obsidian-Git [Discussion #709](https://github.com/Vinzent03/obsidian-git/discussions/709), TinaCMS docs, Joplin docs, SiYuan source

No CRDT, no real-time presence in any surveyed non-dev tool. TinaCMS achieves multi-user via branch isolation and PR model, not real-time collaboration.

---

## Negative searches

- Searched for AI commit messages in non-dev tools: not found (Obsidian-Git has `commitMessageScript` shell hook; no LLM integration)
- Searched for real-time collaboration / CRDT in non-dev git tools: not found
- Searched for Logseq source-level git internals: limited to community docs and `git-auto` external script
