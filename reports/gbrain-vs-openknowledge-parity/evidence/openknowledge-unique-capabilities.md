# Evidence: Open Knowledge Unique Capabilities (D8)

**Dimension:** D8 — What OK has that GBrain lacks
**Date:** 2026-04-27
**Sources:** /Users/timothycardona/inkeep/open-knowledge/CLAUDE.md (1P codebase docs); /Users/timothycardona/inkeep/open-knowledge/packages/cli/src/mcp/tools/ directory listing; /Users/timothycardona/inkeep/open-knowledge/packages/cli/src/commands/ listing

> Note: This file is 1P (Open Knowledge codebase). The user explicitly requested both directions of parity ("what it can do that we cannot do with openknowledge or vice versa").

---

## Findings

### Finding: Real-time CRDT co-editing — Y.Doc + Hocuspocus + observer bridge is OK's load-bearing differentiator
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Editor substrate" section:

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds (y-codemirror.next)
├── Y.Map('metadata')         ← frontmatter cache
├── Y.Map('agent-flash')      ← agent write-flash side-channel (D57)
└── Y.Map('agent-effects')    ← bounded activity-log ring-buffer (D49)

Server Observer A: XmlFragment → Y.Text  (OBSERVER_SYNC_ORIGIN)
Server Observer B: Y.Text → XmlFragment  (OBSERVER_SYNC_ORIGIN)
```

Five write surfaces (W1 WYSIWYG, W2 Source, W3 Agent API, W4 Disk file watcher, W5 Agent Undo) all flow through the same Y.Doc; observers maintain dual-CRDT (XmlFragment for TipTap + Y.Text for CodeMirror) consistency.

Three load-bearing invariants (Bridge, Baseline, Item-preservation) are asserted before/after every propagation. Architectural CRDT residual ~2-3% per-seed merge residual is documented and accepted (D4-LOCKED until H2 2026+).

**Implications:** This is the **single biggest qualitative gap GBrain has from OK**. GBrain explicitly defers real-time multi-user sync ("written by AI agents, not human editors"). OK is built around it. Capabilities GBrain cannot do today:
- Multiple humans simultaneously editing the same wiki page.
- Human + AI agent simultaneously editing the same wiki page (with attribution per change).
- Sub-second propagation of writes to all connected clients.
- Per-user undo on a shared document.

For parity *toward* OK from GBrain's side, GBrain would need a complete CRDT layer rebuild — non-trivial. For OK, this is **architectural moat**.

### Finding: TipTap WYSIWYG + CodeMirror source mode — full browser editor with seamless dual-mode
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Packages — `app`": "React editor frontend: TipTap WYSIWYG + CodeMirror source mode, real-time CRDT collaboration."

`packages/app/src/editor/TiptapEditor.tsx` — TipTap binding to Y.XmlFragment.
`packages/app/src/editor/source-polish/` — CodeMirror source-mode polish (per WARN rules in CLAUDE.md).

Markdown pipeline preserves fidelity through both editing modes:
- 11 invariants (I1 Identity, I2 Character preservation, I3 Normalization canonicality, I4 Idempotence, I5 Layer A===B, I6 Multi-client preservation, I7 Cross-path consistency, I8/I9/I10 Crash resistance + guard completeness, I11 R23 guard precision).
- 11 documented irreducible gaps (NG1–NG11).

**Implications:** GBrain has no native editor at all. The user edits markdown in their existing tool (VS Code, vim, Obsidian via export). **OK provides the editing surface itself, with WYSIWYG and source mode share a CRDT.** This makes OK a viable **product for non-technical users**, not just AI agents.

GBrain users who want a WYSIWYG must layer one on top (Obsidian, etc.) — at the cost of losing GBrain's index/typed-graph awareness during edit.

### Finding: Markdown fidelity contract (Storage layer never sanitizes, render-time sanitizes)
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Markdown pipeline" + "Storage-layer fidelity contract":

> "Storage never sanitizes; render-time layers do. Raw HTML, backslash escapes, literal characters pass through the storage layer unchanged. XSS mitigation is a render-layer concern (DOMPurify in docs site, not in the CRDT/persistence pipeline)."

Pipeline: `unified + remark` for parsing/serialization; `@handlewithcare/remark-prosemirror@0.1.5 (patched)` bridges mdast↔ProseMirror. Fidelity probe: 118 cases at `tech-probes/r1-preflight-gate/`.

**Implications:** OK's investment in **lossless markdown round-trip** is significant — it's why the editor can have WYSIWYG + source mode without one corrupting the other. GBrain doesn't have this challenge because GBrain doesn't have a WYSIWYG; markdown stays as markdown text in files.

For users who need **trustworthy round-trip** between WYSIWYG and source views (anyone editing technical content with code blocks, custom HTML, MDX components), this is OK-only.

### Finding: Per-session writer attribution + per-agent undo via frozen origin objects
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md STOP rules:

> "Server-side Y.Doc transactions MUST use `session.dc.document.transact(fn, session.origin)`. Never `session.dc.transact(fn)` — the per-session frozen origin is mandatory (precedent #24, D32). Omitting it routes writes to `openknowledge-service` and breaks per-session undo (UM's `trackedOrigins` Set-identity match silently skips the transaction)."

Writer-ID taxonomy (precedent #25, in `packages/server/`): five categories — `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. Each session frozen origin object enables Y.UndoManager to track writes per-writer.

Agent-undo contract (`applyAgentUndo` in `agent-sessions.ts`): per-session `undoOrigin` (distinct from session's write origin); `captureTransaction: tr => tr.origin !== session.undoOrigin` keeps undo-of-undo off the stack.

**Implications:** OK has **per-writer attribution + per-writer undo as first-class primitives**. Multiple agents can write to the same document, each with its own undo stack. Garry's GBrain has page versioning (`auto-versions` on `gbrain put`) but no per-writer attribution — a single writer principal per brain.

### Finding: Live preview attached to agent edits — preview-attach-once + agent-flash + agent-effects
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md mentions `Y.Map('agent-flash')` (write-flash side-channel, D57) and `Y.Map('agent-effects')` (bounded activity-log ring-buffer, D49). Open Knowledge MCP doc:

> "Preview — open at session start... if a write response includes `action: attach-preview-once`, open it then — one-shot... server-push pushes focus to the open tab on each subsequent write."

Spec: `specs/2026-04-24-preview-attach-once-per-session/`.

**Implications:** OK provides **visual feedback for every agent write in real time** — the human sees what the agent wrote land on the page in their browser. GBrain has no preview surface. The agent writes, the human reads files later (or queries via `gbrain query`).

This is the **co-presence** experience: the human is in the loop while the agent writes, not after.

### Finding: Electron desktop app — `@inkeep/open-knowledge-desktop`
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Packages — `desktop`": "Electron macOS app (`@inkeep/open-knowledge-desktop`, private). Windows/Linux parity deferred. Process model: one editor BrowserWindow ↔ one utilityProcess.fork ↔ one createServer ↔ one contentDir."

Deep-linking via macOS `open-url` Apple Event documented in WARN rules.

**Implications:** OK ships as a **desktop app**, not just a CLI. Garry's GBrain is CLI + browser-loaded MCP plumbing only. Different distribution model.

### Finding: OpenTelemetry instrumentation — server + browser, opt-in, dev-focused
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Observability (OpenTelemetry)":

> Default builds: SDK disabled on the server (`OTEL_SDK_DISABLED=false` enables); bundle-eliminated on the frontend (`VITE_OTEL_ENABLED=true` enables; build-time env). Zero overhead when off.
>
> Local stack: `docker/otel-dev/README.md` — Grafana + Tempo + Loki + Prometheus + OTel Collector. Browser → fetch → HTTP server span → agent-write → persistence → fs-traced writes → shadow-repo all chain into one Tempo trace.

`packages/server/src/telemetry.ts` — SDK init + `withSpan` / `getMeter` helpers. `packages/server/src/fs-traced.ts` — sanctioned path for `fs.*` spans.

**Implications:** OK has **production-grade observability** infrastructure. GBrain has logs (`jobs logs`, `agent logs`) but no documented OTel/trace integration in fetched content. For server-side correctness debugging on a CRDT system, OK's OTel is essential — and reusable for any future job/embedding/index pipeline.

### Finding: CC1 broadcast — derived-view invalidation channel for files/backlinks/graph
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Editor substrate":

> CC1 push-over-awareness — pure-signal push primitive for derived views. Contract v1: `{v:1, ch:string, seq:number}`. 100ms trailing-edge debounce per channel. Channels: `server-info`, `branch-switched`, `disk-ack`, `files`, `backlinks`, `graph`.

**Implications:** OK has a **server-push channel for "your derived view of the data is stale, refetch"**. Today it's used for files/backlinks/graph view invalidation in the editor. The same primitive could carry "embedding stale", "index rebuilt", "lint findings updated" if OK adopts those features. GBrain's job system handles work but has no client-push for view invalidation.

### Finding: File watcher with bidirectional disk↔CRDT sync, atomic writes, symlink-aware
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "Symlinks": "Symlinks inside content directories are supported. Realpath-based identity (file watcher indexes by canonical path; two paths resolving to the same inode share a Y.Doc). Atomic writes resolve `realpath(requestedPath)` then place the tmp file next to the canonical target."

`packages/server/src/fs-traced.ts` wrappers ensure every disk write traces. `writeTracker` prevents persistence↔file-watcher feedback loops; `skipStoreHooks` prevents persistence from re-saving a file we just loaded.

**Implications:** OK supports **edit-from-the-outside** (vim, VS Code, scripts) plus edit-from-the-inside (TipTap, MCP). The file watcher round-trips changes back to the CRDT. GBrain has `gbrain sync --repo` (one-shot pull from git) but no continuous watcher; external edits are processed at sync-time, not in real time.

### Finding: Bridge invariants + 17 STOP rules + ~50 cited precedent sites
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md "STOP rules" section (17 STOP rules) + 14 WARN rules + reference to `PRECEDENTS.md` (27 numbered architectural precedents cited at ~50 code sites).

**Implications:** OK has accumulated **substantial codified architectural discipline** around its CRDT correctness, observer behavior, attribution, and persistence. This is institutional knowledge that survives team turnover and agent context resets. GBrain's architecture is younger and less codified externally — its `docs/ethos/` covers principles but not equivalent invariant enforcement.

This is **institutional moat**, not feature parity, but it's relevant to the question "what does OK have that GBrain doesn't": **a multi-month track record of codified correctness rules in a domain (real-time co-editing on markdown + CRDT) that GBrain explicitly avoided.**

### Finding: OK MCP edit_document — surgical, CRDT-aware, attribution-bearing
**Confidence:** CONFIRMED
**Evidence:** Directory listing: `packages/cli/src/mcp/tools/edit_document.ts` (with `.test.ts` companion). Per CLAUDE.md, agent writes go through `applyAgentMarkdownWrite` / `applyAgentUndo` in `packages/server/src/agent-sessions.ts` (XmlFragment-authoritative pattern, precedent #10).

**Implications:** OK's `edit_document` MCP tool performs **surgical edits with full attribution and undo**, while preserving WYSIWYG/source-mode CRDT consistency. GBrain's `gbrain put <slug>` overwrites (with auto-versioning) — simpler model, but no surgical-edit primitive at the MCP layer.

For agents making targeted changes (replace one paragraph, rename one term), surgical edit + attribution is qualitatively better. For agents replacing whole pages, GBrain's simpler model is comparable.

---

## Negative searches

- Searched OK MCP tool list for "embed", "vector", "graph_query" → NOT FOUND. Confirms parity gaps in retrieval (D2/D3).
- Searched OK CLI for "lint", "doctor", "dream", "agent run" → NOT FOUND. Confirms gaps in maintenance + durability (D6/D9).
- Searched OK for any "skill resolver" / RESOLVER.md concept → NOT FOUND. Confirms D4 gap.

---

## Gaps / follow-ups

- This evidence file deliberately scoped to capabilities documented in CLAUDE.md. Other OK packages (e.g., docs site at `docs/`, content/ subsystem) likely have additional capabilities not covered here.
- The `consolidate` MCP tool's exact contract not deeply traced — overlaps loosely with GBrain's "synthesis" pattern but is distinct.
