# Spec Changelog

Append-only history of spec process events. Session-scoped; preserves audit trail across iterative runs.

---

## 2026-04-16 — Spec kickoff

- Scaffolded spec directory, SPEC.md, evidence/, meta/.
- Baseline commit stamped: `0e2ed52`.
- Research substrate: `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` Parts 1 + 2 + 3 plus 8 evidence files.
- Intake complete: SCR problem statement + 5-probe stress test pass. Demand real, status quo non-viable for agent-native wiki, narrowest wedge = WYSIWYG rich-paste, future-fit MORE essential (agent workflows move content between tools).
- 1P investigation:
  - Custom node renderHTML confirmed (wikiLink → `span[data-wiki-link]`, jsxComponent → `div[data-jsx-component]`, jsxInline → `span[data-jsx-inline]`, rawMdxFallback → `div[data-raw-mdx-fallback]`). All use private `data-*` attrs keyed to their `parseHTML` rules for self-round-trip.
  - Current PM→mdast handlers emit custom nodes as `html` mdast passthrough with raw source. Works for markdown round-trip, but means `remark-rehype` would emit `[[Page]]` / `<Component>` as literal text in text/html output — a problem for rich-paste destinations.
  - Unified deps already installed: `unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-frontmatter`, `mdast-util-*`, `@handlewithcare/remark-prosemirror`. Need to add: `rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify`.
  - Paste fidelity test infrastructure already exists: `packages/app/tests/stress/paste-fidelity.e2e.ts` + `test:e2e` script.
  - `y-codemirror.next@0.3.5` does not override CM6 copy/paste — no conflict with our planned domEventHandlers.
- New decision surfaced by 1P investigation: custom-node HTML emission strategy (not covered in research report). Adding to backlog.
