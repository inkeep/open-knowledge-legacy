---
date: 2026-04-30
sources:
  - packages/core/src/config/schema.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/seed/starter.ts
  - packages/cli/src/mcp/tools/exec.ts
  - packages/cli/src/mcp/tools/exec.test.ts
  - packages/cli/src/mcp/tools/read-document.ts
  - packages/cli/src/mcp/tools/search.ts
---

# Code investigation: insertion points for body templates

## Schema (where to add the new fields)

`packages/core/src/config/schema.ts` defines `FolderRuleSchema` as:

```ts
export const FolderRuleSchema = z.looseObject({
  match: z.string().min(1, "..."),
  frontmatter: FolderFrontmatterSchema,
});
```

`FolderFrontmatterSchema` is `z.looseObject({ title?, description?, tags? })`.

**Spec change:** extend `FolderRuleSchema` with two optional sibling fields:

```ts
export const FolderRuleSchema = z.looseObject({
  match: z.string().min(1, "..."),
  frontmatter: FolderFrontmatterSchema,
  body: z.string().optional()
    .register(fieldRegistry, { scope: 'either', agentSettable: true, defaultScope: 'workspace' }),
  bodyPath: z.string().optional()
    .register(fieldRegistry, { scope: 'either', agentSettable: true, defaultScope: 'workspace' }),
});
```

Per CLAUDE.md STOP rule: register `fieldRegistry` BEFORE `.optional()` — Zod v4 wrappers drop `_zod.parent`.

## Create-page handler (the materialization site)

`packages/server/src/api-extension.ts:~4080-4187` is the canonical create entry point.

Current state at line 4133:

```ts
const initialContent = '';
try {
  writeFileSync(fullPath, initialContent, { encoding: 'utf-8', flag: 'wx' });
} catch (err) { ... }
```

**Spec insertion point:** between agent identity extraction (line ~4102) and `writeFileSync` (line ~4135), resolve the matching folder rule and compute `initialContent` from its `body:`/`bodyPath:` after variable substitution.

Pseudocode:

```ts
const matchingRule = resolveFolderRuleForPath(filePath, config.folders); // last-match-wins
const templateContent = matchingRule
  ? await loadTemplateContent(matchingRule, contentDir) // body OR bodyPath
  : '';
const substitutionContext = buildSubstitutionContext({
  filePath,
  agentId: createPageAgentId,
  agentName: createPageAgentName,
  // ...
});
const initialContent = renderTemplate(templateContent, substitutionContext);
```

Materialization is purely additive — when no folder rule matches OR the matching rule has neither `body:` nor `bodyPath:`, `initialContent` stays `''` (current behavior preserved).

## MCP write_document interaction

The `write_document` MCP tool also creates files. To make the feature consistent across all create surfaces, the same materialization logic must run when:

- `write_document` is called with a target file that does NOT exist on disk
- AND the `body` argument is empty/whitespace

Need to confirm exact contract: does `write_document` accept frontmatter+body as separate fields, or one merged `markdown` string? Either way, "body is empty" should be defined as: after `stripFrontmatter()`, the body portion is whitespace-only.

## Existing virtual-overlay path (DO NOT BREAK)

The current `folders[].frontmatter` virtual overlay lives in three sites:

1. `packages/cli/src/mcp/tools/exec.ts:496` — `enrichDirectory` and `enrichFile` consume `config.folders`
2. `packages/cli/src/mcp/tools/read-document.ts:144` — `folderRules: config.folders` passed to enrichment
3. `packages/cli/src/mcp/tools/search.ts:150` — same pattern

These do NOT modify on-disk files. They merge folder-rule data into MCP response payloads.

**Spec implication:** body templates must NOT participate in the virtual-overlay path. They are write-time-only. The MCP enrichment layer should ignore `body:`/`bodyPath:` fields when building responses.

## Existing body-template precedent

`packages/server/src/seed/starter.ts:70-99` defines `LOG_MD_TEMPLATE` as a static markdown string written exactly once during `ok seed`. This is the existing prototype of "body content scaffolded into a file." The new feature generalizes this:

- `LOG_MD_TEMPLATE` → could be re-expressible as a `body:` value on a synthetic seed rule (or remain as a one-shot seed-only artifact).
- `STARTER_FOLDERS` (`external-sources/**`, `research/**`, `articles/**`) → could ship `body:` defaults via `starterFolderRule()`.

Whether the seed scaffolder upgrades to use the new body-template field is a follow-up question — NOT MVP scope. MVP just adds the schema field + materialization; seed integration is a separate small follow-on.

## Glob matching

`packages/server/src/content-filter.ts:13` uses `picomatch`:

```ts
const isIncluded = picomatch(includePatterns, { dot: true });
```

Body-template folder-rule resolution should use `picomatch` with the same options for consistency (last-match-wins among rules that match the target path).

## Field registry binding

`folders` is registered with:

```ts
.register(fieldRegistry, { scope: 'either', agentSettable: true, defaultScope: 'workspace' })
```

The new `body:` and `bodyPath:` fields inherit at the parent-array level but per CLAUDE.md STOP rule should ALSO `.register(fieldRegistry, ...)` BEFORE any `.optional()` if they want to surface in the Settings pane / agent-settable allowlist. Recommendation: register both at workspace+user scope, agent-settable.

## Existing tests to mirror

- `packages/cli/src/mcp/tools/exec.test.ts:350-369` — "cat merges file + folder frontmatter (QA-002)" — pattern for testing folder-rule resolution
- `packages/core/src/config/schema-jsonschema.test.ts:84-92` — schema test fixtures for `folders` array
- `packages/core/src/config/apply-folder-rules-upsert.test.ts` — folder-rule upsert tests
- `packages/server/src/api-create-page.test.ts` — create-page handler tests

New tests required:
1. Unit: variable substitution (`{{date}}`, `{{date:FORMAT}}`, `{{title}}`, `{{path}}`, `{{user}}`, undefined-variable warn-and-passthrough)
2. Unit: folder-rule resolution by path (last-match-wins, picomatch parity with existing rules)
3. Unit: schema validation accepts `body:` + `bodyPath:` as optional
4. Integration: `POST /api/create-page` with body-template-bearing folder rule materializes content to disk
5. Integration: `POST /api/create-page` with no matching rule preserves current empty-file behavior (regression guard)
6. Integration: `body:` + `bodyPath:` both set → `bodyPath:` wins
7. Integration: `bodyPath:` referencing a missing template file → graceful error
8. Integration: MCP `write_document` to non-existent file with empty body → template applies; with non-empty body → agent body wins
9. Coverage test: `body:` and `bodyPath:` registered in `fieldRegistry` (mirror existing field-registry coverage test)
10. Fidelity test: template with `---` frontmatter block in body merges correctly with `frontmatter:` field (file frontmatter wins per existing rules)
