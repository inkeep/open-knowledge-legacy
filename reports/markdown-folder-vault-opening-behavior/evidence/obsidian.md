# Evidence: Obsidian

**Dimension:** Folder-as-vault, mutation behavior, sidecar, storage model
**Date:** 2026-04-12
**Sources:** help.obsidian.md, forum.obsidian.md, github.com/obsidianmd/obsidian-api, community posts

---

## Key sources referenced

- [Obsidian forum — Open Folder as Vault (mobile)](https://forum.obsidian.md/t/open-folder-as-vault-option-on-mobile/26341) — UI flow for designating any folder as a vault
- [Obsidian forum — Open folders as vaults from the CLI](https://forum.obsidian.md/t/open-folders-as-vaults-from-the-cli/89714) — vault registration in `./config/obsidian/obsidian.json`
- [Obsidian forum — Don't update app.json, appearance.json, etc. on app start](https://forum.obsidian.md/t/dont-update-app-json-appearance-json-community-plugins-json-core-plugins-json-on-app-start-for-no-reason/111529) — volatile rewrite behavior
- [Obsidian forum — Where and in which format are my notes stored](https://forum.obsidian.md/t/where-and-in-which-format-are-my-notes-stored/60728) — `.md` on disk as source of truth
- [Obsidian Help — Data storage](https://help.obsidian.md/data-storage) — official data storage doc
- [Obsidian API — README](https://github.com/obsidianmd/obsidian-api/blob/master/README.md) — Vault and MetadataCache API
- [Rob Cogit8 — Obsidian and Git setup guide](https://rob.cogit8.org/posts/2025-03-25-obsidian-git-quick-setup-for-developers/) — `.gitignore` patterns, non-invasiveness (T3 blog)
- [github/gitignore PR #4370](https://github.com/github/gitignore/pull/4370) — community `.gitignore` for Obsidian
- [Obsidian forum — What should I gitignore](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077) — three-tier gitignore conventions

---

## Findings

### Finding: Any folder can be opened as a vault; there is no conversion step
**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum — Open Folder as Vault](https://forum.obsidian.md/t/open-folder-as-vault-option-on-mobile/26341)

A folder becomes a vault the moment Obsidian is pointed at it. The UI flow is literally "Open folder as vault" (desktop and iPadOS). No format migration, no import step, no schema setup. Vault registration metadata (name, path, ID, timestamp) is stored *outside* the folder in `./config/obsidian/obsidian.json` (per-machine registry), not in the folder itself.

**Implications:** Non-destructive to the folder at the level of "deciding to open it."

---

### Finding: Obsidian creates a `.obsidian/` sidecar directory inside the folder on first open
**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum — What does workspace.json do](https://forum.obsidian.md/t/what-does-workspace-json-do/68392), [Obsidian forum — gitignore conventions](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077)

Typical contents of `.obsidian/`:
- `app.json` — application settings
- `workspace.json` (desktop) / `workspace-mobile.json` (mobile) — tab layout, sidebar, ribbon state
- `appearance.json` — theme settings
- `core-plugins.json`, `community-plugins.json` — enabled/installed plugin lists
- `hotkeys.json` — custom keybindings
- `plugins/`, `themes/`, `snippets/` — extension assets

The `.obsidian/` folder and its config files are **created on first open** (community confirmation and git-setup guides consistently describe this as the initialization step).

---

### Finding: Several `.obsidian/` config files are rewritten on every app startup, even with no user changes
**Confidence:** CONFIRMED
**Evidence:** [Feature request #111529 — Don't update app.json etc. on app start](https://forum.obsidian.md/t/dont-update-app-json-appearance-json-community-plugins-json-core-plugins-json-on-app-start-for-no-reason/111529)

```text
"app.json, appearance.json, community-plugins.json, and core-plugins.json
are modified as soon as Obsidian starts" regardless of whether the user
made any changes.
```

**Implications:** The `.obsidian/` folder is not inert — it has "volatile state" files that produce git diff noise. This is why `.obsidian/workspace.json` is a near-universal gitignore entry. The `.md` content itself is unaffected.

---

### Finding: Existing `.md` files are not rewritten on first open
**Confidence:** CONFIRMED (by design philosophy + absence of contrary reports)
**Evidence:** [Obsidian Help — Data storage](https://help.obsidian.md/data-storage), [Obsidian forum — Where and in which format are my notes stored](https://forum.obsidian.md/t/where-and-in-which-format-are-my-notes-stored/60728)

> "Notes are just .md (Markdown) files ... stored in a vault (folder) that you designate."

Opening the vault does not parse-and-rewrite notes. No frontmatter injection, no bullet normalization, no heading rewriting on load. Files are only modified when the user edits and saves, or when the user explicitly renames a file that has incoming `[[wikilinks]]` that Obsidian updates (this is a documented edit-time side effect, not an open-time behavior — see [Preserve file mtime when updating internal links (feature request)](https://forum.obsidian.md/t/preserve-file-modification-time-when-updating-internal-links/25629)).

---

### Finding: `.md` on disk is the primary source of truth; no mirrored database
**Confidence:** CONFIRMED
**Evidence:** [Obsidian API README](https://github.com/obsidianmd/obsidian-api/blob/master/README.md)

The Obsidian API exposes `Vault` (file interface) and `MetadataCache` (in-memory cache of headings, links, tags, frontmatter parsed from markdown). MetadataCache is a cache *over* the markdown files — not an authoritative store. Third-party tools like [obsidian-index-service](https://github.com/pmmvr/obsidian-index-service) optionally index into SQLite, but this is a plugin layer, not the core storage.

**Implications:** Anything that reads the folder directly (git, grep, editors, CI) sees the canonical content. There is no hidden "authoritative DB" that can drift from `.md`.

---

### Finding: `.obsidian/` path is not relocatable but is gitignorable; no read-only mode documented
**Confidence:** CONFIRMED (for gitignore); INFERRED (for relocatability — no docs describe a config option)
**Evidence:** [Obsidian forum — gitignore conventions](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077), [github/gitignore PR #4370](https://github.com/github/gitignore/pull/4370)

Three community conventions:
1. **NotesOnly** — `.obsidian/` entirely ignored (simplest; personal workflows)
2. **NotesAndCoreConfiguration** — ignore `workspace.json`, `community-plugins.json`; commit the rest
3. **NotesAndExtendedConfiguration** — commit everything except `workspace.json`

No documented "read-only vault" or "dry-run" mode. No documented mechanism to relocate `.obsidian/` elsewhere — it's hardcoded to live at the vault root.

---

## Gaps / follow-ups

- Whether `.obsidian/` is created *before* any user interaction (opening a vault and immediately closing without interacting) vs. *after* first config save — not explicitly stated in primary sources. Community setup guides consistently describe it as created on first open; no report of "I opened a vault and nothing was written" found.
- Whether `mtime` on `.md` files is preserved across vault open (not just across edits) — assumed yes by absence of contrary reports.
