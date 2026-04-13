# Evidence: Yjs/Hocuspocus ecosystem prior art

**Dimension:** Does any Yjs/Hocuspocus persistence extension handle symlinks?
**Date:** 2026-04-12
**Sources:** tiptap.dev/hocuspocus, ueberdosis/hocuspocus, Yjs community discuss

---

## Findings

### Finding: No Hocuspocus persistence extension handles symlinks
**Confidence:** CONFIRMED (via negative search)
**Evidence:**
- Official Hocuspocus persistence options: SQLite (`@hocuspocus/extension-sqlite`), Redis, Database (generic), S3 (`@hocuspocus/extension-database`, community). None is filesystem-markdown-oriented.
- Official docs (tiptap.dev/docs/hocuspocus/guides/persistence) describe persistence as a hook interface (onStoreDocument, onLoadDocument). No mention of filesystem-specific concerns like symlinks, atomic writes, or file watchers.
- Searched ueberdosis/hocuspocus issues for "symlink" — no results.
- Yjs discuss forum: no threads on filesystem markdown persistence + symlinks.

**Implication:** The "CRDT ↔ filesystem markdown with symlink awareness" space is essentially novel. There are filesystem-markdown CRDT systems (Logseq, Obsidian Sync) but their persistence is proprietary. Tools like Yjs-backed TipTap with a Yjs-to-markdown bridge writing to disk (what we do) don't have a reference implementation of symlink handling to copy.

**Consequence for this spec:** We are building this pattern. We should treat it as a first-in-class design and document it well. The closest comparables are `write-file-atomic` (atomic writes with symlink preservation) and language servers (canonicalize for identity) — combining those two patterns gives us our solution.

---

## Gaps / follow-ups

- Logseq is open-source and does filesystem-backed CRDT-like sync. A deeper dive into how Logseq handles symlinked markdown files could yield concrete patterns. (Out of scope for this pass.)
