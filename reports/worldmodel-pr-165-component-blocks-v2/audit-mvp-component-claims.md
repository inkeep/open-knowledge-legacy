---
title: "Audit — MVP Component Set Claims for PR #165 (Obsidian × Notion × Fumadocs cross-map)"
description: "Audit findings on the 5 'overlap' component claims (Callout, Accordion, Accordions, Audio, ImageZoom) from the MVP cross-map response. Corrects over-stated 1:1 claims, identifies which components are actually fumadocs-ui vs OK-custom, and provides a corrected MVP table."
date: 2026-04-22
parent: WORLDMODEL.md
status: complete
audit_target: "Prior conversational MVP cross-map — Obsidian × Notion × Fumadocs — for PR #165 component-blocks-v2"
---

# Audit Findings — MVP Component Claims for PR #165

## Audit metadata

- **Artifact audited:** conversational MVP cross-map table (prior turn in the `/worldmodel` + MVP-slicing session)
- **Audit date:** 2026-04-22
- **Audit protocol:** `shared:audit` skill — Phase 1 intake, Phase 2 reader pass, Phase 3 claim extraction, Phase 4 coherence lenses (L1–L7), Phase 5 factual tracks (T1 codebase, T2 OSS repo, T3 dependency docs, T4 web, T5 ecosystem), Phase 6 findings
- **Sources consulted:**
  - T1 (codebase): `packages/core/src/registry/built-ins.ts`, `packages/app/src/editor/components/{componentMap.tsx,compound-wrappers.tsx,InlineTOCView.tsx}`
  - T2 (OSS source): `~/.claude/oss-repos/fumadocs/packages/{radix-ui,base-ui,obsidian}/src/components/{callout,image-zoom,accordion}.tsx`
  - T3 (3P docs): fumadocs.dev `/docs/ui/components/{accordion,image-zoom,callout}`, `/docs/integrations/obsidian`
  - T4 (web): Obsidian Help (via redirect), obsidian-skills GitHub reference, Notion API reference, Obsidian forum feature-request threads
- **Scope:** only the 5 "overlap" components claimed as 1:1 in the MVP verdict table: Callout, Accordion, Accordions, Audio, ImageZoom

---

## Summary

- **Total findings:** 7 (4 High · 2 Medium · 1 Low)
- **Net effect on MVP count:** unchanged (5 SHIP + 1 BORDERLINE)
- **Net effect on MVP rationale:** meaningful. 3 of the 5 SHIPs had their "1:1" claim contradicted; 1 (Audio) isn't a fumadocs component at all
- **Meta-finding:** fumadocs' own `fumadocs-obsidian` integration package ships **one** component (a bare Callout) + 4 remark plugins — evidence that fumadocs itself doesn't view the 17-component set as "Obsidian parity"

---

## High severity

### [H1] "Callout 1:1 with Obsidian" — **CONTRADICTED**

**Source:** T3 (fumadocs source) + T4 (Obsidian authoritative references)
**Location:** MVP verdict table row for Callout
**Issue:** Stated Callout is 1:1 with Obsidian. It isn't — it's a narrow subset.

**Evidence:**

| | OK / fumadocs-ui Callout | Obsidian Callout |
|---|---|---|
| Types | 6: `info, warn, error, success, warning, idea` | 13: `note, abstract, info, todo, tip, success, question, warning, failure, danger, bug, example, quote` |
| Aliases | 2: `warn→warning, tip→info` (`packages/radix-ui/src/components/callout.tsx:34-38`) | ~22: abstract{summary,tldr}, tip{hint,important}, success{check,done}, question{help,faq}, warning{caution,attention}, failure{fail,missing}, danger{error}, quote{cite} |
| Icons rendered | 5 (info/warning/error/success/idea; `warn` aliases to `warning`) | 13, each distinct |
| Foldable | No (absent from `calloutProps` in `built-ins.ts:35-56`) | Yes: `> [!note]+` opens by default, `> [!note]-` collapsed by default |
| Custom types | No | Yes, via CSS `[data-callout="custom-type"]` with `--callout-color` + `--callout-icon` |
| Type-overlap coverage | 6/13 of Obsidian's types ≈ 46% | 100% |

**Status:** CONTRADICTED (as "1:1"); CONFIRMED (as "similar-but-a-subset")
**Suggested resolution:** Re-classify Callout as **Similar-but-narrower (6/13)**. For Obsidian-user parity the Callout descriptor's `enumValues` needs expansion to 13 types + aliases + foldable prop + default-state prop. **Still ships** in MVP; flag "Obsidian-parity extension" as a natural follow-up.

---

### [H2] "ImageZoom — Obsidian native click-to-zoom" — **CONTRADICTED**

**Source:** T4 (Obsidian forum, multiple threads; community references)
**Location:** MVP verdict table row for ImageZoom
**Issue:** Click-to-zoom on embedded images is **NOT a native Obsidian feature**. Long-standing feature request (open at least since 2023). Obsidian users rely on CSS snippets or plugins (Image Gallery, Image Toolkit).

**Evidence:**
- [Obsidian Forum — Click image to view full image file](https://forum.obsidian.md/t/click-image-to-view-full-image-file-expand-enlarge-image/50927)
- [Click on embedded image to show it full-size?](https://forum.obsidian.md/t/click-on-embedded-image-to-show-it-full-size/65680)
- [Image Zoom and Popup on Click (Desktop)](https://forum.obsidian.md/t/image-zoom-and-popup-on-click-desktop/86641)
- Quote (web search synthesis): *"Currently, Obsidian Desktop does not natively provide a lightbox feature when clicking on images."*

Notion half of the claim holds: Notion's `image` block opens a full-view on click by default.

**Status:** CONTRADICTED (Obsidian half); CONFIRMED (Notion half)
**Suggested resolution:** Reclassify: **Obsidian — plugin/CSS territory; Notion — native**. Meets the "clearly relevant for Obsidian/Notion-like editor" rule (top Obsidian feature request + Notion default), so **still SHIP** under the expanded rule, but frame as "Obsidian improvement, Notion parity" not "Obsidian parity."

---

### [H3] "Our Accordions = what Obsidian / Notion have" — **PARTIALLY INCOHERENT**

**Source:** T1 (code read of `compound-wrappers.tsx`) + T3 (fumadocs Accordion docs) + T4 (Obsidian foldable callouts, Notion toggle)
**Location:** MVP verdict row for Accordion / Accordions (user asked directly about this)
**Issue:** Three stacked precision issues:

1. **OK's Accordions is NOT fumadocs-ui Accordion.** OK ships custom `EditorAccordions` / `EditorAccordion` in `compound-wrappers.tsx` (`componentMap.tsx:62-63`). File-header rationale: *"These replace direct fumadocs-ui compound imports because fumadocs compound components rely on React Context (via Radix's createContextScope) which doesn't cross TipTap's NodeView portal boundaries."* fumadocs' real Accordion is Radix-based (confirmed: *"Based on Radix UI Accordion"*). OK pattern-copies the fumadocs VISUAL only.

2. **Obsidian's foldable callout ≠ a standalone Accordion primitive.** Obsidian's `> [!note]-` is *a callout with a chevron*. The disclosure lives INSIDE the callout primitive. A Radix/Notion-style Accordion is a *dedicated* disclosure pattern with its own chrome (border, divider, grouped keyboard nav). Different primitives producing overlapping UX.

3. **Notion `toggle` vs Radix Accordion.** Notion's `toggle` is minimal — chevron + content, no chrome, no group container. Radix/fumadocs Accordion has a group container with `single` vs `multiple` mode; Notion doesn't have that. Notion does have **toggle headings H1-H4** (distinct primitive combining heading semantics with collapsibility), which neither fumadocs nor Obsidian have.

**Evidence:**
- `componentMap.tsx:62-63`: `Accordions: EditorAccordions, Accordion: EditorAccordion`
- `compound-wrappers.tsx:1-56`: file-header rationale for the pattern-copy
- fumadocs Accordion docs: *"Based on Radix UI Accordion… type: single/multiple, disabled, orientation"*
- Notion API: `toggle` block (flat, no group); `heading_1..4 (is_toggleable: true)` (distinct)

**Status:** INCOHERENT (conflating 3 different primitives), CONFIRMED (overlapping *UX*)
**Suggested resolution:**
- Reclassify Accordion/Accordions: **UX-overlap, primitive-distinct** from Obsidian's foldable callout and from Notion's toggle. Still MVP-worthy because "collapsible content section" is clearly relevant to both audiences — but don't sell it as 1:1.
- Flag that **OK's implementation is already a pattern-copy**, not fumadocs-upstream. If we sliced this out we'd lose `compound-wrappers.tsx` (~431 LoC) but not a fumadocs dep (fumadocs Accordion is never imported).
- Flag **Notion toggle headings H1-H4** as a gap (neither fumadocs nor OK ship them).

---

### [H4] "Audio — 1:1 with Obsidian / Notion" — **PARTIALLY CONTRADICTED + META-CLAIM ISSUE**

**Source:** T1 (`componentMap.tsx`, `built-ins.ts`) + T4 (Obsidian embed docs via community signals)
**Location:** MVP verdict row for Audio
**Issue:** Two issues:

1. **Audio is NOT a fumadocs component at all.** OK's Audio is a 14-line custom function defined inline in `componentMap.tsx:34-47`: a `<div>` wrapper around a native `<audio controls>`. The comment at `built-ins.ts:4` spells it out: *"16 fumadocs-ui + 1 Audio (HTML5 `<audio>` wrapper; see componentMap.tsx)"*. When the user asked "minimum viable *fumadocs components* to ship," Audio isn't in that scope — it's an OK-built primitive using fumadocs CSS visual tokens, not a fumadocs-ui component.

2. **Obsidian authoring syntax ≠ OK/fumadocs authoring syntax.**
   - Obsidian: `![[audio.mp3]]` → renders HTML5 `<audio controls>` automatically on every `.mp3/.webm/.wav/.m4a/.ogg/.3gp/.flac` file
   - OK: `<Audio src="..." title="..." />` JSX component — no wiki-embed automatic rendering
   - Notion: `audio` block with upload attachment

   The **playback UX** is approximately equivalent (all three render HTML5 `<audio controls>`). The **authoring model** differs.

**Status:** CONTRADICTED (as "fumadocs component 1:1"); CONFIRMED (as "playback UX is equivalent, authoring model differs")
**Suggested resolution:**
- Audio is an **OK-authored component using the descriptor-registry pattern**. Ships regardless of the fumadocs slicing decision (removing fumadocs doesn't remove Audio).
- For Obsidian-parity on authoring, the actual match is **markdown-pipeline work**: have `![[audio.mp3]]` wiki-embeds resolve to an `<Audio src="...">` JSX node at the remark level. Orthogonal to the descriptor-registry.

---

## Medium severity

### [M1] Fumadocs' OWN "Obsidian parity" is smaller than the 17-component set — **UNREPORTED CONTEXT**

**Source:** T2 (direct read of `fumadocs-obsidian` package source)
**Location:** context missing from prior response
**Issue:** The user asked about `https://www.fumadocs.dev/docs/integrations/obsidian`. Digging into fumadocs' actual Obsidian integration package reveals **fumadocs itself does not think the 17-component set is what Obsidian users need**.

**Evidence:** `~/.claude/oss-repos/fumadocs/packages/obsidian/` ships:
- **One React component set** (`ObsidianCallout` + `ObsidianCalloutTitle` + `ObsidianCalloutBody` in `src/ui/index.tsx`) — and it has only **5 types** (`info, warn, error, success, warning` — even fewer than fumadocs-ui Callout's 6; no `idea`)
- **Four remark plugins**: `remark-block-id` (Obsidian `^block-id`), `remark-convert` (Obsidian→MDX translator), `remark-obsidian-comment` (`%%comment%%`), `remark-wikilinks` (`[[page]]`)
- **`read-vaults` + `convert` + `build-storage` + `build-resolver`** — Obsidian vault ingestion utilities
- `package.json` version: `0.0.13`, labeled "Experimental"

**Implication:** fumadocs' own Obsidian strategy is "translate Obsidian-flavored markdown to MDX" — syntax-level (remark plugins) rather than component-level. The ONE component they ship is a bare Callout. Everything else in the fumadocs component set is treated as "what docs-site authors write AFTER the Obsidian vault content lands."

**Status:** CONFIRMED (fumadocs' implicit position is "Obsidian parity = 1 callout + 4 remark plugins"), missing context that re-weights the MVP cross-map
**Suggested resolution:** The "Obsidian-relevant fumadocs subset," per fumadocs itself, is empirically 1 component. OK's MVP-5 is *more aggressive* than fumadocs' own Obsidian integration — defensible, but not because fumadocs agrees. It's because the expanded "Obsidian-OR-Notion-like" rule picks up components fumadocs' own integration omits.

---

### [M2] "Notion toggle = Accordion" overgeneralization — **INCOHERENT** (restatement of H3.3)

**Source:** T4 (Notion API reference + help pages)
**Issue:** Restatement of H3 finding #3 — Notion has two distinct disclosure primitives (`toggle` and `heading_1..4` when `is_toggleable: true`). Prior response conflated both with "Accordion."
**Status:** INCOHERENT
**Suggested resolution:** Use "Notion toggle (non-heading variant)" in the cross-map.

---

## Low severity

### [L1] "25+ aliases" for Obsidian callouts — **IMPRECISE**

**Source:** T4 (authoritative references)
**Issue:** Prior response said "25+ aliases" — authoritative references consistently show ~22 aliases across 13 types.
**Evidence:** obsidian-skills reference table + obsidian.rocks + forum reference converge on: abstract{summary,tldr}·tip{hint,important}·success{check,done}·question{help,faq}·warning{caution,attention}·failure{fail,missing}·danger{error}·quote{cite} = 19 aliases across 8 types; plus the 13 primary type names themselves.
**Status:** CONFIRMED-imprecise
**Suggested resolution:** "~22 aliases."

---

## Confirmed claims

Claims that checked out (not in the findings list):

- **Notion `table_of_contents` block exists natively** — confirmed via Notion API reference. InlineTOC's Notion half of the verdict stands.
- **fumadocs ImageZoom wraps `react-medium-image-zoom`** — confirmed at `~/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/image-zoom.tsx:5`.
- **Obsidian's 13 Callout types + foldable syntax** — confirmed across multiple authoritative community references.
- **Notion's 36 native block types + 10 DB view types** — confirmed via Notion API reference.
- **fumadocs is a docs-site framework, not a general MDX toolkit** — confirmed (homepage tagline, package organization).
- **fumadocs has a dedicated `fumadocs-obsidian` integration package** — confirmed (exists at `~/.claude/oss-repos/fumadocs/packages/obsidian/`, published to npm as v0.0.13).

---

## Unverifiable

None — all claims resolved.

---

## Meta-finding: the MVP table needs a column split

The underlying pattern across findings [H1]–[H4]: "1:1" meant several different things simultaneously:

- **Authoring-syntax 1:1** (how users type it)
- **Runtime-behavior 1:1** (what the rendered component does)
- **Primitive-identity 1:1** (is this the same block type in both systems)
- **UX-family 1:1** (does it serve the same user need)

The real cross-map is **4-dimensional**, not 1-D. The MVP decision is cleaner when those concerns are split. For each component, pass/fail on each dimension tells a sharper story than one binary 1:1 claim.

---

## Corrected MVP table

| # | Component | Obsidian type-match | Obsidian runtime | Notion primitive | UX-family fit | MVP verdict |
|---|---|---|---|---|---|---|
| 1 | **Callout** | Partial (6/13 types; 2/22 aliases; no foldable) | ✅ (colored box + icon + children) | Partial (free-form icon + color vs type-bundle) | ✅ HIGH | **SHIP** + Obsidian-parity follow-up |
| 2 | **Accordion** | ❌ no native primitive | Partial (foldable callouts render similar UX) | ✅ `toggle` (minimal) | ✅ HIGH | **SHIP** (OK-custom, not fumadocs) |
| 3 | **Accordions** (group) | ❌ | N/A | ❌ no group container in Notion | ✅ MED-HIGH | **SHIP** (additive primitive) |
| 4 | **Audio** | ✅ authoring (`![[audio.mp3]]`) | ✅ HTML5 `<audio controls>` | ✅ `audio` block | ✅ HIGH | **SHIP** (OK-custom — not fumadocs) |
| 5 | **ImageZoom** | ❌ plugin/CSS territory | ❌ not default | ✅ click-to-full-view default | ✅ HIGH (Obsidian users actively want) | **SHIP** (Obsidian improvement, Notion parity) |
| 6 | **InlineTOC** | ❌ sidebar outline only | ❌ not native | ✅ `table_of_contents` | MEDIUM | **BORDERLINE** (Notion-only native) |

---

## Net effect on the MVP decision

**Count unchanged** — still 5 SHIP + 1 BORDERLINE. **Rationale honest-er:**

- **Callout** — fumadocs covers 46% of Obsidian's type surface; "Obsidian-parity extension" (add 7 types + foldable) is the natural completion, ~1-2 days per prior obsidian-vs-fumadocs report estimates
- **Accordion/Accordions** — UX family is universal; OK's implementation is *already* pattern-copied from fumadocs (not a fumadocs import)
- **Audio** — playback UX universal; OK-custom, *not in the fumadocs slicing decision at all*
- **ImageZoom** — Obsidian users actively want this (top forum requests); fumadocs provides it cleanly
- **InlineTOC** — only Notion has it natively; OK has a sidebar outline that may cover the same need

## Fumadocs-ui usage reality check

Of PR #165's 17 component descriptors, **which actually use `fumadocs-ui/*`?**

| Actually imports from `fumadocs-ui` | 12 | Banner, Callout, Card, Cards, File, Files, Folder, ImageZoom, **InlineTOC (wrapped in InlineTOCView)**, Step, Steps, TypeTable |
| OK-custom (no fumadocs React import) | 5 | Tab, Tabs, Accordion, Accordions, Audio |

Of the MVP-5 (Callout, Accordion, Accordions, Audio, ImageZoom):
- **2 use fumadocs-ui:** Callout, ImageZoom
- **3 are OK-custom:** Accordion, Accordions, Audio

**CSS styling dependency remains:** OK-custom components (`EditorAccordions`, `EditorTabs`, `Audio`, etc.) use fumadocs CSS tokens (`bg-fd-card`, `text-fd-muted-foreground`, `--color-fd-*`) via the CSS variable bridge in `packages/app/src/globals.css`. Even a zero-fumadocs-React-component slice would still pull in the fumadocs-ui dep for the token bridge unless the tokens were copied / re-authored locally.

## Two additive items the audit surfaces as useful MVP scope

Neither is a fumadocs component, so neither is part of the 17-set slicing decision, but both would notably increase Obsidian-user parity:

1. **Callout extension**: expand the descriptor's `enumValues` from 6 → 13 types, add aliases map, add `foldable: boolean` + `defaultOpen: boolean` props. Matches the Obsidian-vs-fumadocs report's ~1-2 day estimate.
2. **`![[audio.mp3]]` wiki-embed → `<Audio src="...">` resolver**: markdown-pipeline work, resolves Obsidian's standard embed syntax to OK's Audio component at the remark level. Matches the `fumadocs-obsidian/remark-convert` strategy.

---

## Sources

### Code (T1)
- `packages/core/src/registry/built-ins.ts`
- `packages/app/src/editor/components/componentMap.tsx`
- `packages/app/src/editor/components/compound-wrappers.tsx`
- `packages/app/src/editor/components/InlineTOCView.tsx`

### OSS (T2)
- `~/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/callout.tsx`
- `~/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/image-zoom.tsx`
- `~/.claude/oss-repos/fumadocs/packages/obsidian/src/ui/index.tsx`
- `~/.claude/oss-repos/fumadocs/packages/obsidian/src/{index.ts,remark/*}`
- `~/.claude/oss-repos/fumadocs/packages/obsidian/package.json`

### Docs (T3)
- [fumadocs Obsidian integration](https://www.fumadocs.dev/docs/integrations/obsidian)
- [fumadocs Accordion docs](https://www.fumadocs.dev/docs/ui/components/accordion)
- [fumadocs ImageZoom docs](https://www.fumadocs.dev/docs/ui/components/image-zoom)

### Web (T4)
- [Obsidian Callouts reference — kepano/obsidian-skills](https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/references/CALLOUTS.md)
- [Obsidian Forum — All Callout Styles for Reference](https://forum.obsidian.md/t/all-callout-styles-for-reference/36102)
- [Using Callouts in Obsidian — Obsidian Rocks](https://obsidian.rocks/using-callouts-in-obsidian/)
- [Obsidian Forum — Click image to view full image file](https://forum.obsidian.md/t/click-image-to-view-full-image-file-expand-enlarge-image/50927)
- [Obsidian Forum — Click on embedded image to show it full-size](https://forum.obsidian.md/t/click-on-embedded-image-to-show-it-full-size/65680)
- [Obsidian Forum — Image Zoom and Popup on Click (Desktop)](https://forum.obsidian.md/t/image-zoom-and-popup-on-click-desktop/86641)
- [Notion Developers — Block](https://developers.notion.com/reference/block)
- [Notion Help — Types of content blocks](https://www.notion.com/help/guides/types-of-content-blocks)

### Prior research (cross-referenced)
- `reports/obsidian-vs-fumadocs-component-inventory/REPORT.md`
- `reports/worldmodel-pr-165-component-blocks-v2/WORLDMODEL.md`
- `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md`
