# Evidence: Obsidian Auto-Save Behavior and File Recovery

## Auto-Save Mechanism

### Default Behavior
- Obsidian automatically saves files ~2 seconds after the start of user input
- Saves every 2 seconds until no more changes are detected (debounced)
- Uses an internal `requestSave` debounce event system
- Neither `vault.process` nor `vault.modify` API calls work if a `requestSave` debounce event is running (within 2 seconds of a file being edited)

**Source:** [Obsidian Forum — "Saving" on Obsidian explain for a noob](https://forum.obsidian.md/t/saving-on-obsidian-please-explain-for-a-noob/53693)
**Source:** [Obsidian Forum — vault.process and vault.modify don't work with requestSave debounce](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)

### Crash Recovery Risks
- A user reported losing ~4 days of notes after a forced quit + hard shutdown (Aug 2024)
- Daily journal file showed no changes since August 16 despite days of editing
- Auto-save is present but not guaranteed during unexpected shutdowns

**Source:** [Obsidian Forum — Lost about a day of notes - no autosave?](https://forum.obsidian.md/t/lost-about-a-day-of-notes-no-autosave/87223)

### Autosave Control Plugin
- Third-party plugin `obsidian-autosave-control` allows overriding default auto-save frequency
- Can delay automatic saves while keeping manual saves (Ctrl+S) immediate
- Wraps Obsidian's generic `save()` function and distinguishes autosave vs. other save types

**Source:** [GitHub — mihasm/obsidian-autosave-control](https://github.com/mihasm/obsidian-autosave-control)

## File Recovery Core Plugin

### How It Works
- Core plugin (ships with Obsidian, enabled by default)
- Saves complete snapshots of note content at regular intervals
- Captures full content, not diffs — any previous version can be restored

### Default Configuration
- **Snapshot interval:** Every 5 minutes (configurable)
- **Retention period:** 7 days (configurable)
- Only `.md` and `.canvas` files are supported

### Storage
- Snapshots stored **outside the vault** in Obsidian's global settings directory
- Uses absolute file paths — survives vault-level data loss
- Not a complete backup solution — separate backups still recommended

**Source:** [Obsidian Help — File recovery](https://help.obsidian.md/plugins/file-recovery)
**Source:** [Obsidian Forum — Does File Recovery plugin use lot of storage?](https://forum.obsidian.md/t/does-file-recovery-plugin-use-lot-of-storage-is-every-5-mn-for-10-years-reasonable-how-to-backup-snapshots/101963)

## Time Machine Plugin (Community)

### Overview
- Plugin by dsebastien (Sébastien Dubois)
- Visual timeline slider for browsing File Recovery snapshots
- Colored diff view (green additions, red deletions)
- Full version restore OR selective restore (individual paragraphs)
- Merges File Recovery snapshots + Git commit history into unified timeline

### Requirements
- File Recovery core plugin must be enabled
- Optionally integrates Git history if vault is in a Git repository

**Source:** [GitHub — dsebastien/obsidian-time-machine](https://github.com/dsebastien/obsidian-time-machine)
**Source:** [dsebastien.net — Never Lose a Note Again — Time Machine Plugin](https://www.dsebastien.net/never-lose-a-note-again-time-machine-plugin-for-obsidian/)

## Karpathy Workflow Implications

| Aspect | Assessment |
|--------|-----------|
| Auto-save reliability | Good for normal use; 2-second debounce means agent writes flush quickly |
| Crash recovery | Weak — data loss reported on unexpected shutdowns |
| File Recovery snapshots | Useful safety net, but 5-minute default interval may miss rapid LLM writes |
| File Recovery retention | 7 days default is short for a compounding knowledge base |
| Time Machine plugin | Best-in-class UX for browsing history + selective restore |
| Agent attribution | None — File Recovery snapshots don't track who/what made changes |
