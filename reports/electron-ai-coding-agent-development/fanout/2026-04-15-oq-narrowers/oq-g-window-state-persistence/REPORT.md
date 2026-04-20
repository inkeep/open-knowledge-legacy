# OQ-G Narrower: Window-state persistence shape

## Key finding
Two-tier storage is universal: app-level state.json (recents + geometry) + per-project workspace state. Recommended: single state.json via electron-store, Zod-validated, realpath-canonicalized contentDir as key, LRU array cap 20, window bounds co-located with project entry, rename-corrupt-and-start-fresh recovery. Full Zod schema proposed.

Full evidence from subagent — Obsidian, VS Code, Cursor, Slack patterns surveyed with primary sources.
