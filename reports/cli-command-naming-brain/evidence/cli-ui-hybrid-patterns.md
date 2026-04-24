# Evidence: CLI + UI Hybrid Scaffolder Patterns

**Dimension:** D2 — CLI + UI-triggered hybrid scaffolders + subcommand vs flag
**Date:** 2026-04-23
**Sources:** shadcn/ui docs + DeepWiki + CLI 3.0 changelog; Astro docs + CLI reference; Prisma docs; Supabase docs; clig.dev; jmmv.dev CLI design essays; GitHub CLI manual; Electron docs; Yeoman / Backstage Scaffolder docs; Jekyll subcommand precedent.

---

## Key sources referenced

- https://ui.shadcn.com/docs/cli — shadcn CLI reference
- https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp — shadcn 3.0 + MCP server changelog
- https://deepwiki.com/shadcn-ui/ui/3.1-cli-commands-reference — structured code walkthrough of shadcn CLI pipeline
- https://ui.shadcn.com/docs/registry/mcp — official shadcn MCP server
- https://github.com/shadcn-ui/ui/issues/931 — overwrite-confirm feature request (idempotency semantics)
- https://github.com/shadcn-ui/ui/issues/2030 — `init` overwrites existing config (non-idempotent init)
- https://docs.astro.build/en/guides/integrations/ — `astro add` behavior
- https://docs.astro.build/en/reference/cli-reference/ — Astro CLI reference
- https://github.com/withastro/astro/blob/main/packages/astro/src/cli/add/index.ts — `astro add` source (primary)
- https://github.com/withastro/astro/commit/a4c0d0b4df540b23fa85bf926f9cc97470737fa1 — recent diff-preview restoration
- https://www.prisma.io/docs/orm/tools/prisma-cli — Prisma CLI reference
- https://www.prisma.io/docs/cli/studio — `prisma studio` docs
- https://deepwiki.com/prisma/prisma/3.1-generate-command — `prisma generate` internals (watch, debounce)
- https://supabase.com/docs/guides/functions/quickstart — `supabase functions new`
- https://supabase.com/blog/supabase-edge-functions-deploy-dashboard-deno-2-1 — Dashboard-triggered create/deploy
- https://fumadocs.vercel.app/docs/cli — Fumadocs CLI (`fumadocs add`)
- https://clig.dev/ — Command Line Interface Guidelines
- https://jmmv.dev/2013/09/cli-design-subcommand-based-interfaces.html — canonical subcommand-vs-flag essay
- https://jmmv.dev/2013/08/cli-design-putting-flags-to-good-use.html — flag-use heuristic essay
- https://cli.github.com/manual/gh_issue_create — `gh` CLI noun-verb convention
- https://www.electronjs.org/docs/latest/tutorial/process-model — Electron process model (justifies shared-module approach)
- https://code.visualstudio.com/api/extension-guides/command — VS Code command pattern (handler + `executeCommand`)
- https://www.gitkraken.com/blog/nodegit-libgit2 — GitKraken's rationale for avoiding shell-out
- https://github.com/backstage/backstage — scaffolder checkpoint / idempotency feature

---

## Findings

### Finding: shadcn CLI exposes `runInit` / `runAdd` as importable async functions, with Commander as a thin wrapper
**Confidence:** CONFIRMED
**Evidence:** DeepWiki reference + multiple codebase-analysis write-ups (Ramu Narasinga series).
> "The `runInit` function is an exported async function defined as `export async function runInit(cwd: string, config: Config)`. The runInit function performs several operations: ensuring all resolved paths directories exist, writing tailwind config, writing css file, writing cn file, and installing dependencies."
> "The init command uses `preFlightInit` to determine if it should run in 'initialization' mode (existing project) or 'create' mode (new project via --name), with `preFlightInit` checking for existing `components.json` and project structure."
**Location:** `packages/shadcn/src/commands/init.ts` (L81 per DeepWiki); `packages/shadcn/src/preflights/preflight-init.ts`.
**Implications:** shadcn's CLI is shape (a) — **single TS module exported, consumed by both CLI and MCP server**. Commander is a thin argv parser on top; any other entry point (MCP tool handler, editor plugin, programmatic script) calls `runInit` / `runAdd` directly. This is the cleanest hybrid pattern because there's no subprocess spawn, no shell quoting, no stdout parsing — typed function + typed return.

### Finding: shadcn CLI 3.0 adds an MCP server that invokes the same CLI operations programmatically
**Confidence:** CONFIRMED
**Evidence:** https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp
> "The MCP server enables remote, programmatic, or containerized execution of shadcn CLI commands (such as init, add, etc.) that you would normally run locally, making it easy to automate, integrate, or run in cloud/dev environments. The MCP server exposes shadcn CLI operations as MCP tools."
**Implications:** The MCP server is a **second entry point** into the same `runInit` / `runAdd` functions. This is precisely the "CLI canonical, UI calls function directly" shape for a hybrid. v0.dev's "Open in v0" is a parallel surface — but it uses a different transport (`v0.dev/chat/api/open?url=…`) that ultimately triggers the same CLI when the user pastes the command into their terminal. Not a direct programmatic call from v0.dev to the user's machine; v0 still emits a command to run.

### Finding: shadcn CLI `init` is NOT fully idempotent by default — `add` fails on existing components unless `--overwrite`
**Confidence:** CONFIRMED
**Evidence:**
- https://github.com/shadcn-ui/ui/issues/2030 — "npx shadcn-ui@latest init will overwrite existing configurations" (reported as a bug)
- https://github.com/shadcn-ui/ui/issues/931 — feature request to add an overwrite-confirmation prompt
- https://ui.shadcn.com/docs/cli — `add` supports `-o, --overwrite` (default false); without it, files may be skipped with a "files might be identical, use --overwrite to overwrite" message.
**Implications:** shadcn treats `init` as one-shot-ish (destructive on re-run) and `add` as "present OR present-and-possibly-stale" — the user must opt in to overwrite. The 3.0 "Smart Merge" flow improves this: fetch → transform → compare (if `--diff`) → write. Diff-then-confirm is shadcn's answer to idempotency — the system doesn't auto-detect "same" and skip silently; it surfaces a diff for the user to approve.

### Finding: `astro add` is designed as an idempotent integration wizard; `add` is exposed as a CLI-only surface (no Astro devtoolbar trigger)
**Confidence:** CONFIRMED (CLI) / INFERRED (no devtoolbar trigger)
**Evidence:**
- https://docs.astro.build/en/guides/integrations/ — "Astro includes an `astro add` command to automate the setup of official integrations. This `astro add` command will run an automatic integration wizard to update your configuration file and install any necessary dependencies."
- The source lives at `packages/astro/src/cli/add/index.ts` — CLI-only entrypoint per the directory structure.
- Recent commit "fix(add): restore tsconfig diff preview in astro add (#15827)" confirms the idempotent UX pattern: show the diff, let the user approve/reject before mutating config.
- No evidence of an `astro dev` devtoolbar button that shells out to `astro add` — the devtoolbar is scoped to runtime inspection, not project-mutation operations.
**Implications:** Astro picks shape (b)-ish: CLI is canonical, not re-entrantly exposed as an in-app button. The idempotency contract is "show diff → user confirms," same UX pattern as shadcn 3.0.

### Finding: `create-next-app` is a separate package (one-shot); `next` has no post-init scaffolder subcommand
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/create-next-app, https://nextjs.org/docs/app/api-reference/cli/create-next-app
> "create-next-app is a CLI tool that creates Next.js apps using one command. It is officially maintained by the creators of Next.js."
The `next` CLI itself (`next dev`, `next build`, `next start`, `next lint`) has no `next init`, `next add`, or `next new-page` subcommand.
**Implications:** Next.js deliberately splits **project creation** (a separate `create-next-app` package, invoked via `npx`) from **project operation** (`next dev`, etc.). Post-init scaffolding (new pages, new API routes) is done by hand or via third-party tools. This is the **"one-shot init is a separate package"** model, opposite of shadcn/astro. Relevant contrast: Next.js does NOT have a re-runnable "add a thing" command in the main CLI, suggesting that pattern is reserved for tools where the scaffolding primitive is the value prop (shadcn components, Astro integrations) vs. Next.js where scaffolding is incidental.

### Finding: Supabase uses multiple scaffolders — `supabase init` (one-shot config) + `supabase functions new <name>` (re-runnable per-entity); Dashboard duplicates, does not shell out
**Confidence:** CONFIRMED
**Evidence:**
- https://supabase.com/docs/guides/local-development/cli/getting-started — `supabase init` creates `supabase/config.toml`
- https://supabase.com/docs/guides/functions/quickstart — `supabase functions new hello-world` creates `supabase/functions/hello-world/index.ts`
- https://supabase.com/blog/supabase-edge-functions-deploy-dashboard-deno-2-1 — "You can create, test, and deploy Edge Functions directly from the Supabase Dashboard"
**Implications:** Supabase is shape (d) — duplicated logic. The Dashboard has its own edge-function creation UI (web-based, cloud-hosted) that doesn't shell out to the user's local CLI. Two reasons: (1) the Dashboard is web-hosted, not an Electron app, so it can't run the user's CLI; (2) Dashboard flows are for cloud deployment, not local filesystem mutations. The pattern illustrates: **when the UI lives in a different runtime from the CLI, duplication is unavoidable; when it lives in the same runtime (Electron), shape (a) is strictly better.**

### Finding: Prisma `generate` is re-runnable and debounced in watch mode; Prisma Studio is a separate command with no IPC link to generate
**Confidence:** CONFIRMED
**Evidence:**
- DeepWiki summary: "The `runGenerate` method is wrapped with `simpleDebounce` to prevent rapid repeated executions in watch mode, which helps ensure idempotent re-runs."
- https://www.prisma.io/docs/cli/studio — `prisma studio` opens a web app at port 5555; separate process/lifecycle from generate.
- Prisma 7 Studio is SQL-driven and introspects the DB directly — "does not rely on the Prisma schema file at all" — so it has zero need to trigger `generate`.
**Implications:** Prisma intentionally decouples: `generate` is a CI/build-time idempotent op; `studio` is a standalone viewer. No UI button anywhere in Studio says "regenerate the client." This avoids the shape question entirely — there's nothing to share. Relevant to OK: a pure *viewer* UI doesn't need hybrid architecture; a UI that *mutates project state* does.

### Finding: Fumadocs `fumadocs add` mirrors shadcn pattern — registry-backed, re-runnable component installer
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.vercel.app/docs/cli
> "The Fumadocs CLI automates setups and installs components. The `fumadocs add` command allows you to select and install components... The CLI fetches the latest version of components from the GitHub repository of Fumadocs, and when you install a component, it is guaranteed to be up-to-date. It also transforms import paths."
**Implications:** Fumadocs explicitly models itself on shadcn. Same subcommand-with-registry pattern. No in-app UI trigger observed (Fumadocs is a dev-time tool, not an Electron app). Reinforces that **`add` as a subcommand is the canonical shape for "install/scaffold a named thing" in this generation of tools.**

### Finding: Docusaurus `docs:version` is a CLI scaffolder that snapshots current docs; no UI trigger
**Confidence:** CONFIRMED
**Evidence:** https://docusaurus.io/docs/versioning
> "You can use the versioning CLI to create a new documentation version based on the latest content in the docs directory. The `docusaurus docs:version` CLI is just a convenience tool."
**Implications:** `docs:version` is a namespaced colon-delimited subcommand (`docs:version`) — an alternative to noun-verb for two-level hierarchies. But: no Docusaurus in-app UI, no scope for a hybrid trigger. Noted as a different naming convention worth considering.

### Finding: clig.dev + jmmv.dev agree: subcommands reduce complexity when you have many operations; flags are for tuning one operation's behavior
**Confidence:** CONFIRMED
**Evidence:**
- clig.dev: "If you've got a tool that's sufficiently complex, you can reduce its complexity by making a set of subcommands."
- jmmv.dev subcommand essay: "Subcommand-based interfaces are common in CLI tools that provide more than one operation, with examples including svn, git, ifconfig, yum, apt-get…"
- jmmv.dev flag essay: "If you want to conditionally expose part of the functionality of a tool, using flags is the right thing to do. Specific cases in which flags are right are: enabling debugging features, selecting whether the output should be colored or not, specifying the number of columns in the printed data, raising the verbosity level."
- Thoughtworks / CLI design blog: "Be consistent across subcommands by using the same flag names for the same things."
**Implications:** The written heuristic is unambiguous: **a subcommand is for a distinct operation; a flag tunes an operation's behavior.** "Scaffold a knowledge-base structure" is a distinct operation, not a tuning knob on `init`. Therefore: subcommand > flag.

### Finding: Major modern CLIs (git, docker, kubectl, gh, shadcn, astro, supabase, prisma) converge on subcommands-for-operations
**Confidence:** CONFIRMED
**Evidence:**
- `gh` follows `gh <noun> <verb>` (`gh repo create`, `gh issue create`).
- Git and Docker are historical precedents; Docker moved to `docker <noun> <verb>` explicitly (`docker container create`) with legacy top-level aliases.
- Jekyll has `jekyll new` and `jekyll new-theme` — separate subcommands for distinct scaffolders (not `jekyll init --theme`).
- shadcn: `init`, `add`, `diff`, `build`, `apply`, `search`, `view`, `mcp` — nine distinct subcommands.
**Implications:** An entire generation of CLI design has converged on subcommands for distinct operations. A **flag buried on init** would be stylistically off-brand for the ecosystem Open Knowledge sits in.

### Finding: Idempotency patterns — all three mature tools (shadcn, astro, prisma generate) use "compute diff → show → apply-or-skip," not silent no-ops
**Confidence:** CONFIRMED
**Evidence:**
- shadcn 3.0: fetch → transform → **compare (if --diff)** → write (if confirmed/overwrite).
- astro add: recent commit restored tsconfig diff preview; standard UX is "here's what I'd change to `astro.config.*`, approve?"
- prisma generate: debounced in watch mode; generates regardless of whether the schema changed (fast no-op in practice via Prisma's own caching).
**Implications:** The shared idempotency UX is **"show the user the delta, let them approve, apply atomically."** No tool does "silent skip because already-done" — users lose trust in a tool that says nothing. For OK's scaffolder, the right pattern is: compute proposed folder structure + config edits → diff against current state → prompt (or auto-accept with `--yes`) → apply.

### Finding: Electron apps that expose CLI-equivalent operations predominantly use shape (a) — shared TS module — not shell-out
**Confidence:** INFERRED (indirect evidence; direct comparisons rare in public docs)
**Evidence:**
- GitKraken's architecture rationale (https://www.gitkraken.com/blog/nodegit-libgit2): "software that executes child processes that run the Git 'porcelain' API and parse the results can be incredibly inefficient because Git needs to interact with the underlying repository database, and the software has to reinterpret the retrieved results through text parsing." They chose NodeGit (library) over shell-out to `git` specifically to avoid the parse-stdout antipattern.
- Electron docs recommend `UtilityProcess` over `child_process.fork` for CPU-intensive or crash-prone tasks — but the context is hosting a Node service, not "call my own CLI."
- VS Code extension API: commands are registered handlers invokable via `vscode.commands.executeCommand()` — a shared in-process function call surface, explicitly not shell-out. User-visible invocation (command palette, keybinding, programmatic) all route through the same handler.
**Implications:** When the CLI code is already in your runtime (Electron main process = Node.js, same as your CLI), shelling out is pure overhead. The authoritative convergent pattern from GitKraken (library over shell) and VS Code (handler + dispatcher) is: **share the implementation, wrap it in multiple entry points.** Shell-out is warranted when the CLI is implemented in a different language, has heavy global state, or is versioned independently on the user's machine. None of those apply to OK's internal scaffolder.

### Finding: Backstage's scaffolder explicitly treats idempotency as a first-class design concern via "checkpoints"
**Confidence:** CONFIRMED
**Evidence:** Backstage scaffolder docs: "The experimental checkpoints feature can be used to ensure idempotency for steps. Since the key passed to the checkpoint is scoped to the scaffolder task and not the individual step, utilizing the same action multiple times at different points in the template will result in only the first action's checkpoint-enclosed code being run."
**Implications:** Idempotency isn't free — it's an explicit design contract. Open Knowledge's scaffolder should document what "re-run" means: which writes are re-issued (harmless), which are skipped (content already present), which are diffed-and-prompted (config mutation).

---

## Pattern frequency table

| Tool | CLI command | UI trigger? | Shared-impl shape (a/b/c/d) | Idempotent? |
|---|---|---|---|---|
| **shadcn/ui** | `shadcn add <name>`, `shadcn init` | Yes — MCP server + v0.dev (indirect) | **(a)** single TS module; `runInit`/`runAdd` exported, Commander + MCP wrap | Partial — `add` needs `--overwrite`; 3.0 "Smart Merge" diffs-then-confirms |
| **Astro** | `astro add <integration>` | No devtoolbar trigger observed | (b)-ish — CLI is canonical; source is a single `index.ts` in `cli/add/` | Yes — shows tsconfig + astro.config diff preview, prompts before write |
| **create-next-app** | `npx create-next-app` (separate package) | No | N/A — one-shot init; `next` CLI has no `add`/`new` | No (one-shot) |
| **Supabase** | `supabase init`, `supabase functions new <name>` | Yes — Dashboard creates edge functions directly | **(d)** duplicated: Dashboard has its own server-side creation path | Yes (each scaffolder targets a distinct path) |
| **Prisma** | `prisma init`, `prisma generate`, `prisma studio` | No (Studio is viewer-only) | (b) — CLI canonical; Studio is independent standalone | `generate` yes (idempotent, debounced); `init` no (one-shot) |
| **Fumadocs** | `fumadocs add` | No | Presumed (a) per shadcn lineage | Partial (same shadcn-style overwrite semantics) |
| **Docusaurus** | `docusaurus docs:version` | No | (b) CLI-only | Yes — creates a new version directory, harmless re-run with new tag |
| **GitHub CLI (gh)** | `gh repo create`, `gh issue create` | Same CLI, different noun | (a) — single Go binary, noun-verb subcommands | N/A (idempotency is per-noun-verb) |
| **Jekyll** | `jekyll new`, `jekyll new-theme` | No | (b) CLI-only | No (errors on existing dir) |
| **VS Code extensions** | `vscode.commands.executeCommand(id)` | Yes — palette, keybinding, programmatic, all route to same handler | **(a)** handler registration + dispatcher; universal pattern | Per-command |
| **GitKraken** | (uses NodeGit library, not shelling to git) | Yes — Electron app | **(a)** NodeGit bindings + Electron share one codebase | Per-op |

**Pattern prevalence ranking:**
1. **(a) shared TS/JS module** — dominant for in-runtime UI (shadcn, gh, VS Code, GitKraken).
2. **(b) CLI canonical, UI absent** — common when there's no UI to speak of (Astro, Prisma, Docusaurus, Fumadocs).
3. **(d) duplication** — forced on cloud/web UIs that can't reach local filesystem (Supabase Dashboard).
4. **(c) RPC/HTTP server** — rare for scaffolders; seen in Backstage backend-scaffolder (server-owned templating) but not the common case.

---

## Subcommand vs flag verdict

For a re-runnable, idempotent scaffolder — **subcommand wins decisively.**

**Evidence-based reasoning:**

1. **clig.dev / jmmv.dev heuristic:** "Flags conditionally expose part of the functionality; subcommands are for distinct operations." Building a folder structure, writing instructions into `config.yml`, and emitting folder frontmatter is a **distinct operation** from scaffolding `.open-knowledge/` and registering MCP. Different side effects, different success criteria, different idempotency contract. Bundling it under `ok init --brain` would conflate two operations that can each fail and succeed independently.

2. **Re-runnability is the tell:** `init` conventionally means "first-time setup" across every tool surveyed (shadcn, astro, prisma, supabase, jekyll). Re-running `init` is usually a warning or error. A re-runnable op does NOT belong under `init` — it belongs as its own subcommand (`shadcn add`, `astro add`, `supabase functions new`). If Open Knowledge's brain scaffolder is meant to be re-run every time the user wants to re-apply the structure, overloading `init` fights the ecosystem's shared vocabulary.

3. **Ecosystem consistency:** `ok` already has `init`, `start`, `mcp`. Adding `ok brain` (noun) or `ok scaffold brain` (verb-noun) matches `shadcn add`, `astro add`, `gh repo create`, `supabase functions new`. Burying it in `ok init --brain` is a stylistic outlier.

4. **Discoverability:** `ok --help` lists subcommands; flags are hidden behind `ok init --help`. Users who want the feature look for it as a top-level command first.

5. **Extensibility:** If a second "scaffold X" command lands later (e.g. "scaffold the hub doc template," "scaffold a section"), `ok init --brain --hub` becomes a boolean-flag collision mess. A namespace (`ok scaffold brain`, `ok scaffold hub`) or flat subcommands (`ok brain`, `ok hub`) scale cleanly.

**Specific recommendation for the three candidate shapes:**

- `ok brain` — **preferred if there is ever going to be only one "scaffold my knowledge-base content" operation.** Shortest, most memorable, matches `shadcn add`'s top-level-noun terseness. Open-verb semantics (`ok brain` reads as "Open Knowledge brain" — command-as-label).
- `ok init brain` — **preferred if there will be more than one kind of scaffoldable content thing** (hub, section, template). Namespace-under-init aligns "setup-like things" under `init`. But `init` carrying a re-runnable child conflicts with the established "init = one-shot" connotation.
- `ok init --brain` — **not recommended.** Violates clig.dev heuristic (flag tunes behavior, doesn't add an operation), fights the ecosystem's pattern, worst discoverability, worst extensibility.

**Strongest single-sentence verdict:** A scaffolder that is re-runnable and idempotent is the textbook case for a dedicated subcommand per every mature CLI design guideline; a flag on `init` is the anti-pattern precedent that shadcn, astro, and supabase all avoided.

---

## Recommended shape for Open Knowledge

**Top recommendation: Shape (a), single TS module exported from `@inkeep/open-knowledge` (or a shared core package), consumed by both (i) the CLI subcommand via Commander and (ii) the Electron renderer via an IPC channel that calls the same function in the main process.**

**Why:**

1. **Electron main process is already Node.js and already imports the CLI's packages.** There's no runtime boundary — the cost of shelling out to `ok brain` from Electron is all downside (subprocess spawn, stdout parsing, no typed return, no streaming progress, `.asar` resolution issues per https://github.com/electron/electron/issues/9459). No upside.

2. **Matches shadcn's landed pattern.** shadcn 3.0's MCP server is the direct analog of OK's "Electron UI button" — a second entry point calling the same `runInit`/`runAdd`. The pattern is proven at scale and well-understood by ecosystem contributors.

3. **Typed IPC beats stdout parsing.** The Electron "set up my knowledge base" button should render structured progress (which folders created, which config keys written, what was already present). Shelling to the CLI forces parsing stderr/stdout. A shared function returns `{created: string[], skipped: string[], configEdits: Edit[]}` directly.

4. **Dry-run / diff / prompt is easier with a shared module.** The scaffolder can return a `ScaffoldPlan` object; the CLI renders it as ANSI-colored text + confirm prompt; the Electron UI renders it as a diff component with an "Apply" button. Identical logic, different presenters. This is precisely the split shadcn 3.0 landed ("fetch → transform → compare → write").

5. **Idempotency contract lives in one place.** "Already present" detection, frontmatter merge rules, config-edit conflict handling — all implemented once, tested once, behaves identically from CLI and UI. Shape (d) duplication (Supabase Dashboard) is explicitly bad and only chosen when forced by runtime separation.

**Concrete shape:**

```ts
// packages/cli/src/scaffolder/brain.ts (or packages/core/...)
export interface ScaffoldPlan {
  created: string[];      // new files/dirs
  skipped: string[];      // already-present (content match)
  configEdits: ConfigEdit[];  // proposed YAML mutations
  warnings: string[];
}
export async function planBrainScaffold(cwd: string, opts: BrainOpts): Promise<ScaffoldPlan>;
export async function applyBrainScaffold(cwd: string, plan: ScaffoldPlan): Promise<ScaffoldResult>;
```

- CLI: `ok brain` calls `planBrainScaffold()` → renders diff → prompts → `applyBrainScaffold()`. `--yes` skips the prompt.
- Electron: IPC handler calls the same functions. The renderer shows the plan in a React diff view with an "Apply" button.
- Future MCP tool: same two functions wrapped as an MCP tool. Zero logic duplication.

**Subcommand name recommendation:** Lean `ok brain` if scaffolding a knowledge-base brain is the singular "set up my content" operation. Reserve `ok init` for its existing "bootstrap `.open-knowledge/` + register MCP" role. This matches `shadcn init` / `shadcn add` splitting "set up project" from "add a thing."

If OK expects multiple scaffolders (hub, brain, section, template), prefer `ok scaffold <thing>` (verb-noun à la `gh issue create`) so the namespace scales. But based on current scope, `ok brain` is simpler and defensible.

**Idempotency UX:** Follow the shadcn 3.0 / astro add convention: show a diff of proposed changes before mutating `config.yml` or overwriting files. Skip silently only for exact-content matches (file-already-present-with-same-bytes). Always print a summary. Never fail on re-run for harmless re-applies.

---

## Negative searches / gaps

- **Direct Astro `add` source code inspection was blocked** (WebFetch disabled for raw.githubusercontent.com; WebSearch could only find it indirectly via commit and docs references). The idempotency claim about `astro add` is confirmed by the recent "restore tsconfig diff preview" commit and by the docs' description of the integration wizard, but the exact "already-installed" detection path in `index.ts` was not read line-by-line.
- **shadcn's `runAdd` signature** was not directly confirmed (only `runInit`). Inferred from the parallel structure of the command files and from the CLI 3.0 "Smart Merge" flow documentation. Confidence is high but not CONFIRMED at source-code level for `runAdd` specifically.
- **Electron "invoke my own CLI subprocess vs share TS module" head-to-head write-up** — no canonical source found. The recommendation rests on transitive evidence (GitKraken rationale, VS Code handler pattern, Electron docs' `UtilityProcess` guidance) plus first-principles reasoning about runtime unity. No published benchmark or post saying "we tried both, shared module won."
- **v0.dev → shadcn direct programmatic invocation** — v0 emits a shell command string that the user runs; v0 does not execute the CLI on the user's machine. This is slightly different from the Electron case (where the desktop app COULD execute directly). Noted but not a direct analog.
- **Fumadocs CLI internal structure** not confirmed at source level — only docs. Presumed (a) by lineage (explicitly shadcn-modeled) but not verified.
- **Jekyll `new` idempotency** not formally documented; empirical behavior is "errors on existing directory" based on common usage, but the docs did not surface a precise specification.
