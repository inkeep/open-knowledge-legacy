# Evidence: D7 — Comparison-Product Touch

**Dimension:** Brief grounding in five comparison products' config approaches
**Date:** 2026-04-25
**Sources:** git-scm.com (git-config man page); eslint.org docs + 2022-08 blog; jetbrains.com (settings-sync help); github/gitignore JetBrains template; docs.npmjs.com; cursor.com docs

---

## Key files / pages referenced

- `https://git-scm.com/docs/git-config` — canonical man page; documents all four scopes, precedence, includeIf
- `https://eslint.org/docs/latest/use/configure/configuration-files` — flat config reference
- `https://eslint.org/blog/2022/08/new-config-system-part-2/` — official rationale for replacing cascade
- `https://www.jetbrains.com/help/idea/settings-sync.html` — Backup and Sync plugin (current name)
- `https://github.com/github/gitignore/blob/main/Global/JetBrains.gitignore` — community-canonical user-specific exclusion list
- `https://docs.npmjs.com/cli/v10/configuring-npm/npmrc` — four-tier cascade, `${VAR}` interpolation
- `https://cursor.com/docs/context/rules` — current `.cursor/rules/*.mdc` model
- `https://forum.cursor.com/t/i-read-cursorrules-will-be-deprecated-please-dont/51779` — community confirmation of `.cursorrules` legacy status

---

## Findings

### Finding D7.1: git config — three-tier with conditional includes and worktree sub-tier
**Confidence:** CONFIRMED
**Evidence:** `git-scm.com/docs/git-config`

```text
The files are read in the order given above, with last value found taking
precedence over values read earlier.
$(prefix)/etc/gitconfig    [system]
$XDG_CONFIG_HOME/git/config or ~/.gitconfig    [global]
$GIT_DIR/config            [local]
$GIT_DIR/config.worktree   [worktree, only when extensions.worktreeConfig set]
```

Git's configuration model is a four-file cascade with last-wins precedence. From lowest to highest priority: `--system` (`$(prefix)/etc/gitconfig`, all users on the host), `--global` (`~/.gitconfig` or `$XDG_CONFIG_HOME/git/config`, per OS-user), `--local` (`$GIT_DIR/config`, per repository — the default write target), and `--worktree` (`$GIT_DIR/config.worktree`, opt-in via `extensions.worktreeConfig`, scoped to a single linked worktree). The `includeIf` directive layers conditional inclusion on top: `gitdir:`, `onbranch:`, and `hasconfig:remote.*.url:` predicates pull in additional config files based on repo location, current branch, or remote URL — the canonical mechanism for per-directory git identities. Git config is primarily CLI-managed (`git config --global user.name "..."`); the files are plain INI and intended to be hand-editable as a secondary path. There is no GUI in core git.

### Finding D7.2: ESLint — moved away from cascade to flat config (single root file, glob-scoped)
**Confidence:** CONFIRMED
**Evidence:** `eslint.org/docs/latest/use/configure/configuration-files`; `eslint.org/blog/2022/08/new-config-system-part-2/`. Flat config default since ESLint v9.0.0 (April 2024).

```text
"the eslintrc config system had grown to be more complex than necessary
through a series of small, incremental changes" [...] aim to "eliminate the
config cascade of eslintrc" [...] reduces "disk access required as compared
to eslintrc, which had to check each directory from the linted file
location up to the root."
```

ESLint deliberately moved away from a cascading model. The legacy `.eslintrc.*` system let you drop a config file in any subdirectory; child configs inherited from parent configs found by walking up the tree, with `extends`/`overrides` for further composition. ESLint v9.0.0 (April 2024) made the flat config (`eslint.config.js`) the default. The migration blog post frames the change as wanting "to get rid of the directory-based config cascade" and notes that flat config "dramatically reduces the disk access required as compared to eslintrc, which had to check each directory from the linted file location up to the root." Flat config still resolves by walking up from the target file to find one `eslint.config.*`, but inside that single file scoping is explicit: a `files` glob array (and optional `basePath`) on each config object decides what it applies to, with later objects in the array overriding earlier ones. Notable as a product that consciously *retired* a cascade.

### Finding D7.3: JetBrains — `.idea/` split into shared-with-team vs personal, plus account-synced IDE settings
**Confidence:** CONFIRMED for the shared/personal split + current 2026.1 sync product (Backup and Sync plugin); UNCERTAIN on exact rebrand history (Settings Repository → IDE Settings Sync → Backup and Sync) — current docs do not narrate it
**Evidence:** `github.com/github/gitignore/blob/main/Global/JetBrains.gitignore`; `jetbrains.com/help/idea/settings-sync.html`

```text
# User-specific stuff
.idea/**/workspace.xml
.idea/**/tasks.xml
.idea/**/usage.statistics.xml
.idea/**/dictionaries
.idea/**/shelf
```

JetBrains IDEs (IntelliJ family) put per-project settings under a `.idea/` directory that is intentionally split. Files describing the project itself — `runConfigurations/`, `inspectionProfiles/`, `codeStyles/`, `vcs.xml`, `modules.xml` — are meant to be committed and shared with the team. Files holding per-developer IDE state — `workspace.xml` (open tabs, recent files, breakpoints), `tasks.xml`, `usage.statistics.xml`, `dictionaries/`, `shelf/` — are gitignored; the official JetBrains.gitignore template files them under a `# User-specific stuff` header. Orthogonally, JetBrains offers an account-synced layer (currently the "Backup and Sync" plugin, bundled in IntelliJ IDEA 2026.1; previously branded "Settings Repository" then "IDE Settings Sync") that pushes UI themes, keymaps, code styles, live templates, plugin enable/disable state, and editor settings to a JetBrains Account so the same developer's preferences follow them across machines. The architectural feature is that "shared with team" and "this developer's IDE state" are explicitly *different files*, not different sections of one file.

### Finding D7.4: npm `.npmrc` — four-tier cascade, CLI-managed, with environment-variable interpolation
**Confidence:** CONFIRMED
**Evidence:** `docs.npmjs.com/cli/v10/configuring-npm/npmrc`

```text
1. /path/to/my/project/.npmrc      (project)
2. ~/.npmrc                         (user)
3. $PREFIX/etc/npmrc                (global)
4. /path/to/npm/itself/npmrc        (built-in defaults)
[...] Environment variables can be replaced using ${VARIABLE_NAME}
```

npm uses a four-level cascade of `.npmrc` files: project (`./.npmrc`, repo-local), user (`~/.npmrc`), global (`$PREFIX/etc/npmrc`, system-wide install prefix), and built-in (a config file inside the npm install itself, holding defaults that survive upgrades). Precedence is project > user > global > builtin. Files are INI-format `key = value` with `${VAR}` environment-variable interpolation (`cache = ${HOME}/.npm-packages`) and `;` / `#` comments. Configuration is primarily CLI-managed: `npm config set <key> <value>` writes to the user-level file by default, with `--location=project|user|global` to target other tiers; `npm config get`, `list`, `edit`, `delete` round it out. Auth tokens (per-registry `_authToken`, `_password`) typically live here. There is no GUI — every operation is a CLI command or a hand-edit of the `.npmrc` file.

### Finding D7.5: Cursor — `.cursor/rules/*.mdc` (new) replacing `.cursorrules` (legacy), atop inherited VS Code topology
**Confidence:** CONFIRMED for the file model and frontmatter fields (current Cursor docs); CONFIRMED via community evidence and Cursor's own "Generate Cursor Rules" tooling that `.cursorrules` is the legacy single-file form being phased out (Cursor docs no longer mention it)
**Evidence:** `cursor.com/docs/context/rules`; `forum.cursor.com/t/i-read-cursorrules-will-be-deprecated-please-dont/51779`

```text
Project Rules: "Stored in `.cursor/rules`, version-controlled and scoped
to your codebase" — markdown files (`.md` or `.mdc`) with frontmatter
fields: description, globs, alwaysApply.
User Rules: global to your Cursor environment; "User Rules are not
applied to Inline Edit (Cmd/Ctrl+K). They are only used by Agent (Chat)."
```

Cursor is a VS Code fork and inherits VS Code's full configuration topology (`settings.json`, workspace `.code-workspace`, profiles, Settings Sync) wholesale, then layers AI-rule surfaces on top. Project-scoped AI rules live in `.cursor/rules/*.mdc` — multiple Markdown files, each with frontmatter declaring `description` (used by "Apply Intelligently"), `globs` (file patterns the rule scopes to, e.g. `**/*.py`), and `alwaysApply` (boolean — always vs only-when-relevant). Project Rules are committed and shared. The earlier single-file `.cursorrules` at repo root is the legacy form, supported but documented as being phased out — current Cursor docs no longer reference it. User-level rules are configured in Cursor Settings, sync via the Cursor account, and apply globally across all projects (Agent/Chat only — not Inline Edit). The `AGENTS.md` convention is offered as a simpler alternative for project-level agent instructions. The deliberate parallel to Claude Code's `CLAUDE.md` + `.claude/` model is unmistakable.

---

## Gaps / follow-ups

- JetBrains rebrand history (Settings Repository → IDE Settings Sync → Backup and Sync plugin) is not narrated in current official docs; the present-day product is confirmed but the timeline isn't authoritative.
- ESLint flat config does technically resolve by ancestor-walk to find the *single* `eslint.config.*` (so it has a one-shot location lookup, just no rule cascade) — distinguished here because it's a meaningful nuance the migration blog post itself elides.
- `.cursorrules` has no formal deprecation date in Cursor's official docs; classification rests on (a) its absence from current docs, (b) Cursor's "Generate Cursor Rules" tooling switching default output to `.cursor/rules/`, and (c) consistent community framing as legacy.
