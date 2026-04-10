# Evidence: CMS Integrations (D7)

**Dimension:** D7 — CMS integrations that exist today
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, GitHub, fumadocs.dev, web search

---

## Key files referenced

- `packages/content-collections/src/index.ts` — Content Collections adapter
- `packages/mdx-remote/src/compile.ts` — Runtime MDX compilation for remote sources
- github.com/fuma-nama/fumadocs-sanity — Official Sanity example
- github.com/MFarabi619/fumadocs-payloadcms — Community Payload CMS example
- github.com/bapspatil/fumadocs-payload-template — Community Payload CMS template

---

## Findings

### Finding: Official CMS examples exist for Sanity and BaseHub
**Confidence:** CONFIRMED
**Evidence:** GitHub repos, fumadocs.dev/docs/integrations/content

- **Sanity**: Official example at github.com/fuma-nama/fumadocs-sanity (updated Feb 2026). Uses GROQ queries to fetch content, mdx-remote for runtime compilation.
- **BaseHub**: Official example at github.com/fuma-nama/fumadocs-basehub (updated Dec 2025). Uses BaseHub SDK.
- **Notion**: Example at github.com/fuma-nama/fumadocs-notion (updated Dec 2024).

### Finding: Payload CMS integration exists as community templates
**Confidence:** CONFIRMED
**Evidence:** Two community repos

- MFarabi619/fumadocs-payloadcms — simple deploy-ready example
- bapspatil/fumadocs-payload-template — documentation site with custom Fumadocs source adapter, LLM features, and RBAC

Payload CMS runs alongside Fumadocs in the same Next.js app, making it the most natural pairing for a single-server deployment.

### Finding: Content Collections adapter is a thin bridge
**Confidence:** CONFIRMED
**Evidence:** `packages/content-collections/src/index.ts`

```typescript
export function createMDXSource(allDocs, allMetas) {
  return {
    files: [
      ...allDocs.map(v => ({ type: 'page', data: v, path: v._meta.filePath })),
      ...allMetas.map(v => ({ type: 'meta', data: v, path: v._meta.filePath })),
    ],
  };
}
```

37 lines total. Just maps Content Collections documents to Fumadocs VirtualFiles. Content Collections itself supports multiple data sources.

### Finding: Keystatic compatibility is theoretical but architecturally sound
**Confidence:** INFERRED
**Evidence:** Architecture analysis

Keystatic writes to the filesystem (same as Fumadocs' default). A Fumadocs + Keystatic setup would:
1. Keystatic manages content in the filesystem
2. Fumadocs reads from the same filesystem
3. No adapter needed — they share the filesystem

The challenge: Keystatic has its own YAML frontmatter expectations and directory structure conventions. These would need to align with Fumadocs' meta.json + MDX conventions.

### Finding: TinaCMS compatibility is theoretical and more complex
**Confidence:** INFERRED
**Evidence:** Architecture analysis

TinaCMS uses a GraphQL layer over content. Integration would require:
1. Fetching content from Tina's GraphQL API
2. Converting to VirtualFile[] format
3. Using mdx-remote for runtime compilation

Or, in "Git mode," TinaCMS writes to the filesystem like Keystatic, and Fumadocs reads normally.

### Finding: Visual editing state for Fumadocs is "code-only plus CMS sidebar"
**Confidence:** CONFIRMED
**Evidence:** All available integrations

No integration provides Mintlify-style in-place visual editing. The pattern is:
- CMS provides a separate editing UI
- Content syncs to filesystem or API
- Fumadocs renders the content
- Preview via dev server or preview deployments

The gap between "CMS editing UI" and "what the rendered docs look like" remains. No bi-directional live preview like Mintlify.

---

## Gaps / follow-ups

- Could Payload CMS's Live Preview feature bridge the visual editing gap?
- Keystatic's new visual editing mode — compatible with MDX?
- Has anyone built a TinaCMS + Fumadocs integration?
