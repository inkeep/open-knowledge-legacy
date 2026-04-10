# Evidence: Real-Time Capabilities and CRDT Compatibility (D5)

**Dimension:** D5 — Real-time capabilities and CRDT compatibility
**Date:** 2026-04-02
**Sources:** Fumadocs OSS repo, fumadocs.dev docs, web search on TipTap/Hocuspocus/CRDT

---

## Key files referenced

- `packages/core/src/source/source.ts` — Source/VirtualFile interface
- `packages/core/src/source/storage/file-system.ts` — In-memory FileSystem
- `packages/mdx-remote/src/compile.ts` — Runtime MDX compilation

---

## Findings

### Finding: Fumadocs is a static/SSG/SSR framework with no real-time primitives
**Confidence:** CONFIRMED
**Evidence:** Full source code scan of packages/core, packages/mdx, packages/content

Fumadocs has zero real-time collaboration primitives:
- No WebSocket support
- No CRDT integration
- No live editing APIs
- No presence awareness
- No conflict resolution
- No operational transforms

The framework is designed for build-time content processing (fumadocs-mdx) or request-time compilation (mdx-remote). Content changes require a page reload or dev server hot reload.

### Finding: The architecture does NOT block real-time integration
**Confidence:** INFERRED
**Evidence:** Source/VirtualFile interface, FileSystem class, mdx-remote

Key architectural properties that enable real-time integration:

1. **Source interface is just data** — `{ files: VirtualFile[] }` can be populated from any source, including a Y.js document or Hocuspocus connection
2. **In-memory FileSystem** — already works without disk I/O, so CRDT state could populate it
3. **mdx-remote runtime compilation** — can compile MDX strings from any source at request time
4. **No framework coupling** — the content layer is separate from the rendering layer

**Implications:** You could build a bridge:
```
Hocuspocus (Y.js) -> Y.Doc update -> extract markdown -> populate VirtualFile[] -> rebuild Source -> re-render
```

But this is a significant engineering effort, not a configuration change.

### Finding: TipTap/ProseMirror could be embedded as an MDX component
**Confidence:** INFERRED
**Evidence:** MDX component extensibility in Fumadocs

Since Fumadocs renders MDX with React components, any React component can be embedded. TipTap has React bindings. You could theoretically:
- Create a `<WikiEditor />` component
- Embed it in a Fumadocs page
- Connect it to Hocuspocus for real-time sync
- Save changes back to the filesystem/git

However, this creates a "editor within docs" pattern, not "docs as editor."

### Finding: Hocuspocus cannot integrate with Fumadocs' dev server
**Confidence:** INFERRED
**Evidence:** Architecture analysis

Fumadocs' dev server is the host framework's dev server (Next.js dev, Vite dev, etc.). Hocuspocus runs as a separate WebSocket server. They cannot share a port or process without custom middleware. The integration would require:
1. Running Hocuspocus as a separate server
2. Client-side TipTap connecting to Hocuspocus
3. Hocuspocus writing changes to filesystem
4. Fumadocs dev server picking up changes via file watching

This is a multi-server architecture, not a single integrated experience.

### Finding: Adding real-time collaboration would require a custom layer above Fumadocs
**Confidence:** INFERRED
**Evidence:** Architecture analysis of all components

The effort required:
1. **Custom editor component** — TipTap/ProseMirror with MDX awareness (significant: MDX is not a standard ProseMirror schema)
2. **CRDT backend** — Hocuspocus or custom Y.js server
3. **MDX round-trip** — CRDT state <-> MDX serialization (the hardest problem: MDX JSX in ProseMirror is non-trivial)
4. **Source bridge** — Y.Doc changes -> VirtualFile[] updates
5. **Incremental rebuild** — re-compile only changed pages, not the entire site
6. **Conflict handling** — when two editors modify the same page

The MDX round-trip problem (dimension: maintaining JSX components through CRDT edits) is the primary technical risk. Plain markdown CRDTs are well-solved; MDX CRDTs are not.

---

## Gaps / follow-ups

- MDX-aware CRDT: has anyone built this? (BlockNote, Plate, etc.)
- Could you limit real-time editing to markdown-only and handle MDX components separately?
- What does Fuma Content's watch mode look like for dev-time content updates?
