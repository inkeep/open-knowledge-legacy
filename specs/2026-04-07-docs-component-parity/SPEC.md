# Docs Component Parity: Enable /write-docs and /docs Skills

## 1. Problem

The `/write-docs` skill assumes ~20 MDX components are globally registered and several infrastructure pieces (remark plugins, frontmatter fields, icon resolver, snippet system) exist. open-knowledge's docs site is a bare scaffold — zero custom components, no plugins, no schema extensions. Any doc page following the skill's tutorial, integration, or overview patterns will **fail to build**.

## 2. Goal

Bring open-knowledge's fumadocs setup to a level where `/write-docs` and `eng:docs` produce valid, building MDX output. Match the openbolts baseline and cherry-pick generalizable infrastructure from agents.

**Design principle:** Prefer fumadocs-ui built-in components over custom implementations. Only add custom components when no native equivalent exists.

## 3. Consumers

| Consumer | Need |
|---|---|
| `/write-docs` skill | Components it templates authors to use must exist and render |
| `eng:docs` skill | Delegates to `/write-docs`; same requirements |
| Human doc authors | Consistent component vocabulary across repos |
| CI/build | MDX must compile without "component not found" errors |

## 4. Current State

**open-knowledge** (`docs/`):
- 3 fumadocs packages: core ~16.1.0, ui ~16.1.0, mdx ~14.0.3
- `mdx-components.tsx` spreads only `defaultMdxComponents` (gives: Card, Cards, Callout, CodeBlockTabs, pre, a, img, h1-h6, table)
- No remark plugins beyond default rehype code config
- No frontmatter schema extensions
- No icon resolver
- No `_snippets/` directory
- No custom components
- 4 content pages, flat structure

**What defaultMdxComponents already provides** (no action needed):
- `Card`, `Cards` — navigation cards
- `Callout` — callout boxes with `type` prop (`'info' | 'warn' | 'warning' | 'error' | 'success' | 'idea'`)
- `CodeBlockTabs`, `CodeBlockTab`, etc. — tabbed code blocks
- `pre`, `a`, `img`, `h1`-`h6`, `table`

## 5. Target State

After this work, `mdx-components.tsx` registers all components the `/write-docs` skill uses (using fumadocs-ui native names), remark plugins enable mermaid/snippets/type-tables, frontmatter supports `sidebarTitle`/`keywords`, and sidebar icons resolve from Lucide.

## 6. Scope

### In Scope

#### 6.1 Register fumadocs-ui components in mdx-components.tsx

These exist in fumadocs-ui but are NOT included in `defaultMdxComponents`:

| Component | Import path | Skill usage |
|---|---|---|
| `Tabs`, `Tab` | `fumadocs-ui/components/tabs` | Multi-language/framework code variants |
| `Steps`, `Step` | `fumadocs-ui/components/steps` | Tutorial/how-to sequential instructions |
| `Accordion`, `Accordions` | `fumadocs-ui/components/accordion` | Collapsible detail sections |
| `ImageZoom` (register as `Image`) | `fumadocs-ui/components/image-zoom` | Full-width images with zoom |
| `TypeTable` | `fumadocs-ui/components/type-table` | TypeScript type/prop documentation |

**Callout note:** Already registered via `defaultMdxComponents`. The skill will use fumadocs-native `<Callout type="info">`, `<Callout type="warn">`, `<Callout type="idea">` syntax — not custom `Note`/`Warning`/`Tip` wrapper components.

**CodeGroup note:** Not a fumadocs concept. `CodeBlockTabs` is already registered via defaults and serves the same purpose. The skill will reference the native fumadocs name.

#### 6.2 Add remark plugins to source.config.ts

| Plugin | Package | Purpose |
|---|---|---|
| `remarkMdxMermaid` | `fumadocs-core/mdx-plugins` (already installed) | Mermaid diagram support in code blocks |
| `remarkAutoTypeTable` | `fumadocs-typescript` (new dep) | Auto-generated type tables from TypeScript |
| `mdxSnippet` | `remark-mdx-snippets` (new dep) | Reusable MDX fragments from `_snippets/` |

#### 6.3 Custom Mermaid component

fumadocs-ui does NOT ship a Mermaid renderer. The `remarkMdxMermaid` plugin transforms ````mermaid` code blocks into `<Mermaid>` components — but the component must be registered.

Create `src/components/mermaid.tsx` — a client component that:
- Lazy-loads the `mermaid` package on mount
- Responds to dark/light theme changes
- Caches rendered SVG to prevent re-renders

Reference implementation: `/Users/edwingomezcuellar/openbolts/packages/docs/src/components/mermaid.tsx`

#### 6.4 Extend frontmatter schema

In `source.config.ts`, extend `frontmatterSchema` with:
- `sidebarTitle` — optional string, short nav label when title is long
- `keywords` — optional string, for search/SEO

Requires adding `zod` as a dependency (used by `frontmatterSchema.extend()`).

#### 6.5 Lucide icon resolver in source.ts

Add icon resolver to `src/lib/source.ts` that maps `LuIconName` strings in `meta.json` to Lucide React components. Pattern:

```typescript
import { createElement } from 'react';
import * as luIcons from 'lucide-react';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  icon(iconName) {
    if (!iconName) return;
    if (iconName.startsWith('Lu')) {
      const icon = luIcons[iconName as keyof typeof luIcons];
      if (icon && typeof icon === 'function') return createElement(icon);
    }
    throw new Error(`Unknown icon "${iconName}"`);
  },
});
```

#### 6.6 Create `_snippets/` directory

Create the directory with a `.gitkeep` file. The `remark-mdx-snippets` plugin is configured to read from it.

#### 6.7 Add fumadocs-typescript

Add `fumadocs-typescript` (~4.0.13) as a dev dependency. This enables `remarkAutoTypeTable` and makes TypeScript type documentation available when a `content/types.ts` file is added later.

#### 6.8 New package dependencies

**Production:**
- `lucide-react` — icon resolver
- `mermaid` — Mermaid diagram rendering (runtime)
- `zod` — frontmatter schema extension

**Dev:**
- `fumadocs-typescript` ~4.0.13 — TypeScript type introspection
- `remark-mdx-snippets` ^0.3.3 — snippet inclusion plugin

### Out of Scope (Future Work)

| Item | Maturity | Trigger to revisit |
|---|---|---|
| **Product-specific components** (ComparisonTable, OptionCard, SkillRule, NumberedStepsTOC, APIPage) | Noted | When open-knowledge needs competitor comparisons or API docs |
| **BigVideo component** | Identified | When content includes MP4 video embeds |
| **Search (Orama/Inkeep)** | Identified | When content exceeds ~20 pages |
| **OG image generation** | Identified | When docs are public-facing with social sharing needs |
| **LLM export endpoints** (llms.txt, llms-full.txt) | Identified | When AI agents need to consume docs as context |
| **Sitemap generation** | Identified | When docs are indexed by search engines |
| **PostHog analytics** | Noted | When usage tracking is needed |
| **Brand icon resolver** | Noted | When sidebar needs custom brand SVGs |
| **Tabler icon resolver** | Noted | When Lucide doesn't have needed icons |
| **@inkeep/docskit component overrides** | Noted | Product-specific, not generalizable |
| **Custom CSS theming** | Noted | When brand customization is needed beyond fumadocs neutral |

## 7. Implementation Plan

### Phase 1: Dependencies (package.json)

Add to `dependencies`:
```json
"lucide-react": "^0.503.0",
"mermaid": "^11.12.3",
"zod": "^4.3.6"
```

Add to `devDependencies`:
```json
"fumadocs-typescript": "~4.0.13",
"remark-mdx-snippets": "^0.3.3"
```

### Phase 2: source.config.ts

```typescript
import path from 'node:path';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable } from 'fumadocs-typescript';
import { mdxSnippet } from 'remark-mdx-snippets';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebarTitle: z.string().optional(),
      keywords: z.string().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkAutoTypeTable,
      remarkMdxMermaid,
      [mdxSnippet, { snippetsDir: path.resolve(process.cwd(), '_snippets') }],
    ],
    rehypeCodeOptions: {
      inline: 'tailing-curly-colon',
      themes: {
        dark: 'houston',
        light: 'slack-ochin',
      },
    },
  },
});
```

### Phase 3: Mermaid component

Create `src/components/mermaid.tsx` — client component adapted from openbolts reference. Theme-aware, lazy-loading, SVG-caching.

### Phase 4: mdx-components.tsx

```typescript
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Image: ImageZoom,
    Mermaid,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
  };
}
```

### Phase 5: source.ts icon resolver

Update `src/lib/source.ts` to resolve Lucide icon names from meta.json.

### Phase 6: Infrastructure files

- Create `_snippets/.gitkeep`
- Run `bun install` to install new dependencies
- Run `fumadocs-mdx` (postinstall) to regenerate `.source/`

## 8. Acceptance Criteria

1. `bun run build` succeeds with no component-not-found errors
2. An MDX page using every registered component renders correctly:
   - `<Tabs>` / `<Tab>` with multiple tabs
   - `<Steps>` / `<Step>` with numbered steps
   - `<Accordion>` / `<Accordions>` with collapsible sections
   - `<Callout type="info">`, `<Callout type="warn">`, `<Callout type="idea">`
   - `<Image>` with zoom on click
   - `<TypeTable>` with type definitions
   - ` ```mermaid` code block renders as a diagram
3. Frontmatter with `sidebarTitle` and `keywords` fields compiles without error
4. `meta.json` with `"icon": "LuZap"` renders the icon in the sidebar
5. `_snippets/` directory exists and `remark-mdx-snippets` is configured
6. No product-specific agents components are included

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mermaid client component has runtime issues in dark mode | Low | Medium | Copy proven implementation from openbolts, test both themes |
| `remarkAutoTypeTable` needs workspace package types to be useful | Medium | Low | Plugin is inert without a `content/types.ts` file — no harm, ready when needed |
| `lucide-react` adds significant bundle size | Low | Low | Tree-shaking ensures only used icons are bundled; icon resolver only imports what meta.json references |

## 10. Decision Log

| # | Decision | Type | Reversibility | Date |
|---|---|---|---|---|
| D1 | Use fumadocs-ui native component names (Callout with type prop, CodeBlockTabs) — no aliases or wrappers | Cross-cutting | Reversible | 2026-04-07 |
| D2 | Use native CodeBlockTabs (already in defaults) instead of aliasing as CodeGroup | Technical | Reversible | 2026-04-07 |
| D3 | Skip BigVideo — defer until content needs MP4 embeds | Product | Reversible | 2026-04-07 |
| D4 | Include fumadocs-typescript now for readiness | Technical | Reversible | 2026-04-07 |
| D5 | Lucide icons only — no Tabler, no brand icons | Technical | Reversible | 2026-04-07 |

## 11. Open Questions

*None — all blocking items resolved.*

## 12. Assumptions

| # | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | `remarkMdxMermaid` from fumadocs-core transforms code blocks into `<Mermaid>` components that must be registered | HIGH | Verified from fumadocs-core source |
| A2 | `fumadocs-typescript` + `remarkAutoTypeTable` is inert when no `content/types.ts` exists | HIGH | Verified from openbolts — plugin skips when no types exported |
| A3 | `remark-mdx-snippets` reads from the configured snippetsDir and is a no-op when directory is empty | HIGH | Standard plugin behavior |
| A4 | Lucide tree-shakes correctly with the namespace import pattern | HIGH | Same pattern used in agents production |
