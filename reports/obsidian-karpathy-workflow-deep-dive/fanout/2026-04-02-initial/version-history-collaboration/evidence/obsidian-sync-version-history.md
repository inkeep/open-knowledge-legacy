# Evidence: Obsidian Sync Version History

## Version History Feature

### Retention Periods (by Plan)
| Plan | Retention Period | Price |
|------|-----------------|-------|
| Standard | 1 month | $4/mo (annual) |
| Plus | 12 months | $8/mo (annual) |

After the retention period, older versions are permanently deleted.

**Source:** [Obsidian Help — Version history](https://help.obsidian.md/Obsidian+Sync/Version+history)

### How to Access
1. Right-click on the file in the File explorer
2. Select "Open version history" (or "View Sync Version History")
3. Versions listed chronologically on the left panel
4. Selected version's content displayed on the right panel

### Restore Process
1. Select the version to restore from the left panel
2. Click "Restore" button on the right
3. Restored version becomes the current version
4. Syncs to all connected devices automatically

### Additional Capabilities
- Can copy version contents to clipboard (without full restore)
- Sync sidebar (Obsidian v1.7+) shows recently created/modified synced notes
- No native diff view — but Version History Diff plugin adds this capability

**Source:** [Obsidian Help — Version history](https://help.obsidian.md/Obsidian+Sync/Version+history)
**Source:** [Obsidian Forum — Make the Sync Version History Longer/Indefinite](https://forum.obsidian.md/t/make-the-sync-version-history-longer-indefinite/72694)

### Feature Request: Indefinite History
- Community has requested indefinite version history
- Currently capped at 12 months maximum (Plus plan)
- No official response about extending this

**Source:** [Obsidian Forum — Make the Sync Version History Longer/Indefinite](https://forum.obsidian.md/t/make-the-sync-version-history-longer-indefinite/72694)

## Sync Conflict Resolution

### Merge Algorithm
- Markdown files: Google's **diff-match-patch** algorithm for three-way merge
- Non-Markdown files (images, PDFs, Canvas): **last-modified-wins** strategy
- Default behavior: "Automatically merge" — combines all changes from different devices

### Known Issues
- Three-way merge can create duplicate text or formatting problems
- Reported cases of newer data being overwritten by older data
- No manual merge conflict resolution UI (feature request with community votes)

**Source:** [DeepWiki — Synchronization and Conflict Resolution](https://deepwiki.com/obsidianmd/obsidian-help/2.3-filters-and-views)
**Source:** [Obsidian Forum — Robust Sync Conflict Resolution](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)
**Source:** [Obsidian Forum — Option to let user manually resolve sync conflicts](https://forum.obsidian.md/t/option-to-let-user-manually-resolve-sync-conflicts/94468)

## Karpathy Workflow Implications

| Aspect | Assessment |
|--------|-----------|
| Version retention | 1-12 months depending on plan; insufficient for permanent wiki history |
| Restore granularity | Full-file restore only; no line-level selective restore |
| Diff capabilities | Not native — requires Version History Diff community plugin |
| Conflict resolution | Automatic three-way merge; no manual resolution; risky for agent+human |
| Agent attribution | None — Sync versions don't track who made changes |
| Multi-device scenario | Sync designed for human-across-devices, not human+agent |
