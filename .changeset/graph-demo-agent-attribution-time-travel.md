---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat(graph-demo): live agent attribution on the graph (Stage 6) and checkpoint-scoped graph time-travel (Stage 7)

**Stage 6 — live agent attribution**

- `GET /api/link-graph` now emits a `lastEditedBy` property on doc nodes (`{ writerId, label, color, timestamp }`) when a write has landed within `HALO_DURATION_MS`.
- New `LiveAttributionTracker` (`packages/server/src/live-attribution.ts`) — in-memory per-doc "last writer" table fed from the same agent-write path that drives the existing activity side-channel. Consistent with the editor's live-write UI.
- Shared decay timing constants (`HALO_DURATION_MS`, `HALO_FADE_MS`) land in `@inkeep/open-knowledge-core` at `constants/graph-attribution.ts` so server-side decay and client-side halo fade cannot drift.
- Client renders pulsing halos around each active writer's node (`graph-attribution.ts` → `GraphView`), driven by a small animation loop that respects `prefers-reduced-motion`. A bottom-right `GraphAgentLegend` lists active writers color-matched to their halos.

**Stage 7 — graph time-travel**

Three new read-only endpoints replay and diff the graph against the shadow-repo's `save_version` checkpoints:

- `GET /api/checkpoints` — recent checkpoints from the shadow repo with parsed writer identity (backed by `timeline-query.ts`).
- `GET /api/graph-at?sha=<ref>` — reconstructs the link-graph at a historical commit by replaying every blob through an in-memory `BacklinkIndex`. Output shape matches live `/api/link-graph` exactly, so the client can swap views without branching rendering code.
- `GET /api/graph-diff?from=<sha>&to=<sha>` — returns only node-id + link-key deltas. The client composes the union graph locally (`graph-diff-marks.ts#mergeGraphsWithDiff`) and tags each node/link as `added` / `removed` / `updated` / `unchanged` — removed items stay visible with a red dashed ring, added items glow green.

Historical reconstruction uses a fixed subprocess budget (`historical-graph.ts`): one `git ls-tree -r` + one `git cat-file --batch`, regardless of repo size. A naive per-file `git show` version took ~55 s on a 5,000-file corpus; the batch reader completes in ~2.5 s (22× faster, measured end-to-end against `/api/graph-diff`).

**Client architecture**

- `useGraphTimeline()` hook owns checkpoint list (TanStack Query), selection state, historical snapshot + diff fetches, union-graph composition, and a 1.5 s / step replay timer. Exposes a pure `GraphTimelineController` surface to the UI.
- `GraphTimeline` component is a thin presentation layer — step / Now / compare-picker / Play controls. Fullscreen Explore only.
- `GraphView` extended with `overrideGraph` + `diffMarks` props. Live fetch disabled when `overrideGraph` is set; diffMarks drive per-node / per-link visual state (added / removed / updated).
- Render-loop fix: `GraphPanel.onStatsChange` uses a state-setter bailout to avoid re-allocating the stats object when counts are unchanged — React Compiler cannot memoize an inline prop-arrow in a way that would break the cycle, so the structural bailout is load-bearing. See `specs/2026-04-16-graph-demo-iteration-loop/evidence/timetravel-render-loop.md` for the full causation chain.

**Public surface additions**

From `@inkeep/open-knowledge-core`:
- Types: `LinkGraph`, `DocNode`, `UrlNode`, `LinkEdge`, `LastEditedBy`, `HistoricalNode`, `HistoricalLink`, `GraphDiff` (`types/link-graph.ts`).
- Constants: `HALO_DURATION_MS`, `HALO_FADE_MS` (`constants/graph-attribution.ts`).

From `@inkeep/open-knowledge-server`:
- `LiveAttributionTracker` (`live-attribution.ts`).
- `listCheckpoints()` (`timeline-query.ts`).
- `buildHistoricalGraph()`, `diffHistoricalGraphs()` (`historical-graph.ts`).
