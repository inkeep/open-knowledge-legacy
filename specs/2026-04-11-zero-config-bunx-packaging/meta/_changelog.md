# Changelog

## 2026-04-11 — Initial creation

- Spec scaffolded from research at `reports/zero-config-bunx-cli-packaging/REPORT.md`
- Codebase investigation: traced asset resolution, build pipeline, init flow, file watcher, config defaults
- Evidence captured: `evidence/codebase-current-state.md`
- Plugin packaging investigation dispatched (background)

## 2026-04-11 — Open questions resolved, Track 4 designed

- Q1 resolved: chokidar ^5.0.0 (ESM-only, lighter, 1 dep)
- Q2 resolved: auto-init creates content dir if missing
- Q3 resolved: plugin format investigated → launch.json NOT a plugin feature. Plugin uses .mcp.json + optional hook.
- Q4 resolved: chokidar lives in server package
- Track 4 fully designed with plugin.json, .mcp.json, and hooks structure
- D7-D10 added to decision log
- Evidence captured: `evidence/plugin-format.md`

## 2026-04-11 — Audit + challenge findings applied

Corrections applied (7 factual/coherence fixes):
- Fixed: chokidar version inconsistency (^4.0.0 → ^5.0.0 throughout)
- Fixed: dependency changes target server package.json, not CLI
- Fixed: `filter.isIncluded()` → `filter.isExcluded(relative(dir, path))`
- Fixed: D7 rationale "1 dep vs 13" corrected (both v4 and v5 have 1 dep)
- Fixed: Keep @parcel/watcher in tsdown neverBundle (native addon can't be bundled)
- Fixed: deployment table updated for chokidar v5 metrics
- Added: 3 additional @parcel/watcher import sites (head-watcher.ts, mcp/server.ts)
- Added: build ordering note documenting tsdown clean:true dependency

Design challenge resolutions:
- Accepted M3: auto-init from `start` no longer writes `.mcp.json` (reduced surprise for evaluators)
- Accepted H1: expanded Track 2 scope to all @parcel/watcher import sites
- Noted H2 (fs.watch alternative): valid but chokidar provides better event normalization; decision D7 stands
- Updated Agent Constraints SCOPE to include all affected files
