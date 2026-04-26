# Evidence: D5 — File-like editor UX + D6 — Convergence architecture

**Dimensions:** D5 (file-like editor UX) + D6 (convergence architecture)
**Date:** 2026-04-25
**Sources:** monaco-yaml repo + docs, codemirror/lang-yaml, codemirror-json-schema (jsonnext), @codemirror/lsp-client, VS Code source (configurationEditingService.ts + File Watcher wiki), JetBrains Plugin SDK, Storybook docs, GitLab + CircleCI editor docs

---

## Key files / pages referenced

- [monaco-yaml repo](https://github.com/remcohaszing/monaco-yaml)
- [monaco-yaml releases](https://github.com/remcohaszing/monaco-yaml/releases) — v4.0.0-alpha.1 (Feb 2025)
- [monaco-yaml.js.org docs site](https://monaco-yaml.js.org/)
- [monaco-yaml issue #20 — Webpack plugin usage](https://github.com/remcohaszing/monaco-yaml/issues/20)
- [monaco-editor-webpack-plugin issue #40 — bundle size](https://github.com/microsoft/monaco-editor-webpack-plugin/issues/40)
- [codemirror/lang-yaml](https://github.com/codemirror/lang-yaml) — Lezer YAML grammar
- [jsonnext/codemirror-json-schema](https://github.com/jsonnext/codemirror-json-schema) — JSON-Schema linter/completion for CM6
- [codemirror-json-schema feature pages (DeepWiki)](https://deepwiki.com/langchain-ai/codemirror-json-schema/2-features-and-capabilities)
- [@codemirror/lsp-client](https://github.com/codemirror/lsp-client) — official LSP bridge
- [VS Code configurationEditingService.ts](https://github.com/microsoft/vscode/blob/4ed0329e9c5e12e2c7c59697facc96020b0768ab/src/vs/workbench/services/configuration/common/configurationEditingService.ts)
- [VS Code File Watcher Internals wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)
- [JetBrains Settings Guide (Plugin SDK)](https://plugins.jetbrains.com/docs/intellij/settings-guide.html)
- [Storybook main-config docs](https://storybook.js.org/docs/api/main-config/main-config)
- [Storybook discussion #15873 — watch reload](https://github.com/storybookjs/storybook/discussions/15873)
- [GitLab Pipeline Editor docs](https://docs.gitlab.com/ci/pipeline_editor/)
- [CircleCI in-app config editor](https://circleci.com/docs/config-editor)

---

## D5 Findings

### Finding: monaco-yaml provides JSON-Schema-driven autocomplete, validation, hover, folding, anchor links — but requires bundler-side worker wiring

**Confidence:** CONFIRMED
**Evidence:** [monaco-yaml repo](https://github.com/remcohaszing/monaco-yaml), [monaco-yaml.js.org](https://monaco-yaml.js.org/)

monaco-yaml wraps the Red Hat `yaml-language-server` for Monaco — feature parity is high (the package "uses dependencies from yaml-language-server"). It surfaces:
- Schema-based autocompletion
- Schema-based validation (error squiggles)
- Hover tips driven by JSON Schema descriptions
- Code folding
- Links from JSON `$ref`
- Hover/links from YAML anchors

Schema supply mechanisms (two paths):
1. **Programmatic** via `configureMonacoYaml({ schemas: [{ uri, fileMatch, schema }] })` — schema can be inline JSON object or URL fetched at runtime
2. **Inline modeline** `# yaml-language-server: $schema=https://…` (inherited from embedded yaml-language-server, [PR #970](https://github.com/redhat-developer/yaml-language-server/pull/970))

**Bundle/integration cost:** Worker-based; requires bundler wiring (Webpack 5: `import YamlWorker from './yaml.worker.js?worker'` + `MonacoEnvironment.getWorker`). Monaco editor base alone is ~4 MB. Community reports of monaco-yaml "bundle size has quintupled" after the v4 alpha that switched parser to `yaml`. **No UMD build** — cannot use without a bundler.

**Maintenance:** ~307–314 GitHub stars; v4.0.0-alpha.1 published 2025-02-15, replacing `js-yaml` + `yaml-language-server-parser` deps with `yaml`. Active commits in 2025.

---

### Finding: CodeMirror 6 has no off-the-shelf YAML+JSON Schema integration; three separate paths exist

**Confidence:** CONFIRMED
**Evidence:** [codemirror/lang-yaml](https://github.com/codemirror/lang-yaml), [jsonnext/codemirror-json-schema](https://github.com/jsonnext/codemirror-json-schema), [@codemirror/lsp-client](https://github.com/codemirror/lsp-client)

**Path 1 — `@codemirror/lang-yaml` alone:** Lezer-based YAML syntax/grammar. **No schema awareness, no validation, no hover/completion driven by schema.** Last published 6.1.3 (~early April 2026); MIT; codemirror org-maintained.

**Path 2 — `codemirror-json-schema` (jsonnext):** Provides JSON-Schema-driven validation (`yamlSchemaLinter()`), autocomplete (`yamlCompletion()`), hover info, dynamic schema updates, markdown rendering of schema descriptions — built on top of `@codemirror/lang-yaml`. Requires explicit wiring of `@codemirror/lang-json`, `@codemirror/lint`, `@codemirror/view`, `@codemirror/state`, `@lezer/common` peers. **Smaller than monaco-yaml; in-process (no worker).**

**Path 3 — LSP bridge:** Wire the Red Hat `yaml-language-server` itself behind CodeMirror via `@codemirror/lsp-client` (official, announced on the CodeMirror forum), `FurqanSoftware/codemirror-languageserver`, or `remcohaszing/codemirror-languageservice`. The bridge translates LSP `CompletionItem`, `Hover`, `Diagnostic`, and offset↔position between the two systems. Most code; closest behavior parity with VS Code.

**Modeline support:** [INFERRED] `codemirror-json-schema` documents schema-supplied-as-config but no primary-source evidence it parses `# yaml-language-server: $schema=…`. That capability lives inside the Red Hat language server, so it's only available through Path 3 (LSP).

---

### Finding: The same JSON Schema document drives both Monaco and CodeMirror paths

**Confidence:** CONFIRMED
**Evidence:** [yaml-language-server](https://github.com/redhat-developer/yaml-language-server), [codemirror-json-schema API](https://deepwiki.com/langchain-ai/codemirror-json-schema/4-api-reference)

Both monaco-yaml (via `schemas: [{ schema }]`) and `codemirror-json-schema` (via the linter/completion factory) consume JSON Schema verbatim. Schemastore.org acts as the de-facto registry consumed by both worlds.

**Implications:** Editor choice does not lock in the schema authoring path. The schema artifact is portable.

---

### Finding: Adjacent prior-art in-app YAML config editors all use JSON Schema as the substrate

**Confidence:** CONFIRMED
**Evidence:** [GitLab CI/CD Schema docs](https://docs.gitlab.com/development/cicd/schema/), [GitLab Pipeline Editor](https://docs.gitlab.com/ci/pipeline_editor/), [CircleCI config-editor](https://circleci.com/docs/config-editor)

- **GitLab Pipeline Editor:** JSON-Schema-backed editor; schema specs in `spec/frontend/editor/schema/ci`, definitions shared via `$ref`, positive/negative YAML test fixtures committed to the repo
- **CircleCI in-app config editor:** Autocomplete tooltips with linked docs + built-in linter that re-validates on every change
- **GitHub workflow web editor:** Validates against a JSON schema published on schemastore.org; third-party browser extensions (Chrome/Firefox YAML Validator) extend in-page validation

**Pattern:** Every in-app YAML config editor surveyed uses JSON Schema as the validation substrate. None ships a custom validator.

---

## D6 Findings

### Finding: VS Code's settings UI and settings.json share a single write API (`ConfigurationEditingService`)

**Confidence:** CONFIRMED
**Evidence:** [configurationEditingService.ts](https://github.com/microsoft/vscode/blob/4ed0329e9c5e12e2c7c59697facc96020b0768ab/src/vs/workbench/services/configuration/common/configurationEditingService.ts), [configuration.ts platform](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configuration.ts), [VS Code File Watcher Internals wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)

Both surfaces are views over the same `IConfigurationService` / `ConfigurationEditingService`. The `doWriteConfiguration` method validates dirty-file state, resolves the model reference, and writes either via the user-configuration file service (for the settings resource) or by directly updating the configuration model.

**The Settings UI calls the same `writeConfiguration` primitive the JSON editor flush hits — there are not two write paths.**

File watcher is hosted in a separate `UtilityProcess` (Parcel watcher for recursive, NodeJS watcher for non-recursive) and feeds change events back into the configuration service.

**Implications:** The "shared write primitive" is the mechanical center of the dual-surface (graphical + raw) pattern. Without it, the two surfaces inevitably drift.

---

### Finding: JetBrains uses `PersistentStateComponent` as the equivalent shared write primitive

**Confidence:** CONFIRMED
**Evidence:** [JetBrains Project settings docs](https://www.jetbrains.com/help/idea/configure-project-settings.html), [Settings Guide (Plugin SDK)](https://plugins.jetbrains.com/docs/intellij/settings-guide.html)

Project settings are XML files under `.idea/`; application settings are XML under `~/.config/JetBrains/<IDE>/options/`. The Settings dialog UI binds to the IntelliJ Platform Persistence Model (`PersistentStateComponent`) — the dialog is one consumer of the same persistent state object that on-disk reload also feeds.

**Sync model:** cloud-attached JetBrains Account ("Settings Sync" plugin since 2022.3) or git-backed "Settings Repository".

**Implications:** Same architectural shape as VS Code — single state-write primitive, multiple consumers.

---

### Finding: Storybook `main.ts` is read-only relative to the GUI; no write-back path

**Confidence:** CONFIRMED
**Evidence:** [Storybook main-config docs](https://storybook.js.org/docs/api/main-config/main-config), [discussion #15873](https://github.com/storybookjs/storybook/discussions/15873)

Storybook's GUI is read-only relative to `main.ts`. The config file is a TS/JS module loaded at server boot; the running Storybook server reads it once and exposes the resolved config to the manager UI. **No GUI "edit `main.ts`" surface — addons display the loaded config but do not write it back.**

Watch-mode reload of `main.ts` is a long-standing feature request (#15873) rather than a built-in. Some addon configs (test/coverage/a11y) are server-controlled at runtime separately.

**Implications:** "Read-only GUI over a config file" is the simpler precedent when bidirectional editing isn't required — file watch + reload, no write API.

---

### Finding: The dual-surface pattern is named "single source of truth" + a dedicated config-edit service

**Confidence:** INFERRED
**Evidence:** [Single source of truth — Wikipedia](https://en.wikipedia.org/wiki/Single_source_of_truth), [VS Code File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)

The "single write primitive shared by N surfaces" pattern is most commonly framed as "single source of truth" + a dedicated config-edit service (VS Code's `ConfigurationEditingService`, JetBrains's `PersistentStateComponent`). One emerging framing in the AI-agent CLI design space is the "Discovery Document" pattern — one canonical schema/manifest feeds CLI, MCP, and other adapters.

Standard reactive-update path:
```
write primitive → file system → file watcher event
  → IConfigurationService.onDidChangeConfiguration (or equivalent)
  → UI re-render
```

**Implications:** The pattern is well-understood in 1P-IDE territory (VS Code, JetBrains) but doesn't have a sticky name in dev-tool literature.

---

### Finding: HTTP-layer placement varies; (a) HTTP endpoint and (c) direct filesystem are the two dominant patterns

**Confidence:** INFERRED — sparse primary sources for (b) and (d)
**Evidence:** [CircleCI config-editor](https://circleci.com/docs/config-editor), [GitLab Pipeline Editor](https://docs.gitlab.com/ci/pipeline_editor/), [VS Code configuration.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configuration.ts)

| Placement | Precedent | Notes |
|---|---|---|
| **(a) HTTP endpoint on dev server** | GitLab Pipeline Editor, CircleCI in-app config editor | Editor SPA round-trips POST to backend lint/save endpoints |
| **(b) WebSocket** | Used for live-validation streaming in CircleCI-class editors | Not the primary write surface in any source surveyed |
| **(c) Direct filesystem (Electron only)** | VS Code | Writes through `IFileService` directly without HTTP hop |
| **(d) MCP-tool indirection** | Not surfaced — appears to be novel placement | UNCERTAIN |

**Implications:** For a multi-CRUD-path system where one of the paths is MCP, "MCP tool indirection" would be greenfield. Most dev-tools choose between (a) and (c) based on whether the host is browser-only or Electron.

---

## Cross-cutting observations

- **Two editor worlds share a JSON Schema substrate.** Whether you ship Monaco or CodeMirror, the schema document is the same; only the editor-side bridge changes. Monaco-yaml is heavier (worker, ~4MB Monaco base) but more featureful out of the box; codemirror-json-schema is lighter and in-process but feature-narrower (no LSP-grade hover/format).
- **The modeline `# yaml-language-server: $schema=…`** is portable across VS Code, monaco-yaml, and Zed. JetBrains uses a different syntax (`# $schema=…`). Pure CM6 (`codemirror-json-schema`) does not appear to honor the modeline.
- **Convergence in dev-tools is implemented as one configuration-write service consumed by N surfaces**, not as N independent writers reconciling. VS Code's `ConfigurationEditingService` and JetBrains's `PersistentStateComponent` are the canonical implementations; both file-watch their own writes via dedup logic.
- **Read-only GUI over a config file** (Storybook) is the simpler precedent when bidirectional editing isn't required — file watch + reload, no write API.
- **"MCP tool indirection" as the write path** has no surveyed precedent. It's plausible — funnel all writes through the MCP-tool surface, then file-system → watcher → UI re-render — but no dev-tool has shipped this shape that surfaced in research.

---

## Negative searches

- **Searched:** "MCP tool as write surface for in-app settings UI"; sources: github MCP servers, blogs → result: no precedent
- **Searched:** "monaco-yaml CodeMirror migration adoption stats"; sources: state-of-js, npm-trends → result: no usage comparison data
- **Searched:** "CodeMirror 6 LSP YAML production app"; sources: github, blog posts → result: a few demo apps, no major in-production examples surfaced

---

## Gaps / follow-ups

- Empirical bundle-size measurement for monaco-yaml v4 alpha vs codemirror-json-schema in a typical webpack/vite build
- Whether `codemirror-json-schema` parses the `# yaml-language-server: $schema=…` modeline — would require source inspection or maintainer query
- Whether VS Code's `ConfigurationEditingService` shape would inform an OK equivalent's API surface specifically
