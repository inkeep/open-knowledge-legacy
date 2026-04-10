---
title: "Mintlify Product Capabilities & Editing Experience"
dimension: "Product Capabilities & Editing Experience"
date_collected: "2026-04-02"
sources:
  - url: "https://www.mintlify.com/"
    title: "Mintlify - The Intelligent Knowledge Platform"
  - url: "https://www.mintlify.com/docs/quickstart"
    title: "Quickstart - Mintlify"
  - url: "https://www.mintlify.com/docs/components"
    title: "Components Overview - Mintlify"
  - url: "https://www.mintlify.com/blog/introducing-web-editor"
    title: "Introducing our revamped Web Editor"
  - url: "https://www.mintlify.com/blog/improved-web-editor"
    title: "A better way to edit and publish in Mintlify"
  - url: "https://www.mintlify.com/blog/2025-year-in-review"
    title: "2025: A Year in Review"
  - url: "https://www.mintlify.com/docs/organize/settings"
    title: "Global settings - Mintlify"
  - url: "https://ferndesk.com/blog/mintlify-review"
    title: "Mintlify Review 2026 - Ferndesk"
---

# Product Capabilities Evidence

## Authoring Model

Mintlify is a docs-as-code framework with a managed SaaS layer on top. Content is authored in MDX (Markdown + JSX) files stored in Git repositories. Two editing workflows exist:

1. **CLI/Local Development**: Install `mint` CLI (requires Node.js v20.17.0+), clone repo, edit .mdx files locally, run `mint dev` for local preview at localhost:3000, push via git for auto-deployment.

2. **Web Editor**: Browser-based visual editing experience described as "Notion-like" interface. Supports drag-and-drop navigation, real-time preview, and one-click publish. Designed for non-technical contributors (marketers, PMs, technical writers).

## Configuration

Central configuration via `docs.json` (formerly `mint.json`). Controls branding, navigation, integrations, API settings. Supports `$ref` for modularizing large configs into separate JSON files. Schema-validated with autocomplete in editors.

## Built-in Component Library (22+ components)

**Structure**: Tabs, Code Groups, Steps, Columns, Panel
**Attention**: Callouts, Banner, Badge, Update, Frames, Tooltips
**AI**: Prompt (copyable AI prompts with Cursor integration)
**Show/Hide**: Accordions, Expandables, View (conditional rendering)
**API**: Fields, Responses, Examples
**Navigation**: Cards, Tiles
**Visual**: Icons (Lucide library), Mermaid diagrams, Color swatches, Tree (file hierarchies)

Custom React components can be embedded via MDX.

## API Documentation

- OpenAPI 3.0 and 3.1 spec support
- AsyncAPI spec support
- Auto-generated interactive API playground on every docs site
- Auto-generated endpoint MDX files from OpenAPI specs via scraper
- Request/response samples and code snippets
- SDK code sample integration via Stainless and liblab

## Search

- Powered by Trieve (post-acquisition) RAG infrastructure
- 23M+ documentation queries monthly
- AI Assistant for conversational search (Claude Sonnet 4.5 with agentic retrieval)
- Multi-turn conversations with citations

## Themes and Customization

- 8 documentation themes
- Custom branding (colors, logos, fonts)
- Custom domain support on all tiers
- SEO auto-optimization (meta tags, sitemaps)

## Additional Features

- Versioning for multiple product releases/API iterations
- Changelogs
- Authentication (partial and full)
- Password protection (Pro+)
- Analytics dashboard (popular pages, drop-offs, search terms)
- Preview deployments with shareable URLs
