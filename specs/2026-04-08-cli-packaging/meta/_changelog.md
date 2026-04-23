# Changelog

## 2026-04-15 — Non-goal reclassification (cross-spec edit)

- **NG (§3) updated per D1 of `specs/2026-04-11-electron-desktop-app/SPEC.md`:** the compound non-goal `[NEVER] GUI/Electron packaging, Docker distribution` was split into two entries: `[NOT NOW] GUI/Electron packaging` (with back-reference to the Electron spec) and `[NEVER] Docker distribution` (unchanged). The original `[NEVER]` was a phasing call ("ship CLI first"), not a permanent rejection — the artifact now matches the intent.

## 2026-04-08 — Spec created and iterated

- Intake complete: SCR drafted, stress-tested, personas identified
- Scaffolded SPEC.md, evidence/, meta/
- User decisions captured (D1-D15):
  - Package name: @inkeep/open-knowledge (D1)
  - Four-package structure: core, server, cli, app (D2)
  - CLI serves React frontend in production mode (D7)
  - MCP depends on running server, connects as WS client (D6)
  - Dev mode keeps Vite plugin in packages/app/ (D12)
  - MCP undo/redo via HTTP API (D13), error immediately if server down (D14)
  - WS URL derived from window.location (D15)
  - `dev` command is local-only (D11)
  - `init` command deferred — design TBD (F0)
- Shared code boundary traced (evidence/shared-code-boundary.md)
- Hocuspocus Server class verified (evidence/hocuspocus-server-class.md)
- Dev mode connectivity analyzed (evidence/dev-mode-connectivity.md)
- All P0 OQs resolved (OQ1-OQ6)
- Leveraging research report: reports/npm-global-cli-packaging/REPORT.md
