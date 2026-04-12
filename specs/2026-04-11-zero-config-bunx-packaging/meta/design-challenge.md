# Design Challenge Findings

**Artifact:** specs/2026-04-11-zero-config-bunx-packaging/SPEC.md
**Challenge date:** 2026-04-11
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H] Finding 1: Track 2 scope is incomplete — three additional @parcel/watcher hard imports are unaddressed

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (Track 2), Section 16 (Agent constraints — SCOPE)

**Issue:** The spec identifies only `packages/server/src/file-watcher.ts` as needing the @parcel/watcher fallback, but there are **four** files with hard `import { ... } from '@parcel/watcher'` statements:

1. `packages/server/src/file-watcher.ts` (line 20) -- spec covers this
2. `packages/server/src/head-watcher.ts` (line 13) -- **missed**
3. `packages/cli/src/mcp/server.ts` (line 23) -- **missed**
4. `packages/cli/src/content/watcher.ts` (line 3) -- **missed**

If @parcel/watcher is unavailable, `head-watcher.ts` will crash the server on startup the same way `file-watcher.ts` does. The MCP server (`mcp/server.ts`) will also crash, breaking the `mcp` command entirely — which is the primary distribution path for Claude Code Desktop users (P1 persona). The content watcher (`content/watcher.ts`) will fail when the MCP server tries to start catalog watching.

**Current design:** "Replace the hard import [in file-watcher.ts] with a tiered dynamic import" (Section 9, Track 2). Agent constraints SCOPE lists only `packages/server/src/file-watcher.ts`.

**Alternative:** Apply the same tiered dynamic import pattern to all four files. The head-watcher and content watcher need their own fallback paths (or graceful degradation). For `head-watcher.ts`, a chokidar/fs.watch fallback watching the `.git/` directory for HEAD changes. For `mcp/server.ts` and `content/watcher.ts`, a chokidar/fs.watch fallback for the `.open-knowledge/` catalog watcher.

**Trade-off:** More implementation surface (4 files instead of 1), but without this, `bunx @inkeep/open-knowledge mcp` — the primary distribution path for P1 — will crash when @parcel/watcher is unavailable, defeating the zero-config goal.

**Status:** CHALLENGED
**Suggested resolution:** Expand Track 2 scope to cover all four import sites. Update Agent Constraints SCOPE to include `packages/server/src/head-watcher.ts`, `packages/cli/src/mcp/server.ts`, and `packages/cli/src/content/watcher.ts`. Consider whether the head-watcher fallback should gracefully degrade (log warning, skip git operation watching) rather than providing a full chokidar fallback, since `.git/` directory watching is less critical than content file watching.

---

### [H] Finding 2: chokidar as fallback adds a new dependency when Node.js built-in fs.watch could suffice

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 9 (Track 2), Decision D7

**Issue:** The spec locks D7 as "Use chokidar ^5.0.0 as the watcher fallback" with the rationale that it's lighter than v4. But this still adds a new runtime dependency for a fallback path that only activates when @parcel/watcher is missing. Since the project requires `engines.node >= 22`, Node.js's built-in `fs.watch` with `{ recursive: true }` is available on all target platforms (recursive support was added for Linux in Node 19.1, macOS and Windows have had it longer).

The Decision Log doesn't record `fs.watch` as a considered alternative. The rejection of the "thin launcher pattern" (NG3) is about a different concern (runtime asset downloading). No decision addresses whether a zero-dependency fallback was considered.

A tiered approach could be: @parcel/watcher (performance) -> fs.watch (zero-dep, built-in) -> chokidar (only if fs.watch is also unavailable, which shouldn't happen on Node >= 22).

**Current design:** "@parcel/watcher (optional) -> chokidar (guaranteed)" with chokidar as a hard dependency.

**Alternative:** @parcel/watcher (optional) -> `fs.watch({ recursive: true })` (built-in, zero dependencies). This eliminates the new dependency entirely. `fs.watch` on Node >= 22 provides recursive watching on macOS, Linux, and Windows. The event model is simpler (provides 'rename' and 'change' events rather than chokidar's 'add'/'change'/'unlink'), but the spec's DiskEvent classification pipeline already handles raw event normalization. The adapter layer would be similar in complexity to the chokidar adapter shown in the spec.

**Trade-off:**
- **Gained:** Zero new runtime dependencies. Smaller package. No risk of chokidar version compatibility issues. The fallback is guaranteed to exist on any Node >= 22 runtime.
- **Lost:** `fs.watch` has historically been less reliable than chokidar for edge cases (duplicate events, missing filenames on some platforms, no built-in glob filtering). However, chokidar v4+ itself uses `fs.watch` internally — it's largely a convenience wrapper at this point, not a fundamentally different watching mechanism.
- **Risk:** `fs.watch` recursive mode on Linux has had bug fixes through Node 20-22 (crash on file deletion was fixed). By Node 22, these should be resolved, but the spec would need to validate this assumption.

**Status:** CHALLENGED
**Suggested resolution:** Investigate whether `fs.watch({ recursive: true })` on Node >= 22 is reliable enough for the content watching use case (monitoring ~1000 `.md` files). If it is, use it as the fallback instead of chokidar, eliminating the new dependency. If `fs.watch` proves unreliable in testing, the chokidar approach stands — but that investigation should be documented as evidence for D7.

---

## Medium Severity

### [M] Finding 3: Auto-init writing .mcp.json to a git repo on first `start` is a stronger side effect than the spec acknowledges

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (Track 3), Risk table (Section 14)

**Issue:** The spec's Track 3 proposes that `bunx @inkeep/open-knowledge` (i.e., the `start` command) auto-runs `init`, which creates `.open-knowledge/` AND writes `.mcp.json` in the user's project root. The risk table rates this as "Low likelihood / Low impact" with mitigation via `--no-init` flag and banner messaging.

This understates the impact for users who run `bunx @inkeep/open-knowledge` to evaluate the tool. They may be in a git repo with a clean working tree. The command silently creates:
- `.open-knowledge/` directory (7+ files: AGENTS.md, .gitignore, config.yml, plus subdirectories)
- `.mcp.json` at the repo root

Both show up as untracked files in `git status`. For P2 (first-time evaluator), this is unexpected — they ran a command to preview an editor, not to scaffold configuration into their project. The banner mentioning it happened doesn't prevent the files from being written.

The current `runInit` code (init.ts line 95-179) has no "dry-run" or "preview" mode. The `--no-init` flag is opt-out, meaning users must know about it before they're surprised.

**Current design:** "Auto-init on first start when `.open-knowledge/` missing" with `--no-init` opt-out.

**Alternative:** Split auto-init into two tiers: (a) create a minimal `.open-knowledge/` for the server to function (just the directory and config.yml, which are gitignored), and (b) offer to write `.mcp.json` interactively or via explicit flag (`--init-mcp`). Alternatively, only auto-scaffold on `start` but skip the `.mcp.json` write — the MCP registration is only needed for Claude Code integration, not for the browser editor experience that `start` provides.

**Trade-off:** Slightly more friction for P1 (Claude Code users who want MCP auto-registration), but significantly less surprise for P2 (evaluators who just want to see the editor). The spec already separates these personas; the auto-init conflates their needs.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether auto-init on `start` should write `.mcp.json`. Consider: auto-scaffold `.open-knowledge/` (needed for server config), but skip `.mcp.json` unless `--mcp` is explicitly passed or the user is running `init`. This respects the separation between "I want to try the editor" (P2) and "I want to set up MCP for my team" (P1/P3).

---

### [M] Finding 4: Build script uses `cp -r` which interacts with tsdown's `clean: true` in a fragile ordering dependency

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (Track 1), build pipeline

**Issue:** The proposed build pipeline is:

```
"build": "bun run build:app && bun run build:cli && bun run build:assets"
```

Where `build:cli` runs tsdown, which has `clean: true` in the config. This means tsdown **deletes the entire `dist/` directory** before building. The ordering is currently correct (tsdown runs before `cp -r`), but this creates a fragile implicit dependency:

1. If anyone reorders the build steps, `clean: true` will wipe the copied assets.
2. If tsdown is run independently (`bun run build:cli`), `dist/public/` is deleted. A subsequent `bun run build:assets` would restore it, but any process that ran between the two steps would find assets missing.
3. The `prepublishOnly` hook runs `bun run build` (correct), but developers running individual build steps during development may hit inconsistent states.

The Prisma approach referenced in D1's rationale likely uses a bundler plugin or post-build hook rather than a fragile sequential script chain.

**Current design:** Three sequential shell commands with implicit ordering dependency on tsdown's `clean: true`.

**Alternative:** Either (a) remove `clean: true` from tsdown config and handle cleanup explicitly in the build script, (b) use a tsdown plugin/hook to copy assets after bundling completes (keeping it atomic), or (c) add a comment in `package.json` documenting the ordering dependency and add a `prebuild:assets` script that verifies `dist/` exists. Option (a) is simplest.

**Trade-off:** Minor — any of these alternatives are low-effort. The current approach works but is a latent source of "it works on CI but not locally" bugs.

**Status:** CHALLENGED
**Suggested resolution:** Document the ordering dependency explicitly, or consider removing `clean: true` from tsdown and adding an explicit `rm -rf dist` as the first step of the `build` script, making the cleanup visible rather than hidden in bundler config.

---

## Low Severity

### [L] Finding 5: The spec claims chokidar v5 has "1 dep" but doesn't verify this or document what the dependency is

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Decision D7, Deployment table (Section 13)

**Issue:** D7's rationale states "1 dep vs 13" comparing chokidar v5 to v4. The deployment table in Section 13 says "chokidar v4 is ~185KB with one dep (readdirp)" — but the decision was changed to v5, and the deployment table still references v4 metrics. The spec doesn't verify what v5's single dependency is, or whether v5's dependency tree has changed since the decision was made.

This is a documentation gap rather than a design gap — the decision to use v5 is reasonable given the project's ESM-only and Node >= 22 constraints.

**Current design:** D7 locked with v5, but evidence references v4 metrics.

**Alternative:** Update the deployment table to reflect v5 metrics. Verify the actual dependency count of chokidar v5 from npm before locking the decision.

**Trade-off:** None — this is purely a consistency fix.

**Status:** CHALLENGED
**Suggested resolution:** Verify chokidar v5 dependency tree and update the deployment concern table to match. If Finding 2 (fs.watch alternative) is adopted, this becomes moot.

---

## Confirmed Design Choices (summary)

### DC1 (Simpler alternative)
- **Track 1 (build-time copy):** The `cp -r` approach for bundling React assets is the simplest viable option. The alternatives (bundler plugin, workspace references, runtime download) all add complexity without benefit for a 2MB payload. Confirmed.
- **D5 (npx over bunx for MCP registration):** Correct — npx is the safe default for `.mcp.json` since Claude Code environments may not have Bun. Confirmed.
- **D6 (separate start and mcp commands):** Sound — different consumers, different lifecycles, different process models. The research report's reasoning holds. Confirmed.
- **D9 (plugin ships MCP only, no SessionStart hook initially):** Conservative and appropriate. The SessionStart hook for starting a background HTTP server is a surprising side effect. Confirmed.

### DC2 (Stakeholder gap)
- **Track 1 asset path resolution:** The fallback chain (bundled -> monorepo src -> monorepo dist) correctly handles both distribution and development. Confirmed.
- **Graceful degradation on missing assets:** The design correctly handles missing `dist/public/` by serving API-only (no browser UI). Confirmed.
- **Track 3 idempotency:** The existing `runInit` is properly idempotent — re-running doesn't overwrite existing files. Confirmed.

### DC3 (Framing validity)
- **Problem statement holds.** The three compounding gaps (missing assets, native addon crash, manual init) are genuinely interconnected — fixing only one or two still leaves the tool broken for first-time users. The intersection is real, not post-hoc.
- **Urgency is real.** The primary distribution channel (`bunx`) is completely non-functional outside the monorepo. This isn't a nice-to-have; it's table stakes for a published npm package.
- **Resolution follows from complication.** The four tracks map cleanly to the three gaps plus the Claude Code integration goal. No scope creep detected.
