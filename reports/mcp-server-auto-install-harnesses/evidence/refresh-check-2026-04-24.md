# Evidence refresh: 6-day staleness check (2026-04-24)

**Check type:** Spot-check on parent report claims (dated 2026-04-18).
**Date:** 2026-04-24
**Sources:**

- GitHub: `anthropics/claude-code` issues #26259, #24433, #26952
- GitHub: `anthropics/claude-code` releases page (v2.1.116 – v2.1.119)
- `code.claude.com/docs/en/changelog` (official Claude Code changelog)
- Web search: `"Claude Desktop" "Cowork" changelog OR release OR update April 2026`
- Web search: skills npm package 1.5.x / 1.6.x

---

## Per-claim verification

### Bug #26259 (Cowork stdio Desktop Extensions not bridged into VM)

- **Current state:** OPEN (carries a "staleIssue is inactive" label).
- **Title (verbatim):** "\[BUG] Desktop Extension MCP servers not passed to Cowork VM despite being enabled in session config."
- **New activity since 2026-04-18:** None visible in the issue excerpt — no new comments, no linked PR, no "fixed-in" marker.
- **Parent-report claim holds:** YES.
- **Evidence:** [https://github.com/anthropics/claude-code/issues/26259](https://github.com/anthropics/claude-code/issues/26259)

### Bug #24433 (Cowork per-tool re-approval: "Always allow" never persists)

- **Current state:** CLOSED as "not planned." (Important correction if parent report described it as open — verify against parent-report wording when it lands.)
- **Title (verbatim):** `[BUG] Claude Desktop Cowork: "Always allow" for MCP tools does not persist across sessions`.
- **New activity since 2026-04-18:** None visible — no new comments or linked PRs.
- **Parent-report claim holds:** CONDITIONAL — the behavior (non-persistence across sessions) appears unchanged, but if the parent report characterizes the issue as still "open" rather than "closed-not-planned," that framing needs correction. The substantive claim (re-approval each session) is still accurate.
- **Evidence:** [https://github.com/anthropics/claude-code/issues/24433](https://github.com/anthropics/claude-code/issues/24433)

### Feature request #26952 (`claude://` MCP install URL scheme, closed "not planned")

- **Current state:** CLOSED as "not planned" — unchanged.
- **Title (verbatim):** "Claude Desktop: custom URL schemes (non-http) are not opened by the OS #26952".
- **New activity since 2026-04-18:** None visible — no reversal, no related new issue surfaced in the excerpt or search.
- **Parent-report claim holds:** YES.
- **Evidence:** [https://github.com/anthropics/claude-code/issues/26952](https://github.com/anthropics/claude-code/issues/26952)

### Claude Desktop / Cowork release notes 2026-04-18 → 2026-04-24

- **Releases in window (claude-code):** v2.1.116 (Apr 20), v2.1.117 (Apr 22), v2.1.118 (Apr 23), v2.1.119 (Apr 23).
- **Cowork-specific changes:** NONE found in any of the four official Claude Code changelog entries. Zero mentions of "Cowork," "desktop extension," or "claude\_desktop\_config.json" bridging in v2.1.116–v2.1.119.
- **MCP-adjacent changes in window (not Cowork):**
  - v2.1.119: `${ENV_VAR}` placeholder substitution in HTTP/SSE/WebSocket MCP `headers`; OAuth `client_secret_post` handling; MCP servers-from-plugins on Windows; subagent/SDK MCP reconfiguration connects servers in parallel.
  - v2.1.118: Hooks invoke MCP tools directly via `type: "mcp_tool"`; multiple MCP OAuth improvements.
  - v2.1.117: Agent frontmatter `mcpServers` loaded for main-thread agents; concurrent MCP server connections at startup.
  - v2.1.116: Faster MCP startup with deferred resource-template lists; fixed `SDK/bridge read_file` not enforcing size cap on growing files.
- **Web-search claim reviewed:** A third-party aggregator ("releasebot.io") surfaced a sentence claiming "three separate changes affected Claude Code, the Claude Agent SDK, and Claude Cowork, and all three issues have been resolved as of April 20 (v2.1.116)." This claim does NOT appear verbatim in the official `code.claude.com/docs/en/changelog` entry for v2.1.116 — treat it as aggregator paraphrase, not a verified Cowork fix announcement. The v2.1.116 entry contains only one SDK/bridge-adjacent fix (`read_file` size cap).
- **Parent-report claim holds:** YES for "no new Cowork changes." Explicitly note the aggregator's "all three issues resolved" line is not corroborated by the official changelog.

### `skills` npm package version

- **Latest observed:** The exact published version of the `skills` npm package could not be confirmed directly — npmjs.com returned 403 to the fetch tool in this session. Web search surfaced a related package `openskills` at 1.5.0 (published "\~3 months ago"), and multiple packages named `skills` / `skills-npm` / `@marcfargas/skills` exist. The `skills` package listing on npmjs.com is reachable via browser but not via this fetch.
- **Parent-report context:** References `npx skills@~1.5.0`.
- **Parent-report claim holds:** INCONCLUSIVE at this check. No evidence of a 1.6.x or later bump surfaced in search; no change signal. Treat as "likely still 1.5.x" pending a direct npm CLI check. Recommend the parent-report author re-verify via `npm view skills versions --json` before ship.

---

## Net verdict

**Parent report still accurate: MOSTLY.**

Caveats and corrections:

1. **#24433 is CLOSED "not planned," not merely "open."** If the parent report frames this as an open bug, correct to "closed as not planned — behavior unchanged." The substantive claim (re-approval every session) still holds.
2. **No Cowork fixes landed in v2.1.116–v2.1.119** per the official changelog. A third-party aggregator paraphrases a "three issues resolved" claim that is not corroborated by `code.claude.com/docs/en/changelog` — parent report should not cite it as evidence of Cowork improvement.
3. **#26259 and #26952 are unchanged** — parent-report claims hold as written.
4. **`skills` npm version verification deferred** — direct npmjs.com fetch was blocked in this session; recommend a `npm view skills` check before ship.

---

## Negative searches

- Searched `"Cowork"` in `code.claude.com/docs/en/changelog` for entries 2026-04-18 → 2026-04-24 → zero hits.
- Searched `"desktop extension"` in same changelog window → zero hits.
- Searched `"claude_desktop_config"` in same changelog window → zero hits.
- Searched `"#26259" OR "#24433" OR "#26952"` on general web → no public indexing of these issue numbers in combination.
- Searched for PRs linking to #26259 or #24433 in the visible GitHub issue excerpts → none surfaced.
