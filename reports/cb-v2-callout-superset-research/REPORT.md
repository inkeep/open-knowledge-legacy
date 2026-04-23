---
title: "CB-v2 Callout Descriptor — Union Superset Research"
description: "Cross-platform Callout/Admonition survey (Fumadocs, Mintlify, Obsidian, GitHub, Pandoc, Docusaurus) yielding a superset descriptor + migration matrix for Open Knowledge Component Blocks v2."
createdAt: 2026-04-22
updatedAt: 2026-04-22
subjects:
  - Fumadocs
  - Mintlify
  - Obsidian
  - GitHub Flavored Markdown
  - Pandoc
  - Docusaurus
  - remark-directive
  - "@microflash/remark-callout-directives"
  - remark-github-alerts
topics:
  - callout components
  - admonition syntax
  - MDX descriptors
  - markdown interop
  - component blocks
---

# CB-v2 Callout Descriptor — Union Superset Research

**Purpose:** Define the minimal-but-complete Open Knowledge Callout descriptor so content authored against Fumadocs, Mintlify, Obsidian vaults, GitHub READMEs, and Docusaurus/Pandoc sources migrates cleanly — without losing semantic variant, title, icon choice, or foldable state.

---

## Executive Summary

Callout/Admonition components converge on a narrow core (a `type` enum, a `title`, block children) but diverge on every detail that matters for migration: **how many types**, **what each is called**, **where the title goes**, **whether icons are customizable**, and **whether the component can be collapsed**. No single vendor's surface is a superset of any other. Open Knowledge CB-v2 therefore needs a descriptor that is the **union of all six surfaces**, with aliases resolved at the parse step rather than at the descriptor level.

**Key Findings:**

- **Type taxonomy is the biggest incompatibility.** GFM has 5 (`NOTE TIP IMPORTANT WARNING CAUTION`), Docusaurus 5 (`note tip info warning danger`), Mintlify 6 (`Note Tip Info Warning Check Danger`), Fumadocs 6 (`info warn error success warning idea`), Obsidian 13 canonical + 14 aliases. OK's enum must span at least 9 canonical values and accept ~30 alias tokens at parse time.
- **Title placement varies structurally.** Fumadocs / Docusaurus / Mintlify generic put title in a prop; Obsidian puts it inline after `[!type]`; GFM does not support custom titles at all. A superset descriptor needs `title` as an optional string prop AND must tolerate a `<CalloutTitle>` child when the parser emits the Fumadocs-style slotted form.
- **Foldable state is Obsidian-only today** but is a recurring feature request across platforms. `collapsible: boolean` + `defaultOpen: boolean` is worth adding now to lock in the contract before the first real migration — it costs nothing when absent.
- **Icon customization has three shapes:** none (GFM, Obsidian default), ReactNode (Fumadocs), or string identifier (Mintlify — plus optional `iconType`, `color`). String with free-text namespace (`lucide:sparkles`, `fa-solid:bell`, URL) accepts all three.
- **Recommended parse pipeline:** `remark-directive` + a custom visitor for the `:::type` path (Docusaurus / Pandoc / Fumadocs), `remark-github-alerts` for the `>[!TYPE]` GFM path, and a small custom blockquote visitor for the Obsidian `>[!type]+` path with foldable capture. Rejecting `@microflash/remark-callout-directives` because it emits HTML `<aside>` rather than MDX JSX elements.

---

## Research Rubric

| Dimension | Depth | Evidence anchor |
|---|---|---|
| Fumadocs Callout (radix-ui + base-ui + obsidian subset) | Deep | OSS source |
| Mintlify callout variants | Moderate | Live docs |
| Obsidian callouts (13 types + aliases + foldable + custom) | Deep | Obsidian help + kepano reference |
| GitHub Flavored Markdown Alerts | Moderate | GH community spec |
| Pandoc fenced_divs + Docusaurus admonitions | Moderate | Pandoc manual §8.18 + Docusaurus docs |
| Union/superset prop shape | Deep | Synthesis |
| Remark plugin landscape | Moderate | GitHub repos + Fumadocs core |

**Non-goals:** non-text callout extensions (Quarto layout options, LaTeX templates), accessibility deep-dive, visual-design token system, migration from authoring tools (Typora, Bear) that do not target a published spec.

---

## Detailed Findings

### Dimension 1 — Fumadocs Callout

Fumadocs ships a compound component family — `<Callout>` is a wrapper over `<CalloutContainer>` / `<CalloutTitle>` / `<CalloutDescription>`. The typed props are minimal (`type`, `icon`, `title`), all optional, with rich slotted composition available to advanced authors.

Prop surface (from `packages/radix-ui/src/components/callout.tsx`):

```ts
type CalloutType = 'info' | 'warn' | 'error' | 'success' | 'warning' | 'idea';
interface CalloutProps {
  type?: CalloutType;      // @default 'info'; 'warn'→'warning', 'tip'→'info' at runtime
  title?: ReactNode;       // renders in <CalloutTitle>
  icon?: ReactNode;        // "Force an icon" — overrides preset
  children: ReactNode;     // renders in <CalloutDescription>
}
```

Runtime-accepted tokens: `info | warn | error | success | warning | idea | tip`. Icon map pulls from `lucide-react`: `Info, TriangleAlert, CircleX, CircleCheck, Lightbulb`.

The **Obsidian subset** (`@fumadocs/obsidian`) drops `idea` and `title`+`icon` props entirely, instead exposing `<ObsidianCalloutTitle>` + `<ObsidianCalloutBody>` as required children slots. Its `remarkConvert` plugin captures `[!type]+` foldable-expanded markers but **discards the flag** — collapsibility is lost on convert.

### Dimension 2 — Mintlify Callouts

Mintlify ships 6 typed callouts as separate components (`<Note> <Tip> <Info> <Warning> <Check> <Danger>`), each children-only with preset icon/color, plus a generic `<Callout>` that accepts `icon`, `iconType`, `color`, `children`. No `title` prop anywhere.

The generic `<Callout>` icon story is the broadest of any platform: string identifier (Font Awesome / Lucide / Tabler / URL / local path / inline SVG) plus `iconType` enum to disambiguate Font Awesome variants, plus `color` as freeform hex.

### Dimension 3 — Obsidian Callouts (OFM)

13 canonical types + 14 aliases = 27 accepted tokens, plus `+`/`-` foldable modifiers, plus custom types via CSS `[data-callout="name"]` with `--callout-color` (RGB triple) and `--callout-icon` (Lucide name). The syntax is a blockquote extension: `> [!type] Optional title\n> body`.

Obsidian is the only platform that treats the type enum as **open-ended** — anything in `[!xxx]` is valid and falls through to the default chrome if no CSS rule matches. OK's descriptor should close the core enum (see §Union) but the parser should accept and preserve unknown types as a `type="xxx"` attribute with a warning, not drop them.

Foldable state is first-class: `[!faq]-` is collapsed-by-default, `[!faq]+` is expanded-but-collapsible. Fumadocs' `remarkConvert` captures this regex group and then silently drops it — a real migration loss for Obsidian vaults.

### Dimension 4 — GitHub Flavored Markdown Alerts

5 uppercase types, case-sensitive. No custom titles, no nesting, no foldable state. Blank-line rule: `[!TYPE]` must be on its own line inside the blockquote.

| GFM | OK canonical |
|---|---|
| `NOTE` | `note` |
| `TIP` | `tip` |
| `IMPORTANT` | `important` |
| `WARNING` | `warning` |
| `CAUTION` | `caution` |

Round-tripping from OK back to GFM requires lossy simplification (any `title`, `icon`, or `collapsible` in source MDX is dropped on export) — intrinsic to GFM's spec.

### Dimension 5 — Pandoc Fenced Divs + Docusaurus Admonitions

Pandoc fenced_divs (`::: ClassName`) is a generic div — no admonition semantics. Docusaurus layers 5 types (`note tip info warning danger`) on the same `:::` substrate via `remark-directive` + a mapper, with `:::type[Title]` as the title syntax.

Docusaurus' title syntax (`:::warning[Title]`) is the cleanest of any platform — the title is part of the opening fence, impossible to misplace. Quarto (built on Pandoc) extends with `.callout-*` classes and adds `title`, `icon`, `collapse`, `appearance` attributes — a superset worth mining for future prop additions.

### Dimension 6 — Union / Superset Analysis

#### Cross-platform comparison

| Feature | Fumadocs | Mintlify | Obsidian | GFM | Docusaurus | OK (recommended) |
|---|---|---|---|---|---|---|
| **Canonical types** | 6 | 6 | 13 | 5 | 5 | **9 core** |
| **Accepts aliases** | runtime (`warn`,`tip`) | component names | 14 aliases | — | keyword config | parser-level |
| **Title prop** | `ReactNode` | — | inline in syntax | — | directive label | `string` |
| **Icon prop** | `ReactNode` | `string` + `iconType` | CSS-only (`--callout-icon`) | — | — | `string` (namespaced) |
| **Color override** | CSS var | hex `color` prop | CSS var (RGB) | — | — | `string` (optional) |
| **Foldable state** | — | — | `+`/`-` | — | — | `collapsible` + `defaultOpen` |
| **Nesting** | via compound | — | `>>[!…]` | ❌ | `::::` outer | **yes** (block children) |
| **Compound children** | `<CalloutTitle>` + `<CalloutDescription>` | — | — | — | — | **yes** (widened block) |

#### The 9-value core type enum

```ts
type: 'note' | 'info' | 'tip' | 'important' | 'success' | 'warning' | 'caution' | 'danger' | 'idea';
```

- `note` — neutral (Obsidian, GFM)
- `info` — informational (Fumadocs, Mintlify, Obsidian, Docusaurus)
- `tip` — positive hint (Obsidian, Mintlify, GFM, Docusaurus)
- `important` — emphasis (GFM, Obsidian alias for `tip`; kept distinct because GFM separates them)
- `success` — positive confirmation (Fumadocs, Mintlify, Obsidian)
- `warning` — caution (universal)
- `caution` — stronger warning (GFM; Obsidian alias for `warning`; kept distinct)
- `danger` — destructive / error (Fumadocs `error`, Mintlify, Docusaurus, Obsidian alias)
- `idea` — brainstorm / proposal (Fumadocs-unique; worth keeping because Callout "lightbulb" is a recurring author need)

**Aliases resolved at parser (not descriptor) level:**

```
warn      → warning
error     → danger
check     → success
done      → success
abstract  → note      (no dedicated type in core)
summary   → note
tldr      → note
todo      → note
hint      → tip
help      → note      (Obsidian 'question' folds to note)
faq       → note
question  → note
attention → warning
failure   → danger
fail      → danger
missing   → warning
bug       → danger
example   → info
quote     → note
cite      → note
```

Unknown types pass through as `type="<literal>"` with a parser warning — preserves Obsidian custom-type round-trip.

---

## OK Callout Descriptor (concrete PropDef)

Direct replacement for the current 3-prop `calloutProps` in `packages/core/src/registry/built-ins.ts`:

```ts
const calloutProps: PropDef[] = [
  {
    name: 'type',
    type: 'enum',
    enumValues: [
      'note', 'info', 'tip', 'important', 'success',
      'warning', 'caution', 'danger', 'idea',
    ],
    defaultValue: 'note',
    required: false,
    description:
      'Visual variant. Aliases (warn, error, check, abstract, question, ' +
      'failure, bug, example, quote, etc.) are resolved at the parser layer.',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description:
      'Optional title line shown above the body. Rendered as <CalloutTitle> ' +
      'when the compound form is used.',
  },
  {
    name: 'icon',
    type: 'string',
    required: false,
    description:
      'Icon identifier. Accepts: Lucide name (e.g. "info"), namespaced ' +
      '"lucide:sparkles", Font Awesome "fa-solid:bell", external URL, or ' +
      'data-URL for inline SVG. Component map resolves at render time.',
  },
  {
    name: 'color',
    type: 'string',
    required: false,
    description:
      'Hex color override (e.g. "#FFC107"). Bypasses type-derived palette. ' +
      'Mintlify parity.',
  },
  {
    name: 'collapsible',
    type: 'boolean',
    required: false,
    defaultValue: false,
    description: 'When true, the callout renders with a disclosure affordance.',
  },
  {
    name: 'defaultOpen',
    type: 'boolean',
    required: false,
    defaultValue: true,
    description:
      'Initial state when collapsible. Obsidian "[!type]+" → true, "[!type]-" → false.',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Callout body. Accepts block content (paragraphs, lists, code, nested callouts).',
  },
];
```

---

## Migration Matrix

### Fumadocs `<Callout>` → OK
```mdx
<Callout type="warn" title="Heads up" icon={<MyIcon />}>Body</Callout>
<!-- becomes -->
<Callout type="warning" title="Heads up" icon="lucide:triangle-alert">Body</Callout>
```
`warn` aliases to `warning`; `icon={<MyIcon />}` requires authoring-time conversion to a string identifier (one-time migration, not round-trippable).

### Mintlify `<Note>` / `<Warning>` / … → OK
```mdx
<Note>Body</Note>   → <Callout type="note">Body</Callout>
<Warning>Body</Warning> → <Callout type="warning">Body</Callout>
<Callout icon="bell" color="#FFC107">Body</Callout>
  → <Callout icon="fa-solid:bell" color="#FFC107">Body</Callout>  (preserves both)
```

### Obsidian `>[!type]` → OK
```md
> [!warning]+ My title
> Body
>> [!note] Nested
>> Nested body

<!-- parses to -->
<Callout type="warning" title="My title" collapsible defaultOpen>
  Body

  <Callout type="note" title="Nested">
    Nested body
  </Callout>
</Callout>
```

### GitHub Flavored Markdown → OK
```md
> [!NOTE]
> Body

<!-- parses to -->
<Callout type="note">Body</Callout>
```

### Docusaurus `:::type[Title]` → OK
```md
:::warning[Pay attention]
Body
:::

<!-- parses to -->
<Callout type="warning" title="Pay attention">Body</Callout>
```

### Pandoc fenced_div → OK
```md
::: {.callout-warning title="Title"}
Body
:::

<!-- parses to -->
<Callout type="warning" title="Title">Body</Callout>
```

### Export direction

OK export is lossy by platform:
- **→ Fumadocs:** 1:1, all props preserved.
- **→ Mintlify:** use typed component when `icon`/`color`/`title` absent, else `<Callout>` generic with all props.
- **→ Obsidian:** map canonical types; encode `collapsible+defaultOpen` via `+`/`-`; preserve `title` inline; drop `icon`/`color` (unrepresentable).
- **→ GFM:** drop `title`/`icon`/`color`/`collapsible`; map type to uppercase; if type ∉ {NOTE,TIP,IMPORTANT,WARNING,CAUTION}, fall back to closest.
- **→ Docusaurus:** 1:1 for type + title; drop `icon`/`color`; `collapsible` unrepresentable.

---

## Remark Plugin Recommendation

**Adopt three small, orthogonal plugins rather than one opinionated monolith.**

| Input shape | Plugin | Notes |
|---|---|---|
| `>[!NOTE]` (GFM) | `remark-github-alerts` | Remco Haszing; unified-org tier; drop-in. Emit `<Callout>` mdxJsxFlowElement. |
| `:::type[Title]{attrs}` (Docusaurus, Pandoc, Quarto) | `remark-directive` + custom ~40-line visitor | Upstream from the unified team; stable. Reuse Fumadocs' `remark-directive-admonition` pattern, retargeting tag name to `Callout` and mapping `[Title]` → `title` attr. |
| `>[!type]+ Title` (Obsidian) | Custom blockquote visitor (~60 lines) | Regex `/^\[!(?<type>\w+)](?<fold>[+-])?\s*(?<title>.*)?$/`; reuse Fumadocs `remarkConvert` as starting template but preserve `fold` → `collapsible`/`defaultOpen`. |

**Rejected: `@microflash/remark-callout-directives`.** Archived on GitHub (still maintained on Codeberg) and emits HTML `<aside>` rather than MDX JSX — collides with OK's descriptor dispatch.

**Rejected: `remark-admonitions` (Docusaurus legacy).** Deprecated by Docusaurus itself.

Implementation sketch for the Obsidian visitor (extending fumadocs-obsidian's `remarkConvert`):

```ts
const HEAD = /^\[!(?<type>\w+)](?<fold>[+-])?\s*(?<title>.+)?$/;
// In resolveCallout:
const match = HEAD.exec(firstLineText);
const type = canonicalize(match.groups.type);   // apply alias map
const collapsible = Boolean(match.groups.fold);
const defaultOpen = match.groups.fold !== '-';
const title = match.groups.title?.trim() || undefined;
return createCallout({ type, title, collapsible, defaultOpen, body });
```

Total new code for all three paths: ~150 lines.

---

## Limitations & Open Questions

### Not fully covered
- **Quarto-specific callout API** (`appearance`, `icon-padding`, etc.) — noted as convention layered on Pandoc, not prop-level surveyed.
- **Bear / Typora admonition formats** — excluded per scope.
- **`@portaljs/remark-callouts`** — 404'd during fetch; output HTML may be adoptable as reference but not confirmed.

### Remaining uncertainty
- Whether OK should register `<Note>`, `<Warning>`, etc. as descriptor aliases (lowering Mintlify migration friction) or leave the mapping to the parser. Leaning toward **parser** — the descriptor registry should stay lean, per precedent #5.
- Whether `type="idea"` survives long-term or folds into `tip` / `important` post-migration usage data. Keep it for now; zero-cost to support.

---

## References

### Evidence files
- [evidence/fumadocs-callout.md](evidence/fumadocs-callout.md) — OSS source extraction
- [evidence/mintlify-callouts.md](evidence/mintlify-callouts.md) — live docs
- [evidence/obsidian-callouts.md](evidence/obsidian-callouts.md) — 13 types + aliases + foldable
- [evidence/gfm-alerts.md](evidence/gfm-alerts.md) — GitHub community spec
- [evidence/pandoc-and-docusaurus.md](evidence/pandoc-and-docusaurus.md) — `:::` syntax
- [evidence/remark-plugins.md](evidence/remark-plugins.md) — plugin landscape

### External sources
- [Mintlify — Callouts](https://www.mintlify.com/docs/components/callouts)
- [Obsidian Help — Callouts (redirected)](https://obsidian.md/help/callouts)
- [kepano / obsidian-skills — CALLOUTS.md](https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/references/CALLOUTS.md)
- [GitHub Community Discussion #16925 — Alerts beta](https://github.com/orgs/community/discussions/16925)
- [Pandoc Manual §8.18 — Divs and Spans](https://pandoc.org/demo/example33/8.18-divs-and-spans.html)
- [Docusaurus — Admonitions](https://docusaurus.io/docs/markdown-features/admonitions)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [@microflash/remark-callout-directives (Codeberg mirror)](https://codeberg.org/naiyer/remark-callout-directives)
