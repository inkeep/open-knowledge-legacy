---
title: Fumadocs UI Component Runtime Compatibility Analysis
date: 2026-04-03
source: github.com/fuma-nama/fumadocs @ 5d00e08
packages_analyzed:
  - "@fumadocs/base-ui@16.7.10 (packages/base-ui)"
  - "fumadocs-ui@16.7.10 (packages/radix-ui)"
  - "fumadocs-core (packages/core)"
purpose: Determine which fumadocs-ui components can run in a pure Vite/browser context without Next.js
---

# Fumadocs UI Component Runtime Compatibility

## Executive Summary

**The news is very good.** Fumadocs has been architecturally refactored to be framework-agnostic. The critical finding is a `FrameworkProvider` abstraction layer in `fumadocs-core/framework` that decouples all components from Next.js. Components use `fumadocs-core/link` (which delegates to the framework provider) rather than importing `next/link` directly. Next.js is an **optional** peer dependency in both `@fumadocs/base-ui` and `fumadocs-ui`.

The MDX content components (`defaultMdxComponents`) are almost entirely pure client React. The main caveat is syntax highlighting, which has both a build-time path (rehype plugin) and a runtime path (`DynamicCodeBlock`).

---

## 1. Package Architecture (As of April 2026)

The old monolithic `fumadocs-ui` package has been split:

| Package | npm name | UI Primitive Library |
|---|---|---|
| `packages/base-ui` | `@fumadocs/base-ui` | `@base-ui/react` (Base UI) |
| `packages/radix-ui` | `fumadocs-ui` | `@radix-ui/react-*` (Radix UI) |
| `packages/core` | `fumadocs-core` | (no UI primitives) |

Both UI packages share identical component logic; they differ only in the underlying primitive library (collapsible, accordion, tabs, etc.). The analysis below applies to both.

### Framework Abstraction Layer

`fumadocs-core/framework/index.tsx` defines a `FrameworkProvider` context that supplies:
- `usePathname()` -- current route path
- `useRouter()` -- `push()` and `refresh()`
- `useParams()` -- route parameters
- `Link` component -- framework-specific link
- `Image` component -- framework-specific image

**When no provider is configured, both `Link` and `Image` fall back to plain HTML `<a>` and `<img>` elements.** This is the key enabler for Vite usage.

Framework-specific providers exist at:
- `fumadocs-core/framework/next.tsx` -- imports `next/link`, `next/image`, `next/navigation`
- `fumadocs-core/framework/react-router.tsx` -- imports `react-router`
- `fumadocs-core/framework/tanstack.tsx` -- imports TanStack Router
- `fumadocs-core/framework/waku.tsx` -- imports Waku

There are also corresponding UI-level providers:
- `@fumadocs/base-ui/provider/next`
- `@fumadocs/base-ui/provider/react-router`
- `@fumadocs/base-ui/provider/tanstack`
- `@fumadocs/base-ui/provider/base` (framework-agnostic, uses `next-themes` + search)

---

## 2. Component-by-Component Analysis

### defaultMdxComponents (from `mdx.tsx`)

These are the components exported by the `mdx` entrypoint and used to render MDX content. This is the primary set relevant to the knowledge editor.

| Component | Pure Client React? | `'use client'`? | Next.js Dependency? | Build-time Dependency? | Notes |
|---|---|---|---|---|---|
| **Callout / CalloutContainer / CalloutTitle / CalloutDescription** | YES | No directive (server-compatible) | None | None | Pure React + Tailwind + lucide-react icons. Zero framework dependencies. |
| **Tabs / Tab / TabsList / TabsTrigger / TabsContent** | YES | `'use client'` | None | None | Uses React context + useState. Delegates to `./ui/tabs` which is either Base UI Tabs or Radix Tabs. No framework imports. |
| **Card / Cards** | YES (with caveat) | No directive | Indirect via `fumadocs-core/link` | None | Uses `fumadocs-core/link` for the `href` prop. Without FrameworkProvider, Link falls back to `<a>`. Safe. |
| **Steps / Step** | YES | No directive | None | None | Pure React. Just wraps children in `<div className="fd-steps">`. Trivially portable. |
| **Accordion / Accordions** | YES | `'use client'` | None | None | Uses React state/effects + useCopyButton hook + `./ui/accordion` (Base UI or Radix). Hash-based URL linking uses `window.location`. No framework imports. |
| **TypeTable** | YES | `'use client'` | Indirect via `fumadocs-core/link` | None | Uses `fumadocs-core/link` for optional type description links. Collapsible from UI primitives. useState + useEffect. |
| **ImageZoom** | YES (with caveat) | `'use client'` | Indirect via `fumadocs-core/framework` Image | None | Uses `Image` from `fumadocs-core/framework` which falls back to `<img>` without a provider. Wraps `react-medium-image-zoom`. |
| **Files / File / Folder** | YES | `'use client'` | None | None | Pure React + useState + Collapsible. lucide-react icons. No framework imports. |
| **Heading** | YES | No directive | None | None | Pure React. Uses `<a>` for anchor links + lucide-react `LinkIcon`. |
| **CodeBlock / Pre / CodeBlockTabs / CodeBlockTabsList / CodeBlockTabsTrigger / CodeBlockTab** | YES | `'use client'` | None | **See below** | The component itself is pure React (copy button, tabs, `<figure>`/`<pre>` rendering). But the **content it receives** may be pre-highlighted HTML from build-time. |
| **`pre` (in defaultMdxComponents)** | YES | N/A (inline) | None | **See below** | Wraps children in `<CodeBlock><Pre>...</Pre></CodeBlock>`. The `<pre>` element receives children that are typically pre-highlighted HAST-to-JSX from the MDX build pipeline. |
| **`a` (Link)** | YES | `'use client'` (in core) | Indirect via FrameworkProvider | None | `fumadocs-core/link` handles external detection. Falls back to `<a>` without provider. |
| **`img` (Image)** | YES | `'use client'` (in core) | Indirect via FrameworkProvider | None | Wraps `fumadocs-core/framework` Image. Falls back to `<img>` without provider. |
| **`table`** | YES | No directive | None | None | Pure wrapper: `<div className="overflow-auto"><table>{...}</table></div>`. |
| **`h1`-`h6`** | YES | No directive | None | None | Delegates to `Heading` component. |

### Additional Components (not in defaultMdxComponents)

| Component | Pure Client React? | Next.js Dependency? | Build-time Dependency? | Notes |
|---|---|---|---|---|
| **Banner** | YES | None | None | `'use client'`. Uses localStorage for dismiss state. Pure React. |
| **InlineTOC** | YES | None | None | `'use client'`. Takes `TOCItemType[]` as prop. Uses Collapsible. Type-only import from `fumadocs-core/toc`. |
| **DynamicCodeBlock** | YES | None | Shiki (runtime) | `'use client'`. **This is the runtime syntax highlighter.** Uses `fumadocs-core/highlight/shiki/react` which runs Shiki in the browser via useEffect. |
| **DynamicCodeBlock.core** | YES | None | Shiki (runtime) | `'use client'`. Core implementation using `useShikiDynamic` hook. Pure client-side highlighting. |
| **ServerCodeBlock (codeblock.rsc)** | NO | RSC-only | Shiki (server) | `async function` component. Uses `fumadocs-core/highlight` which calls Shiki on the server. **Cannot run in browser.** |
| **GithubInfo** | PARTIAL | None | Fetch at render | Uses React 19 `use()` with a promise to fetch GitHub API data. Could work client-side but involves async data fetching at render time. The `next.revalidate` in fetch options is Next.js-specific but optional. |
| **OG Image** (`og.tsx`) | NO | `next/og` | Build/server | Imports directly from `next/og`. Server-side only for Open Graph image generation. |

### Layout Components

| Component Category | Pure Client React? | Framework Dependency? | Notes |
|---|---|---|---|
| **DocsLayout / DocsPage** | Partially | FrameworkProvider required | Uses `usePathname`, `Link` from `fumadocs-core/framework`. Requires FrameworkProvider to be configured. Uses `PageTree` types. |
| **Sidebar** | Partially | FrameworkProvider required | Uses `usePathname`, `Link`, `useMediaQuery`. Heavy framework coupling. |
| **TOC** | YES | None | `'use client'`. Uses IntersectionObserver for scroll tracking. Pure browser APIs. |
| **Breadcrumb** | Partially | FrameworkProvider required | Uses `getBreadcrumbItemsFromPath` + `Link`. |
| **Footer (prev/next)** | Partially | FrameworkProvider required | Uses `usePathname` + `Link` + PageTree navigation. |
| **RootProvider** | YES | Optional | Composes `next-themes`, search provider, i18n provider, direction provider. No hard Next.js dep. |

### Search Components

| Component | Pure Client React? | Server Dependency? | Notes |
|---|---|---|---|
| **SearchDialog (base)** | YES | None | `'use client'`. Uses `useRouter` from framework for navigation on result click. |
| **DefaultSearchDialog** | YES | Fetch API | `'use client'`. `type: 'fetch'` calls a search API endpoint. `type: 'static'` downloads a pre-built Orama index and searches client-side. |
| **OramaSearchDialog** | YES | Orama Cloud | `'use client'`. Client-side search via Orama Cloud SDK. |
| **AlgoliaSearchDialog** | YES | Algolia | `'use client'`. Client-side search via Algolia. |

---

## 3. Directive Analysis

### `'use client'` directives

73 files across `packages/base-ui/src` have `'use client'`. This is comprehensive -- essentially every interactive component and context is marked as a client component.

### `'use server'` directives

**Zero** files have `'use server'`. No server actions anywhere in the UI packages.

### Server Components (no directive)

Files without `'use client'` that are NOT type-only:
- `callout.tsx` -- pure function components, no hooks. Works as either server or client component.
- `card.tsx` -- same pattern.
- `steps.tsx` -- same pattern.
- `heading.tsx` -- same pattern.
- `codeblock.rsc.tsx` -- async function, RSC-only.
- `github-info.tsx` -- uses `use()` with a promise (React 19 pattern, technically can work client-side).
- `mdx.tsx` / `mdx.server.tsx` -- the MDX component map exports.
- Layout index files (docs, flux, notebook, home) -- mostly composition wrappers.

---

## 4. Import Analysis

### Next.js Imports in UI Packages

| Import | Location | Impact |
|---|---|---|
| `next/og` | `og.tsx` only | OG image generation. Completely separate from MDX components. |
| `next/navigation` | `provider/next.tsx` only | Only loaded when using the Next.js provider. |
| `next/link` | `provider/next.tsx` only | Same. |
| `next/image` | `provider/next.tsx` only | Same. |

**No Next.js imports exist in any MDX content component.**

### Next.js Imports in Core

| Import | Location | Impact |
|---|---|---|
| `next/navigation`, `next/link`, `next/image` | `framework/next.tsx` only | Framework provider implementation. |
| `next/server`, `next/dist/server/web/next-url` | `i18n/middleware.ts` only | Server middleware. Irrelevant to UI. |
| `next/dist/shared/lib/get-img-props` (type import) | `framework/index.tsx` | **Type-only import**, erased at compile time. Does not create a runtime dependency. |

### Node.js / Server-only Imports

**Zero** `fs`, `path`, `crypto`, or `server-only` imports in either UI package.

### fumadocs-core Utilities Used by MDX Components

| Utility | Used By | Server-only? | Notes |
|---|---|---|---|
| `fumadocs-core/link` | Card, TypeTable, mdx `<a>` | No | `'use client'`. Falls back to `<a>`. |
| `fumadocs-core/framework` (Image) | ImageZoom, mdx `<img>` | No | `'use client'`. Falls back to `<img>`. |
| `fumadocs-core/toc` (types) | InlineTOC | No | Type-only import. |
| `fumadocs-core/highlight/shiki/react` | DynamicCodeBlock.core | No | `'use client'`. Runtime Shiki in browser. |
| `fumadocs-core/highlight/shiki/full` | DynamicCodeBlock | No | Lazy-loads Shiki. Browser-compatible. |
| `fumadocs-core/highlight` | codeblock.rsc (ServerCodeBlock) | **YES** | Async server-side highlighting. |
| `fumadocs-core/search/client` | Search dialogs | No | `'use client'`. Client-side search hooks. |
| `fumadocs-core/utils/use-on-change` | Search dialogs, TOC, Sidebar | No | Simple React hook. |

---

## 5. Syntax Highlighting Deep Dive

This is the most complex area. Fumadocs supports **three** highlighting paths:

### Path 1: Build-time (rehype-code plugin)

- **When**: Standard MDX pipeline via `fumadocs-mdx` or `fumadocs-core/mdx-plugins/rehype-code`
- **How**: `@shikijs/rehype` runs during MDX compilation. Shiki processes code blocks and produces HAST nodes (HTML AST with `<span>` elements carrying inline styles/class names for syntax tokens).
- **What the client receives**: Pre-highlighted JSX. The `<pre>` component in `defaultMdxComponents` just wraps this in `<CodeBlock><Pre>{children}</Pre></CodeBlock>`. The CodeBlock component itself is pure React -- it adds the copy button, tab support, and styling, but the syntax colors are already baked into the children.
- **Vite impact**: If you compile MDX at build time with the rehype-code plugin, this works fine in any bundler. The output is static React elements.

### Path 2: Server-side on-demand (ServerCodeBlock / codeblock.rsc)

- **When**: Using `ServerCodeBlock` in a React Server Component
- **How**: `async function` that calls `fumadocs-core/highlight` which invokes Shiki server-side
- **What the client receives**: Pre-highlighted JSX (same as build-time, but generated at request time)
- **Vite impact**: **Cannot use this.** It is an async React component (RSC pattern). Not usable in client-side React.

### Path 3: Runtime client-side (DynamicCodeBlock)

- **When**: Using `DynamicCodeBlock` component
- **How**: `'use client'` component that uses `fumadocs-core/highlight/shiki/react` (`useShikiDynamic` hook). Loads Shiki lazily in the browser, highlights code in a `useEffect`, and renders the result.
- **What the client receives**: Initially unhighlighted text (placeholder), then highlighted JSX after Shiki loads.
- **Vite impact**: **This is the path to use for the knowledge editor.** It runs entirely in the browser. Uses Shiki's JavaScript regex engine (no WASM required by default, though WASM is also available). Supports Suspense boundaries.

### Recommendation for the Editor

Use `DynamicCodeBlock` for live code preview in the editor. It is explicitly designed for client-side rendering. The default Shiki factory uses `createJavaScriptRegexEngine()` which is pure JavaScript -- no WASM binary loading needed.

Alternatively, you could use a lighter-weight runtime highlighter (Prism, highlight.js) and map the output to the same `<CodeBlock><Pre>` wrapper to maintain visual consistency.

---

## 6. Search Component Analysis

The search UI components are all `'use client'` and work with multiple backends:

| Search Type | Backend | Client-side? | Notes |
|---|---|---|---|
| `fetch` | Server API endpoint | Client fetch | Requires a `/api/search` endpoint. Works with any HTTP backend. |
| `static` | Pre-built Orama index (JSON) | Fully client-side | Downloads a static JSON index file, loads into Orama in the browser. **Best for Vite.** |
| `orama-cloud` | Orama Cloud | Client-side | SaaS search. Works anywhere. |
| `algolia` | Algolia | Client-side | SaaS search. Works anywhere. |

The search dialog components use `useRouter()` from the framework context to navigate when a result is clicked. This requires a FrameworkProvider to be set up, but the fallback behavior (or a custom provider) would work.

---

## 7. Layout Component Adaptation Assessment

| Component | Vite Feasibility | Required Work |
|---|---|---|
| **DocsLayout** | Medium | Needs FrameworkProvider with Vite-compatible routing (could use `react-router` provider). Needs PageTree data structure. |
| **Sidebar** | Medium | Same as DocsLayout. Heavily tied to PageTree navigation model. |
| **TOC** | High | Uses IntersectionObserver (browser API). Just needs TOCItemType[] data. |
| **Breadcrumb** | Medium | Needs pathname + PageTree. Could be adapted. |
| **RootProvider** | High | `next-themes` works without Next.js. Search and i18n are optional. |

**For the knowledge editor use case, layout components are likely irrelevant** -- the editor renders individual MDX blocks, not full documentation pages.

---

## 8. Classification Summary

### GREEN: Safe for Vite/Browser (No Modifications Needed)

These components work out of the box in any React environment:

- Callout / CalloutContainer / CalloutTitle / CalloutDescription
- Tabs / Tab / TabsList / TabsTrigger / TabsContent
- Steps / Step
- Accordion / Accordions
- Files / File / Folder
- Heading
- Banner
- InlineTOC
- CodeBlock / Pre / CodeBlockTabs / CodeBlockTabsList / CodeBlockTabsTrigger / CodeBlockTab
- TypeTable
- Table (mdx wrapper)

### YELLOW: Work with Minor Setup

These components work but need the `FrameworkProvider` context or a substitute:

- Card / Cards -- uses `fumadocs-core/link` which falls back to `<a>` without provider. **Actually works without provider** since the Link component has a built-in `<a>` fallback.
- ImageZoom -- uses `fumadocs-core/framework` Image which falls back to `<img>` without provider. **Actually works without provider.**
- `a` (mdx link) -- same as Card.
- `img` (mdx image) -- same as ImageZoom.
- DynamicCodeBlock -- works but requires Shiki to be bundled. Adds ~500KB+ to bundle. Tree-shakeable by language.

### RED: Cannot Run in Browser

- ServerCodeBlock (`codeblock.rsc`) -- async component, server-only
- OG Image generation (`og.tsx`) -- `next/og` dependency
- `createRelativeLink` (`mdx.server.tsx`) -- explicitly Node.js only, throws error in browser
- GithubInfo -- uses `use()` with fetch promise; technically could work but designed for RSC pattern

---

## 9. The `next-themes` Question

Both UI packages depend on `next-themes` for dark mode. Despite the name, `next-themes` **works without Next.js**. It manipulates DOM classes/attributes directly. The only requirement is wrapping the app in `<ThemeProvider>`. This is a non-issue for Vite.

---

## 10. The `StaticImport` Type Question

`fumadocs-core/framework/index.tsx` imports `type { StaticImport } from 'next/dist/shared/lib/get-img-props'`. This is a **type-only import** (`import type`), which TypeScript erases during compilation. It creates no runtime dependency on Next.js. However, it may cause TypeScript errors if `next` is not installed. Workaround: install `next` as a devDependency, or use `skipLibCheck: true` in tsconfig, or type-stub it.

---

## 11. Practical Recommendations for the Knowledge Editor

### Minimal setup for MDX component preview in Vite:

1. **Install**: `@fumadocs/base-ui` (or `fumadocs-ui`) + `fumadocs-core`
2. **Import CSS**: `@fumadocs/base-ui/style.css` (Tailwind-based, requires Tailwind v4)
3. **Use `defaultMdxComponents`** from `@fumadocs/base-ui/mdx` directly -- no provider needed for basic rendering
4. **For syntax highlighting**: Use `DynamicCodeBlock` from `@fumadocs/base-ui/components/dynamic-codeblock` for runtime highlighting, OR pre-highlight during MDX compilation if you have a build step
5. **Optional**: Wrap in `FrameworkProvider` if you need proper Link behavior (client-side navigation), but for a preview context, `<a>` fallback is fine
6. **Skip**: ServerCodeBlock, OG, createRelativeLink, layout components

### What you do NOT need:

- Next.js
- Any server-side rendering infrastructure
- Any build-time MDX pipeline (if using DynamicCodeBlock for code)
- The `fumadocs-mdx` package (that's the content source layer)

### Bundle size considerations:

- `@fumadocs/base-ui` without Shiki: relatively lightweight (Tailwind CSS + Base UI primitives + lucide-react icons)
- With DynamicCodeBlock + Shiki: adds ~500KB-1MB depending on languages loaded (Shiki lazy-loads languages on demand)
- Alternative: use a lighter runtime highlighter and map output to the CodeBlock shell component
