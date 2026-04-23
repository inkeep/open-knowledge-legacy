# Evidence: D2 — Storage-location patterns across surveyed editors

**Dimension:** D2 — Where each editor persists the mode preference
**Date:** 2026-04-21
**Sources:** Obsidian forum + help docs; Logseq config docs; Zettlr + Joplin + HedgeDoc source; VS Code docs

---

## Key files / pages referenced

- [Obsidian: How Obsidian stores data](https://help.obsidian.md/data-storage) — `.obsidian/` vault-local folder
- [Obsidian forum: Global Settings across multiple vaults](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789) — no user-level config
- [Obsidian forum: app.json acting up](https://forum.obsidian.md/t/linux-windows-app-json-and-appearance-json-files-acting-up-changes-saved-out-not-respected-upon-relaunch/56170) — JSON file mutations
- [Joplin forum: editor.codeView](https://discourse.joplinapp.org/t/how-to-set-markup-editor-by-default/23477)
- [VS Code Issue #192954](https://github.com/microsoft/vscode/issues/192954) — user vs workspace scope
- [VS Code Settings Sync docs](https://code.visualstudio.com/docs/configure/settings-sync)
- [electron-store README](https://github.com/sindresorhus/electron-store) — canonical Electron preferences lib

---

## Findings

### Finding: Obsidian stores editor mode in per-vault `.obsidian/app.json`; no user-level global file

**Confidence:** CONFIRMED
**Evidence:** [help.obsidian.md/data-storage](https://help.obsidian.md/data-storage), [forum thread 41789](https://forum.obsidian.md/t/global-settings-same-settings-themes-and-plugins-across-multiple-vaults/41789)

> "There is no official user-level global config in Obsidian. Each vault maintains its own `.obsidian` configuration folder, requiring users to reconfigure settings for every new vault." — summary of forum thread

Configuration load order on launch (from help docs):
1. `app.json` — editor behavior and Vim mode
2. `appearance.json` — theme and CSS snippets
3. `workspace.json` — window layout, panes, recent files

Example `app.json` seen in community gists:
```json
{
  "livePreview": false,
  "showLineNumber": true,
  "showInlineTitle": false,
  "showUnsupportedFiles": true,
  "tabSize": 2,
  "attachmentFolderPath": "./"
}
```

**Implications:** Obsidian's user-vs-vault scope tension is a well-documented pain point. Workarounds involve shell scripts, PHP servers, or git. This is *exactly* the pattern Open Knowledge should AVOID — multiple projects (analog to vaults) shouldn't force users to re-set preferences per project.

---

### Finding: Joplin uses `settings.json` with `editor.codeView: boolean` for mode

**Confidence:** CONFIRMED
**Evidence:** [Joplin forum answer](https://discourse.joplinapp.org/t/how-to-set-markup-editor-by-default/23477)

> "that sets to `true` when the markdown editor is open and `false` when the rich text editor is open."

Settings file lives in Joplin profile directory (platform-dependent Electron userData), single file, read on launch.

**Implications:** Boolean-in-settings-file is the simplest possible pattern. Single source, single value, shared across any Joplin windows on that profile. Works — but the buggy behavior around new notes (documented in D1) suggests the read/write points must be consistent with what the UI binds to. Open Knowledge analogy: a single localStorage key vs an Electron userData JSON.

---

### Finding: VS Code uses hierarchical settings (User > Workspace) with `workbench.editorAssociations` as a user-level default

**Confidence:** CONFIRMED
**Evidence:** [VS Code user settings docs](https://code.visualstudio.com/docs/configure/settings), [Issue #192954](https://github.com/microsoft/vscode/issues/192954)

Hierarchy (highest precedence last):
1. Default settings (VS Code built-in)
2. User settings (`~/.config/Code/User/settings.json` or platform equivalent)
3. Workspace settings (`.vscode/settings.json`)
4. Workspace folder settings (multi-root)

Sync via [Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync): User settings, keyboard shortcuts, snippets, extensions, and UI state sync across devices.

**Implications:** VS Code's design demonstrates the value of dual-tier user/workspace scope. For Open Knowledge (Electron multi-window use case) the analog would be user-level (sticky across all projects/windows) vs per-project override. The research brief asks only for the user-level "sticky everywhere" behavior — VS Code's user-tier is the closest template.

---

### Finding: Zettlr stores config as JSON in Electron userData; mode key is `renderingMode`

**Confidence:** CONFIRMED (schema), INFERRED (exact file path, standard Electron convention)
**Evidence:** [Zettlr get-config-template.ts](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/config/get-config-template.ts)

```typescript
renderingMode: 'preview'
```

Plus granular `render*` booleans. Config is read on app boot. Standard Electron pattern: written to `app.getPath('userData')/config.json`.

**Implications:** Zettlr's one-user-one-install model means config.json is effectively user-global. No multi-vault or multi-project complexity. The equivalent in Open Knowledge would be: Electron store in userData, shared across all project windows.

---

### Finding: HedgeDoc uses URL query params as primary mode state; server has no per-user mode default

**Confidence:** CONFIRMED
**Evidence:** [docs.hedgedoc.org/references/url-scheme/](https://docs.hedgedoc.org/references/url-scheme/), [configuration docs](https://docs.hedgedoc.org/configuration/)

The URL *is* the state. No persisted user-level editor-mode default was found in the configuration reference.

**Implications:** HedgeDoc's storage model is "URL state only" — every page load starts from the URL's implied mode. Sharp but inflexible: great for "share this as view-only," bad for "remember my preferred mode." Interesting as a URL-override pattern (D5), not as a sticky-preference pattern.

---

### Finding: electron-store is the ecosystem-standard for Electron preferences; stored as JSON in userData

**Confidence:** CONFIRMED
**Evidence:** [electron-store README](https://github.com/sindresorhus/electron-store)

> "By default, the configuration file is stored in `app.getPath('userData')`... the module handles serialization and deserialization automatically, with atomic writes to prevent corruption if the process crashes during a save operation."

> "The library works in both main and renderer processes. For renderer-only usage without a main process Store instance, you must call `Store.initRenderer()` in the main process first to establish the required IPC communication channels."

> "The watch feature enables cross-process state sharing: 'Watch for any changes in the config file and call the callback for onDidChange or onDidAnyChange if set. This is useful if there are multiple processes changing the same config file.'"

**Implications:** For Electron-distributed Open Knowledge, electron-store is the "don't invent your own" answer IF the preference needs to span main + renderer OR survive localStorage corruption. For a preference that's purely renderer-visible (editor mode), localStorage is simpler and cheaper. See D3 + D6 for the stickiness trade-offs.

---

### Finding: localStorage in Electron BrowserWindows is shared by origin (Chromium default)

**Confidence:** CONFIRMED
**Evidence:** [electron-store README + search results from multi-window patterns search](https://github.com/sindresorhus/electron-store)

> "Each window shares localStorage by default if they have the same origin (domain/port)."

> "To isolate storage between windows, use `session.fromPartition()` when creating windows, or open windows with different ports."

> "In Electron, localStorage and sessionStorage are stored in LevelDB across Windows, macOS, and Linux, but both are limited to approximately 5 MB per origin."

**Implications:** For Open Knowledge's Electron distribution: every BrowserWindow loads the same `file://` (packaged) or same electron-vite dev origin → localStorage shared automatically. "Sticky across windows" falls out for free IF we use localStorage. This is *already* the pattern `ok-theme-v1` and `ok-pin-v1` use.

---

### Finding: Logseq uses `config.edn` (EDN) per-graph; global fallback via `~/.logseq/config/config.edn`

**Confidence:** INFERRED (from community gists + forum posts; official docs didn't surface)
**Evidence:** [Logseq discuss: how to keep config.edn up to date](https://discuss.logseq.com/t/how-to-keep-your-config-edn-up-to-date/17173)

> "The logseq/config.edn from your active graph can be copied to `~/.logseq/config/config.edn` for global settings across graphs."

**Implications:** Logseq provides per-graph AND user-global scope — better than Obsidian's vault-only. But Logseq doesn't have the mode toggle to begin with (D1), so this pattern is only relevant as a generic "per-project + user-global tier" template.

---

## Pattern taxonomy (synthesis across surveyed editors)

| Storage approach | Examples | Scope | Multi-window behavior |
|---|---|---|---|
| Per-project config file (JSON/EDN) | Obsidian `.obsidian/app.json`, Logseq `config.edn` (graph) | Per-project/vault | Shared within project; different projects = different prefs |
| User-global config in OS data dir | Joplin settings.json, Zettlr Electron userData config.json, Logseq `~/.logseq/config/config.edn` | Per-user-per-install | Shared across all windows of same install |
| User settings + workspace override | VS Code `settings.json` hierarchy | Dual-tier (user + per-workspace) | User-tier syncs across windows; workspace overrides |
| Renderer localStorage | Electron apps sharing origin; web-only editors | Per-origin | Auto-shared across BrowserWindows (same origin) |
| URL query param | HedgeDoc `?edit`/`?view`/`?both` | Per-URL | Not persisted; session-scoped only |

---

## Negative searches

- Searched for per-user Obsidian config — NOT FOUND (official workaround is manual copy or sync plugin).
- Searched for VS Code "default editor for new markdown files" cmdline flag — NOT FOUND (open issue).
- Searched Zettlr for per-project config override — NOT FOUND (single-user-install model).

---

## Gaps / follow-ups

- **Does Obsidian Sync sync `app.json`?** Relevant if Open Knowledge ever ships cross-device preference sync. Not in current spec scope.
- **Electron localStorage under packaged `file://` vs dev origin** — is the origin exactly the same across dev and prod builds? Worth a quick verification before Open Knowledge relies on localStorage-shared-by-origin in Electron.
