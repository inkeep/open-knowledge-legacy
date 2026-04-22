# Audit Findings

**Artifact:** `reports/electron-bundled-cli-install-patterns/REPORT.md`
**Audit date:** 2026-04-21
**Total findings:** 8 (2 High, 4 Medium, 2 Low)

Scope: REPORT.md (16 dimensions) + 12 evidence files. The audit focused on the user-flagged risk areas: D13↔D14/D16 cross-dimension coherence after the amendment commit, quoted VS Code source accuracy, SIP posture, npm install semantics, the Atom symlink paths, ELECTRON_RUN_AS_NODE, and quantitative claims (10-year lineage, ~300 LOC).

Overall: the 3P dimensions (D1–D12) hold up well — the VS Code pattern description, translocation bug mechanics, SIP classification, ELECTRON_RUN_AS_NODE behavior, Docker Desktop friction, and cross-platform divergence all check out. The two High findings are both in the 1P amendment material (D13–D16): a prose-coherence miss where the D13 evidence file still treats an audit as pending that D14 resolved, and a factual claim about npm's overwrite semantics that was inferred rather than verified (and contradicts npm's actual default behavior). The Mediums are factual imprecisions in three different evidence files; the Lows are minor hedges in prose.

---

## High Severity

### [H] Finding 1: D13 evidence file ("application-to-open-knowledge.md") still treats the Bun-import audit as pending, but D14 retired it

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L5 (summary coherence)
**Location:**
- `evidence/application-to-open-knowledge.md` §"Gotchas specific to OK" #2 (lines 88–89)
- `evidence/application-to-open-knowledge.md` §"Implications summary" / "M6 checklist additions" (lines 104–106)

**Issue:** The D13 evidence file authored on 2026-04-21 11:45 lists "Bun-in-CLI audit (risk for Electron-Node-mode execution)" as an **open risk** with prescriptive follow-ups ("Audit `packages/cli/` for Bun-specific imports before M6 lands", "A quick `grep -rn "bun:" packages/cli/src/` audit before M6 answers this in 10 seconds"). The same file's "Implications summary" lists this as a pending M6 checklist item:

> "2. ✋ Bun-specific import audit in `packages/cli/`."

The D14 evidence file (`bun-import-audit.md`, authored 2026-04-21 12:23) completed this audit with a **zero-match** result and explicitly "retired" the risk flag:

> "The spec-risk flag from the original report (`evidence/application-to-open-knowledge.md` §"Bun-specific import audit") is now retired — the audit returned clean."

REPORT.md's D14 section (line 261) propagates D14's conclusion ("The risk flag from the original report (D13 reminder #2) is retired — audit clean"), but the D13 evidence file itself was not updated. A reader who starts from D13's evidence file will walk away believing the audit is outstanding; a reader who starts from D14 sees it is complete. Both files are cited as evidence in REPORT.md.

**Current text (application-to-open-knowledge.md lines 88–89):**

> "2. **Bun-in-CLI audit (risk for Electron-Node-mode execution)** — if any of OK's CLI code or its transitive deps imports from `bun:*` built-ins (bun:sqlite, bun:test, Bun shell), the wrapper's `ELECTRON_RUN_AS_NODE=1` path breaks because Electron's embedded Node has no `bun:*` modules. Audit `packages/cli/` for Bun-specific imports before M6 lands. Known-good: Commander v14, js-yaml, @napi-rs/keyring (Node-native), Zod. Known-risk: any code that assumes Bun runtime APIs. A quick `grep -rn "bun:" packages/cli/src/` audit before M6 answers this in 10 seconds."

and lines 104–106 list this as an open checklist item.

**Evidence:** D14 evidence file line 12 states "ZERO Bun-specific runtime usage in non-test code across every package the CLI bundle touches." I independently replicated the grep in the current worktree — zero matches, confirming D14's result.

**Status:** INCOHERENT

**Suggested resolution:** Add a post-hoc corrigendum breadcrumb at each of the three affected D13 sites (matching the convention already used in `CLAUDE.md` for shipped specs):
- §"Gotchas specific to OK" #2: append `<br>_[Updated 2026-04-21 post-D14: audit completed with zero matches; see evidence/bun-import-audit.md. The M6 checklist item below is retired.]_`
- §"Implications summary" row #2: strike or mark `~~2. ✋ Bun-specific import audit in `packages/cli/`.~~ Retired 2026-04-21 per D14.`
- Optional: update the §"Implications summary" header count ("M6 checklist additions") from 5 to 4 if the retired item is struck rather than annotated.

Also consider an inline crumb in REPORT.md D13 (line 242) for symmetry — D13's Finding prose still reads "Five implementation-layer reminders surface... 2. Bun-specific import audit in `packages/cli/`" without acknowledging that D14 closes #2.

---

### [H] Finding 2: D15 claims npm "silently overwrites" a pre-existing foreign symlink — this is wrong; npm errors with EEXIST by default

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:**
- `REPORT.md` line 266 (D15 finding prose)
- `evidence/npm-electron-coexistence.md` lines 107–111 ("Case B")
- `evidence/npm-electron-coexistence.md` line 113 ("npm will silently overwrite the Electron symlink")

**Issue:** The report states, in both the REPORT.md D15 finding summary and the underlying D15 evidence file, that npm silently overwrites a pre-existing symlink at its bin target:

> REPORT.md line 266: "Npm's install behavior in this case silently overwrites a pre-existing foreign symlink"
>
> npm-electron-coexistence.md lines 107–108: "npm's behavior: it replaces the existing file at `/usr/local/bin/ok` with its shim. npm does NOT check whether the existing file is a foreign symlink. **npm wins, silently.**"
>
> npm-electron-coexistence.md line 113: "**This is an asymmetric collision.** npm will silently overwrite the Electron symlink"

This is the opposite of npm's actual default behavior. npm's `install -g` throws **EEXIST** when the bin target is already occupied, refusing to overwrite unless `--force` is passed. The user-facing error is a well-documented friction point (npm/cli issues, balena-io #605, pnpm #3308 all catalog the same class of failure, and npm docs position `--force` as the overwrite escape hatch). The user flagged this specific claim in the audit context as something I (the report's author) may have "inferred" rather than verified — that turned out to be right.

This matters because the **design conclusions in D15 and D16 are built on this claim.** The "asymmetric collision" narrative (Electron defends, npm stomps) drives the recommendation that OK's install action needs a `fs.lstat` guard to avoid overwriting npm's shim while conceding that the reverse direction is unprotectable. If npm also errors on EEXIST, the collision is actually *symmetric* — both sides fail-safe by default, and the user's sequence is (a) npm EEXIST → user notices → user chooses resolution, or (b) Electron prompt per the D16 design → user chooses resolution. The corollary is that D16's `fs.lstat` collision guard is still good practice (defense-in-depth and better copy than an EEXIST error), but it's not load-bearing to avoid breaking the npm install — the user had to pass `--force` for that to happen.

**Current text (REPORT.md line 266):**

> "Npm's install behavior in this case silently overwrites a pre-existing foreign symlink; Electron's install (per D52) can defensively check and prompt."

**Evidence:**
- Web search across npm/cli issues #611, codestudy.net "How to Fix npm ERR! code EEXIST", balena-io base-images #605, pnpm #3308 — consistent reporting that npm defaults to EEXIST and requires `--force` to overwrite.
- npm docs (v11 install reference) do not explicitly describe the overwrite path but position `--force` as the mechanism to "force fetching remote resources even if a local copy exists on disk" and as the recommended flag when EEXIST is encountered.

**Status:** CONTRADICTED

**Suggested resolution:**
1. Rewrite the D15 "Case B" sub-finding to reflect actual npm behavior:
   > "npm's default behavior: installs fail with `EEXIST` when the bin target is already occupied by a non-npm file. The user sees a visible error and must either remove the foreign file manually or pass `--force`. This means the collision is *symmetric by default* — both Electron (per D52's `fs.lstat` guard) and npm refuse to silently stomp."
2. Update REPORT.md line 266 to drop "silently" and reframe as symmetric-fail-safe: "npm errors with EEXIST rather than overwriting; Electron's install (per D52) prompts before overwriting. The collision is symmetric at the default-behavior floor; both sides only stomp on explicit user opt-in (`--force` for npm, a Replace-button click for Electron)."
3. Update `npm-electron-coexistence.md` §Summary bullet #2 ("NOT silently overwrite (Docker Desktop anti-pattern)") — fine as stated for OK's own behavior, but the adjacent text about npm needs the same correction.
4. The `which -a ok` and `fs.lstat`-before-overwrite recommendations remain correct; they're good practice regardless of npm's default failure mode.

---

## Medium Severity

### [M] Finding 3: Atom's `apm` symlink target is the wrong path

**Category:** FACTUAL
**Source:** T5 (external claims)
**Location:**
- `evidence/sublime-atom-github-desktop.md` line 59 (in "Atom (sunsetted) had the same..." finding)
- `REPORT.md` D5 cross-references this evidence

**Issue:** The evidence file asserts:

> "`/usr/local/bin/apm` → `/Applications/Atom.app/Contents/Resources/app/apm/bin/apm`"

The actual path Atom's Install Shell Commands action creates is:

> `/usr/local/bin/apm` → `/Applications/Atom.app/Contents/Resources/app/apm/node_modules/.bin/apm`

(`node_modules/.bin/apm`, not `bin/apm`.) Multiple community sources document this, and it matches the typical Node-package-inside-another-Electron-bundle convention (`apm` is a published Node CLI whose bin resolves to a `node_modules/.bin/` shim when installed).

**Current text (sublime-atom-github-desktop.md lines 57–60):**

> "Symlinks created:
>
> - `/usr/local/bin/atom` → `/Applications/Atom.app/Contents/Resources/app/atom.sh`
> - `/usr/local/bin/apm` → `/Applications/Atom.app/Contents/Resources/app/apm/bin/apm`"

The first line is correct; the second has the wrong target path.

**Evidence:** Multiple Stack Overflow / flight-manual / GitHub-issue community reports confirm `apm/node_modules/.bin/apm` as the actual target. See `ln -s '/Applications/Atom.app/Contents/Resources/app/apm/node_modules/.bin/apm' '/usr/local/bin/apm'` as the canonical manual-recovery recipe in multiple places.

**Status:** CONTRADICTED (low-impact: the target-path specifics don't change any conclusion in the report, but the factual assertion is wrong and cited as precedent strength in the "two symlinks from one install action" argument).

**Suggested resolution:** Correct the second bullet in `sublime-atom-github-desktop.md` to `/Applications/Atom.app/Contents/Resources/app/apm/node_modules/.bin/apm`. No change needed to REPORT.md because the body doesn't quote the path — it just references the two-symlink precedent, which remains valid.

---

### [M] Finding 4: Atom → VS Code → descendants lineage is ~12 years, not "~10 years"

**Category:** FACTUAL
**Source:** T5 (external claims) — user-flagged
**Location:**
- `REPORT.md` line 43 ("**~10 years battle-tested** through the Atom (2014) → VS Code (2015+) → Cursor / Windsurf / Trae (2023+) lineage")
- `REPORT.md` line 60 ("continuous 10-year provenance through Atom → VS Code → Cursor → Windsurf → Trae")
- `REPORT.md` line 115 ("10-year-stable mechanism")
- `REPORT.md` line 166 ("~10 years of combined production hardening")
- `evidence/sublime-atom-github-desktop.md` line 67 ("Atom shipped it for ~7 years, VS Code has now shipped it for 10+")

**Issue:** The report pins the lineage start to "Atom (2014) → VS Code (2015+)". Today is 2026-04-21. Durations from the earliest stable dates:

| Milestone | Earliest date | Years to 2026-04-21 |
|---|---|---|
| Atom first public release | 2014 (earlier in the year, before VS Code) | ~12 years |
| Atom 1.0 stable | 2015 (mid-year) | ~10.5 years |
| VS Code OSS release (`vscode-dev`) | 2015-11-18 | ~10.4 years |
| VS Code 1.0 stable | 2016-04-14 | ~10 years |

The "~10 years battle-tested" framing is numerically fine if the reader mentally pins the start to VS Code's stable release, and the body of the evidence file (`sublime-atom-github-desktop.md` line 67) is internally consistent: "Atom shipped it for ~7 years [2014→2022], VS Code has now shipped it for 10+". But the REPORT.md Executive Summary line 43 reads as if **the whole Atom→VS Code lineage is 10 years**, which undercounts Atom's 12-year contribution by ~2 years. The "continuous 10-year provenance" on line 60 and "10-year-stable mechanism" on line 115 read slightly differently — as properties of the **pattern**, which VS Code has shipped for ~10 years after Atom preceded it for 1–2 years as the direct ancestor.

This is low-harm (no decision depends on whether the lineage is 10 or 12 years) but the prose is imprecise. A reader taking the numbers at face value would marginally understate the pattern's maturity.

**Current text (REPORT.md line 43):** "This pattern is **~10 years battle-tested** through the Atom (2014) → VS Code (2015+) → Cursor / Windsurf / Trae (2023+) lineage."

**Evidence:** Atom first release 2014 (per Wikipedia, multiple secondary sources); Atom 1.0 stable mid-2015; VS Code OSS release 2015-11-18; VS Code 1.0 stable 2016-04-14 (Wikipedia).

**Status:** INCOHERENT (the "Atom (2014)" timestamp paired with "~10 years" implies ~2024, but today is 2026-04-21 — the math is internally off by ~2 years).

**Suggested resolution:** Either:
- Tighten to "~10 years" meaning VS Code specifically: `"...shipped in its current form by VS Code for ~10 years (since 2015/2016), with Atom preceding it (2014–2022) as the direct ancestor"`; OR
- Expand the number: `"~10–12 years battle-tested through Atom (2014–2022, ~7-year shipping window) → VS Code (2015+, ~10-year shipping window) → Cursor / Windsurf / Trae (2023+) lineage"`.

The second phrasing matches the internal evidence-file prose better.

---

### [M] Finding 5: `application-to-open-knowledge.md` states the wrapper path inside `app.asar.unpacked/`, but D16's concrete design (and `extraResources` semantics) places it at `Contents/Resources/cli/bin/ok.sh`

**Category:** COHERENCE (cross-file) + minor FACTUAL (electron-builder behavior)
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:**
- `evidence/application-to-open-knowledge.md` line 45 (recommendation)
- `evidence/m6-implementation-design.md` line 20 ("lands at `Contents/Resources/cli/bin/ok.sh`"), line 53 (`CLI="$CONTENTS/Resources/cli/dist/cli.mjs"`), line 217 (`wrapperPathInBundle` returns `join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh')`)
- `electron-builder.yml` (current: `extraResources: - from: "../cli/dist/public" to: "app"` — places files directly under `Contents/Resources/`, not under `app.asar.unpacked/`)

**Issue:** D13's evidence file (`application-to-open-knowledge.md`) says (line 45):

> "/usr/local/bin/ok → /Applications/Open Knowledge.app/Contents/Resources/app.asar.unpacked/cli/bin/ok.sh"

D16's concrete design places the wrapper at `Contents/Resources/cli/bin/ok.sh` — **without the `app.asar.unpacked/` segment**. This matches how electron-builder's `extraResources` actually works: the `from`/`to` pair copies files directly into `Contents/Resources/<to>`, never into `app.asar.unpacked/` (which is an entirely different mechanism for files that must be extracted FROM `app.asar`). Verified against the current `packages/desktop/electron-builder.yml` — existing `extraResources` entry lands assets under `Contents/Resources/app/`, not `app.asar.unpacked/app/`.

The D52 spec wording ("bundled CLI inside `app.asar.unpacked/cli/`", SPEC line 843 and D52 decision text) is the original source of the confusion — D52 uses `app.asar.unpacked/cli/` to describe the bundled CLI's location, but D16's concrete implementation correctly uses `extraResources` (which lands at `Contents/Resources/cli/`). This is a **spec-vs-implementation drift that D16's design quietly resolves**, but the D13 evidence file still quotes the spec's path shape.

A reader comparing the two evidence files side by side would conclude they contradict each other.

**Current text (application-to-open-knowledge.md lines 42–48):**

> "**Recommendation**: confirm during M6 implementation that the symlink target path matches the actual placement. The spec currently says "app.asar.unpacked/cli/" — the wrapper script inside should be the install target:
>
> ```
> /usr/local/bin/ok → /Applications/Open Knowledge.app/Contents/Resources/app.asar.unpacked/cli/bin/ok.sh
> ```"

**Evidence:**
- [electron-builder `extraResources` docs](https://www.electron.build/configuration.html) — `extraResources` lands files at `Contents/Resources/<to>`; no `app.asar.unpacked/` prefix.
- `asarUnpack` is the separate mechanism that extracts matching files FROM `app.asar` into `Contents/Resources/app.asar.unpacked/<pattern>`. It operates on files already inside `app.asar`, not on resources copied via `extraResources`.
- D16's `m6-implementation-design.md` line 22 correctly states "Inside the packed `.app`, the script lands at `Contents/Resources/cli/bin/ok.sh`" and line 217 encodes that in `wrapperPathInBundle`.
- The current `packages/desktop/electron-builder.yml` already uses `extraResources` for the React bundle, which ships at `Contents/Resources/app/` (per the `to: "app"` line, not `app.asar.unpacked/app/`).

**Status:** INCOHERENT — D13 and D16 evidence files disagree on the wrapper's final on-disk path.

**Suggested resolution:** Update `application-to-open-knowledge.md` §"`app.asar.unpacked/cli/` vs `Contents/Resources/app/bin/`" subsection to (a) flag the spec-vs-`extraResources` wording mismatch, and (b) correct the path to `/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh`. Optionally note in D16 §2 that `extraResources` is the chosen mechanism (not `asarUnpack`) and explain why (the CLI dist is not inside `app.asar` to begin with — it's `../cli/dist`, so `extraResources` is the correct copy primitive). This also surfaces the question: should the D52 spec prose be post-hoc-corrected to say `Contents/Resources/cli/` instead of `app.asar.unpacked/cli/`? Out of scope for this research PR, but worth noting for the /implement handoff.

---

### [M] Finding 6: D16's "~300 net lines" LOC estimate is plausible but omits two files from the inventory

**Category:** FACTUAL (quantitative claim)
**Source:** T1 (own codebase) — user-flagged
**Location:**
- `REPORT.md` line 284 ("**Rough LOC estimate**: ~300 net lines")
- `evidence/m6-implementation-design.md` §7 "File-level change inventory" (lines 515–529)

**Issue:** D16's inventory lists:
- **New files** (3): `ok.sh`, `cli-install.ts`, `cli-install.test.ts`
- **Modified files** (3): `electron-builder.yml`, `menu.ts`, `index.ts`

The LOC breakdown in §7 line 529:

> "**Rough LOC estimate:** ~300 lines net (~250 in `cli-install.ts`, ~30 in menu.ts + index.ts, ~10 in electron-builder.yml, ~10 in ok.sh)."

Sums to exactly 300, which is a suspiciously round number. Two concerns:

1. **`cli-install.test.ts` is listed as a new file but not broken out in the LOC estimate.** The sample test block in the design doc (lines 403–431) is ~30 lines; a realistic test file with `installCli`/`uninstallCli` coverage (even as pure-function layer tests) would be ~50–100 lines. This is missing from the 300.
2. **`index.ts` modifications are rolled into the "~30 in menu.ts + index.ts" bucket** but the design spec's §5 "Launch-time broken-symlink repair" (~15 lines) AND the menu-wiring deps injection (another ~10 lines) both land in index.ts. Combined with the menu.ts diff (~20 lines for the conditional File-menu entry), the `menu.ts + index.ts` bucket is closer to ~45–50 lines, not ~30.
3. **`packages/desktop/README.md` docs addition** (D16 §7 line 527) is listed as a doc but not counted; could be another ~30–50 lines.

The actual `cli-install.ts` code sample in the design doc (lines 186–399) is ~200 lines of code plus ~60 lines of JSDoc block comments, ~260 total. The "~250" estimate undercounts comments slightly but is in the right ballpark.

Net: the "~300 net lines" framing is conservative-low; a realistic figure accounting for tests + README is ~400–500 lines. This doesn't change the report's conclusion ("one well-scoped PR, not a multi-week effort") but the specific number is optimistic.

**Current text (REPORT.md line 284):** "**Rough LOC estimate**: ~300 net lines. One well-scoped PR, not a multi-week effort."

**Status:** STALE / IMPRECISE (the estimate is fine as an order-of-magnitude, but the breakdown doesn't add up and omits named inventory items).

**Suggested resolution:** Either:
- Reframe the REPORT.md line to "~300–500 net lines of new code + tests + README" (acknowledges the range and the omitted inventory); OR
- Amend the D16 evidence §7 breakdown to include `cli-install.test.ts` (~60) and `packages/desktop/README.md` (~40) and land at "~400 net lines total" as the summary.

---

## Low Severity

### [L] Finding 7: `vscode-pattern.md` "Symlink/copy placed at `/usr/local/bin/code`" — VS Code's install is always a symlink, not a copy

**Category:** FACTUAL (imprecision)
**Source:** T5 (external claims)
**Location:** `evidence/vscode-pattern.md` line 31

**Issue:** The evidence file hedges:

> "Symlink/copy placed at `/usr/local/bin/code` pointing at `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`."

The "Symlink/copy" hedge is unnecessary — VS Code's Install 'code' action creates a **symlink**, not a copy. The rest of the evidence file (and the wrapper-script-IN-bundle reasoning, line 108) depends on the "it's a symlink" behavior: the symlink chain is what `app_realpath` walks at invocation time to locate the `.app`. A copy wouldn't have that property.

**Status:** INCOHERENT (minor prose contradiction — the next paragraphs of the same file assume "symlink").

**Suggested resolution:** Change "Symlink/copy placed" to "Symlink placed" in `vscode-pattern.md` line 31.

---

### [L] Finding 8: `vscode-pattern.md` inline script is byte-accurate but uses spaces where the source uses tabs

**Category:** FACTUAL (formatting fidelity)
**Source:** T4 (web verification) — user-flagged
**Location:** `evidence/vscode-pattern.md` lines 57–97 (inline quote of `code.sh`)

**Issue:** The script quoted in `vscode-pattern.md` is content-accurate — every line matches the current `microsoft/vscode/main/resources/darwin/bin/code.sh` I fetched, and the `@@APPNAME@@` / `@@NAME@@` build-time placeholders are preserved. One small deviation: the canonical file uses **tabs** for indentation inside the `if` and function bodies; the evidence file uses **spaces** (consistent with Markdown convention). This is purely cosmetic — no functional difference — but the user specifically asked whether the quote is "accurate and untouched."

Evidence file also omits three trailing lines that are in the canonical file on the same logical structure (the canonical file's line 40 `CONTENTS="$APP_PATH/Contents"` is the same; lines 41–45 exporting VSCODE_NODE_OPTIONS + unsetting NODE_OPTIONS are all present). The only other deviation is a minor line-break difference (canonical file does not have a blank line between `CONTENTS=` block and `export VSCODE_NODE_OPTIONS=`; evidence file preserves this faithfully). On re-read, the evidence quote is structurally identical.

**Status:** CONFIRMED with cosmetic reformatting only. Not a meaningful issue but flagged because the user asked to verify.

**Suggested resolution:** None required. Optionally note "(indentation reformatted from tabs to spaces for Markdown rendering; content byte-accurate)" below the code fence in `vscode-pattern.md`.

---

## Confirmed Claims (summary)

Verified and correct on T3/T4/T5 tracks:

- **VS Code `code.sh` content**: quoted script matches current `microsoft/vscode/main/resources/darwin/bin/code.sh` byte-for-byte (ignoring tab-vs-space indentation). `ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"` is the actual invocation line.
- **VS Code issue #209356**: closed as duplicate of #213909 — confirmed.
- **VS Code issue #213909**: closed as "not planned", title "Offer to move VS Code to the Applications folder" — confirmed.
- **SIP protection**: `/usr/local/bin` is NOT SIP-protected (explicitly excluded from the `/usr` protection per Apple's SIP guide); `/usr/bin` IS protected. Both claims in `install-mechanisms-matrix.md` line 62 are correct.
- **`ELECTRON_RUN_AS_NODE=1`**: Electron docs confirm "Starts the process as a normal Node.js process" — evidence description is accurate.
- **Atom → VS Code direct lineage**: Atom sunset 2022 confirmed; VS Code inherited the `osascript + symlink + `Command Palette` pattern confirmed.
- **Cursor inherits VS Code's Install action unchanged**: confirmed from community forum reports + fork inheritance (mechanism not rewritten). Cursor's separate `cursor-agent` CLI via `curl | bash` + `~/.local/bin` also confirmed from official docs.
- **D14 Bun-import audit**: independently replicated the grep across `packages/cli/src/`, `packages/core/src/`, `packages/server/src/` with `--exclude='*.test.ts'` and the `(Bun\.|from ['\"]bun:|require\(['\"]bun:)` regex — **zero matches**. Matches D14's conclusion exactly.
- **`packages/cli/package.json` claims**: `bin: { open-knowledge, ok }` confirmed; `engines.node: ">=22"` confirmed; `files: ["dist", "!dist/**/*.map"]` confirmed (so tests aren't published).
- **D52 spec wording**: `specs/2026-04-11-electron-desktop-app/SPEC.md` line 843 and line 1063 (D52 decision entry) confirm the "Install Command-Line Tools…" menu, two-symlink design, and `app.asar.unpacked/cli/` path wording. (See Finding 5 for the path-wording interpretation issue.)
- **Cross-referenced reports exist**: `reports/cli-command-name-ok-okb/`, `reports/mastra-speakeasy-cli-install-recommendations/`, `reports/electron-desktop-app-operations-2025/` all present.
- **Cross-referenced specs exist**: `specs/2026-04-11-electron-desktop-app/SPEC.md`, `specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md` both present.
- **`packages/desktop/electron-builder.yml` current state**: `extraResources` currently ships only `../cli/dist/public` (as D16 describes); `asarUnpack` covers `@napi-rs/keyring`, `@parcel/watcher`, `simple-git`, `**/*.node` (matches D16's grounding statement).
- **`packages/desktop/src/main/menu.ts` current state**: `MenuDeps` interface present; File submenu has "New Project…", "Open Folder…", "Open Recent", close/quit as D16 claims. "Install Command-Line Tools…" not yet present (correct — M6 hasn't shipped).
- **Executive Summary framing**: amendments D14–D16 extend the Key Findings bullet list (lines 58–70) and add dedicated D14/D15/D16 bullet points, so the opening paragraph still reading "the VS Code pattern + three recurring bugs" is not a center-of-gravity shift — the 3P core remains load-bearing and the 1P additions are appended rather than displacing. No finding needed here.
- **Rubric-to-evidence mapping**: every evidence file referenced in "### External Sources" and "### Evidence Files" sections resolves to an actual file on disk.
- **Report stance (D1–D12 Factual/3P vs D13/D14/D16 explicit 1P vs D15 mixed)**: stance markers are consistently applied; no leakage of "OK should…" prescriptive language into the D1–D12 findings. D15's mixed stance is correctly flagged at the top of `npm-electron-coexistence.md`.

---

## Unverifiable Claims

- **`evidence/vscode-pattern.md` claim that `installActions.ts` (VS Code's TypeScript handler for the install action) is "not located at expected paths via WebFetch"** — this is already self-flagged as a gap in the evidence file's "Gaps / follow-ups" section. Not verified further; no audit action.
- **Zed's admin-prompt mechanism** (`osascript` vs `sudo` vs AuthorizationServices) — `zed-pattern.md` explicitly marks this as "not explicitly fetched" in its "Gaps / follow-ups." No new verification attempted; low-harm gap.
- **electron-updater atomic-replacement semantics** — `signing-notarization-and-lifecycle.md` line 128 marks this as "assumed safe (the whole `.app` is moved atomically), but not verified." User-flagged as an open empirical question. Not verified here; low-harm for a research doc.
- **Whether VS Code's Install 'code' action on macOS uses a named entitlements helper process or stays in the renderer** — out of scope; not material to OK's derivation of the pattern.

---

## Top-level disposition

The report is in good shape. Two High-severity issues should block promoting this to "canonical research" status until fixed:

- **H1**: the D13 evidence file is self-inconsistent with D14's conclusion — a one-minute breadcrumb edit fixes it.
- **H2**: the D15 "npm silently overwrites" claim is factually wrong — a prose rewrite to describe the symmetric-EEXIST reality tightens the collision narrative without changing D16's `fs.lstat` guard recommendation.

The four Medium findings are either factual imprecisions in evidence files (M3, M5, M6) or a prose-vs-calendar-math miss (M4). None invalidate any load-bearing conclusion; all are cheap edits.

The two Low findings are minor prose hedges.

If the intent is to hand this off to `/implement` or `/ship` for M6 execution, fix H1 + H2 + M5 (the path inconsistency) before handoff — the M5 path-prefix mismatch is the kind of thing an implementer will either (a) catch and waste 30 minutes reconciling, or (b) miss and ship a broken wrapper-path. The other Mediums and Lows can ride in a follow-up polish pass.
