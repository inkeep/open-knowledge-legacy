# Design challenge findings

Scope: cold read of SPEC.md + evidence/ + baseline code at `ee1fc3af`. Baseline checks:
- `packages/cli/src/commands/editors.ts` (4 targets; Windsurf already `scope: 'global'`)
- `packages/cli/src/commands/init.ts:253-312` (`writeEditorMcpConfig`, fixed `MCP_SERVER_NAME`)
- `packages/cli/src/commands/mcp.ts:288-327` (`mcp` command — `projectDir = process.cwd()`)
- `~/.codeium/windsurf/mcp_config.json` (live read — see C1 below)
- `~/Library/Application Support/Claude/claude_desktop_config.json` (live read — matches evidence)
- MCP docs at `modelcontextprotocol.io/quickstart/user` (confirms restart requirement)

---

## Challenges that merit user review

### C1. The Windsurf precedent is load-bearing and the spec ignores it

**Challenge.** The spec frames Claude Desktop as the first editor target with `scope: 'global'` and multi-project needs. It is not. **Windsurf is already `scope: 'global'`** (`packages/cli/src/commands/editors.ts:71`) and writes to `~/.codeium/windsurf/mcp_config.json` — a single global file shared across every project on the machine. The owner's current Windsurf config, read just now, shows exactly the bug D1 claims is unique to Claude Desktop:

```json
// ~/.codeium/windsurf/mcp_config.json (live, 2026-04-17)
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

Two latent bugs the spec doesn't mention:

1. **Silent overwrite across projects** — running `init` inside project B today replaces the key that project A wrote. G2 (no silent overwrite) is already violated on Windsurf; the spec promises G2 only for Claude Desktop while leaving Windsurf broken.
2. **Missing `--cwd` on Windsurf too** — the Windsurf entry has no `--cwd`. `mcp.ts:299` uses `process.cwd()` to resolve the content dir. If Windsurf spawns the MCP server from anywhere other than the active project root (global-config IDEs often use home or the app install dir), the server lands on the wrong content dir or fails identically to Failure 2 in the evidence (`ENOENT: mkdir '/.open-knowledge'`). The owner has not yet hit this only because whichever project they last ran `init` in is "good enough" — until they switch.

The spec's §3 NG2 explicitly defers renaming project-scoped editors' keys, but **Windsurf is not project-scoped**. The NG2 phrasing ("other project-scoped editors") misclassifies Windsurf and thereby declares out-of-scope a case that's actually in-scope by the spec's own G2 rationale.

**Reasoning.** If the project-qualified key + `--cwd` pattern is correct for Claude Desktop (because global config + multi-project), it is correct for Windsurf by the same argument. Shipping it for one of two global-scope editors creates an asymmetry the user will discover the next time they switch Windsurf projects — and the fix shape will already exist in the codebase, making the omission feel arbitrary.

**Options:**
- A) **Current spec approach** — ship Claude Desktop only; Windsurf deferred to NG2 (misclassified).
- B) **Apply the same shape to Windsurf now** — any `scope: 'global'` target gets project-qualified key + `--cwd` via `resolveServerKey`. One `global-scoped` behavior; one code path. Requires a one-time migration for existing `open-knowledge` Windsurf entries (rename → qualified) or match-by-absence-of-`--cwd` → treat as legacy-hand-crafted → replace, not match. Low risk: owner has exactly one Windsurf entry on one machine.
- C) **Explicitly scope NG2 to confirm Windsurf is excluded with a reason.** If the answer is "Windsurf users haven't reported the collision so defer," say that in NG2 and own the asymmetry.

**Recommendation.** B, with HIGH confidence. The abstraction the spec is already paying for (`resolveServerKey`, `buildEntry(cwd)`) generalizes trivially. Doing it "for Claude Desktop only" leaves the same code introducing a second behavior tomorrow for no reason. If B is too aggressive for this slice, then C (explicit defer with reason) — but A (silent omission) is the weakest option.

---

### C2. Claude Desktop config requires a full restart — the init UX has no affordance for this

**Challenge.** Per MCP's own docs (`modelcontextprotocol.io/quickstart/user`, step 4): *"After saving the configuration file, completely quit Claude Desktop and restart it. The application needs to restart to load the new configuration and start the MCP server."* This is not hot-reload. The spec acknowledges P1's happy path as "5. Open Claude Desktop. A server named `open-knowledge-my-project` appears…" but does not handle the much more common case: the user **already has Claude Desktop open** when they run `init`.

None of §7's success metrics, §9's output format, or §6's FR list mention that init should tell the user to restart Claude Desktop. The four existing editors are hot-reload (Claude Code re-reads `.mcp.json` per session; Cursor/Windsurf reload on config change; VS Code restarts the server on file write). Claude Desktop is the odd one out. Without a clear message, the user runs `init`, sees "registered," tries to use it in their open Claude Desktop window, and nothing happens — this is the worst UX failure mode because it looks like init lied.

**Reasoning.** The spec's §7 Metric 1 ("observable by absence of the two ENOENT errors in MCP logs") assumes the user will eventually hit the log file to check. In practice they'll report "it doesn't work" without having restarted.

**Options:**
- A) **Current spec approach** — no restart affordance. User infers from Claude Desktop docs.
- B) **Stdout line when Claude Desktop is among written editors** — `Claude Desktop: registered — quit and relaunch Claude Desktop to activate.` One conditional line, low implementation cost, high UX impact.
- C) **Interactive-mode post-write prompt** — Clack confirm "Restart Claude Desktop now? (opens macOS `open -a Claude` / Windows equivalent)". Heavier; probably overkill.

**Recommendation.** B, with HIGH confidence. Add an FR: "When Claude Desktop action ∈ `{written, overwritten}`, emit a 'quit and relaunch' hint on the corresponding summary line." Five LOC. Without this, Metric 1 is invisible to a meaningful fraction of users.

---

### C3. "Match by --cwd arg, regardless of key" has fragile corner cases the spec glosses

**Challenge.** FR6 says: "For each existing key starting with `open-knowledge-` in `mcpServers`, if its `args` contains `'--cwd'` immediately followed by a value equal to the current absolute cwd, treat as the existing entry." Four gaps:

1. **The `open-knowledge-` prefix filter is implicit.** Owner's hand-crafted key happens to be `open-knowledge-bim-tools`, but the spec's own §3 NG5 calls out `--desktop-key` as a user-crafted alias deferred to future work. If a user renames the key to `bim-notes` or `inkeep-bim`, FR6's prefix filter silently misses it, creates a second entry `open-knowledge-bim-tools`, and now both fire on Claude Desktop boot — confusing duplication.
2. **Project directory moves.** User moves `~/work/notes` → `~/personal/notes`. Running `init` in the new location finds no matching `--cwd` → creates fresh `open-knowledge-notes` (possibly `-2` on collision). The old entry lingers with a stale `--cwd` that now produces the Failure 1 ENOENT. Spec §14 Risks does not include this; it's reasonably common (laptop setup, directory reorg).
3. **Symlinked project dirs.** Owner's open-knowledge repo is at `/Users/timothycardona/inkeep/open-knowledge`, but a worktree lives at `.claude/worktrees/<name>/`. If the user runs `init` from the worktree, cwd is absolute but points at the worktree. On next run from the main repo, no match → duplicate. Realpath-normalization of `--cwd` before matching would be trivial to add (`realpathSync(cwd)` in both read and write paths).
4. **`args` with two `--cwd` flags (malformed manual edit).** Which wins? `spawn` behavior is arg-parser-dependent — Commander takes the last one, but the spec's matcher takes the first. Divergence between "what Commander will run" and "what init thinks is bound" is a latent foot-gun.

Gap 2 is the most common and the least defended against.

**Options:**
- A) **Ship current FR6 as written.** Accept stale-entry accumulation as user's responsibility.
- B) **Add a GC sweep** — on every `init` to Claude Desktop, scan `open-knowledge-*` entries whose `--cwd` path does not exist on disk; either log a warning "stale entry found: `open-knowledge-foo` points at nonexistent `/path/to/foo` — remove with `--prune`" or (with `--prune` flag) remove them. Spec could make this Could-tier.
- C) **Realpath-normalize on both sides.** `realpathSync(cwd)` when writing and when matching; addresses gap 3 and makes the match predictable.
- D) **Print what matched, on every run.** Low-cost debuggability: the summary line for Claude Desktop includes the matched key: `Claude Desktop: skipped-existing (open-knowledge-bim-tools, --cwd matches)`. Helps users understand whether init found their hand-crafted entry.

**Recommendation.** C + D, MEDIUM confidence on both. B is worth considering at Should tier but adds surface area (`--prune` flag, user-confirmation path). Gap 4 (two `--cwd` flags) is a malformed-input case — rejecting with an explicit error seems right, but not worth paper over in this spec.

---

### C4. Auto-disambiguation silently creates indistinguishable entries

**Challenge.** §5 P2 collision path: "User sees two 'notes' entries in Claude Desktop; mouse-over / inspection of args clarifies which is which." Claude Desktop's server list shows the entry name. The user sees:

```
open-knowledge-notes
open-knowledge-notes-2
```

Both labeled "open-knowledge-notes" in UI chrome (Claude Desktop uses the key verbatim). To disambiguate, the user has to open the config file and read `--cwd`. For a user who's never hand-edited the config (P1), this is a cliff.

§6 FR7 auto-disambiguates to keep init non-interactive (NG3), which is correct. But the output affordance is missing:

```
Claude Desktop: written as open-knowledge-notes-2
  (open-knowledge-notes is taken by --cwd /Users/x/work/notes)
```

One-line hint pointing at the conflict explains "what just happened" without a prompt. `NG3` forbids an interactive prompt; it does not forbid printing a hint.

**Options:**
- A) **Current spec approach** — silent disambiguation with no output hint.
- B) **Print the conflict** — emit a two-line summary when disambiguation fires.
- C) **Use a suffix from a more distinguishing source** — parent-dir basename (`work-notes`, `personal-notes`) instead of numeric `-2`, `-3`. Requires the resolver to know parent basenames and handle the rare conflict on full path. More complex; resolves the UX at the cost of predictability.

**Recommendation.** B, HIGH confidence. It's a 3-LOC addition to the `written` summary line. C (parent-dir suffix) is stronger for UX but opens its own naming fights ("what if the parent is `Users`?") — defer.

---

### C5. `resolveServerKey` abstraction is over-engineered for N=1 and under-engineered for N=2+

**Challenge.** D6 locks `resolveServerKey?: (existingServers, cwd) => {key, existingEntry}` as an optional method. With today's spec, exactly one target (Claude Desktop) implements it; the other four fall back to the default `key = 'open-knowledge'` branch. Two observations:

1. **If C1 is accepted (Windsurf is global-scope with the same problem), two targets implement it.** The abstraction is then right-sized — but only because we widened the slice.
2. **The method signature chooses poorly.** It returns `{key, existingEntry}` — the caller still has to execute the key-assignment branch in `writeEditorMcpConfig`. Compare with moving the ENTIRE write path into the target: `target.applyEntry(existingConfig, cwd, force) => EditorMcpResult`. Targets become fully declarative write-units; the init.ts dispatcher becomes a loop that calls `target.applyEntry(...)` and collects results. No conditional branching for scope-global vs. scope-project.

The spec's D5-D6 rationale ("cleaner than branching in init.ts") is directionally right but stops halfway. `resolveServerKey` separates "which key" from "what entry" from "where to match the existing one" — three knobs for one coherent decision. One method, clearer contract.

**Reasoning.** This is a minor design-surface smell, not a blocker. The spec's current shape is defensible for this change alone. It becomes uncomfortable the moment a third global-scope editor is added (Zed? Cline? Continue?) — each will need its own `resolveServerKey` that mostly duplicates Claude Desktop's logic. Two candidate refactors:

**Options:**
- A) **Current spec approach** — `resolveServerKey` optional; branch in `writeEditorMcpConfig`.
- B) **`applyEntry(existingConfig, {cwd, force}) => EditorMcpResult`** — target owns the full write decision. init.ts becomes a dispatcher.
- C) **Drop the abstraction — branch on `target.scope === 'global'` in `writeEditorMcpConfig`.** Code is 30% shorter and honest about the two behaviors. Cons: adds Claude-Desktop-specific logic to init.ts; blurs the "targets are declarative" principle the spec cites.

**Recommendation.** A, LOW confidence — i.e., keep the spec's current abstraction *if* C1 is not accepted. If C1 is accepted (both global editors use the same path), refactor toward B before a third global editor shows up. Worth a follow-up spec, not a blocker here.

---

### C6. The claude-ai web connector deferral is under-evidenced (Q2)

**Challenge.** §11 Q2 flags the question of whether `claude-ai` web-app shares `claude_desktop_config.json` on macOS. The evidence points toward yes (`clientInfo.name === 'claude-ai'` in owner's MCP logs). The spec defers Q2 as non-blocking.

Two scenarios with different consequences:

1. **If they share the file.** Then this spec implicitly ships support for claude.ai web too. That's a win worth claiming — and surfaces a question: should init's summary line say "Claude Desktop + claude.ai web: registered" when the user opts into Claude Desktop? If we don't say so, users learn only when they try it in the web app, which would feel like an undocumented bonus (fine, but a missed positioning moment).
2. **If they don't share the file** (or only partially — e.g., the web app pulls from a different key shape, or a subset of entries). Then we've shipped a partial solution for a surface we named in §1, and the "Claude Desktop" label becomes misleading.

The Failure 1 MCP log in `evidence/claude-desktop-shape.md` is from the `claude-ai` client (log identifies itself that way), not from Claude Desktop's desktop app. The spec conflates the two as "same surface." If they diverge, the spec's own motivating evidence is from a surface the spec doesn't officially support.

**Options:**
- A) **Current spec approach** — defer Q2 as non-blocking.
- B) **Block on Q2 verification** — 5 minutes of probe work (register in `claude_desktop_config.json`, open claude.ai web with a fresh session, check if the open-knowledge server shows up). If yes, claim it. If no, split into two specs.
- C) **Rename the editor target `claude-local`** to cover both surfaces honestly. Avoids implying only the desktop app.

**Recommendation.** B, MEDIUM confidence. The verification cost is trivial; the labeling clarity from knowing the answer is high. If the user has already verified yes (the "pending confirmation" in evidence suggests informal verification), state it explicitly in §1 and own the scope.

---

### C7. Basename sanitization (A1) is more load-bearing than HIGH-confidence implies

**Challenge.** A1 says `path.basename(cwd)` produces a legal `mcpServers` key component with HIGH confidence. Three edge cases that are not rare:

1. **Worktree paths.** `.claude/worktrees/foo-branch/` → basename `foo-branch`. Two simultaneous worktrees of the same base project collide on basename, requiring disambiguation `-2`. This is the exact P2 multi-project case but arising from a single logical repo.
2. **Shallow paths.** `cd ~ && init` → basename `<username>` (e.g., `timothycardona`). User probably didn't intend to scope Open Knowledge to their entire home dir, but init will happily register it.
3. **Whitespace / unicode in basenames.** "My Project" on macOS Finder-created dirs — legal in JSON keys but creates a key with a space (`open-knowledge-My Project`). Commander-level args parsing downstream treats quoted strings fine, but a user reading the config thinks it's broken. Trivial fix: normalize to kebab-case (`my-project`).

The spec's §15 Noted mentions basename sanitization as "if a project dir has JSON-hostile chars (very unlikely)." That framing is too passive — it's not JSON-hostility, it's UX-hostility (whitespace keys, emoji dir names, trailing dot dirs).

**Options:**
- A) **Current spec approach** — A1 holds; defer sanitization.
- B) **Kebab-case-normalize the basename** — lowercase, replace non-alphanumeric with `-`, collapse runs, trim. 5 LOC. Loses fidelity to the original dir name but produces predictable keys.
- C) **Warn-and-proceed on non-ideal basenames** — emit a hint "project basename contains spaces; consider renaming the dir" without normalizing.

**Recommendation.** B, MEDIUM confidence. Lowercase-kebab produces canonical-shaped keys that look like the other server names in a config file; fits the spec's §6 FR1 aesthetic better than raw basenames with whitespace.

---

### C8. Testing the Windows path with `home` override + `process.platform` mock is brittle

**Challenge.** FR8 says Windows detection is via `home` override + Windsurf-style convention. But the Windows path branch is `process.env.APPDATA` — an env var, not a homedir-derived path. Tests will need to:

1. Mock `process.platform === 'win32'` — not directly settable in Node; requires `Object.defineProperty` or a test-only indirection.
2. Mock `process.env.APPDATA` — straightforward.
3. The `home` override convention doesn't apply because Windows doesn't use homedir for this path.

Result: test implementation will be non-trivial and potentially fragile across Bun versions. A targetable indirection (e.g., `configPath` accepts `{home, platform, env}` instead of `home` alone, or takes a `getPlatformPath()` function injected for tests) avoids mutating process-level state in tests.

**Options:**
- A) **Current spec approach** — implement Windows branch + add tests that mock `process.platform` and `process.env.APPDATA` directly.
- B) **Split configPath into `macOSConfigPath` + `windowsConfigPath` and a tiny dispatcher** — injectable dispatcher for tests. Cleaner test seams.
- C) **Defer Windows tests (not Windows support)** — ship the Windows branch but cover it via a single "path assembles correctly" unit test; skip the end-to-end FR10 matrix on Windows.

**Recommendation.** C, LOW confidence — spec is fine as drafted; the implementer will learn this the hard way and likely land on C anyway. Call it out now so FR10's "5 tests + additions" estimate doesn't surprise-balloon.

---

## Rejections that hold

- **Option A (§9) — single `open-knowledge` key.** Correctly rejected. G2 demands multi-project; global-file + single key is a straight contradiction.
- **Option B (§9) — fail-on-collision with `--force`.** Correctly rejected for auto-run / non-TTY scenarios. `init` must work without prompts.
- **Option C (§9) — `--desktop-key` override flag.** Correctly deferred. The project-qualified default covers P1 + P2; the flag is pure over-specification in v1.
- **Option E (§9) — keep `buildEntry` nullary, branch in init.ts.** Correctly rejected. Widening the target's signature is a trivial-cost refactor that keeps the declarative pattern intact.
- **NG3 (auto-disambig UX).** Non-interactive behavior is the right default for init. (See C4 for the one-line-hint refinement that doesn't violate NG3.)
- **NG4 (no Linux).** Correct given Anthropic's current platform support; flip if/when they ship.
- **D10 (disambig upper bound = 1000).** Arbitrary but fine; failure mode is "something is very wrong with your config."

## Other observations

- **Naming (`claude-desktop`).** Kebab-case is consistent with the existing `claude | cursor | vscode | windsurf` IDs. FR13 defers aliases (`desktop`, `claude_desktop`) — defensible for v1, but add `cdesktop`? No — too cryptic. Also worth noting: the existing `claude` ID is **Claude Code** (despite the name). This is a pre-existing confusion; adding `claude-desktop` exacerbates it slightly. A future rename of `claude` → `claude-code` would make things tidy but is a 1-way door per the spec's own §16 ASK_FIRST.
- **Metric 1 is not directly observable by init.** "Absence of ENOENT errors in MCP logs" is a post-hoc check in `~/Library/Logs/Claude/mcp-server-<name>.log`. There's no programmatic way for init to verify. Consider adding a "smoke test" flag (`--verify`) that spawns the MCP server with the same args, waits for the initialize handshake, and reports success/failure. Scope creep for this spec, but a good follow-up.
- **The "`preferences` key preservation" (A2) is the only thing stopping init from nuking Claude Desktop's own settings.** The spread-merge pattern already handles it, but it's worth a functional regression test: seed a config with `mcpServers` + `preferences`; run init; assert `preferences` unchanged byte-for-byte.
- **FR8's `existsSync(dirname(configPath))` probe is ambiguous on Windows when `%APPDATA%` is unset.** The fallback (`os.homedir() + '\\AppData\\Roaming'`) is a guess, not a ground truth. Detection will return true (the path exists on every standard Windows install) even if the user has not installed Claude Desktop. False-positive detection is benign (init writes the file, Claude Desktop picks it up on first launch) but should be noted.
- **Changeset mention missing from §13's Next actions.** Implicit in "Standard changeset + `bun run release`" in the deployment table, but Next actions step 8 runs `bun run check` before a changeset. Minor sequencing nit.
