---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
---

chore(server,test-harness): per-worker shadow-repo + git support in the Tier 1 integration harness and dev plugin

- `@inkeep/open-knowledge-server` — two new public exports from the package barrel: `swapContributors` (the preferred atomic-drain API on top of the now-`@deprecated` `clearContributors`) and `destroyShadowRepo` (cleanup primitive for the shadow bare-repo root). Both are consumed by the app-integration test harness's new `withShadow: true` opt-in; no behavior change to the existing exports.
- `@inkeep/open-knowledge-app` — Vite dev plugin under `OK_TEST_CONTENT_DIR` now initializes a per-worker shadow at `<tmpdir>/.git/open-knowledge/` by default and sets `gitEnabled: true`, so the full-app topology under Playwright matches production (TimelinePanel, Save Version, rollback, attribution all exercise real shadow commits). All `PROJECT_ROOT`-derived bindings in the dev plugin collapse to a single module-level `projectRoot` binding (D12). Shadow-init errors under isolation fail-fast (D13). Tier 1 integration harness adds a `withShadow?: boolean` opt-in (default `false`); existing shadow-orthogonal tests are unaffected.

Full spec + decision log (D1–D15, R1–R3): [`specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md`](specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md).
