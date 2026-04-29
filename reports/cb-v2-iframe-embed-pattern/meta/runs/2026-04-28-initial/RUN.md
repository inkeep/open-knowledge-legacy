# Run: 2026-04-28 — initial fanout

**Status:** Closed (evidence captured 2026-04-28)
**Owner:** orchestrator
**Mode:** Headless + fanout

## Purpose

Decide how Open Knowledge's MDX editor should support `<iframe>` embeds.
The cb-v2-md-foundation PR just landed lowercase canonical descriptors for
`img` / `video` / `audio` (HTML-tag-spelled, descriptor-registered). Iframe
must land in the canonical/compat taxonomy:

- Lowercase canonical (`img`/`video`/`audio` shape) — when the HTML primitive
  carries a complete enough attribute set that nothing OK-specific lives as a prop.
- Capitalized canonical (`Callout`/`Accordion` shape) — when HTML has no primitive
  OR the primitive is structurally a subset of what authors want.

Rule citation: `packages/core/src/registry/built-ins.ts:529-540` (JSDoc above
`builtInComponents`).

## Anchors (1P, shared by all sub-investigators)

- `packages/core/src/markdown/autolink-void-html-guard.ts:88` — `LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img', 'video', 'audio'])`
- `packages/core/src/markdown/autolink-void-html-guard.ts:282-288` — second carve-out in catch-all pass
- `packages/core/src/markdown/mdast-to-hast-handlers.ts:66` — `HTML_PRIMITIVE_TAGS = new Set(['img','video','audio'])` (clipboard side)
- `packages/core/src/markdown/mdast-to-html.ts:78,89` — current sanitizer drops iframe `src` URLs (defense-in-depth comment says we don't emit iframe today)
- `packages/core/src/registry/built-ins.ts:529-540` — canonical/compat rule comment
- `packages/core/src/registry/built-ins.ts:556-616` — five canonical descriptors registered (Callout, img, video, audio, Accordion)
- `packages/app/src/editor/components/componentMap.tsx:44-54` — descriptor-name → React-component map
- `showcase/03-video.mdx:80-92` — broken YouTube iframe example (autolink-eats-src)

## Delta rubric (this run)

Six P0 dimensions per parent's prompt:

1. MDX parse path & PUA guard interaction → `evidence/mdx-parse-path.md`
2. Security model (sandbox, allow, CSP) → `evidence/security-model.md`
3. OSS docs-editor patterns (Mintlify, Fumadocs, Docusaurus, Nextra, Starlight, BlockNote) → `evidence/oss-editors.md`
4. React intrinsic types & attribute conventions → `evidence/react-types.md`
5. Common embed use cases (top providers + URL shapes) → `evidence/embed-providers.md`
6. The autolink-eats-src bug observed in `showcase/03-video.mdx:87` → `evidence/autolink-bug.md`

## Coverage tasks

Each dimension gets a Task tracker (#94-#99 below). Mark complete when
evidence is captured + primary-source-cited.

## Conventions

- All workers return structured Markdown findings.
- Orchestrator owns evidence file authoring.
- Primary sources only — line numbers in `node_modules` where applicable;
  vendor docs URLs with named refs.
- Apply the canonical/compat rule when synthesizing.
