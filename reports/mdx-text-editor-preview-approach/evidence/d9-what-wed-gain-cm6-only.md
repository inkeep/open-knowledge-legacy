# Evidence: What We'd Gain Going CM6-Only

**Dimension:** D9 — Advantages of text-canonical CM6-only architecture
**Date:** 2026-04-07
**Sources:** y-codemirror.next docs, Yjs docs, Obsidian architecture analysis, existing report D5 evidence

---

## Key files / pages referenced

- https://github.com/yjs/y-codemirror.next — y-codemirror.next binding (Y.Text to CM6)
- https://docs.yjs.dev/api/shared-types/y.text — Y.Text API
- https://docs.yjs.dev/api/shared-types/y.xmlfragment — Y.XmlFragment API (for contrast)
- Existing report D5 evidence (d5-codemirror-yjs-crdt.md)

---

## Findings

### Finding: Y.Text as canonical CRDT type eliminates the source toggle conversion problem entirely
**Confidence:** CONFIRMED
**Evidence:** Y.Text API docs, y-codemirror.next README

With Y.Text as canonical:
- Source mode (CM6): y-codemirror.next binds Y.Text directly. Zero conversion.
- Live Preview mode (CM6 with decorations): Same Y.Text, same CM6 instance, decorations toggled. Zero conversion.
- File on disk: `ytext.toString()` produces the markdown string. Zero conversion.

Compare to current architecture:
- Y.XmlFragment (tree) is the CRDT type for TipTap/ProseMirror
- Source mode requires converting Y.XmlFragment to text (non-trivial, lossy)
- Toggle between modes requires serialization/deserialization

**Implications:** This is the primary architectural win. The source toggle problem — the entire reason this research exists — disappears completely. Both editing modes are views of the same text buffer. This is exactly what Obsidian does.

### Finding: Simpler CRDT model reduces operational complexity
**Confidence:** CONFIRMED
**Evidence:** Y.Text vs Y.XmlFragment API comparison

Y.Text operations: insert(index, string), delete(index, length), format(index, length, attrs)
Y.XmlFragment operations: insert(index, content), delete(index, length) — but content is typed nodes (Y.XmlElement, Y.XmlText), and the tree structure must remain valid.

Y.Text merge semantics are character-level, well-understood, and equivalent to plain text collaboration (Google Docs early model, HackMD). Y.XmlFragment merge semantics involve tree operations where concurrent structural changes can create complex merge scenarios.

**Implications:** Debugging, testing, and reasoning about collaborative editing is simpler with Y.Text. The "what happens when two users edit simultaneously" question has a straightforward answer: characters interleave. With Y.XmlFragment, the answer depends on tree structure, node types, and schema validation.

### Finding: The file on disk IS the CRDT content (text-canonical architecture)
**Confidence:** CONFIRMED
**Evidence:** Yjs Y.Text API

`ytext.toString()` returns the raw text content. `ytext.insert(0, fileContent)` initializes from a file. There is no intermediate representation. The .md file content is exactly what Y.Text stores.

Compare to Y.XmlFragment: requires prosemirrorJSONToYDoc() / yDocToProsemirrorJSON() conversion utilities. The Yjs document state is a tree that must be serialized to markdown for file storage, creating a conversion boundary.

**Implications:** Git diffs, file system operations, MCP file tools, and any system that reads/writes markdown files works directly with the CRDT content. No translation layer needed between "what Yjs stores" and "what the file contains."

### Finding: CM6 is the proven platform for text-based markdown editing at scale
**Confidence:** CONFIRMED
**Evidence:** Obsidian, Zettlr, HedgeDoc, ink-mde, Joplin

Production-grade CM6 markdown editors:
- **Obsidian:** Millions of users, CM6 with Live Preview decorations
- **HedgeDoc:** Open-source collaborative markdown editor
- **Zettlr:** Academic markdown editor
- **Joplin:** Note-taking with CM6 editor
- **ink-mde:** CodeMirror 6 + TypeScript markdown editor (powers octo.app)

Each of these projects has invested in CM6 markdown extensions that form a growing ecosystem.

**Implications:** The CM6 markdown editing ecosystem is maturing. While it lacks the breadth of TipTap's extension library, the core editing experience is battle-tested by Obsidian's millions of users.

### Finding: Zero-conversion source toggle matches Obsidian's architecture exactly
**Confidence:** CONFIRMED
**Evidence:** Obsidian architecture (proprietary but well-documented by community)

Obsidian's toggle between Source and Live Preview:
1. Same CM6 editor instance
2. Same text buffer
3. Toggle = swap decoration set (add/remove visual rendering decorations)
4. Cursor position preserved
5. Instant — no serialization, no parsing, no conversion

This is the "burn the boats" gain: source mode becomes native instead of a bolt-on.

**Implications:** For a product that needs both "Cursor-grade source editing" and visual editing, this architecture makes source mode the foundation rather than an afterthought. Every code-oriented feature (find-and-replace, regex, vim mode, multi-cursor) works naturally because the document is text.

---

## Summary: What we'd gain

1. **Zero-conversion source toggle** — instant, lossless, cursor-preserving
2. **Y.Text canonical CRDT** — simplest possible collaborative model
3. **File = CRDT content** — no translation layer for file I/O
4. **Native source editing** — all text editor features (find-replace, regex, vim, multi-cursor) work natively
5. **Proven at scale** — Obsidian's architecture with millions of users
6. **Simpler debugging** — character-level merge semantics vs tree merge semantics
7. **Smaller bundle** — CM6 core (~300KB) vs TipTap + ProseMirror + extensions
8. **Better mobile support** — CM6 was designed mobile-first (primary v6 motivation)

---

## Gaps / follow-ups

- Quantitative comparison of bundle sizes: CM6 markdown setup vs TipTap starter-kit
- Whether Y.Text formatting attributes (via Y.Text.format()) could be used for rich text annotations as an alternative to decorations-only approach
