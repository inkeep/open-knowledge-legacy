# Evidence: D4 — OpenAI Codex CLI

**Dimension:** OpenAI Codex CLI — `codex` binary from `@openai/codex`
**Date:** 2026-04-21
**Sources:** github.com/openai/codex, developers.openai.com/codex, npm, DeepWiki

---

## Key files / pages referenced

- https://github.com/openai/codex — canonical repo, Apache-2.0, **Rust** (primary language ~96%, Bazel build)
- https://raw.githubusercontent.com/openai/codex/5bab04dcd7be4820eec4c2ea102646c718fc31e7/README.md — README snapshot
- https://developers.openai.com/codex/cli — CLI overview
- https://developers.openai.com/codex/cli/reference — flag reference
- https://developers.openai.com/codex/quickstart — quickstart
- https://developers.openai.com/codex/noninteractive — non-interactive mode (`codex exec`)
- https://developers.openai.com/codex/ide — IDE extension docs
- https://marketplace.visualstudio.com/items?itemName=openai.chatgpt — VS Code extension (rebranded to `openai.chatgpt`)
- https://deepwiki.com/openai/codex/4.2-headless-execution-mode-(codex-exec) — headless mode
- https://deepwiki.com/openai/codex/1.1-installation-and-setup — install paths
- https://www.npmjs.com/package/@openai/codex — npm package (Rust binary wrapper)
- https://gist.github.com/alexfazio/359c17d84cb6a5af12bac88fa1db9770 — community flag experiments
- https://github.com/openai/codex/issues/3511 — auto-skip git checks

---

## Findings

### Finding: Binary is `codex` (single word, no `openai` prefix); installed via npm/brew/GitHub releases
**Confidence:** CONFIRMED
**Evidence:** README, developers.openai.com/codex/cli, npm

- `npm install -g @openai/codex` (requires Node >= 22; npm package is a **binary wrapper** around a precompiled Rust executable, not TypeScript)
- `brew install --cask codex` (macOS)
- Platform binaries in GitHub Releases: `codex-{aarch64,x86_64}-apple-darwin.tar.gz`, `codex-{aarch64,x86_64}-unknown-linux-musl.tar.gz`

**Correction:** The task brief assumed TypeScript; the actual implementation is Rust with npm distribution as a binary wrapper. This matters because the code is NOT JavaScript-patchable — shipping modifications requires a fork + rebuild.

### Finding: `codex --help` shape — top-level `codex [OPTIONS] [PROMPT]` + subcommands `exec|e`, `resume`, `fork`, `login`, `logout`, `mcp`, `app-server`, `cloud`
**Confidence:** CONFIRMED
**Evidence:** https://developers.openai.com/codex/cli/reference

Top-level invocation: `codex [OPTIONS] [PROMPT]` — positional `PROMPT` seeds the interactive TUI.

Subcommands:
- `exec` / `e` — non-interactive one-shot
- `resume` — re-enter prior session (`--last` or `<id>`)
- `fork` — branch from prior session
- `login` / `logout` — auth
- `mcp` — MCP server management
- `app-server` — IDE backend
- `cloud` — cloud runs

### Finding: `-C <dir>` / `--cd <dir>` sets working directory; `--skip-git-repo-check` needed outside trusted git repo
**Confidence:** CONFIRMED
**Evidence:** CLI reference + community experiments

```
codex -C <dir> "prompt"
codex --cd <dir> exec "prompt"
```

- Works on both top-level and `exec`.
- `cd <dir> && codex` is a fallback.
- **Codex refuses to run outside a trusted git repo by default.** Override with `--skip-git-repo-check` (must appear before any subcommand). Error text: "Not inside a trusted directory and --skip-git-repo-check was not specified."
- `--add-dir <DIR>` grants write access to additional dirs alongside workspace.

**Implications:** For our `openWithAgent(dir)`:
- If `dir` is a git repo: `codex -C <dir> "<prompt>"` works.
- If `dir` is NOT a git repo: add `--skip-git-repo-check` before subcommand.

### Finding: Prompt-at-launch — positional seed for interactive, positional OR stdin for `exec`
**Confidence:** CONFIRMED (with stdin caveat)
**Evidence:** CLI reference, community gist

| Mode | Pattern |
|---|---|
| Interactive TUI with seed | `codex "fix the failing tests"` — drops user into TUI with prompt queued |
| Non-interactive | `codex exec "<prompt>"` |
| Non-interactive via stdin | `codex exec -` reads entire prompt from stdin; `echo ... \| codex exec -` also works |

**CAVEAT (MEDIUM confidence):** If a positional prompt AND stdin are supplied, a third-party empirical test (alexfazio gist, Codex 0.114.0) observed stdin is NOT forwarded — contradicting OpenAI docs which say "stdin is additional context." Flag for empirical testing before shipping combined positional+stdin flows.<br>_[Corrected 2026-04-22 post-ship: Behavior changed on 2026-03-28 via [openai/codex#15917](https://github.com/openai/codex/pull/15917); Codex ≥ v0.122.0 appends stdin as a `<stdin>` block after the positional prompt. Authoritative fix in [`f1-empirical.md` §U3](./f1-empirical.md#u3-codex-exec--stdin--positional-prompt-major-update)._]

**No `--prompt` / `-p` / `--message` flag.** Prompt is always positional or stdin.

### Finding: Terminal requirement same shape as Claude Code — `exec` is the non-interactive escape hatch
**Confidence:** CONFIRMED
**Evidence:** Codex TUI is a ratatui-style Rust terminal app

- Interactive TUI requires a terminal emulator (same patterns as D3 Claude Code: macOS `osascript`/`.command` script, Windows `wt.exe`, Linux fragmented).
- `codex exec` is non-interactive and streams to stdout — can be `spawn()`'d from Electron directly without a terminal wrapper, capturing output for display in the app.

### Finding: NO URL scheme registered
**Confidence:** CONFIRMED (negative)
**Evidence:** README, docs/, CLI reference, release notes — searched

No `codex://`, `openai://`, or similar custom scheme. No flag documents one. Release notes do not mention one. Negative evidence from multiple sources.

### Finding: VS Code extension ID is `openai.chatgpt` (rebranded); no documented public deep link
**Confidence:** CONFIRMED (extension exists), MEDIUM (no deep link)
**Evidence:** VS Code Marketplace, developers.openai.com/codex/ide

- Extension ID: **`openai.chatgpt`** on VS Code Marketplace (also installs in Cursor, Windsurf — but in Cursor's case, via the marketplace proxy).
- **No public `vscode://openai.chatgpt/...` deep link** in Marketplace listing, dev docs, or community forum.
- Generic `vscode://file/<path>` still works to open a folder in VS Code; the Codex panel has no documented external trigger after that.

**Implications:** No equivalent of Claude Code's `vscode://anthropic.claude-code/open?prompt=...`. For GUI integration, only raw terminal spawn or interactive `codex "prompt"` are documented.

### Finding: Auth via browser OAuth (Sign in with ChatGPT) or OpenAI API key; persistent in `~/.codex/`
**Confidence:** CONFIRMED
**Evidence:** README, quickstart, `codex login` subcommand

- First `codex` invocation: browser OAuth flow OR accepts API key.
- `codex login` supports: browser OAuth, device code flow, piped API key (`echo $OPENAI_API_KEY | codex login ...`).
- CI pattern: `OPENAI_API_KEY` env var (some docs also reference `CODEX_API_KEY`).
- Credentials persist under `~/.codex/` — no per-launch prompt.

### Finding: Platform matrix — first-class macOS + Linux, experimental Windows (WSL2 recommended)
**Confidence:** CONFIRMED
**Evidence:** DeepWiki install, README platform badges

| Platform | Status |
|---|---|
| macOS | First-class (Apple Silicon + x86_64) |
| Linux | First-class (x86_64 + aarch64, musl static) |
| Windows | **Experimental**; OpenAI recommends WSL2. Native binary exists in some distributions but not officially supported. |

### Finding: `codex exec` supports structured output — `--json`, `-o / --output-last-message`, `--output-schema`, `--ephemeral`, `--full-auto`, `--sandbox`
**Confidence:** CONFIRMED
**Evidence:** https://deepwiki.com/openai/codex/4.2-headless-execution-mode-(codex-exec)

```
codex exec --json "<prompt>"              # JSONL event stream
codex exec -o last.txt "<prompt>"         # final message to file
codex exec --output-schema schema.json ...  # structured JSON response
codex exec --ephemeral ...                 # no session persistence
codex exec --full-auto ...
codex exec --sandbox read-only|workspace-write|danger-full-access
```

**Implications:** For a one-shot "ask Codex a question about this file/dir" UX, `codex exec --json` is the clean integration path — Electron captures stdout, parses events, renders in its own UI. No terminal needed.

### Finding: `codex resume [--last|<id>]` and `codex exec resume` re-enter prior sessions
**Confidence:** MEDIUM
**Evidence:** CLI reference

Potentially useful for an "Open with Codex: reopen last session in this dir" affordance.

---

## Negative searches (NOT FOUND)

- Searched for `codex://` URL scheme registration → NOT FOUND in README, docs, or release notes.
- Searched for `--prompt` / `--message` flag → NOT FOUND (prompt is positional or stdin).
- Searched for `vscode://openai.chatgpt/*` deep links → NOT FOUND in Marketplace listing or docs.
- Searched for project-level config directory equivalent to Claude's `CLAUDE.md` → Codex has `AGENTS.md` convention but no top-level project-auto-load like CLAUDE.md. Different shape; evidence in README under "Configuration".

---

## Gaps / follow-ups

- ~~**Empirical test needed:** Stdin-vs-positional interaction when both are supplied — community observation (stdin ignored) contradicts docs (stdin is context).~~<br>_[Resolved 2026-04-22 post-ship: Behavior change landed in [openai/codex#15917](https://github.com/openai/codex/pull/15917) (2026-03-28); Codex ≥ v0.122.0 appends piped stdin to positional prompt. Authoritative details in [`f1-empirical.md` §U3](./f1-empirical.md#u3-codex-exec--stdin--positional-prompt-major-update)._]
- **VS Code extension integration:** No documented deep link; if Codex adds one in future, it becomes a much cleaner integration path than terminal spawn.
- **Sandbox modes for Electron:** `--sandbox read-only|workspace-write|danger-full-access` — choosing the default for `openWithAgent` is a policy question for the `/spec`.
