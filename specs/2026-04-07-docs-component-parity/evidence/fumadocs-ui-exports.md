# fumadocs-ui Available Exports (v16.1.0)

Verified from node_modules source on 2026-04-07.

## defaultMdxComponents (from fumadocs-ui/mdx)

Already registered in open-knowledge via `...defaultMdxComponents`:
- `Card`, `Cards`
- `Callout`, `CalloutContainer`, `CalloutTitle`, `CalloutDescription`
- `CodeBlockTab`, `CodeBlockTabs`, `CodeBlockTabsList`, `CodeBlockTabsTrigger`
- `pre`
- `a`, `img` (basic, no zoom), `h1`-`h6`, `table`

## Components available but NOT registered

### fumadocs-ui/components/tabs
- `Tabs`, `Tab`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Tabs` supports `items` prop (string[]), `defaultIndex`, `label`
- `Tab` accepts optional `value` prop

### fumadocs-ui/components/steps
- `Steps`, `Step`
- Both accept `children` (ReactNode)

### fumadocs-ui/components/accordion
- `Accordions` (container), `Accordion` (item)
- `Accordion` requires `title` prop (string | ReactNode)
- Built on @radix-ui/react-accordion

### fumadocs-ui/components/callout
- `Callout` with `type` prop: 'info' | 'warn' | 'error' | 'success' | 'warning' | 'idea'
- Already in defaultMdxComponents but skill uses `Note`/`Warning`/`Tip` names

### fumadocs-ui/components/card
- `Card` with `icon`, `title`, `description`, `href`, `external` props
- Already in defaultMdxComponents

### fumadocs-ui/components/image-zoom
- `ImageZoom` with zoom props + standard img attributes

### fumadocs-ui/components/type-table
- `TypeTable` with `type` prop (Record<string, TypeNode>)

### fumadocs-ui/components/codeblock
- `CodeBlock`, `Pre`, `CodeBlockTabs` (and related)
- CodeBlockTabs already in defaultMdxComponents
- No "CodeGroup" — that name comes from @inkeep/docskit

## fumadocs-core/mdx-plugins

Available plugins:
- `remarkGfm`, `rehypeCode`, `remarkImage`, `remarkStructure`
- `remarkHeading`, `remarkAdmonition`, `remarkDirectiveAdmonition`
- `rehypeToc`, `remarkCodeTab`, `remarkSteps`, `remarkNpm`
- **`remarkMdxMermaid`** — Mermaid diagram support
- `remarkMdxFiles` — file tree structures
