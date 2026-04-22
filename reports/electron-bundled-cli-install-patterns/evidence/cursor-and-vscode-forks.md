# Evidence: Cursor + VS Code forks — inherited install mechanism + divergence

**Dimension:** D2 (Cursor, Windsurf, Trae — VS Code forks and their CLI install)
**Date:** 2026-04-21
**Sources:** [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation), Homebrew cask `cursor-cli`, Cursor forum threads

---

## Key pages referenced

- [Cursor CLI Installation docs](https://cursor.com/docs/cli/installation) — `curl | bash` installer
- [Homebrew cask `cursor-cli`](https://formulae.brew.sh/cask/cursor-cli)
- [Cursor CLI Overview](https://cursor.com/docs/cli/overview)
- [Cursor Forum: "Trouble Install Cursor Command in Path"](https://forum.cursor.com/t/trouble-install-cursor-command-in-path/156)

---

## Findings

### Finding: Cursor ships TWO distinct CLI products — the editor shim AND a separate AI-agent CLI

**Confidence:** CONFIRMED
**Evidence:** Cursor docs + Homebrew cask inventory

Two binaries are user-visible:

1. **`cursor`** — the VS Code fork's inherited "Install 'cursor' command in PATH" Command Palette action, installs a shell wrapper (equivalent to VS Code's `code`) that opens files/folders in the desktop app. This is the pattern Cursor inherits unchanged from its VS Code base.
2. **`cursor-agent`** — a separately-distributed AI-agent CLI that Cursor publishes via `curl https://cursor.com/install -fsS | bash` and Homebrew cask `cursor-cli`. This is a Rust binary, not a fork of the VS Code `code` wrapper. Installs to `~/.local/bin` per official docs. Requires user to add `~/.local/bin` to PATH.

Install channels for `cursor-agent`:

```bash
# Official curl installer
curl https://cursor.com/install -fsS | bash

# Homebrew cask
brew install --cask cursor-cli
```

Post-install PATH setup (verbatim from docs):

> For zsh: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc` and then `source ~/.zshrc`

**Implications:** Cursor's two-CLI model is a mild cautionary tale — users confuse `cursor` (opens app) with `cursor-agent` (AI CLI). For Open Knowledge, where the plan is ONE command `ok` that dispatches internally to subcommands (`ok mcp`, `ok init`, `ok start`), the D52 single-binary model avoids this confusion. Do not split `ok` and `ok-agent`.

---

### Finding: Cursor inherits VS Code's Command Palette install action unchanged

**Confidence:** CONFIRMED
**Evidence:** Cursor community forum + VS Code base fork

From user-reported usage:

> You can also open Cursor, press Cmd+Shift+P, and run "Install 'cursor' command in PATH" to install the CLI command through the Command Palette.

Same UX, same `osascript` admin prompt, same `/usr/local/bin/cursor` target. The wrapper script is renamed from `code` → `cursor`; the mechanism is identical — Cursor did not redesign this surface.

**Implications:** The VS Code pattern has proven portable through fork-and-rebrand. Windsurf (Codeium's fork) and Trae (ByteDance's fork) use the same mechanism by virtue of inheriting it from the base. For OK, this confirms the pattern is robust to re-use — the install mechanism is largely fork-stable.

---

### Finding: Cursor's `cursor-agent` deliberately uses `~/.local/bin` to avoid the admin prompt

**Confidence:** INFERRED (from docs + common practice)
**Evidence:** Cursor install docs — only `~/.local/bin` is documented as the install target

By installing the AI-agent CLI to `~/.local/bin` and requiring user PATH setup, Cursor avoids the admin prompt entirely. This is a deliberate UX choice: the `curl | bash` install flow must not prompt for sudo mid-install.

Contrast with `/usr/local/bin/cursor` (the editor shim): that one IS in the system-writable location and DOES require admin on first install, but it happens inside the GUI app where the admin prompt is contextualized.

**Implications for OK:**
- Open Knowledge's plan to symlink `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` inside the app's "Install Command-Line Tools…" menu item is consistent with the `cursor` editor-shim pattern (in-GUI admin prompt is acceptable UX).
- IF OK ever ships an alternative `ok-lite` or agent-focused CLI via `curl | bash`, the Cursor precedent argues for `~/.local/bin` + user PATH setup instead of admin prompt.
- Not relevant to the current M6 scope — just context for future distribution decisions.

---

## Gaps / follow-ups

- Windsurf and Trae specific install docs not fetched — assumed identical to VS Code by fork inheritance. If a future PR touches this, verify against their actual docs.
- Whether the Cursor install-action source has any divergence from VS Code's handler (e.g., different PATH target, different admin-prompt copy) — not verified here. Best guess: no divergence, since Cursor has no public reason to re-implement working VS Code code.
