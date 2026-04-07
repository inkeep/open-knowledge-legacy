# Changelog

## 2026-04-07 — Source-code-level verification of implementation notes

Verified 6 load-bearing claims from Section 5b against OSS repo source code at ~/.claude/oss-repos/.

**CORRECTED (2 claims were wrong):**
- y-prosemirror binding is NOT immutable — sync plugin supports runtime Y.Type rebinding via transaction metadata (sync-plugin.js lines 264-282). Updated V4b implementation note from "must remount" to "try runtime rebinding first, remount as fallback."
- Tight/loose list fix recipe was wrong for @tiptap/markdown — the community tiptap-markdown package uses markdown-it (not marked) and DOM inspection. Fix for @tiptap/markdown (marked-based) needs a different untested approach via marked.use() walkTokens. Flagged as untested in V1b.

**CONFIRMED (4 claims verified):**
- yDocToProsemirrorJSON works server-side, no DOM, no schema required (y-prosemirror source)
- @tiptap/html has server-side generateHTML/generateJSON via happy-dom (tiptap/packages/html/src/server/)
- marked treats `---` as thematic break, no frontmatter handling in @tiptap/markdown (MarkdownManager.ts directly calls lex())
- marked Tokens.List/ListItem DO have `loose: boolean` property (confirmed from Tokens.ts)

**UNVERIFIABLE LOCALLY (accepted with caveat):**
- @parcel/watcher event shape ({ path, type } only, no process info) — package not in oss-repos, accepted based on known FSEvents/inotify API limitations

## 2026-04-07 — Cross-report implementation notes added

Scanned 8 existing reports + 5 session evidence directories for spike-relevant details not already in the spec. Added Section 5b "Implementation Notes from Research" with per-validation gotchas, patterns, and warnings. Key additions:
- y-prosemirror binding immutability (must remount editor for V4 toggle)
- Tight/loose list fix specifics (marked token `loose` property)
- Normalize-on-load pattern for convergence
- Frontmatter regex strip pattern
- Server-side headless TipTap for V5 serialization
- Binary CRDT persistence separate from markdown serialization
- Git plumbing bypasses .git/index (safe for concurrent ops)
- @parcel/watcher event batching on macOS (hash-based, not timestamp)
- Isolated v7-test/ directory to avoid peer dep conflicts
- Void node children trade-off (LWW by design per TQ3)

Also updated evidence files:
- `evidence/hocuspocus-direct-connection.md` — Fixed Vite WebSocket pattern, downgraded #832
- `reports/source-toggle-architecture/` — Option A updated to disk-based toggle
- `reports/peritext-on-yjs-feasibility/` — Added specific npm versions and ecosystem caveat

## 2026-04-07 — Initial spec + audit corrections

**Created:** Full SPEC.md with 7 validations, decision log, assumptions, risks, open questions.

**Research conducted:**
- Source toggle architecture report (`reports/source-toggle-architecture/`)
- Peritext-on-Yjs feasibility report (`reports/peritext-on-yjs-feasibility/`)
- Markdown round-trip fidelity report (`reports/markdown-roundtrip-fidelity-tiptap/`)
- CM6-only path extension (`reports/mdx-text-editor-preview-approach/` Path C)
- updateYFragment merge + latency extension (`reports/crdt-mcp-filesystem-bridge/` Path C)

**Audit corrections applied (17 findings assessed, all resolved):**
- H1 (audit): Hocuspocus #832 downgraded from "known issue" to "historical note" — fixed in v2.13.2, included in pinned v3.4.x
- H2 (audit) + H2 (challenge): Vite WebSocket pattern rewritten — standalone `ws.WebSocketServer({ noServer: true })` instead of non-existent `server.ws.handleUpgrade()`. Added `ws` to dependencies.
- H3 (audit) + H1 (challenge): V7 time-boxed to 2 hours. Yjs v14 confirmed available as pre-release (14.0.0-16 beta). A1 confidence downgraded to LOW. Implementation order changed: V2 first, V7 parallel with V1a/V3/V6 (not gating them).
- H3 (challenge): V5 server-side serialization gap addressed — added sub-validation step for Y.Doc → markdown on server side.
- M1 (audit): Split yjs version requirements — v13 for V1-V6, v14 beta for V7 in isolated subdirectory.
- M2 (audit): skipStoreHooks flagged as "verify availability" — content-hash is primary approach.
- M3 (audit): "lossless" changed to "zero semantic loss" throughout.
- M4 (audit): V3 code sample explicitly marked as pseudocode with prerequisite step.
- M4 (challenge): V4b concurrent tests reframed as characterization (document what happens) not pass/fail with predictions.
- M5 (challenge): V1 split into V1a (raw measurement) and V1b (fix attempt).
- M6 (challenge): D3 rationale rewritten — toggle is synchronous write/read, not file watcher.
- L1-L3 (audit): Minor coherence fixes (y-tiptap note, afterStoreDocument fallback, D3 description).
- L7 (challenge): Task list added to test fixture.
