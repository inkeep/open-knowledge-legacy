# Evidence: D4 — UI Components Per-Component Source Analysis

**Dimension:** UI components from fumadocs-ui (radix-ui package)
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/radix-ui/src/components/

---

## Key files referenced

- `callout.tsx` (98 lines) — Callout/admonition component
- `tabs.tsx` (190 lines) — Tabs/Tab with collection-based index
- `steps.tsx` (10 lines) — Steps/Step CSS containers
- `accordion.tsx` (106 lines) — Accordion with hash-based open state
- `card.tsx` (48 lines) — Card/Cards grid component
- `codeblock.tsx` (240 lines) — CodeBlock with copy, tabs, line numbers
- `files.tsx` (68 lines) — File tree component
- `image-zoom.tsx` (50 lines) — Image zoom via react-medium-image-zoom
- `type-table.tsx` (180 lines) — Type documentation table
- `inline-toc.tsx` (45 lines) — Inline table of contents
- `banner.tsx` (142 lines) — Dismissable banner
- `package.json` — fumadocs-ui dependencies

---

## Findings

### Finding: Component dependency footprint assessment

| Component | Lines | Client? | External Deps | Fumadocs Core Deps | Context Required? |
|-----------|-------|---------|---------------|--------------------|--------------------|
| Callout | 98 | No (RSC) | lucide-react | None | No |
| Steps/Step | 10 | No (RSC) | None | None | No |
| Card/Cards | 48 | No (RSC) | None | `fumadocs-core/link` | No |
| Tabs/Tab | 190 | Yes | None | None | Own TabsContext |
| Accordion | 106 | Yes | lucide-react | None | No |
| CodeBlock | 240 | Yes | lucide-react | None | Own TabsContext |
| Files/File/Folder | 68 | Yes | lucide-react, cva | None | No |
| ImageZoom | 50 | Yes | react-medium-image-zoom | `fumadocs-core/framework` (Image) | No |
| TypeTable | 180 | Yes | lucide-react, cva | `fumadocs-core/link` | No |
| InlineTOC | 45 | Yes | lucide-react | `fumadocs-core/toc` (type only) | No |
| Banner | 142 | Yes | lucide-react | None | No |

**Confidence:** CONFIRMED

### Finding: Callout is fully self-contained, ideal void node component
**Confidence:** CONFIRMED
**Evidence:** callout.tsx lines 1-98

No context providers. Props: `type` (info/warn/error/success/idea), `title`, `icon`, `children`. Uses Tailwind with `fd-` CSS variable prefix (`--color-fd-info`, `--color-fd-warn`, etc.). Only external deps: `lucide-react` icons (Info, TriangleAlert, etc.). Uses `cn()` utility (local Tailwind merge).

Could serve as a TipTap void node by rendering `<Callout type="warn" title="Note">content</Callout>` inside a NodeView.

### Finding: Steps/Step is the simplest component — pure CSS wrapper
**Confidence:** CONFIRMED
**Evidence:** steps.tsx (10 lines)

```typescript
export function Steps({ children }: { children: ReactNode }) {
  return <div className="fd-steps">{children}</div>;
}
export function Step({ children }: { children: ReactNode }) {
  return <div className="fd-step">{children}</div>;
}
```

Zero dependencies. Pure Tailwind CSS (`.fd-steps`, `.fd-step` classes defined in fumadocs' Tailwind preset).

### Finding: Tabs uses internal Context + collection-based indexing, no global providers
**Confidence:** CONFIRMED
**Evidence:** tabs.tsx lines 41-44, 170-183

Creates its own `TabsContext` for child `<Tab>` components to discover their index. Uses `useId()` + `useEffect()` for collection tracking. Wraps Radix UI `Tabs` primitive from `./ui/tabs`. No Fumadocs global context needed.

### Finding: CodeBlock is the most complex component but self-contained
**Confidence:** CONFIRMED
**Evidence:** codeblock.tsx (240 lines)

Features: copy button, title bar, icon rendering, line numbers, code tabs (CodeBlockTabs/CodeBlockTabsList/CodeBlockTabsTrigger/CodeBlockTab). Uses own `TabsContext`. Renders Shiki-highlighted HTML output. No Fumadocs context providers.

Would need adaptation for TipTap: the HTML from Shiki goes into `<pre>` blocks that CodeBlock wraps. In an editor context, code blocks might be handled differently (syntax highlighting in the editor itself).

### Finding: Card imports fumadocs-core/link — a thin wrapper
**Confidence:** CONFIRMED
**Evidence:** card.tsx line 1

`import Link from 'fumadocs-core/link'` — this is a framework-aware link component (renders Next.js `<Link>` or standard `<a>` based on environment). Could be replaced with a standard `<a>` tag or any router-specific Link.

### Finding: ImageZoom imports fumadocs-core/framework for Image component
**Confidence:** CONFIRMED
**Evidence:** image-zoom.tsx line 3

`import { Image, type ImageProps } from 'fumadocs-core/framework'` — framework-abstracted Image component. In Next.js it resolves to `next/image`, elsewhere to `<img>`. Replaceable with a standard `<img>`.

### Finding: The fd-* CSS variable system is extensive but adoptable
**Confidence:** CONFIRMED
**Evidence:** callout.tsx line 58, banner.tsx line 71, all components

Components use `--color-fd-*` CSS variables: `fd-card`, `fd-card-foreground`, `fd-muted`, `fd-muted-foreground`, `fd-accent`, `fd-accent-foreground`, `fd-primary`, `fd-secondary`, `fd-border`, `fd-ring`, `fd-background`, `fd-info`, `fd-warn`, `fd-error`, `fd-success`. Also `--fd-banner-height` for layout.

These are defined in `@fumadocs/tailwind` Tailwind preset. They map to standard Tailwind V4 CSS variables. Could be adopted alongside our own design system or remapped.

### Finding: No global DocsProvider context is required by content components
**Confidence:** CONFIRMED
**Evidence:** All component source files examined

The content components (Callout, Tabs, Steps, Accordion, Card, CodeBlock, Files, ImageZoom, TypeTable, InlineTOC, Banner) have ZERO dependency on any global Fumadocs context provider like `DocsProvider` or `ThemeProvider`. They are self-contained React components with local state management via own Context (Tabs, CodeBlock) or stateless rendering (Callout, Steps, Card).

Layout components (sidebar, TOC, DocsLayout) DO require context providers, but content components do not.

### Finding: fumadocs-ui package.json shows heavy dependency tree
**Confidence:** CONFIRMED
**Evidence:** radix-ui/package.json dependencies

Hard dependencies: 7 Radix UI packages, `class-variance-authority`, `lucide-react`, `motion` (Framer Motion), `next-themes`, `react-medium-image-zoom`, `react-remove-scroll`, `rehype-raw`, `scroll-into-view-if-needed`, `tailwind-merge`, `unist-util-visit`.

Peer dependencies: `fumadocs-core`, `next` (optional), `react`, `react-dom`, `shiki` (optional).

Importing `fumadocs-ui` as a package pulls in Radix UI, Framer Motion, and many other deps. Individual component imports are tree-shakeable, but the package-level dependency list is substantial.

---

## Gaps / follow-ups

- Layout components (sidebar, TOC, DocsLayout) not analyzed for context dependencies
- Search dialog components not analyzed
- `fumadocs add` CLI command source not read to verify copy-source behavior
