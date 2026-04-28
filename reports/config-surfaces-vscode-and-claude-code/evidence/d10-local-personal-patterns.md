# Evidence: D10 — Project-Local-Personal Override Patterns Across Products

**Dimension:** Cross-product survey of the "developer's personal layer on top of the team's shared project config" pattern. Grounds parent D5/B1 (Claude Code's `.claude/settings.local.json` asymmetry) in the broader landscape.
**Date:** 2026-04-25
**Sources:** Next.js / dotenv-flow docs; direnv stdlib + issue #556; github/gitignore JetBrains template; git-scm.com gitignore docs; Cursor docs; Docker Compose docs; lefthook docs; Husky docs; multiple VS Code GitHub issues (#37519, #40233, #68007, #247050, #282806).

---

## Key files / pages referenced

- `https://nextjs.org/docs/pages/guides/environment-variables` — Next.js `.env.local` precedence, gitignore convention
- `https://github.com/kerimdzhanov/dotenv-flow` — dotenv-flow lineage that `.env.local` inherits from
- `https://direnv.net/man/direnv-stdlib.1.html` — `source_env_if_exists .envrc.private` example
- `https://github.com/direnv/direnv/issues/556` — open feature request to first-class `.envrc.local` (community pattern only)
- `https://github.com/github/gitignore/blob/main/Global/JetBrains.gitignore` — `# User-specific stuff` taxonomy for `.idea/`
- `https://git-scm.com/docs/gitignore` — `.git/info/exclude` documented as per-clone, never-shared
- `https://cursor.com/docs/context/rules` — Cursor's Project Rules / User Rules split (no per-developer overlay)
- `https://docs.docker.com/compose/multiple-compose-files/merge/` — `compose.override.yaml` auto-loaded
- `https://github.com/microsoft/vscode/issues/{37519,40233,68007,247050,282806}` — VS Code requests for `.vscode/settings.local.json`-class file, 2017–2025
- `https://lefthook.dev/usage/features/local.html` — first-class `lefthook-local.yml` overlay
- `https://typicode.github.io/husky/how-to.html` + `github.com/typicode/husky/issues/323` — Husky's absence of per-developer overlay

---

## Findings

### Finding D10.1: Next.js / dotenv-flow `.env.local` — first-class personal env-var override
**Confidence:** CONFIRMED
**Evidence:** `nextjs.org/docs/pages/guides/environment-variables`; `github.com/kerimdzhanov/dotenv-flow`

```text
Environment variables are looked up in the following places, in order, stopping
once the variable is found.
1. process.env
2. .env.$(NODE_ENV).local
3. .env.local      (Not checked when NODE_ENV is `test`.)
4. .env.$(NODE_ENV)
5. .env

Warning: The default create-next-app template ensures all `.env` files are
added to your `.gitignore`. You almost never want to commit these files.
```

**Per-dimension:**
- File name: `.env.local`, plus `.env.<environment>.local` (`.env.development.local`, `.env.production.local`, `.env.test.local`)
- Gitignore convention: **Formal** — Next.js docs explicitly state `.env*.local` is intended to be gitignored; `create-next-app` ships them so by default
- Precedence: `.env.<env>.local` > `.env.local` > `.env.<env>` > `.env`. `process.env` (already-set) wins above all
- Typical contents: developer-specific API keys, local DB URLs, machine-specific paths, secret values
- First-class or convention-only: **First-class** — dotted-`.local` suffix is a built-in lookup tier

**Notable carve-out:** `.env.local` is *not* loaded when `NODE_ENV=test` so test runs are reproducible across developers.

### Finding D10.2: direnv `.envrc.private` / `.envrc.local` — convention via `source_env_if_exists`, not built-in
**Confidence:** CONFIRMED for `source_env_if_exists` mechanism; `.envrc.private` in official docs, `.envrc.local` is community variant
**Evidence:** `direnv.net/man/direnv-stdlib.1.html`; `github.com/direnv/direnv/issues/556`

```text
source_env_if_exists .envrc.private
```

**Per-dimension:**
- File name: `.envrc.private` (per official stdlib example) or `.envrc.local` (community-prevalent variant); no canonical name
- Gitignore convention: **Informal** — user is expected to add the chosen file to `.gitignore` themselves; not enforced by tool
- Precedence: Whatever order `source_env_if_exists` is called at — typically last line of `.envrc`, so the local file's exports win
- Typical contents: per-developer secrets, local-machine paths, AWS profile selectors, API tokens
- First-class or convention-only: **Convention-only** — direnv ships the primitive but does not auto-load any `.local`-suffixed file. Issue #556 (open since the repo's early days) is an unresolved request to first-class `.envrc.local` / `.envrc.dist`

### Finding D10.3: JetBrains `.idea/` — split is across files, not within files
**Confidence:** CONFIRMED
**Evidence:** `github.com/github/gitignore/blob/main/Global/JetBrains.gitignore`

```text
# User-specific stuff
.idea/**/workspace.xml
.idea/**/tasks.xml
.idea/**/usage.statistics.xml
.idea/**/dictionaries
.idea/**/shelf
```

**Per-dimension:**
- File name: `.idea/workspace.xml`, `.idea/tasks.xml`, `.idea/usage.statistics.xml`, `.idea/dictionaries/`, `.idea/shelf/`, `.idea/dataSources/`
- Gitignore convention: **Formal community standard** — official `github/gitignore` template files them under `# User-specific stuff` header
- Precedence: N/A — these aren't *overrides* of committed files; they're a different category of state (open tabs, breakpoints, recent files)
- Typical contents: open editor tabs, run-config history, breakpoints, custom dictionary entries, file shelves
- First-class or convention-only: **First-class file separation** — JetBrains writes user state into structurally different files from team-shared project metadata

JetBrains is an axis off the dominant `.local`-suffix idiom: rather than `<file>.local` being a personal overlay, JetBrains writes structurally different files for user-state (`workspace.xml` etc.) versus team-shared project metadata (`runConfigurations/`, `inspectionProfiles/`, `vcs.xml`).

### Finding D10.4: VS Code — no equivalent surface; long-standing community request, repeatedly closed-as-duplicate
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/vscode/issues/40233` (open since Dec 2017, in Backlog); `/issues/247050` (closed not-planned/duplicate, Apr 2025); `/issues/282806` (open Dec 2025); `/issues/68007` (closed duplicate); `/issues/37519` (Nov 2017)

**Per-dimension:**
- File name: N/A — does not exist
- Gitignore convention: N/A
- Precedence: N/A
- Typical workaround: (a) edit `.vscode/settings.json` and never stage it (fragile under git stash / pull conflicts); (b) per-workspace Profiles (heavyweight bundle swap, not a settings overlay); (c) raise to User-level settings (leaks to other workspaces)
- First-class or convention-only: **Absent** — multiple feature requests since 2017 consistently routed to Backlog or closed as duplicate

The most recent (December 2025, #282806) requests `.code-workspace.local` and explicitly cites `.env.local` and `docker-compose.override.yml` as precedent — eight years after the initial request. No VS Code maintainer has *publicly* defended the absence in the surveyed issues; the rejection is via Backlog-and-duplicate routing rather than an architectural statement.

### Finding D10.5: Cursor — no project-local-personal overlay for rules; only Project Rules vs User Rules
**Confidence:** CONFIRMED
**Evidence:** `cursor.com/docs/context/rules`

**Per-dimension:**
- File name: N/A for project-local-personal layer; Cursor offers `.cursor/rules/*.mdc` (committed) and account-synced User Rules (global)
- Gitignore convention: N/A — no per-developer overlay file documented
- Precedence: Team Rules → Project Rules → User Rules; User Rules apply only to Agent/Chat (not Inline Edit)
- Typical contents: Project Rules hold project-wide AI guidance with `description`, `globs`, `alwaysApply` frontmatter; User Rules hold per-developer preferences across all projects
- First-class or convention-only: **Absent** — no `.cursor/rules/local/` convention or per-rule gitignore mechanism documented

A developer who wants a personal rule for one project must either (a) add it to global User Rules (leaks to other projects, only applies to Agent/Chat) or (b) author a project rule and not commit it (ad-hoc).

### Finding D10.6: git `.git/info/exclude` — per-clone, never-shared, for the gitignore file itself
**Confidence:** CONFIRMED
**Evidence:** `git-scm.com/docs/gitignore`

```text
Patterns which are specific to a particular repository but which do not need
to be shared with other related repositories (e.g., auxiliary files that live
inside the repository but are specific to one user's workflow) should go into
the $GIT_DIR/info/exclude file.
```

**Per-dimension:**
- File name: `.git/info/exclude`
- Gitignore convention: **Structurally impossible to commit** — lives inside `.git/`, which is never tracked
- Precedence: Patterns merge with `.gitignore` (additive); negation works
- Typical contents: per-developer auxiliary files — editor swap files, scratch directories, personal scripts at repo root
- First-class or convention-only: **First-class** — documented in canonical `gitignore(5)` man page

Git itself has the cleanest per-developer-per-repo override surface in the ecosystem — but only for the gitignore file. Hosts the file outside the working tree to solve the gitignore-of-gitignores problem.

### Finding D10.7: Docker Compose `compose.override.yaml` — auto-loaded, downstream-gitignored
**Confidence:** CONFIRMED
**Evidence:** `docs.docker.com/compose/multiple-compose-files/merge/`; `github.com/laravel/laravel` PR #5487

```text
By default, Compose reads two files, a compose.yaml and an optional
compose.override.yaml file. By convention, the compose.yaml contains your
base configuration. The override file can contain configuration overrides
for existing services or entirely new services.
```

**Per-dimension:**
- File name: `compose.override.yaml` (or legacy `docker-compose.override.yml`)
- Gitignore convention: **Mixed** — Docker's own docs do *not* prescribe gitignoring it; downstream frameworks (Laravel notably) commit it to `.gitignore` and community guidance commonly does
- Precedence: Auto-merged with `compose.yaml`; "locally defined values" replace base values; new services added
- Typical contents: developer-specific port bindings, mounted local source paths, debugger ports, alternate image tags
- First-class or convention-only: **First-class auto-loading; gitignore convention is downstream/community**

Docker Compose ships a different shape: auto-loaded by Compose itself, but the personal-vs-shared distinction lives in `.gitignore` discipline rather than in the file's name.

### Finding D10.8: lefthook `lefthook-local.yml` — first-class personal hooks overlay
**Confidence:** CONFIRMED
**Evidence:** `lefthook.dev/usage/features/local.html`; `lefthook.dev/configuration/`

```text
You can extend and override options of your main configuration with
lefthook-local.yml. Don't forget to add the file to .gitignore.
```

**Per-dimension:**
- File name: `lefthook-local.yml` (or `.lefthook-local.json` etc., matching the leading-dot convention of the main config)
- Gitignore convention: **Formal** — official docs state "Don't forget to add the file to .gitignore"
- Precedence: Merged into and overrides `lefthook.yml`; can also be used standalone
- Typical contents: developer-skipped slow checks, additional personal pre-commit steps, per-machine path overrides
- First-class or convention-only: **First-class** — documented with a dedicated page

lefthook is the cleanest contrast to husky's absence: same domain (git-hooks managers), but lefthook ships the local-overlay surface as a first-class documented feature.

### Finding D10.9: Husky — no personal-hooks overlay; closest is bypass to `.git/hooks/`
**Confidence:** CONFIRMED
**Evidence:** `typicode.github.io/husky/how-to.html`; `github.com/typicode/husky/issues/323`

**Per-dimension:**
- File name: N/A — does not exist
- Gitignore convention: N/A
- Precedence: N/A
- Typical workaround: Husky reconfigures git to use `.husky/` instead of `.git/hooks/`, so personal hooks placed in `.git/hooks/` are bypassed. Documented user-level startup files (`~/.config/husky/init.sh`, `~/.huskyrc`) cover environment setup but not project-scoped per-developer hooks
- First-class or convention-only: **Absent**

Issue #323 ("Support custom git hooks to be not overridden by husky") captures the long-running community ask. Sharp contrast with lefthook.

---

## Cross-cutting analysis

### Prevalence

The pattern is **widespread but unevenly first-classed**. Of nine surveyed surfaces:
- **Three first-classed it** (Next.js / dotenv-flow `.env.local`, Docker Compose `compose.override.yaml`, lefthook `lefthook-local.yml`) — plus Claude Code per parent report
- **Two ship the primitive** (direnv `source_env_if_exists`; git `.git/info/exclude`)
- **One uses category separation** rather than overlay (JetBrains `.idea/` user-specific files)
- **Three have no surface** (VS Code, Cursor, husky)

The pattern is most mature in environment-variable and dependency-config tooling; least mature in editor/IDE config.

### Naming conventions

| Suffix | Examples | Notes |
|--------|----------|-------|
| `.local` | `.env.local`, `.cursor/rules/local/` (proposed), `.vscode/settings.local.json` (requested), `.code-workspace.local` (requested), `.envrc.local` (community), `.claude/settings.local.json` | **Dominant** — drives most requests for new instances of the pattern |
| `-local` | `lefthook-local.yml`, `.lefthook-local.json` | Used when filename has no leading dot; same semantic as `.local` |
| `.private` | `.envrc.private` | direnv's official example; community has shifted toward `.local` |
| `.override` | `compose.override.yaml`, `docker-compose.override.yml` | Frames as "overlay" rather than "personal" |
| Category-separated, no suffix | `.idea/workspace.xml`, `.idea/tasks.xml` | JetBrains alone — different files, not a `.local` overlay |

The `.local` (or `-local`) suffix dominates and is recognized as the canonical convention by recent feature requests in adjacent ecosystems (the December 2025 VS Code `.code-workspace.local` request explicitly cites `.env.local` and `docker-compose.override.yml` as precedent).

### First-class vs convention-only

| First-class (auto-loaded by tool) | Convention-only | Absent |
|---|---|---|
| Next.js / dotenv-flow `.env.local` | direnv `.envrc.local` | VS Code `.vscode/settings.local.json` |
| Docker Compose `compose.override.yaml` | git `.git/info/exclude` (per-clone but not overlay) | Cursor `.cursor/rules/local/` |
| lefthook `lefthook-local.yml` | JetBrains `.idea/workspace.xml` (different file, not overlay) | husky personal hooks |
| Claude Code `.claude/settings.local.json` | | |

The pattern correlates with whether the tool's config has a "merge multiple files" pipeline already. Tools that load N files of the same kind in precedence order (env loaders, Compose, hooks runners) tend to first-class the personal overlay. Tools with single-file resolution (VS Code workspace settings, Cursor rules) require the personal layer to be requested as a new product surface — and tend to leave it unbuilt.

### Any product that explicitly *rejected* the pattern

VS Code is the closest to an explicit rejection: five separate community requests since 2017 (#37519, #40233, #68007, #247050, #282806) consistently in Backlog or closed-as-duplicate. The closest published rationale is structural — Settings Sync, Profiles, and Workspace files are positioned as the answers to "configuration that varies per developer," even though none addresses "this project, this developer, not committed."

Husky is a similar but quieter absence — community has gradually migrated to lefthook for adopters who need this property.

direnv has *not* rejected the pattern but has not first-classed it either: maintainers ship `source_env_if_exists` as the assembly primitive and have left the canonical-suffix issue (#556) open without resolution.

---

## Negative searches

* **`.cursor/rules/local/`, "Cursor rules local override", "Cursor rules gitignore"** — no documented per-developer overlay surface in `.cursor/rules/`
* **husky `husky-local.yml`, "husky personal hooks"** — no first-class surface; only documented escape is bypass to `.git/hooks/` or `~/.huskyrc` (user-global)
* **VS Code maintainer rationale for declining `.vscode/settings.local.json`** — no public architectural statement found across five surveyed issues; closures are via Backlog-and-duplicate routing
* **direnv official `.envrc.local` documentation** — not found by that name in stdlib docs; the example uses `.envrc.private`. `.envrc.local` is the prevalent community variant

---

## Gaps / follow-ups

* Whether any IDE/editor tool besides JetBrains has chosen the file-category-separation approach (vs the overlay approach)
* Cursor's `.cursorrules` legacy (single-file form) and whether downstream community had a `.cursorrules.local` convention before the migration to `.cursor/rules/`
* Whether `compose.override.yaml`'s split (auto-loaded but gitignored downstream) has produced a dual-purpose ambiguity in the wild
