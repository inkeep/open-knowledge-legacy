# Evidence: D8.5, D8.7, D8.8 — Conflict Handling, Collaboration Model, Retreat-to-CLI

**Dimensions:** D8.5 Conflict handling for non-devs, D8.7 Collaboration model, D8.8 Retreat-to-CLI frequency
**Date:** 2026-04-14
**Sources:** Obsidian-Git source/issues, TinaCMS docs, Logseq community, SiYuan/Dejavu source, Joplin docs

---

## Key files / pages referenced

- Obsidian-Git `src/gitManager/simpleGit.ts` — desktop merge strategy
- Obsidian-Git `src/gitManager/isomorphicGit.ts` — mobile `diff3Merge`, `MergeNotSupportedError`
- Obsidian-Git issues: #906, #803, #340, #204
- Obsidian-Git discussions: #616, #709
- SiYuan/Dejavu `sync.go` — content-aware merge, 7-minute rule, cloud lock
- Joplin: https://joplinapp.org/help/apps/conflict/
- TinaCMS: https://tina.io/docs/tinacloud/editorial-workflow

---

## Findings

### Finding: Conflict handling strategy spectrum — avoidance > smart merge > last-write-wins > manual markers > broken
**Confidence:** CONFIRMED
**Evidence:**

| Tool | Strategy | Conflict frequency | Resolution surface |
|------|----------|-------------------|-------------------|
| TinaCMS | Avoidance (branch-per-editor) | Very low | GitHub PR UI |
| SiYuan | Smart merge (block-level) + 7-min temporal guard | Low | Automatic + history folder |
| Joplin | Last-write-wins + conflict copy | Medium | Manual compare (Conflicts notebook) |
| Obsidian-Git (desktop) | Git merge + manual markers | Medium-high | In-file conflict markers |
| Obsidian-Git (mobile) | isomorphic-git `diff3Merge` | High | **None** (MergeNotSupportedError) |
| Logseq | None (external resolution) | High | External tools only |

### Finding: SiYuan's content-aware merge at block level reduces conflict frequency vs line-level text merge
**Confidence:** CONFIRMED
**Evidence:** `sync.go`: parses `.sy` document tree, compares block structures. Fold-attribute changes (expand/collapse) treated as non-essential and discarded if cloud version is newer. Genuine conflicts preserved in history folder with timestamps. Cloud lock mechanism serializes multi-device sync attempts.

### Finding: The architectural choice of where git runs determines conflict surface area
**Confidence:** CONFIRMED
**Evidence:** Three models observed:

1. **Server-side via API (TinaCMS):** Conflicts only appear at PR merge time in GitHub's UI. Content editors never see conflict markers.
2. **Custom non-git sync (SiYuan, Joplin):** Conflicts handled by custom merge logic. Block-level (SiYuan) or note-level (Joplin) granularity. No git conflict markers.
3. **Client-side git wrapper (Obsidian-Git, Logseq):** Full git conflict complexity exposed. Desktop can show conflict markers; mobile is fundamentally broken.

### Finding: Collaboration model is universally single-user multi-device, not multi-user
**Confidence:** CONFIRMED
**Evidence:**

- Obsidian-Git: No presence indicators, no awareness of other users. Most common conflict source: `workspace.json`. Community recommendation: `.gitignore` workspace files. Discussion #709 confirms multi-user is not a designed use case.
- TinaCMS: Multi-user by design via branch isolation. No real-time collaboration, no CRDT, no presence. Editors work on separate branches.
- Logseq: Single-user multi-device. 60-second auto-commit creates rapid divergence on simultaneous editing.
- Joplin: Single-user multi-device. Note-level conflict granularity.
- SiYuan: Single-user multi-device with cloud lock serialization.

### Finding: Retreat-to-CLI frequency correlates inversely with git operation location
**Confidence:** CONFIRMED
**Evidence:**

```
Never retreats ←————————————————————————→ Frequently retreats
Joplin   SiYuan   TinaCMS(→GitHub UI)   Obsidian-Git(desktop)   Obsidian-Git(mobile)   Logseq
```

**Obsidian-Git retreat scenarios (6 confirmed):**
1. Mobile merge conflicts — `MergeNotSupportedError` (Issue #906)
2. Authentication failures — SSH/credential/PAT issues (Issue #204)
3. Snap/Flatpak sandboxing — can't access system git binary
4. Corrupted git state — lock files, detached HEAD, index corruption
5. Force operations — no force-push/pull in UI (Discussion #616)
6. Complex .gitignore — `git rm --cached` has no UI equivalent (Issue #803)

**TinaCMS retreat scenarios (3, all to GitHub web UI, not CLI):**
1. PR merge conflicts → GitHub web conflict resolution
2. Branch cleanup → GitHub or git CLI
3. Schema migration → Tina CLI re-run

**Key insight:** TinaCMS retreats to GitHub's web UI (a capable interface), not to terminal. The abstraction degrades gracefully.

---

## Gaps / follow-ups

- Multi-user collaboration patterns in Obsidian-Git beyond simple multi-device sync are poorly documented
- Logseq's git-auto shell script (https://github.com/logseq/git-auto) deserves source-level analysis for its push implementation
- SiYuan's fold-attribute discard strategy is a distinctive content-aware merge approach worth deeper investigation
