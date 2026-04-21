# Evidence: Desktop-bundled `ok` vs npm-global `ok` — coexistence, collision, version drift

**Dimension:** D15 (npm global install vs Electron-bundled CLI: are they compatible?)
**Date:** 2026-04-21
**Stance:** Mixed 3P/1P. The shell PATH and npm install semantics are 3P (documented behavior). Applied conclusions for OK are 1P.
**Sources:** [npm docs on prefix](https://docs.npmjs.com/cli/v11/commands/npm-prefix), [VS Code issue #154163](https://github.com/microsoft/vscode/issues/154163), [npm/cli#1869](https://github.com/npm/cli/issues/1869), fnm / Homebrew / nvm docs, direct shell observation on this machine

---

## Findings

### Finding: `npm i -g <pkg>` puts binaries in `$(npm config get prefix)/bin` — a path that varies wildly by Node install method

**Confidence:** CONFIRMED
**Evidence:** npm docs + direct observation

`npm config get prefix` returns:

| Node install method | npm prefix | `ok` binary ends up at |
|---|---|---|
| **fnm** (this machine's setup) | `~/.local/share/fnm/node-versions/vXX.X.X/installation` | `~/.local/share/fnm/.../bin/ok` |
| **nvm** | `~/.nvm/versions/node/vXX.X.X` | `~/.nvm/.../bin/ok` |
| **volta** | `~/.volta` | `~/.volta/bin/ok` |
| **Homebrew Node (Apple Silicon)** | `/opt/homebrew` | `/opt/homebrew/bin/ok` |
| **Homebrew Node (Intel)** | `/usr/local` | `/usr/local/bin/ok` ⚠ |
| **nodejs.org installer (legacy)** | `/usr/local` | `/usr/local/bin/ok` ⚠ |
| **asdf, mise** | tool-specific shim | tool-specific shim path |

The ⚠-marked rows are the **collision zone**: Intel Mac + Homebrew Node OR legacy nodejs.org installer put `npm i -g` output at the SAME `/usr/local/bin/ok` that OK's Electron "Install Command-Line Tools…" action also targets.

**Observed on this (Apple Silicon fnm) machine:**

```bash
$ which -a ok
ok not found
$ npm config get prefix
/Users/andrew/.local/share/fnm/node-versions/v22.18.0/installation
$ brew --prefix
/opt/homebrew
```

With fnm, `/usr/local/bin/ok` and `~/.local/share/fnm/.../bin/ok` are **entirely separate paths**. Zero collision.

**Implications:**

- **No collision on Apple Silicon** where users run Homebrew Node or fnm / nvm / volta. The dominant modern Mac developer setup.
- **Collision on Intel Macs** using Homebrew Node or legacy installers. Still a meaningful population.
- **Apple Silicon users with legacy `/usr/local`-targeted Node**: rare but possible; someone who ran the `nodejs.org` installer before migrating to Apple Silicon would still have `/usr/local/bin/ok` from a stale install.

---

### Finding: When collision occurs, shell PATH resolution picks whichever `$PATH` entry appears first

**Confidence:** CONFIRMED
**Evidence:** POSIX shell semantics; observed behavior across VS Code / Docker Desktop / Cursor users

The shell runs the FIRST executable it finds by walking `$PATH` left-to-right. macOS `/etc/paths` default ordering (as shipped):

```
/usr/local/bin
/usr/bin
/bin
/usr/sbin
/sbin
```

On Apple Silicon with Homebrew, the Homebrew install script inserts `/opt/homebrew/bin` BEFORE `/usr/local/bin` via `eval "$(/opt/homebrew/bin/brew shellenv)"` in the user's shell profile. Net effective order for a typical setup:

```
/opt/homebrew/bin      # Homebrew
~/.local/share/fnm/... # if fnm
~/.nvm/...             # if nvm
/usr/local/bin         # system (+ Intel Homebrew + legacy Node)
/usr/bin /bin ...
```

**When both Electron and npm have installed `ok`:** `/opt/homebrew/bin/ok` (npm via Apple Silicon Homebrew Node) wins over `/usr/local/bin/ok` (Electron symlink). User runs the npm version.

**Implications:**

- No version drift *bug* — both binaries execute equivalent code. But the USER sees the npm version's `--version` output, not the Electron-bundled version's. Version drift is invisible until something diverges (e.g., a change only on main that hasn't shipped to npm yet).
- The OK spec D52 explicitly acknowledges this ("shell resolves to whichever appears first in `$PATH` entries") — which is the correct posture.

---

### Finding: Direct collision at `/usr/local/bin/ok` — npm install vs Electron install — produces a last-writer-wins scenario

**Confidence:** CONFIRMED (by npm + VS Code install semantics)
**Evidence:** VS Code issue #154163 EACCES behavior, npm bin install behavior, symlink/file overwrite rules

When `/usr/local/bin/ok` is contested (Intel Mac, legacy Node, both want the path):

**Case A: `npm i -g @inkeep/open-knowledge` first, then Electron "Install Command-Line Tools…"**

1. `npm` creates a shim file at `/usr/local/bin/ok` that points into `node_modules` (not a symlink — npm writes a small wrapper script/shell stub on Unix).
2. User clicks "Install Command-Line Tools…" in OK Electron.
3. OK spec D52 implementation: "Subsequent menu clicks no-op if both symlinks already exist and point at the current app bundle."
   - BUT the existing file at `/usr/local/bin/ok` is the **npm shim, NOT a symlink** to the OK.app.
   - If OK's install action `fs.lstat`s the path and it's not the expected symlink target, what does it do? Two valid behaviors:
     - **(a) Refuse + prompt**: "Another `ok` already exists at `/usr/local/bin/ok` (owned by npm). Replace it?" ← most conservative.
     - **(b) Overwrite silently**: break the npm install without warning. ← aggressive, Docker-Desktop-style. **Avoid.**
4. Recommended: **(a) — prompt**. Adds one dialog but preserves user intent.

**Case B: OK Electron menu first, then `npm i -g @inkeep/open-knowledge`**

1. OK's install creates symlink `/usr/local/bin/ok` → app bundle.
2. User runs `npm i -g @inkeep/open-knowledge`.
3. npm's behavior: it replaces the existing file at `/usr/local/bin/ok` with its shim. npm does NOT check whether the existing file is a foreign symlink. **npm wins, silently.**
4. OK Electron's next launch: has no notification; the menu status indicator still says "Installed" (assuming it only checks existence, not target). Broken until `ok mcp` fails with a different-content error.

**Implications:**

- **This is an asymmetric collision.** npm will silently overwrite the Electron symlink; Electron (per D52) can choose to not overwrite npm's shim. The defensive posture for OK is:
  1. Install action checks `fs.lstat` result against expected symlink target; if the path exists and is NOT the expected symlink, DO NOT overwrite — prompt the user.
  2. On app launch, **status check** the install state: if `/usr/local/bin/ok` exists but points somewhere unexpected (npm shim, old app path), offer "Fix / Replace" action.
- **Documentation needed** in `packages/desktop/README.md`: "If you have both `npm i -g @inkeep/open-knowledge` and the desktop app installed, remove one to avoid PATH shadowing. Running `which -a ok` tells you which one is active."

---

### Finding: `npm uninstall -g @inkeep/open-knowledge` does NOT touch the Electron symlink

**Confidence:** CONFIRMED
**Evidence:** npm-uninstall docs + [npm/cli#1869](https://github.com/npm/cli/issues/1869) class of bugs

npm's uninstall logic:

1. Removes the package from `$(npm config get prefix)/lib/node_modules/@inkeep/open-knowledge/`.
2. Removes the bin shim at `$(npm config get prefix)/bin/ok` ← only if that shim was created by npm AND the shim target is the removed package.
3. If `/usr/local/bin/ok` is a symlink pointing into `/Applications/Open Knowledge.app/...` (Electron-created), npm's uninstall logic skips it — the shim isn't owned by npm.

**Conversely, dragging `Open Knowledge.app` to Trash does NOT remove the npm-installed `ok`** at `$(npm config get prefix)/bin/ok`. The npm install is filesystem-separate from the `.app`.

**Implications:**

- **The two install paths are independently manageable.** Uninstalling one doesn't break the other. This is the correct isolation — users can mix-and-match.
- **Dangling-symlink risk is asymmetric**: Electron leaves a dangling `/usr/local/bin/ok` if user trashes `.app` without running "Uninstall Command-Line Tools". npm leaves its shim intact if user manually deletes `node_modules/`. Both are industry-standard quirks.

---

### Finding: MCP config paths reveal which install origin wrote them

**Confidence:** CONFIRMED
**Evidence:** OK spec D52 MCP-config-write preference

Per D52, OK writes MCP entries with **different shapes depending on origin**:

- **CLI-origin `ok init`** (user ran from terminal, so has Node): `{"command": "npx", "args": ["-y", "@inkeep/open-knowledge", "mcp"]}`
- **Electron-origin `runInit`** (user may not have Node): `{"command": "/usr/local/bin/ok", "args": ["mcp"]}`

The Electron-origin form hard-codes `/usr/local/bin/ok`. This bypasses shell PATH resolution entirely — the MCP client (Claude Desktop, Cursor, etc.) invokes the absolute path. Consequence:

- **Electron-origin MCP entry + user later uninstalls `.app`**: the absolute path breaks. MCP stops working. The user's client reports "command not found" or similar. `ok init --force` from CLI, OR clicking "Install Command-Line Tools" after re-installing, restores it.
- **CLI-origin MCP entry + user uninstalls npm version**: `npx -y @inkeep/open-knowledge mcp` still works — npx fetches on demand. More robust.

**Implications for OK:**

- **The D52 hardcoded-path MCP write is load-bearing** for P1 (no Node). Correct call.
- **An edge case worth documenting**: if a P1 user installs Electron, writes MCP configs via the Electron init flow, then deletes `.app` and switches to CLI distribution, their MCP configs break. Solution: `ok init --force` from the new CLI install rewrites them to use `npx`. Or OK could detect on Electron uninstall (if we had that hook) and offer to migrate. Out of scope for M6.

---

### Finding: MCP CLI discovery (`ok mcp`'s server-lock reader) works uniformly regardless of install origin

**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/mcp.ts` `discoverServerUrl()` behavior (per CLAUDE.md §"Package: cli")

From CLAUDE.md:

> `src/commands/mcp.ts` — MCP stdio server command; `discoverServerUrl()` reads `<contentDir>/.open-knowledge/server.lock` for zero-config port discovery. Precedence: `--port` override > live lock with port > 0 > disk-only fallback.

The `server.lock` is per-project (inside the content directory), not per-install. Whichever `ok` binary runs, it reads `server.lock` from the current working directory. **Which `ok` binary ran is irrelevant** to the MCP discovery behavior.

**Implications:** Functionally, the npm-installed `ok mcp` and the Electron-bundled `ok mcp` are behaviorally identical at the filesystem-interaction level. They find the same running Hocuspocus (if any) via the same lock file. This is the correctness floor that makes coexistence safe.

---

## Summary — is desktop + npm compatible?

**Yes, with three caveats documentable in `packages/desktop/README.md`:**

1. **Non-Intel Macs**: zero collision. The two binaries live at different paths; shell resolves via PATH precedence. Users can have both with no bug. The user of this worktree (Apple Silicon + fnm) is in this category.

2. **Intel Macs with legacy/Homebrew-intel Node**: `/usr/local/bin/ok` is contested. OK's install action should:
   - Check `fs.lstat` before overwriting; prompt if the existing file is a foreign shim.
   - On launch, detect and offer to fix broken/mispointed symlinks.
   - NOT silently overwrite (Docker Desktop anti-pattern).

3. **MCP config durability**: Electron-origin configs hard-code `/usr/local/bin/ok`. Durable as long as Electron is installed. CLI-origin configs use `npx`, durable as long as `@inkeep/open-knowledge` is npm-reachable. If a user transitions install methods, `ok init --force` repairs.

**None of these require spec amendment.** D52's existing posture ("coexist; shell resolves to first PATH entry") is correct. The additions are implementation-level guard + documentation — same class as the M6 checklist items in `application-to-open-knowledge.md`.

---

## Gaps / follow-ups

- **Empirical test on an Intel Mac**: cannot be run from this Apple Silicon worktree. Recommend: at M6 merge time, spin up an Intel test runner (GitHub Actions `macos-13`) to exercise the collision scenario end-to-end.
- **Homebrew Cask for OK desktop** (future, per NG): if OK ever ships via Cask, the Cask's `uninstall` stanza can include a `postflight` script that removes the OK-created symlinks. Clean uninstall story via brew. Not required for M2-M3; document when Cask lands.
