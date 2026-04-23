# Evidence: D10 — Obsidian's `shell.openPath` limits (Path C 2026-04-23)

**Dimension:** What limits does Obsidian (closed-source) put on what gets passed to `shell.openPath` when the user left-clicks a file? Extension block? Vault-containment? User consent? Plugin sandbox?

**Date:** 2026-04-23
**Sources:** Obsidian official changelog, forum threads, community plugins (via GitHub + DeepWiki), CVE databases. Closed-source behavior reconstructed from behavioral reports + plugin source.

---

## Summary

- **A confirmation dialog for external-app opens landed in 1.12.2** (Early Access 2026-02-18). **Exact gating mechanism (per-click / per-file / per-extension / configurable / with-or-without checkbox) is NOT documented in the public changelog** and was not verified via forum reports in this research. UNVERIFIED how the dialog actually gates in practice.
- **A separate executable-file warning** was added in 1.12.2. Reasonably inferred to be warn-only (not hard-block) from the wording "added a warning," but not confirmed by behavioral testing.
- **No published extension blocklist.**
- **No realpath-inside-vault check** documented. UNCERTAIN on absolute-path escape — no forum reports of it working, but no published guard either.
- **No published CVE** targeting `shell.openPath` specifically.
- **Plugins get the raw Electron `shell` object** — 1.12.2's safeguards apply only to the core "Open in default app" command; third-party plugins bypass.

**Pre-1.12.2 posture was fully silent delegation** (forum #83532 confirms). **Post-1.12.2 adds at least one UX gate**, but the gate's exact shape is a knowledge gap.

---

## Findings

### Finding: No published extension blocklist; warn-only for executables as of 1.12.2

**Confidence:** CONFIRMED (changelog + forum)
**Evidence:**
- [Obsidian 1.12.2 Desktop (Early access) release notes](https://obsidian.md/changelog/2026-02-18-desktop-v1.12.2/) — "a warning when attempting to open an executable file"
- [Forum: No warnings when clicking on executable files](https://forum.obsidian.md/t/no-warnings-when-clicking-on-executable-files/83532) (2024) — `.py` and `.c` files executed silently before 1.12.2; moderator response "we'll revisit"; no fix until ~20 months later

Obsidian does not publish the executable-extension list. Based on the changelog phrasing + the 1.12.3 follow-up fix that exempts *folders* (e.g. `.snippets/`), the check appears to be **extension-based** (likely a short allowlist of `.exe`, `.bat`, `.cmd`, `.sh`, `.app`, `.scpt`, `.ps1`-class), not byte-sniffed. `.html` is INFERRED not on the warning list — no forum/changelog mention.

**Implication:** pre-1.12.2 Obsidian was the baseline "trust the OS" posture; post-1.12.2 adds a soft UX gate for exec-class but nothing for `.html` (stored-XSS class) or arbitrary `file:` targets.

### Finding: A confirmation dialog for external-app opens was added in 1.12.2 (gating mechanism undocumented)

**Confidence:** CONFIRMED (existence); UNVERIFIED (gating specifics)
**Evidence:** [1.12.2 changelog](https://obsidian.md/changelog/2026-02-18-desktop-v1.12.2/), "Improvements → Other" section, verbatim:

> "Opening files in an external application now shows a confirmation dialog for added safety"

That's the entire public documentation of this feature. The changelog does NOT specify:

- Whether the dialog fires **per-click, per-file, per-file-type, or per-session**
- Whether there's a "don't ask again" / "always allow" checkbox
- Whether it's configurable in settings
- Which file types trigger it (all external-app opens? only opaque? only exec-class?)

A WebFetch of the full 1.12.2 changelog (dated 2026-02-18) confirms these are the ONLY two external-app-related lines:

1. "Opening files in an external application now shows a confirmation dialog for added safety"
2. "Added a warning when attempting to open an executable file"

Forum search across obsidian.md/forum and related threads did NOT surface user reports describing the dialog's gating mechanics (e.g. "I clicked the same PDF twice and got prompted both times" or "the dialog has a 'don't ask again' checkbox").

**Evidence-safe statement:** A confirmation dialog exists for external-app opens in Obsidian 1.12.2+. The gating model (per-click / per-file / per-extension / configurable) is a knowledge gap in this research.

**Comparison to Joplin — HEDGED:** Joplin's confirmation is code-confirmed as *first-time-per-extension* with "Always open .X files" checkbox at `bridge.ts:406-428`. Obsidian's dialog mechanics are undocumented — could be identical, stricter (every click), or looser (only for certain extensions). Direct comparison is not supportable from the available evidence.

**How to verify:** install Obsidian 1.12.2+ locally, drop a PDF + a zip + a docx into a vault, click each twice, document behavior. Not done in this research.

### Finding: Vault containment is implicit via indexer, not explicit realpath check

**Confidence:** UNCERTAIN (negative evidence — no forum report of escape, but no documented guard either)

Obsidian only shows files it has indexed inside the vault. "Open in default app" is reachable via right-click on an indexed file or via `[[wikilink]]` / `[markdown](link)`. No public forum reports of crafting a link to open `/etc/passwd` or similar. However:

- Relative-path links outside the vault *do* resolve and open (forum reports on linking-outside-vault patterns)
- No documented explicit `realpath`-vs-vault check in the official docs or plugin API guidance

**Implication:** the vault-boundary enforcement is effectively behavioral (indexer-based + UI-reachability) rather than a security primitive. An attacker-controlled link with a fully-qualified `file:///etc/passwd` target has not been publicly demonstrated to be blocked.

### Finding: "Detect all file extensions" is UX, not security

**Confidence:** CONFIRMED
**Evidence:** [Forum: hidden folders/dotfiles](https://forum.obsidian.md/t/hidden-folders-dotfiles-not-showing-in-file-explorer-despite-detect-all-file-types-being-enabled/106685)

Settings → Files & Links → "Detect all file extensions":
- **OFF:** non-`.md` / non-image files invisible in file explorer. Doesn't prevent clicks via `[[wikilink]]` — behavioral obfuscation, not enforcement.
- **ON:** dotfiles like `.env`, `.git-credentials` become visible/editable/deletable — explicit security concern flagged in forum threads.

**"Open in default app" is a core plugin** (Settings → Core plugins). Disabling removes the right-click entry entirely — effectively blocking core delegation. (Still doesn't block third-party plugins that shell out.)

### Finding: No CVE directly targets Obsidian's `shell.openPath`

**Confidence:** CONFIRMED
**Evidence:** [Obsidian CVE list (cvedetails)](https://www.cvedetails.com/vulnerability-list/vendor_id-25830/Obsidian.html), [CVE-2023-27035](https://nvd.nist.gov/vuln/detail/CVE-2023-27035)

The published Obsidian CVEs (CVE-2023-2110, CVE-2023-27035, pre-0.12.12 non-http URL handling, 0.14/0.15 `obsidian://hook-get-address` RCE, pre-1.2.2 camera/mic APIs) are all about `app://` local-file disclosure, URL scheme handling, or embedded-webpage privilege escalation — **not `shell.openPath` misuse**.

The 2024 "no warnings on .py/.c" forum report was treated as a UX/safety gap, not filed as a CVE, and sat unfixed until 1.12.2 (Feb 2026). Long fix latency suggests Obsidian's internal threat model did not prioritize this class — extension warnings are UX safety, not security hardening.

### Finding: Plugins bypass the 1.12.2 safeguards entirely

**Confidence:** CONFIRMED
**Evidence:** [phibr0/obsidian-open-with](https://github.com/phibr0/obsidian-open-with) source — uses raw Electron `shell` without validation; [DeepWiki plugin docs](https://deepwiki.com/obsidianmd/obsidian-plugin-docs/6.2-plugin-submission-guidelines)

- Obsidian's plugin sandbox does **not** wrap `shell.*` at the API layer. Plugins that `require('electron').shell` get the raw module.
- Obsidian developer docs emphasize `normalizePath()` for cross-platform correctness, not security.
- Third-party plugins (`obsidian-open-with`, image-context-menu extensions) pass user-configured paths straight through without realpath / extension / containment checks.
- The 1.12.2 executable warning + confirmation dialog apply **only to the core "Open in default app" command**. A plugin's IPC to main that calls `shell.openPath` bypasses both.

**Implication:** Obsidian's security model for `shell.openPath` is layered: core command has (new) consent UX, plugins have none. For a threat model that includes malicious plugins, Obsidian's guarantees are weak. For the more common case (trusted plugins + malicious link), core is warn-only.

---

## Corrected narrative — what Obsidian actually does (vs what the initial research claimed)

Earlier D9 research in `editor-asset-embed-patterns-across-universe/` claimed Obsidian "opens a blank/degraded preview pane" for opaque types on left-click. **That claim is wrong.** Evidence-safe corrected view:

- **Pre-1.12.2 (before Feb 2026):** left-click on unsupported type → silent `shell.openPath` to OS default. No warning, no confirmation. CONFIRMED via forum #83532 including zip auto-unzip on macOS and `.py`/`.c` silent execution.
- **Post-1.12.2 (Feb 2026+):** a confirmation dialog appears for external-app opens and a separate warning appears for executables. **The exact gating mechanism of the dialog (per-click vs per-file-type vs configurable) is undocumented and unverified in this research.** Reasonably inferred (not confirmed) that the dialog is per-click-at-minimum since there's no mention of a one-time acknowledgment in the changelog; but this could be wrong.
- **Either era:** the in-app PDF viewer and image/video/audio inline render are separate from the `openPath` path — those are renderable types that never reach the OS delegation layer. This is INFERRED from the architecture (Obsidian inline-renders these) rather than explicitly documented.

The correction in `editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md` is the authoritative statement for editor-report readers; this evidence file owns the closer Obsidian-limits investigation.

---

## Sources

**Obsidian-specific:**
- [Obsidian Changelog](https://obsidian.md/changelog/)
- [Obsidian 1.12.2 Desktop (Early access) release notes](https://obsidian.md/changelog/2026-02-18-desktop-v1.12.2/) — warning added
- [Forum: No warnings when clicking on executable files](https://forum.obsidian.md/t/no-warnings-when-clicking-on-executable-files/83532) — pre-1.12.2 silent delegation
- [Forum: Opening attachments in external program freezes interface](https://forum.obsidian.md/t/opening-attachments-in-external-program-freezes-interface/24195)
- [Forum: Attachment file types that cannot be viewed](https://forum.obsidian.md/t/attachment-file-types-that-cannot-be-viewed-in-obsidian-are-not-listed-in-the-attachments-folder-in-obsidian/108663)
- [Forum: Detect all file types / dotfiles security concern](https://forum.obsidian.md/t/hidden-folders-dotfiles-not-showing-in-file-explorer-despite-detect-all-file-types-being-enabled/106685)
- [Obsidian Help: Symbolic links and junctions](https://help.obsidian.md/Files+and+folders/Symbolic+links+and+junctions)

**CVE databases:**
- [CVE-2023-27035 (NVD)](https://nvd.nist.gov/vuln/detail/CVE-2023-27035) — Canvas embed, not `shell.openPath`
- [Obsidian CVE list (cvedetails)](https://www.cvedetails.com/vulnerability-list/vendor_id-25830/Obsidian.html)

**Plugin evidence:**
- [phibr0/obsidian-open-with](https://github.com/phibr0/obsidian-open-with) — plugin that wraps `shell.openPath` without validation
- [Obsidian Plugin Submission Guidelines (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-plugin-docs/6.2-plugin-submission-guidelines) — `normalizePath()` for cross-platform correctness only

---

## Gaps / follow-ups

- Exact executable-extension list in Obsidian 1.12.2+ not published — would require disassembly or behavioral testing to enumerate.
- Pre-1.12.2 → 1.12.2 migration — whether enterprise Obsidian deployments have been updated. Irrelevant to OK but worth knowing if OK's threat model includes "our users are running the same Electron patterns Obsidian shipped in Feb 2026."
