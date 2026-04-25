# Evidence: D3 — Obsidian

**Dimension:** D3 — Obsidian (Vault Switcher pattern, markdown-app convention)
**Date:** 2026-04-25
**Sources:** raw.githubusercontent.com/obsidianmd/obsidian-help (T1 official); obsidian.md/changelog (T1); forum.obsidian.md (T3, flagged where used)

---

## Key files / pages referenced

- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Files%20and%20folders/Manage%20vaults.md — canonical Vault switcher / Manage Vaults UI page
- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Getting%20started/Create%20a%20vault.md — first-launch behavior
- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Files%20and%20folders/How%20Obsidian%20stores%20data.md — global settings folder paths
- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20URI.md — `obsidian://choose-vault`, `obsidian://open?vault=`, vault ID
- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Plugins/Quick%20switcher.md — file-level Quick switcher (NOT vault switcher)
- raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/User%20interface/Hotkeys.md — no default hotkey for "Open another vault"
- obsidian.md/changelog/2026-01-28-desktop-v1.11.7/ — `obsidian://choose-vault` introduction
- forum.obsidian.md (T3) — for behaviors not documented in T1

---

## Findings

### Finding: Obsidian's project navigator is a dedicated Vault Switcher / Manage Vaults window
**Confidence:** CONFIRMED
**Evidence:** Manage vaults.md (T1)

Obsidian uses "vault" as its project equivalent. The Vault switcher (also called Manage Vaults) is a dedicated window that lists known vaults with per-row overflow menu (rename, move, remove, copy vault ID), plus dedicated rows for **Create new vault** and **Open folder as vault**.

Reached from inside a vault via the **Vault profile** icon (`chevrons-up-down` glyph) at the bottom of the left sidebar → **Manage Vaults...** in the popup menu. The same window IS the launcher when no vault is open.

**Implications for taxonomy:** Distinct from VSCode's Welcome-page-as-tab. This is a separate window/modal — a different pattern shape.

### Finding: First-launch shows the Vault switcher as launcher; subsequent launches go straight to last vault
**Confidence:** CONFIRMED
**Evidence:** Create a vault.md (T1); forum.obsidian.md/t/.../59001 (T3)

T1 quote: "The first time you open Obsidian, you'll be asked to add a new vault. You have two options, either create a new empty vault, or use an existing folder." Two rows displayed: **Create new vault** + **Open folder as vault**.

On subsequent launches with one or more known vaults, Obsidian re-opens the most recently used vault directly. The Vault switcher only appears at launch in the special case where Obsidian is already running and a second instance is invoked (T3 confirmation: forum moderator WhiteNoise).

### Finding: "Open another vault" command exists but has no default keybinding
**Confidence:** CONFIRMED
**Evidence:** Manage vaults.md (T1); Hotkeys.md (T1)

The command palette exposes "Open another vault"; user can assign a hotkey via Settings → Hotkeys. No default binding.

**Cross-app comparison:** VSCode's `Ctrl+R` (`workbench.action.openRecent`) is bound by default. Obsidian requires opt-in for keybinding parity.

### Finding: Opening another vault always spawns a new window — no swap-in-place affordance
**Confidence:** CONFIRMED (behavior); CONFIRMED via T1 (move-vault flow); reinforced via T3
**Evidence:** Manage vaults.md "Move vault to a different folder" step 4: "Close the current vault window, leaving the **Manage Vaults** window open." forum.obsidian.md/t/.../68833 (T3, behavioral observation): "the new vault is opened in an additional, new window — the end result being two windows…"

For URI scheme: `obsidian://open?vault=...` "opens the vault. If the vault is already open, focus on the window." — focus is the deduplication strategy, not swap-in-place.

**Implications for taxonomy:** Obsidian's window-management policy is one-window-per-vault with no built-in close-and-replace affordance. Closing the current vault window is a manual prerequisite if the user wants only one window.

### Finding: Vault registry persists in `obsidian.json` keyed by 16-character vault ID
**Confidence:** CONFIRMED (paths, ID concept); INFERRED via T3 (JSON schema)
**Evidence:** How Obsidian stores data.md (T1) for paths; Obsidian URI.md (T1) for vault ID; forum.obsidian.md/t/.../32700 (T3) for JSON schema

Locations:
- macOS: `/Users/<username>/Library/Application Support/obsidian/`
- Windows: `%APPDATA%\Obsidian\`
- Linux: `$XDG_CONFIG_HOME/obsidian/` or `~/.config/obsidian/`

Schema (T3, since not documented in T1):
```json
{"vaults":{"96a832d9c9cc9eca":{"path":"/tmp/vault1","ts":1643208916609,"open":true}}}
```

T1 confirms the 16-char vault ID via `obsidian://open` doc and the per-row "Copy vault ID" affordance.

Auto-populated; entries persist until explicitly removed via "Remove from list" ("Removing a vault only removes it from the vault list" — does not delete folder).

### Finding: URI scheme exposes `obsidian://choose-vault` (since 1.11.7) for programmatic switcher invocation
**Confidence:** CONFIRMED
**Evidence:** Obsidian URI.md (T1); obsidian.md/changelog/2026-01-28-desktop-v1.11.7/ (T1)

`obsidian://choose-vault` — opens the Vault switcher.
`obsidian://open?vault=<name-or-id>` — bypasses switcher, opens specific vault.

### Finding: Quick Switcher (Cmd+O) is file-level, NOT vault-level — disambiguation
**Confidence:** CONFIRMED
**Evidence:** Quick switcher.md (T1)

T1 description: "a core plugin that lets you search and open notes using only your keyboard," `Cmd+O` / `Ctrl+O`, operates only over notes within the currently open vault. Has no awareness of other vaults.

**Why this matters:** Third-party tutorials commonly conflate the two. The Vault switcher (this report's subject) operates one level above. Their names are confusable but their surfaces are entirely distinct.

---

## Negative searches (NOT FOUND)

- **Standalone "Vault switcher" T1 page** at `help.obsidian.md/User+interface/Vault+switcher` no longer exists; canonical doc consolidated under `manage-vaults`. All UI-shape facts traced to `Manage vaults.md` which has subsumed it.
- **Visual screenshots of Vault switcher window:** help-pages repo doesn't check in screenshots; window chrome (separate window vs in-app modal) reconstructed from procedural language rather than confirmed visually. Search terms tried: "Obsidian vault switcher screenshot", "Obsidian Manage Vaults window UI".
- **macOS-specific application-menu items** (e.g., a File menu "Open Vault…"): not asserted because help docs never reference them.
- **CLI flag for selecting a vault on launch:** explicitly identified as a feature request, not a current capability; URI scheme is the documented programmatic entry point.

---

## Gaps / follow-ups

- Window chrome of the Vault switcher (modal vs separate window) is reconstructed from procedural docs, not screenshots. A team member running Obsidian could confirm in seconds.
- JSON schema for `obsidian.json` is from T3 forum source — should be re-verified by inspecting a current install.
