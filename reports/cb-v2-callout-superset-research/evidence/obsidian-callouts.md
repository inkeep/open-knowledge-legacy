# Evidence: Obsidian Callouts (OFM)

**Date:** 2026-04-22
**Sources:** `https://help.obsidian.md/callouts` (redirected); `https://raw.githubusercontent.com/kepano/obsidian-skills/main/skills/obsidian-markdown/references/CALLOUTS.md`.

---

## Findings

### Finding: 13 canonical callout types with aliases
**Confidence:** CONFIRMED
**Evidence:** kepano's obsidian-skills CALLOUTS.md reference; matches official Obsidian help.

| Canonical | Aliases | Semantic |
|---|---|---|
| `note` | — | neutral |
| `abstract` | `summary`, `tldr` | summary |
| `info` | — | informational |
| `todo` | — | task |
| `tip` | `hint`, `important` | positive hint |
| `success` | `check`, `done` | positive confirmation |
| `question` | `help`, `faq` | inquiry |
| `warning` | `caution`, `attention` | caution |
| `failure` | `fail`, `missing` | negative |
| `danger` | `error` | destructive |
| `bug` | — | bug/issue |
| `example` | — | example |
| `quote` | `cite` | attribution |

**Total surface:** 13 canonical + 14 alias = 27 accepted tokens (case-insensitive per Obsidian convention).

### Finding: Obsidian syntax is blockquote-extended with `[!type]` head
**Confidence:** CONFIRMED
**Evidence:** kepano CALLOUTS.md.

```
> [!note] Optional custom title
> Body content here
> can span multiple lines
```

- `[!type]` is case-insensitive at runtime; style guide convention is lowercase.
- Custom title text follows the `[!type]` marker on the same line.
- Body content is standard blockquote continuation.

### Finding: Foldable syntax with `+` and `-` suffix
**Confidence:** CONFIRMED
**Evidence:** kepano CALLOUTS.md — `"> [!faq]- Collapsed by default"` and `"> [!faq]+ Expanded by default"`.

| Marker | Behavior |
|---|---|
| `[!type]` | Non-collapsible (always open) |
| `[!type]+` | Collapsible, initially **expanded** |
| `[!type]-` | Collapsible, initially **collapsed** |

### Finding: Nesting via additional `>` markers
**Confidence:** CONFIRMED
**Evidence:** kepano CALLOUTS.md — "Inner callouts use additional `>` symbols".

```
> [!warning]
> Outer content
>> [!note]
>> Nested callout
```

### Finding: Custom types via CSS data-attribute
**Confidence:** CONFIRMED
**Evidence:** kepano CALLOUTS.md.

```css
.callout[data-callout="custom-type"] {
  --callout-color: 255, 193, 7;   /* RGB triple */
  --callout-icon: lucide-sparkles; /* Lucide icon name */
}
```

- Any string in `[!xxx]` becomes `data-callout="xxx"`, and CSS picks up the custom palette.
- `--callout-color` is RGB-triple (no `rgb()` wrapper).
- `--callout-icon` accepts any Lucide icon name.

---

## Gaps / follow-ups

- Whether `abstract`/`summary`/`tldr` renders with a dedicated icon or reuses `note`'s icon requires probing the Obsidian source (not done here).
- Title-text Markdown support (e.g. `> [!note] **Bold** title`) is implied-yes but not demonstrated in the reference.
