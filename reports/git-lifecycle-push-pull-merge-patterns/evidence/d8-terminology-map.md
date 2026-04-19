# Evidence: D8 Git-to-User Vocabulary Map (Update 2026-04-14)

**Dimension:** D8 — Git terminology substitutions and mental model projections across the editor spectrum
**Date:** 2026-04-14
**Sources:** Obsidian-Git, TinaCMS, Logseq, SiYuan, Joplin, Linear, Notion, iCloud Drive, Dropbox, GitHub Desktop, VS Code, GitKraken (docs + source)

---

## Key files / pages referenced

- `Vinzent03/obsidian-git` `src/commands.ts` — 30+ registered commands
- [TinaCMS Editorial Workflow](https://tina.io/docs/tinacloud/editorial-workflow)
- [Joplin sync spec](https://joplinapp.org/help/dev/spec/sync/)
- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- [Apple TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html)
- [Dropbox conflicted copy help](https://help.dropbox.com/organize/conflicted-copy)
- [VS Code source control docs](https://code.visualstudio.com/docs/sourcecontrol/overview)
- [GitKraken interface docs](https://support.gitkraken.com/start-here/interface/)
- [GitHub Desktop syncing docs](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop)

---

## Findings

### Finding: Five-tier vocabulary abstraction model refines parent report's spectrum
**Confidence:** CONFIRMED
**Evidence:** Term-level mapping across 12 products

**Tier 1 — No version-control vocabulary:** Linear, iCloud Drive, Dropbox, Notion. Changes "just happen." Conflicts surface as renamed files or system dialogs. Zero git concepts exposed.

**Tier 2 — One opaque "Sync" button:** Joplin ("Synchronise"), SiYuan ("Sync now"). All operations behind one button. "Sync target" / "Data snapshot" replace git terms.

**Tier 3 — "Save" makes one commit; branch/PR exposed selectively:** TinaCMS. "Save" = GitHub API commit. "Branch" visible in editorial workflow. No push/pull/merge/conflict in the editor itself.

**Tier 4 — Git operations named but simplified; unified by default:** Logseq ("Git auto commit" toggle), Obsidian-Git basic ("Commit-and-sync"), VS Code ("Sync Changes" = pull+push).

**Tier 5 — Full git vocabulary, 1:1 command mapping:** Obsidian-Git advanced (30+ commands), GitHub Desktop ("Push origin", "Pull origin"), GitKraken (full vocabulary + graph).

### Finding: Vocabulary abstractions fracture under failure conditions
**Confidence:** CONFIRMED
**Evidence:** Error message analysis across 8 tools

Every tool that abstracts git vocabulary eventually exposes lower-level terms in error messages. Obsidian-Git: "Merge conflict in file.md" / "Failed to push." TinaCMS: "422 Unprocessable Entity" / "SHA mismatch." SiYuan: "Lock acquisition failed." Joplin: "_Conflict_" notebook appears. iCloud: "Versions conflict" dialog. Dropbox: filename becomes the error message.

**Linear is the sole exception** — maintains vocabulary abstraction even under failure. Error surfaces are "Sync failed" toast or "Please reload the application." No implementation-level terms exposed.

### Finding: "conflict" is the most inconsistently mapped git concept across the spectrum
**Confidence:** CONFIRMED
**Evidence:** Per-tool conflict vocabulary

| Tool | Conflict term | Surface |
|------|--------------|---------|
| Obsidian-Git | "Merge conflict" (raw git) | In-file markers |
| TinaCMS | N/A (branch isolation avoids) | GitHub PR UI |
| SiYuan | "Conflict" files in sync history | Timestamped copies |
| Joplin | "_Conflict_" notebook | Conflict notes |
| Linear | N/A (LWW, never user-facing) | None |
| Notion | "Conflict copies" | Duplicate pages |
| iCloud | "Versions conflict" (dialog) | Bounced files |
| Dropbox | "conflicted copy" (in filename) | Renamed files |
| GitHub Desktop | "Merge conflicts" | File markers |
| VS Code | "Merge conflicts" | Inline + 3-way editor |

### Comprehensive Vocabulary Mapping (selected key concepts)

| Git concept | Obsidian-Git | TinaCMS | Joplin | SiYuan | Linear | Notion | GitHub Desktop | VS Code |
|---|---|---|---|---|---|---|---|---|
| commit | "Commit" / "Commit-and-sync" | "Save" | N/A (implicit) | "Snapshot" | "Transaction" (internal) | "Edit" (implicit) | "Commit to main" | "Commit" |
| push | "Push" (command) | Invisible (API) | Part of "Synchronise" | Part of "Sync" | Invisible (queue) | Invisible | "Push origin" | "Push" / "Sync Changes" |
| pull | "Pull" (command) | N/A | Part of "Synchronise" | Part of "Sync" | Invisible (delta) | Invisible | "Pull origin" | "Pull" / "Sync Changes" |
| branch | "Switch branch" | "Branch" (editorial) | N/A | N/A | N/A | N/A | "Current branch" | Status bar |
| reset | "Discard all changes" | N/A | "Previous versions" | "Rollback" | N/A | "Restore" | "Undo commit" | "Undo Last Commit" |
| remote | "Edit remotes" | GitHub repo (configured) | "Sync target" | "Cloud" | "Server" (implicit) | "Cloud" (implicit) | "Remote" | "Remote" |

---

## Gaps / follow-ups

- Notion's offline mode (Aug 2025) introduced new vocabulary around "available offline" and "conflict copies" — may evolve further
- The fracture gradient (how far vocabulary drops on error) correlates inversely with the normal abstraction level — tools that hide more have more jarring fractures
