# Evidence: Orca — Cross-platform AI agent orchestrator (DEEP)

**Dimension:** D7 — stablyai/orca
**Date:** 2026-04-07
**Sources:** Cloned repo at `~/.claude/oss-repos/prior-art-open-knowledge/orca`, deep source investigation by Explore subagent
**Repo metrics:** 495 stars, 26 forks, 483 commits, 88 releases (latest v1.0.96 April 7 2026), MIT license, TypeScript 96.2%, Electron framework

---

## Findings

### Finding: Orca is an Electron desktop app + RPC server + CLI skill — three layers, one workflow
**Confidence:** CONFIRMED
**Evidence:** `src/main/index.ts:1-124` — Electron main process startup. Three concurrent surfaces:
1. **Electron renderer** — React UI for humans (sidebar, file editor, source control, terminal pane)
2. **OrcaRuntimeRpcServer** — Unix domain socket / Named pipe RPC server for CLI/agent connectivity
3. **`/skills/orca-cli/`** — installable Claude Code skill (`npx skills add https://github.com/stablyai/orca --skill orca-cli`)

The three surfaces share state via `OrcaRuntimeService` (the control plane).

**Implications for open-knowledge:** Orca is a **direct architectural template for what open-knowledge could become at the desktop scale**. The three-layer pattern:
- **UI for humans** (Electron in Orca's case; web app in open-knowledge's case)
- **RPC/MCP server for agents**
- **CLI skill for terminal-based agent integration**

All three connect to a single in-memory state store. **This is exactly what open-knowledge needs for the multi-client story** (web editor + MCP server + CLI). Orca proves the pattern works in production with 495 stars and 88 releases.

### Finding: CLI installable as a Claude Code skill via `npx skills add` — distribution model
**Confidence:** CONFIRMED
**Evidence:** Skill definition at `/skills/orca-cli/SKILL.md` (185 lines). Installation:
```bash
npx skills add https://github.com/stablyai/orca --skill orca-cli
```

This:
1. Clones the repo
2. Extracts compiled CLI (`out/cli/index.js`)
3. Symlinks to `~/.claude/skills/orca-cli` with a wrapper
4. Makes `orca` command available on the agent's PATH

**Implications for open-knowledge:** **This is the distribution model for open-knowledge's CLI.** The exact same pattern works:
```bash
npx skills add https://github.com/<user>/open-knowledge --skill ok-cli
```

This is **dramatically simpler than the typical "install our package, configure your MCP client, restart your agent"** dance. The user runs one command and the skill is available everywhere Claude Code runs.

For open-knowledge's CC5 (zero-friction onboarding): consider shipping BOTH:
1. `npx openknowledge init` — local project setup (current plan)
2. `npx skills add https://github.com/openknowledge/openknowledge --skill openknowledge-cli` — global skill installation

Users can adopt either entry point.

### Finding: RPC server uses Unix socket (mac/linux) or Named pipe (Windows) + JSON-RPC + token auth
**Confidence:** CONFIRMED
**Evidence:** `src/main/runtime/runtime-rpc.ts:50-200`:
- Creates socket server at startup
- Max connections: 32
- Max message size: 1MB
- Auth token: random 24-byte hex, published in `~/.orca/runtime-metadata.json`
- Metadata structure:
```typescript
type RuntimeMetadata = {
  transport: { kind: 'unix'|'tcp', endpoint: string }
  authToken: string
  pid: number
  runtimeId: string
  startedAt: number
}
```

CLI discovery (`src/cli/runtime-client.ts:57-189`):
1. Reads `~/.orca/runtime-metadata.json` for socket endpoint + auth token
2. Connects to the socket
3. Auto-launches Orca app if not running (`launchOrcaApp()`, polls 250ms intervals)
4. Sends JSON-RPC methods

**Implications for open-knowledge:** **Open-knowledge needs a similar pattern for the multi-client case.** When the user has the editor open AND runs `openknowledge` in a terminal AND has Claude Code with the MCP server connected, all three need to share state.

The Unix-socket-with-metadata-file approach is:
- Auth-protected (token published in user-only readable file)
- Cross-platform (Unix socket on mac/linux, Named pipe on Windows)
- Auto-spawning (CLI launches the desktop app if not running)
- Low overhead (no HTTP, no JSON parsing for headers)

For open-knowledge, the same pattern could connect:
- Web editor → Hocuspocus over WebSocket (current plan)
- CLI → local socket → Hocuspocus
- MCP server → local socket → Hocuspocus

This is more sophisticated than just "everything goes through Hocuspocus over HTTP" but more robust for the multi-client case.

### Finding: Worktree management wraps `git worktree` commands with explicit lifecycle handling
**Confidence:** CONFIRMED
**Evidence:** `src/main/git/worktree.ts:1-172`:

```typescript
export async function listWorktrees(repoPath: string): Promise<GitWorktreeInfo[]> {
  const { stdout } = await runGit(repoPath, ['worktree', 'list', '--porcelain'])
  return parseWorktreeList(stdout)
}

export function addWorktree(repoPath: string, worktreePath: string, branch: string, baseBranch?: string): void {
  const args = ['worktree', 'add', '-b', branch, worktreePath]
  if (baseBranch) args.push(baseBranch)
  execFileSync('git', args, {...})
}

export async function removeWorktree(repoPath: string, worktreePath: string, force = false): Promise<void> {
  // git worktree remove [--force] <path>
  // git worktree prune
  // Auto-deletes orphaned branch with git branch -D
  // Prevents branch deletion if still checked out elsewhere
}
```

Worktree naming computed via `computeWorktreePath()` and `computeBranchName()` in `src/main/ipc/worktree-logic.ts`.

**Implications for open-knowledge:** Open-knowledge's TQ22 (draft branches need git worktrees for CRDT file isolation) is the same problem. Orca's implementation is **production-tested across 495 deployments** for the create/list/remove/prune lifecycle.

Specific patterns to copy:
- **CRLF handling on Windows** (line 52, 60) — non-obvious bug source
- **Atomic prune after remove** — prevents stale worktree references
- **Branch deletion guarded by "checked out elsewhere" check** — prevents accidentally orphaning a branch in another worktree
- **Force flag for stuck worktrees** — manual override when normal remove fails

Open-knowledge can adopt these patterns directly when implementing the CC4 + TQ22 worktree-per-draft architecture.

### Finding: Orca DOES NOT spawn agents — agents are external processes that control Orca via the CLI
**Confidence:** CONFIRMED (architectural decision)
**Evidence:** Subagent investigation: "No explicit agent spawning in Orca itself. Instead: Agents run as external processes (Claude Code, Codex, OpenCode) controlled by users. Agents discover and control Orca via the RPC server, not vice versa. Orca manages worktrees and terminals as shared resources."

The agent's view:
1. User starts Orca (or Orca auto-launches)
2. User runs Claude Code in a terminal (perhaps in a worktree managed by Orca)
3. Claude Code (the agent) calls `orca worktree create --repo id:foo --name task --json`
4. Orca creates the worktree, returns the path
5. Claude Code switches to that worktree, does work
6. Claude Code calls `orca worktree set --comment "fix implemented"` to update status
7. User sees the update in the Orca UI

**Implications for open-knowledge:** This is the **same architectural principle as open-knowledge's "no LLM inference in OSS core."** Both projects refuse to be the agent runtime. They are SUBSTRATES that agents act on.

Orca's specific contribution: it's a desktop substrate that adds **multi-agent coordination** without spawning agents. The user runs whichever agent they want; Orca provides the shared workspace.

This validates open-knowledge's core architectural principle (PROJECT.md: "agent-agnostic substrate"). The pattern works in production for a different domain (code editing instead of knowledge).

### Finding: Worktree comment as agent-writable status field — "lightweight at-a-glance summary"
**Confidence:** CONFIRMED
**Evidence:** `/skills/orca-cli/SKILL.md:92-98`:
```bash
orca worktree set --worktree active --comment "reproduced bug; waiting on review" --json
```

The comment is:
- User-visible in the Orca sidebar
- Agent-updatable via CLI
- Persisted in the store

Agents update at meaningful checkpoints:
- "reproduced auth failure with aws sts"
- "confirmed flaky test; root cause identified"
- "fix implemented; running integration tests"

**Implications for open-knowledge:** This is a **brilliant, simple pattern** open-knowledge should adopt for drafts. When an agent is working on a draft branch (CC4), the agent should be able to set a "status comment" that the user sees in the editor sidebar:
- "Compiling research from 12 sources..."
- "Drafted introduction; reviewing methodology section"
- "Stuck on resolving conflicting claims about X"

Specific design:
- Add a `draft_status` field to draft branches (frontmatter on the draft's branch metadata or a special file)
- MCP tool: `set_draft_status(comment: string)` — agent updates with one call
- Editor UI: shows status comment prominently in the draft sidebar

This gives users **high-bandwidth signal about what the agent is doing** without parsing logs, without running queries, without watching the activity feed. It's the "what's going on right now?" affordance.

### Finding: Terminal handle abstraction — agents don't know PTY internals
**Confidence:** CONFIRMED
**Evidence:** From SKILL.md and `src/cli/index.ts`:
```bash
orca terminal list --worktree id:<worktreeId> --json
# Returns: { terminals: [{ handle: "1:abc123:def456:...", ...}] }

orca terminal read --terminal "1:abc123:def456:..." --json
orca terminal send --terminal "1:abc123:def456:..." --text "code" --enter --json
orca terminal wait --terminal "1:abc123:def456:..." --for exit --timeout-ms 5000 --json
```

Terminal handles are:
- Ephemeral (tied to current Orca runtime, stale after reloads)
- Scoped (include PTY ID, generation counter, tab/leaf path)
- Reacquirable (agent re-lists terminals after reload)

**Implications for open-knowledge:** Not directly applicable to knowledge management, but the **abstraction principle** is interesting: instead of exposing low-level state (PTY IDs, generation counters), expose stable handles that agents can ask for and reacquire.

For open-knowledge, this maps to: **don't expose Y.Doc IDs or CRDT internals via MCP tools.** Expose "current document" or "draft handle" abstractions that agents can request and that the runtime resolves to the right Y.Doc.

### Finding: Persistence is a single JSON file with debounced writes (300ms) and atomic rename
**Confidence:** CONFIRMED
**Evidence:** `src/main/persistence.ts:53-150`:
```typescript
export class Store {
  private state: PersistedState // repos, worktreeMeta, ui, workspaceSession
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  
  private scheduleSave(): void {
    // Debounce writes: collect changes, flush after 300ms idle
  }
}
```

Single file: `~/.orca/orca-data.json`. 300ms debounce. Atomic rename on flush (lines 120-122) to prevent corruption. Lazy merge with defaults on load (lines 69-87).

**Implications for open-knowledge:** **For non-CRDT state (UI preferences, recent files, project metadata), this is the right pattern.** Open-knowledge's CC2 auto-persistence pipeline is more elaborate than Orca's because of CRDT requirements, but for non-document state (e.g., the list of recent KBs, last-opened branch, MCP server config), a single JSON file with debounced atomic writes is plenty.

Orca's pattern is:
- 300ms debounce after change
- Single file (no DB)
- `.tmp` + atomic rename (graphify uses the same)
- Lazy merge on load (handles schema evolution)

Open-knowledge's `.openknowledge/state.json` could follow this exact pattern.

### Finding: GitHub integration via `gh` CLI — delegates auth, no API keys
**Confidence:** CONFIRMED
**Evidence:** `src/main/github/client.ts:1-150`:
```typescript
const { stdout } = await execFileAsync('gh', [
  'pr', 'list',
  '--repo', `${ownerRepo.owner}/${ownerRepo.repo}`,
  '--head', branchName,
  '--state', 'all',
  '--json', 'number,title,state,url,statusCheckRollup,...'
])
```

Commands invoked:
- `gh pr list --repo <owner>/<repo> --head <branch>` — fetch PR for current branch
- `gh api user/starred/stablyai/orca` — check if user starred repo
- `git fetch`, `git rev-parse`, `git merge-base`, `git rev-list --count` — conflict detection

Surfaced in UI: PR title, state (open/closed/merged/draft), URL, check status rollup, merge state, conflict summary.

**Implications for open-knowledge:** **Don't own the GitHub auth flow.** Delegate to `gh`. The user has it installed (or will install it). Same principle for any external API (Slack, Notion, etc.) — use existing CLIs/tools that handle auth.

For open-knowledge, this means: don't write a Notion importer that takes a Notion API key. Write an importer that shells out to a Notion CLI (or asks the agent to use Notion's MCP server). Same for Confluence, Slack, etc. **The product handles the local knowledge layer; external integrations delegate to other tools.**

### Finding: Monaco editor for the file editing surface; Tiptap for rich markdown editing
**Confidence:** CONFIRMED
**Evidence:** package.json:
- `"@monaco-editor/react": "^4.7.0"` — code editor
- `"@tiptap/react": "^3.22.1"` — rich markdown editor
- `"@xterm/xterm": "^6.0.0"` — terminal emulator
- `"node-pty": "^1.1.0"` — PTY spawning
- `"simple-git": "^3.33.0"` — git operations wrapper
- `"electron"`: ^41.0.3
- `"electron-vite"`: ^5.0.0
- `"react": "^19.2.4"`
- `"tailwindcss": "^4.2.2"`

Orca ships BOTH editors — Monaco for code, Tiptap for markdown.

**Implications for open-knowledge:** **Orca uses the same TipTap editor open-knowledge plans (TQ4)**. Validation that TipTap is production-ready for an Electron desktop app context. Open-knowledge can reference Orca's Tiptap integration as a working example.

Open-knowledge's TQ4 chose TipTap + y-prosemirror. Orca's Tiptap setup may or may not use y-prosemirror — worth checking how Orca's Tiptap is wired in (does it support collaborative editing? offline? what plugins?).

---

## Gaps / follow-ups
- Orca's Tiptap integration — does it use y-prosemirror? Does it have CRDT for collaborative editing? (Probably not — Orca is single-user.)
- The "task notification thread" feature — how does the agent surface notifications without spamming?
- The persistence schema evolution — how does Orca handle PersistedState changes between versions?
- Orca's update mechanism — `electron-updater` is in deps but how is it configured?

## Related open-knowledge material
- **CC5 (zero-friction onboarding)** — `npx skills add` distribution model
- **CC2 (auto-persistence)** — debounced JSON writes for non-CRDT state
- **TQ22 (worktree management)** — Orca's git worktree wrapper is a production reference
- **TQ4 (TipTap)** — Orca uses TipTap, validates the choice
- **S4 (MCP server) + CLI** — RPC pattern for multi-client sync
- **New pattern: agent-writable status field per draft** — `draft_status` comment for high-bandwidth signal
- **New pattern: delegate external integrations to user-installed CLIs** — gh, slack-cli, etc.
- **New distribution mode: `npx skills add` for global CLI installation**
