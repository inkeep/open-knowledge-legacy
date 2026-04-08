# OpenBolts Docs Reference Implementation

Extracted from /Users/edwingomezcuellar/openbolts/packages/docs on 2026-04-07.

## mdx-components.tsx import paths (exact)

```typescript
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Mermaid } from '@/components/mermaid';
```

## source.config.ts plugins

```typescript
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { remarkAutoTypeTable } from 'fumadocs-typescript';
import { mdxSnippet } from 'remark-mdx-snippets';
```

Plugins: remarkAutoTypeTable, remarkMdxMermaid, mdxSnippet

## Dependencies beyond open-knowledge baseline

Production:
- fumadocs-typescript: ~4.0.13
- lucide-react: ^0.503.0
- mermaid: ^11.12.3
- zod: ^4.3.6

Dev:
- remark-mdx-snippets: ^0.3.3

## What openbolts has that open-knowledge doesn't
1. Tabs/Tab, Steps/Step, Accordion/Accordions registered
2. Callout registered explicitly
3. TypeTable registered
4. Custom Mermaid component (theme-aware client component)
5. remarkMdxMermaid, remarkAutoTypeTable, mdxSnippet plugins
6. Extended frontmatter schema (sidebarTitle)
7. _snippets/ directory
8. content/types.ts for fumadocs-typescript introspection
9. lucide-react, mermaid, zod dependencies

## What openbolts DOESN'T have that /write-docs expects
1. Note/Warning/Tip aliases (has raw Callout only)
2. Image with zoom (uses default img)
3. CodeGroup (has CodeBlockTabs via defaults)
4. BigVideo
5. Snippet component explicitly registered
6. Icon resolver in source.ts
7. keywords frontmatter field
