# Audit findings

**Artifact:** /Users/andrew/Documents/code/open-knowledge/specs/2026-04-13-cli-init-clarity/SPEC.md
**Audit date:** 2026-04-13
**Baseline commit (per spec):** 3d07f16
**Method:** Cold read + source verification of every §8 citation + cross-check of §9/10/11 coherence.

---

## Verified claims

- **`start.ts:13`** — `--open` flag declaration. Confirmed at `packages/cli/src/commands/start.ts:13` (`.option('--open', 'Open browser after start')`).
- **`start.ts:198-204`** — `--open` launches browser via `execFile('open', [url], …)`. Confirmed verbatim at `packages/cli/src/commands/start.ts:198-204`. macOS-only claim holds: no platform branch, no fallback.
- **`start.ts:33-47`** — auto-init path on first run. Confirmed at `packages/cli/src/commands/start.ts:33-47` including `didAutoInit` gating. D7's design (rendering preview after banner, gated by `didAutoInit`) aligns with the actual code shape.
- **`init.ts:391` non-TTY fallback defaults to `'claude'`** — confirmed at lines 390-393 (comment at 391, assignment at 392). D6's rationale is accurate.
- **`ContentFilter` location and surface** — confirmed at `packages/server/src/content-filter.ts:47`. `createContentFilter(opts)` returns `{isExcluded, isDirExcluded, getWatcherIgnoreGlobs}` exactly as spec §8 and §9 describe.
- **Nested `.gitignore` handling** — `loadNestedGitignores` (`content-filter.ts:159`) walks contentDir, reads nested `.gitignore` files, and prefixes patterns with the relative path from `projectDir`. So `.open-knowledge/.gitignore` (contents: `cache/`) correctly excludes `.open-knowledge/cache/`. Q5 resolution is factually correct.
- **File-watcher uses same ContentFilter** — `seedLastKnownHashes` at `packages/server/src/file-watcher.ts:375` takes a `ContentFilter` and applies `isExcluded` per file, `isDirExcluded` per directory (lines 438-479). No special-case for `.open-knowledge/`. Q5 claim that preview reusing ContentFilter matches watcher is correct.
- **`config/schema.ts` defaults** — confirmed at `packages/cli/src/config/schema.ts:6-14`: `dir: '.'`, `include: ['**/*.md']`, `exclude: []`. A1 correctly marked verified.
- **ED-4 does not exist on disk** — `ls /Users/andrew/Documents/code/open-knowledge/projects/` returns only `server-bridge-hardening` and `v0-launch`. `projects/day-0-editor-completeness/` does not exist. Glob on `**/day-0-editor-completeness/**` returns nothing. Evidence file `ed-4-status.md` is accurate; A4 correctly tagged LOW.
- **`.open-knowledge/.gitignore` excludes `cache/`** — verified: file contents are literally `cache/\n`. D8 rationale holds.
- **`initContent` scaffolds `AGENTS.md`, `.gitignore`, `config.yml`** — confirmed at `packages/cli/src/content/init.ts:158-163`, plus empty dirs `articles/`, `external-sources/`, `research/` (line 166). Matches Problem Statement §1 and §8.

---

## Factual errors

### [MEDIUM] §8: `@inkeep/open-knowledge-server` is a devDependency, not a dependency

**Claim:** §8 asserts "CLI already depends on `@inkeep/open-knowledge-server` (workspace)." Evidence file `current-init-cli-shape.md` line 88 restates: "CLI `package.json` already declares `@inkeep/open-knowledge-server: workspace:*` as a dep, so importing is free — no architectural change."

**Reality:** `packages/cli/package.json:49-52` lists `@inkeep/open-knowledge-server` under `"devDependencies"`, not `"dependencies"`. Only `@hocuspocus/provider`, `@modelcontextprotocol/sdk`, `@clack/prompts`, and a handful of other runtime modules are in `"dependencies"`.

**Severity:** MEDIUM — not fatal, but load-bearing for D2's rationale ("CLI already depends on server package; importing is free — no architectural change"). Implementer needs to either (a) promote to a real dependency, (b) confirm tsdown bundles the server module into `dist/cli.mjs` so no runtime resolution is needed, or (c) re-export `previewContent()` from somewhere else. The CLI's `start` command currently imports `@inkeep/open-knowledge-server` at runtime — that works only because tsdown bundles it (or because in the monorepo workspace resolution finds it). For the published npm package this is fragile to assert without verification.

**Suggested fix:** Update §8, evidence file, and D2 rationale to say "declared as a workspace devDependency and bundled into `dist/cli.mjs` by tsdown" (after confirming the bundling actually happens) OR "will require promoting to a runtime dependency as part of this spec." Either way, the current phrasing is inaccurate and the implementer shouldn't inherit the false assumption.

---

### [LOW] §8: Off-by-one line numbers for `runInit` and `formatInitResult`

**Claim:** "`runInit()` (`init.ts:170`)" and "`formatInitResult()` (`init.ts:231`)."

**Reality:** `runInit` declaration is at `packages/cli/src/commands/init.ts:171`. `formatInitResult` is at `packages/cli/src/commands/init.ts:232`. Both off by one.

**Severity:** LOW — citations are close enough that an implementer can find them, but the cold-reader test the spec is supposed to pass fails here.

**Suggested fix:** Update §8 to cite `init.ts:171` and `init.ts:232`.

---

### [LOW] §1 / §8: "Linux: silently fails or errors" is imprecise

**Claim:** §1 Problem Statement: "`start --open` works on macOS, silently fails or errors on Linux/Windows." Evidence file: "On Linux this fails (`open` is a different unrelated command); on Windows it doesn't exist at all."

**Reality (partial verification):**
- **macOS:** `/usr/bin/open` launches files/URLs in the default handler — works as intended.
- **Linux:** `open` is provided by `util-linux` and opens a pathname in a new virtual console (TTY context), not a browser. If the binary exists it typically exits with an error on a URL argument, but some systems lack it entirely (ENOENT). "Silently fails or errors" is directionally correct but understates that on some configurations it might appear to succeed but route output to a VT the user never sees.
- **Windows:** `open` does not exist as a command. `execFile('open', …)` throws ENOENT; the current code logs `Failed to open browser: <err>` rather than silently failing.

**Severity:** LOW — doesn't change the decision to fix. But "silently fails" is wrong for both platforms today: there *is* an error log (`start.ts:202` `console.error`). The user sees noise, not silence.

**Suggested fix:** Change "silently fails or errors" to "logs an error and prints no URL hint." The R3 motivation stands regardless.

---

### [LOW] Q5 resolution lists directories that may not contain markdown at scaffold time

**Claim:** Q5: "`AGENTS.md`, `articles/`, `research/`, `external-sources/`, and `catalogs/` are all indexed."

**Reality:** `initContent` (`packages/cli/src/content/init.ts:166,176-178`) creates `articles/`, `external-sources/`, `research/` as empty directories; `catalogs/` is generated at runtime by the MCP server (not by `initContent`). On a fresh init, only `AGENTS.md` + `INDEX.md` (if catalogs exist from a prior session) and `config.yml` (not matching `**/*.md`) are present. The `.md` count from a fresh init is typically 1 (just `AGENTS.md`).

**Severity:** LOW — Q5's core point (ContentFilter correctly includes `.open-knowledge/` minus `cache/`) is right. The enumeration of directories is forward-looking. But a reader could misread "indexed" as "contain indexable content now."

**Suggested fix:** Reword Q5 to say "would be traversed by the watcher (currently scaffolded empty; any future `.md` inside is indexed)."

---

## Coherence issues

### [LOW] D7 rationale vs. §9 UX ordering

**Observation:** D7 says preview renders on `start`'s auto-init path, "gated by `didAutoInit`." §9 "User experience / surfaces" says: "render the same Content block AFTER the boxed banner and ready-on URL line, alongside the existing 'Scaffolded `.open-knowledge/` (first run)' tip." Reading `start.ts:166-171`, the tip is printed *synchronously inside* the `httpServer.listen` callback before `ready.then(...)` resolves. Preview enumeration is async filesystem work — if the implementer inserts it synchronously before `ready.then()` they risk either blocking the banner display or placing the preview before the degraded-boot warnings logged inside `ready.then()`.

§9 does not say *when* preview runs relative to `ready.then()`. Mildly under-specified.

**Severity:** LOW.

**Suggested fix:** Add a one-line note in §9 specifying whether preview prints before `ready.then()` (simpler, blocks momentarily on fs walk) or after (ordering-stable with degraded warnings). Either is defensible; pick one.

---

## Vague acceptance criteria

### [LOW] R2 acceptance: "hashing the project tree before/after"

**Quote:** "Verified by hashing the project tree before/after."

**Issue:** "Project tree" is ambiguous — does this include `node_modules/`, `.git/`, `dist/`? A strict hash of the whole working tree is expensive and noisy (temp files, logs). The intent is clearly "no new/modified files from init side effects," but the criterion as written invites implementer confusion.

**Suggested fix:** Specify the scope — e.g., "Verified by asserting that `.open-knowledge/` does not exist (if absent before) and `.mcp.json` is unchanged (if present before)."

### [LOW] R4 acceptance: "stable location consumable by both CLI and (future) web onboarding"

**Quote:** R4's acceptance is the function signature. Stability and cross-consumer fit are implied, not testable.

**Suggested fix:** Name the target export (e.g., "exported as `previewContent` from `@inkeep/open-knowledge-server` index") so "stable" becomes verifiable at the package.json exports level.

### [LOW] R3 acceptance: platform-specific verification

**Quote:** "Opens the browser on macOS (`open`), Linux (`xdg-open`), and Windows (`cmd /c start`)."

**Issue:** This is pass/fail per platform but the acceptance doesn't say *how* it's verified in test. A unit test can stub `execFile` and assert the correct arguments-per-platform, but the criterion as written could be read as "launch an actual browser on every platform," which CI can't do.

**Suggested fix:** Say "unit test stubs `child_process.execFile` and verifies `{cmd, args}` on each of darwin/linux/win32."

---

## Gaps (claims without evidence)

### [LOW] A2 relies on `xdg-open` being present; no investigation of headless/minimal images

**Claim:** "`xdg-open` is present on default Linux desktop installs (Ubuntu, Fedora) … Documented in `xdg-utils` package; ships with most distros."

**Gap:** Not cited to a primary source. Minimal/server distros (Debian slim, Alpine, CI images) do not have `xdg-utils` installed. This is flagged obliquely in §14 ("WSL, headless servers, SSH sessions") but Risk mitigation defers it to "always print URL; auto-launch is best-effort" — fine, but A2's "HIGH" confidence labels the distribution claim as HIGH, and the claim is conditional on desktop installs specifically.

**Severity:** LOW — risk is acknowledged, just not matched to A2's confidence label.

**Suggested fix:** Downgrade A2 confidence to MEDIUM, or narrow the claim ("`xdg-open` ships in `xdg-utils` which is default on desktop spins of Ubuntu/Fedora; not present on minimal/server images"). The "fall back to printing URL" mitigation makes this immaterial, so no design change needed.

---

### [LOW] Performance NFR "<2s for 10k files" not traced

**Claim:** §6 Non-functional: "Preview enumeration completes in <2s for repos with up to 10k files."

**Gap:** No measurement cited; A3 marks this MEDIUM confidence with verification during implementation. Reasonable for v1, but a reader of §6 might take the NFR as load-bearing. The A3 verification plan is concrete enough to cover it.

**Severity:** LOW.

**Suggested fix:** Cross-reference A3 from §6 NFR so the conditional nature is visible inline.

---

## Summary

The spec is substantially accurate against source. All start.ts citations (lines 13, 33-47, 198-204) check out exactly. Config schema defaults are correct. ContentFilter surface, nested gitignore handling, and file-watcher integration all match. ED-4 non-existence is correctly asserted.

The most consequential finding is the **devDependency vs dependency error** — load-bearing for D2's "no architectural change" rationale. The rest are minor (off-by-one line numbers, imprecise OS-platform failure mode language, slightly under-specified acceptance criteria). No internal contradictions between §9, §10, and §11; the resolved Qs line up with their corresponding decisions. No coherence failures between the Problem Statement and Proposed Solution.

Total findings: 8 (0 High, 1 Medium, 7 Low).
