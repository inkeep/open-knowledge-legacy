# /write-docs Skill Component Requirements

Extracted from /Users/edwingomezcuellar/.claude/skills/write-docs/SKILL.md on 2026-04-07.

## Components the skill tells authors to use

### Layout & Structure
- `<Tabs>` / `<Tab>` — multi-language/framework code variants
- `<Steps>` / `<Step>` — sequential instructions (tutorial pattern)
- `<Cards>` / `<Card>` — navigation cards with icons and links
- `<Accordions>` / `<Accordion>` — collapsible detail sections

### Callouts
- `<Tip>` — helpful best practices
- `<Note>` — important information
- `<Warning>` — critical warnings

### Content
- `<Image>` — full-width images with rounded corners and zoom
- `<Video>` — YouTube/video embeds
- `<BigVideo>` — large MP4 player for /public/videos/ assets
- `<CodeGroup>` — tabbed code variants (with title on fences)
- `<Snippet>` — reusable content from _snippets/

### Reference & Specialized
- `<AutoTypeTable>` — TypeScript reference tables
- `<SkillRule>` — extractable procedural sections
- `<ComparisonTable>` — competitor comparison (product-specific)
- `<OptionCard>` / `<OptionCards>` — custom card layout
- `<APIPage>` — OpenAPI-driven (product-specific)
- `<NumberedStepsTOC>` — numbered steps in TOC

## Frontmatter fields
- `title` (required)
- `sidebarTitle` (optional string)
- `description` (optional string)
- `icon` (optional, LuIconName or brand/IconName)
- `keywords` (optional string)

## Content patterns
- meta.json with icon field for sidebar navigation
- _snippets/ directory for reusable MDX fragments
- Code fences with title attribute for filenames

## Classification for open-knowledge

### Must-have (skill will produce broken output without these)
- Tabs/Tab, Steps/Step, Accordion/Accordions
- Note, Warning, Tip (callout aliases)
- Image (with zoom)
- CodeGroup (or alias)
- Snippet support (remark-mdx-snippets plugin)

### Should-have (skill references, degrades gracefully)
- sidebarTitle frontmatter
- keywords frontmatter
- Icon resolver for meta.json
- BigVideo component
- Mermaid diagram support
- TypeTable

### Product-specific (skip for open-knowledge)
- ComparisonTable, APIPage, SkillRule, OptionCard/OptionCards
- NumberedStepsTOC
- @inkeep/docskit components
