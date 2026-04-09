# Single canonical representation instead of two
• Given the current repo, the cleanest design is:

  - Keep Y.XmlFragment('default') plus metadata as the only shared collaborative state.
  - Remove the live shared markdown replica in src/editor/SourceEditor.tsx and the bidirectional browser sync loop in src/editor/observers.ts.
  - Move all disk sync responsibility into the server bridge in src/server/hocuspocus.ts, since that is already where disk import starts today.

  That gives you a simple, acyclic model:

  - disk file -> server import -> canonical tree
  - canonical tree -> server autosave -> disk file

  No browser tab writes markdown back into shared state behind another tab’s back.

  State Machine
  I’d make the server track, per document:

  - docRev: monotonic revision of the canonical tree
  - savedDocRev: last revision successfully written to disk
  - diskRawHash: hash of exact current file bytes
  - lastWrittenRawHash: hash last written by the server
  - diskSemanticHash: hash of normalized parsed content, only for supported files
  - mode: editable, editable-with-opaque, or source-only
  - conflict: none or active

  Rules:

  1. Tree changes increment docRev.
  2. Autosave runs only on the server, from tree to disk.
  3. File watcher runs only on the server, from disk to tree.
  4. If watcher sees a change and docRev === savedDocRev, import it automatically.
  5. If watcher sees a change and docRev !== savedDocRev:
      - if semantic hashes are equal, update the disk baseline only
      - otherwise enter explicit conflict state
  6. No silent three-way merge by default.

  That is easy to reason about because the only conflict boundary is disk vs canonical tree, and only one process owns that decision.

  Resolving The Fragility Drivers
  non-idempotent markdown serialization

  - Stop using serialized markdown as the browser sync contract.
  - Define a canonical serializer and accept that saves normalize formatting.
  - Prove idempotence with fixture tests: serialize(parse(serialize(parse(x)))) === serialize(parse(x)).
  - Equality for conflict handling should use a normalized semantic hash of the canonical tree, not raw markdown text.

  incomplete MDX round-tripping

  - Do not claim full MDX support unless you actually have it.
  - Right now src/editor/extensions/frontmatter.ts is already compensating for parser gaps, and src/editor/extensions/jsx-component.ts is not true MDX JSX support; it is a custom fenced-block encoding.
  - The easiest-to-prove approach is capability gating:
      - editable: supported markdown subset
      - editable-with-opaque: supported markdown plus explicitly preserved raw blocks
      - source-only: arbitrary MDX or unsupported syntax
  - Unsupported files never enter the WYSIWYG autosave path.

  formatting churn that makes semantically-equal docs look different

  - Track both rawHash and semanticHash.
  - Use rawHash to detect file changes and ignore self-writes.
  - Use semanticHash to suppress false conflicts from formatting-only edits.
  - Accept canonical formatting on save. If preserving user formatting is a goal, that is a separate, more complex problem.

  trying to auto-merge unsupported syntax

  - Don’t.
  - If a file contains syntax the tree model cannot represent losslessly, mark it source-only and disable WYSIWYG editing/autosave for that file.
  - If you later want richer MDX support, add a real mdast/mdxast boundary with opaque nodes that preserve exact raw source. Do that deliberately, not implicitly through the current markdown bridge.

  Practical Recommendation
  Phase 1, strongest and easiest to prove:

  - Delete the shared Y.Text('source') architecture.
  - Make source mode a local draft exported from the tree and applied explicitly back to the tree.
  - Put autosave + file watcher + conflict detection entirely on the server.
  - Introduce editable vs source-only file modes.
  - Treat canonical formatting as acceptable on save.

  That gives you strong guarantees quickly. Full-fidelity MDX can come later as a separate project.

  If you want, I can turn this into a concrete implementation plan against src/server/hocuspocus.ts, src/editor/SourceEditor.tsx, and src/App.tsx.

# Serializer non-idempotence
› and if it turns out that they are non-idempotent, what are our solutions? semantic hashing? normalization?


• If they turn out to be non-idempotent, semantic hashing is not the fix. It only helps you detect “same meaning despite different bytes.” It does not stop churn.

  The actual fixes are, in order:

  1. Define a canonical serializer
     Make one output format the law for editable files and fix the serializer until repeated parse/serialize converges.
     This is the best outcome.
  2. Narrow the editable subset
     If certain Markdown/MDX constructs do not round-trip cleanly, mark those files or regions source-only instead of pretending they are safe for structured editing.
  3. Preserve unsupported syntax as opaque raw nodes
     If the parser can recognize a construct but not model it richly, store its exact source text and emit it back verbatim.
     This is often the right answer for MDX-like islands.
  4. Separate semantic editing from formatting preservation
     Let WYSIWYG own document structure, but do not promise preservation of original whitespace/layout for editable files.
     That is just “accept normalization.”
  5. Move to a better parser/serializer boundary
     If TipTap Markdown support is too lossy, introduce a more source-faithful AST layer for file I/O.
     For MDX, that usually means mdast/mdxast-style tooling rather than relying purely on TipTap markdown conversion.

  What semantic hashing buys you in that world:

  - suppress false conflicts
  - avoid treating formatting churn as semantic divergence

  What it does not buy you:

  - stable file output
  - convergence
  - protection from repeated rewrite churn

  So if tests fail, the decision tree is:

  - If the output converges after one normalization step:
    Accept canonical normalization.
  - If only a few constructs fail:
    Make those constructs or files source-only, or preserve them as opaque raw blocks.
  - If common supported Markdown keeps changing on every cycle:
    Fix or replace the serializer before trusting autosave.

  The most pragmatic sequence is:

  1. Run idempotence fixtures on real sample docs.
  2. Classify failures:
      - formatting-only
      - unsupported syntax
      - semantic loss
  3. For formatting-only:
     accept canonical normalization or improve serializer.
  4. For unsupported syntax:
     gate to source-only or preserve raw.
  5. For semantic loss:
     stop using that path for those docs until the representation improves.

  So: normalization and subset control are the real solutions. Semantic hashing is only a guardrail around conflict detection.

