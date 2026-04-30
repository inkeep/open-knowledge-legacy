---
title: "Eval Group A — Project structure (content + folders)"
description: "Per-field verdicts for content.dir, content.include, content.exclude, folders[] under the config-architecture-framework."
date: 2026-04-28
group: "Project structure (content + folders)"
framework: "specs/2026-04-25-config-edit-paths/evidence/config-architecture-framework.md"
schema: "packages/cli/src/config/schema.ts:23-127"
loader: "packages/cli/src/config/loader.ts"
---

# Eval Group A — Project structure (content + folders)

## Summary

Group: "Project structure (content + folders)"
Fields evaluated: 4

Verdict counts:
  - keep_config: 4
  - env_only: 0
  - both_config_and_env: 0
  - drop: 0
  - wire_engine_features: 0

Recommended schema diff:
  - keep `content.dir` (string, default `'.'`) — natural workspace home
  - keep `content.include` (string[], default `['**/*.md', '**/*.mdx']`) — array, workspace-shared
  - keep `content.exclude` (string[], default `[]`) — array, workspace-shared
  - keep `folders[]` (`FolderRule[]`, default `[]`) — array of nested records, workspace-shared, no env analog possible

All four fields are fully wired, team-shared, and (for three of four) array-shaped — the framework's decision tree converges on `keep_config` for every one.

Cross-cutting note (CONFIRMED): `OK_TEST_CONTENT_DIR` exists in the dev server (`packages/app/src/server/hocuspocus-plugin.ts:80-91`) and in stress fixtures (`packages/app/tests/stress/_helpers/fixtures.ts:210`) — it is a **test-isolation hatch for the in-process Vite/Hocuspocus dev server**, not a production env override of `content.dir`. Production `bootServer()` resolves `contentDir` via `resolveContentDir(config, cwd)` (`packages/cli/src/config/paths.ts:18-20`); there is no `OK_CONTENT_DIR` or equivalent. Keep this distinction in mind: nothing in production reads an env var to override these four fields.

---

## field: `content.dir`

```yaml
field: "content.dir"
type: "z.string()"
default: "'.'"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/config/paths.ts:18-20"  # resolveContentDir(config, cwd) = resolve(cwd, config.content.dir)
    - "packages/cli/src/commands/start.ts:411"  # contentRoot: config.content.dir → bootServer
    - "packages/cli/src/commands/start.ts:335"  # contentDir = resolveContentDir(config, cwd)
    - "packages/cli/src/commands/preview.ts:22" # resolveContentDir
    - "packages/cli/src/commands/sync.ts:32"    # resolveContentDir
    - "packages/cli/src/commands/clean.ts:97"   # resolveContentDir
    - "packages/cli/src/commands/status.ts:125" # resolveContentDir
    - "packages/cli/src/commands/stop.ts:105"   # resolveContentDir
    - "packages/cli/src/commands/ui.ts:116"     # resolveContentDir
    - "packages/cli/src/commands/init.ts:900"   # resolveContentDir (after auto-init)
    - "packages/cli/src/mcp/server-discovery.ts:361" # resolveContentDir per cwd
    - "packages/cli/src/mcp/tools/preview-url.ts:101,150" # resolveContentDir
    - "packages/cli/src/mcp/tools/edit-document.ts:101"   # resolveLockDir(resolveContentDir(...))
    - "packages/cli/src/mcp/tools/write-document.ts:89"   # resolveLockDir(resolveContentDir(...))
    - "packages/cli/src/mcp/tools/ingest.ts:142"          # context.config.content.dir
    - "packages/cli/src/mcp/tools/consolidate.ts:212"     # context.config.content.dir
    - "packages/cli/src/mcp/tools/research.ts:412"        # context.config.content.dir
    - "packages/app/src/server/hocuspocus-plugin.ts:55"   # parsed?.content.dir for dev-server boot
  wired: fully
  notes: |
    The single chokepoint is `resolveContentDir(config, cwd)` in
    `packages/cli/src/config/paths.ts:18-20` — every CLI command + MCP path
    routes through it (CONFIRMED via grep). The resolved absolute path is
    passed into `bootServer({ contentDir, ... })` and becomes the root for
    the file watcher, persistence, server.lock, ui.lock, and shadow repo.
    The dev server has its own parser at
    `packages/app/src/server/hocuspocus-plugin.ts:42-75` that reads the same
    YAML key directly (load-bearing for `bun run dev` on the workspace).
    `OK_TEST_CONTENT_DIR` is a *test* hatch (line 80) — production has no
    env override.

evaluation:
  ninety_percent_test: |
    The default `'.'` (project root = content root) covers the common case.
    Power users with monorepos or split layouts will set this to `'docs'`,
    `'content/'`, `'packages/docs/'`, etc. CONFIRMED — loader test
    `packages/cli/src/config/loader.test.ts:211-274` exercises
    `content:\n  dir: docs-a` per-project. Roughly the 60-70% case,
    not 90%+ → fits Decision Tree step 5 (team-shared scalar with workspace
    use case → CONFIG).
  team_shared_use_case: |
    Yes. The content directory is a defining property of the project: every
    teammate cloning the repo expects the same value, otherwise the file
    watcher indexes a different tree per machine. Workspace-scope is the
    natural home (`<project>/.open-knowledge/config.yml`).
  per_machine_use_case: |
    No persistent per-machine value. Tests use `OK_TEST_CONTENT_DIR` for
    Vite plugin isolation (packages/app/src/server/hocuspocus-plugin.ts:80),
    not as a documented user override. `--cwd` flag (cli.ts:51) effectively
    relocates content via `resolveContentDir(config, --cwd)` without needing
    a separate env var.
  secret_or_credential: no
  array_or_record: no

verdict: keep_config
rationale: |
  Decision Tree step 5: team-shared scalar with workspace use case → CONFIG.
  Not a secret (step 1), fully wired (step 2), not an array (step 3), not
  the 90%+-default scalar with a deployment-style env override (step 4 —
  there is no `PORT`/`HOST`-grade well-known env name for content directory,
  and the `--cwd` flag plus workspace-scope resolution already cover the
  per-invocation override case). Per P9, project-structure values are the
  paradigm workspace setting. CONFIRMED.

if_keeping_in_config:
  default_scope: workspace
  scope_tolerance:
    user: ⚠            # Setting `content.dir: docs` user-globally would be ignored or clash on every project that uses a different layout.
    workspace: ✅
    env: —             # No production env. `OK_TEST_CONTENT_DIR` is test-only and intentionally undocumented.
```

---

## field: `content.include`

```yaml
field: "content.include"
type: "z.array(z.string()).min(1)"
default: "['**/*.md', '**/*.mdx']"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/commands/start.ts:417"  # includePatterns: config.content.include → bootServer → ContentFilter
    - "packages/cli/src/commands/start.ts:633"  # previewContent({include: config.content.include})
    - "packages/cli/src/commands/init.ts:904"   # previewContent({include})
    - "packages/cli/src/commands/preview.ts:29" # previewContent({include})
    - "packages/cli/src/mcp/tools/search.ts:107"# const include = config.content.include → grep filter
    - "packages/server/src/content-filter.ts:104-105" # createContentFilter — picomatch(includePatterns, {dot:true})
    - "packages/app/src/server/hocuspocus-plugin.ts:58-63" # dev-server fallback parse
  wired: fully
  notes: |
    The runtime consumer is `createContentFilter` in
    `packages/server/src/content-filter.ts:101-244` — a `picomatch`
    matcher gates inclusion in the file watcher and the sibling-asset
    refcount map (D11 4-step ordered logic at lines 188-212). MCP `search`
    forwards this directly to `grep`. Schema enforces `min(1)` — silently
    empty include is a Zod validation error
    (`packages/cli/src/config/loader.test.ts:176`).

evaluation:
  ninety_percent_test: |
    Default `['**/*.md', '**/*.mdx']` covers the strict markdown-KB case.
    Teams with `.markdown`, `.txt`, scoped subtrees (`docs/**/*.md`), or
    custom extensions tune this. Estimated 30-50% of teams adjust. Not the
    90%-default cohort.
  team_shared_use_case: |
    Yes — same answer as content.dir. Every teammate must agree on the
    universe of tracked files, otherwise CRDT IDs diverge per-machine.
  per_machine_use_case: |
    No. A teammate setting different include globs per-machine breaks
    convergence (P9 ❌ for env scope here would actively misbehave —
    different machines would index different files).
  secret_or_credential: no
  array_or_record: yes  # array of strings

verdict: keep_config
rationale: |
  Decision Tree step 3: array → CONFIG-ONLY (P14). Env vars cannot represent
  arrays cleanly without per-tool encoding conventions; not justified here.
  Workspace scope is the natural home. CONFIRMED via P9 / P14.

if_keeping_in_config:
  default_scope: workspace
  scope_tolerance:
    user: ⚠            # User-global include would apply to *all* projects, almost always wrong.
    workspace: ✅
    env: —             # No env (P14).
```

---

## field: `content.exclude`

```yaml
field: "content.exclude"
type: "z.array(z.string())"
default: "[]"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/commands/start.ts:418"  # excludePatterns: config.content.exclude → bootServer → ContentFilter
    - "packages/cli/src/commands/start.ts:634"  # previewContent({exclude})
    - "packages/cli/src/commands/init.ts:905"   # previewContent({exclude})
    - "packages/cli/src/commands/preview.ts:30" # previewContent({exclude})
    - "packages/cli/src/mcp/tools/search.ts:108,114" # exclude + ['node_modules', '.git', '.claude', '.changeset', OK_DIR]
    - "packages/server/src/content-filter.ts:133-141" # ig.add(excludePatterns) layered after .gitignore
    - "packages/app/src/server/hocuspocus-plugin.ts:64-69" # dev-server fallback parse
  wired: fully
  notes: |
    Layered on top of `.gitignore` in `createContentFilter`
    (`packages/server/src/content-filter.ts:101-244`) using the
    `ignore` package. When `contentDir != projectDir`, paths are prefixed
    with the relative path from projectDir (lines 135-141) so excludes are
    interpreted as contentDir-relative — a non-trivial semantic that requires
    the value to come from a typed structured source (config.yml), not a
    free-form env string.

evaluation:
  ninety_percent_test: |
    Default `[]` is fine for greenfield projects relying on `.gitignore`.
    Teams excluding drafts (`drafts/**`), private notes, or specific
    subtrees not in `.gitignore` will tune. Estimated 20-30% of teams
    adjust — not the 90% cohort, but still substantial absolute usage.
  team_shared_use_case: |
    Yes. Excludes are a project-level decision (these files are not part
    of the published KB). Workspace scope is natural. Loader tests confirm
    arrays merge as expected (loader.test.ts:135-150 — workspace overrides
    user, arrays are *replaced* not concatenated, which is documented in
    loader.ts:11).
  per_machine_use_case: |
    No persistent per-machine case. A user could occasionally want to
    exclude something locally (drafts only on this machine) — but that's
    the future `.local.yml` story (P5 deferred), not env.
  secret_or_credential: no
  array_or_record: yes  # array of strings

verdict: keep_config
rationale: |
  Decision Tree step 3: array → CONFIG-ONLY (P14). Same reasoning as
  content.include. Workspace-natural; user-global is unusual since exclude
  patterns are typically project-specific. CONFIRMED.

if_keeping_in_config:
  default_scope: workspace
  scope_tolerance:
    user: ⚠            # User-global exclude applies to all projects — usually wrong shape.
    workspace: ✅
    env: —             # No env (P14).
```

---

## field: `folders[]`

```yaml
field: "folders"
type: "z.array(FolderRuleSchema)"
default: "[]"
nested_schema:
  - "FolderRuleSchema = { match: string (min 1), frontmatter: FolderFrontmatterSchema }"
  - "FolderFrontmatterSchema = { title?: string, description?: string, tags?: string[] }"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/mcp/tools/search.ts:150"      # const folderRules = config.folders → enrichPath
    - "packages/cli/src/mcp/tools/exec.ts:496"        # folderRules = config.folders → enrichPath
    - "packages/cli/src/mcp/tools/read-document.ts:144" # folderRules: config.folders → enrichPath
    - "packages/cli/src/content/enrichment.ts:192,356,360,560" # consumes folderRules → resolveFolderFrontmatter
    - "packages/cli/src/content/folder-rules.ts:34-58"      # resolveFolderFrontmatter — pure resolver
  wired: fully
  notes: |
    Order-matters merge engine in `packages/cli/src/content/folder-rules.ts`
    (CONFIRMED): scalars (title, description) — last matching rule wins;
    tags — concat-and-dedup-preserve-first across all matching rules.
    Picomatch matchers are memoized via WeakMap on the rules array
    (folder-rules.ts:24-32). The `init.ts` template documents the engine
    semantics in detail at lines 73-117 (CONFIRMED — covers picomatch glob
    gotchas, declaration-order rules, scalar-vs-tags semantics).
    Tests at `packages/cli/src/content/folder-rules.test.ts` exercise all
    branches.

evaluation:
  ninety_percent_test: |
    Default `[]` is fine; this is opt-in. Teams that adopt the lifecycle
    pattern (external-sources/research/articles, advertised via
    `init.ts:32-49,96-117` and seeded by `ok seed`) will populate it.
    Substantial-but-minority adoption; the field's value is high for the
    cohort that does adopt it. Not the 90%-default-leave-untouched cohort
    in the framework's drop sense (P32) — even if many never set it, the
    array of typed nested records cannot be expressed in env.
  team_shared_use_case: |
    Yes — this is the canonical workspace use case. Folder rules describe
    the project's information architecture (specs/ vs reports/ vs articles/
    vs research/, etc.) and must be shared across all teammates and CI to
    keep MCP tool output consistent.
  per_machine_use_case: |
    No. A teammate seeing different folder titles/descriptions/tags than
    another would be confusing.
  secret_or_credential: no
  array_or_record: yes  # array of nested records — strongest possible "config-only" signal

verdict: keep_config
rationale: |
  Decision Tree step 3 fires twice over: (1) array, (2) nested records.
  P14 forbids env representation. Workspace scope is the natural home.
  The field is typed (FolderRuleSchema), wired through three MCP tools
  + enrichment, and has its own resolver module + test suite — far from
  vestigial. CONFIRMED via every read site.

if_keeping_in_config:
  default_scope: workspace
  scope_tolerance:
    user: ⚠            # User-global folder rules would apply to all projects — almost always wrong (project-specific IA).
    workspace: ✅
    env: —             # No env (P14, structurally impossible).
```

---

## Cross-field findings

1. **All four fields are workspace-default** by P9. None has a real per-machine
   override case; the closest analog is `OK_TEST_CONTENT_DIR`, which is a
   *test-only* hatch for the dev-server Vite plugin
   (`packages/app/src/server/hocuspocus-plugin.ts:80-91`,
   `packages/app/tests/stress/_helpers/fixtures.ts:210`) — not a documented
   user-facing env override and not part of the production CLI bootstrap path.

2. **No CLI flag overrides exist** for any of these four fields. CLI flags
   only override `--port`, `--host`, `--open`, `--no-init` for `start`
   (`packages/cli/src/commands/start.ts:500-503`) — content/folder fields
   are read straight from the resolved config.

3. **`init.ts` documents all four as commented examples** (CONFIRMED at
   `packages/cli/src/content/init.ts:5-117`):
   - content block at lines 19-30 (dir/include/exclude as commented stubs)
   - folders block at lines 73-117 with a long example structure (matches
     what `ok seed` writes)

   No P31 violation — every commented knob in the template maps to a wired
   read site.

4. **Loader tests cover the merge semantics** at
   `packages/cli/src/config/loader.test.ts:135-150,176,211-274` — confirming
   workspace overrides user, arrays are replaced (not concatenated), and
   `min(1)` validation rejects empty include arrays. Schema tests at
   `packages/cli/src/config/schema.test.ts:115-148` exercise folder shape.

5. **Loader does NOT apply env overrides for any of these fields**
   (CONFIRMED at `packages/cli/src/config/loader.ts:105-128`) — the only
   env names recognized are `PORT` and `HOST`. Adding env support for
   `content.dir` would require new code; the framework says don't.

## Confidence

- **CONFIRMED**: All read-site claims (multiple grep passes citing exact
  file:line). Folder-rule semantics (read folder-rules.ts in full).
  init.ts template content (read in full). Loader env-override scope
  (read in full).
- **INFERRED**: Tunability percentages (the "90%" estimates). No telemetry
  exists to validate, but the seeded defaults plus per-package read sites
  strongly suggest the directional answer.
- **UNCERTAIN**: None on load-bearing claims.
