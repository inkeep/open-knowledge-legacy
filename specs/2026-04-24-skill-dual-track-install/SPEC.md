# Dual-Track Agent Skill Install — Spec

**Status:** Draft
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-24
**Baseline commit:** 46751128
**Links:**
- Research: [[reports/agent-skills-zip-distribution-ux/REPORT]] (this spec implements Dim 8 recommendations in scope-contracted form)
- Research: [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12 (Cowork Skills install surface)
- Docs (already authored, awaiting artifact): `docs/content/guides/install-claude-cowork.mdx`
- Prior spec: `specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md` — introduced `installUserSkill()`

---

## 1) Problem statement

**Situation.** Open Knowledge ships an Agent Skill (single-file `SKILL.md` at `packages/server/assets/skills/open-knowledge/`, ~22 KB / 21,882 bytes as of baseline `46751128`). For Claude Code users, `ok init` already installs it via `packages/server/src/skill-install.ts` → `npx skills@~1.5.0 add <bundledDir> --agent '*' -g -y --copy`. That flow writes to `~/.claude/skills/open-knowledge/` and covers ~45 agent IDs in the `vercel-labs/skills` registry (per [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12) — tracked in a `~/.open-knowledge/skill-installed-version` sidecar for idempotency.

**Complication.** Claude Desktop (including **Claude Cowork** mode) is NOT covered by `vercel-labs/skills` — its per-session VM runs an isolated synthetic filesystem that does NOT mount `~/.claude/skills/`, and the registry has no `cowork` / `claude-desktop` / `claude-cowork` agent ID. Confirmed by [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12. The only sanctioned install path for Cowork is manual ZIP upload via Claude Desktop's `Customize > Skills > +` UI. We just authored a user-facing docs page (`docs/content/guides/install-claude-cowork.mdx`) telling users to download `openknowledge.skill` from GitHub Releases — but **the ZIP doesn't exist yet**. Any user following the docs today hits a 404 on the download link.

**Resolution.** Ship the minimum artifact that closes the 404 loop, with supporting hygiene. Keep Claude Code's install path unchanged; add a CI step that builds + attaches `openknowledge.skill` to every `@inkeep/open-knowledge` GitHub Release; extend `ok init` to detect Claude Desktop and print a one-line hint with the pinned-version download URL. **Electron install-modal UX and Team+ plugin marketplace integration are deferred to Future Work** (FW1, FW4) — the challenger subagent surfaced that the plugin marketplace is knowingly regressive today (#39400 silently fails vs ZIP upload which works; #38429 wipes GitHub-sourced marketplaces on Desktop restart), and the Electron modal can ride on Phase 1's artifact when the Electron team has capacity.

## 2) Goals

- **G1:** Users following `docs/content/guides/install-claude-cowork.mdx` can download a valid `openknowledge.skill` from GitHub Releases (closes the 404 loop).
- **G2:** `ok init` users with Claude Desktop installed get a one-line hint telling them what to do for Cowork, without disrupting the existing non-interactive flow.
- **G3:** The ZIP stays in lockstep with the `@inkeep/open-knowledge` release that produced it — `metadata.version` in the skill's frontmatter matches the released CLI version, source-of-truth at commit time.
- **G4:** Both the Electron app **and** the web app surface an "Install in Claude Desktop" affordance that (Electron) downloads → reveals in Finder/Explorer → launches Claude + shows the 3-click walkthrough, or (web) triggers browser download → shows the walkthrough inline (web can't launch native apps or reveal files).
- **G5:** The affordance is available on both surfaces from a non-EditorArea entry point — **Settings panel row** (always reachable; doesn't depend on empty-state rendering) + a **one-shot first-run toast** on the Electron app after the user lands in the editor the first time.

## 3) Non-goals

Glossary for resolution-status labels used below: **NEVER** = fundamentally misaligned; **NOT NOW** = valid but out of scope, link to Future Work with revisit trigger; **NOT UNLESS** = conditional; only reconsider if specific trigger fires.

- **[NOT NOW]** NG1: Team+ GitHub plugin marketplace integration — tracked as FW4. Revisit when Anthropic triages upstream bugs #39400 (silent mount failure) OR #38429 (Desktop-restart wipe), OR a Team+ customer explicitly asks and accepts the re-install-on-restart burden in writing.
- **[NOT NOW]** NG2: Auto-update check ("newer version of the OK skill available") in the Electron status area — tracked as FW2. Revisit after Ship 1d ships and we see whether users complain about stale versions.
- **[NOT NOW]** NG3: `CLAUDE.md` fallback stub for users who hit Cowork mount-bug #26254 — document the delete-and-re-upload workaround instead (already in docs page).
- **[NOT NOW]** NG4: Rewriting SKILL.md description to <200 chars for the Claude Desktop UI display cap — separate content pass (D11). Revisit when Anthropic confirms the actual display cap behavior.
- **[NOT NOW]** NG5: CTA adjacent to "Initialize LLM brain" in EditorArea's EmptyEditorState — per challenger H3, EmptyEditorState only renders when no doc is open (backwards for persona P3 who already has docs), and conflates an OK-project-scaffolder CTA with an external-product-integration CTA. Settings panel + first-run toast (G5) are the approved entry points instead.
- **[NOT UNLESS]** NG6: Submitting to `claude.ai/directory` — only if Anthropic opens a 3P submission path.
- **[NEVER]** NG7: Custom `claude://` URL scheme registration on our side — Anthropic's closed feature requests (#26952, #10366) confirm the host app won't handle it.
- **[NEVER]** NG8: Cryptographic signing of the ZIP — Claude Desktop has no UI surface to display provenance today. Free-lunch provenance via `actions/attest-build-provenance` is tracked as FW3 (capability available since `id-token: write` is already granted).
- ~~NG9~~ (removed 2026-04-24): prior claim that `.skill` file association doesn't exist was factually wrong. Claude.app's `Info.plist` registers `.skill` as a `CFBundleDocumentType` ("Skill File"). `.skill` is Anthropic's own canonical format (output of `package_skill.py`). **We DO ship `.skill`** — see FR1, D21.

## 4) Personas / consumers

- **P1:** Claude Cowork user (Pro/Max) who uses Open Knowledge for notes/project work. Today they cannot install the OK skill in Cowork at all. Primary audience for G1.
- **P2:** Team / Enterprise admin provisioning the OK skill org-wide. Reuses the same ZIP via Organization settings → Skills → + Add; no separate flow needed for them.
- **P3:** Open Knowledge contributor who just ran `ok init` on a project with Claude Desktop installed, expecting "it just works." Primary audience for G2.

## 5) User journeys

### P1 — Claude Cowork user installs OK skill (simplified via `.skill` file association, per D21)
1. User reads `docs/content/guides/install-claude-cowork.mdx` (or clicks the Install CTA in Electron/web app — Ship 1e).
2. User clicks the "Download openknowledge.skill" link → browser downloads the file.
3. User double-clicks the downloaded `.skill` file in Finder/Explorer → macOS/Windows hands it to Claude.app via the `.skill` file association → Claude Desktop opens an install-confirmation dialog.
4. User clicks Install in Claude's dialog. Skill appears in list, toggles on. Chat with Claude in Cowork; it uses OK's conventions.

**Failure paths:**
- Mount-bug #26254 (Cowork only): skill shows installed but doesn't fire. Workaround: delete in UI → re-download + re-install. Docs link the upstream issue.
- "Save and Replace" bug #46836 (Cowork only, same-name re-install): silent no-op. Workaround: delete in UI first, then double-click the new `.skill`.
- Linux: no Claude Desktop build exists upstream; CTA is hidden on Linux.

### P3 — `ok init` with Claude Desktop installed
1. User runs `npx @inkeep/open-knowledge init` in their project.
2. `installUserSkill()` runs → Claude Code skill installed to `~/.claude/skills/`.
3. Init calls `claudeDesktopInstalled()` which reuses `EDITOR_TARGETS['claude-desktop'].detectPath` — checks whether the Claude Desktop **config directory** exists (`~/Library/Application Support/Claude/` on macOS; `%APPDATA%\Claude\` on Windows). On Linux the helper returns `false` (Anthropic doesn't ship a Linux build; `resolveClaudeDesktopConfigPath` throws `"Claude Desktop is not available on linux. Supported: macOS, Windows."` which the helper catches).
4. Summary output appends one line with both the docs URL and the pinned-version ZIP URL:
   `Claude Desktop detected. For Cowork: https://inkeep.github.io/open-knowledge/guides/install-claude-cowork  •  ZIP: https://github.com/inkeep/open-knowledge/releases/download/v<VERSION>/openknowledge.skill`
5. User can take action now or later; `ok init` exits 0 regardless.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR1** — CI attaches `openknowledge.skill` asset to every `@inkeep/open-knowledge` GitHub Release | The "Create GitHub Release" step in `release.yml` passes the ZIP as a positional arg to `gh release create`. `curl -fsSL https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill -o /tmp/ok.zip && unzip -l /tmp/ok.zip` returns HTTP 200 and lists `open-knowledge/SKILL.md` at the top. | Single source of truth — `packages/server/assets/skills/open-knowledge/` |
| Must | **FR2** — ZIP structure matches Claude Desktop upload expectations | ZIP contains a single top-level folder `open-knowledge/` with `SKILL.md` + `LICENSE.txt` at its root. `unzip -l openknowledge.skill` shows exactly two entries at the top of the wrapper folder. | Per [[reports/agent-skills-zip-distribution-ux/REPORT]] Dim 1 — wrapper-folder-at-root is mandatory; flat ZIP silently fails |
| Must | **FR3** — SKILL.md carries `metadata.version` matching the released CLI version | SKILL.md in-repo (pre-build) has `metadata.version: "X.Y.Z"` at commit time via the changeset version-bump hook. CI verifies with: `unzip -p openknowledge.skill open-knowledge/SKILL.md \| grep -E '^\s+version:\s+"?X\.Y\.Z"?'` matches. Release step fails if the value doesn't match the release tag. | Commit-time per D8; no runtime mutation |
| Must | **FR4** — CI validates ZIP structural integrity before release-asset attachment | Release workflow runs: (a) `unzip -l openknowledge.skill \| grep -q 'open-knowledge/SKILL.md'`, (b) `test $(stat -c%s openknowledge.skill) -lt 102400` (100 KB ceiling — room to grow from current ~8 KB DEFLATE-compressed output without accidental binary bloat), (c) `grep -E '^name: open-knowledge$' <(unzip -p openknowledge.skill open-knowledge/SKILL.md)`. Fails the release step on any miss. | Bash smoke-test per D3; no Bun validator script |
| Must | **FR5** — `ok init` detects Claude Desktop and appends one hint line to the summary | When `claudeDesktopInstalled(home)` returns true, init output includes exactly one line containing BOTH the docs URL (`https://inkeep.github.io/open-knowledge/guides/install-claude-cowork`) AND the pinned-version release URL (`https://github.com/inkeep/open-knowledge/releases/download/v<VERSION>/openknowledge.skill`) separated by ` • `. When absent, no new output. Test fixtures cover both states. | Non-interactive; uses existing `resolveClaudeDesktopConfigPath` from `editors.ts` |
| Must | **FR6** — `ok init` non-interactive behavior preserved | `echo "" \| ok init` behavior unchanged except for the FR5 hint line. No new prompts, no new required flags. `--yes` / `--no-mcp` unchanged. | Init's contract stays the same |
| Must | **FR7** — Docs page direct-downloads the ZIP on click (not a release-overview page) | `docs/content/guides/install-claude-cowork.mdx` Card href = `https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill` (GitHub's standard always-latest asset redirect). No intermediate release-overview page. | Corrects current docs which point at `/releases/latest` |
| Could | **FR8** — `ok skill-zip [output-path]` subcommand | Produces `openknowledge.skill` in cwd or the given path. Useful for Team+ admins or offline usage. | Nice to have; not blocking G1-G3 |
| Must | **FR9** — `InstallInClaudeDesktopDialog` React component exists in `packages/app/src/components/` and renders in both Electron + web modes | Component mounts; renders the 3-step walkthrough (download / open Claude / upload); behavior branches on a `platform: 'electron' \| 'web'` prop or on `'okDesktop' in window` detection. | Per G4 |
| Must | **FR10** — Settings panel row on both Electron + web app triggers the dialog | In `packages/app/src/components/Settings*.tsx` (or equivalent), a row labeled "Install in Claude Desktop" opens the dialog. Row hidden on Linux (where Claude Desktop doesn't exist — detected via `window.okDesktop.detectClaudeDesktop()` on Electron, or always-show on web). | Settings is the always-reachable entry point |
| Must | **FR11** — Electron mode downloads `.skill` + invokes OS file association | Dialog's "Install" button uses a new IPC channel `ok:skill:download-and-open` that: (a) fetches the pinned-version `.skill` to `app.getPath('downloads')`, (b) calls `shell.openPath(skillPath)` which routes the file to Claude.app via the `.skill` extension registration. Claude Desktop's native install dialog appears; user clicks Install there. Two clicks total (our Install button + Claude's Install). | Per CLAUDE.md IPC discipline: typed via `createHandler`/`createInvoker`; shape in `bridge-contract.ts` |
| Must | **FR12** — Web mode triggers browser download; user double-clicks to complete install | Dialog's "Install" button = an `<a href="...openknowledge.skill" download>` that triggers browser download. Dialog displays: "Downloaded? Double-click the file to install. That's it." Fallback text: "If nothing happens on double-click, open it manually via right-click → Open With → Claude." No native-app launching from browser (impossible). | Web mode piggybacks on the same OS file association; browser just hands off the file |
| Must | **FR13** — Electron app shows a one-shot first-run toast pointing at the Settings row | After the user lands in the editor and Claude Desktop is detected, a toast/snackbar appears once: "Install Open Knowledge in Claude Cowork — Settings › Install in Claude Desktop". Dismissible; marker file at `~/.open-knowledge/install-prompt-seen.json` suppresses subsequent shows. | Discoverability without permanent-CTA squatting |
| Must | **FR14** — New IPC channels use existing `createHandler` / `createInvoker` discipline | `ok:skill:download-and-open`, `ok:skill:detect-claude-desktop` typed via `bridge-contract.ts`. | Per CLAUDE.md `no-loosely-typed-webcontents-ipc` |
| Must | **FR15** — Shared Claude-Desktop detection helper lives in `@inkeep/open-knowledge-server` (not duplicated) | Export `detectClaudeDesktopPresence(home: string): boolean` from `packages/server/src/` (or similar shared location). Used by: (a) `ok init` (Ship 1c), (b) Electron main process (Ship 1d). | One source of truth for detection |

### Non-functional requirements
- **Performance:** ZIP build step adds <10s to release job (current baseline 3m43s; budget is ~5%).
- **Reliability:** ZIP-build failure fails the release job loudly — never silently skip. Required to keep docs + npm release in sync.
- **Security/privacy:** ZIP asset is a public artifact (same content as the CLI's bundled asset). No secrets, no user content.
- **Operability:** CI release log includes a one-liner: `Built openknowledge.skill vX.Y.Z (SHA256: ...) (size: X bytes)`.
- **Cost:** Negligible. GitHub Releases has no per-asset cost; ZIP compresses ~22 KB SKILL.md + LICENSE.txt to ~10 KB DEFLATE.

## 7) Success metrics & instrumentation

- **Metric 1:** GitHub Releases download count for `openknowledge.skill`
  - Baseline: 0 (asset doesn't exist yet).
  - Target: ≥1 download within 30 days of first release (proves discovery).
  - Instrumentation: GitHub's built-in release-asset download counter.
- **Metric 2:** `ok init` summary output includes the Desktop hint on a fixture macOS with Claude.app config present.
  - Baseline: 0% (not implemented).
  - Target: 100%. Verified via init integration test (T2).
- **What we log/trace:** CI release-workflow log line with version + SHA256 + asset URL. No runtime telemetry — release-build artifact only.

## 8) Current state (how it works today)

**`.github/workflows/release.yml` (lines 215-234):**
- Triggers on push to main touching `packages/**` or `.changeset/**`.
- Uses `changesets/action@v1` with `publish: bun run release`.
- On successful changesets publish, runs `gh release create "v${VERSION}" --target ${{github.sha}} --title ${RELEASE_DATE} --notes "$CHANGELOG"` — **no assets attached today**. Vanilla text-only release.
- Permissions: `contents: write`, `pull-requests: write`, `id-token: write` — npm OIDC + Sigstore attestation capability available.

**`packages/server/src/skill-install.ts`:**
- `installUserSkill()` runs `npx skills@~1.5.0 add <bundledDir> --agent '*' -g -y --copy`.
- `bundledDir` resolves to `packages/server/assets/skills/open-knowledge/` (dev) or `packages/cli/dist/assets/skills/open-knowledge/` (published CLI).
- Sidecar at `~/.open-knowledge/skill-installed-version` tracks installed version for idempotency.
- 60s subprocess timeout; non-fatal on failure.

**`packages/cli/src/commands/init.ts:603-604`:**
- Calls `installUserSkill({ home: options.home })` unconditionally — no prompt, no Desktop detection, no Cowork hint.
- Init is non-interactive today (besides `interactive` option for editor selection).

**`packages/cli/src/commands/editors.ts:141-162, 293-303`:**
- `resolveClaudeDesktopConfigPath({ home })` throws on unsupported platforms with `"Claude Desktop is not available on linux. Supported: macOS, Windows."`
- `EDITOR_TARGETS['claude-desktop'].detectPath(_cwd, home) = dirname(resolveClaudeDesktopConfigPath({ home }))` — returns the Claude-config-dir parent (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows).

**Bundled skill asset:** Single-file `SKILL.md` (~22 KB, 21,882 bytes at baseline). No `scripts/`, `references/`, `assets/` subdirs, no `LICENSE.txt` bundled. Frontmatter has only `name` + `description` (two fields). `metadata.version` is absent — will be added at commit-time via changeset hook (D8, D11, FR3).

**Release version source:** `packages/cli/package.json` version field. The release workflow reads `$(jq -r '.[0].version' <<< '${{ steps.changesets.outputs.publishedPackages }}')` which is whichever public package publishes first — `@inkeep/open-knowledge-server` is `"private": true` (doesn't publish), so the version tracks `@inkeep/open-knowledge` (CLI). Changesets keeps them synced via workspace-protocol deps, but nothing enforces `server.version === cli.version` at the source level (see D5, FR3).

**Known gap:** The docs page we authored 2026-04-24 tells users to download the ZIP from GitHub Releases. That asset doesn't exist yet — this spec implements the fix.

## 9) Proposed solution (vertical slice)

### Surfaces touched
- **CI workflow** (`.github/workflows/release.yml`) — three new bash steps before `gh release create`: (a) `scripts/build-skill-zip.sh` (see below) that zips the skill dir, (b) structural-validation smoke-test (FR4), (c) `server.version === cli.version` assertion. Pass the ZIP path as a positional arg to `gh release create`.
- **Build script** (`scripts/build-skill-zip.sh`) — minimal bash. `cd packages/server/assets/skills && zip -r "$OUT_PATH" open-knowledge/`. No Bun script, no `metadata.version` runtime mutation.
- **Changeset hook** — extend the existing monorepo version-bump flow to also rewrite `metadata.version` in `packages/server/assets/skills/open-knowledge/SKILL.md` when `packages/cli/package.json` bumps. One sed/awk line in a post-`changeset version` script.
- **`ok init`** (`packages/cli/src/commands/init.ts`) — add a `claudeDesktopInstalled(home)` helper (catches `resolveClaudeDesktopConfigPath`'s throw on Linux), thread its result into `formatInitResult`, append the FR5 hint line.
- **SKILL.md** (`packages/server/assets/skills/open-knowledge/SKILL.md`) — add `license`, `compatibility`, `metadata.author`, `metadata.repository` frontmatter (per Auditor M10); add an initial `metadata.version: "0.2.0"` matching CLI.
- **LICENSE.txt** — add `packages/server/assets/skills/open-knowledge/LICENSE.txt` (copy of repo's LICENSE) so ZIP contains it per Dim 8 recommendation.
- **Docs** (`docs/content/guides/install-claude-cowork.mdx`) — change Card href from `/releases/latest` to `/releases/latest/download/openknowledge.skill` (Auditor M8).

### Data model
- No new persistent state. No schema change.
- ZIP content: `open-knowledge/SKILL.md` + `open-knowledge/LICENSE.txt`. Two entries.

### Runtime
- CI: GitHub Actions. `zip`, `unzip`, `grep`, `jq`, `stat` are all standard `ubuntu-latest` tools. No new dependencies.
- Runtime: `ok init` adds one `existsSync()` check wrapped in a try-catch. No network calls, no new subprocesses.

### Ops & observability
- CI log line: `Built openknowledge.skill vX.Y.Z (SHA256: ...) (size: X bytes)`.
- No runtime metrics.

### Rollout
- No feature flag. First `@inkeep/open-knowledge` release after merge ships the ZIP + the `ok init` hint simultaneously.
- Docs page is already live; its direct-download URL (FR7) starts working at that first release.

## 10) Decision log

Resolution-status glossary: **LOCKED** = 1-way door, don't revisit without new evidence; **DIRECTED** = chosen with latitude for implementer tactics; **DELEGATED** = implementer's call within Agent Constraints; **PROPOSED** = still draft; **INVESTIGATING** = active investigation.

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| D1 | Wedge scope: CI ZIP + `ok init` hint. Electron modal (FW1) + plugin marketplace (FW4) → Future Work. | DIRECTED (2026-04-24, scope contraction after audit+challenger) | Challenger H1/H4 + Auditor H5: plugin marketplace is knowingly regressive today (#39400, #38429 with zero Anthropic engagement); Phase 1 alone closes the docs 404 loop. Phase 2 Electron modal can ride on Phase 1's artifact when Electron bandwidth allows — no technical dependency. |
| D2 | ZIP filename: `openknowledge.skill` | LOCKED (2026-04-24) | Already committed via docs page. |
| D3 | CI validator: three-line bash smoke-test (presence + size ceiling + name match). No Bun script, no port of `quick_validate.py`. | DIRECTED (2026-04-24, Challenger L7) | SKILL.md is authored in-tree with normal PR review; structural invariants can't be silently broken. Bash smoke-test catches the 1% failure modes (accidental flat-ZIP, binary bloat, name typo). `scripts/build-skill-zip.sh` replaces the proposed `scripts/build-skill-zip.ts`. |
| D4 | ZIP contents: `open-knowledge/SKILL.md` + `open-knowledge/LICENSE.txt`; frontmatter has `name`, `description`, `license`, `compatibility`, `metadata.version`, `metadata.author`, `metadata.repository`. | DIRECTED (2026-04-24, Auditor M10) | Expanded from original 2-field minimalism to the Dim-8-recommended shape. License + compatibility fields are ~4 lines; LICENSE.txt is a single-file copy; forward-compatible with any future Claude-Desktop publisher-info UI. Narrow minimalism was under-justified. |
| D5 | `metadata.version` source of truth: `packages/cli/package.json` (not server/package.json). CI asserts `server.version === cli.version` and fails release otherwise. | DIRECTED (2026-04-24, Auditor M7) | `@inkeep/open-knowledge-server` is `"private": true`; release tag tracks the CLI package. Eliminates drift risk. Changeset workspace-protocol deps already keep them synced; CI assertion makes the invariant explicit. |
| D6 | `ok init` Desktop hint is non-interactive (printed in summary, not prompted) | LOCKED (2026-04-24) | Matches init's existing non-interactive default. |
| D7 | Release URL form in `ok init` hint: pinned to `/releases/download/v${version}/openknowledge.skill`; docs URL also included on the same line. | LOCKED (2026-04-24, reconciled with §5 P3 step 4 + FR5 per Auditor H4) | Pinned URL prevents "CLI 0.2.0 but skill 0.3.0" mismatch; docs URL gives the user the walkthrough if they don't know what to do with the ZIP. |
| D8 | `metadata.version` injection: **commit-time** via changeset version-bump hook. Not build-time. | LOCKED (2026-04-24, Challenger M6) | Single source of truth (git), no build-time mutation, no asymmetric artifact. Changesets already atomically bump package.json versions across the workspace; adding a one-line sed for SKILL.md's `metadata.version` is a cheap extension. Eliminates R2 drift risk entirely. |
| D10 | Desktop detection OS coverage: macOS + Windows via `EDITOR_TARGETS['claude-desktop'].detectPath` (config-dir existence check). Linux returns false (Anthropic doesn't ship a Linux build; free-lunch no-op if they ever do). | LOCKED (2026-04-24, Auditor H1 correction) | The detection checks the Claude-config-dir parent, not the .app bundle (per `editors.ts:302`). D10 prose corrected from prior `.app` / `.exe` paths. |
| D11 | Description rewrite (SKILL.md <200 chars): defer to follow-up content pass. | DIRECTED (2026-04-24) | Out of wedge scope. Claude Desktop's 200-char display cap is support-article-claimed; actual UI behavior unverified. Not worth blocking on. |
| D12 | Reuse existing `EDITOR_TARGETS['claude-desktop'].detectPath` for Desktop detection; wrap in `claudeDesktopInstalled(home)` helper in `init.ts` that catches the Linux-unsupported throw. | LOCKED (2026-04-24) | No duplicate detection. Evidence: `evidence/claude-desktop-detection-existing.md`. |

| D13 | Install-dialog placement: Settings panel row (primary) + one-shot first-run toast (Electron only, for discoverability). NOT in EditorArea/EmptyEditorState. | DIRECTED (2026-04-24, Challenger H3) | Settings is always reachable regardless of doc state. Toast is bounded + dismissible. EditorArea conflict with "Initialize LLM brain" avoided. |
| D14 | Install dialog is a single component (`InstallInClaudeDesktopDialog`) shared between Electron + web; behavior branches at runtime on Electron-bridge detection. | DIRECTED (2026-04-24) | One component to maintain; web gets a slightly degraded but still useful flow. |
| D15 | Plugin marketplace path → FW4 (deferred). Upstream bugs #39400 + #38429 make it less reliable than ZIP upload for Cowork today. | LOCKED (2026-04-24, Challenger H1) | Research report Dim 5 explicit recommendation; zero Anthropic engagement on bugs for 3+ months. |
| D16 | Web-mode dialog does NOT attempt to launch Claude Desktop. Only triggers download + shows inline walkthrough. | DIRECTED (2026-04-24) | Browser can't launch native apps deterministically; faking it creates broken UX. Walkthrough tells user to open Claude Desktop themselves. |
| D17 | Bash `scripts/build-skill-zip.sh` replaces the proposed Bun script. Covers Ship 1a smoke-test (FR4). | DIRECTED (2026-04-24, Challenger L7) | No Bun deps; works in any `ubuntu-latest` runner; easier to read for a cold reviewer. |
| D18 | Walkthrough screenshots: stock from claude.com support articles (fair use + alt-text attribution). Re-shoot only if Claude Desktop UI changes. | DIRECTED (2026-04-24) | Speed over branding in first ship; re-shoot is reversible. |
| D19 | Post-install verification: trust-the-user "Done / Skip" click. No polling. | DIRECTED (2026-04-24) | Claude Desktop exposes no Skills-list API; polling requires parsing `~/Library/Application Support/Claude/` config which is fragile + platform-specific. Trust is honest to the Category D reality. |
| D20 | First-run toast trigger: on editor first mount (`useEffect` with empty deps) when `detectClaudeDesktopPresence()` returns true AND marker file `~/.open-knowledge/install-prompt-seen.json` is absent. Marker written on dismiss. | DIRECTED (2026-04-24) | Simplest trigger; editor first mount is the moment the user is ready to see it. Marker file mirrors the existing `mcp-status.json` pattern. |
| D21 | Install artifact is `openknowledge.skill` (not `.skill.zip`) — Claude.app on macOS registers `.skill` as a `CFBundleDocumentType`. Double-click installs via Claude's native dialog; no UI walkthrough needed. | LOCKED (2026-04-24, discovered post-audit via `plutil -p /Applications/Claude.app/Contents/Info.plist`) | This reverses NG9 and simplifies Ship 1e from a 3-screenshot walkthrough to "download + double-click". Also reverses the research report Dim 4 + my earlier `cowork-skills-surface-update-2026-04-24.md` claim that no `.skill` file association exists — both need corrigendum. The `.skill` format IS Anthropic's own canonical output (`package_skill.py`). |

### Moot decisions
- ~~D13-original (plugin marketplace inline at repo root)~~ — moot, plugin marketplace deferred to FW4. D13 ID reused above.
- ~~D14-original (symlink SKILL.md from plugin subdir)~~ — moot, plugin marketplace deferred. D14 ID reused above.

## 11) Open questions

| ID | Question | Type | Priority | Reversibility | Confidence | Status |
|----|----------|------|----------|---------------|------------|--------|
| OQ1 | ~~Does `npx skills@~1.5.0 validate` accept a ZIP path?~~ | Technical | P0 | Reversible | HIGH | **RESOLVED** — no `validate` subcommand exists. D3 pivots to bash smoke-test. Evidence: `evidence/skills-cli-validator-check.md`. |
| OQ2 | ~~Does current SKILL.md have `metadata.version` frontmatter?~~ | Technical | P0 | Reversible | HIGH | **RESOLVED** — only `name` + `description`. Commit-time injection per D8/D11. |
| OQ3 | ~~Claude Desktop detection paths per OS?~~ | Technical | P0 | Reversible | HIGH | **RESOLVED** — reuse `EDITOR_TARGETS['claude-desktop'].detectPath` (D12). |
| OQ4 | ~~CI-only or local dev build?~~ | Technical | P0 | Reversible | HIGH | **RESOLVED** — bash script invokable both from CI and via `bun run build:skill-zip`. D3/D17. |
| OQ5 | ~~Wedge scope vs full plan?~~ | Product | P0 | Reversible | HIGH | **RESOLVED (2026-04-24, post-audit)** — wedge only. D1. |
| OQ6 | ~~Filename + URL form~~ | Product | P0 | 1-way | HIGH | **RESOLVED** — `openknowledge.skill` + pinned URL. D2 + D7. |
| OQ7 | ~~OS coverage for detection~~ | Technical | P2 | Reversible | HIGH | **RESOLVED** — macOS + Windows real; Linux free-lunch no-op. D10. |
| OQ8 | ~~Phasing?~~ | Product | P0 | Reversible | HIGH | **RESOLVED** — micro-ship sequence 1a-1d (§15). |
| OQ9 | ~~Plugin marketplace shape?~~ | Technical | — | 1-way | — | **MOOT (FW4 deferred)**. |
| OQ10 | ~~Electron button placement?~~ | Technical | P2 | Reversible | HIGH | **RESOLVED (2026-04-24, D13)** — Settings panel row + first-run toast. NOT EditorArea. |
| OQ11 | ~~plugin.json schema?~~ | Technical | — | Reversible | HIGH | **MOOT (FW4)** — 4-field minimal shape captured in `evidence/plugin-json-schema.md`. |
| OQ12 | ~~Symlink resolution via GitHub plugin pull?~~ | Technical | — | Reversible | — | **MOOT (FW4)**. |
| OQ13 | ~~Walkthrough screenshots: stock or re-shot?~~ | Product | P0 (Ship 1e) | Reversible | HIGH | **RESOLVED (2026-04-24)** — stock screenshots from claude.com support articles (fair use, attribution in alt text). Re-shoot only if/when Anthropic UI changes meaningfully. D18. |
| OQ14 | ~~Post-install verification: poll or trust?~~ | Product | P0 (Ship 1e) | Reversible | HIGH | **RESOLVED (2026-04-24)** — trust-the-user "Done / Skip" click. No Anthropic Skills API exists for polling. D19. |
| OQ15 | ~~First-run toast trigger?~~ | Product | P0 (Ship 1e) | Reversible | HIGH | **RESOLVED (2026-04-24)** — on editor first mount when `detectClaudeDesktopPresence()` returns true AND marker file absent. Marker at `~/.open-knowledge/install-prompt-seen.json`. D20. |

## 12) Risks / unknowns

- **R1 (LOW):** `gh release create`'s positional-arg behavior for asset files — verified: `gh release create "v${VERSION}" --target ${sha} --title ... --notes ... openknowledge.skill` attaches the asset per `gh` docs. Trivial; no investigation gap.
- **R2 (REMOVED):** ~~Version drift between in-body prose and `metadata.version`~~ — eliminated by D8 commit-time injection. Source file is the single truth.
- **R3 (LOW):** User runs `ok init` without Claude Desktop, installs it later — they don't get the hint retroactively. Mitigation: docs already recommend re-running `ok init` when editors change.
- **R4 (LOW):** LICENSE.txt drift if the root LICENSE changes — mitigation: the changeset hook OR a CI assertion that `packages/server/assets/skills/open-knowledge/LICENSE.txt` matches `LICENSE`. Trivial.

## 13) Future work

- **[Identified] FW2: Skill auto-update hint** — Electron status-area affordance that compares the user's last-uploaded version (if detectable) to the latest GitHub release. Needs design for "how do we know they uploaded the last one." Revisit after Ship 1d ships and we see real re-upload friction.
- **[Noted] FW3: `actions/attest-build-provenance` on the ZIP** — free-lunch Sigstore provenance via `id-token: write` (already granted in release.yml). Zero user-visible benefit today (no verifier in Claude Desktop) but forward-compatible when Anthropic ships publisher-info UI. Single CI step to add.
- **[Identified] FW4: Team+ plugin marketplace track** — add `.claude-plugin/marketplace.json` + plugin subdir wrapping the skill. **Triggers to revisit:** (a) Anthropic triages or ships a fix for #39400 (silent mount failure) OR #38429 (Desktop-restart wipe), OR (b) a Team+ customer explicitly asks AND accepts the re-install-on-Desktop-restart burden in writing. Schema captured at `evidence/plugin-json-schema.md` for pickup. Deferred per [[reports/agent-skills-zip-distribution-ux/REPORT]] Dim 5 + challenger H1.
- **[Noted] FW5: File Anthropic feature requests** — open one issue on `anthropics/claude-code` asking for `claude://install-skill?url=<zip-url>` (analogous to `shortcuts://import-shortcut/?url=`), linking this spec + the research reports. One-off action; low priority.
- **[Noted] FW6: `ok skill-zip` local subcommand (FR8)** — optional command to emit the ZIP to cwd for offline/Team+ admin use. Out of wedge scope but cheap to add later.

## 14) Test plan

- **T1 (CI integration):** Build script + bash smoke-test runs on a PR that doesn't publish. Assert ZIP exists, size < 100 KB, `open-knowledge/SKILL.md` + `open-knowledge/LICENSE.txt` present, frontmatter `name: open-knowledge`, `metadata.version` matches package.json.
- **T2 (init integration):** Extend `packages/cli/src/commands/init.test.ts` — with Claude.app config dir present in fixture `HOME`, assert init summary contains the FR5 hint line with both URLs. Absent config dir → no new output.
- **T3 (CI assertion):** `server.version === cli.version` check as a separate step in release.yml. Fails the release on drift.
- **T4 (manual, post-first-release):** Download ZIP from a test release, upload via Claude Desktop UI, verify skill loads in a Cowork session. Document reproducibility in `meta/t4-manual-verify.md`.

## 15) Rollout — micro-ship sequence

Four small, independent ships. Each closes a distinct user-value delta without pressure from the others.

### Ship 1a — Unblock docs 404 (target: today, <1 hour)
- Add 6 lines to `.github/workflows/release.yml`: `zip -r openknowledge.skill open-knowledge/` against the existing bundled directory + pass to `gh release create`.
- Update `docs/content/guides/install-claude-cowork.mdx` Card href to direct-download URL.
- **Exit:** next release attaches a valid ZIP; docs download link resolves.

### Ship 1b — Frontmatter hygiene + LICENSE (target: next day, ~2 hours)
- Add `license`, `compatibility`, `metadata.author`, `metadata.repository`, `metadata.version: "0.2.0"` to SKILL.md source.
- Add `packages/server/assets/skills/open-knowledge/LICENSE.txt` (copy of repo LICENSE).
- Extend changeset version-bump hook (or post-version script) to keep `metadata.version` in lockstep with CLI package version.
- **Exit:** SKILL.md carries proper publisher metadata; commit-time version tracking works.

### Ship 1c — `ok init` Desktop-hint (target: ~1 day)
- Add `claudeDesktopInstalled(home)` helper in `init.ts` using `EDITOR_TARGETS['claude-desktop'].detectPath` (wrapped in try/catch for Linux).
- Thread into `formatInitResult`; append the FR5 hint line to summary when true.
- Extend `init.test.ts` (T2).
- **Exit:** Mac users with Claude Desktop installed see the hint; no regression in other init paths.

### Ship 1d — CI hygiene (target: when 1a-1c merged, ~half-day)
- Add `server.version === cli.version` CI assertion (T3).
- Add structural bash smoke-test (FR4).
- Add SHA256 log line.
- Optional: wire `actions/attest-build-provenance` (FW3) if it fits the ship.
- **Exit:** Release pipeline has full integrity checks.

### Ship 1e — `InstallInClaudeDesktopDialog` component + Electron IPC (target: ~1 week)
- New component `packages/app/src/components/InstallInClaudeDesktopDialog.tsx` with Electron+web runtime branching (FR9).
- New IPC channels `ok:skill:download-zip`, `ok:skill:open-claude-desktop`, `ok:skill:detect-claude-desktop` in `packages/desktop/src/main/ipc/install-skill.ts` + typed in `bridge-contract.ts` (FR11, FR14).
- Shared detection helper `detectClaudeDesktopPresence()` in `packages/server/src/` — consumed by `ok init` (Ship 1c) and Electron main (this ship) (FR15).
- Settings panel row in both Electron + web app (FR10).
- First-run toast on Electron main's editor-ready event (FR13).
- Resolve OQ13 (screenshots: stock) + OQ14 (verification: trust-the-user) + OQ15 (toast trigger: editor first mount) at ship kickoff.
- **Exit:** Settings row on both surfaces + first-run toast on Electron; clicking it opens the dialog; download + reveal + launch (Electron) or download + inline walkthrough (web) all work.

### Ship order rationale
- **1a first** — unblocks the docs 404 with near-zero risk (6-line YAML patch).
- **1b second** — metadata hygiene lands before any consumer sees the ZIP and notices missing fields.
- **1c third** — init hint is independent of the ZIP pipeline but depends on 1a being out so the URL resolves.
- **1d fourth** — CI hardening is orthogonal; can land any time; last among the infra-side ships because it has the lowest user-visible value.
- **1e fifth** — UX ship; builds on 1a's artifact + 1c's detection helper. Kept separate because it's meaningfully larger (React component + Electron IPC + web mode + toast + settings integration) and benefits from 1a-1d being stable first.

No feature flags. Low blast radius per micro-ship. Ships 1a-1d can be a single week of work; 1e is its own week.

## 16) Agent constraints

### Ships 1a-1d (CI + init hint + hygiene)
- **SCOPE:**
  - `.github/workflows/release.yml` (add build + validate + attach steps)
  - `scripts/build-skill-zip.sh` (new — minimal bash)
  - `packages/cli/src/commands/init.ts` (add `claudeDesktopInstalled` + hint threading)
  - `packages/cli/src/commands/init.test.ts` (fixture coverage for the hint)
  - `packages/server/src/` — shared `detectClaudeDesktopPresence()` helper (Ship 1c, consumed also by Ship 1e)
  - `packages/server/assets/skills/open-knowledge/SKILL.md` (add frontmatter fields)
  - `packages/server/assets/skills/open-knowledge/LICENSE.txt` (new — copy of repo LICENSE)
  - `docs/content/guides/install-claude-cowork.mdx` (Card href fix — Ship 1a)
  - `package.json` (root) — add `build:skill-zip` script pointing at the bash script
  - Changeset version-bump hook or post-version script for metadata.version sync (Ship 1b)
- **EXCLUDE:**
  - `packages/desktop/*` — Ship 1e
  - `packages/app/*` — Ship 1e
  - `.claude-plugin/*` — FW4 (plugin marketplace, deferred)
  - `packages/server/src/skill-install.ts` — Claude Code flow stays unchanged
- **STOP_IF:**
  - Changeset version-bump hook cannot be extended without breaking existing version sync → surface + consult
  - SKILL.md frontmatter addition breaks markdown parser tests or any existing frontmatter consumer
  - ZIP bash smoke-test fails on a freshly built artifact — do not publish; surface + investigate
  - Release workflow diff touches anything outside the new build/validate/attach steps → reviewer asks why
- **ASK_FIRST:**
  - Adding any new npm/Bun dependencies (use stdlib / system `zip`)
  - Changing the ZIP filename from `openknowledge.skill` (1-way door via docs page)
  - Any change to `packages/server/src/skill-install.ts` (Claude Code flow is out of scope)

### Ship 1e (install dialog on Electron + web)
- **SCOPE:**
  - `packages/app/src/components/InstallInClaudeDesktopDialog.tsx` (new React component)
  - `packages/app/src/components/Settings*.tsx` (or equivalent) — Settings panel row
  - `packages/desktop/src/main/ipc/install-skill.ts` (new IPC handlers)
  - `packages/desktop/src/preload/index.ts` (bridge exposure)
  - `packages/desktop/src/shared/bridge-contract.ts` (typed IPC contracts)
  - `packages/desktop/src/main/` — first-run toast trigger wiring
  - `packages/server/src/` — re-export `detectClaudeDesktopPresence()` from Ship 1c for Electron main consumption
- **EXCLUDE:**
  - `EditorArea.tsx` / `EmptyEditorState.tsx` — placement explicitly rejected (NG5)
  - `packages/server/src/skill-install.ts` — Claude Code flow stays unchanged
  - `.claude-plugin/*` — FW4
- **STOP_IF:**
  - IPC shape cannot be expressed through existing `createHandler` / `createInvoker` wrappers
  - Web-mode download triggers OS-specific failures (e.g., Safari's download-attribute handling on non-same-origin GitHub releases)
  - First-run toast fires on every mount instead of once (marker-file logic failure)
- **ASK_FIRST:**
  - Any CTA placement outside Settings panel + first-run toast (D13 was explicit)
  - Screenshots: stock vs re-shot (OQ13)
  - Verification strategy: poll vs trust (OQ14)
  - Toast trigger: which lifecycle event (OQ15)
