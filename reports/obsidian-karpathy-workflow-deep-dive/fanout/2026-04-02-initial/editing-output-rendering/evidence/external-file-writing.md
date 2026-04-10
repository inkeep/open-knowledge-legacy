# Evidence: External Process File Writing to Obsidian Vaults

## File Watching Mechanism
- Obsidian uses Node.js/Electron file watching (likely `fs.watch`)
- **macOS/Windows**: Detects external changes in subdirectories reliably and near-instantly
- **Linux**: File watcher ONLY detects changes in vault root directory — subdirectory changes undetected until restart (documented Electron limitation)
- Network drives and SMB shares explicitly unsupported

### Plugin API Events
- `app.vault.on('create')` — fires on new file detection
- `app.vault.on('modify')` — fires on file modification
- `app.vault.on('rename')` — fires on file rename
- Source: https://docs.obsidian.md/Reference/TypeScript+API/Vault

## Critical Behavior: Editing Open Note During External Write

**This is the primary danger for the Karpathy workflow.**

1. If a note is open in Obsidian editor AND an external process writes to the same file:
   - Obsidian does NOT auto-reload the visible content
   - Stale version remains displayed
   - If user then edits in Obsidian, their save **OVERWRITES external changes silently**
   - No conflict dialog, no merge
2. Workaround: navigate away from note and back, or "Force reload" from command palette
3. Some macOS users report slightly better behavior but not guaranteed

### Sources
- External change monitoring: https://forum.obsidian.md/t/monitoring-for-external-changes/51660
- Auto-reload request: https://forum.obsidian.md/t/is-there-a-way-to-auto-reload-changed-files/83006
- Linux file watcher limitation: https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174
- Network drives: https://forum.obsidian.md/t/file-changes-on-a-network-drive-made-outside-obsidian-are-not-shown/22710/3

## New Files Created Externally
- New `.md` files detected by file watcher (macOS/Windows)
- Appear in file explorer, indexed for search and link resolution
- Vault `create` events fire, plugins see them
- On Linux, only works for vault root

## Rapid Batch Changes
- No built-in throttling problems documented
- File watcher events queue up
- Brief delay before search index catches up with many simultaneous files

## Recommended Architecture for LLM Agents
Two approaches:
1. **Obsidian Local REST API plugin** — safest; Obsidian mediates all writes
   - https://github.com/cyanheads/obsidian-mcp-server
2. **Direct filesystem writes** (via mcpvault) — simpler but bypasses Obsidian
   - https://github.com/bitbonsai/mcpvault

## Related Settings
- "Detect all file types" (Settings > Files & Links): Shows non-markdown files in explorer
- Dotfiles/hidden folders still excluded even with this enabled
- https://forum.obsidian.md/t/hidden-folders-dotfiles-not-showing-in-file-explorer-despite-detect-all-file-types-being-enabled/106685

## Community Workarounds
- File Explorer Reload plugin: https://github.com/mnaoumov/obsidian-file-explorer-reload
