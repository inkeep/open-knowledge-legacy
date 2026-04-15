# Evidence: D6 Recovery UX by Failure Mode (Update 2026-04-14)

**Dimension:** D6 — Recovery UX for five specific failure modes
**Date:** 2026-04-14
**Sources:** VS Code, GitHub Desktop, JetBrains, GitKraken, lazygit, Tower, Sublime Merge, Linear, Figma (docs + source)

---

## Key files / pages referenced

- [VS Code merge conflicts docs](https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts)
- [JetBrains push docs](https://www.jetbrains.com/help/idea/commit-and-push-changes.html)
- [GitKraken push/pull docs](https://help.gitkraken.com/gitkraken-desktop/pushing-and-pulling/)
- [Tower merge conflicts docs](https://www.git-tower.com/learn/git/ebook/en/desktop-gui/advanced-topics/merge-conflicts)
- [GitHub Desktop Issue #7440](https://github.com/desktop/desktop/issues/7440) — interrupted clone
- [GitHub Desktop Issue #1627](https://github.com/desktop/desktop/issues/1627) — conflict dialog confusion
- [GitHub Desktop Issue #16914](https://github.com/desktop/desktop/issues/16914) — credential prompts
- [GitHub Docs — Token expiration](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — Linear rollback pattern
- [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

---

## Findings

### Finding: Rejected push recovery spans 5 strategies from auto-retry to bare error
**Confidence:** CONFIRMED
**Evidence:** JetBrains push docs, GitKraken docs, VS Code source, lazygit source

| Editor | Action Buttons | Notable |
|--------|---------------|---------|
| VS Code | "Pull then Push", "Pull", (opt-in) "Force Push" | Notification toast |
| JetBrains | **Rebase**, **Merge** as equal-weight buttons + "Remember choice" checkbox | Only editor presenting both as peers |
| GitHub Desktop | Pull button; "Force push origin" after rebase | Contextual button label change |
| GitKraken | "Pull (FF if possible)", "Force Push", "Cancel" | Banner UX |
| lazygit | Force push confirmation (Enter/Esc) | `--force-with-lease` default |
| Tower | Force flag in Push dialog | Warning about risks |
| Sublime Merge | `--force-with-lease` via advanced menu | Output panel error |

No editor creates an automatic backup/stash before recovery pull.

### Finding: Pull conflict resolution spans 4 architectures with VS Code's AI-assisted 3-way editor as state of the art
**Confidence:** CONFIRMED
**Evidence:** VS Code merge docs, JetBrains docs, Tower docs, GitHub Desktop Issue #1627

VS Code: inline CodeLens (4 actions) + 3-way merge editor + Copilot AI resolution. JetBrains: three-panel merge tool with per-chunk accept/reject. GitHub Desktop: file-list dialog with "Open in Editor" — closing dialog does NOT abort merge (documented UX confusion). Tower: Conflict Wizard with Abort button.

### Finding: No editor implements silent token refresh on auth failure
**Confidence:** CONFIRMED
**Evidence:** VS Code source (`askpass.ts`), GitHub Desktop Issue #16914, JetBrains source

All editors surface auth failure as user-facing error requiring manual re-authentication. GitHub OAuth tokens (`gho_`) don't auto-expire for GitHub, making this a GitLab/Bitbucket/Azure concern. No mid-operation preservation — if push fails partway through auth expiry, the operation simply aborts.

### Finding: Interrupted clone cannot be resumed through any editor UI
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop Issue #7440, git native behavior analysis

Git itself: partial `.git/` directory persists; `git fetch` inside it can recover. GitHub Desktop: must delete partial clone and restart. VS Code: shows error, no cleanup of stale `.git/index.lock`. No editor leverages git's inherent partial-clone recovery.

### Finding: Only JetBrains effectively implements auto-stash for dirty-tree refusal
**Confidence:** CONFIRMED
**Evidence:** JetBrains docs (Smart checkout), GitHub Desktop Issue #15660, git `--autostash` docs

Git supports `--autostash` since 2.9 and `pull.autoStash`/`rebase.autoStash` config. JetBrains "Smart checkout" transparently stashes, switches, and pops. All other editors surface the raw error.

### Finding: Linear handles operation failure via optimistic UI + server-ordered rollback — no user-facing error resolution
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

Changes apply locally immediately (optimistic). Transactions queue to IndexedDB. Server assigns monotonic `syncId`. On rejection, transaction's `rollback` method undoes client-side changes — the change briefly appears then disappears. No merge UI ever shown.

### Finding: Figma uses last-writer-wins with no user-facing conflict resolution
**Confidence:** CONFIRMED
**Evidence:** [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

The server is the central authority. Concurrent edits to the same property: last value sent wins. Anti-flicker during reconnect: Figma discards incoming server changes that conflict with unacknowledged local edits, showing "our best prediction of what the eventually-consistent value will be."

---

## Gaps / follow-ups

- No editor scans staged files for leftover conflict markers (pre-commit hook gap, confirmed in parent report)
- No editor provides "N of M files resolved" aggregate progress during conflict resolution
