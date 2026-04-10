# Run: 2026-04-03-initial

**Status:** Active
**Intent:** Fanout — 7 dimensions of MDX round-trip fidelity through CRDT-backed editors
**Created:** 2026-04-03

## Parent Context
**Purpose:** Source-code-level investigation of whether MDX files can round-trip through a CRDT-backed visual editor without loss. Four conversion boundaries: MDX text ↔ MDAST ↔ editor blocks ↔ Yjs.
**Primary question:** What breaks at each boundary, and which editor framework handles it best?
**Non-goals:** Performance benchmarking, UX evaluation, framework recommendation, OpenDesign TSX pipeline.

## Sub-instance Tracking

| Direction | Status | Report Path |
|---|---|---|
| D1: remark-mdx internals | pending | fanout/2026-04-03-initial/remark-mdx/ |
| D2: TinaCMS/Plate MDX pipeline | pending | fanout/2026-04-03-initial/tinacms-plate-mdx/ |
| D3: slate-yjs binding | pending | fanout/2026-04-03-initial/slate-yjs/ |
| D4: y-prosemirror binding | pending | fanout/2026-04-03-initial/y-prosemirror/ |
| D5: Milkdown remark pipeline | pending | fanout/2026-04-03-initial/milkdown-remark/ |
| D6: The untested seam | pending | fanout/2026-04-03-initial/untested-seam/ |
| D7: Nested markdown-in-JSX trace | pending | fanout/2026-04-03-initial/nested-mdx-trace/ |
