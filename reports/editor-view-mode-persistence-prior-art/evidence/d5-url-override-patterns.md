# Evidence: D5 — URL-override escape hatches

**Dimension:** D5 — URL-based mode overrides for one-shot or shareable-link use cases
**Date:** 2026-04-21
**Sources:** HedgeDoc docs; VS Code issue tracker; Obsidian URI scheme docs

---

## Key files / pages referenced

- [HedgeDoc URL scheme](https://docs.hedgedoc.org/references/url-scheme/)
- [HedgeDoc features docs (older)](https://github.com/hedgedoc/hedgedoc/blob/master/public/docs/features.md)
- [HedgeDoc issue #5549: re-add buttons for switching editor mode](https://github.com/hedgedoc/hedgedoc/issues/5549)

---

## Findings

### Finding: HedgeDoc is the only surveyed editor with URL-selectable mode — three query params

**Confidence:** CONFIRMED
**Evidence:** [docs.hedgedoc.org/references/url-scheme/](https://docs.hedgedoc.org/references/url-scheme/)

> "pad.example.com/longnoteid?edit — Full-screen markdown editor for the content"
> "pad.example.com/longnoteid?view — Full-screen view of the note without the editor"
> "pad.example.com/longnoteid?both — markdown editor and view mode side-by-side"

Uses query-param-without-value (`?edit`, `?view`, `?both`) rather than key=value (`?mode=edit`). The URL is parsed client-side by the HedgeDoc frontend to select the initial mode state.

**Implications:** Precedent exists for URL-as-mode-selector. HedgeDoc's model is "URL is authoritative" — no sticky user default is mentioned in official docs. The pattern is optimized for shareable links ("open this note in view-only") more than for personal preference.

Design note: HedgeDoc's bare-query-key convention (`?edit`) is terser than `?mode=edit` but less flexible (can't combine with other mode params). For Open Knowledge's analog, `?mode=source` is likely more extensible (allows future `?mode=source&theme=dark` compositions).

---

### Finding: HedgeDoc URL persistence is not documented as sticky; implied session-scoped

**Confidence:** INFERRED (docs omit the persistence question entirely — "no information" outcome)
**Evidence:** [docs.hedgedoc.org/references/url-scheme/](https://docs.hedgedoc.org/references/url-scheme/)

> "The source material provides no information about whether mode selection persists across sessions, constitutes a one-time override, or if default-mode preferences exist elsewhere in the configuration." (assessed by WebFetch analysis)

The FAQ, configuration, and features docs do not mention a persistent user-level editor-mode default. The URL param appears to be the sole mechanism.

**Implications:** HedgeDoc's UX model: every session starts from the URL. Mode changes during a session don't persist across reopens unless the URL is bookmarked with the desired param. Good for shared-link UX; poor for "remember my preference."

---

### Finding: Obsidian's `obsidian://` URI scheme does NOT support mode-override params

**Confidence:** CONFIRMED (negative)
**Evidence:** [Obsidian Help: Use Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI) (general scan — `obsidian://open?vault=...&file=...` supports vault + file + heading but not mode)

The `obsidian://open` URI supports `vault`, `file`, and `heading` params but no `mode` or `view` param.

**Implications:** Obsidian has no URL-based one-shot override. Mode is purely governed by the vault default + community-plugin frontmatter overrides.

---

### Finding: VS Code `code --goto file.md` does not accept a preview flag

**Confidence:** CONFIRMED (negative)
**Evidence:** [VS Code Issue #197374](https://github.com/microsoft/vscode/issues/197374) — "Markdown preview is not automatically opened when md file is opened via command-line"

> "workbench.editorAssociations only works if VS Code is already running, and if you open a markdown file from the command line when no VS Code instance was already running, the file opens in edit view rather than preview mode"

**Implications:** Even VS Code's settings-based override has a cold-start hole. Command-line is a different URL-analog (argv instead of query params) but the theme is the same: editors often don't support per-launch mode selection cleanly.

---

### Finding: No surveyed editor ships BOTH a sticky user preference AND a URL-override escape hatch

**Confidence:** INFERRED (from the absence of any editor with both)
**Evidence:** aggregate across D1 findings

- Obsidian: sticky preference (per-vault) — no URL override.
- Zettlr: sticky preference (user-global) — no URL override (single-window app).
- Joplin: sticky preference (user-global) — no URL override.
- VS Code: sticky preference (user/workspace tiers) — argv is a cold-start hole, not an override.
- HedgeDoc: URL is the state — no sticky preference.

**Implications:** The pattern where a user has a persistent preference AND a one-shot URL override (e.g., `?mode=source` to share a link that opens in source) is NOT established prior art. Open Knowledge implementing both would be slight novelty. This lines up with D3 of my original spec-intake recommendation to defer URL overrides to Future Work: you'd be ahead of prior art, and the combinatorics of "URL wins vs default wins vs sticky wins" is worth not designing on day one.

---

## Pattern synthesis

| Mechanism | Stickiness | Override granularity | Examples |
|---|---|---|---|
| URL query param only | None (session) | Per-page-load | HedgeDoc `?edit`/`?view`/`?both` |
| Cold-start argv / URL in already-running app | None (confused — cold-start differs) | Per-launch | VS Code `code file.md` (partial / broken) |
| Sticky preference + no URL override | Full (user) | None | Obsidian, Zettlr, Joplin, VS Code workbench.editorAssociations |
| Sticky preference + URL override (hypothetical composition) | Full + one-shot override | Per-URL | Not observed in surveyed editors |

---

## Negative searches

- Searched "Joplin URL mode override" — NOT FOUND.
- Searched "VS Code markdown preview URL" — NOT FOUND as supported feature.
- Searched "Obsidian obsidian:// mode" — NOT FOUND.

---

## Gaps / follow-ups

- Reading HedgeDoc frontend source to confirm URL is authoritative on every render vs. only on initial mount would be useful if Open Knowledge decides to add URL overrides. Not needed for current spec scope (URL override is P2 in rubric).
