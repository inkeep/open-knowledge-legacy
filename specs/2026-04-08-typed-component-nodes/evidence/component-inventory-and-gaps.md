---
title: Component Inventory — Sources, Gaps, and Obsidian Parity Tracking
description: Complete inventory of built-in components by source (fumadocs, docskit, shadcn), with gap analysis against Obsidian's 13 callout types + block types. Used to track what's covered, what's deferred, and where each component originates.
created: 2026-04-08
last-updated: 2026-04-08
sources:
  - reports/fumadocs-full-pipeline/evidence/d3-built-in-components.md
  - reports/fumadocs-full-pipeline/evidence/component-runtime-compatibility.md
  - reports/obsidian-vs-fumadocs-component-inventory/REPORT.md (D3 gap analysis)
  - ~/agents/agents-docs/src/mdx-components.tsx
  - ~/agents/node_modules/@inkeep/docskit/dist/mdx.d.ts
---

# Component Inventory — Sources, Gaps, and Obsidian Parity Tracking

## Design Principle

**Fumadocs is the canonical source.** Use fumadocs components wherever available. Docskit and shadcn fill gaps only where fumadocs has no equivalent. No divergent implementations of the same concept (e.g., no docskit Note/Warning/Tip alongside fumadocs Callout — both are callout variants).

---

## In Scope: Built-in Component Set

### Fumadocs (canonical source — 15 components)

| Component | Props Summary | Vite Status | Obsidian Equivalent |
|---|---|---|---|
| **Callout** | `type: 'info'\|'warn'\|'error'\|'success'\|'warning'\|'idea'`, `title?: ReactNode`, `icon?: ReactNode`, `children` | GREEN | Partial — covers 6 of Obsidian's 13 callout types |
| **Tabs** | Radix Tabs container, `groupId?`, `persist?` | GREEN | Tabs (via community plugins) |
| **Tab** | `value`, `id` | GREEN | — |
| **Card** | `href?`, `icon?`, `title: ReactNode`, `description?: ReactNode`, `children` | GREEN | No direct equivalent |
| **Cards** | Grid container | GREEN | — |
| **Steps** | Container, `children` | GREEN | No direct equivalent |
| **Step** | `title?: string`, `children` | GREEN | — |
| **Accordion** | Radix Accordion, `title: string`, `id?`, `children` | GREEN (client) | Foldable content (partial) |
| **Accordions** | `type: 'single'\|'multiple'` | GREEN (client) | — |
| **ImageZoom** | Image props + zoom behavior | GREEN (client) | Image size control + zoom |
| **Files** | File tree container | GREEN (client) | File explorer (core plugin) |
| **File** | Individual file node | GREEN (client) | — |
| **TypeTable** | `type: Record<string, ObjectType>` | GREEN (client) | No equivalent |
| **Banner** | Text + dismissible | GREEN (client) | No equivalent |
| **InlineTOC** | `TOCItemType[]` | GREEN (client) | TOC (core feature) |

**Not registered as components** (handled by markdown primitives):
- CodeBlock/Pre (code fences), Heading h1-h6 (# syntax), Link/a ([]() syntax), Image/img (![]() syntax), Table (pipe tables)

### Docskit (gap fill — 3 components, only where fumadocs has no equivalent)

| Component | Props Summary | Why Needed | Fumadocs Alternative? |
|---|---|---|---|
| **Video** | `src: string`, `title?: string`, `hint?: string`, `fullView?: boolean` | Obsidian renders video natively (`![[video.mp4]]`); fumadocs has no Video component | None |
| **Frame** | `children`, `hint?: string`, `cta?: ReactNode` | Screenshot/demo container; used in agents-docs content; no fumadocs equivalent | None |
| **CodeGroup** | Container for tabbed code blocks | agents-docs content uses this pattern; fumadocs CodeBlockTabs exists but agents-docs content references `<CodeGroup>` | CodeBlockTabs is the fumadocs equivalent but agents-docs MDX files use `<CodeGroup>` tag name |

### Shadcn ecosystem (gap fill — 2 components)

| Component | Registry | Install | Why Needed |
|---|---|---|---|
| **Mermaid** | MermaidCN | `npx shadcn@latest add https://mermaidcn.vercel.app/r/mermaid.json` | Obsidian renders Mermaid natively; fumadocs has `remarkMdxMermaid` plugin but no renderer component |
| **Audio** | AI Elements (Vercel) | `npx shadcn@latest add` from elements.ai-sdk.dev | Obsidian renders audio natively (`![[audio.mp3]]`); no fumadocs or docskit equivalent |

---

## Gap Inventory: Obsidian Features NOT Covered

### Callout Type Gap (tracked for future scoping)

Fumadocs Callout supports 6 types. Obsidian supports 13 types with 25+ aliases.

| Obsidian Type | Aliases | Fumadocs? | Status |
|---|---|---|---|
| note | — | `info` (close equivalent) | Covered (map `note` → `info`) |
| info | — | `info` | Covered |
| tip | hint, important | — | **GAP** |
| warning | caution, attention | `warning` or `warn` | Covered |
| danger | error | `error` | Covered (map `danger` → `error`) |
| success | check, done | `success` | Covered |
| abstract | summary, tldr | — | **GAP** |
| todo | — | — | **GAP** |
| question | help, faq | — | **GAP** |
| failure | fail, missing | — | **GAP** |
| bug | — | — | **GAP** |
| example | — | — | **GAP** |
| quote | cite | — | **GAP** |

**Coverage: 6/13 types covered** (with alias mapping). 7 types are gaps.

**Obsidian callout foldability:** Callouts support `+`/`-` suffix for collapsible behavior. Fumadocs Callout is NOT foldable. Accordion covers the foldable content pattern but is a separate component, not a callout variant.

**Resolution path (Future Work):** Extend fumadocs Callout `type` union upstream or via local override. Add Collapsible wrapper for foldability. Estimated: ~4-6 hours. No architectural blockers — additive change to the Callout component.

### Docskit components NOT used (avoiding divergence)

| Docskit Component | Why Excluded | Fumadocs Equivalent |
|---|---|---|
| `Note` | Callout alias — would diverge from fumadocs Callout | Use `<Callout type="info">` |
| `Warning` | Callout alias — would diverge | Use `<Callout type="warning">` |
| `Tip` | Callout alias — would diverge | Use `<Callout type="idea">` (closest) |
| `Card` (docskit version) | Fumadocs Card exists | Use fumadocs Card |
| `Accordion/Accordions` | Fumadocs Accordion exists | Use fumadocs Accordion |
| `Steps/Step` | Fumadocs Steps exists | Use fumadocs Steps |
| `Tabs/Tab` | Fumadocs Tabs exists | Use fumadocs Tabs |
| `CodeBlock/Pre` | Fumadocs CodeBlock exists | Use fumadocs CodeBlock |
| `Link/a` | Fumadocs Link exists | Use fumadocs Link |
| `Heading h1-h6` | Fumadocs Heading exists | Use fumadocs Heading |

### Other Obsidian Rendering Gaps

| Feature | Type | Status | Notes |
|---|---|---|---|
| PDF embed | Component | **Future Work (Identified)** | No good shadcn option. `react-pdf` or `@react-pdf-viewer/core` viable. ~2-4 hours. |
| Highlight syntax (`==text==`) | Remark plugin + editor mark | **Future Work (Identified)** | Not a component. TipTap `Highlight` extension + `remark-mark` plugin. |
| Comment syntax (`%%text%%`) | Remark plugin | **Future Work (Noted)** | Strip during parse. Obsidian-specific syntax. |
| Subscript/superscript | Remark plugin + editor marks | **Future Work (Noted)** | `remark-sub`/`remark-super` + TipTap marks. |
| Callout foldability | Component enhancement | **Future Work (Explored)** | Radix Collapsible wrapper on Callout. ~2-4 hours. |
| 7 missing callout types | Component enhancement | **Future Work (Explored)** | Extend Callout `type` union + alias map + per-type icons/colors. ~2-4 hours. |

### Knowledge Graph Gaps (out of scope — separate product layer)

| Feature | Effort | Dependency |
|---|---|---|
| Wiki-links (`[[page]]`) | 1-2 days | Page index + resolver |
| Internal embeds (`![[note]]`) | 2-3 days | Transclusion system |
| Block references (`^id`) | 2-3 days | Block ID system |
| Tags (`#tag`) | 1-2 days | Tag index |
| Backlinks panel | 1-2 days | Reverse link computation |
| Graph view | 3-5 days | Force-directed graph |
| Dataview queries | 5-10 days | Query engine |
| Canvas | 10+ days | tldraw/excalidraw |
| Properties visual editor | 2-3 days | Frontmatter form UI |

---

## agents-docs Custom Components (auto-discovered by registry)

These exist in `~/agents/agents-docs/src/components/mdx/` and are NOT built-in. The registry auto-discovers them from the user's component directory.

| Component | Props | Origin |
|---|---|---|
| OptionCard / OptionCards | `title`, `icon?`, `href?`, `badge?`, `highlighted?`, `cta?`, `subtitle?`, children | agents-docs custom |
| BigVideo | `src`, `maxWidth?`, `height?` | agents-docs custom |
| SkillRule | `id`, `skills`, `title`, `description?`, children | agents-docs custom (passthrough) |
| ComparisonTable | custom | agents-docs custom |
| NumberedStepsTOC | custom | agents-docs custom |
| AutoTypeTable | wraps fumadocs TypeTable | agents-docs custom |

These validate the registry's extensibility — no special handling needed. If their .tsx files are in the component discovery path, they appear automatically.
