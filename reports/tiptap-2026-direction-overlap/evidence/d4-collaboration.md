# Evidence: TipTap Collaboration Features

**Dimension:** D4 — TipTap's collaboration features
**Date:** 2026-04-04
**Sources:** tiptap.dev/docs/collaboration, tiptap.dev/docs/hocuspocus, github.com/ueberdosis/hocuspocus

---

## Key pages referenced
- https://tiptap.dev/docs/collaboration/getting-started/overview — Collaboration overview
- https://tiptap.dev/docs/hocuspocus/getting-started/overview — Hocuspocus docs
- https://tiptap.dev/docs/collaboration/documents/rest-api — Document REST API
- https://tiptap.dev/docs/tracked-changes/api-reference/commands — Tracked Changes

---

## Findings

### Finding: Collaboration is Yjs/CRDT-based with full feature set
**Confidence:** CONFIRMED
**Evidence:** Collaboration overview docs

Feature matrix:
- **Real-time editing** — via Yjs CRDT
- **Presence/awareness** — cursors, selections per user (Team tier+)
- **Comments** — threaded discussions (built-in)
- **Version history** — snapshots, snapshot comparison
- **Tracked Changes** — suggestion mode, accept/reject (paid add-on, in development)
- **Webhooks** — real-time notifications (Team tier+)
- **Document REST API** — CRUD, content injection, programmatic updates
- **Offline editing** — syncs when reconnected

### Finding: Cloud vs self-hosted is a provider swap, not an architecture change
**Confidence:** CONFIRMED
**Evidence:** Collaboration overview

Two deployment modes:
1. **TipTap Collaboration Cloud** — managed service
2. **On-premises** — Docker images, HA clustering

Migration between them: swap HocuspocusProvider <-> TiptapCollabProvider with no API changes.

### Finding: Hocuspocus remains the foundation for self-hosted collaboration
**Confidence:** CONFIRMED
**Evidence:** github.com/ueberdosis/hocuspocus, Hocuspocus docs

- Latest: v3.4.4
- Core: Yjs CRDT WebSocket backend
- Key feature: Multiplexing (multiple docs over one WebSocket)
- Hook-based architecture (onConnect, onAuthenticate, onLoadDocument, onChange, etc.)
- Scales to "thousands of concurrent connections"
- Can be self-hosted independently of TipTap Cloud

### Finding: y-tiptap is a TipTap-specific fork of y-prosemirror
**Confidence:** CONFIRMED
**Evidence:** github.com/ueberdosis/y-tiptap

- Forked from y-prosemirror
- Contains TipTap-specific changes too specialized for upstream
- Provides: prosemirrorJSONToYDoc, yDocToProsemirror, scoped undo/redo
- Improvements contributed back to y-prosemirror where feasible

### Finding: Tracked Changes is unstable and actively developing
**Confidence:** CONFIRMED
**Evidence:** Tracked Changes docs

- Enables suggestion mode (insertions, deletions tracked as proposals)
- Can create tracked suggestions programmatically
- DOCX round-tripping with tracked changes
- API explicitly marked unstable (pre-1.0)
- On public roadmap as "Next" item (Redlining)

### Finding: No explicit "agent" or "bot" collaboration features
**Confidence:** CONFIRMED
**Evidence:** Collaboration docs, AI Toolkit docs

TipTap does not have a dedicated concept of "agent collaborator" in the collaboration layer. The AI Toolkit operates on documents through tools, not as a named participant in the CRDT collaboration session. However, the Server AI Toolkit effectively creates headless agent editing capability.

---

## Gaps / follow-ups
- Agent-as-collaborator presence (showing AI cursor) not documented
- Tracked Changes maturity level unclear for production use
- Multiplexing performance benchmarks not available
