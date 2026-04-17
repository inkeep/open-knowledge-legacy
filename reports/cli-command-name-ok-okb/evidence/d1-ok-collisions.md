# Evidence: D1 — Collision audit for `ok`

**Dimension:** D1 — Is `ok` a viable CLI command name?
**Date:** 2026-04-16
**Sources:** local shell probes, npm registry, Homebrew, Debian/Ubuntu package search, GitHub

---

## Key sources referenced
- Local shell probes (darwin 25.3.0, zsh + bash)
- `npm view ok`
- `brew info ok`
- https://formulae.brew.sh/
- https://packages.debian.org/
- https://github.com/whiteinge/ok.sh
- https://github.com/man-group/okcli
- https://www.gnu.org/software/bash/manual/html_node/Reserved-Word-Index.html (POSIX reserved words)

---

## Findings

### Finding: `ok` is not a shell builtin or POSIX reserved word
**Confidence:** CONFIRMED
**Evidence:** local probe
```text
$ which ok         → ok not found
$ bash -c 'type ok'  → bash: type: ok: not found
$ zsh -c 'type ok'   → ok not found
$ bash 'help ok'     → no help topics match `ok'
```
POSIX reserved words are: `!`, `case`, `do`, `done`, `elif`, `else`, `esac`, `fi`, `for`, `function`, `if`, `in`, `select`, `then`, `until`, `while` — `ok` is not on the list.
**Implications:** Safe to install as a PATH executable on macOS/Linux without shadowing any builtin.

### Finding: `ok` is not a Homebrew formula
**Confidence:** CONFIRMED
**Evidence:** `brew info ok` → `Error: No available formula with the name "ok".`
**Implications:** No conflict with `brew install ok`.

### Finding: No Debian/Ubuntu package ships `/usr/bin/ok`
**Confidence:** CONFIRMED
**Evidence:** Subagent search of packages.debian.org returned only `kvm-ok` (from `cpu-checker` package) at `/usr/sbin/kvm-ok` — not an exact-name collision.
**Implications:** Installing via `apt`-repackaged tarball would not conflict.

### Finding: npm `ok@0.1.2` exists as a library (no `bin` field)
**Confidence:** CONFIRMED
**Evidence:**
```text
$ npm view ok
ok@0.1.2 | Proprietary | deps: none | versions: 1
Simple object validation
https://github.com/anthonyshort/ok
(no "bin" field shown)
```
**Implications:** No existing `ok` command is installed by `npm install -g ok`. This library has not been updated in years. Since the Inkeep CLI publishes as `@inkeep/open-knowledge` (scoped), the scoped package can declare `"bin": { "ok": "./dist/cli.js" }` without conflicting with the unscoped `ok` npm namespace.

### Finding: `ok.sh` (GitHub API client) and `okcli` (Oracle DB CLI) exist but are niche
**Confidence:** CONFIRMED
**Evidence:**
- https://github.com/whiteinge/ok.sh — bash-script GitHub API client. Binary name is `ok.sh`, not `ok`. Distribution is curl-to-file; not packaged in apt/brew.
- https://github.com/man-group/okcli — Oracle DB REPL. Binary name is `okcli`, not `ok`.
**Implications:** Soft association in shell-scripting circles; neither installs an `ok` binary on PATH.

### Finding: "OK" is universal colloquial English, not a protected brand
**Confidence:** CONFIRMED
**Evidence:** No trademark on the bare string "OK" applicable to developer tools. "OK" is Hawaiian-origin-adjacent ("okay") and universally understood as affirmation.
**Implications:** No brand confusion or legal exposure.

---

## Negative searches (NOT FOUND)
- `ok` as a Homebrew cask — not found
- `ok` as an Arch Linux package — not found (subagent check)
- `ok` as a well-known CLI tool with non-trivial install base — nothing prominent on GitHub trending or awesome-cli lists

---

## Gaps / follow-ups
- Windows semantics (PowerShell, cmd.exe) not investigated — per rubric non-goals.
- TAB-completion namespace impact: `ok` is a short prefix matching many English words; users frequently-used shell may aggressively autocomplete. Not a hard collision but a UX nit.

---

## Severity: **SOFT**
`ok` is essentially clear — no shell, PATH, Homebrew, or npm-bin collisions. Only soft associations are `ok.sh` (niche GitHub tool) and `okcli` (Oracle REPL), neither of which claims the bare `ok` binary name.
