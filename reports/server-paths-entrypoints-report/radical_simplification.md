The real simplification levers (descending leverage)

1. Collapse distribution to one channel. Kill npx and npm i -g. Single standalone installer — curl | sh → \~/.ok/bin/ok, like deno/rustup/bun. Bun can emit a self-contained single-file executable; no Node dependency on user machines. Auto-update via ok
   self-update. One install path ⇒ \~one version on a machine ⇒ drift is structurally hard to produce.

2. Desktop stops bundling a server. DMG becomes a UI shell that requires the CLI. First launch installs the CLI if missing; every launch does spawn('ok', ['start']) and points a window at it. Desktop and CLI become the same runtime, not two runtimes
   that handshake. Kills the DMG-vs-CLI version split entirely.

3. MCP: one HTTP server, many editor clients. Instead of each editor config spawning its own stdio child (npx ... mcp), each editor connects over HTTP/SSE to the single running ok start. The ok init-written configs become \{url:
   \&#x20; "http\://localhost:NNNN/mcp"} pointing at the one server (need to sort out port discovery, but that's a much smaller problem than cross-version spawning). The per-editor stdio child is the drift generator; make it a client, not a child.

4. Additive-only on-disk and wire formats. Never remove or repurpose fields. Old and new are always compatible because "incompatible" is defined out of existence. Obsoletes most of the version-gate logic.

Levers 1+2 together obsolete the desktop↔CLI handshake, the kill-and-restart dialog, the direction-asymmetric refuse, executablePath in the lock, describeLockHolder, most of §6.3/§6.4 of your spec. Your three-authorities framing survives — the machinery
between them shrinks dramatically.

The single discriminating question

Must the DMG be an offline-capable, self-sufficient install requiring zero prior setup (Mac-App-Store-like UX)?

- Yes → DMG must bundle a runtime → cross-install surface is inherent → your current spec is load-bearing and should ship roughly as written.
- No → DMG is a UI shell over the CLI → levers 1+2 apply → maybe half the spec evaporates.

Secondary, only if the answer is No: verify every target MCP client (Claude Desktop, Cursor, Windsurf, Codex, VS Code) actually supports an HTTP/SSE transport in its config schema — if any are stdio-only, that editor still spawns a child and lever 3
only covers the rest.

What I'd ask you to decide before we go further

Answer the DMG question. Everything downstream falls out of it. If DMG-self-sufficiency is a must-have product positioning bet, the spec you wrote is the right answer and we should ship it. If it isn't — and "greenfield, nothing in the wild" suggests
you can still choose — then levers 1+2 are where the radical simplification lives, and \~70% of the spec becomes vestigial. That's a prize, not a loss.

✻ Worked for 3m 44s

※ recap: Goal: radically simplify the cross-install version-drift surface before shipping. I flagged that your two meeting ideas only manage the distributed system, laid out four real simplification levers, and asked the one discriminating question. Next:
answer whether DMG must be offline-capable self-sufficient. (disable recaps in /config)

❯ /status
⎿  Status dialog dismissed

❯ /effort
⎿  Set effort level to max (this session only): Maximum capability with deepest reasoning

❯ /model
⎿  Set model to Opus 4.7 (1M context)

❯ what are the different user stories for the DMG fork-in-the-road?

⏺ Before I enumerate, one correction to my earlier framing: it's actually a three-way fork, not two. There's a middle path I conflated with the "No" branch.

The three paths

Path A — Self-contained DMG (current + your spec). DMG bundles its own server and forks utilityProcess. CLI and DMG are independent entities with independent version streams. Your spec's handshake is load-bearing.

Path B — DMG installs a CLI on first launch, then spawns it. DMG payload contains the CLI binary. First launch copies ok to \~/.ok/bin/ (or /usr/local/bin/ok via M6-style shim). Desktop is a thin window over ok start — same binary terminal users run. One
update channel: ok self-update.

Path C — DMG requires prior CLI install. User runs curl | sh first, then DMG. Desktop refuses to launch if CLI not on PATH.

User stories where the paths diverge

1. Non-technical Mac user downloads DMG, nothing else installed

- A: Drag to Applications → launch → works. Zero setup.
- B: Drag → launch → brief "initializing" → works. Identical from user POV; under the hood \~/.ok/bin/ok got laid down.
- C: Drag → launch → "CLI not found, run curl ... in a terminal." Lost this user.

2. Dev installed DMG, now wants MCP in Claude Code

- A: Either ok init via M6's bundled-CLI shim, OR installs a separate CLI via npm. Two ways → potential version split.
- B: CLI is already on disk from DMG install. ok init writes its absolute path. Same binary as desktop. Zero drift surface.
- C: Same as B — CLI is the prereq.

3. User edits a project from DMG and from terminal in the same session

- A: DMG v1.5 vs global CLI v2.0 → your kill-and-restart dialog fires.
- B: Both spawn \~/.ok/bin/ok start. Same binary, same version — impossible to drift. Second invocation just collides on the lock (existing ServerLockCollisionError).
  ⎿  Set model to Opus 4.7 (1M context)

❯ what are the different user stories for the DMG fork-in-the-road?

04:46 PM claude-opus-4-7
⏺ Before I enumerate, one correction to my earlier framing: it's actually a three-way fork, not two. There's a middle path I conflated with the "No" branch.

The three paths

Path A — Self-contained DMG (current + your spec). DMG bundles its own server and forks utilityProcess. CLI and DMG are independent entities with independent version streams. Your spec's handshake is load-bearing.

Path B — DMG installs a CLI on first launch, then spawns it. DMG payload contains the CLI binary. First launch copies ok to \~/.ok/bin/ (or /usr/local/bin/ok via M6-style shim). Desktop is a thin window over ok start — same binary terminal users run. One
update channel: ok self-update.

Path C — DMG requires prior CLI install. User runs curl | sh first, then DMG. Desktop refuses to launch if CLI not on PATH.

User stories where the paths diverge

1. Non-technical Mac user downloads DMG, nothing else installed

- A: Drag to Applications → launch → works. Zero setup.
- B: Drag → launch → brief "initializing" → works. Identical from user POV; under the hood \~/.ok/bin/ok got laid down.
- C: Drag → launch → "CLI not found, run curl ... in a terminal." Lost this user.

2. Dev installed DMG, now wants MCP in Claude Code

- A: Either ok init via M6's bundled-CLI shim, OR installs a separate CLI via npm. Two ways → potential version split.
- B: CLI is already on disk from DMG install. ok init writes its absolute path. Same binary as desktop. Zero drift surface.
- C: Same as B — CLI is the prereq.

3. User edits a project from DMG and from terminal in the same session

- A: DMG v1.5 vs global CLI v2.0 → your kill-and-restart dialog fires.
- B: Both spawn \~/.ok/bin/ok start. Same binary, same version — impossible to drift. Second invocation just collides on the lock (existing ServerLockCollisionError).
- C: Same as B.

4. Updates

- A: Two channels — DMG auto-updates (electron-updater), CLI auto-updates (npm i -g or ok self-update). Can diverge silently.
- B: One channel — ok self-update. DMG's "Check for Updates" invokes it. No divergence possible.
- C: Same as B.

5. Try-before-install

- A: npx @inkeep/open-knowledge start — zero commitment.
- B/C: Need a parallel sh <(curl ...) story, or publish to npm in parallel anyway (reintroduces a channel).

6. Corporate machine where IT restricts shell scripts

- A/B: DMG is a signed app → IT-approved. Writes to user-home, no sudo.
- C: curl | sh typically blocked. Lost user or needs workaround.

7. Future: Mac App Store distribution

- A: MAS-compatible; app is self-contained.
- B/C: Forbidden. Sandboxed apps can't write executable binaries outside their container.

8. CI / headless

- A/B/C: All workable via the CLI directly. A has the convenience of npm availability; B/C require a release-binary download.

What the stories actually reveal

The tension isn't "simplicity vs. complexity" — it's a specific set of capabilities:

┌──────────────────────────────────────────────┬─────┬─────┬─────┐
│                  Capability                  │  A  │  B  │  C  │
├──────────────────────────────────────────────┼─────┼─────┼─────┤
│ Offline DMG install                          │ ✅  │ ✅  │ ❌  │
├──────────────────────────────────────────────┼─────┼─────┼─────┤
│ Zero-terminal Mac user journey               │ ✅  │ ✅  │ ❌  │
├──────────────────────────────────────────────┼─────┼─────┼─────┤
│ Single-runtime invariant (no handshake spec) │ ❌  │ ✅  │ ✅  │
├──────────────────────────────────────────────┼─────┼─────┼─────┤
│ npx try-before-install                       │ ✅  │ ❌\* │ ❌\* │
├──────────────────────────────────────────────┼─────┼─────┼─────┤
│ Future Mac App Store path                    │ ✅  │ ❌  │ ❌  │
└──────────────────────────────────────────────┴─────┴─────┴─────┘

\*Unless CLI is ALSO published on npm — which reintroduces a distribution channel and re-opens the drift surface.

Path B dominates A on every story except MAS distribution and npx try-it. If those two are not strategic, Path B is the sweet spot: you keep the "click DMG, it works" user journey and throw away the distributed-system handshake architecture. Path C is
Path B minus the zero-terminal story, in exchange for killing one distribution artifact entirely.

The real question to take to the meeting isn't "is DMG self-sufficient" — it's "do we ever want to ship to the Mac App Store, and do we care about preserving npx as the try-it path?" Answer those two and the path selects itself.

## Lever 3 feasibility audit

**Context.** Lever 3 proposes replacing each editor's stdio MCP child (`npx @inkeep/open-knowledge mcp`) with a direct HTTP/SSE connection to the running `ok start` server. If viable, this eliminates the cross-version drift surface entirely: there is no spawned child to disagree with the server on protocol version. [[specs/2026-04-24-cross-install-version-handshake/SPEC.md]]'s G6 and G7 become structurally unnecessary.

**The core blocker.** `ok start` binds to a random free port each boot. Editor MCP configs (written by `ok init`, built by `buildManagedServerEntry` in `packages/cli/src/commands/editors.ts`) persist connection strings to disk. A fixed URL like `http://localhost:NNNN/mcp` goes stale on the next server restart in exactly the same way pinned stdio paths do. Four escape hatches were evaluated.

---

### Escape hatch 1 — stdio→HTTP shim

**Verdict: VIABLE-WITH-SHIM.**

The editor config stays `{ command: ..., args: ['mcp'] }` (stdio). The spawned child is a thin shim — roughly 50 lines — that reads `server.lock` to find the live port and proxies stdin/stdout to `http://localhost:{port}/mcp`. The shim carries no MCP protocol logic; it just pipes bytes. This is architecturally what `ok mcp` already does, except today's `ok mcp` is a full MCP implementation that speaks the protocol itself. A proxy shim has no protocol surface to drift on.

**What this changes vs. today:** G6's `protocolVersion` comparison shrinks to a liveness check ("is the server's port alive"). The complex mismatch-diagnostic machinery in `decideAutoStart` (`server-discovery.ts`) is replaced by "exit 1 with 'server not running'". G7 (`--pin`) still exists for the shim binary, but a shim that reads a lock file and proxies HTTP is so stable it almost never needs updating — the pin risk is near-zero. `buildManagedServerEntry` still returns a stdio entry; only the binary changes.

**Remaining drift surface:** the shim binary itself. A stale shim that just pipes bytes is nearly harmless compared to a stale MCP implementation speaking an evolved protocol. The surface shrinks from "full protocol compatibility" to "can the shim find and read `server.lock`" — a contract that essentially never needs to bump.

---

### Escape hatch 2 — Unix domain socket at a fixed well-known path

**Verdict: MIRAGE.**

`ok start` could bind to `<contentDir>/.open-knowledge/mcp.sock` (stable across restarts, same path discipline as `server.lock`). The path never changes for a given content directory. However, no MCP client in the target set — Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex — natively supports a Unix socket transport URI. All six editors' MCP config schemas accept `command`/`args` (stdio) or `url` (HTTP). A `unix://` URI would be rejected at parse time or silently ignored. Reaching the socket requires a shim, which puts you back at escape hatch 1.

---

### Escape hatch 3 — Fixed well-known port (e.g. 45678)

**Verdict: MIRAGE for multi-project use.**

A fixed port eliminates the stale-URL problem: editor configs point to `http://localhost:45678/mcp` permanently. Single-project machines are fine. The collision story for multiple simultaneous projects is fatal: two `ok start` processes on one machine fight for the same port; the second startup fails or the first is displaced. A per-user MCP gateway on 45678 that routes to the correct per-project server by path prefix or `cwd` header is technically possible but adds more infrastructure than the problem requires. Not viable as a v1.1 path.

---

### Escape hatch 4 — Lock-file port advertisement + client re-probe

**Verdict: VIABLE-WITH-SHIM** (structurally identical to escape hatch 1).

The editor config points to a shim; the shim reads `server.lock` at invocation time, recovers the current port, and connects. This is escape hatch 1 described from the client side rather than the server side. `server.lock` already records the live port and pid (`ProcessLockMetadata` in `packages/server/src/standalone.ts`); no new server-side mechanism is needed. The shim's auto-start path — spawning `ok start` if no live lock is found — is a simplified version of what `ensureServerRunning` does today.

---

### Overall verdict: VIABLE-WITH-SHIM

HTTP MCP is a credible v1.1 path but not the clean "no child process" story Lever 3 implies. Port discovery requires a thin stdio shim for all six target editors today. The simplification is real and meaningful:

| Concern                    | Today (full `ok mcp` child)                                    | With HTTP shim                    |
| -------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Protocol drift surface     | Full MCP implementation in the child                           | Zero — shim has no protocol logic |
| G6 complexity              | `protocolVersion` comparison, mismatch diagnostics, exit codes | "Is port alive?"                  |
| G7 (`--pin`) criticality   | High — pinned binary must match server protocol                | Near-zero — shim is a stable pipe |
| Lines of version-gate code | \~200 LOC across `server-discovery.ts`                         | \~10 LOC                          |
| Child binary upgrade path  | Must align with server `protocolVersion`                       | Essentially never needs updating  |

**G6 and G7 are not fully obsoleted — they shrink.** The shim still needs to be distributed and can go stale if the lock-file schema changes, but the lock-file schema is governed by additive-only rules (Lever 4) and has no protocol version to negotiate.

**If any target editor adds native HTTP MCP support** (VS Code's `servers` schema already has a `type` field; Claude Code has been moving toward HTTP transport), the shim can be dropped for that editor and G6/G7 become dead code for it. The shim is a bridge, not a permanent fixture.

**What to do next.** Implement `ok start` serving MCP at `/mcp` over Streamable HTTP. Build the thin lock-file-reading shim as the default `buildManagedServerEntry` target. Let per-editor HTTP config entries (`{ url: "http://localhost:{port}/mcp" }`) phase in as editors ship native HTTP MCP support. G6/G7 can be deprecated (not deleted) once the shim is the default — the protocol-gate logic only fires for users still on the old full-`ok-mcp` path.
