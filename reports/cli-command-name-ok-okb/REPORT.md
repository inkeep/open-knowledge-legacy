---
title: "Short CLI Command Name: `ok` vs `okb` vs Alternatives for @inkeep/open-knowledge"
description: "Collision audit and naming-convention survey to decide whether `ok`, `okb`, or a short alternative should replace the verbose `open-knowledge` binary. Covers shell/PATH/npm/Homebrew/apt conflicts, brand associations, and precedent from ripgrep, fd, bat, bun, jj, and others."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - open-knowledge
  - CLI naming
  - ripgrep
  - fd
  - bat
  - npm bin
  - OKB token
  - Ink.js
  - Federated Wiki
topics:
  - CLI command naming
  - short-name collision audit
  - package vs binary name split
---

# Short CLI Command Name: `ok` vs `okb` vs Alternatives

**Purpose:** Decide whether `ok`, `okb`, or a short alternative should become the global CLI command for `@inkeep/open-knowledge`, replacing the verbose `open-knowledge` binary. The reader cares about: (1) any hard PATH/registry/shell collision that would break installs, (2) any brand/acronym confusion that would undermine adoption, and (3) a ranked recommendation with evidence.

---

## Executive Summary

**Recommendation: Ship `ok` as the primary binary.** The package stays `@inkeep/open-knowledge` (matches [ripgrep](https://github.com/BurntSushi/ripgrep)'s long-package / short-binary precedent). During migration, declare both `"bin": { "open-knowledge": ..., "ok": ... }` so existing users are not broken.

`ok` is the best-available short name because it is the only 2-char candidate that is simultaneously (a) free of hard collisions on shell builtins, `/usr/bin`, Homebrew, and npm bins; (b) pronounceable and universally recognized as an affirmation; and (c) an intuitive prefix for `ok init`, `ok start`, `ok mcp` subcommands already shipping.

`okb` is viable at the system level but carries a [hard brand collision with the OKB cryptocurrency token](https://www.okx.com/en-us/learn/okb) (utility token of the OKX exchange, consistently ranked among the top cryptocurrencies by market cap since 2018). Search-engine results for "okb" are dominated by crypto content — any blog post, tutorial, or screencast referring to `okb <cmd>` will compete with heavy crypto SEO.

**Key Findings:**

- **`ok` is clear of hard collisions.** Not a bash/zsh/POSIX builtin. No Homebrew formula. No Debian/Ubuntu/Arch package at `/usr/bin/ok`. npm `ok@0.1.2` exists as a library with no `bin` field — publishing `@inkeep/open-knowledge` with `"bin": { "ok": ... }` is mechanically supported and non-conflicting.
- **`okb` has a severe brand collision.** [OKB](https://www.okx.com/en-us/learn/okb) is a widely-traded cryptocurrency token from the OKX exchange. No PATH conflict, but search-engine and community-context collisions are persistent and high-cost.
- **Popularity data (pulled 2026-04-16)** quantifies the collision severity — see the [Popularity of Colliding Projects](#popularity-of-colliding-projects) section below. Headline numbers: `ink` collides with Vadim Demedes' 2.99M-weekly-downloads / 37.7k-star library; `kb` with gnebbia/kb's 3.4k-star PyPI CLI; `openkb` with VectifyAI/OpenKB's 179-star actively-growing PyPI CLI.
- **Four alternatives are flat-out unsafe:** `wiki` (active npm bin via [Federated Wiki](https://github.com/fedwiki/wiki) + deprecated Homebrew formula), `ink` ([Debian `/usr/bin/ink`](https://manpages.debian.org/unstable/ink/ink.1.en.html) printer-ink checker + [Ink.js React-for-CLI](https://github.com/vadimdemedes/ink) mega-brand at ~3M weekly downloads), `kb` ([gnebbia/kb](https://github.com/gnebbia/kb) PyPI note manager with 3.4k stars **plus** kilobyte/keyboard acronym overload), **and `openkb` — direct bin + subcommand + domain collision** with [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) PyPI CLI.
- **The long-package / short-binary split is a well-established pattern.** [ripgrep](https://github.com/BurntSushi/ripgrep) publishes as `ripgrep` with binary `rg`. [fd](https://github.com/sharkdp/fd) publishes as `fd-find` with binary `fd`. npm `"bin"` supports arbitrary command names per package, and scoped packages (`@inkeep/open-knowledge`) may declare unscoped bins (`ok`) without registry conflict.
- **2-char names are defensible for Inkeep's use case,** though CLI-design heuristics ([Small Step](https://smallstep.com/blog/the-poetics-of-cli-command-names/), [clig.dev](https://clig.dev/)) reserve them for tools used "all the time." `ok` gets away with it because of brand strength (universal affirmation) — the same logic that justifies `gh` for GitHub CLI despite it being used only a few times per day.
- **A zero-cost migration exists:** ship both bins for one release, document deprecation, drop `open-knowledge` in v2.0. No users lose muscle memory.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Collision audit — `ok` (shell, PATH, Homebrew, npm bin, Debian/Ubuntu/Arch) | Deep | P0 |
| D2 | Collision audit — `okb` (same + known-acronym / brand check) | Deep | P0 |
| D3 | Conventions for short CLI names (2–3 chars) from `gh`, `rg`, `fd`, `bat`, `bun`, `jj`, etc. | Moderate | P0 |
| D4 | Alternative short names: `oknow`, `oknw`, `wiki`, `kb`, `onk`, `ink`, `know`, `openkb` | Moderate | P0 |
| D5 | Collision mitigation strategies (multi-bin, aliases, rename precedent) | Light | P1 |

**Non-goals:** Windows PATH semantics, trademark/legal search, renaming migration mechanics for existing users, logo/brand identity, npm-org ownership questions.

**Stance:** Conclusions-allowed — ranked recommendation with evidence.

---

## Detailed Findings

### D1 — `ok` collision audit

**Finding:** `ok` is free of hard collisions across all surveyed registries and shell environments.

**Evidence:** [evidence/d1-ok-collisions.md](evidence/d1-ok-collisions.md)

| Surface | Result |
|---------|--------|
| bash / zsh / POSIX | Not a builtin, alias, or reserved word |
| `/usr/bin` on macOS | Not present |
| Homebrew formula | None |
| Debian/Ubuntu packages | None (only `kvm-ok` at `/usr/sbin/kvm-ok`, different path) |
| Arch / AUR | None |
| npm `bin` field | npm `ok@0.1.2` has no bin — globally installable without collision |
| GitHub projects | [ok.sh](https://github.com/whiteinge/ok.sh) (bash GitHub API client, niche) and [okcli](https://github.com/man-group/okcli) (Oracle DB REPL, niche) — neither claims the bare `ok` binary |
| Brand | "OK" is colloquial English, no trademark concerns |

**Implications:** A user running `npm install -g @inkeep/open-knowledge` and then typing `ok init` will succeed on any vanilla macOS or Linux system.

**Decision triggers:**
- If Inkeep ever wants to publish to Debian/apt directly, the `ok` binary path is still free. No distro-rename workaround needed.
- If Inkeep later adds a Homebrew tap, the formula can be named `open-knowledge` with binary `ok`, same as ripgrep.

**Remaining uncertainty:**
- TAB-completion UX: `ok` is a short prefix for many English words a user may have as aliases or scripts. Not a hard collision; only a minor autocompletion-noise concern.

---

### D2 — `okb` collision audit

**Finding:** `okb` is system-clear but has a HARD brand collision with the [OKB cryptocurrency token](https://www.okx.com/en-us/learn/okb).

**Evidence:** [evidence/d2-okb-collisions.md](evidence/d2-okb-collisions.md)

| Surface | Result |
|---------|--------|
| Shell / PATH / builtin | Clear |
| Homebrew | None (closest formula is `oksh`, a KornShell port) |
| Debian/Ubuntu/Arch | None |
| npm `bin` | npm `okb@0.0.0` is a 387-byte placeholder squat with no bin |
| **Brand** | **[OKB](https://coinmarketcap.com/currencies/okb/) is the official utility token of the [OKX exchange](https://www.okx.com/). Top-50 cryptocurrency by market cap since 2018. Google-search results for "okb" are dominated by crypto content.** |

**Implications:** The technical viability is irrelevant because the name is semantically pre-claimed in a loud, SEO-dominant domain. Anyone posting `okb init` in a tutorial, talk, or social thread will be miscategorized by search engines and by readers who skim. Users in Inkeep's AI-dev-tools audience overlap substantially with the crypto audience.

**Decision triggers:**
- If Inkeep's audience excludes crypto overlap entirely (e.g., enterprise-only), the SEO risk reduces. For an OSS tool with public launch intent, the risk is high.

**Remaining uncertainty:**
- None. OKB is a durable brand. The token is unlikely to disappear on any timeline relevant to Inkeep's release planning.

---

### D3 — Short CLI name conventions

**Finding:** Successful 2-4 char CLIs follow four patterns: known-initials (`gh`, `bw`), compound-pronounceable (`bat`, `dust`, `sd`), arbitrary-short-word (`bun`, `jj`, `zed`), and the long-package / short-binary split ([ripgrep](https://github.com/BurntSushi/ripgrep) ships as `ripgrep` crate + `rg` binary). 2-char names are traditionally reserved for tools used daily across many shell sessions, but the bar is lowered when the short name is universally recognized or brand-backed.

**Evidence:** [evidence/d3-short-cli-conventions.md](evidence/d3-short-cli-conventions.md)

Key data points:

- **ripgrep's split is explicit in Cargo.toml** (`package.name = "ripgrep"`, `[[bin]] name = "rg"`). Homebrew names the formula `ripgrep` and installs binary `rg`.
- **fd's split is forced by collision:** [fd](https://github.com/sharkdp/fd) publishes as `fd-find` on crates.io and apt because Debian's `fd` package was already taken. Debian installs the binary as `fdfind`; the README recommends a user-level symlink to get back to `fd`.
- **bat's collision resolved upstream:** `/usr/bin/bat` was claimed by the Bareos BAT backup tool; [bat](https://github.com/sharkdp/bat) shipped as `batcat` on Debian until Bareos BAT was removed (Debian 12+, 2023).
- **npm `"bin"` is fully flexible:** supports `{ "commandName": "./script.js" }`, independent of package name. Scoped packages may declare unscoped bins ([`@anthropic-ai/claude-code`](https://www.npmjs.com/package/@anthropic-ai/claude-code) installs the `claude` command).
- **[Clig.dev](https://clig.dev/)** CLI design guide: "Keep it short, as users will be typing it all the time. However, don't make it too short: the very shortest commands are best reserved for the common utilities used all the time."
- **[Small Step](https://smallstep.com/blog/the-poetics-of-cli-command-names/)** — "Very short names should be reserved for utilities people use all the time, like `cd`, `ls`, `rg`."

**Implications for `ok`:** Open Knowledge is not invoked dozens of times per session. By the strict heuristic, 3-4 chars would be more "calibrated." But `gh` breaks the strict heuristic too (used perhaps 2-5 times per day for many users) and succeeds because of brand strength. `ok` has the same property — it's universally known English. The strict-brevity rule is a guideline, not a constraint.

**Decision triggers:**
- If usage frequency is expected to be < once per day for typical users, 3+ chars may feel more proportionate. The user's current framing (`ok init` as a daily-ish AI-dev-tooling invocation) supports 2 chars.

---

### D4 — Alternative short names

**Finding:** Of the surveyed alternatives, `oknow` is the only clear-and-pronounceable option; `oknw` is clear but unpronounceable; `wiki`, `ink`, `kb`, `openkb` are hard collisions (and `openkb` is the most severe — direct bin + subcommand + domain collision with the [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) PyPI CLI); `onk` and `know` are soft and weak.

**Evidence:** [evidence/d4-alternative-names.md](evidence/d4-alternative-names.md)

| Candidate | Severity | Issue |
|-----------|----------|-------|
| `oknw`    | CLEAR    | Unpronounceable letter-salad |
| `oknow`   | CLEAR    | 5 chars — weak brevity win |
| `know`    | CLEAR    | Generic English verb, weak brand |
| `onk`     | SOFT     | Obscure npm `onk` (vue scaffold) has `bin: onk`; phonetically awkward |
| `kb`      | HARD     | Acronym overload: kilobyte / keyboard / knowledge-base |
| `wiki`    | HARD     | [Federated Wiki](https://github.com/fedwiki/wiki) npm has active `bin: wiki`; deprecated Homebrew formula |
| `ink`     | HARD     | [Debian `/usr/bin/ink`](https://manpages.debian.org/unstable/ink/ink.1.en.html) printer util + [Ink.js](https://github.com/vadimdemedes/ink) React-for-CLI mega-brand |
| **`openkb`** | **HARD (worst)** | [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) PyPI CLI ships `openkb` bin with `init/add/query/chat` subcommands in the same LLM-KB domain; npm `openkb@1.0.22` ([mrvautin/openKB](https://github.com/mrvautin/openKB)) is an active KB/wiki web app. Direct bin + subcommand + domain collision. |

**Implications:** The only alternative that meaningfully beats `ok` on collision safety is `oknow`, and it costs 3 characters of length plus loses the recognizability anchor ("ok" is a universal affirmation; "oknow" is a contrived pun). None of these is a compelling upgrade over `ok`.

**Decision triggers:**
- If stakeholders feel `ok` is too generic and want more distinctiveness, `oknow` is the safest fallback. All other candidates have real problems.

---

### D5 — Mitigation patterns

**Finding:** npm `"bin"` supports multiple commands per package, enabling a zero-risk migration from `open-knowledge` to `ok`.

**Evidence:** [evidence/d5-mitigation-patterns.md](evidence/d5-mitigation-patterns.md)

Synthesized migration recipe:
1. **Ship both bins during transition:**
   ```json
   "bin": {
     "open-knowledge": "./dist/cli.js",
     "ok": "./dist/cli.js"
   }
   ```
2. **Primary docs, `init` output, MCP-registration templates use `ok`.**
3. **Add a one-line deprecation notice when invoked as `open-knowledge`:** `[deprecated — use 'ok' instead. Both will work until v2.0]`.
4. **Do NOT rename the npm package.** `@inkeep/open-knowledge` stays — matches the ripgrep/fd-find precedent. SEO, registry search, and changelog continuity are preserved.
5. **MCP server name stays `open-knowledge`;** the command invoked in `.mcp.json` becomes `ok mcp`.

**Implications:** Zero breakage risk. Users with existing `open-knowledge` in shell history keep working; new docs and screencasts introduce `ok` without any flag-day migration.

---

## Popularity of Colliding Projects

Pulled 2026-04-16 from the npm downloads API (week of 2026-04-09 to 2026-04-15) and the GitHub REST API.

| Candidate | Top colliding project | Kind | Weekly npm DL | GitHub ★ | Activity (last push) | Bin on PATH? |
|-----------|----------------------|------|---------------:|---------:|----------------------|--------------|
| `ink`    | [vadimdemedes/ink](https://github.com/vadimdemedes/ink) — React for CLI | npm lib | **2,994,443** | **37,740** | 2026-04-14 ✅ | No (lib), but nuclear brand |
| `kb`     | [gnebbia/kb](https://github.com/gnebbia/kb) — note manager (`pip install kb-manager`) | PyPI CLI | (npm `kb`: 41) | **3,373** | 2025-06-21 ⚠️ stale-ish | **Yes — PyPI ships `kb`** |
| `wiki`   | [fedwiki/wiki](https://github.com/fedwiki/wiki) — Federated Wiki | npm CLI | 193 | 367 | 2026-04-13 ✅ | **Yes — npm `bin: wiki`** |
| `openkb` | [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) — LLM KB CLI + [mrvautin/openKB](https://github.com/mrvautin/openKB) — archived web app | PyPI CLI + npm app | 42 (mrvautin) | 179 (Vectify, active) + 658 (mrvautin, archived Dec 2024) | 2026-04-13 ✅ / archived | **Yes — PyPI ships `openkb`** |
| `ok`     | [whiteinge/ok.sh](https://github.com/whiteinge/ok.sh) — bash GitHub API client | bash script | (npm `ok`: 67, no bin) | 435 | 2025-09-29 ✅ | No (bin is `ok.sh`) |
| `onk`    | obscure vue scaffold | npm CLI | 10 | n/a | stale | Soft only |
| `know`   | abandoned data-structure cache | npm lib | 10 | n/a | stale | No |
| `okb`    | npm placeholder + [OKB crypto token](https://www.okx.com/en-us/learn/okb) | brand / placeholder | 3 | n/a | n/a | No (brand) |
| `oknow`  | abandoned promise lib | npm lib | 1 | n/a | stale | No |
| `oknw`   | (nothing) | — | 0 | n/a | — | No |

### ASCII weekly-downloads chart (log scale)

```
ink     ████████████████████████████████████████████████  2,994,443
wiki    ██                                                      193
ok      █                                                        67
openkb  █                                                        42
kb      █                                                        41
know    ▏                                                        10
onk     ▏                                                        10
okb     ▏                                                         3
oknow   ▏                                                         1
oknw    —                                                         0
```

### ASCII GitHub stars (top colliding project, linear)

```
ink      ████████████████████████████████████████████████  37,740
gnebbia/kb       █████                                     3,373
mrvautin/openKB  █                          658            (archived)
ok.sh            ▌                          435
fedwiki/wiki     ▌                          367
VectifyAI/OpenKB ▏                          179
okcli (Oracle)   ▏                          54
```

### What the data changes

- **`ink` is confirmed unusable.** 3 million weekly downloads + 37.7k stars in the exact same CLI-authoring space. Any blog post using `ink` for anything other than the Vadim Demedes library will be miscategorized 100% of the time.
- **`kb` is worse than "acronym overload" — it's a real PATH collision.** [gnebbia/kb](https://github.com/gnebbia/kb) is a pip-installable CLI (`pip install kb-manager` → `kb` binary) with 3.4k stars, and it's a *knowledge-base manager* — same domain as Inkeep's tool. Severity remains **HARD**, but the rationale is now primarily PyPI-bin collision, not just acronym confusion.
- **`openkb` is confirmed as the worst semantic match** — the PyPI side (VectifyAI, 179 stars, active) is smaller than `kb`/`ink` in raw numbers but is a **direct, growing LLM-knowledge-base product** with near-identical subcommand surface. It's the highest-risk confusion per-user-encounter.
- **`ok`'s numbers validate the soft-collision label.** npm `ok` has 67 weekly downloads as a library (no bin). `ok.sh` has 435 stars but doesn't claim the `ok` bin name. Nothing in the data elevates the severity.
- **`okb` numbers are trivial on the software side** (3 npm weekly downloads); the concern remains brand/SEO only.

---

## Recommendation

**Ship `ok` as the primary binary.** Package stays `@inkeep/open-knowledge`. During one release window, ship both bins. The migration is zero-cost and follows the ripgrep/fd precedent.

**Ranked alternatives** (in case `ok` is vetoed by a non-evidence consideration like leadership preference):

| Rank | Candidate | Why |
|------|-----------|-----|
| 1 | **`ok`** | Soft collisions only; home-row typeable; universal affirmation; intuitive `ok <verb>` |
| 2 | `oknow` | Clear but 5 chars; pronounceable "oh-know"; weak brevity win |
| 3 | `onk` | Soft (obscure npm bin); phonetically awkward, no anchor — fallback only |
| — | `okb`, `kb`, `wiki`, `ink` | Hard collisions or brand conflicts — avoid |
| — | **`openkb`** | **Worst collision on the list** — PyPI `openkb` (VectifyAI) ships same bin + same `init/add/query/chat` subcommands + same LLM-KB domain. Avoid unequivocally. |
| — | `oknw`, `know` | Clear but unpronounceable or generic — no reason to pick over `ok` |

---

## Limitations & Open Questions

### Dimensions not fully covered
- **Windows (PowerShell, cmd.exe)** — per rubric non-goals. If Windows becomes a primary target, re-probe PATH and PowerShell alias conflicts.
- **Real-world TAB-completion noise** — `ok` is a short prefix; in a shell with many aliases, TAB may have several candidates. Not quantified.
- **Homebrew publishing path** — prior reports assume no Homebrew distribution yet. If pursued, formula would name `open-knowledge` with binary `ok` (same as ripgrep).

### Out of scope (per rubric)
- Trademark / legal search
- Logo and brand-identity alignment
- Renaming migration for internal/Inkeep consumers
- MCP server-name conventions (separate from CLI bin name)

---

## References

### Evidence files
- [evidence/d1-ok-collisions.md](evidence/d1-ok-collisions.md) — `ok` collision audit across shell/PATH/Homebrew/apt/npm
- [evidence/d2-okb-collisions.md](evidence/d2-okb-collisions.md) — `okb` audit + OKB crypto brand analysis
- [evidence/d3-short-cli-conventions.md](evidence/d3-short-cli-conventions.md) — short CLI naming patterns survey
- [evidence/d4-alternative-names.md](evidence/d4-alternative-names.md) — alternatives audit
- [evidence/d5-mitigation-patterns.md](evidence/d5-mitigation-patterns.md) — migration + multi-bin strategy

### External sources
- [ripgrep](https://github.com/BurntSushi/ripgrep) — long-package / short-binary precedent (Cargo.toml split)
- [fd](https://github.com/sharkdp/fd) — collision-forced rename, issue [#1009](https://github.com/sharkdp/fd/issues/1009)
- [bat](https://github.com/sharkdp/bat) — Debian upstream-collision resolution story
- [Ink.js](https://github.com/vadimdemedes/ink) — React-for-CLI; brand collision for `ink`
- [Federated Wiki](https://github.com/fedwiki/wiki) — active npm `wiki` CLI
- [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) — PyPI `openkb` LLM knowledge-base CLI (direct collision)
- [mrvautin/openKB](https://github.com/mrvautin/openKB) — npm `openkb` markdown KB/FAQ web app (semantic collision)
- [Debian `ink` manpage](https://manpages.debian.org/unstable/ink/ink.1.en.html) — printer ink checker
- [OKB token](https://www.okx.com/en-us/learn/okb) — crypto brand conflict
- [Small Step — Poetics of CLI Command Names](https://smallstep.com/blog/the-poetics-of-cli-command-names/)
- [Command Line Interface Guidelines](https://clig.dev/)
- [npm `package.json` bin docs](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#bin)

### Related research
- [reports/npm-global-cli-packaging/REPORT.md](../npm-global-cli-packaging/REPORT.md) — prior packaging decisions that chose `open-knowledge` as the bin name
- [reports/zero-config-bunx-cli-packaging/REPORT.md](../zero-config-bunx-cli-packaging/REPORT.md) — `bunx @inkeep/open-knowledge` zero-config path
