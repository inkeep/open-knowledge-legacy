# Evidence: D6 — Electron ecosystem recommendations for shared-across-window preferences

**Dimension:** D6 — electron-store vs localStorage vs main-process IPC, with Chromium origin-sharing semantics
**Date:** 2026-04-21
**Sources:** electron-store (sindresorhus); Electron official docs via search results; Cameron Nokes "How to store user data in Electron"; ecosystem best-practices articles

---

## Key files / pages referenced

- [electron-store (sindresorhus)](https://github.com/sindresorhus/electron-store)
- [Cameron Nokes: How to store user data in Electron](https://cameronnokes.com/blog/how-to-store-user-data-in-electron/)
- [Electron App Storage — where localStorage is stored](https://copyprogramming.com/howto/where-an-electron-application-s-sessionstorage-and-localstorage-stored)
- [capacitor-community/electron Issue #77 — shared storage across windows](https://github.com/capacitor-community/electron/issues/77)
- [Persisting Data in ElectronJS (GeeksforGeeks)](https://www.geeksforgeeks.org/persisting-data-in-electronjs/)

---

## Findings

### Finding: electron-store is the ecosystem-canonical library for user preferences in Electron; stores JSON in `app.getPath('userData')`

**Confidence:** CONFIRMED
**Evidence:** [electron-store README](https://github.com/sindresorhus/electron-store)

> "Simple data persistence for your Electron app or module - Save and load user preferences, app state, cache, etc"

> "By default, the configuration file is stored in `app.getPath('userData')`."

> "Atomic writes to prevent corruption if the process crashes during a save operation."

> "Automatic migrations and defaults."

Default path per platform:
- macOS: `~/Library/Application Support/<AppName>/config.json`
- Linux: `~/.config/<AppName>/config.json`
- Windows: `%APPDATA%\<AppName>\config.json`

Supports schema validation via JSON Schema, versioned migrations, encryption, and change watchers.

**Implications:** When you need more than a primitive key-value pair (validation, migrations, cross-process), electron-store is the default answer. For a single boolean editor-mode key, it's overkill — but it scales cleanly as preferences grow.

---

### Finding: electron-store works in BOTH main and renderer processes; cross-process watch enables multi-window sync

**Confidence:** CONFIRMED
**Evidence:** [electron-store README](https://github.com/sindresorhus/electron-store)

> "The library works in both main and renderer processes. For renderer-only usage without a main process Store instance, you must call Store.initRenderer() in the main process first to establish the required IPC communication channels."

> "The watch feature enables cross-process state sharing: 'Watch for any changes in the config file and call the callback for onDidChange or onDidAnyChange if set.'"

Under the hood: renderer invokes main via IPC; main writes the file; main broadcasts change events via IPC back to every renderer with a watcher.

**Implications:** Explicit, first-class cross-window stickiness — but requires `Store.initRenderer()` in main process setup and the watch-callback boilerplate in each renderer. More code than `localStorage.setItem` + `window.addEventListener('storage', ...)`.

---

### Finding: localStorage in Electron BrowserWindows is LevelDB-backed and shared by origin — automatically multi-window-sticky

**Confidence:** CONFIRMED
**Evidence:** [copyprogramming.com — where localStorage is stored](https://copyprogramming.com/howto/where-an-electron-application-s-sessionstorage-and-localstorage-stored), [capacitor-community issue #77](https://github.com/capacitor-community/electron/issues/77)

> "In Electron, localStorage and sessionStorage are stored in LevelDB across Windows, macOS, and Linux, but both are limited to approximately 5 MB per origin, making them suitable only for small settings."

> "Each window shares localStorage by default if they have the same origin (domain/port)."

> "To isolate storage between windows, use session.fromPartition() when creating windows, or open windows with different ports."

The LevelDB file lives under the userData directory (e.g., `~/Library/Application Support/<AppName>/Local Storage/leveldb/`).

**Implications:** Two BrowserWindows loading the same origin share localStorage automatically. Writes from window A are visible to window B via either synchronous re-read (next localStorage.getItem call in B) OR the `storage` event fired on B's `window`. This is what Open Knowledge's `ok-theme-v1` and `ok-pin-v1` already rely on.

Origin stability across environments matters: dev (`http://localhost:5173` or similar) vs packaged (`file://` or `app://`) may be different origins — localStorage is NOT shared between dev and prod builds. Not a problem for sticky-preference UX in prod; worth flagging for dev testing.

---

### Finding: Industry recommendation hierarchy is electron-store > IndexedDB > SQLite > localStorage

**Confidence:** CONFIRMED
**Evidence:** synthesized from Cameron Nokes's blog and ecosystem articles

> "For modern Electron applications, the best practice hierarchy is: electron-store for settings → IndexedDB for complex, offline-capable data → SQLite for relational data → localStorage only for simple, temporary values."

Rationale:
- electron-store: small structured prefs, works across processes, atomic writes, migrations.
- IndexedDB: async, large storage, good for offline content caches.
- SQLite: relational data (e.g., via better-sqlite3).
- localStorage: simple sync KV; limited to 5 MB; origin-shared.

**Implications:** The "simple, temporary values" label on localStorage is slightly misleading — localStorage persists across sessions just like electron-store; the difference is in formality (schema, validation, migrations, cross-process semantics). For a single boolean editor-mode preference, localStorage is well-matched to the workload.

---

### Finding: Many production Electron apps use localStorage for UX preferences (theme, layout, mode) despite the "industry recommendation hierarchy"

**Confidence:** INFERRED (from the prevalence in Electron codebases I've inspected and surveyed during prior Open Knowledge research)
**Evidence:** Open Knowledge itself uses `localStorage` for `ok-theme-v1` (next-themes) and `ok-pin-v1` (DocumentContext); other Electron wrappers ship similar patterns.

The recommendation hierarchy assumes preferences need schema/validation/migrations. When preferences are single-typed, documented in code, and cheap to re-initialize, localStorage is the pragmatic choice.

**Implications:** For Open Knowledge's editor-mode preference, localStorage matches the existing repo patterns and the actual requirements. electron-store is NOT needed unless the spec adds: (a) validated multi-key preference object, (b) cross-process write scenarios (main + renderer both write), or (c) a need for encryption.

---

### Finding: Main-process IPC without a library is the fallback when you need custom validation or server-side logic before persisting

**Confidence:** CONFIRMED (matches Electron documented patterns)
**Evidence:** [Electron official docs on IPC](https://www.electronjs.org/docs/latest/tutorial/ipc) (general knowledge)

Pattern:
```ts
// main.ts
ipcMain.handle('pref.set', async (_, key, value) => {
  await validate(key, value);
  await writeToDisk(key, value);
  // broadcast to other windows
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('pref.changed', key, value));
});
```

Used when: the write side has invariants (e.g., validate enum against server state), or when Open Knowledge's main process already owns the preference surface.

**Implications:** Overkill for a single boolean preference. electron-store or localStorage covers the 95% case with far less code.

---

## Pattern synthesis — decision tree for Open Knowledge

| Requirement | Pick this |
|---|---|
| Simple boolean / string / enum, renderer-only use, web + Electron parity | **localStorage** (versioned key) — matches repo's existing `ok-*-v1` pattern |
| Structured preference object, schema-validated, migrations, encryption | electron-store |
| Preference that main process reads/writes (e.g., menu-bar state, tray icon) | electron-store or custom IPC |
| Preference that must survive localStorage LevelDB corruption | electron-store (atomic writes) |
| Preference shared across multiple *different-origin* BrowserWindows | electron-store + `watch: true` |

For Open Knowledge's editor-mode persistence (web + Electron, single boolean-ish, renderer-only): **localStorage is the right tool**. Moving to electron-store would add complexity without buying new capability for this specific feature.

---

## Negative searches

- Searched for "Electron localStorage corruption frequency" — no strong claims found that LevelDB-backed localStorage corrupts more than electron-store's config.json. Both handle atomic writes differently (localStorage via Chromium; electron-store via the `write-file-atomic` pattern).
- Searched for "Electron BroadcastChannel multi-window" — relevant alt pattern for explicit cross-window events, but overkill for one-way preference sticky behavior. Noted, not pursued.

---

## Gaps / follow-ups

- If Open Knowledge's spec later grows preferences (per-doc mode memory, per-project overrides), reconsider localStorage vs electron-store at that point. Current scope doesn't require the upgrade.
- Verify Open Knowledge's Electron BrowserWindow setup does NOT use `session.fromPartition(...)` per window. If it ever does, origin-sharing breaks and localStorage is no longer sticky across windows — electron-store would become the right choice then.
