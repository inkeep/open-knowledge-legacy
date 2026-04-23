# Evidence: D3 — Cross-window / cross-tab / cross-vault stickiness semantics

**Dimension:** D3 — How preferences survive new tabs, new windows, and multi-project/vault scenarios
**Date:** 2026-04-21
**Sources:** Obsidian forum; VS Code docs; Electron ecosystem references; Zettlr + Joplin source patterns

---

## Key files / pages referenced

- [Obsidian forum: Global Settings across multiple vaults](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789)
- [Obsidian forum: default view mode behavior](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322)
- [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync)
- [Electron localStorage multi-window (capacitor-community issue #77)](https://github.com/capacitor-community/electron/issues/77)
- [electron-store watch semantics](https://github.com/sindresorhus/electron-store)

---

## Findings

### Finding: Obsidian preferences are vault-scoped; switching vaults means switching prefs. Multiple vault windows are effectively isolated per-vault.

**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/41789](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789)

> "Each vault maintains its own .obsidian configuration folder, requiring users to reconfigure settings for every new vault."

> "The only workaround...is cumbersome."

**Implications:** Obsidian's design intentionally isolates vaults. Consequence: if you prefer Source mode in Vault A (work) but Live Preview in Vault B (journal), the model works for you. If you prefer Source everywhere, the model *fights* you. Every new vault re-starts from Live Preview (the app default).

This is the exact design Open Knowledge's spec is trying to avoid per your ask: "multiple instances of the electron app running in multiple windows (e.g. 2 windows, one for project A, one for project B), the preference should be sticky through there too."

---

### Finding: Within a single Obsidian vault, a new tab/pane resets to the global default — last-used sticks per-pane only

**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/48322](https://forum.obsidian.md/t/globally-set-editors-default-mode-source-mode-live-preview-reading/48322)

> "If there is a new tab opened, the selected default mode on the last tab is set back to the permanent default 'Live Preview'"

> "Whatever mode you were in when you last opened a file or a link persists to the next link or file you open."

Observed behavior model:
- **New tab/pane:** reads global default (app.json)
- **Navigate within same tab:** preserves tab's current mode
- **App restart:** global default rehydrates, no last-used-tab memory

**Implications:** Obsidian's "sticky" mechanism is session-local-per-pane. Not full stickiness across app restarts. Users have complained about this for years — the mental model "always Source" isn't supported natively.

---

### Finding: VS Code user-scope settings sync across all windows of the same user, plus across devices via Settings Sync

**Confidence:** CONFIRMED
**Evidence:** [VS Code Settings Sync docs](https://code.visualstudio.com/docs/configure/settings-sync)

> "Setting Sync is a VS Code built-in functionality that allows you to share and use your preferences across multiple machines. You can sync preferences such as Settings, Keyboard Shortcuts, User Snippets, Extensions, and UI State."

All windows on a machine read the same `settings.json` (user tier). Settings Sync extends this to all machines signed in with the same GitHub/Microsoft account.

**Implications:** VS Code demonstrates the "one preference, everywhere for this user" model, scaled to cross-device. Open Knowledge's immediate target (cross-window same-install) is a strict subset.

---

### Finding: Electron localStorage is automatically shared across BrowserWindows of the same origin

**Confidence:** CONFIRMED
**Evidence:** [capacitor-community/electron issue #77](https://github.com/capacitor-community/electron/issues/77), general Electron ecosystem docs

> "Each window shares localStorage by default if they have the same origin (domain/port)."

> "In Electron, localStorage and sessionStorage are stored in LevelDB across Windows, macOS, and Linux."

LevelDB is single-file; every Electron BrowserWindow that loads the same origin opens the same LevelDB. Writes from one window are immediately visible to reads from another (same-transaction semantics within Chromium).

**Implications:** For Open Knowledge Electron distribution: one editor-mode localStorage key automatically gives cross-window stickiness. No electron-store, no IPC, no custom broadcast. This is what `ok-theme-v1` and `ok-pin-v1` already do.

**Catch** (not yet verified — flagged as gap): In Open Knowledge's Electron setup, every project window is spawned from the same renderer entry (electron-vite dev server OR packaged `file://` assets). They should share origin. But if a future multi-profile design uses `session.fromPartition('project-A')` to isolate per-project, localStorage isolation *would* kick in and sticky-across-windows would break. Worth verifying before locking in the approach.

---

### Finding: electron-store offers explicit cross-process watch for cases where multiple processes write the same file

**Confidence:** CONFIRMED
**Evidence:** [electron-store README](https://github.com/sindresorhus/electron-store)

> "Watch for any changes in the config file and call the callback for onDidChange or onDidAnyChange if set. This is useful if there are multiple processes changing the same config file."

`watch: true` enables file-watch; write in window A → callback fires in window B after a short debounce.

**Implications:** If preferences ever need to be shared across processes where each process is a *different origin* or different Electron session, electron-store is the right tool. For cross-window-same-origin, localStorage does it for free with lower latency.

---

### Finding: Obsidian Sync (paid plugin) has vault-level granularity — does sync editor-mode default across devices for the same vault, but not across vaults

**Confidence:** INFERRED (Obsidian Sync feature set documented; specific behavior for `app.json` inferred from the feature's "sync settings" toggle)
**Evidence:** [Obsidian Sync docs](https://help.obsidian.md/Obsidian+Sync) (general understanding)

Obsidian Sync has a "Sync settings" toggle per-vault. When enabled, it syncs `.obsidian/app.json` across devices for that vault.

**Implications:** Confirms the Obsidian design assumption: the vault is the unit of preference. Multi-vault cross-device is still manual. This is a "what Open Knowledge could do" pointer (per-project sync) rather than a template for the current spec (user-global sticky).

---

## Pattern taxonomy (cross-window/cross-project stickiness)

| Pattern | Stickiness boundary | Examples | Implementation cost |
|---|---|---|---|
| Per-project config | Project/vault/workspace | Obsidian vault, VS Code workspace | High — touches filesystem per project; requires scope model |
| User-global single-file config | Install (all windows) | Joplin, Zettlr, VS Code user tier | Low — single JSON write, single read |
| Origin-shared localStorage | Origin (all windows of same Electron origin) | Any Electron app using renderer localStorage | Trivial — browser-provided |
| User-global + cross-device sync | User account | VS Code Settings Sync, Obsidian Sync (vault-level) | High — auth + transport |
| URL-state only | Per-page-load | HedgeDoc | Trivial — but not sticky |

---

## Negative searches

- Searched for "Obsidian cross-vault sync settings natively" — NOT FOUND (requires paid Sync plugin and still scoped per-vault).
- Searched for Electron apps using main-process IPC *instead of* localStorage for simple renderer prefs — NOT FOUND as a common recommendation. The recommendation converges on electron-store-or-localStorage depending on complexity.

---

## Gaps / follow-ups

- Quick verify: Open Knowledge's Electron configuration — does every BrowserWindow definitely use the same `session`? Check `packages/desktop/src/main/window-manager.ts` for any `session.fromPartition` usage. If none, localStorage origin-sharing is safe for the near-term spec.
- Does VS Code's `workbench.editorAssociations` get synced by Settings Sync? Likely yes (user-tier), but not verified against Settings Sync doc.
