# Evidence: Migration Effort Estimate

**Dimension:** D9 — Migration effort estimate
**Date:** 2026-04-07
**Sources:** All evidence files, architecture analysis

---

## Findings

### Finding: Full migration from Yjs to Automerge is estimated at 8-14 weeks for feature parity
**Confidence:** INFERRED
**Evidence:** Component-by-component analysis

| Component | Effort | Notes |
|-----------|--------|-------|
| SchemaAdapter for all TipTap extensions | 2-3 weeks | Map heading, codeBlock, list, table, link, bold, italic, etc. to Automerge block/mark names. Includes jsxComponent void node. |
| TipTap extension wrapper | 1 week | Extension-collaboration-automerge + schema integration |
| Cursor/presence plugin | 1-2 weeks | ProseMirror decorations + automerge-repo Presence API |
| Undo/redo integration | 1-2 weeks | Custom undo plugin using Automerge heads tracking |
| Sync server (replace Hocuspocus) | 1-2 weeks | Authentication, document access, persistence hooks |
| Agent write path migration | 1 week | Migrate DirectConnection to Repo + handle.change() |
| Markdown serialization pipeline | 1 week | Adapt persistence pipeline (PM JSON → markdown should mostly work) |
| Data migration (existing Y.Docs → Automerge docs) | 1-2 weeks | One-time migration tooling: Y.Doc → PM JSON → Automerge doc |
| Source toggle (dual-view) | 2-3 weeks | Custom CodeMirror binding for Automerge rich text spans, or serialize-on-toggle (same approach as on Yjs) |
| Testing + edge cases | 2 weeks | Integration testing, collaboration testing, conflict resolution |

**Total: 12-20 weeks (3-5 engineer-months)**

### Finding: The source toggle problem is NOT solved by migrating to Automerge
**Confidence:** CONFIRMED
**Evidence:** dual-view-architecture.md evidence

The primary motivation for considering Automerge — "Peritext flat text natively solves the dual-view problem" — is partially incorrect. Automerge's flat text includes block marker OBJECTS in the sequence, not markdown text. CodeMirror cannot display these directly as markdown. A translation layer is still required.

The advantage over Yjs is that the translation is structurally simpler (flat sequence → markdown is easier than tree → markdown), but it's the same class of problem. The serialize-on-toggle approach (Option I from source-toggle-architecture report) works identically on Automerge.

### Finding: Incremental migration is not feasible — it's a full cutover
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis

You cannot run Yjs and Automerge side by side for the same document. The CRDT data formats are incompatible. Migration requires:
1. Freeze existing documents in Yjs
2. Convert all documents to Automerge format (Y.Doc → PM JSON → Automerge doc)
3. Switch the entire editor stack
4. Resume editing

This is a high-risk, all-or-nothing migration with no gradual rollout path.

### Finding: What you GAIN from migration
**Confidence:** INFERRED
**Evidence:** Cross-dimensional synthesis

1. **Native Peritext semantics** — Correct mark boundary expansion (no edge-case anomalies for concurrent formatting)
2. **Simpler flat-to-markdown conversion** — Automerge's span model is closer to markdown than Y.XmlFragment's tree
3. **Full operation history** — Built-in version control, branching, time travel
4. **Potentially simpler dual-view architecture** — Not solved natively, but the translation layer is thinner

### Finding: What you LOSE from migration
**Confidence:** CONFIRMED
**Evidence:** Cross-dimensional synthesis

1. **TipTap ecosystem compatibility** — All TipTap extensions assume Yjs. Every extension needs an Automerge adapter.
2. **Hocuspocus maturity** — Battle-tested sync server with auth, hooks, extensions replaced by a minimal Express app
3. **Bundle size** — 1.7MB WASM payload vs 69KB Yjs
4. **Ecosystem breadth** — Yjs has 10x more npm downloads, more integrations, larger community
5. **Beta stability risk** — automerge-prosemirror is v0.2.0 beta
6. **No table support** — Not in the basic schema, needs custom implementation
7. **No cursor plugin** — Needs custom implementation
8. **No undo integration** — Needs custom implementation

---

## Gaps / follow-ups

- Automerge 3.0's practical performance with rich text editing needs real-world benchmarking
- The beta stability of automerge-prosemirror is a significant risk for production use
