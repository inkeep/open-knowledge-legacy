---
name: Intake context pointers
description: Source-of-truth file:line citations gathered during V0-2 Intake — anchors every claim in SPEC.md to a verified location in the codebase or project artifacts.
type: factual
sources:
  - projects/v0-launch/PROJECT.md
  - specs/2026-04-11-sidebar-realtime-updates/SPEC.md
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/BacklinksPanel.tsx
  - packages/server/src/file-watcher.ts
  - CLAUDE.md
---

# Intake context pointers

## Project framing

- **V0-2 entry:** `projects/v0-launch/PROJECT.md:480-499` — full story: what to build, value, constraints, lateral, owners, status.
- **CC1 definition:** `projects/v0-launch/PROJECT.md:991-992` — *"use the existing Hocuspocus awareness channel with a dedicated 'system' sub-state, signal-then-fetch (not push-the-data), idempotent under rapid changes."* This is the load-bearing contract.
- **Andrew's territory (CC1 owner):** `:450` — *"Server-side push broadcast infrastructure (CC1)."*
- **V0-3 dependency:** `:332-346` — BacklinksPanel adopts V0-2's pattern; *"first one defines contract."*
- **V0-11 dependency:** `:303-320` — graph panels adopt CC1 push.
- **V0-4 dependency:** `:523` — *"Andrew's CC1 push-broadcast infrastructure is a prerequisite for Dima's sidebar UX."*
- **Pattern decision callout:** `:38` — *"Push-over-awareness (V0-2) is the reusable signaling pattern for every future derived-view UI."*
- **Rabbit-hole guardrail:** `:1038` (RH2) — *"Don't redesign the sidebar while we're rewriting it real-time."*

## Predecessor spec

- **File:** `specs/2026-04-11-sidebar-realtime-updates/SPEC.md`
- **Status:** Draft (seed), 2026-04-11, baseline `718d33e`.
- **Open questions:** OQ1-OQ6 (lines 31-54).
  - OQ1: Push vs pull — partially resolved by CC1 (push)
  - OQ2: Provider pool → sidebar refresh
  - OQ3: Event-scope (which DiskEvents matter)
  - OQ4: Optimistic UI for agent writes (likely NG2 / V0-4)
  - OQ5: List-endpoint scalability (likely moot — see CLAUDE.md note)
  - OQ6: Coordination with file-watcher events (essentially CC1)

## Code reality

- **Polling code:** `packages/app/src/components/FileSidebar.tsx:121-149`
  - L124: `fetch('/api/documents')` on mount
  - L144: `setInterval(fetchDocs, 5000)`
- **Analogous V0-3 polling:** `packages/app/src/components/BacklinksPanel.tsx:57` — `window.setInterval(...)`
- **DiskEvent taxonomy:** `packages/server/src/file-watcher.ts:33-45`
  ```ts
  type DiskEvent =
    | { kind: 'create'; path; docName; content }
    | { kind: 'update'; path; docName; content }
    | { kind: 'delete'; path; docName }
    | { kind: 'rename'; oldPath; newPath; oldDocName; newDocName; content }
    | { kind: 'conflict'; path; docName; content }
  ```
- **In-memory file index (relevant to OQ5):** `CLAUDE.md` "File discovery" — *"the documents API reads from this index (no independent filesystem walk)."* Strongly suggests OQ5 is moot; verify in Iterate.

## Identified tensions

1. **Seed vs. CC1 contract.** Seed says "Push payload is small (file path + event kind), not the full document list." CC1 says "signal-then-fetch (not push-the-data)." These are different contracts (typed payload vs. opaque signal). Resolution = judgment-call 2 in Intake response.
2. **Vault-scoped signal on per-doc transport.** Hocuspocus awareness and stateless messages attach to a single `Y.Doc`. The sidebar is global. Three candidate resolutions enumerated in §9 transport sketch.
3. **Sidebar with no open doc.** A1/A3 in SPEC.md §12 — likely false on cold load before user opens a file. Affects transport choice (Q9).

## Cross-cutting precedent (CLAUDE.md "Architectural precedents")

- **#3 Structured event schemas** — *"Activity-map entries carry `{actor, timestamp, action: {kind, metadata}, visibility}` — any coarse collaborative action fits the shape. Don't grow ad-hoc fields."* — argues for option B/C in judgment-call 2 (typed events).
- **#1 Typed transaction origins** — relevant if broadcast handlers want to identify "this came from CC1" vs. "this came from local edit."
