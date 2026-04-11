# Evidence: js-yaml vs yaml Package Comparison

**Dimension:** YAML parser selection — which package to standardize on
**Date:** 2026-04-10
**Sources:** npmjs.com, GitHub repos (nodeca/js-yaml, eemeli/yaml), bundlephobia

---

## Package comparison

| Criteria | **js-yaml** | **yaml** |
|---|---|---|
| Weekly downloads | ~130M | ~90M |
| Bundle size (minified) | ~50 kB | ~80 kB |
| Dependencies | 0 | 0 |
| TypeScript support | Needs `@types/js-yaml` | Built-in types |
| YAML spec | **1.1 only** (no 1.2) | **1.1 + 1.2** (default 1.2) |
| API | `load()`, `dump()`, custom schemas | `parse()`, `stringify()`, Document API, CST parser, streaming via `parseAllDocuments` |
| Comment preservation | No | Yes (round-trip via Document API) |
| Last publish | 2023 (infrequent updates) | 2024-2025 (actively maintained) |
| Performance | Fast for simple docs | Slightly slower parse, richer AST |
| Maintainer | Vitaly Puzrin (nodeca) | Eemeli Aro (yaml.org recommended) |

---

## Findings

### Finding: `yaml` is the modern standard; `js-yaml` is the legacy incumbent
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/yaml, https://www.npmjs.com/package/js-yaml

`js-yaml` has higher download counts due to entrenchment in older toolchains (webpack, eslint plugins, etc.), not because it's technically superior. The `yaml` package is recommended by the yaml.org community and is the actively maintained option.

### Finding: `yaml` supports YAML 1.2; `js-yaml` is stuck on 1.1
**Confidence:** CONFIRMED
**Evidence:** js-yaml README explicitly states YAML 1.1 support only. yaml package supports both 1.1 and 1.2 with 1.2 as default.

YAML 1.2 is the current specification (published 2009, revised 2021). YAML 1.1 has known gotchas (e.g., `yes`/`no`/`on`/`off` parsed as booleans) that 1.2 fixes.

### Finding: `yaml` has built-in TypeScript types; `js-yaml` requires @types
**Confidence:** CONFIRMED
**Evidence:** yaml package ships its own `.d.ts` files. js-yaml requires installing `@types/js-yaml` separately.

This matters for a strict TypeScript monorepo with `verbatimModuleSyntax: true` — first-party types avoid version drift between the package and its type definitions.

### Finding: `yaml` supports comment round-tripping via Document API
**Confidence:** CONFIRMED
**Evidence:** https://eemeli.org/yaml/#documents — the Document API preserves comments, blank lines, and formatting through parse-edit-stringify cycles.

Relevant for the wiki config file (`config.yml`) which is heavily commented. If the config system ever needs to programmatically edit the config while preserving user comments, `yaml` supports this out of the box.

### Finding: Both packages have zero dependencies
**Confidence:** CONFIRMED
**Evidence:** npm dependency trees for both packages show zero production dependencies.

Neither introduces transitive dependency risk. The choice is purely about API quality, spec compliance, and maintenance.

---

## Decision

**Standardize on `yaml` (Eemeli Aro).** This package is already in the dependency tree via the config loader. All YAML parsing in the project (config files, frontmatter, catalog generation) should use this single dependency.

**Rationale:**
1. Built-in TypeScript types — no `@types` package needed
2. YAML 1.2 spec compliance — avoids 1.1 boolean gotchas
3. Actively maintained (2024-2025 releases)
4. Comment-preserving round-trip capability (future-proofs config editing)
5. Already in the dependency tree — zero incremental cost

**Implications:**
- Do not add `js-yaml` as a dependency (directly or transitively via `front-matter`/`gray-matter`)
- The hand-rolled `frontmatter.ts` utility uses `yaml.parse()` and `yaml.stringify()` directly
- If a future dependency pulls in `js-yaml`, evaluate whether it can be configured to use `yaml` instead (gray-matter supports pluggable engines)
