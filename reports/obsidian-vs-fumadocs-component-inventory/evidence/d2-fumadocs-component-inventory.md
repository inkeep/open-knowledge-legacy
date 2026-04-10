# Evidence: Fumadocs' Complete Component Inventory

**Dimension:** D2 — Fumadocs' complete component inventory
**Date:** 2026-04-03
**Sources:** fumadocs.dev official docs, GitHub fuma-nama/fumadocs, existing reports (fumadocs-full-pipeline, fumadocs-stack-reusability-deep-analysis)

---

## Key files / pages referenced

- https://www.fumadocs.dev/docs/ui/components — Component index
- https://www.fumadocs.dev/docs/markdown — Markdown/MDX feature support
- https://www.fumadocs.dev/docs/ui/components/tabs — Tabs component
- https://www.fumadocs.dev/docs/ui/components/steps — Steps component
- https://www.fumadocs.dev/docs/ui/components/accordion — Accordion component
- https://www.fumadocs.dev/docs/ui/components/type-table — TypeTable component
- https://www.fumadocs.dev/docs/ui/components/codeblock — CodeBlock component
- https://www.fumadocs.dev/docs/headless/mdx — MDX plugins
- fumadocs-full-pipeline report (2026-04-03) — D3: Built-in Component System
- fumadocs-stack-reusability-deep-analysis report (2026-04-02) — D1: mdx-plugins, D4: UI components

---

## Findings

### Finding: defaultMdxComponents provides 10 HTML element overrides + 8 named MDX components
**Confidence:** CONFIRMED
**Evidence:** fumadocs-full-pipeline report D3, fumadocs.dev/docs/markdown

The `defaultMdxComponents` export from `fumadocs-ui/mdx`:

**HTML element overrides (auto-applied to standard markdown):**
1. `pre` → CodeBlock with Shiki highlighting
2. `a` → Link component (with external link handling)
3. `img` → Image component
4. `h1` through `h6` → Heading variants with auto-anchors
5. `table` → Table component with styling

**Named MDX components (require explicit JSX in MDX files):**
1. `Card` — linkable card with icon, title, description
2. `Cards` — card grid container
3. `Callout` — admonition/callout block (+ CalloutContainer, CalloutTitle, CalloutDescription sub-components)
4. `CodeBlockTab` — code block tab variant (+ CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger)

### Finding: fumadocs-ui ships 15+ additional importable components beyond defaultMdxComponents
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/ui/components index, fumadocs-full-pipeline report

Additional components (importable, not in default map):
1. **Tabs, Tab** — tabbed content (Radix UI based), with persistent storage, shared values, URL hash linking
2. **Steps, Step** — numbered step guides
3. **Accordion, Accordions** — collapsible FAQ sections (Radix UI based)
4. **TypeTable** — type/API documentation tables
5. **ImageZoom** — zoomable image component
6. **Files, File** — file tree display
7. **InlineTOC** — inline table of contents
8. **Banner** — announcement/notification banner
9. **DynamicCodeblock** — runtime-configurable code blocks (client component)
10. **GitHubInfo** — GitHub repository info display
11. **GraphView** — (mentioned in component index)
12. **AutoTypeTable** — auto-generated type table

### Finding: Callout component supports 6 built-in types
**Confidence:** CONFIRMED
**Evidence:** fumadocs-full-pipeline report D3

Fumadocs Callout types:
| Type | Description |
|------|-------------|
| info | Information callout (default) |
| warn | Warning callout |
| error | Error/danger callout |
| success | Success callout |
| warning | Warning variant |
| idea | Idea/lightbulb callout |

Props: `{ type?: 'info'|'warn'|'error'|'success'|'warning'|'idea', title?: ReactNode, children }`

**Comparison note:** Obsidian has 13 types + 25 aliases vs Fumadocs' 6 types.

### Finding: Code blocks support Shiki highlighting with advanced transformers
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/markdown, fumadocs-stack-reusability report D1

Fumadocs code block features via rehypeCode (Shiki-based):
- Syntax highlighting for 100+ languages (Shiki supports all TextMate grammars)
- **Line highlighting** — `// [!code highlight]`
- **Diff styles** — `// [!code ++]` and `// [!code --]`
- **Focus annotations** — `// [!code focus]`
- **Word highlighting** — highlight specific words
- **Line numbers** — with custom start values
- **Title/filename** — `title="filename.ts"` attribute
- **Twoslash support** — TypeScript hover information
- **Tab groups** — consecutive code blocks with `tab="name"` → Tabs component
- **NPM commands** — `npm` code blocks auto-generate npm/pnpm/yarn/bun variants

### Finding: Remark/rehype plugin pipeline provides 15+ built-in plugins
**Confidence:** CONFIRMED
**Evidence:** fumadocs-stack-reusability report D1

**Default remark plugins:**
1. remarkGfm — GFM table/strikethrough/task list support
2. remarkHeading — heading ID generation, custom `[#slug]` syntax, TOC extraction
3. remarkImage — image dimension extraction + Next.js import optimization
4. remarkCodeTab — consecutive code blocks → tab groups
5. remarkNpm — npm code blocks → multi-package-manager tabs
6. remarkStructure — heading-level content extraction for search
7. remarkPostprocess — markdown capture, link extraction
8. remarkSteps — numbered heading → Steps component
9. remarkMdxMermaid — mermaid code blocks → Mermaid component
10. remarkAdmonition — `:::type` → Callout (deprecated, use JSX instead)
11. remarkFeedbackBlock — block → FeedbackBlock wrapper
12. remarkLLMs — MDX → clean markdown for LLM consumption

**Default rehype plugins:**
1. rehypeCode — Shiki syntax highlighting + transformers
2. rehypeToc — TOC generation

**Optional/user-configurable:**
- remarkTs2Js — TypeScript → JavaScript tab conversion
- Any custom remark/rehype/recma plugin

### Finding: Fumadocs markdown supports GFM, math, and extended syntax
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev/docs/markdown

Markdown features:
- **Full GFM** — tables, strikethrough, task lists, autolinks
- **Frontmatter** — YAML with Zod schema validation
- **Heading anchors** — auto-generated + custom `[#slug]` syntax
- **TOC markers** — `[!toc]` and `[toc]` to show/hide headings in TOC
- **Math** — via remark-math/rehype-katex (KaTeX, not MathJax)
- **Include** — reference external MDX files
- **MDX** — full JSX support, component imports, JS expressions

### Finding: Layout/navigation components form a separate category
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev component docs, fumadocs-full-pipeline report

Layout components (not MDX content components):
1. **DocsLayout** — full docs layout with sidebar, breadcrumbs, TOC
2. **HomeLayout** — home page layout
3. **DocsPage** — individual page wrapper
4. **Sidebar** — navigation sidebar
5. **Breadcrumb** — breadcrumb navigation
6. **TOC** — table of contents sidebar
7. **SearchDialog** — search modal (Orama, Algolia, etc.)
8. **RootProvider** — theme/root context provider
9. **Footer** — page footer
10. **Nav** — navigation bar

### Finding: Theming uses CSS variables inspired by shadcn/ui
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev theming docs, web search results

- Tailwind CSS v4 based styling
- CSS variables for color tokens (inspired by shadcn/ui approach)
- Dark mode support via class strategy
- Radix UI primitives for interactive components
- @fumadocs/base-ui provides unstyled variants
- NOT a shadcn registry itself, but uses the same design system philosophy

---

## Gaps / follow-ups

- Exact TypeScript prop interfaces for every component (would require source code reading)
- fumadocs-openapi components (API documentation specific)
- Fuma Content CMS evolution and its component additions
