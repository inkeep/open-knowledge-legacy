---
name: user_outcomes_release_pivot
description: User-elicited outcomes captured during the 2026-04-28 release-pivot intake — what "simplification + finalizing the release version of the config api" means for v0 scope and architecture
type: meta
date: 2026-04-28
session: release-pivot intake (Andrew, CTO)
sources:
  - "session: 2026-04-28 light-intake conversation"
---

# User outcomes — release pivot

Captured verbatim from the 2026-04-28 intake conversation. These are user-stated direction (not agent inferences) and seed Step 3 framing + the Step 2 worldmodel dispatch.

## Seed (verbatim)

> "Let's create a /spec in preparation for implementation regarding simplification and finalizing the release version of the config api"

> "Let's evolve the existing spec. Is the config API at this point just a REST API or is there a client with MCP and other interfaces?"

> "I think there might be more than one place where config is currently setup. For example auto-sync with github. That might get written to another file rather than the config.yaml. The config.yaml should be the one stop shop for all entered config. Additionally, we need better schema validation for if there can be a user level, rather than a project level config.yaml and how those layer and what properties can be defined in each. kind of like VSCode does it."

> "The conceptual target of the CONFIG API is to build an API so that it is easy to read/write using the UI APP. but maybe this doesn't need a formal REST API, can we still use file system read/writes but do client side validation for the config viewer?"

> "I wonder if instead of a dedicated browser server bridge we just use the same hocuspocus editor capability for viewing the file. We can make a custom UI to read/write it's contents to a nice form viewer rather than a raw yaml editor"

> "light dark theme settings are user config"

## Decoded direction

1. **Evolve the existing `specs/2026-04-25-config-edit-paths/` spec** — not a new spec directory. Mark superseded decisions with strikethrough + rationale; preserve audit trail.

2. **No dedicated REST API for config.** The HTTP `POST /api/config/patch` and `GET /api/config` endpoints proposed in the existing spec are dropped. The "config API" is a frontend concept — a TypeScript library binding the Modal Settings UI to a Hocuspocus Y.Doc representing the config file.

3. **Schema-as-contract.** `ConfigSchema` (Zod) is reachable from the client bundle. Modal imports it, walks it to render the form, validates client-side at every commit. MCP tools and CLI also import it and validate before fs writes.

4. **Hocuspocus is the transport for live config viewing/editing.**
   - Admit `<contentDir>/.open-knowledge/config.yml` as a Y.Text-only Hocuspocus doc (no markdown bridge, no awareness/presence UI).
   - Admit `~/.open-knowledge/config.yml` as a synthetic Y.Doc (e.g. `__user__/config.yml`) per server instance; file watcher handles cross-process fan-out across multiple `ok start` instances on the same machine.
   - Modal Settings UI (in Electron AND browser) binds to these Y.Docs identically.
   - File watcher detects external edits → updates Y.Text → Modal re-renders. No CC1 'config' channel needed; the Y.Text observer IS the channel.

5. **One-stop-shop for entered config.** All user-entered settings live in `config.yml` (workspace and/or user). Exception: GitHub OAuth tokens stay in `~/.open-knowledge/auth.yml` or OS keychain (separate threat model — chmod 0600 + secrets isolation). Non-secret per-host metadata in `auth.yml` (e.g. `gitProtocol`, `name`, `email`) is not in scope to migrate; those are written exclusively by `ok auth login`/`pat`/`signout` and are essentially identity bookkeeping, not user-configurable settings.

6. **VSCode-style scope-as-constraint.** Each schema field declares legal scope via Zod metadata: `scope: 'user' | 'workspace' | 'either'`. The walker enforces in the Modal (a `'user'`-only field is disabled in the workspace tab; etc.). The loader rejects illegal placements with a source-located error.

7. **Theme is user-config.** `appearance.theme` and `appearance.editorModeDefault` (per existing D20) belong at user-global scope. This is the load-bearing demand for keeping user-global Hocuspocus admission in v0; without it, v0 could have collapsed to workspace-only.

8. **Initial per-field scope map** (validate against consumer code in Step 5):

   | Field | Scope | Rationale |
   |---|---|---|
   | `appearance.theme` | `'user'` | Personal preference; project shouldn't force dark mode |
   | `appearance.editorModeDefault` | `'user'` | Personal preference |
   | `content.{dir, include, exclude}` | `'workspace'` | Project-specific paths |
   | `folders[]` | `'workspace'` | Project-specific |
   | `preview.baseUrl` | `'workspace'` | Project-specific |
   | `mcp.autoStart` | `'user'` | Per-machine setup |
   | `mcp.tools.search.maxResults` | `'either'` | User default, project can override |
   | `mcp.tools.read_document.historyDepth` | `'either'` | Same |
   | `github.oauthAppClientId` | `'either'` | Identity is user-level; project may pin its own |
   | `server.host` | `'user'` | Per-machine network preference |
   | `server.openOnAgentEdit` | `'user'` | UX preference |

## Personas (delta from existing spec)

The existing spec's P1–P5 are mostly preserved. The relevant shift:

- **P2 (Web/`ok ui` user)** — Settings UI now reaches them via Hocuspocus over the same WS that hosts the editor. No HTTP-specific code path. Functional parity with Electron (P1).
- **P4 (AI agent / MCP client)** — writes config via fs directly with imported schema validation; no HTTP round-trip. The MCP tool wraps the same `bindConfigDoc(provider)`-equivalent or a fs-direct write path.

## Outcomes the user named (success criteria)

- Modal Settings UI is "easy to read/write" — schema-driven form, instant client-side validation, no manual YAML.
- Config edits in one window propagate live to other open windows (multi-window theme sync is the canonical case).
- Schema clearly states "this field is user-only / workspace-only / either," and the Modal + loader enforce it.
- All user-entered config has one canonical home (`config.yml` at workspace or user scope), not scattered across files.
- Implementation is simpler than the existing spec proposed — fewer moving parts to ship in v0.

## What this implies for the existing spec

Roughly **60–75% of the existing spec collapses or shrinks.** Captured in detail in `evidence/architectural-pivot-hocuspocus.md` (sibling file). Step 3 reframes the SPEC.md problem statement, goals, non-goals, requirements, and decision log to land the new direction; struck-through decisions retain rationale for audit.
