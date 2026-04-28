# Static Site Publishing Spec Changelog

## 2026-04-28

### Changes

- Created initial SPEC.md for publishing an Open Knowledge knowledge base as a static site.
- Created `evidence/current-system-surfaces.md` with code-level current-state findings.
- Created `evidence/static-site-prior-art.md` with external prior-art findings.
- Established initial pending decisions around product posture, rendering engine, privacy scope, search, and URL semantics.

### Pending

- Confirm whether v1 should be local static export first or hosted/continuous publish first.
- Confirm privacy defaults and publish scope model.
- Decide whether the renderer should be native or framework-template based.

## 2026-04-28 Follow-up

### Changes

- **D1 decided:** Feature direction should support both local export and hosted/deploy workflows, with local export as the shared build primitive.
- **D3 decided:** Publish scope should default to all eligible content selected while making removal/exclusion ergonomic before saving or publishing the manifest.
- **D6 decided:** Published sites should be Open Knowledge-branded by default.
- Expanded the A vs B rendering-engine explanation in SPEC.md to clarify the product/technical significance of native renderer vs Fumadocs/Next template.

### Pending

- D2 remains pending: choose native Open Knowledge renderer vs framework-template renderer.
- Q4/Q6 remain open: renderer reuse details and CRDT flush/read behavior before publishing.

## 2026-04-28 Renderer Decision

### Changes

- **D2 decided:** Use a native Open Knowledge static renderer rather than Fumadocs/Next or another framework-template renderer.
- Updated In Scope to include the native renderer as the canonical publishing engine.
- Reframed Q4 from "native vs dedicated" to the more specific reuse boundary: which parts of `markdownToHtml` can be reused and which page-rendering responsibilities need publishing-specific code.

### Pending

- Define native renderer module boundaries and output contracts.
- Decide URL/link policy.
- Decide CRDT flush/read behavior before publishing.

## 2026-04-28 Recommendation Batch Accepted

### Changes

- **D4 decided:** Use Pagefind for static search if packaging checks pass, otherwise fall back to generated JSON search.
- **D5 decided:** Preserve document paths as public URLs.
- **D7 decided:** Store publish configuration and saved scope manifest in `.open-knowledge/publish.yml`.
- **D8 decided:** If a server is running, request/await flush before building; otherwise read disk and warn about unsaved live edits.
- **D9 decided:** GitHub Pages is the first first-class hosted publishing target.
- **D10 decided:** Hosted publish auth/security uses a conservative GitHub Pages flow with local build, explicit manifest/target confirmation, local git credentials where possible, and explicit GitHub auth only for setup.
- **D11 decided:** Broken links warn but do not block publish by default.
- **D12 decided:** Exclusion ergonomics support doc, folder, and glob removals first; tag/frontmatter rules are future work.

### Pending

- Verify Pagefind packaging/runtime fit under Bun/Node 24.
- Define native renderer module boundaries and output contracts.
- Resolve path URL edge cases such as `index.md`, anchors, wiki links, and MDX paths.
