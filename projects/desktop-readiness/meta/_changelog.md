# Changelog

## 2026-04-11 — In-flight work audit
- Audited all open/draft PRs and 25+ specs for overlap with the 5 stories
- **PR #41 (Image upload, 492 LOC):** Directly implements Story 2b — Story 2b updated to build on this PR rather than restart
- **PR #54 (Zero-config bunx spec):** T2 watcher fallback relevant to Story 5, T3 auto-init related to Story 3 — Story 5 updated to inherit T2 pattern
- **PR #39 (Timeline with rollbacks):** Richer version-history UI than Story 4's persistence indicator — Story 4 updated to coordinate
- **PR #40 (Enriched MCP file API spec):** MCP `write_file` must be consistent with Story 2a CRUD endpoints — Story 2a updated with alignment constraint
- **PR #53 (Wiki-link context menu):** Shares right-click context menu UI pattern with Story 2a sidebar — noted as shared component opportunity
- **shadow-lock.ts (merged):** Existing PID-based lock pattern — Story 1 confirmed as extension of this pattern
- Updated PROJECT.md strategic context with in-flight audit table + all 5 stories with prior-art references

## 2026-04-11 — Session start
- Project created: Desktop Readiness — cross-cutting work to address in CLI/web before Electron packaging
- Source: Electron desktop app spec (specs/2026-04-11-electron-desktop-app/) identified 15 items that live in shared packages (server, app, cli, core) and should ship before touching Electron-only code
- Persona: documentation author writing MDX with AI assistance
