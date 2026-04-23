# Evidence: GitHub Flavored Markdown Alerts

**Date:** 2026-04-22
**Sources:** GitHub Community discussion #16925 ("Beta feature: new Markdown extension — Alerts provide distinctive styling for significant content").

---

## Findings

### Finding: Five alert types, all uppercase, case-sensitive
**Confidence:** CONFIRMED
**Evidence:** GitHub Community #16925.

| Token | Semantic |
|---|---|
| `NOTE` | informational |
| `TIP` | positive hint |
| `IMPORTANT` | emphasis |
| `WARNING` | caution |
| `CAUTION` | stronger caution / destructive-adjacent |

Exact spelling is case-sensitive — lowercase `[!note]` is **not** supported.

### Finding: Syntax is blockquote-extended with `[!TYPE]` head on its own line
**Confidence:** CONFIRMED
**Evidence:** GitHub Community #16925; repeated across GitHub READMEs.

```
> [!NOTE]
> Useful information that users should know, even when skimming content.
```

- The `[!TYPE]` must be on its own line inside the blockquote (a line break after the marker is required).
- Previous bold-text syntax `**Note**` is deprecated.

### Finding: No custom titles supported
**Confidence:** CONFIRMED
**Evidence:** GitHub Community #16925 — "Users requested customization extensively … GitHub has not implemented this feature."

No `[!NOTE] My Title` — the rendered title is always the static type label ("Note", "Tip", …). The literal text "Note" is auto-prepended by GitHub's renderer.

### Finding: No nesting; blank line between consecutive alerts required
**Confidence:** CONFIRMED
**Evidence:** GitHub Community #16925 — "Prevent alerts from being nested within other elements".

- Alerts **cannot** be nested inside other alerts or other block constructs (e.g. list items) — they render as plain blockquotes if nested.
- Consecutive alerts require a blank line between them.

### Finding: No foldable/collapsible state
**Confidence:** CONFIRMED (absence)
**Evidence:** GitHub Community #16925 does not document any `+`/`-` or `<details>` affordance.

---

## Gaps / follow-ups

- Default icons and colors per type are styled by the GitHub renderer; not authorable.
