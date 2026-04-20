---
title: D5 — Runner Choice for Generated MCP Configs (Feasibility + Trade-off Analysis)
description: Evidence-backed analysis of three options for the npx-hardcoded generated-artifact rationale. Feasibility, correctness under edge cases, lockfile-ABI preservation, prior-art survey, and user-breakage risk.
sources:
  - packages/cli/src/commands/editors.ts:23
  - packages/cli/src/commands/init.ts:233
  - packages/cli/src/commands/self-spawn.ts:7-48
  - packages/cli/src/commands/mcp.ts:180-286
  - packages/cli/src/commands/start.ts:67-109
  - packages/cli/src/commands/init.test.ts:890-1029
  - packages/cli/src/commands/mcp.test.ts:1-420
  - packages/cli/package.json
  - reports/bunx-npx-usage-audit/REPORT.md (F5)
  - reports/mastra-speakeasy-cli-install-recommendations/REPORT.md (D2, D7, D8)
  - reports/web-to-macos-desktop-wrapping-2025/REPORT.md (Claude Desktop GUI PATH)
  - specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md (D1, D2)
  - node_modules/husky/bin.js (prior-art runner detection)
  - node_modules/playwright-core/lib/server/utils/env.js:43-51 (prior-art)
  - node_modules/esbuild/install.js:139-145 (prior-art)
  - node_modules/package-manager-detector/package.json (antfu library)
  - Empirical env-var probe: /tmp/runner-detect/ (bunx / npx / pnpm dlx fingerprints)
---

# D5 — Runner Choice for Generated MCP Configs

**Context.** `packages/cli/src/commands/editors.ts:23` hardcodes `MCP_SERVER_COMMAND = 'npx'`. Every per-editor MCP config (Claude Code `.mcp.json`, Cursor `.cursor/mcp.json`, VS Code `.vscode/mcp.json`, Codex `.codex/config.toml`, Windsurf `~/.codeium/windsurf/mcp_config.json`, Claude Desktop `~/Library/.../claude_desktop_config.json`) embeds `"command": "npx"` + `args: ["@inkeep/open-knowledge", "mcp"]`. `init.ts:233` does the same for `.claude/launch.json`'s `runtimeExecutable`. `self-spawn.ts:45` uses `npx` as a fallback when `process.argv[1]` is empty.

**Failure mode.** A pure-Bun user running `bunx @inkeep/open-knowledge init` with no Node installed ends up with `npx`-wired MCP configs that fail with `spawn npx ENOENT` when the editor tries to spawn them. Simulated in `mcp.test.ts:356`.

---

## 1. Current-state blast radius (shared across all three options)

**Files that hardcode `'npx'` and would change (or not) per option:**

| File | Line | Construct | Direct consumers |
|---|---|---|---|
| `editors.ts` | 23 | `MCP_SERVER_COMMAND = 'npx'` | 6 editors via `buildEntry` (L74, L84, L93, L102, L112, L151) |
| `init.ts` | 233 | `runtimeExecutable: 'npx'` | `.claude/launch.json` `open-knowledge-ui` entry |
| `self-spawn.ts` | 45 | fallback `{ command: 'npx', prefixArgs: [...] }` | `resolveSelfSpawn()` called by `mcp.ts:219`, `start.ts:92` |

**Tests that assert the current behavior:**

- `init.test.ts:904` — `.claude/launch.json` entry `runtimeExecutable` equals `'npx'` (fresh write).
- `init.test.ts:921, 952, 979` — stale-detection and migration paths with `runtimeExecutable: 'npx'`.
- `init.test.ts:1012` — `'node'` used for an unrelated `some-other-server` fixture (confirms tests distinguish OK's entry from others).
- `init.test.ts:49, 138, 198, 236, 290, 350, 392, 396, 415, 419, 451, 469, 619, 1225, 1261, 1277` — **17 tests** assert `command: 'npx'` in generated `.mcp.json` / `.cursor/mcp.json` / etc.
- `mcp.test.ts:356` — simulated `spawn npx ENOENT` stderr as the failure-mode ground truth.
- `start.test.ts:210-214, 252-255, 493` — asserts `resolveSelfSpawn()` returns `process.execPath` (NOT `npx`) in the happy path.

**Total test-update surface: ~20 tests across init.test.ts and the self-spawn fallback path.** Every option requires some test update; the shape depends on which option is chosen.

---

## 2. Empirical runner-detection fingerprints

I packaged a test CLI (`detect-runner`) and ran it via each runner on the current machine (`node v22.18.0`, `bun 1.3.11`, `pnpm 10.17.1`). Every runner propagates a distinct environment fingerprint the invoked binary can read:

| Runner | `npm_config_user_agent` | `npm_execpath` | `npm_lifecycle_event` | Invoked argv[0] |
|---|---|---|---|---|
| `bunx` | `bun/1.3.11 npm/? node/v24.3.0 darwin arm64` | `/Users/andrew/.bun/bin/bun` | `bunx` | `/Users/andrew/.bun/bin/bun` |
| `npx` | `npm/10.9.3 node/v22.18.0 darwin arm64 workspaces/false` | `.../npm/bin/npm-cli.js` | `npx` | node binary |
| `pnpm dlx` | `pnpm/10.17.1 npm/? node/v20.11.1 darwin arm64` | `""` (unset) | `""` (unset) | node binary |

**Findings:**
- `npm_config_user_agent` is populated by all three runners with distinguishable leading tokens (`bun/`, `npm/`, `pnpm/`). **This is the canonical runner-detection signal** — already used by `husky`, `playwright-core`, and `esbuild` (see Prior Art below).
- `npm_execpath` is reliable for `bunx` (points at `bun`) and `npx` (points at `npm-cli.js`) but unset for `pnpm dlx` — so user-agent is strictly more reliable.
- `pnpm dlx` is the edge case: both `npm_execpath` and `npm_lifecycle_event` are unset; only `npm_config_user_agent` identifies it.

**Runner variants NOT empirically tested but covered by the detection heuristic:**
- `bun x` (dashless spelling) — `bun x` is equivalent to `bunx`; both dispatch through the same bun binary and set the same env fingerprint. Verified orthogonally: `bun x --bun -- sh env-dump.sh` produced identical `npm_config_user_agent: bun/1.3.11...` output.
- `yarn dlx`, `corepack` — unsurveyed; would need fingerprint probe before production rollout. Yarn historically populates `npm_config_user_agent` with `yarn/x.y.z` per the [Yarn RFC](https://yarnpkg.com/advanced/lifecycle-scripts#environment-variables).
- Custom scripts that wrap the runner — if the wrapper `exec`s the bin directly, env propagates; if it re-invokes a different runner, the detection sees the outermost runner.

---

## 3. Option-by-option analysis

### Option 1 — Keep `npx` hardcoded + surface rationale + add Node prereq

**Summary.** Zero code change to `editors.ts` / `init.ts` / `self-spawn.ts`. `README.md` + `docs/content/guides/getting-started.mdx` add a prereq block stating "Node.js is required for MCP server spawning even if you invoke the CLI via bunx or pnpm dlx." The `spawn npx ENOENT` failure becomes a documented prereq-not-met, not a silent-correctness issue.

#### Feasibility
- **Code change surface:** 0 source files; docs-only.
- **Test update surface:** 0 tests.
- **Blast radius:** Docs + possibly the `AGENTS_MD_CONTENT` constant in `init.ts` (scaffolded AGENTS.md). Tiny.

#### Correctness under edge cases
- **Pure-Bun user who installs Bun, reads README, trusts the Bun-only prereq, and skips Node.** With Option 1, the README now explicitly states Node is required for MCP spawning → user either installs Node, or accepts the failure mode with eyes open.
- **Failure mode persists** — users who skip the prereq section (a measurable fraction of developers) still hit `spawn npx ENOENT` at editor startup. The failure is now "documented-but-hit" vs "silent-and-hit," which is an improvement but not a fix.
- **Claude Desktop GUI PATH problem** (see [reports/web-to-macos-desktop-wrapping-2025/REPORT.md:431](../../../reports/web-to-macos-desktop-wrapping-2025/REPORT.md)): Claude Desktop on macOS spawns MCP servers with a minimal shell PATH that may not include the user's `~/.bun/bin` or fnm/nvm-managed `node`. Even users with Node installed can hit `spawn npx ENOENT` if their Node lives in a shell-manager directory. Option 1 does not address this.

#### Lockfile-ABI drift rationale preservation (self-spawn.ts:7-13)
The rationale fully preserved — no change to `resolveSelfSpawn()`. `ok mcp` spawning `ok start` still re-execs the current binary; MCP configs still use `npx` so the editor-spawned MCP process resolves the latest-published `@inkeep/open-knowledge` package, independent of whichever installed CLI version initially ran `ok init`. **This is the status-quo guarantee — preserved by construction.**

#### Prior-art alignment
- **Mastra** ships `npx mastra …` in all generated MCP configs (per [reports/mastra-speakeasy-cli-install-recommendations/REPORT.md §D5](../../../reports/mastra-speakeasy-cli-install-recommendations/REPORT.md) + verified at [Mastra source: `packages/cli/src/commands/init/mcp-docs-server-install.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/cli/src/commands/init/mcp-docs-server-install.ts) — writes `"command": "npx"` on non-Windows, `"cmd"` + `/c, npx` on Windows+VSCode), doesn't surface a runtime prereq warning, and has equivalent exposure to the silent-ENOENT failure for pure-Bun users.
- **Turbo, Vite, Fastify CLI** — none implement runner detection for config generation. All hardcode `npx` (Turbo's documented install shape) or `npm`-ecosystem commands.
- **Conclusion:** Option 1 is the ecosystem-default posture.

#### Existing-user breakage
- **Zero.** No generated config changes, no test changes, no migration story.

#### Residual risks
- The docs fix doesn't close the failure mode; it just documents it. R2 in the parent spec (user-breakage risk) is minimized (to zero) but G3 (silent-failure closed) is only partially satisfied — upgraded from "silent" to "documented-but-still-hit."

---

### Option 2 — Detect invoking runner at `ok init` time + match MCP config

**Summary.** At `ok init` time, read `process.env.npm_config_user_agent`, `process.env.BUN_INSTALL`, and adjacent fingerprints to classify the invoking runner. Write `"command": "bunx"` / `"command": "npx"` / `"command": "pnpm dlx"` to generated MCP configs accordingly. Also applies to `.claude/launch.json` `runtimeExecutable`. `self-spawn.ts:45` fallback could either stay `npx` or follow the same detection.

#### Feasibility
- **Code change surface:** Add a `detectRunner()` helper module (~30 lines). Thread a `runner: RunnerKind` into `editors.ts`'s `buildEntry()` callbacks (or resolve it once in `writeEditorMcpConfig()` and pass down). Update `init.ts:233` `scaffoldLaunchJson()` to read the detected runner. ~150 lines of total diff.
- **Test update surface:** All 17 `'npx'` assertions in `init.test.ts` parameterize by runner. Either add a new test-harness that mocks `npm_config_user_agent` per test, or split into per-runner test groups. ~40 line-edits + 3-6 new tests for coverage.
- **Blast radius:** `editors.ts` schema (`buildEntry(cwd)` becomes `buildEntry(cwd, runner)`), 6 editor target objects, plus init.ts orchestration.

#### Correctness under edge cases

**Detection reliability:**

| Invocation shape | Detection works? | Notes |
|---|---|---|
| `bunx @inkeep/open-knowledge init` | YES | `npm_config_user_agent` starts with `bun/` |
| `bun x @inkeep/open-knowledge init` | YES | Same env as `bunx` (empirically verified) |
| `npx @inkeep/open-knowledge init` | YES | `npm_config_user_agent` starts with `npm/` |
| `pnpm dlx @inkeep/open-knowledge init` | YES | `npm_config_user_agent` starts with `pnpm/` |
| `yarn dlx @inkeep/open-knowledge init` | Likely — unsurveyed | Standard Yarn RFC populates user-agent |
| `./node_modules/.bin/open-knowledge init` (post-install, no runner) | NO → falls back | `npm_config_user_agent` unset; fallback = `npx` (sane default) or direct-bin (Option 3 hybrid) |
| Custom bash script: `npx @inkeep/open-knowledge init` wrapped in shell alias | YES, detects outer `npx` | But the wrapper may re-invoke via a different runner later |
| CI environment with `actions/setup-node@v4` + `npx …` | YES | `npm_config_user_agent` set by npx |
| User later switches runners | **NO — stale config** | User who ran `bunx ... init` then deletes Bun and relies on Node gets an orphaned `bunx` config. Re-run `ok init --force`? |

**The "user switches runtime later" problem is the sharpest edge** — this is the non-trivial migration. Mitigation: `ok init --force` already exists and overwrites MCP entries. Documenting "re-run ok init when you change runtimes" is a plausible but non-zero-friction UX.

**Claude Desktop GUI PATH problem persists** — even if we write `"command": "bunx"`, Claude Desktop's spawn may not find `bunx` either (same PATH reduction). Runner-matching is orthogonal to the GUI PATH issue and does NOT solve it.

#### Lockfile-ABI drift rationale preservation (self-spawn.ts:7-13)
**Partially preserved, nuance required.**

The `self-spawn.ts:7-13` comment articulates two concerns: (a) cross-version ABI drift between an `ok mcp@0.X`-invoked process and an `ok start@0.Y`-auto-spawned sibling, and (b) the supply-chain surface of `npx` live-registry-fetch on first invocation.

- **Concern (a) — cross-version ABI drift:** `resolveSelfSpawn()` already handles this by re-execing `process.execPath` with `process.argv[1]`. `editors.ts` and `init.ts` are separate concerns — they generate configs that run **on editor startup**, a different process lifecycle. In that lifecycle, lockfile-ABI drift is not a concern because:
  - There is no "sibling" process sharing a Y.Doc with the editor-spawned MCP. The MCP stdio server communicates with the editor via JSON-RPC, not CRDT ABI.
  - The only mixed-version risk is if `ok init` wrote a config for version 0.X and then the user globally-installs version 0.Y — same risk whether the config says `bunx`, `npx`, or `open-knowledge` directly.
- **Concern (b) — live-registry-fetch:** A `"command": "bunx"` config is equivalent to `"command": "npx"` on this axis — both runners cache by default but fetch fresh if cache is cold. No regression. User switching runtimes later does hit the cold-cache first-fetch, same as today.

**Verdict:** The rationale applies to `self-spawn.ts` (which runs `ok <sub>` from inside `ok mcp` / `ok start`), NOT to `editors.ts` (which generates configs the editor invokes independently). Option 2 touching `editors.ts` preserves the rationale. Option 2 ALSO touching `self-spawn.ts:45` fallback would be a degradation — the fallback path exists for the "argv[1] empty" anomaly case (ExecSnapshot bundle, embedded runtime). Detecting runner there adds complexity for a path that should remain as the spec's last-resort WARN. Recommend: **keep `self-spawn.ts:45` as `npx` fallback even under Option 2.**

#### Prior-art alignment

**Strong prior art for runner detection at CLI invocation time:**

- **husky 8+** (`node_modules/husky/bin.js:18`) — writes `bun test` or `pnpm test` or `npm test` to `.husky/pre-commit` based on `process.env.npm_config_user_agent?.split('/')[0] ?? 'npm'`. Exact pattern Option 2 would use. ~5M weekly downloads, 2+ years in production.
- **playwright-core** (`.../server/utils/env.js:43-51`) — `getPackageManager()` inspects `npm_config_user_agent` for `yarn`/`pnpm` branches.
- **esbuild** (`install.js:139-145`) — `isYarn()` tests user-agent regex.
- **`package-manager-detector`** (antfu, `node_modules/package-manager-detector/`) — a dedicated library for this purpose. v0.2.11 is a stable well-maintained dependency. Open Knowledge could depend on it to avoid re-implementing.

**Weak prior art for runner-matching generated MCP configs specifically:**
- **Mastra** does NOT do this — generates `npx` configs regardless of invocation runner ([REPORT §D5](../../../reports/mastra-speakeasy-cli-install-recommendations/REPORT.md) + [Mastra source](https://github.com/mastra-ai/mastra/blob/main/packages/cli/src/commands/init/mcp-docs-server-install.ts)).
- **Anthropic MCP docs** uniformly show `"command": "npx"` examples.
- No surveyed CLI (Turbo, Vite, Fastify, Mastra, Speakeasy) does runner-matching for downstream-process config generation — Option 2 would be novel in that specific dimension.

#### Existing-user breakage
- **Low-medium risk.** Users who already have `npx`-wired MCP configs and don't re-run `ok init` keep working (status quo). Users who re-run `ok init` (e.g. add a new editor) get their existing entries overwritten with the detected-runner form only under `--force` — the current `writeEditorMcpConfig` logic skips when an entry already exists.
  - BUT: Option 2's value depends on re-running init. Without a migration story, the existing Bun user population doesn't get fixed — Option 2 protects new users, not the existing cohort.
  - Migration: document "re-run `ok init --force` to regenerate MCP config for your current runtime." One-line in `CHANGELOG.md`.
- **New risk:** if detection is wrong for a particular shell context (e.g. user invokes via a wrapper that obscures user-agent), the config is wrong in a NEW way that wasn't there before.

---

### Option 3 — Direct-bin resolution

**Summary.** Instead of referencing a runner, resolve to the direct bin at generation time. Two sub-variants:
- **3a — Absolute path to the current bin.** Write `"command": "/Users/andrew/.bun/install/cache/.../ok"` or `.../.bin/open-knowledge`.
- **3b — Assume a global install.** Write `"command": "open-knowledge"` and rely on PATH. Breaks for one-shot bunx users who don't have any global install.

#### Feasibility
- **3a code change surface:** Resolve `process.execPath` + `process.argv[1]` (available via `self-spawn.ts`'s existing logic), plus the path to the `open-knowledge` bin. For bunx ephemeral installs, the bin may be at `~/.bun/install/cache/<pkg>@<version>@@@1/bin/open-knowledge` — location varies by bunx version. For `npx` ephemeral installs, the bin is at `~/.npm/_npx/<hash>/node_modules/.bin/open-knowledge` (verified empirically: `ls ~/.npm/_npx/.../node_modules/.bin/open-knowledge` resolves).
- **3b code change surface:** One-line: `MCP_SERVER_COMMAND = 'open-knowledge'` (bin name that lives in `node_modules/.bin/` post-install). ~20 test updates plus the existing fallback story.
- **Test update surface:** Similar scale to Option 2; per-variant different assertions.

#### Correctness under edge cases

**3a (absolute-bin-path):**
- **One-shot `bunx @inkeep/open-knowledge init` ephemeral install path:** The bin DOES exist at a bunx cache location AT THE TIME OF `ok init`. But bunx caches are periodically cleaned, and the path is version-pinned (`@0.2.0`) — upgrading to 0.3.0 via a later `bunx` invocation leaves the MCP config pointing at a version-0.2.0 cache entry that may or may not still exist. **Chicken-and-egg materializes:** the init runs via bunx, writes the MCP config with the currently-resolved bunx cache path, and that path has a shorter TTL than the MCP config itself.
- **Absolute path shipped in version control:** If user commits `.mcp.json` with `/Users/alice/.bun/install/cache/@inkeep/open-knowledge@0.2.0/bin/open-knowledge` in it, that absolute path won't work on bob's machine. **This is a regression** vs the current `npx` form, which is user-agnostic.
- **Claude Desktop GUI PATH:** 3a **does solve** this — an absolute path bypasses PATH entirely. Positive.

**3b (bare `open-knowledge` bin, relies on PATH):**
- **Claude Desktop GUI PATH:** `open-knowledge` as a bare name requires it to be findable in the MCP-spawned process's PATH. Claude Desktop's reduced PATH often excludes `~/.bun/bin` / fnm / nvm. Regression — current `npx` form at least works when `npx` itself is in PATH (provided by system Node or nvm shim).
- **One-shot bunx user with no global install:** `"command": "open-knowledge"` resolves nowhere — editor spawn fails. **Regression vs status quo.**
- **User with global install:** Works.
- **Mixed: user runs bunx init, then globally installs later:** Works after global install.

**Conclusion on Option 3:** 3a has a path-stability footgun (cache eviction, cross-machine committed configs); 3b has a coverage-gap footgun (breaks for the exact one-shot bunx users this spec aims to help). Neither is strictly superior to status quo.

#### Lockfile-ABI drift rationale preservation (self-spawn.ts:7-13)
- **3a:** Binds the MCP config to a specific cached version. LOSES the lockfile-ABI preservation: when the user upgrades `@inkeep/open-knowledge`, the old absolute path may still be used by the editor until init is re-run. Worse than Option 2.
- **3b:** Relies on the global install being the "truth" — user's `npm i -g @inkeep/open-knowledge@latest` updates the bin. Similar semantics to Options 1/2.

#### Prior-art alignment
- **No surveyed CLI** writes absolute-bin paths into generated configs. The closest is pyright/pylsp style — but those are stdin/stdout LSP servers invoked by editors that already handle venv PATH detection.
- **3b (bare bin name)** is Speakeasy-style — but Speakeasy is a Go binary installed globally, not an npm CLI with ephemeral invocation paths. Different product shape.

#### Existing-user breakage
- **3a:** High. Committed `.mcp.json` files with machine-specific paths break on peer clone. Multi-developer teams would need to re-run init.
- **3b:** Medium. Users without a global install break; users with global install (the explicit README recommendation) work.

---

## 4. Option comparison table

| Dimension | Option 1 (keep + docs) | Option 2 (detect runner) | Option 3a (absolute path) | Option 3b (bare bin) |
|---|---|---|---|---|
| Code change | None | ~150 lines | ~100 lines | ~20 lines |
| Test update | None | ~40 edits + 3-6 new tests | ~40 edits + new tests | ~20 edits |
| Silent-ENOENT fix | No (upgraded to documented) | Yes, for one-shot runner-matched users | Variant-dependent | No (regresses for bunx one-shot) |
| Lockfile-ABI rationale preserved | Fully | Fully (if self-spawn.ts:45 stays npx) | Degraded | Neutral |
| Claude Desktop GUI PATH solved | No | No (orthogonal) | Yes (3a) | No (regressed) |
| Committed `.mcp.json` portability | Yes | Yes | **No — breaks cross-machine** | Yes |
| "User switches runtime later" handled | Implicit (npx is universal-ish) | No (stale config; needs `init --force`) | No | Partially (upgrade path intact) |
| Prior art | Mastra/Turbo/Vite default | Husky/Playwright/esbuild pattern | None surveyed | Speakeasy (but different shape) |
| Migration story for existing users | None needed | "Re-run `ok init --force`" | Re-init + risk cross-machine | Re-init + require global install |
| Risk of new failure modes | Zero | Low (detection errors) | Medium (cache eviction) | Medium (bare-bin NOT-in-PATH) |

---

## 5. Recommendation

**Recommended: Option 1 + a small Option 2 seed.**

- **Option 1 as primary.** Keep `MCP_SERVER_COMMAND = 'npx'` hardcoded and surface the rationale in:
  - Root `README.md` prereq section: "Node.js is required for MCP server spawning, even when installing via bunx or pnpm dlx. The MCP config generated by `ok init` uses `npx` to resolve the latest published package — see [link to rationale]."
  - `docs/content/guides/getting-started.mdx` equivalent note.
  - A pointer in the scaffolded `.open-knowledge/AGENTS.md` footer so agents reading project knowledge see the same note.
  - An inline comment in `editors.ts:23` citing `self-spawn.ts:7-13` and this spec D5.
- **Option 2 deferred as an incremental follow-up.** If the support-ticket metric (parent SPEC §7 Metric 2) shows `spawn npx ENOENT` tickets persisting above a threshold in the first 90 days, activate Option 2 as a follow-up spec with the husky/playwright/esbuild detection pattern. The follow-up is mechanically simple (~150 lines diff, borrowing husky's one-liner).

**Confidence: HIGH** for rejecting Option 3 (both variants); **MEDIUM-HIGH** for preferring Option 1 over Option 2 as the first move.

### Why Option 1 over Option 2 as the first move

1. **Ecosystem alignment.** Mastra (the parent spec's install-UX north star) does not runner-match; ships `npx` configs universally. Doing something more novel before the ecosystem does is a moderate reversibility cost and creates contributor-onboarding friction.
2. **Zero user-breakage risk.** Option 2's "user switches runtime later" edge case has no clean solution short of re-running init. Option 1's only cost is a documentation miss — users who read the prereq install Node, users who don't read it hit the documented failure mode.
3. **Claude Desktop GUI PATH is orthogonal and unsolved by either option.** This suggests the deeper architectural answer (if one is ever needed) is a bundled Node runtime (Electron desktop direction) rather than a runner-choice tweak in the npm CLI.
4. **Reversible.** If Option 1 proves insufficient, Option 2 is the natural follow-up — a clean composition, not a replacement. The npx-hardcoded default remains correct even after Option 2 ships for users whose detection falls into the fallback branch.
5. **Smallest change that satisfies G3.** Parent SPEC G3 requires "closed silent-failure path" and enumerates three acceptable forms: (a) runner-matching, (b) prereq warning, (c) alternative documented path. Option 1 satisfies (b) without any user-reachability regressions. The marginal value of (a) over (b) is only realized for users whose environment genuinely lacks Node and who don't read prereqs — a fraction of a fraction that the support-ticket metric is designed to expose.

### What would change my mind (trigger to escalate to Option 2)

1. **The support-ticket metric fires early.** If `spawn npx ENOENT` tickets exceed ~3 in the first 30 days post-v0-launch, the "documented-but-still-hit" rate is too high; ship Option 2.
2. **A reference app with published telemetry shows the detection pattern works in production.** Specifically, if a future Mastra release (or Turbo, or Fumadocs CLI) adopts husky-style runner detection for their own generated configs, the ecosystem moves and Option 2 becomes the aligned default.
3. **Runner-specific user-agent fingerprinting breaks on a supported platform.** If Windows / Termux / some corporate-managed shell strips or rewrites `npm_config_user_agent`, Option 2's detection becomes unreliable precisely where Option 1's docs also fail (user can't read English prereq → can't install Node) — pushing Option 1 ahead even more.
4. **A `bun_execpath` or equivalent OS-level spawner-identification signal becomes standard** (analogous to `GPG_AGENT_INFO`), replacing the user-agent-string heuristic with something non-forgeable.
5. **The Electron desktop app lands before the CLI V0 launch.** If the desktop app bundles Node, GUI PATH problem dissolves for Claude Desktop users who switch to the desktop variant, and the CLI-side MCP-config-spawn coverage gap shrinks. Escalation priority drops further.

### What would change my mind against Option 1 (reject all three, escalate)

1. **A fourth option emerges:** a `RUNNER_OVERRIDE` environment variable that editors respect — would let us punt the decision to the editor vendor. **Not found in any MCP spec as of 2026-04-20; unlikely to materialize quickly.**
2. **Parent spec D1 implication is re-read strictly:** "docs must show both forms in every install snippet" extended to "MCP configs must show both forms." Would force a `{ "command": "ok-or-npx-macro-here" }` fantasy that no runtime supports — so this escalation path is a no-op.

### Rejected options

- **Option 3a (absolute path):** breaks committed-config portability across machines — unacceptable.
- **Option 3b (bare bin name):** regresses coverage for the exact user cohort the spec aims to help (one-shot bunx users) — unacceptable.

---

## 6. Implementation notes (if Option 1 is chosen)

**Zero code changes to `editors.ts` / `init.ts` / `self-spawn.ts`.**

**Docs additions (G3-satisfying):**
1. Root `README.md` — add a prereq subsection explicitly stating "Node.js is required for MCP spawning." Reference this spec D5 via permalink.
2. `docs/content/guides/getting-started.mdx` — mirror the same note, ideally via the G6 shared-partial mechanism if that lands first.
3. `packages/cli/src/commands/editors.ts:23` — add a comment above `MCP_SERVER_COMMAND`:
   ```ts
   // MCP_SERVER_COMMAND is hardcoded 'npx' by design — see:
   //  - self-spawn.ts:7-13 (lockfile-ABI drift rationale)
   //  - specs/2026-04-20-install-ux-docs-reconciliation/SPEC.md D5
   //  - specs/.../evidence/d5-runner-choice-analysis.md (this analysis)
   // Consequence: users without Node installed hit `spawn npx ENOENT`
   // at editor startup. Documented as a prereq in README + getting-started.
   const MCP_SERVER_COMMAND = 'npx';
   ```
4. `packages/cli/src/commands/self-spawn.ts:7-13` — extend the existing rationale comment to cross-reference this evidence file so a future contributor sees the full story.

**Drift-check integration (if the G6 shared-partial lands):** add a grep-based CI check that fails if any `docs/content/**` file mentions `@inkeep/open-knowledge` in an MCP-config code block without an adjacent prereq pointer.

**Telemetry trigger (deferred to parent SPEC D14):** if telemetry is ever added, include a `mcp-spawn-enoent` error event so Option 2 activation can be decided on data, not intuition.
