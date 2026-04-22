# Evidence: F2 — Broader Agent Landscape (2026-04-21 follow-up)

**Dimension:** Extended capability matrix for 6 additional agents: Windsurf, Aider, GitHub Copilot CLI, Cline, Continue, OpenHands.
**Date:** 2026-04-21
**Sources:** each agent's official docs + GitHub repos + VS Code Marketplace

---

## Windsurf (Codeium)

### Launch surface
- **URL scheme `windsurf://` — CONFIRMED registered, but auth-only.** Linux `x-scheme-handler/windsurf` + `windsurf-url-handler.desktop`; macOS registration via app install. Used solely as OAuth callback (`windsurf://codeium.windsurf`) after sign-in in the browser. **NOT FOUND:** any documented path for passing `dir` or `prompt`. Searched docs.windsurf.com, github.com/Exafunction/codeium, AUR packaging.
- **CLI `windsurf` — CONFIRMED.** Install via Command Palette → "Install 'windsurf' command in PATH". Flags: `windsurf <dir>`, `windsurf .`. **NOT FOUND:** flag to pre-seed Cascade agent with a prompt.
- Headless one-shot: **NOT FOUND.** Cascade is strictly in-IDE.

### Prompt + dir contract
`openWithAgent(name, dir, prompt)` — **NOT honorable in a single call.** Dir opens via `windsurf <dir>`; prompt is lost. Two-step (open dir; user pastes into Cascade) is the only shape.

### Platforms
macOS / Windows / Linux — CONFIRMED.

### Auth gate
First-run login required; free + paid tiers; browser-based OAuth via `windsurf://codeium.windsurf` callback.

### Shortest openWithAgent shape
```
spawn("windsurf", [dir])   // prompt lost — degraded UX
```

---

## Aider

### Launch surface
- **URL scheme — NOT FOUND.** Searched aider.chat docs, github.com/Aider-AI/aider, PyPI.
- **CLI `aider` — CONFIRMED.** Install via `pip install aider-chat`, Homebrew, Docker.
- Headless: `--message "..."` / `--msg` / `-m` → "Specify a single message to send the LLM, process reply then exit."
- Working dir: cwd-based; no `--cwd` flag. `--file FILE` scopes specific files.

### Prompt + dir contract
**CONFIRMED single-call feasible:** `spawn("aider", ["--message", prompt], { cwd: dir })`. Exits after reply.

### Platforms
macOS / Windows / Linux (Python 3.10+).

### Auth gate
LLM API key required (`--openai-api-key` / `--anthropic-api-key` / generic `--api-key PROVIDER=KEY` / env vars like `AIDER_OPENAI_API_KEY`). No Aider-account signup.

### Shortest openWithAgent shape
```
spawn("aider", ["--message", prompt], { cwd: dir })
```

---

## GitHub Copilot CLI (`@github/copilot`)

### Launch surface
- **URL scheme — NOT FOUND.** Searched github.com/github/copilot-cli, docs.github.com/copilot.
- **Binary `copilot` — CONFIRMED** via `npm install -g @github/copilot` (also Homebrew, WinGet, install script). The legacy `gh copilot` extension (`suggest` / `explain`, output-only) was **deprecated 2025-10-25** in favor of this new agentic CLI.
- Headless: `copilot -p "<prompt>"` / `copilot --prompt "<prompt>"`. Other flags: `--experimental`, `--banner`.
- **`--cwd` flag — NOT FOUND; issue #457 open.** Caller must `cd` first or use in-session `/cwd` / `/cd` slash command. Set child-process `cwd` to emulate.

### Prompt + dir contract
**CONFIRMED single-call feasible** by setting child-process `cwd` + passing `-p`.

### Platforms
macOS / Windows / Linux.

### Auth gate
Active GitHub Copilot subscription required; sign-in via `/login` slash command on first run.

### Shortest openWithAgent shape
```
spawn("copilot", ["-p", prompt], { cwd: dir })
```

---

## Cline

### Launch surface
- **URL scheme — NOT FOUND.** Searched docs.cline.bot, github.com/cline/cline, Marketplace listing.
- **VS Code extension ID — CONFIRMED:** `saoudrizwan.claude-dev`. Started via activity bar icon or Command Palette "Cline: Open In New Tab". No documented `vscode://saoudrizwan.claude-dev/...` URI.
- **CLI `cline` — CONFIRMED** (Cline CLI 2.0, released 2025). Install via `npm install -g cline` (Node 20+). Interactive: `cline`. Headless: `cline "<task>"`. Community docs show `--workspace <path>` supported.

### Prompt + dir contract
**CONFIRMED single-call feasible** via CLI: `cline "<prompt>" --workspace <dir>`. IDE path: no single-call route — VS Code opens separately, user activates Cline manually.

### Platforms
- IDE extension: VS Code / Cursor / Windsurf / JetBrains / Zed / Neovim / VSCodium — all OS.
- CLI: macOS / Linux preview; Windows "coming soon." (Per docs.cline.bot.)

### Auth gate
Free account at app.cline.bot or bring-your-own API key (Anthropic / OpenAI / Gemini / Bedrock / Vertex / Groq / Cerebras / Ollama / LM Studio). `cline auth` during CLI setup.

### Shortest openWithAgent shape
```
spawn("cline", [prompt, "--workspace", dir])
```

---

## Continue (`continuedev/continue`)

### Launch surface
- **URL scheme — NOT FOUND.** Searched docs.continue.dev + Marketplace listing.
- **VS Code extension ID — CONFIRMED:** `Continue.continue`. JetBrains extension exists. No URI handler.
- **CLI `cn` (`@continuedev/cli`) — CONFIRMED.** Install via curl script, PowerShell, or `npm i -g @continuedev/cli` (Node 20+).
- Headless: `cn -p "<prompt>"` → "agent runs to completion and prints its response to stdout." Other: `cn --config <path>`, `cn --resume`, `cn serve`, `cn ls`.
- Working dir: cwd-based; no `--cwd` flag documented.

### Prompt + dir contract
**CONFIRMED single-call feasible:** `spawn("cn", ["-p", prompt], { cwd: dir })`.

### Platforms
macOS / Linux / Windows (CLI + extensions).

### Auth gate
Interactive login via CLI, or `CONTINUE_API_KEY` env var. Bring-your-own LLM key.

### Shortest openWithAgent shape
```
spawn("cn", ["-p", prompt], { cwd: dir })
```

---

## OpenHands

### Launch surface
- **URL scheme — NOT FOUND.** Searched docs.openhands.dev, github.com/All-Hands-AI/OpenHands.
- **Binary `openhands` — CONFIRMED** via `pip install openhands` (Python 3.12+, uv 0.11.6+). Separate lightweight `OpenHands/OpenHands-CLI` binary exists.
- Headless: `openhands --headless -t "<task>"` or `openhands --headless -f <file>`; `--json` for JSONL streaming.
- **Docker-first runtime — CONFIRMED:** production runtime is a Docker-sandboxed container (`docker.all-hands.dev/all-hands-ai/runtime`); CLI orchestrates Docker lifecycle. Docker daemon must be available.
- Working dir: cwd-based; mounts host source as `/app` in runtime container.

### Prompt + dir contract
**CONFIRMED single-call feasible** via `openhands --headless -t "<prompt>"` with `cwd=dir`, assuming Docker is running. Higher operational cost (container pull on first run).

### Platforms
macOS / Linux / Windows (where Docker Desktop / engine is available).

### Auth gate
No OpenHands-account signup for headless CLI. LLM API key required (OpenAI / Anthropic / Claude / Ollama / LM Studio) via settings or env.

### Shortest openWithAgent shape
```
spawn("openhands", ["--headless", "-t", prompt], { cwd: dir })
```

---

## Summary table

| Agent | URL scheme | CLI prompt flag | CLI dir flag | Single-call? | Platforms | Auth |
|---|---|---|---|---|---|---|
| **Windsurf** | `windsurf://` (auth-only) | NOT FOUND | positional `<dir>` | **No** — prompt lost | macOS/Win/Linux | Codeium OAuth |
| **Aider** | NOT FOUND | `-m` / `--message` | cwd (no flag) | **Yes** | macOS/Win/Linux (Python) | LLM API key |
| **Copilot CLI** | NOT FOUND | `-p` / `--prompt` | cwd only (#457) | **Yes** | macOS/Win/Linux | Copilot subscription |
| **Cline** | NOT FOUND | positional task | `--workspace <dir>` | **Yes** (CLI path) | macOS/Linux CLI; Win soon; all-OS IDE | Cline account or BYOK |
| **Continue** | NOT FOUND | `-p` | cwd (no flag) | **Yes** | macOS/Win/Linux | CLI login or `CONTINUE_API_KEY` |
| **OpenHands** | NOT FOUND | `-t` / `--task` (`--headless`) | cwd (no flag) | **Yes** (Docker) | macOS/Win/Linux (Docker) | LLM API key |

**Key finding.** Of the 6 agents in this expansion, **five (Aider, Copilot CLI, Cline, Continue, OpenHands) honor `openWithAgent(name, dir, prompt)` cleanly via `spawn(bin, [promptFlag, prompt], { cwd: dir })`.** Only **Windsurf is degraded** — its CLI opens a directory but cannot pre-seed Cascade with a prompt. No agent in this set has a useful prompt-bearing URL scheme; Windsurf's `windsurf://` is auth-only. **This matches the pattern from the initial pass: `spawn-with-cwd` is the universal shape; URL schemes are the exception.**

---

## Sources

- [Windsurf docs — Command overview](https://docs.windsurf.com/command/windsurf-overview) — accessed 2026-04-21
- [Windsurf docs — Advanced](https://docs.windsurf.com/windsurf/advanced) — accessed 2026-04-21
- [Exafunction/codeium#160 (windsurf:// auth callback)](https://github.com/Exafunction/codeium/issues/160) — accessed 2026-04-21
- [Aider — Options reference](https://aider.chat/docs/config/options.html) — accessed 2026-04-21
- [Aider — Scripting](https://aider.chat/docs/scripting.html) — accessed 2026-04-21
- [Aider-AI/aider GitHub](https://github.com/Aider-AI/aider) — accessed 2026-04-21
- [GitHub Copilot CLI — features page](https://github.com/features/copilot/cli/) — accessed 2026-04-21
- [Installing GitHub Copilot CLI — docs.github.com](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli) — accessed 2026-04-21
- [Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) — accessed 2026-04-21
- [github/copilot-cli#457 — --cwd flag request](https://github.com/github/copilot-cli/issues/457) — accessed 2026-04-21
- [github/gh-copilot (deprecated legacy ext)](https://github.com/github/gh-copilot) — accessed 2026-04-21
- [Cline docs — Installing Cline](https://docs.cline.bot/getting-started/installing-cline) — accessed 2026-04-21
- [Cline CLI 2.0 announcement](https://cline.ghost.io/introducing-cline-cli-2-0/) — accessed 2026-04-21
- [Marketplace — Cline (saoudrizwan.claude-dev)](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) — accessed 2026-04-21
- [Continue docs — CLI guide](https://docs.continue.dev/guides/cli) — accessed 2026-04-21
- [Continue docs — CLI overview](https://docs.continue.dev/cli/overview) — accessed 2026-04-21
- [@continuedev/cli on npm](https://www.npmjs.com/package/@continuedev/cli) — accessed 2026-04-21
- [Marketplace — Continue (Continue.continue)](https://marketplace.visualstudio.com/items?itemName=Continue.continue) — accessed 2026-04-21
- [OpenHands docs — CLI mode](https://docs.openhands.dev/openhands/usage/run-openhands/cli-mode) — accessed 2026-04-21
- [OpenHands docs — Runtime Architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime) — accessed 2026-04-21
- [OpenHands-CLI GitHub](https://github.com/OpenHands/OpenHands-CLI) — accessed 2026-04-21
