# Live Folder-Link Usage Evidence

## Summary

Real folder-intent links already exist in repository markdown. The signal is strongest in **markdown links**, not wiki-links.

The dominant author intent is not "create a missing note" but one of:

- navigate to a conceptual unit represented by a folder (`projects/<slug>`, `specs/<slug>`, `reports/<slug>`)
- open an evidence subtree (`./evidence/`)
- jump to a source-code directory as an area, not a single file

## Strong examples

1. **Project folder as conceptual landing page**
   - Source: `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md`
   - Target: `../../projects/v0-launch`
   - Observed repo state: real folder exists; landing doc is `projects/v0-launch/PROJECT.md`
   - Likely intent: “take me to this project,” not “create a missing page named `v0-launch`”

2. **Spec folder as spec unit**
   - Source: `specs/2026-04-08-project-wiki-mcp-surface/SPEC.md`
   - Targets: `../2026-04-07-bidirectional-observer-sync/`, `../2026-04-07-agent-markdown-writes/`
   - Observed repo state: real spec folders exist and contain `SPEC.md`
   - Likely intent: “go to that spec”

3. **Report folder as report identity**
   - Source: `reports/yjs-dual-key-shimmer-analysis/REPORT.md`
   - Targets: `../source-toggle-architecture/`, `../mdx-text-editor-preview-approach/`
   - Observed repo state: real report folders exist and contain `REPORT.md`
   - Likely intent: “go to that report package”

4. **Evidence subtree browsing**
   - Source: `specs/2026-04-11-markdown-source-text-fidelity/SPEC.md`
   - Target: `./evidence/`
   - Observed repo state: real folder exists with multiple evidence docs, often without a single landing note
   - Likely intent: “take me into the evidence folder”

5. **Deeper evidence pack navigation**
   - Source: `reports/wiki-links-backlinks-architecture/REPORT.md`
   - Target: `fanout/2026-04-03-initial/link-formats-git-compat/evidence/`
   - Observed repo state: real evidence subtree
   - Likely intent: subtree browsing, not document creation

6. **Code-directory linking**
   - Source: `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md`
   - Target: `../../packages/cli/src/mcp/tools/`
   - Observed repo state: real source-code directory, no markdown landing note
   - Likely intent: open the relevant code area

## Product implications

1. The product should treat folder-like targets as **intentional navigation**, not as malformed missing-doc links.
2. The resolver should recognize **repo landing-note conventions**, not just generic `index.md`.
3. The fallback when only a folder exists should be a **folder overview / rooted navigation surface**, not a blank editor.
4. Folder-like targets in markdown links should follow the same semantics as wiki-links; users do not think of these as separate products.

## Convention implication

For this repo, the live landing-file patterns include:

- `SPEC.md`
- `REPORT.md`
- `PROJECT.md`
- `README.md`
- `INDEX.md`
- `index.md`

This suggests a product decision:

- Either the resolver remains **generic** (`index`, folder-note fallback, then overview)
- Or it becomes **repo-convention-aware** for markdown/folder navigation in this product

That is a product/architecture choice, not an implementation detail.
