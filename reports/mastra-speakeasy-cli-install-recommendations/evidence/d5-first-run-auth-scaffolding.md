# Evidence: D5 — First-run + auth + project scaffolding

**Dimension:** D5 — What happens on first invocation? How is auth handled? What config files are written?
**Date:** 2026-04-20
**Sources:** Mastra CLI source + docs; Speakeasy docs + CLI reference

---

## Key files / pages referenced

- `packages/cli/src/commands/init/init.ts` (Mastra)
- `packages/cli/src/commands/init/utils.ts` — `writeAPIKey`, `writeAgentsMarkdown`, `writeClaudeMarkdown`
- `packages/cli/src/commands/init/mcp-docs-server-install.ts` — editor MCP config paths
- `packages/cli/src/commands/auth/credentials.ts` — credential store
- `packages/cli/src/index.ts` — create command flags
- [speakeasy.com/docs/speakeasy-reference/cli/getting-started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started) — auth walkthrough
- [speakeasy.com/docs/speakeasy-cli/quickstart](https://www.speakeasy.com/docs/speakeasy-cli/quickstart)
- [speakeasy.com/docs/speakeasy-reference/cli/run](https://www.speakeasy.com/docs/speakeasy-reference/cli/run) — reads `.speakeasy/workflow.yaml`

---

## Findings

### Finding: Mastra scaffolds a full project with interactive @clack/prompts; auth is a separate OAuth-to-hosted-platform flow

**Confidence:** CONFIRMED
**Evidence:** CLI source files

`create-mastra` runs an interactive `@clack/prompts` flow:

1. Project name
2. LLM provider from `openai | anthropic | groq | google | cerebras`
3. API key (optional — if skipped, writes to `.env.example` instead of `.env`)
4. Optional MCP editor integration — `cursor | cursor-global | windsurf | vscode | antigravity`
5. Optional Mastra skills

Scaffold output (from `packages/cli/src/commands/init/init.ts`):

- `src/mastra/` directory with `index.ts` + subdirectories (`agents/`, `tools/`, `workflows/`, `scorers/`)
- `.env` (when key provided) or `.env.example`
- `AGENTS.md` + `CLAUDE.md` via `writeAgentsMarkdown` / `writeClaudeMarkdown`
- `git init`
- Editor-specific `mcp.json` registering `@mastra/mcp-docs-server` as a stdio MCP server. Concrete paths from `mcp-docs-server-install.ts`:
  - Cursor: `~/.cursor/mcp.json` (global), project-local under `.cursor/mcp.json`
  - Windsurf: `~/.codeium/windsurf/mcp_config.json`
  - VS Code: `<cwd>/.vscode/mcp.json`
  - Antigravity: `~/.gemini/antigravity/mcp_config.json`
- Auto-installs `@mastra/libsql`, `@mastra/memory`, `@mastra/loggers`, `@mastra/observability`

Auth is a separate, later step. `packages/cli/src/commands/auth/credentials.ts`:

```js
const CREDENTIALS_DIR = join(homedir(), '.mastra');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json');
await mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
```

`mastra auth login` opens a browser; credentials stored with restrictive permissions. CI path: `MASTRA_API_TOKEN` / `MASTRA_ORG_ID` env-var overrides.

Notably, Claude Code is **not** listed among the `--mcp <editor>` options. Users on Claude Code must hand-wire `.mcp.json`.

### Finding: Speakeasy's first-run is a bare `speakeasy` TUI; scaffolding is `speakeasy quickstart`; auth is browser-based with CI env-var fallback

**Confidence:** CONFIRMED
**Evidence:** Getting Started + quickstart + run command docs

[speakeasy.com/docs/speakeasy-reference/cli/getting-started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started):

> Simply type `speakeasy` in the terminal for a guided set-up and usage experience.

Auth flow:

> A browser window will open. Log in to the Speakeasy Platform and create a workspace.

For CI:

> set the `SPEAKEASY_API_KEY` environment variable

[speakeasy.com/docs/speakeasy-cli/quickstart](https://www.speakeasy.com/docs/speakeasy-cli/quickstart) — "Guided setup to help you create a new SDK in minutes"; supports `--from <url>` pointing at `https://app.speakeasy.com/sandbox`.

`speakeasy quickstart` writes `.speakeasy/workflow.yaml` — confirmed by [run command doc](https://www.speakeasy.com/docs/speakeasy-reference/cli/run) which reads this file as its config input.

**Implications:** Speakeasy's scaffold scope is narrow — a single workflow\.yaml — compared to Mastra's full project layout. No `AGENTS.md` / `CLAUDE.md` files, no editor MCP integration, no auto-install of sibling packages.

---

## Comparative matrix

| First-run concern          | Mastra                                                                                              | Speakeasy                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Entry command              | `npm create mastra@latest`                                                                          | `speakeasy` (bare) after install                    |
| Interactive prompt library | `@clack/prompts`                                                                                    | Undisclosed (likely Go-native promptui or similar)  |
| Config files written       | `src/mastra/**`, `.env`(.example), `AGENTS.md`, `CLAUDE.md`, editor `mcp.json`, `package.json` deps | `.speakeasy/workflow.yaml`                          |
| Editor MCP integration     | Cursor, Windsurf, VS Code, Antigravity (**not Claude Code**)                                        | None                                                |
| Auth storage               | `~/.mastra/credentials.json` (0600 perms)                                                           | Undocumented storage path; OS keychain likely       |
| Auth flow                  | Browser OAuth                                                                                       | Browser-based login (redirect or OAuth; not pinned) |
| CI auth env var            | `MASTRA_API_TOKEN` (+ `MASTRA_ORG_ID`)                                                              | `SPEAKEASY_API_KEY`                                 |
| Telemetry                  | PostHog wired in `packages/cli/src/index.ts` (no opt-out documented)                                | Not inspected                                       |

---

## Negative searches

- **Mastra Claude Code integration:** `--mcp <editor>` options enumerated in `packages/cli/src/index.ts` do not include `claude-code` or `claude`. Users on Claude Code must hand-wire.
- **Speakeasy AGENTS.md / CLAUDE.md writes:** Quickstart docs do not mention writing agent-instruction files. Scope is SDK-generation, not agent-project scaffolding.

---

## Gaps / follow-ups

- **Speakeasy auth mechanism:** "A browser window will open" could be OAuth device flow, redirect-with-token, or something else. Not pinned in docs.
- **Mastra telemetry opt-out:** PostHog is unconditionally wired. Whether `MASTRA_TELEMETRY=0` or similar exists — not documented in the CLI surface inspected.
- **Both:** Behavior when auth is attempted offline (no network for browser-redirect). Neither doc addresses this.

