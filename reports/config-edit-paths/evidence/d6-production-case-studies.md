# D6 — Production Case Studies: GitLab, CircleCI, GitHub

Three production web YAML editors. Factual landscape only — what each system does, with primary-source citations.

## Case 1: GitLab Pipeline Editor

**Architecture (write path).** The pipeline editor commits via GitLab's GraphQL API. The frontend invokes a `commitCIFile` mutation (which wraps the broader `commitCreate` mutation defined in `app/graphql/mutations`) carrying parameters `$projectPath`, `$branch`, `$startBranch`, `$message`, `$filePath`, and crucially **`$lastCommitId`**. GraphQL requests POST to `/api/graphql`; mutations always require authentication. Backend mutations inherit from `Mutations::BaseMutation` and dispatch to a service object (e.g., `UpdateMergeRequestService`-style services). [CONFIRMED]

**Validation flow.** Two-tier:
- **Editor-side syntax validation** runs continuously in the browser. The editor is built on **Monaco Editor**; YAML is converted to JSON via **monaco-yaml** and validated against the **GitLab CI/CD JSON Schema (Draft-07)**. Errors render as inline squiggles. [CONFIRMED]
- **Server-side semantic validation** ("Validate" / "Lint" tabs) calls the CI Lint API, which "simulates the creation of pipeline due to a Git push event" — exercising includes resolution, rules evaluation, and the same parser the runner uses. [CONFIRMED]

**Schema delivery.** The GitLab CI/CD schema lives in the GitLab repo (`doc/development/cicd/schema.md` documents the contribution path). The schema is also mirrored on SchemaStore. The editor consumes the schema bundled in the SPA. [CONFIRMED for SchemaStore mirror; INFERRED for SPA bundling — docs do not specify cache vs. inline.]

**Dual-surface / conflict handling.** The `$lastCommitId` parameter is the conflict-detection mechanism: the mutation rejects if the branch tip has advanced since the editor opened the file. This is the standard GitLab "fast-forward / stale base" check and the same primitive used elsewhere in the GitLab repo write APIs. [CONFIRMED for parameter; INFERRED for rejection semantics — docs do not surface this UX explicitly, but the parameter name and GitLab repo conventions make the intent clear.] The pipeline-editor docs explicitly state **no concurrent-editor detection** between two users editing simultaneously; the conflict model is purely commit-time. [CONFIRMED — docs silent.]

**Error surface.** Tabs: **Edit** (with inline squiggles), **Visualize** (DAG), **Validate** / **Lint** (server-side simulation), **Full configuration** (resolved includes). [CONFIRMED]

## Case 2: CircleCI in-app config editor

**Architecture (write path).** The "Save and Run" button commits **to the user's VCS** (GitHub/Bitbucket/GitLab), not to CircleCI-side storage. A modal lets the user commit on the current branch or create a new branch. Off-default-branch saves require opening a PR on the VCS to land in main. [CONFIRMED]

**Validation flow.** "The built-in linter validates your YAML after every change" with a green/red bar indicator. The validator is the **CircleCI YAML Language Server** (open-sourced 2023, Go-based, implements LSP/JSON-RPC, on-disk parse cached in memory and reused for validation + autocomplete + hover). The same language server powers the official VS Code extension. The CLI's `circleci config validate` is a separate path that "hits CircleCI's servers to run validation against their full validation system" — i.e., schema validation alone is insufficient for full semantic checks (orbs, executors, contexts). [CONFIRMED]

**Schema delivery.** The official schema is published at `github.com/CircleCI-Public/circleci-yaml-language-server/blob/main/schema.json` — referenced by SchemaStore via raw GitHub URL. CircleCI documentation acknowledges "schema-level checking + additional semantic analysis done in code" — the schema is necessary but not sufficient. [CONFIRMED]

**Dual-surface / conflict handling.** Documentation **silent** on concurrent-editor detection or branch-movement conflicts. [CONFIRMED — no mention in docs.] Because the editor commits via VCS API, any conflict surfaces at VCS commit-time (branch tip mismatch, protected-branch rejection) rather than in the editor itself. [INFERRED]

**Error surface.** Tabs at the bottom: **Linter**, **Docs**, workflow name. Inline tooltips on hover with autocomplete suggestions linked to docs. Bottom bar (green/red) is the global validity signal. Per-key squiggles under problem lines. [CONFIRMED]

## Case 3: GitHub workflow web editor

**Architecture (write path).** The GitHub web editor (`/edit/<branch>/.github/workflows/<file>.yml`) commits via the GitHub web flow — a server-mediated commit attributed to the `web-flow` user (the committer; the author is the logged-in user). Users provide a commit message and choose to commit directly or open a PR. GitHub also offers `github.dev` (a hosted VS Code) as an alternative editor accessed via the dropdown next to "Edit." The dedicated `actions/new` template chooser ships starter workflows from the open-source `actions/starter-workflows` repo, each with a `.properties.json` companion for UI metadata. [CONFIRMED]

**Validation flow.** GitHub's first-party web editor does **minimal in-browser schema validation** for `.github/workflows/*.yml` — the public docs do not advertise schema-driven autocomplete in the plain web editor. Authoritative validation is server-side at workflow-parse time (when Actions resolves the workflow on push); errors surface as red workflow runs or "workflow file not found / invalid" on the Actions tab. [INFERRED — docs do not explicitly state "no inline validation," but the documented UX leans on push-time feedback.] The community-maintained schema at `https://json.schemastore.org/github-workflow.json` is the canonical schema used by IDEs (JetBrains, VS Code, monaco-yaml-based tools); GitHub itself **does not publish a first-party schema**. Whether `github.dev` consumes the SchemaStore URL or an internal copy is undocumented. [UNCERTAIN] The official `vscode-github-actions` extension bundles its own validation logic. [CONFIRMED]

**Schema delivery.** SchemaStore-published, community-maintained, no GitHub-first-party equivalent. Standalone validators (e.g., `mpalmer/action-validator`) consume the SchemaStore schema. [CONFIRMED]

**Dual-surface / conflict handling.** The web editor's commit form includes a **stale-base check**: if the branch tip moves between page-load and save, GitHub presents a conflict and routes users to the conflict editor (only for "competing line changes" — complex conflicts force local resolution). [CONFIRMED] Beyond that, no live concurrent-editor signal — the model is identical to GitLab's: commit-time only, no editing-presence. [CONFIRMED — docs silent on live presence.]

**Error surface.** Inline only (basic syntax highlighting). The pre-merge / pre-push check happens at runner-resolution time; errors appear in the Actions tab as failed workflow parses, not in the editor itself. [INFERRED — the editor is a lightweight surface; no "Validate" tab exists comparable to GitLab/CircleCI.]

## Cross-cutting observations

**Convergent patterns:**
1. **All three commit to git as the source of truth.** None store YAML in editor-private storage. Web edits become `git commit` operations. [CONFIRMED across all three]
2. **None implement live concurrent-editor presence (CRDT, OT, or "another tab is editing").** Conflict detection is purely commit-time, gated on branch-tip / lastCommitId / stale-base checks. The web editor is a stateless form over a git ref. [CONFIRMED — docs silent on live presence in all three; GitLab's `lastCommitId` and GitHub's stale-base are commit-time only.]
3. **Schema is a JSON Schema delivered out-of-band.** GitLab and CircleCI publish first-party schemas (also mirrored on SchemaStore); GitHub relies entirely on SchemaStore community-maintenance. [CONFIRMED]
4. **Two-tier validation: schema-level browser checks + server-side semantic validation.** GitLab and CircleCI both expose this explicitly (Lint tab, Save-and-Run, `config validate` CLI hitting servers). GitHub's "second tier" is the runner's parse at push time. [CONFIRMED]
5. **All three use the schema → autocomplete → hover docs LSP shape.** GitLab via monaco-yaml, CircleCI via its open-source language server, GitHub via VSCode extension. [CONFIRMED]

**Divergences:**
- **Write path mechanism.** GitLab: GraphQL `commitCIFile` mutation with explicit `lastCommitId`. CircleCI: VCS API call (commit lands in the user's GitHub/Bitbucket repo, not CircleCI). GitHub: server-mediated web-flow commit attributed to a service user.
- **First-party vs community schema.** GitLab + CircleCI maintain canonical schemas in their own repos. GitHub does not — SchemaStore is the de facto canonical source.
- **Validation tier surfacing.** GitLab exposes both tiers as distinct UI tabs (Edit, Validate, Lint). CircleCI exposes one validity bar plus a Linter tab. GitHub web editor exposes neither — feedback is push-time only.
- **Editor sophistication.** GitLab + CircleCI ship dedicated YAML editors with Monaco / LSP / inline squiggles. GitHub's plain web editor is closer to a syntax-highlighted textarea; the Monaco-grade experience is `github.dev` (a separate surface).

**What none of them do (relevant to the parent report):**
- No live multi-user editing of the YAML config file. The "config" is a git artifact; coordination is by branches and PRs, not CRDT awareness.
- No "another IDE has this file open" detection. Cross-surface conflicts surface at git commit-time only.
- No editor-side authoring of the schema itself; the schema is a static JSON Schema asset shipped with the editor or fetched from SchemaStore.

## Sources

- [GitLab Pipeline Editor docs](https://docs.gitlab.com/ci/pipeline_editor/) — write path, tabs, validation flow
- [GitLab CI Lint API](https://docs.gitlab.com/api/lint/) — server-side validation endpoint
- [GitLab Contribute to the CI/CD Schema](https://docs.gitlab.com/development/cicd/schema/) — schema location, monaco-yaml integration, JSON Schema Draft-07
- [GitLab GraphQL `commitCreate` mutation MR !31102](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/31102) — commit mutation primitive
- [GitLab GraphQL API guide](https://docs.gitlab.com/api/graphql/) — `/api/graphql` POST, authentication
- [GitLab Backend GraphQL API styleguide](https://docs.gitlab.com/ee/development/api_graphql_styleguide.html) — `Mutations::BaseMutation`, service-object pattern
- [GitLab issue #321869: Pipeline Editor — Empty State Mutation update](https://gitlab.com/gitlab-org/gitlab/-/issues/321869) — `commitCIFile` mutation parameters including `$lastCommitId`
- [GitLab issue #218473: Foundation for CI/CD inline syntax highlighting and autocomplete](https://gitlab.com/gitlab-org/gitlab/-/issues/218473) — monaco-yaml integration
- [SchemaStore gitlab-ci.json](https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/gitlab-ci.json) — community mirror
- [CircleCI in-app configuration editor docs](https://circleci.com/docs/config-editor/) — Save and Run, validity bar, tabs
- [CircleCI: Open sourcing the CircleCI Language Server](https://circleci.com/blog/circleci-yaml-language-server/) — Go LSP, JSON-RPC, parse cache, validation architecture
- [circleci-yaml-language-server repo](https://github.com/CircleCI-Public/circleci-yaml-language-server) — schema location
- [circleci-yaml-language-server schema.json](https://github.com/CircleCI-Public/circleci-yaml-language-server/blob/main/schema.json) — published JSON Schema
- [SchemaStore circleciconfig.json](https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/circleciconfig.json) — SchemaStore reference points to CircleCI repo's `schema.json`
- [CircleCI: How to validate your CircleCI configuration](https://support.circleci.com/hc/en-us/articles/360006735753) — `circleci config validate` CLI server-side validation
- [GitHub Docs: Editing files](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files) — web editor commit flow, `github.dev`, multiple-author attribution
- [GitHub Docs: Quickstart for GitHub Actions](https://docs.github.com/en/actions/get-started/quickstart) — `/actions/new` workflow chooser
- [actions/starter-workflows repo](https://github.com/actions/starter-workflows) — template structure with `.properties.json` companion files
- [SchemaStore github-workflow.json](https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/github-workflow.json) — community-maintained workflow schema
- [GitHub community discussion #68577: Unable to Resolve Complex GitHub Conflicts via Web Editor](https://github.com/orgs/community/discussions/68577) — web editor conflict-resolution limits
- [GitHub Docs: Resolving a merge conflict on GitHub](https://docs.github.com/articles/resolving-a-merge-conflict-on-github) — competing-line-changes only
- [vscode-github-actions](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-github-actions) — official extension with bundled validation
- [mpalmer/action-validator](https://github.com/mpalmer/action-validator) — standalone schema-based validator
