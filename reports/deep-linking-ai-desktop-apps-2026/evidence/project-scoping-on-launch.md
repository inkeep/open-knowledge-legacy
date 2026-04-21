# Evidence: Project / Folder Scoping on App Launch

**Dimension:** Addendum E to the deep-linking report — "can these apps be launched scoped to a specific folder/project, and how does that interact with prompt seeding?"
**Date:** 2026-04-18 (initial); updated 2026-04-21 (live-testing round — corrects the Claude row below)
**Sources:** Local `plutil -extract CFBundleDocumentTypes` probes on installed Claude / Codex / Cursor / ChatGPT / Perplexity; local CLI `--help` output (`claude`, `cursor`, `codex`); Claude Desktop `app.asar` bundle inspection; Zed CLI docs (`zed.dev/docs/reference/cli`); Windsurf docs + community CLI references; prior evidence files in this report (cross-referenced, not re-derived); **2026-04-21 live-testing round** — fired candidate URLs against installed Claude / Codex / Cursor and observed app settle-behavior with the user (verbatim invocations + "what I see in the modal" ground truth).

**Relationship to prior evidence:** Extends D1–D3 + D9. Claims about URL-scheme routes that were already verified in `claude-desktop-deep-links.md`, `codex-desktop-deep-links.md`, `cursor-desktop-deep-links.md`, `zed-and-jetbrains-deep-links.md`, `vscode-windsurf-dia-deep-links.md`, and `codex-26415-probe.md` are pointed at, not re-quoted. This file focuses on the **folder/project axis** — a slice the prior files touched only where it intersected URL parsers.

---

## Key sources

- `/Applications/{Claude,Codex,Cursor,ChatGPT,Perplexity}.app/Contents/Info.plist` — `CFBundleDocumentTypes` probes on 2026-04-18
- `/tmp/claude-asar-dump/extracted/.vite/build/index.js` — Claude Desktop Electron main bundle (version 1.2581.0, `@ant/desktop`)
- `/Applications/Cursor.app/Contents/Resources/app/bin/cursor --help` — Cursor 3.1.15 CLI
- [zed.dev/docs/reference/cli](https://zed.dev/docs/reference/cli) — official Zed CLI reference (fetched 2026-04-18)
- [docs.windsurf.com/windsurf/getting-started](https://docs.windsurf.com/windsurf/getting-started) — Windsurf CLI install + usage
- Prior evidence in this report: `cursor-desktop-deep-links.md:120,341,495,519,545`; `zed-and-jetbrains-deep-links.md:56-65,129-139,262`; `codex-desktop-deep-links.md` (`$9` parser + `codex app`); `claude-desktop-deep-links.md` (`td` enum)

---

## The two primitives for workspace scoping on launch

macOS (and by extension Electron/native apps) exposes **two orthogonal primitives** for "open app X with folder Y as context":

1. **Document handler via `open -a <App> <folder>`** — works if the app registers `public.folder` in `CFBundleDocumentTypes` with `CFBundleTypeRole: Editor` (LaunchServices dispatches the folder to the app's open-file handler).
2. **CLI with positional path** — `<cli> /path/to/folder`, typically inherited by VS Code forks or implemented directly.

For **AI chat apps specifically**, a third primitive exists and is rare:

3. **Workspace-aware URL parameter** — a single URL scheme invocation that carries the folder path in a query param.

Below, each app is probed against all three.

---

## Finding E1: `CFBundleDocumentTypes` — which apps accept a folder via Launch Services?

**Confidence:** CONFIRMED
**Evidence:** `plutil -extract CFBundleDocumentTypes` on each Info.plist, 2026-04-18:

```
=== Claude ===
  [Viewer] Desktop Extension — ext:['dxt', 'mcpb'] types:[]
  [Viewer] Skill File — ext:['skill'] types:[]
  [Editor] Folder — ext:[] types:['public.folder']     ← folder handler, Editor role
  [Viewer] All Files — ext:[] types:['public.data']

=== Codex ===
  (CFBundleDocumentTypes key absent — 0 types)

=== Cursor ===
  [Editor] Folder — types:['public.folder']             ← folder handler, Editor role
  [Editor] + 65 source-file extension types (c, cpp, h, html, ini, etc.)

=== ChatGPT ===
  [Editor] All Files — ext:[] types:['public.data']     ← NO public.folder

=== Perplexity ===
  (CFBundleDocumentTypes key absent — 0 types)
```

**Implications for this axis:**

- **Claude Desktop accepts folders** — `open -a Claude.app /path/to/project` routes the folder into Claude Desktop's workspace-handling logic. This was **not captured in prior evidence**; the baseline report (`claude-desktop-deep-links.md`) focused on URL-scheme routes and did not enumerate `CFBundleDocumentTypes`. Claude Desktop has an internal concept of workspace folders (it embeds Claude Code / "Cowork"); the `public.folder` registration is what exposes that surface to the OS.
- **Cursor accepts folders** — expected, VS Code fork inherits the 66-entry doc-types list (folder + 65 file extensions).
- **Codex does NOT accept folders via Launch Services** — no `CFBundleDocumentTypes` key at all. The only way to launch Codex with a workspace is the URL scheme (`?path=`/`?originUrl=`) or the `codex app [PATH]` CLI. `open -a Codex.app /path` just opens Codex without the folder context.
- **ChatGPT and Perplexity are not folder-aware apps** — consistent with their being chat apps only, not workspace-capable.

**NOT FOUND (negative searches):**
- **Zed's Info.plist** — not probed in this pass (Zed is not installed locally). From Zed's CLI behavior (`zed /path` opens a workspace) and its Rust source (`parse_file_path` accepts folders), `public.folder` registration is highly likely but is INFERRED, not CONFIRMED, from this evidence pass.
- **Windsurf's Info.plist** — not probed. Inferred from VS Code fork lineage.

---

## Finding E2: CLI surface — `<app-cli> /path/to/folder` coverage

**Confidence:** CONFIRMED (apps installed locally) / INFERRED-from-docs (Zed, Windsurf)
**Evidence:** `--help` output on each CLI plus published docs.

### Codex — `codex app [PATH]` and `--open-project`

Already documented in `codex-desktop-deep-links.md` Finding 5–6 and `codex-26415-probe.md` CLI section. Codex ships the richest CLI–Desktop bridge:

- `codex app [PATH]` (default: `.`) — launches the Codex Desktop app with `PATH` as workspace
- `codex --open-project <path>` / `codex --open-project=<path>` — argv flag
- On Windows, bare positional paths also work: `Codex.exe <path>`

Parser code at `product-name-DH3nvCaM.js` (26.406) / `product-name-BA584x_m.js` (26.415) — `Q9` + `J9="--open-project"` in both versions.

### Cursor — VS Code-derived with `cursor [paths...]` + goto/add

Verified locally via `/Applications/Cursor.app/Contents/Resources/app/bin/cursor --help`:

```
Usage: cursor [options][paths...]

  -a --add <folder>                          Add folder(s) to the last active window.
  --remove <folder>                          Remove folder(s) from the last active window.
  -g --goto <file:line[:character]>          Open a file at the path on the specified line and character position.
  -n --new-window                            Force to open a new window.
  -r --reuse-window                          Force to open a file or folder in an already opened window.
  --user-data-dir <dir>                      …
  --profile <profileName>                    Opens the provided folder or profile, or workspace or folder
```

Worked examples:
- `cursor /path/to/project` — open folder in new Cursor window (or most recent window — Cursor picks)
- `cursor -n /path/to/project` — force new window
- `cursor -r /path/to/project` — reuse active window (replace workspace in place)
- `cursor -g file.ts:42:10` — open file at line 42, col 10
- `cursor -a /more/paths` — add folder to multi-root workspace

### Zed — `zed [OPTIONS] [PATHS]...`

Per [zed.dev/docs/reference/cli](https://zed.dev/docs/reference/cli) (fetched 2026-04-18):

- `zed ~/projects/myproject` — open folder
- `zed myfile.txt:42:10` — open file at line:col
- `-n, --new` — opens paths in a new workspace window
- `-r, --reuse` — replaces current workspace with new paths in existing window
- **CLI accepts `zed://`, `http://`, `https://` URLs as positional args**: e.g. `zed "zed://settings"` or `zed "zed://agent?prompt=..."`

### Windsurf — install `windsurf` CLI via command palette, then standard VS Code-derived

Per [docs.windsurf.com/windsurf/getting-started](https://docs.windsurf.com/windsurf/getting-started):

> "Open the Command Palette and run 'Install `windsurf` command in PATH' to enable launching from the terminal to open a project in Windsurf from terminal with `windsurf /path/to/your/project` or open the current directory with `windsurf .`"

Plus inherited `--folder-uri vscode-remote://...` for remote dev (WSL use case documented in third-party guides).

### VS Code — `code /path/to/project` + full flag inheritance

Canonical pattern, documented at [code.visualstudio.com/docs/configure/command-line](https://code.visualstudio.com/docs/configure/command-line). Same surface Cursor/Windsurf inherited from.

### Claude — `claude` CLI is Claude CODE (terminal), not a Desktop bridge

The `claude` CLI at `~/.local/bin/claude` is the **Claude Code** terminal product. From its `--help`:

```
Usage: claude [options] [command] [prompt]

Options:
  --add-dir <directories...>    Additional directories to allow tool access to
  -c, --continue                Continue the most recent conversation in the current directory
  -p, --print                   Print response and exit (useful for pipes)
  --worktree [name]             Create a new git worktree for this session
```

The CLI runs in the current working directory (no path argv — use `cd` + invoke). It does **NOT open Claude Desktop**; it opens a terminal TUI. There is no `claude app [PATH]`-equivalent subcommand that routes to Claude Desktop. The bridge to Claude Desktop is the `claude://` URL scheme (which does not carry a path) or `open -a Claude.app /path` (which does, per Finding E1).

**Implication:** Claude is the only app in the set where the **CLI and the Desktop app are non-overlapping products** — the CLI doesn't cross-open the Desktop, and the Desktop's URL scheme doesn't route into the CLI.

---

## Finding E3: Workspace-aware URL parameters — Codex and Claude (updated 2026-04-21)

**Confidence:** CONFIRMED (live-tested)
**Evidence:** Pre-existing `codex-desktop-deep-links.md` + **2026-04-21 extension to `claude-desktop-deep-links.md` Findings 8–9**.

> **Correction applied 2026-04-21:** The initial 2026-04-18 pass of this addendum declared "only Codex has a workspace-aware URL parameter." That was wrong. A follow-up live-testing round against the installed Claude.app 1.2581.0 revealed that the `claude://` scheme also has atomic prompt+folder+file URLs — the initial probe simply missed the `claude://cowork/*` and `claude://code/*` host branches of the URL router (it enumerated only the `claude://claude.ai/*` branch). Both Claude and Codex now appear in this Finding; the table below is updated accordingly.

**Codex Desktop** (first app in the set with this capability):

```
codex://new?prompt=<p>&path=<abs-path>&originUrl=<git-url>
```

Per `$9` parser in `codex-desktop-deep-links.md:80` (unchanged in 26.415 per `codex-26415-probe.md`):
- `path=` — absolute workspace path; resolved via `fs.stat` check
- `originUrl=` — git origin URL; matches against registered local clones via `Lp`/`Fp`/`Ip` pipeline
- Either param, combined with `prompt=`, opens a new thread pre-filled with the prompt AND scoped to the resolved workspace, all in a single invocation

**Claude Desktop** (second app in the set with this capability, newly confirmed 2026-04-21):

```
claude://cowork/new?q=<prompt>&folder=<abs-path>&folder=<abs-path-2>&file=<abs-file>
claude://code/new?q=<prompt>&folder=<abs-path>&file=<abs-file>
```

Per `Jb.Cowork` + `Jb.Code` switch cases in the main bundle (verbatim code in `claude-desktop-deep-links.md` Findings 8–9):
- `q=` — prompt param (truncated by the `QqA` constant; approximate 8K ceiling, not precisely extracted)
- `folder=` — **repeatable** (`URLSearchParams.getAll("folder")`); each value is an absolute path added to the session's selected workspace directories
- `file=` — **repeatable**; absolute file paths pre-attached to the composer
- `cowork/new` flavor dispatches via the `dispatchOnCoworkFromMain` IPC with `prefillOnly: true, source: "external"` — pure prefill, no auto-execute, lands in the Cowork (Code) tab
- `code/new` flavor navigates the webview to `/epitaxy?q=&folder=&src=external` and fires `desktop_code_deeplink_received` analytics — lands in the Code (Epitaxy) tab
- **Live-verified on 2026-04-21:** all four combinations tested — `cowork/new?q=`, `cowork/new?q=&folder=`, `code/new?q=&folder=`, `cowork/new?q=&folder=&file=` — each lands correctly with the prompt pre-filled + folder selected + (where applicable) specific file attached. No confirmation modal.

**Other apps** — no workspace/path param on the prompt URL:

| App | Prompt URL shape | Workspace/path param? | Notes |
|---|---|---|---|
| Cursor | `cursor://anysphere.cursor-deeplink/prompt?text=<p>&mode=<m>` | `workspace=<name>` window-match only, **not path** (`cursor-desktop-deep-links.md:120,495,545`) | `cursor://file/<path>` explicitly NOT wired (`cursor-desktop-deep-links.md:519`); no folder-open URL route exists in the entire `cursor://` surface |
| Zed | `zed://agent?prompt=<text>` | ❌ No `workspace=` on agent URL (`zed-and-jetbrains-deep-links.md:240,262`) | File/ssh paths via separate URLs (`zed://file/<path>`, `zed://ssh/<host>/<path>`) |
| Windsurf | `windsurf://cascade?prompt=<p>` | ❌ Only prompt param confirmed (`vscode-windsurf-dia-deep-links.md` — the single-route surface) | |
| VS Code | No prompt URL (no Chat deep-link exists per `vscode-windsurf-dia-deep-links.md`) | — | `vscode://file/<path>` opens files, no chat integration |

**Implication (revised):** **Two apps** now support single-URL atomic workspace+prompt handoff — Codex and Claude. For Cursor / Zed / Windsurf / VS Code, workspace scoping remains a **separate invocation** from prompt seeding.

**Capability depth comparison between the two atomic-combo apps:**

| Capability | Codex (`codex://new?...`) | Claude (`claude://cowork/new?...`) |
|---|---|---|
| Prompt param | `prompt=` | `q=` |
| Single absolute folder | `path=` | `folder=` |
| **Multi-folder workspaces** | ❌ `path=` is scalar | ✅ `folder=` is repeatable — `URLSearchParams.getAll("folder")` |
| **File attachments** | ❌ no `file=` param | ✅ `file=` is repeatable, live-verified |
| Git-origin-URL resolution | ✅ `originUrl=<git>` matches against known local clones | ❌ |
| Tab/mode selection | N/A (no tabs) | ✅ `cowork` → IPC prefill / `code` → webview nav to `/epitaxy` |
| Confirmation modal | None | None |
| Auto-execute vs prefill | Pre-fill only (user presses Enter) | Pre-fill only (`prefillOnly: true, source: "external"`) |

**Net:** Claude's atomic URL is broader than Codex's — it supports multi-folder, file attachments, and tab routing. Codex's is narrower but has the unique `originUrl=` git-origin resolution. Both are pure-prefill with no forced confirmation modal.

---

## Finding E4: Combining folder-open + prompt-seed — the two-step patterns per app

**Confidence:** CONFIRMED (per prior evidence + CLI behavior)

The canonical patterns by app, tested against the local install (Claude, Cursor, Codex) and documented for the others:

### Codex — single-URL, workspace-aware

```bash
open "codex://new?prompt=$(_urlenc "$prompt")&path=$(_urlenc "$(pwd)")&originUrl=$(_urlenc "$(git remote get-url origin)")"
```

One URL carries prompt, absolute path, and git-origin URL. Codex resolves any of the three path signals to a workspace.

### Cursor — two-step, rely on focused-window routing

```bash
cursor /path/to/project         # step 1: open folder (new or reused window, Cursor's choice)
open "cursor://anysphere.cursor-deeplink/prompt?text=$(_urlenc "$(_urlenc "$prompt")")&mode=agent"
                                # step 2: prompt URL routes to focused window
```

Note the **double `_urlenc`** — Cursor's extension router double-decodes per Linear's production bundle (cross-referenced from `linear-ai-deeplinks-extraction.md`). The `workspace=<name>` param is available if you know the window's workspace name, but since `cursor /path` creates a window named after the last path segment, passing `workspace=<basename>` is redundant when you just opened the folder.

**Cursor caveat:** every prompt URL invocation triggers CursorJack-hardened confirmation modal (`cursor-desktop-deep-links.md:140+` per D3 finding). Two-step UX shows two user-visible moments: the folder opening and the modal accept.

### Zed — two-step or CLI-wrapped

```bash
# Pattern 1: separate commands
zed /path/to/project
open "zed://agent?prompt=$(_urlenc "$prompt")"

# Pattern 2: Zed CLI accepts zed:// URLs as positional args
zed /path/to/project "zed://agent?prompt=$(_urlenc "$prompt")"
```

Pattern 2 is more atomic — single CLI invocation opens the folder AND delivers the agent URL in one process. Per Zed docs: "The CLI can open `zed://`, `http://`, and `https://` URLs."

### Windsurf — two-step

```bash
windsurf /path/to/project
open "windsurf://cascade?prompt=$(_urlenc "$(_urlenc "$prompt")")"
```

Same double-encoding as Cursor (per Linear bundle). No `--folder-uri` + prompt-URL combo documented; two-step only.

### Claude Desktop — atomic via `claude://cowork/*` or `claude://code/*` (updated 2026-04-21)

> **Correction applied 2026-04-21.** The initial 2026-04-18 authoring of this subsection said "surfaces don't unify — you get one or the other." That was wrong. Live testing on 2026-04-21 revealed the atomic combo via the previously-missed `claude://cowork/new` and `claude://code/new` host routes. Full bundle code and live-test observations in `claude-desktop-deep-links.md` Findings 8–12. The corrected patterns are below.

```bash
# Pattern 1 — atomic prompt + workspace (Cowork / Code tab) via single URL
open "claude://cowork/new?q=$(_urlenc "$prompt")&folder=$(_urlenc "$(pwd)")"

# Pattern 1b — same, but route to the Code (Epitaxy) tab instead
open "claude://code/new?q=$(_urlenc "$prompt")&folder=$(_urlenc "$(pwd)")"

# Pattern 1c — add a specific file attachment while keeping the folder as workspace context
open "claude://cowork/new?q=$(_urlenc "$prompt")&folder=$(_urlenc "$(pwd)")&file=$(_urlenc "$abs_file_path")"

# Pattern 2 — folder-only via Launch Services (routes to Cowork via CjA → dispatchOnCoworkFromMain)
open -a Claude.app /path/to/project

# Pattern 3 — prompt-only, claude.ai Chat tab (unrelated to local workspace)
open "claude://claude.ai/new?q=$(_urlenc "$prompt")"
```

**Key properties (live-verified):**
- Patterns 1 / 1b / 1c are **single-URL atomic**, mirroring Codex's `codex://new?prompt=&path=` capability. Peer-level atomic handoff with one architectural difference: Claude supports repeatable `folder=` (multi-root workspace) and repeatable `file=` (multiple attachments); Codex has a single scalar `path=`.
- Pattern 1 lands in the **Cowork** tab via the `dispatchOnCoworkFromMain` IPC with `prefillOnly: true, source: "external"`. Pattern 1b lands in the **Code (Epitaxy)** tab via webview nav. Both pre-fill the composer; neither auto-executes; neither shows a confirmation modal.
- Pattern 2 (the `public.folder` LS handler) routes specifically to the **Cowork** tab — resolves the "where does it go?" open question from the 2026-04-18 probe. The handler is `CjA` in the main bundle; it dispatches via the same `dispatchOnCoworkFromMain` IPC as the URL-scheme Cowork route, just without a prompt (`selectedDirectories: [path]` only).
- Pattern 3 is the **claude.ai web chat** surface — still present, still the right choice when you have a prompt but no folder. Distinct from Patterns 1 / 1b in that it lands in the **Chat** tab, not the Code/Cowork workspace.

**What this unlocks:** For OK's "Open this wiki page in Claude Desktop" use case, the canonical shape is `claude://cowork/new?q=<prompt>&folder=<repo>&file=<wiki-page>` — prompt + workspace + specific file in one URL, lands in the Cowork tab with all three pre-filled. No two-step required, no modal.

### VS Code — same inheritance as Cursor/Windsurf, no chat URL

```bash
code /path/to/project          # open folder (or use --goto for file+line)
# no URL equivalent for "send message to Copilot Chat" exists
```

---

## Finding E5: Docs-frameworks / Linear's handling of "workspace" in practice

**Confidence:** INFERRED from cross-reference to prior evidence
**Evidence:** `linear-ai-deeplinks-extraction.md` Finding 6 + cross-app synthesis

Linear's production registry (19 tools) does NOT include `path=` in any of its constructed URLs for URL-based tools. Linear's `{{issue.identifier}}` and `{{context}}` payload is text-only — the target tool is responsible for resolving the right workspace. For terminal-command tools (Claude Code, Codex CLI, OpenCode, Amp), Linear spawns them in the user's currently-selected Linear desktop cwd via `runTerminalCommand` IPC — which means **Linear assumes the user has already chosen the workspace at shell-cwd time**, not that Linear routes the tool into a specific path.

**Implication:** The industry's production registry confirms the landscape: Codex's `path=`/`originUrl=` remains unused by any handoff tool in the 2026 ecosystem. It remains an open opportunity for OK (which uniquely knows the local repo path) to be the first production consumer.

---

## Summary matrix (updated 2026-04-21)

| App | `open -a App <folder>` | CLI opens folder | Workspace URL param | Single-URL "open workspace + seed prompt" |
|---|---|---|---|---|
| **Claude Desktop** | ✅ (`public.folder` Editor role; routes to Cowork via `CjA` → `dispatchOnCoworkFromMain`) | ❌ (`claude` CLI is terminal Claude Code, no Desktop bridge) | ✅ `folder=` (repeatable) + `file=` (repeatable) — **newly confirmed 2026-04-21** | ✅ `claude://cowork/new?q=&folder=&file=` **or** `claude://code/new?q=&folder=&file=` — live-verified |
| **Codex Desktop** | ❌ (no `CFBundleDocumentTypes` — `open -a Codex.app /path` silently drops the path) | ✅ `codex app [PATH]` + `--open-project <path>` | ✅ `?path=<abs>`, `?originUrl=<git>` | ✅ `codex://new?prompt=&path=&originUrl=` |
| **Cursor** | ✅ (`public.folder` Editor role) | ✅ `cursor /path`, `-n`, `-r`, `-g`, `-a` | ⚠️ `workspace=<name>` by window name, not path; **`cursor://` has no folder-open route at all** | ❌ two-step required (`cursor /path` + prompt URL); single prompt-approval modal per invocation |
| **Zed** | ⚠️ INFERRED (not probed locally) | ✅ `zed /path`, `-n`, `-r`; accepts `zed://` positional | ❌ | ⚠️ closest via CLI: `zed /path "zed://agent?prompt=..."` |
| **Windsurf** | ⚠️ INFERRED | ✅ `windsurf /path`, `.`, `--folder-uri` | ❌ | ❌ |
| **VS Code** | ✅ | ✅ `code /path` + full flag set | N/A (no chat URL at all) | N/A |
| **ChatGPT** | ❌ | ❌ | ❌ | ❌ |
| **Perplexity** | ❌ | ❌ | ❌ | ❌ |

**Headline shift from 2026-04-18 → 2026-04-21:** Claude Desktop moves from **one** ✅ column (LS folder handler only) to **three** ✅ columns. The initial probe missed the `claude://cowork/*` + `claude://code/*` host branches of the router; fixing that bumps Claude from "can only do folder-only via LS handler" to "peer-level atomic single-URL combo with Codex."

**Per-app "right primitive for OK's Electron host" recap** (what to use from `shell.openExternal` in a renderer):

| Goal | Claude Desktop | Codex Desktop | Cursor |
|---|---|---|---|
| Open folder only | `claude://cowork/new?folder=<abs>` **or** `open -a Claude.app <abs>` (both → Cowork) | `codex://new?path=<abs>` **or** `codex app <abs>` (no LS handler — DO NOT use `open -a`) | `cursor <abs>` **or** `open -a Cursor.app <abs>` (no URL-scheme folder-open route — must shell-out) |
| Open folder + seed prompt | `claude://cowork/new?q=&folder=` | `codex://new?prompt=&path=` | Two-step: `cursor <abs>` then `cursor://anysphere.cursor-deeplink/prompt?text=&workspace=<basename>` |
| Add specific file attachment | `…&file=<abs>` | ❌ | ❌ |
| Route to specific tab/mode | `cowork` / `code` host prefix | N/A | `&mode=ask/agent/debug/plan` on prompt URL |

---

## Negative searches / documented absences (updated 2026-04-21)

- ~~**`claude://` URL with `path=` or `workspace=` param** — not in the 15-route `td` enum (`claude-desktop-deep-links.md:43-49`). Searched again in 2026-04-18 asar — router has no path-handling branch.~~ **Retracted 2026-04-21.** This negative search only inspected the `td` *path* enum (switch cases inside the `claude://claude.ai/*` branch). The `Tx` / `Jb` *host* enum has sibling `cowork` and `code` routes whose handlers accept `folder=` + `file=` + `q=` — see `claude-desktop-deep-links.md` Findings 8–9. The router DOES have path-handling branches; the original probe just didn't look at the host-switch branches.
- **`cursor://` with a path-based workspace param** — explicit negative in `cursor-desktop-deep-links.md:545` ("`deeplink.routeToWorkspaceName` strictly matches window.workspace names, not paths"). Confirmed 2026-04-21 live — `workspace=<basename>` targets a window by its name (basename of the folder the window opened), not by path.
- **`cursor://` with ANY folder-open route (not just a workspace param on prompt)** — confirmed negative 2026-04-21. The whole `cursor://anysphere.cursor-deeplink/*` surface is action-oriented (`prompt`, `command`, `rule`, `mcp/install`, `background-agent`, `settings`, `pr-review`, `plugin/add`, `createchat`, `glass`) — none of them open a folder as a workspace. For Cursor, folder-open is exclusively CLI (`cursor /path`) or Launch Services (`open -a Cursor.app /path`); there is no URL primitive.
- **`cursor://file/<path>`** — explicitly NOT wired (`cursor-desktop-deep-links.md:519`).
- **`zed://agent?workspace=`, `zed://agent?path=`** — not in the `OpenRequest::parse` match chain (`zed-and-jetbrains-deep-links.md:262`).
- **Windsurf CLI with `--prompt` or prompt-URL-equivalent flag** — Windsurf inherits VS Code CLI surface; no Cascade-specific CLI flag documented in Windsurf docs or community `windsurf-cli` projects.
- **Claude Desktop CLI bridge to the Desktop app** — the `claude` CLI is Claude Code (terminal); no `claude app [PATH]` or `claude-desktop --open <path>` equivalent. (The URL-scheme `claude://cowork/new?folder=` route in Finding 8 is the functional equivalent, reached from shell via `open "…"` rather than a dedicated CLI subcommand.)
- **`open -a Codex.app /path`** — confirmed negative 2026-04-21 live. Codex has no `CFBundleDocumentTypes` registration, so macOS Launch Services silently drops the path argument and Codex opens empty. The user-facing symptom: nothing indicates the path was ignored. Must use `codex app /path`, `codex --open-project /path`, or `codex://new?path=<abs>` instead.
- **ChatGPT / Perplexity folder support of any kind** — neither has `public.folder` registered; neither has a CLI; neither has a path-based URL param. App Intents (via Shortcuts.app) carry `prompt`/`query` only, not paths.

---

## Gaps / follow-ups (updated 2026-04-21)

1. **Zed Info.plist probe** — confirm `public.folder` registration on `/Applications/Zed.app`. Currently INFERRED from CLI behavior. Installing Zed locally would move this to CONFIRMED in one `plutil` invocation.
2. **Windsurf Info.plist + asar probe** — same gap as Zed. VS Code fork lineage makes `public.folder` near-certain, but unverified.
3. ~~**Claude Desktop's folder-open behavior observed end-to-end** — `public.folder` registration is confirmed in Info.plist, but what happens when you actually run `open -a Claude.app /repo` is not observationally verified in this pass…~~ **RESOLVED 2026-04-21.** Live-tested: `open -a Claude.app /path` routes to the Cowork tab via the `CjA` handler → `dispatchOnCoworkFromMain({ selectedDirectories: [path] })` IPC. Same dispatcher as the URL-scheme `claude://cowork/new?folder=` route, minus any prompt. See `claude-desktop-deep-links.md` Finding 10 for the verbatim bundle code.
4. **Whether Codex's `originUrl=` matcher accepts HTTPS git origins or only SSH** — `Lp` pipeline behavior with `https://github.com/owner/repo.git` vs `git@github.com:owner/repo.git` is not differentiated in prior evidence. Worth a controlled probe against a known local clone.
5. ~~**Whether Claude Desktop's embedded Claude Code workspace could be URL-seeded via a future `claude://claude.ai/code?path=<abs>` param** — currently unsupported…~~ **Mostly RESOLVED 2026-04-21** (different URL than speculated, but the capability exists). The actual URL is `claude://cowork/new?q=&folder=&file=` (Cowork tab) or `claude://code/new?q=&folder=&file=` (Code/Epitaxy tab) — distinct host routes on the `claude://` scheme, not a param on `claude://claude.ai/code`. Both are atomic prompt+folder+file handoff and live-verified.
6. **New (2026-04-21): `QqA` prompt-length cap on the Claude Desktop URL params** — the `Jb.Cowork` and `Jb.Code` handlers both slice the prompt at `QqA` chars before dispatch. The value was not extracted in the probe; worth extracting for OK's URL-builder to know when to truncate vs. when to fall back to attach-file-with-prompt-header semantics. Likely in the 8K ballpark based on the shape of similar caps elsewhere in the bundle, but that's a guess.
7. **New (2026-04-21): trust-dialog behavior for untrusted folders** — `dispatchOnCoworkFromMain` with a folder not already in `localAgentModeTrustedFolders` may show a trust prompt on first use. Not tested in this pass; worth dogfooding for first-time-use UX.
8. **New (2026-04-21): file-only (no folder) scope in Claude** — `claude://cowork/new?q=&file=<abs>` without `folder=` — does it scope Claude to just the parent directory of the file, or to only the file with no filesystem access? Not tested. Matters if OK wants to hand off a single wiki page without exposing the entire repo.
