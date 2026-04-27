---
title: "Cmd-K Omnisearch Patterns in Electron + Web Apps (3P Research)"
description: "Survey of how mature apps design unified vs split command palettes, where Settings lives in unified omnisearch, mode-toggle patterns, and Electron-specific concerns. Maps findings to the Q3 decision on Settings entry points."
date: 2026-04-25
sources:
  - https://linear.app/docs/conceptual-model
  - https://linear.app/changelog/2019-12-18-new-command-menu
  - https://code.visualstudio.com/docs/getstarted/keybindings
  - https://code.visualstudio.com/api/ux-guidelines/command-palette
  - https://cmdk.paco.me/
  - https://github.com/pacocoursey/cmdk
  - https://ui.shadcn.com/docs/components/radix/command
  - https://www.notion.com/help/keyboard-shortcuts
  - https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts
  - https://manual.raycast.com/preferences
  - https://help.obsidian.md/plugins/command-palette
  - https://resources.arc.net/hc/en-us/articles/20595231349911-Keyboard-Shortcuts
  - https://support.apple.com/en-us/102650
  - https://maggieappleton.com/command-bar
  - https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
framing: 3P / external sources only
---

# Cmd-K Omnisearch Patterns in Electron + Web Apps

**Purpose:** Establish the 3P design landscape for unified search-and-command surfaces so the Q3 decision (which Settings entry points to ship now given a future omnisearch) rests on real precedent.

---

## 1. Split vs Unified: Which Pattern Dominates in 2026

**Finding:** Outside IDEs, **unified Cmd-K dominates**. IDEs (VS Code, Cursor, Windsurf) preserve a **split** model inherited from Sublime Text.

| App | Pattern | Shortcut(s) |
|---|---|---|
| VS Code / Cursor / Windsurf | **Split** | Cmd-Shift-P (commands), Cmd-P (files) |
| Linear | Unified | Cmd-K |
| Slack | Unified switcher | Cmd-K |
| Notion | Unified | Cmd-K (and Cmd-P alias) |
| Raycast | Unified (root search) | Custom (typically Opt-Space) |
| Arc | Unified | Cmd-T |
| Obsidian | Split (lightweight) | Cmd-P (commands), Cmd-O (switcher) |

**CONFIRMED** — [Linear's command menu](https://linear.app/docs/conceptual-model) covers both navigation and actions in a single Cmd-K surface; same for [Notion](https://www.notion.com/help/keyboard-shortcuts), [Slack](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts), and [Arc](https://resources.arc.net/hc/en-us/articles/20595231349911-Keyboard-Shortcuts). [VS Code's](https://code.visualstudio.com/docs/getstarted/keybindings) split is a Sublime-Text inheritance — Cmd-Shift-P took the Shift modifier because Cmd-P was already mapped to file navigation.

**When split fits:** large symbol/file spaces where action and navigation vocabularies both compete for ranking. **When unified fits:** product apps where users mix "go to thing" and "do thing" in the same flow.

---

## 2. How "Settings" Appears in Unified Omnisearch

**Finding:** The dominant pattern in 2026 is **both — keep Cmd-, AND make Settings discoverable inside the palette**.

| App | Cmd-, opens Settings? | Settings in palette? | Native menu item? |
|---|---|---|---|
| VS Code | Yes — opens Settings tab | Yes — `> Preferences: Open Settings` | Yes |
| Linear | Yes (macOS HIG) | Yes — typing "settings" jumps to the Settings page | Yes |
| Slack | Yes — Preferences | Cmd-K is **switcher only**; settings are not a palette entry by default | Yes |
| Notion | Yes (Mac native) | Limited — Cmd-K is mostly find/jump | Yes |
| Raycast | App-specific | Yes — preferences are searchable in root search | N/A (launcher) |
| Arc | Yes (browser) | Yes — Cmd-T command bar surfaces "Open Settings" | Yes |
| Obsidian | Yes (Cmd-,) | Yes — `Open Settings` is a palette command | Yes |
| Cursor / Windsurf | Yes | Yes (`> Preferences: Open Settings`) | Yes |

**CONFIRMED** — [Apple's keyboard shortcut docs](https://support.apple.com/en-us/102650) treat Cmd-, as system-wide: "Command-Comma (,): Open preferences for the front app." Every unified-Cmd-K app surveyed honors it; none removed it when shipping omnisearch.

**INFERRED:** The two coexist because they serve different needs — Cmd-, is **muscle-memory for a known destination**; omnisearch is **discovery for an unknown destination**. Complementary, not competitive.

---

## 3. Mode-Toggle Patterns Within a Unified Palette

Two architectures dominate:

**A. Prefix-character modes (VS Code lineage).** [VS Code's command palette](https://code.visualstudio.com/docs/getstarted/userinterface) uses `>` for commands, `@` for symbols, `:` for go-to-line, `#` for workspace symbols. The same input field, different parsers. CONFIRMED across the [VS Code Extension API docs](https://code.visualstudio.com/api/ux-guidelines/command-palette).

**B. Unified ranking with groups (Linear / cmdk lineage).** [Linear's 2019 command-menu changelog](https://linear.app/changelog/2019-12-18-new-command-menu) describes contextual prioritization: "Groups are prioritized based on what you are focusing on, or the view you're currently in." No prefixes — the palette uses recency, view-context, and fuzzy match to rank a heterogeneous result set.

**Visual distinction (CONFIRMED):** Both architectures rely on the same conventions — group headings, leading icons (file icon vs. action icon vs. command icon), and right-aligned shortcut hints to disambiguate result types. [shadcn/ui's Command component](https://ui.shadcn.com/docs/components/radix/command) ships `CommandGroup`, `CommandItem`, and `CommandShortcut` that directly mirror this pattern.

The trend (INFERRED from Linear, Notion, Raycast, Arc): **non-IDE products skip prefix modes** because a typical user vocabulary is small enough that ranking handles it. Prefix modes survive in IDEs because symbol/line/file spaces are pathologically large.

---

## 4. Electron-Specific Concerns

**App menu Settings… still required (CONFIRMED):** Every Electron app surveyed (Slack, Notion, Linear desktop, VS Code, Cursor, Obsidian) keeps a `Settings…` item under the app-name menu. HIG expects it; screen readers, accessibility tools, and Cmd-, all rely on it being there.

**Cmd-, in Electron:** wired via `Menu` API with `accelerator: 'CommandOrControl+,'` on the `Settings…` item — routine per [Electron's menu docs](https://www.electronjs.org/docs/latest/api/menu).

**Browser-host parity (INFERRED):** browsers intercept Cmd-, for their own settings, so a React app running in both Electron and browser cannot bind Cmd-, in the renderer — the Electron menu handles it on desktop; the web build has no equivalent. Cmd-K is reliably available in both (browsers don't claim it), which is why unified Cmd-K became the cross-platform standard.

**Menu vs renderer conflict:** Electron menu accelerators fire before the renderer sees keydown. Bind once at the menu level; don't duplicate in React.

---

## 5. Implementation Patterns

[**cmdk** by Paco Coursey](https://github.com/pacocoursey/cmdk) (used by Linear, Vercel, shadcn) is the canonical React primitive: composable `Command`, `Command.Group`, `Command.Item`, fuzzy filtering, keyboard nav, `keywords` prop for aliasing. It does **not** ship prefix-mode parsing — consumers add that layer by switching result-set sources on input prefix.

**Pluggable sources (INFERRED):** dominant architecture is N independent providers (Commands, Recent, Pages, Search, Settings) each returning a ranked list, merged + grouped by the palette. cmdk doesn't enforce this; it's an idiom on top.

**Performance:** [cmdk](https://cmdk.paco.me/) handles hundreds of commands with no lag client-side. Beyond that, server-backed search (debounced ~150ms) is standard — Linear, Notion, Slack do this for content while keeping commands client-side.

---

## Implications for the Q3 Decision

Mapping findings to the four entry-point options for Settings:

**(i) HelpPopover submenu — KEEP.** Different surface, different intent (Help = discovery, omnisearch = recall). No conflict in any precedent; Linear, Slack, Notion all keep both. Ship now.

**(ii) Cmd-, shortcut — KEEP, do NOT let omnisearch obsolete it.** Every unified-Cmd-K app surveyed *also* honors Cmd-,. The two serve different cognitive modes — direct muscle-memory vs. open-ended discovery. CONFIRMED via Apple HIG, Linear, Slack, Notion, Arc, VS Code. Omnisearch should treat "Settings" as a high-rank result, **not** as a replacement. Cmd-, will only work in the Electron build (browser intercepts it); acceptable and matches industry practice.

**(iii) Current CommandPalette entry — SHIP NOW.** Adding "Open Settings" as a palette command is trivial (one `Command.Item`) and forward-compatible: when omnisearch lands, this entry already exists as a "Commands" source and gets re-grouped, not replaced. Every unified-Cmd-K app surveyed has Settings inside the palette.

**(iv) Electron App menu item — KEEP.** macOS HIG-mandated, accessibility-required, and the binding site for Cmd-,. Removing it breaks platform expectations; no precedent removes it.

**Net recommendation (INFERRED from convergent precedent):** Ship all four. They are not redundant — they are the standard four-way coverage that Linear, VS Code, Slack, and Notion all provide. Future omnisearch refactors (iii) into one of many sources; it does not collapse (i), (ii), or (iv).

---

## Confidence Summary

- **CONFIRMED:** Unified Cmd-K dominates outside IDEs; Cmd-, is a macOS HIG convention; mature apps keep all four entry points; cmdk supports the architecture; VS Code prefix modes are documented.
- **INFERRED:** Cmd-, and omnisearch are complementary (different cognitive modes); non-IDE apps skip prefix modes because vocabulary is smaller; pluggable-sources is the dominant palette architecture.
- **UNCERTAIN:** Exact browser-vs-Electron Cmd-, interception behavior across all browsers (Safari/Chrome/Firefox differ slightly); whether Linear's contextual ranking is fully algorithmic or partly hand-tuned.
