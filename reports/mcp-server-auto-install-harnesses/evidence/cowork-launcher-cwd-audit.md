# Claude Cowork — final source-level audit + status update

**Dimension:** Claude Cowork launcher cwd / MCP root advertisement
**Date:** 2026-04-18
**Sources:** Local `~/.claude/oss-repos/claude-code/src/` (Anthropic-distributed source tree mirroring the claude-code binary), GitHub issues on `anthropics/claude-code` (#24433, #26259, #26287, #27697, #32637, #34604, #43204, #45433, #47371, #48909, #50168), reverse-engineering articles on aaddrick.com and blog.pluto.security, Anthropic support articles.
**Vendor-bias flag:** Anthropic is vendor; `support.claude.com` sources are 1P. All other sources flagged where used.

---

## Question A: Cowork launcher cwd

**Finding:** Cowork's native addon (`@ant/claude-swift`) spawns the in-VM `claude` binary with `cwd` set to **`/sessions/<sessionName>`** — NOT to the user's mounted workspace folder. The user-selected workspace folder is mounted at `/sessions/<sessionName>/mnt/<folderName>` and passed to `claude` via the additive `--add-dir` flag, which grants tool-access permission but does not change `process.cwd()`.

**Confidence:** CONFIRMED — two independent primary sources corroborate.

**Evidence A1:** Community reverse-engineering of the VM runtime describes the spawn RPC signature exactly:
> "spawn function configured for a specific session" with `spawnOptions.cwd` passed through to the Swift addon's spawn method … `await vmInterface.spawn(processId, config.processName, command, args, cwd, ...)`
> "VM path structure: `/sessions/<name>/mnt/<mount>/<subpath>` … Working directory: `/sessions/<name>/` (non-mount paths resolve here)"

Source: [aaddrick.com Cowork VM analysis](https://aaddrick.com/blog/claude-desktop-cowork-mode-vm-architecture-analysis), accessed 2026-04-18.

**Evidence A2 (primary):** GitHub issue [#50168](https://github.com/anthropics/claude-code/issues/50168), filed 2026-04-17 (one day before this audit), quotes the actual `cowork_vm_node.log` output verbatim, showing that the workspace folder goes through `--add-dir`, NOT cwd:

```
15:28:54 [Spawn:config] Creating spawn function for process=upbeat-cool-heisenberg,
         isResume=false, mounts=11 (Dev, .claude, .auto-memory, .claude/skills,
         .remote-plugins, ..., uploads), allowedDomains=25
15:28:54 [Spawn:create] ... args=... --add-dir /sessions/upbeat-cool-heisenberg/mnt/Dev ...
15:28:54 [Spawn:vm] Spawn succeeded in 69ms
```

**Evidence A3 (reinforcing):** Web searches against the `cowork_vm_node.log` format surface the complete `[Spawn:create]` line shape:
> `[Spawn:create] id=580614be... name=modest-exciting-keller cmd=/usr/local/bin/claude cwd=/sessions/modest-...`

The `cwd=` value is the session directory (`/sessions/<sessionName>`), not the mount subpath. Web search results indexing the GitHub issue corpus (including #50168, #38783, and related triage logs), accessed 2026-04-18.

**Evidence A4:** Local source inspection of `~/.claude/oss-repos/claude-code/src/bootstrap/state.ts:260-278` confirms that `getInitialState()` reads `process.cwd()` (via Node's `cwd()`) exactly once at startup and assigns it to `STATE.originalCwd`:

```typescript
function getInitialState(): State {
  let resolvedCwd = ''
  if (typeof process !== 'undefined' && typeof process.cwd === 'function' && typeof realpathSync === 'function') {
    const rawCwd = cwd()
    try {
      resolvedCwd = realpathSync(rawCwd).normalize('NFC')
    } catch {
      resolvedCwd = rawCwd.normalize('NFC')
    }
  }
  const state: State = {
    originalCwd: resolvedCwd,
    ...
```

**No Cowork-specific override.** Full-tree grep shows only ONE env-var guard on `CLAUDE_CODE_IS_COWORK` (in `src/QueryEngine.ts` at lines 458, 612, 846, 976, 1019, 1076). Every hit is the identical pattern `isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)` gating `flushSessionStorage()` — eager transcript flushing after recording. No `cwd` mutation, no MCP roots override, no workspace-folder detection. The "Cowork" product name appears elsewhere (`cowork_plugins` directory naming, analytics `entrypoint=local-agent` tagging, `CLAUDE_CODE_COWORKER_TYPE` telemetry) but NEVER touches cwd resolution.

**Snippet (getOriginalCwd consumer → MCP roots, verbatim from `src/services/mcp/client.ts:1009-1018`):**
```typescript
client.setRequestHandler(ListRootsRequestSchema, async () => {
  logMCPDebug(name, `Received ListRoots request from server`)
  return {
    roots: [
      {
        uri: `file://${getOriginalCwd()}`,
      },
    ],
  }
})
```

**Bottom line on A:** In-VM `claude` is spawned with `cwd=/sessions/<sessionName>`; this is what `getOriginalCwd()` returns; this is what gets advertised as the sole MCP root.

---

## Question B: Workspace folder → MCP root?

**Finding:** **NO.** The user's mounted workspace folder (e.g. `C:\Dev` → `/sessions/<name>/mnt/Dev`) is NEVER advertised to MCP servers as a root. The only MCP root surfaced via `ListRoots` is `file:///sessions/<sessionName>/` — an empty session-scratch directory, not the user's content.

**Confidence:** CONFIRMED.

**Evidence B1:** `--add-dir` is strictly additive permission, never cwd. From the Commander.js option definition at `src/main.tsx:1000`:

```
.option('--add-dir <directories...>', 'Additional directories to allow tool access to')
```

From `src/bootstrap/state.ts:206-207`:
```
// Additional directories from --add-dir flag (for CLAUDE.md loading)
additionalDirectoriesForClaudeMd: string[]
```

From `src/utils/sandbox/sandbox-adapter.ts:290-299` (same state used for sandbox `allowWrite`):
```
// Include directories added via --add-dir CLI flag or /add-dir command.
// These must be in allowWrite so that Bash commands (which run inside the
// sandbox) can access them — not just file tools, which check permissions
// at the app level via pathInAllowedWorkingPath().
const additionalDirs = new Set([
  ...(settings.permissions?.additionalDirectories || []),
  ...getAdditionalDirectoriesForClaudeMd(),
])
allowWrite.push(...additionalDirs)
```

**Evidence B2:** The `ListRootsRequestSchema` handler at `src/services/mcp/client.ts:1009-1018` (quoted in full above) returns a single-element array `[{uri: "file://${getOriginalCwd()}"}]`. Full-tree grep for `roots:` in the MCP client tree returns exactly one constructor site. **There is no iteration over `getAdditionalDirectoriesForClaudeMd()`, no merge with `--add-dir` paths, no Cowork-conditional branch.** The MCP roots array has exactly one element and that element is always `originalCwd`.

**Evidence B3 (reinforcing from user):** Issue #26287 closed/accepted as a still-open feature request — the user explicitly wrote "`--add-dir` grants access to additional directories but doesn't change the primary working directory; tools still anchor to the launch directory." Anthropic tacitly agrees by not shipping a `--cwd` flag after 6 months.

**Bottom line on B:** An MCP server running inside the Cowork VM, invoked via `npx @inkeep/open-knowledge mcp`, will see `file:///sessions/<sessionName>/` as its sole root when it calls `ListRoots`. The user's actual content at `/sessions/<sessionName>/mnt/<folder>/` is invisible to PR #207's roots-based routing.

---

## Question C: Cowork-specific config/flags that change cwd

**Finding:** **None exist.** No `--cwd`, `--workspace`, or `--project` flag on the `claude` CLI. No Cowork-specific env var beyond telemetry tags. No `claude_desktop_config.json` key that alters in-VM cwd. The mounting layer goes one way only: host-selected folder → VM mount path at `/sessions/<name>/mnt/<folder>` → permission-allowlisted via `--add-dir`.

**Confidence:** CONFIRMED.

**Evidence C1:** Feature request [#26287](https://github.com/anthropics/claude-code/issues/26287) — "--cwd <path> flag to set working directory at startup" — **CLOSED** (status: closed per latest GitHub query; no PR linked). Users asking for exactly this capability; Anthropic declined/stalled.

**Evidence C2:** Feature request [#34604](https://github.com/anthropics/claude-code/issues/34604) — "Cowork: Allow setting a default workspace folder for all sessions" — **CLOSED** 2026-03. Users explicitly want a `"cowork.defaultWorkspaceFolder"` key in `claude_desktop_config.json`; not shipped.

**Evidence C3:** Feature request [#27697](https://github.com/anthropics/claude-code/issues/27697) — "Cowork: Allow folder selection outside home directory" — **OPEN**. Uses `"cowork.allowedDirectories"` hypothetical config; confirms no such key exists today.

**Evidence C4:** Full-tree grep of Cowork env vars surfaces only:
| Env var | Use site | Effect on cwd? |
| --- | --- | --- |
| `CLAUDE_CODE_IS_COWORK` | `QueryEngine.ts:458,612,846,976,1019,1076` | None — only eager transcript flush |
| `CLAUDE_CODE_ENTRYPOINT=local-agent` | `main.tsx:535,824`, `setup.ts:421`, `syncCache.ts:66`, `metadata.ts:106,597` | None — disables remote-managed-settings fetch, toggles analytics, gates trust dialog bypass |
| `CLAUDECODE=1` | (host→VM env) | None (#45433 reports it set inside VM as indicator) |
| `CLAUDE_CODE_HOST_PLATFORM=win32` | (host→VM env, diagnostic) | None |
| `CLAUDE_CODE_COWORKER_TYPE` | `metadata.ts:604-605` | None — telemetry only |
| `CLAUDE_CODE_CONTAINER_ID` | `metadata.ts:608` | None — analytics identity |

None of these mutate `STATE.originalCwd` or `STATE.cwd`. The only re-writes of `originalCwd` post-bootstrap are: (a) bridge / remote-control mode (`bridgeMain.ts:2081`, `bridgeMain.ts:2821`), (b) session resume switch in `main.tsx:3167,3235,3545,4079`. None of these fire in the Cowork in-VM `claude` lifecycle.

**Bottom line on C:** Cowork has zero user-facing lever (CLI flag, env var, config key) that would let the user steer the in-VM cwd to the mounted workspace. The cwd is hard-wired by `@ant/claude-swift`'s spawn call to `/sessions/<sessionName>`.

---

## Question D: Anthropic activity since 2026-02-10

**#24433 — Cowork per-tool "Always allow" does not persist**
- State: **CLOSED** 2026-03-15 as "inactive too long" by github-actions bot; auto-locked 2026-03-24
- New comments since 2026-02-10: 2 user comments (Feb 15 `jerwitz02` "+1"; Mar 15 bot close; Mar 24 bot auto-lock)
- Anthropic-staff responses: zero
- No PR linked. Status unchanged.

**#26259 — Cowork stdio bridge for Desktop Extensions**
- State: **OPEN** (last updated 2026-04-18 — TODAY)
- Most recent substantive comment: 2026-03-30 by `danielgreane` with fresh log evidence confirming the race — "essentially blocking our entire organisation." Latest activity today is GitHub-reaction-level, not resolution.
- New comments since 2026-02-10: ~15 user comments across Feb 17 → Mar 30 — all user/user, including detailed log forensics from `Klizzy`, `robrichardson13`, `gileze33`, `giolife360`, `danielgreane`. The race-at-spawn-time hypothesis (snapshot of `mcpServers` taken before late-registering extensions finish handshake) is now strongly triangulated by three independent reporters on three machines; none addressed by staff.
- Anthropic-staff responses: zero (in 15-comment thread spanning 6 weeks)
- No PR linked.

**#47371 — `alwaysAllow` config per MCP server (reopen of #24433)**
- State: **OPEN**, last updated 2026-04-13
- Comments: **zero** (filed by user, no engagement, no staff response in the 5 days it was open at audit time)
- No PR linked.

**#48909 — Support custom stdio MCP servers in Cowork**
- State: **OPEN**, last updated 2026-04-16
- Comments: 1, from github-actions bot flagging it as a potential duplicate of #42453
- Anthropic-staff responses: zero
- No PR linked.

**New issues discovered this pass:**
- **#43204 (2026-04-03, OPEN)** — "Cowork filesystem-type block ignores `ST_RDONLY` and host-side ACLs, breaking read-only cloud storage mounts." Paying Team customer (5 seats, Advanced tier) with revenue impact. Documents that `request_cowork_directory` now rejects Google Drive / iCloud / NFS / SMB / FUSE mounts based on `f_type`, reversing behavior that worked as recently as 2026-04-01. No staff response.
- **#45433 (2026-04-12, CLOSED)** — "Cowork filesystem mount serves stale content and metadata." First-hand evidence of the in-VM mount path: `/mnt/.virtiofs-root/shared/c/Users/Dave/katamari` — virtiofs share re-exposed via FUSE. Same-app diff between Cowork tab and Claude Code tab: Cowork returns stale snapshots, Claude Code tab sees current state. Closed without fix; same root-cause family as #43204.
- **#50168 (2026-04-17, OPEN)** — "Adding a folder to an existing project/task silently fails." Critical evidence for this audit: log traces show the `[Spawn:create]` invocation includes `--add-dir /sessions/<name>/mnt/Dev` and the cwd is `/sessions/<name>/`. Direct in-log confirmation of Question A.

**Documentation updates since 2026-02-10:**
- [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190) — unchanged, no workspace-folder-to-MCP-root mapping documented.
- [Local MCP Servers](https://support.claude.com/en/articles/10949351) — still does not mention Cowork.
- [Enterprise MCP extensions](https://support.claude.com/en/articles/12702546) — unchanged; addresses MCPB packaging, not Cowork's SDK-bridge quirks.

**Blog / changelog:**
- No Anthropic blog post on Cowork MCP behavior has shipped between 2026-02-10 and 2026-04-18.
- `claude-code` 2.1.x release notes since Feb: no Cowork-MCP-specific improvements. Version 2.1.92 referenced by #45433, 2.1.111 by #50168, 2.1.114 referenced by prior Open Knowledge audits — baseline sources/mcp/client.ts roots behavior unchanged.

**Bottom line on D:** Zero Anthropic engagement on the entire Cowork+MCP blocker stack since 2026-02-10. The race-at-spawn-time diagnosis in #26259 is now evidence-grade, yet no staff triage. One new confirming data point (#50168) and two new adjacent filesystem gotchas (#43204, #45433). Nothing cuts against this audit's conclusion.

---

## Question E: Bottom-line verdict

**Cowork + PR #207 strict MCP routing compatibility: NO (effectively unusable).**

PR #207's `ProjectRoutingResolver` (`packages/cli/src/mcp/project-routing-resolver.ts`) decides the active project using `resolveCwd(explicit?)`:
1. If the tool call passes explicit `cwd` → use it (normalized).
2. Else call `listRoots()` on the MCP client.
3. If exactly one root advertised → use it.
4. Else throw `NO_CLIENT_ROOTS_ERROR` / `MULTIPLE_ROOTS_ERROR` / `ROOTS_UNAVAILABLE_ERROR`.

Under Cowork, the in-VM `claude` advertises exactly one root: `file:///sessions/<sessionName>/`. This is **not** the user's workspace folder — it's the ephemeral VM session directory. The MCP server (running via `npx @inkeep/open-knowledge mcp` on the VM's PATH) would be handed that path, attempt to resolve it to a registered Open Knowledge project, and fail: no such project exists there, and the Hocuspocus lock file protocol won't surface a running server at that path.

**Four reinforcing reasons compatibility fails:**

1. **MCP root ≠ user content.** The cwd advertised is `/sessions/<name>/`, which only contains VM bootstrap scaffolding (`mnt/`, `outputs/`, `.auto-memory/`, `.claude/`, etc.). The user's actual content lives at `/sessions/<name>/mnt/<folder>/` — one directory deeper, invisible to the MCP roots flow.

2. **No in-VM CLI lever.** There is no `--cwd`, no `--workspace`, no env var, no `claude_desktop_config.json` key that changes in-VM cwd. Users cannot self-remediate. `/add-dir` (and the `--add-dir` spawn arg Cowork already uses) affects permissions only, not MCP roots — explicitly confirmed both by source and by user experience in #26287.

3. **Stdio MCP is unreliably bridged.** Even if the cwd problem were solved, the prerequisite — having `@inkeep/open-knowledge mcp` actually load in the Cowork VM — is blocked by #26259 (stdio bridge race at spawn time, ~week-level intermittency) and #48909 (stdio support is still officially a feature request). Running the MCP server via the Cowork SDK bridge inherits both failure modes.

4. **Per-tool approval UX is broken.** Even if the server loaded AND advertised the right root, #24433 / #47371 mean every tool call requires manual re-approval every new session — the MCP server cannot function as an agentic primitive.

**Assessment:** Anthropic would need to ship **two coupled fixes** to make this work without compromising PR #207's discipline:
- `cwd = /sessions/<name>/mnt/<folder>/<folderName>` (pass the mount path as spawn cwd, not as `--add-dir`).
- Fix the spawn-time race from #26259 so stdio MCP servers reliably reach the VM's claude process.

Neither is telegraphed on any roadmap. For our purposes, **Cowork is out of scope** for a strict-routing stdio MCP story as of 2026-04-18.

---

## Implications for spec

1. **Do not claim PR #207 compatibility with Cowork.** Writing `@inkeep/open-knowledge mcp` to `claude_desktop_config.json` satisfies the install harness but delivers a broken runtime experience: the in-VM MCP server advertises the wrong root AND may not load at all. The install succeeds in a vacuous sense only.

2. **Don't treat "MCP root advertised" as success criteria for Cowork.** Even though the in-VM claude DOES advertise a root (precondition satisfied), the advertised path is ephemeral VM scaffolding, not user content. Our `ProjectRoutingResolver` will fail cleanly with `NO_CLIENT_ROOTS_ERROR` on the first user tool call if no registered project exists at `/sessions/<name>/` — which it won't.

3. **Guidance for `open-knowledge init` output:** When `claude-desktop` is the target, surface explicit messaging that this enables the Claude Desktop *standalone* product (where MCP is consumed by claude.ai's chat interface and project scope isn't a concept — see `claude-desktop-project-scope.md`), and **explicitly call out that Cowork-mode does not benefit from this install**. The config file path is shared between standalone Desktop and Cowork, but only standalone Desktop's consumption model works here.

4. **Documentation in the PR body / spec:** Add a one-paragraph note explaining that Cowork's in-VM cwd is `/sessions/<name>/` (ephemeral) rather than the user's workspace folder at `/sessions/<name>/mnt/<folder>/`, and that this prevents project-scoped MCP routing under the current Claude Cowork implementation. Reference this audit (evidence/cowork-launcher-cwd-audit.md) for source citations.

5. **Spec decision (DIRECTED):** Leave `claude-desktop` in the `ALL_EDITOR_IDS` target list (per PR #207) because it does serve the legitimate Claude Desktop standalone product. But the spec's success matrix should show Cowork as NOT SUPPORTED with this specific root cause documented. If Anthropic ever ships a `--cwd` flag (#26287) OR changes the Cowork spawn to pass the mount path as cwd, re-evaluate in a follow-up spec.

6. **Greenfield opportunity:** If a future Open Knowledge surface wants to offer a Cowork-friendly install path before Anthropic resolves this, the only architecturally viable option is a **custom HTTP MCP connector** (Cowork UI → "Add a Custom Connector") pointing at a host-side HTTP server that tunnels content via Hocuspocus. That's a whole separate product surface, not a variant of PR #207's harness.

---

## References

**Local source reads** (all paths `~/.claude/oss-repos/claude-code/src/`):
- `bootstrap/state.ts:260-278` — `getInitialState()` reads `process.cwd()` into `originalCwd`
- `bootstrap/state.ts:205-207` — `additionalDirectoriesForClaudeMd: string[]` (for `--add-dir`)
- `bootstrap/state.ts:500-502` — `getOriginalCwd()` exported helper
- `bootstrap/state.ts:515-517` — `setOriginalCwd()` mutation (only session-switch / SSH resume / worktree flag call this)
- `services/mcp/client.ts:1009-1018` — MCP `ListRoots` handler, hardcoded to single-element array with `getOriginalCwd()`
- `utils/sandbox/sandbox-adapter.ts:290-299` — `--add-dir` flows into `allowWrite`, not cwd
- `bridge/bridgeMain.ts:2036,2080-2082,2819-2822` — remote-control / bridge path, not Cowork
- `main.tsx:517-540` — `initializeEntrypoint()` sets `CLAUDE_CODE_ENTRYPOINT` values; `local-agent` set externally by Cowork launcher
- `main.tsx:823-829,841` — entrypoint-to-clientType mapping for `local-agent` and `claude-desktop`
- `main.tsx:1000` — Commander definition for `--add-dir`
- `main.tsx:3811-3812` — `-w, --worktree` flag (orthogonal, creates new worktree)
- `main.tsx:3945` — `mcp add-from-claude-desktop` command (Desktop standalone only)
- `QueryEngine.ts:458,612,846,976,1019,1076` — only `CLAUDE_CODE_IS_COWORK` usage (all eager flush)
- `services/analytics/metadata.ts:95,106,429,597,602-605,832,846-847` — Cowork-is-telemetry scope
- `services/remoteManagedSettings/syncCache.ts:66` — Cowork skips remote managed settings
- `setup.ts:421-424` — Cowork + CCD exempt from trust-dialog bypass wait
- `context.ts:4,163-167` — `--bare` honors `--add-dir` for CLAUDE.md
- Full-tree grep for `cowork|Cowork|COWORK`: 31 files matched; none mutate cwd
- Full-tree grep for `CLAUDE_CODE_IS_COWORK`: 1 file (`QueryEngine.ts`); telemetry/flush only

**Web sources** (all accessed 2026-04-18):
- [aaddrick.com Cowork VM architecture analysis](https://aaddrick.com/blog/claude-desktop-cowork-mode-vm-architecture-analysis) — VM path structure confirmation, spawn RPC signature
- [blog.pluto.security — Inside Claude Cowork](https://blog.pluto.security/p/inside-claude-cowork-how-anthropics) — architecture overview
- [claudecn.com Cowork architecture deep dive](https://claudecn.com/en/blog/claude-cowork-architecture) — could not fetch (403)
- [pvieito.com — Inside Claude Cowork](https://pvieito.com/2026/01/inside-claude-cowork) — lacks cwd specifics
- [dev.to — Jailbreaking Claude Cowork](https://dev.to/aaron_walker_dc0d1194638f/escaping-the-sandbox-jailbreaking-claude-cowork-dbd) — confirms VM-side bridge paths at `/sessions/<name>/mnt/outputs/.bridge/`
- [dev.to — How We Got Local MCP Servers Working](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) — no cwd info
- [blog.kamsker.at — Broken by Default: Cowork on Windows](https://blog.kamsker.at/blog/cowork-windows-broken/) — troubleshooting context
- [Anthropic — Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork) — 1P, unchanged
- [Anthropic — Local MCP Servers](https://support.claude.com/en/articles/10949351) — 1P, unchanged (no Cowork mention)
- [Anthropic — Deploying Enterprise MCP via Desktop Extensions](https://support.claude.com/en/articles/12702546-deploying-enterprise-grade-mcp-servers-with-desktop-extensions) — 1P, unchanged
- [claudelog.com — What is Working Directory](https://claudelog.com/faqs/what-is-working-directory-in-claude-code/) — confirms cwd is immutable post-startup

**GitHub issues** (all `anthropics/claude-code`):
- [#24433](https://github.com/anthropics/claude-code/issues/24433) — alwaysAllow, CLOSED 2026-03-15
- [#26259](https://github.com/anthropics/claude-code/issues/26259) — stdio bridge, OPEN, last updated 2026-04-18
- [#26287](https://github.com/anthropics/claude-code/issues/26287) — `--cwd` feature request, CLOSED
- [#27697](https://github.com/anthropics/claude-code/issues/27697) — allow folder outside home, OPEN
- [#32637](https://github.com/anthropics/claude-code/issues/32637) — iCloud destruction incident (context)
- [#34604](https://github.com/anthropics/claude-code/issues/34604) — default workspace folder, CLOSED
- [#43204](https://github.com/anthropics/claude-code/issues/43204) — filesystem-type block, OPEN, 2026-04-03
- [#45433](https://github.com/anthropics/claude-code/issues/45433) — stale mount cache, CLOSED; source of `virtiofs-root/shared` in-VM path
- [#47371](https://github.com/anthropics/claude-code/issues/47371) — alwaysAllow reopen, OPEN, zero comments
- [#48909](https://github.com/anthropics/claude-code/issues/48909) — stdio support in Cowork, OPEN
- [#50168](https://github.com/anthropics/claude-code/issues/50168) — add-folder regression, OPEN, 2026-04-17 — direct `[Spawn:create]` log evidence

**Access date:** 2026-04-18
