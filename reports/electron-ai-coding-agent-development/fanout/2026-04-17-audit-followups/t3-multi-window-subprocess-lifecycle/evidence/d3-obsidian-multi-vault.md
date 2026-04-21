# Evidence D3: Obsidian Multi-Vault Lifecycle

**Dimension:** D3 (P0) — Obsidian: open-same-vault-twice, vault-lock, crash recovery
**Date:** 2026-04-17
**Sources:** Obsidian Forum (help.obsidian.md is small; forum has the community-observed behavior)

**Caveat:** Obsidian is closed-source. Evidence is from public forum threads (user-observed behavior) and help docs. No first-party source code.

---

## Key URLs

- [Open vault in multiple windows — Obsidian Forum](https://forum.obsidian.md/t/open-vault-in-multiple-windows/72521)
- [Multiple windows of the same vault (repost) — Obsidian Forum](https://forum.obsidian.md/t/multiple-windows-of-the-same-vault-repost/51258)
- [Multiple Instances of one vault — Obsidian Forum](https://forum.obsidian.md/t/multiple-instances-of-one-vault/94568)
- [Opening the same vault in multiple instances with bind mounts — Obsidian Forum](https://forum.obsidian.md/t/opening-the-same-vault-in-multiple-instances-with-bind-mounts-linux/43836)
- [obsidian:// URL will not open vault if already open — Obsidian Forum](https://forum.obsidian.md/t/obsidian-url-opening-will-not-open-vault-if-already-open-with-one-vault/16215)
- [Closing main window while secondary windows open — vault selector mode — Obsidian Forum](https://forum.obsidian.md/t/closing-the-main-window-while-secondary-windows-are-open-makes-obsidian-restart-in-vault-selector-mode/95520)

---

## Findings

### Finding D3a: Obsidian refuses to open the same vault in a second window/instance — it focuses the existing window

**Confidence:** CONFIRMED (via multiple forum threads consistently reporting same behavior)
**Evidence:** [Open vault in multiple windows — Obsidian Forum](https://forum.obsidian.md/t/open-vault-in-multiple-windows/72521)

Community-observed behavior, paraphrased from the thread:

> "When attempting to open the same vault in another desktop or window, opening the vault brings you to the window where it already is open, rather than opening a new instance."

From the `obsidian://` URL scheme thread: opening a vault via deeplink when that vault is already open does not create a new window; the existing window is focused.

The "Multiple Instances of one vault" feature request (repost 2) has been re-filed multiple times — evidence that single-vault-single-window is a deliberate product stance, not an oversight.

**Workaround documented by community:** Create a filesystem symlink or bind-mount to the vault directory and open the alias as a "different vault." This works because Obsidian keys vault identity by path string, not inode. Users must keep `.obsidian/` settings folders independent to avoid config conflicts.

**Implications:**
- Obsidian's UX convention is identical to VS Code's: silent-focus-existing. No collision dialog.
- The identity key is path (not realpath) — can be defeated by aliases. This is an *implementation detail* that leaks out as a power-user workaround, not an officially supported "open twice" mode.

---

### Finding D3b: Obsidian has in-vault pop-out windows (secondary windows) that are scoped to the main window's lifecycle

**Confidence:** CONFIRMED
**Evidence:** [Closing main window thread](https://forum.obsidian.md/t/closing-the-main-window-while-secondary-windows-are-open-makes-obsidian-restart-in-vault-selector-mode/95520)

Obsidian's "pop-out" windows (detach a note into its own OS window) share the main vault's process/state. When the main window closes while pop-outs are still open, the user is taken to vault-selector on next launch — evidence that the main BrowserWindow owns the vault state, and pop-outs are renderer-side detach-views, not independent process owners.

**Implications:**
- Obsidian's "multiple windows" is a single-process multi-window model (per vault). Not the per-window subprocess model we are evaluating.
- This is the same pattern as Logseq's graph-with-multiple-windows-reference-counted.

---

### Finding D3c: No user-facing "vault lock" file is documented; exclusivity is a whole-app stance, not a filesystem lock

**Confidence:** INFERRED (negative search + forum silence)
**Evidence:** Search for `"vault lock" OR "vault.lock"` in forum results returned no user-facing lock file. Git-side `.git/refs/.../lock` errors were found but those are git's own lockfiles, not Obsidian's.

Obsidian does not expose a `.obsidian/vault.lock` file or similar. The single-vault-per-app-instance behavior is enforced at the process model level. If a user bypasses with a bind-mount (different path, same inode), Obsidian will open both "aliases" simultaneously with no complaint — meaning there is no inode-level exclusivity check.

**Implications:**
- Obsidian's exclusivity model is soft: it trusts the canonical-path key to prevent accidents. A user who wants concurrent multi-instance access can have it (at their own risk).
- No production-quality "hard lock refuses writes when another instance has it" mechanism is visible.

---

### Finding D3d: Crash recovery in Obsidian is "IndexedDB-stuck-on-open" oriented — the product does not currently show a prominent crash-recovery dialog; stuck state requires OS-level kill + restart

**Confidence:** INFERRED (forum thread reports)
**Evidence:** [Large vault — not closing properly — stuck in IndexedDB.open — Obsidian Forum](https://forum.obsidian.md/t/large-vault-obsidian-not-closing-properly-not-able-to-re-open-stuck-in-indexeddb-open/95905)

Community reports: large vaults sometimes fail to close cleanly, leaving IndexedDB in a locked state; next launch hangs on "IndexedDB.open." No in-product "recover / force reset" flow is documented.

**Implications:**
- Obsidian's crash-recovery UX is weaker than VS Code's (no 3-in-5min restart budget + Restart button). The product expects users to diagnose and force-quit.
- This is a gap in the "production pattern" observable landscape, but also a reminder: even major apps sometimes lack a robust crash-recovery dialog.

---

## Gaps / follow-ups

- Could not inspect Obsidian source (closed). All findings are second-hand forum/help evidence.
- Could not confirm whether Obsidian uses Electron `app.requestSingleInstanceLock()` or only in-process identity tracking — the focus-existing behavior is consistent with either.
- Could not verify the exact path-identity function (canonical vs literal). The bind-mount workaround evidence suggests literal path, but this is indirect.
