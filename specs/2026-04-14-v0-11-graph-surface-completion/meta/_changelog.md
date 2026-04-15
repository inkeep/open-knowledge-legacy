## 2026-04-14

### Changes
- **SPEC created:** Initial draft for completing V0-11 graph surfaces around docked `Outgoing Links`, fullscreen project-level `Orphans` / `Hubs`, and tightened orphan semantics.
  - Evidence: `evidence/app-graph-surfaces.md`, `evidence/server-graph-semantics.md`
  - Affected sections: `SPEC.md` §1-§15
- **evidence/app-graph-surfaces.md:** Created — traced docked `DocPanel`, fullscreen `GraphPanel`, and client refresh plumbing.
- **evidence/server-graph-semantics.md:** Created — verified existing endpoint contracts, current orphan/hub semantics, and graph invalidation channels.
- **MCP blast radius noted:** Confirmed `get_orphans` currently promises "no incoming wiki-links", so the orphan-semantic change affects public tool wording as well as UI/server behavior.

### Pending (carried forward)
- Resolve whether tightened orphan semantics are wiki-syntax-only or apply to the current unified internal graph.
- Resolve the fullscreen presentation shape for project-level `Orphans` / `Hubs`.
- Decide whether the fullscreen `Hubs` surface should use the existing default top-20 contract or a broader list.

### Later decisions
- **D4 confirmed:** Orphan semantics use the current unified internal graph rather than a wiki-syntax-only edge model.
  - Affected sections: `SPEC.md` §6, §8, §9, §10, §11, §13
- **D5 confirmed:** Fullscreen project-level `Orphans` / `Hubs` use mode switches inside the existing fullscreen `GraphPanel`.
  - Affected sections: `SPEC.md` §5, §6, §9, §10, §11
- **Hub-limit provenance captured:** Verified that the current default of 20 comes from the original wiki-links/backlinks API/tool contract, not a later V0-11 product-specific recommendation.
  - Evidence: `evidence/server-graph-semantics.md`

### Remaining pending
- Decide whether the fullscreen `Hubs` surface should use the existing default top-20 contract or a broader list.
- Update product/API/MCP wording so the new orphan semantics describe disconnected graph pages consistently.

## 2026-04-14 (continued)

### Changes
- **D6 confirmed:** Fullscreen `Hubs` uses a larger fixed slice (`50`) while API/MCP defaults remain `20`.
  - Evidence: `evidence/server-graph-semantics.md`
  - Affected sections: `SPEC.md` §6, §9, §10, §11, §14, §15
- **Q4 deferred:** Graph/list cross-highlighting remains Future Work; v0 only requires navigation from `Orphans` / `Hubs`.
  - Affected sections: `SPEC.md` §11, §15
- **Snapshot cleanup:** Removed stale "still deciding" language after D4/D5/D6 so the spec reads as current state rather than process history.

### Pending (carried forward)
- Update product/API/MCP wording so orphan semantics describe disconnected graph pages consistently.
- Optionally run a final scope-freeze pass / finalize the spec artifact.

## 2026-04-14 (toggle update)

### Changes
- **Scope expanded:** `Orphans` now supports three modes — `incoming`, `outgoing`, `both` — with `both` as the default.
  - Affected sections: `SPEC.md` §2, §5, §6, §8, §9, §10, §14
- **UI requirement added:** Fullscreen `Orphans` must expose a visible mode toggle on that screen.
  - Affected sections: `SPEC.md` §5, §6, §9, §10
- **Contract direction locked:** Orphan mode should exist in reusable backend/API semantics, not only as frontend-only filtering.
  - Affected sections: `SPEC.md` §6, §9, §10, §14

### Pending (carried forward)
- Update product/API/MCP wording so orphan semantics describe disconnected graph pages consistently.
- Convert the updated spec into `tmp/ship/spec.json` and begin implementation in the new worktree.
