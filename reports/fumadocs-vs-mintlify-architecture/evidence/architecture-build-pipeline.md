# Evidence: Architecture & Build Pipeline

**Dimension:** Architecture & Build Pipeline
**Date:** 2026-04-02
**Sources:** fumadocs.dev, mintlify.com, github.com/fuma-nama/fumadocs, deepwiki.com/fuma-nama/fumadocs, ferndesk.com/blog/mintlify-review

---

## Key files / pages referenced

- https://fumadocs.dev/docs — Quick start, project scaffolding
- https://deepwiki.com/fuma-nama/fumadocs — Full architectural analysis
- https://github.com/fuma-nama/fumadocs — Repository structure, monorepo layout
- https://fumadocs.dev/docs/comparisons — Official comparisons
- https://ferndesk.com/blog/mintlify-review — Mintlify technical review
- https://www.mintlify.com/docs/quickstart — Mintlify quickstart

---

## Findings

### Finding: Fumadocs is a self-hosted, framework-agnostic React docs framework built as a monorepo
**Confidence:** CONFIRMED
**Evidence:** https://deepwiki.com/fuma-nama/fumadocs

Fumadocs operates as a three-layer architecture: Content (fumadocs-mdx) -> Core (fumadocs-core) -> UI (fumadocs-ui). The monorepo contains:

- `fumadocs-core`: Content loading, page trees, search, i18n, framework adapters
- `fumadocs-mdx`: MDX/Markdown processing with build tool integration
- `fumadocs-ui` & `@fumadocs/base-ui`: UI component libraries (Radix and Base variants)
- `fumadocs-openapi`: OpenAPI spec rendering
- `fumadocs-twoslash`: TypeScript hover information
- `fumadocs-typescript`: Type extraction utilities
- `@fumadocs/cli` & `create-fumadocs-app`: Tooling and scaffolding
- `@fumadocs/tailwind`: Shared styling preset

Build infrastructure uses tsdown for TypeScript bundling, @tailwindcss/cli for CSS, ESLint, Vitest, and @changesets/cli.

**Implications:** The layered architecture means you can use fumadocs-core without the UI layer, making it viable as a headless content processing engine.

### Finding: Fumadocs supports multiple React frameworks, not just Next.js
**Confidence:** CONFIRMED
**Evidence:** https://deepwiki.com/fuma-nama/fumadocs

Framework adapters exist for:
- Next.js (NextProvider)
- React Router (ReactRouterProvider)
- TanStack Start (TanstackProvider)
- Waku (WakuProvider)

Abstractions normalized: `usePathname()`, `Link` component, context access.

**Implications:** Framework-agnostic core is a strong architectural choice for a platform that may need to support multiple rendering targets.

### Finding: Mintlify is a fully managed platform with Git-backed source and cloud build/deploy
**Confidence:** CONFIRMED
**Evidence:** https://ferndesk.com/blog/mintlify-review, https://www.mintlify.com/docs/quickstart

Mintlify's architecture:
- Docs source lives in Git (GitHub/GitLab)
- GitHub App installation enables automatic deployments
- Changes pushed to default branch trigger automatic build + deploy
- Pre-rendered pages for fast load performance
- Managed hosting included (no self-hosting option)
- Web editor commits back to Git (bi-directional sync)
- Internal pipeline uses Bull on Redis for job queuing, Daytona for ephemeral sandboxes

**Implications:** Mintlify abstracts away all infrastructure. Zero DevOps. But also zero control over the build pipeline or hosting.

### Finding: Fumadocs supports static export for CDN deployment
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs

Production builds support static generation. Both Orama and FlexSearch search engines support pre-rendered indexes, enabling fully static documentation sites with no server runtime.

**Implications:** This makes Fumadocs viable for git-backed, statically-deployed knowledge bases.

---

## Gaps / follow-ups

- Mintlify's internal build technology (what framework powers their renderer) is not publicly documented
- Fumadocs' build time performance at scale (1000+ pages) is not benchmarked in available sources
