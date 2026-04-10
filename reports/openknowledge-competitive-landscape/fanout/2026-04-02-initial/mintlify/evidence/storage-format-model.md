---
title: "Mintlify Storage & Format Model"
dimension: "Storage & Format Model"
date_collected: "2026-04-02"
sources:
  - url: "https://www.mintlify.com/docs/quickstart"
    title: "Quickstart - Mintlify"
  - url: "https://www.mintlify.com/blog/refactoring-mint-json-into-docs-json"
    title: "Refactoring mint.json into docs.json"
  - url: "https://www.mintlify.com/docs/organize/settings"
    title: "Global settings - Mintlify"
  - url: "https://www.infrasity.com/blog/mintlify-vs-gitbook"
    title: "Mintlify vs. GitBook: Which Documentation Architecture is Better?"
  - url: "https://github.com/mintlify/starter"
    title: "mintlify/starter - GitHub"
  - url: "https://www.mintlify.com/blog/auto-generate-docs-from-repos"
    title: "Auto-generating documentation sites from GitHub repos"
---

# Storage & Format Model Evidence

## Content Format

- **Primary format**: MDX (Markdown + JSX)
- Every page on the site corresponds to a file in the repository
- Files use `.mdx` extension
- Frontmatter with metadata (title, description, noindex flags, etc.)
- React components embeddable inline via JSX syntax
- OpenAPI/AsyncAPI spec files (JSON/YAML) for API reference auto-generation

## Repository Structure

Typical structure:
```
docs-repo/
  docs.json          # Central configuration (formerly mint.json)
  introduction.mdx   # Pages as MDX files
  quickstart.mdx
  api-reference/
    endpoint1.mdx
  openapi.json        # Optional OpenAPI spec
  AGENTS.md           # Optional agent customization
  skill.md            # Optional custom skill override
```

## Configuration (docs.json)

- Central JSON config controlling: site name, branding, navigation structure, API settings, integrations
- Schema-validated with `$schema` reference for IDE autocomplete
- Supports `$ref` for modularization into smaller files resolved at build time
- Migrated from `mint.json` to `docs.json` in 2025 (CLI migration tool provided)
- Four required fields minimum; all others optional

## Git Integration & Build Pipeline

1. **Connect**: Onboarding at mintlify.com/start connects GitHub account, creates/connects a docs repo, installs Mintlify GitHub App
2. **Edit**: Changes made via local editor + CLI or web editor
3. **Sync**: Web editor syncs to remote git repo; local changes pushed via git
4. **Deploy**: GitHub App detects push, triggers auto-build and deploy
5. **Serve**: Site deployed to `<project>.mintlify.app` or custom domain

The build pipeline is fully managed -- users do not run their own build. Mintlify handles:
- MDX compilation
- OpenAPI spec parsing and playground generation
- llms.txt / llms-full.txt / skill.md generation
- MCP server generation
- Search index generation (via Trieve)

## Portability Assessment

**High portability of content**: MDX files are standard Markdown with JSX extensions. The markdown content is highly portable. However:

**Lock-in vectors**:
- Mintlify-specific component library (e.g., `<Card>`, `<Tabs>`, `<Accordion>`) requires re-mapping to target platform components
- `docs.json` configuration is proprietary schema
- OpenAPI playground is Mintlify-rendered, not a portable artifact
- Search index, AI assistant, and MCP server are Mintlify-hosted services
- No self-hosted option -- content must flow through Mintlify's build pipeline
- The web editor state lives in Mintlify's SaaS layer

**Portable without friction**: Raw markdown content, frontmatter metadata, OpenAPI specs, images/assets
**Portable with effort**: Component-heavy MDX pages (need component mapping)
**Not portable**: AI assistant, search, MCP server, analytics, web editor collaboration state

## Multi-repo Support

- GitHub Actions workflow (`multirepo-action` repo) for multi-repo documentation
- Agent can fetch context from multiple code repositories
- Documentation and code repos can be separate
