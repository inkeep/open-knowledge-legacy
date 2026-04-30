# Evidence: Open Knowledge Integration Surface for Body Templates

**Dimension:** What OK already has, where the new feature plugs in, what STOP rules and existing precedents must hold
**Date:** 2026-04-30
**Sources:** Open Knowledge codebase (`.open-knowledge/config.yml`, `packages/cli/src/config/schema.ts`, prior OK reports `config-driven-folder-frontmatter` and `config-edit-paths`), `CLAUDE.md` STOP rules

---

## Findings

### Finding: OK config.yml already has the exact `folders[]` structure to extend

**Confidence:** CONFIRMED (codebase inspection)
**Evidence:** `.open-knowledge/config.yml:38-99` — the live workspace config defines `folders:` as an array of `{ match: <glob>, frontmatter: {...} }` rules. Glob matching uses `picomatch`. Last-match-wins for scalars; tags concatenate; per-file frontmatter still wins.

```yaml
folders:
  - match: "specs/**"
    frontmatter:
      title: Specifications
      tags: [ spec ]
  - match: "specs/*/evidence/**"
    frontmatter:
      description: Spec-local evidence...
      tags: [ evidence ]
```

**Implications for spec:** Adding `bodyTemplate:` (or whatever the spec names it) as a sibling field per rule is structurally minimal. Schema lives at `packages/cli/src/config/schema.ts`. Config loader at `packages/cli/src/config/loader.ts` (deep merge user→workspace; arrays-replace). Both already documented in `reports/config-driven-folder-frontmatter/REPORT.md`.

### Finding: OK ALREADY runs frontmatter defaults at write time, not read time

**Confidence:** CONFIRMED (per `config-driven-folder-frontmatter` report)
**Evidence:** Prior research (`reports/config-driven-folder-frontmatter/REPORT.md`) describes the existing pipeline: per-folder frontmatter is *materialized into the file* at create/save time, not virtually overlaid at read time. This is the "compile to disk, file ownership preserved" path consistent with kepano's file-over-app stance.

**Implications for spec:** Body templates should follow the same model — apply at file-creation time, materialize to disk, then the user owns the file. This avoids two failure modes: (1) virtual templates that break "open with another editor" workflows, (2) re-application overhead on every read.

### Finding: STOP rule "no OK sidecars in user-content paths" applies hard

**Confidence:** CONFIRMED (CLAUDE.md STOP rules)
**Evidence:** `CLAUDE.md` STOP rule: "OK state lives in `<contentDir>/.open-knowledge/`; no per-doc sidecars (no `.frontmatter.yml`, `_meta.json`, `_index.md`). Folder defaults live in `config.yml`'s `folders[]`."

**Implications for spec:** Body template definitions live in `config.yml` (inline strings) OR as `.md` files inside the content dir that the user can edit naturally (workspace-local templates folder, e.g., `.open-knowledge/templates/daily.md`). Both paths respect the STOP rule. **Avoid:** any per-folder sidecar like `.template.md` at the user's content folder root.

### Finding: STOP rule "no `upload.*` config" precedent — keep config minimal

**Confidence:** CONFIRMED (CLAUDE.md STOP rules)
**Evidence:** CLAUDE.md: "No `upload.*` config + no runtime `.obsidian/app.json` reader. Values live as constants in `packages/core/src/constants/upload.ts`."

**Implications for spec:** This isn't a direct constraint on body templates but it IS a posture statement — OK has been deliberate about not adding config keys that bloat the surface. Body templates *do* deserve a config surface (different users want different templates) but the spec should justify the scope and not creep into adjacent features (filename pattern, recurring scheduling, multi-template chooser) in MVP.

### Finding: MCP create_page is the agent-write entry point

**Confidence:** CONFIRMED (codebase + prior research)
**Evidence:** OK ships `POST /api/create-page` and the MCP `write_document` / `create_page` tools as the canonical creation path. Prior research `reports/preview-nav-agent-contract/` covers the agent contract.

**Implications for spec:**
- Body templates must apply uniformly across all creation surfaces: editor "new file" UI, MCP `create_page`, MCP `write_document` (when target file doesn't exist), CLI verbs.
- The natural integration point is **inside** the create-page handler, after path normalization, before the first CRDT write. The handler resolves the matching folder rule, expands variable substitution against creation context (date, user, prompted args), and seeds the file with the resulting markdown.
- For MCP `write_document` calls that **already include a body**, the agent-supplied body wins — body template applies only when creating an empty file.

### Finding: OK already has a YAML round-trip pipeline used by config edits

**Confidence:** CONFIRMED via `reports/config-edit-paths/REPORT.md`
**Evidence:** Prior research on YAML config CRUD using yaml@2 (eemeli/yaml) — the `config-edit-paths` report covers the round-trip stack OK uses for config edits with comment preservation.

**Implications for spec:** When the editor offers a "set body template for this folder" UI, the write path goes through the existing config-edit pipeline. No new YAML-edit infrastructure needed.

### Finding: Substitution-context for body templates needs to know "who and when"

**Confidence:** INFERRED (design implication)
**Evidence:** Combining the Hugo/Obsidian variable inventories with OK's existing principal-identity-in-presence + agent-attribution work (precedent #25):
- OK already tracks the writer identity at create time (writer-ID taxonomy: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`).
- OK already tracks creation timestamp via persistence layer.
- OK does NOT have a built-in "prompt the user at creation time" UX.

**Implications for spec MVP variable surface:**
- `{{date}}` / `{{date:FORMAT}}` — universal, derived from creation timestamp
- `{{title}}` — derived from filename (without extension), per Templater convention
- `{{author}}` or `{{user}}` — derived from principal identity (if `principal-<UUID>`); falls back to "agent" or empty for non-principal writers
- `{{path}}` / `{{folder}}` — derived from creation path (useful for "this is in the X subtree" context)
- **Defer**: `{{prompt:...}}` interactive prompts (need editor modal); `{{exec:...}}` arbitrary expressions (Templater JS analog — explicit non-goal); recurring scheduling.

---

## Existing precedents the spec must respect

| Precedent / STOP rule | Source | How it constrains body templates |
|---|---|---|
| No OK sidecars in user-content paths | CLAUDE.md STOP | Templates inline in config.yml or in `.open-knowledge/templates/` only |
| Config in folders[] glob array | `.open-knowledge/config.yml`, `config-driven-folder-frontmatter` report | Reuse the existing array; sibling `bodyTemplate:` field |
| Last-match-wins precedence (scalars) | Existing folder rules | Same rule for body templates |
| MCP write paths are canonical | `preview-nav-agent-contract` report, precedent #25 | Body template applies inside create-page handler |
| File-over-app: materialize to disk | kepano-aligned, prior research | Apply at creation time, not at read time |
| Agent attribution by writer-ID taxonomy | precedent #25 | `{{user}}` resolves via principal identity |
| YAML round-trip with comments preserved | `config-edit-paths` report | Editor "set template" UI uses existing pipeline |

---

## Gaps / follow-ups

- The spec needs to decide: **inline string template vs file-reference template**. Inline (`bodyTemplate: "# {{date}}\n\n## Today\n"`) is config-self-contained but YAML multiline is awkward for non-trivial bodies. File-ref (`bodyTemplatePath: ".open-knowledge/templates/daily.md"`) is OK-native and lets templates be edited in OK itself. **Recommendation: support both, file-ref wins when set; inline as ergonomic fallback.**
- The spec needs to decide: when an MCP `write_document` writes to a path that doesn't yet exist AND the body provided is empty/whitespace, does the template apply? **Recommendation: yes** — keeps the model simple ("template applies when creating a file with no body"). When body is non-empty, agent's content wins.
- The spec needs to decide: per-user vs per-workspace templates. The existing config precedence (user→workspace) handles this for free; body templates inherit the same precedence as `frontmatter:`.
