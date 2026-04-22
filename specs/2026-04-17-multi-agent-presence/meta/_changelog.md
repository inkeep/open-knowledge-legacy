# Changelog — multi-agent presence spec

Append-only process history. New entries at the bottom.

---

## 2026-04-17 — Spec scaffolded

**Session start.** User reported via screenshot: "I can only see one agent icon at a time" when writing from multiple MCP clients simultaneously.

**Intake completed:**

- Root cause diagnosed pre-spec via code trace (Hocuspocus Document caching by docName + single Y.Awareness clientID per Y.Doc + server-side `setLocalState` overwriting the shared slot).
- SCR problem statement drafted, 5-probe stress-test passed.
- Initial constraints captured: Y.Doc-per-docName caching is fixed; Y.Awareness clientID is uint32; MCP `connectionId` already UUID-unique per process.

**Scaffolded:**

- `specs/2026-04-17-multi-agent-presence/SPEC.md`
- `specs/2026-04-17-multi-agent-presence/evidence/` (empty — populate during iteration)
- `specs/2026-04-17-multi-agent-presence/meta/_changelog.md` (this file)
- Baseline commit stamped: `0b707bd1`

**Pending items carried forward to next session step (Backlog):**

- Q1-Q8 open questions from SPEC §11 — all P0 except Q4 (P2).
- D1-D4 decisions in INVESTIGATING — awaiting user confirmation batch.
- D5 LOCKED (server-only fix, no wire changes).
- D6 DIRECTED (remove vestigial `tabId` field).
- A1, A4, A5 assumptions Active — verification plans noted.

**Known process hiccup:** MCP `write_document` path was broken for \~30 min during scaffold phase; user reconnected the MCP via `/mcp` and writes resumed. No data loss (scaffold content was held in chat draft until write succeeded).
