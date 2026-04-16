# Evidence: Auto-save / Persistence Debounce

**Dimension:** D4 — Auto-save and persistence debounce in production systems
**Date:** 2026-04-16
**Sources:** VS Code docs, JetBrains docs, Obsidian forums, Hocuspocus source, Google Docs analysis

---

## Production auto-save values

| System | Default Save Interval | Configurable? | Notes |
|--------|----------------------|---------------|-------|
| VS Code (afterDelay) | 1,000ms | Yes (ms) | Off by default |
| JetBrains (idle timer) | ~15s | Yes (seconds) | Also saves on focus loss |
| Obsidian | ~2,000ms | Plugin only | Direct to .md files on disk |
| Notion | Real-time / continuous | No | WebSocket, event-triggered |
| Google Docs | Real-time / continuous | No | OT, per-keystroke ops |
| Hocuspocus debounce | 2,000ms | Yes (ms) | Persistence hook debounce |
| Hocuspocus maxDebounce | 10,000ms | Yes (ms) | Upper bound guarantee |
| Tiptap Cloud (recommended) | 5,000ms / 30,000ms | Yes | Higher for cloud persistence |
| MS Office 365 AutoSave | "Few seconds" | No | OneDrive/SharePoint |
| MS Office AutoRecover | 10 minutes | Yes | Local fallback |
| WordPress | 60s | Yes | Server-side draft |
| Figma | Real-time + 30min checkpoints | No | Delta-based |

## Version history granularity (D6)

| System | Granularity | Notes |
|--------|------------|-------|
| VS Code local history | mergeWindow: 10s | Changes within 10s merged into one entry |
| JetBrains local history | Per-save (~15s idle) | Each idle-save creates a history entry |
| Figma version history | 30 min checkpoints | Auto-checkpoints every 30 min |
| Google Docs | ~few seconds per revision | But groups rapid edits |
| Notion | — | No user-visible version granularity docs |

Sources: VS Code settings docs, JetBrains help docs, Obsidian forums, Hocuspocus configuration docs
