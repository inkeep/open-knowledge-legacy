# Changelog

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
