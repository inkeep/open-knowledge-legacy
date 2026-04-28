---
sources:
  - https://www.mintlify.com/docs/installation
  - https://www.fumadocs.dev/docs/cli
  - https://docs.astro.build/en/reference/cli-reference/
  - https://docs.renovatebot.com/config-validation/
  - https://github.com/rhysd/actionlint
date: 2026-04-25
purpose: Inform OK's `ok config validate` namespace + error-shape decisions; verify we don't paint into a corner if future validators (link-validate, frontmatter-validate) are added.
---

# Evidence: Validation CLI patterns in 3P doc-platform tools

## Tool inventory

### Mintlify CLI (`mint`)
Per-domain commands, no umbrella:
- `mint validate` — strict-mode build validation; designed for CI
- `mint broken-links` — internal link + anchor validation; `--check-anchors` flag; honors `.mintignore`
- `mint openapi-check <path-or-url>` — OpenAPI spec validity

Output: human-readable text; no documented `--json` mode. Exit-code based for CI gating. No plugin/extension pattern.

### Fumadocs CLI (`@fumadocs/cli`)
**No validation surface at all.** Commands are: `init`, `add`, `customize`, `tree`. Validation lives at build-time in `fumadocs-mdx` via Standard-Schema-compatible `schema` option on `defineCollections`. Errors surface as build/type errors, not structured CLI output.

### Astro CLI
- `astro check` — TypeScript + .astro diagnostics; exits 1 on error
- `astro sync` — generates types for content collections (Zod-validated frontmatter)
- `--minimumFailingSeverity` flag controls severity floor

Single per-domain check command + a sync command. No umbrella.

### Docusaurus
**No CLI validation command.** Broken-link detection runs only as part of `docusaurus build` (configured via `onBrokenLinks: 'ignore' | 'warn' | 'error' | 'throw'`). Long-running feature request for standalone CLI validator exists.

### Adjacent: Renovate, actionlint
- `renovate-config-validator` — separate binary, single concern; positional file arg; `--strict`, `--no-global` flags
- `actionlint` — single binary; `-format '{{json .}}'` (Go template) for JSON output; pluggability via editor integrations, not CLI

## Patterns observed

| Pattern | Strength | Tools |
|---|---|---|
| Per-domain commands (separate top-level commands per validator domain) | DOMINANT | Mintlify, Astro, Renovate, actionlint |
| Umbrella `<tool> validate <kind>` subcommand structure | NOT FOUND | None of the surveyed tools |
| Build-time validation only (no CLI surface) | ALTERNATIVE | Fumadocs, Docusaurus |
| Plugin/extension framework for validators | NOT FOUND | None |
| JSON output mode | RARE | Only actionlint (via Go-template `-format`) |
| Severity-floor flag for CI tuning | EMERGING | Astro `--minimumFailingSeverity`, Mintlify strict-mode |
| ESLint-style line/column errors | DOMINANT FOR CODE | actionlint, `astro check` |
| Path-based errors (Zod/Renovate shape) | DOMINANT FOR CONFIG | Renovate, JSON Schema validators |
| Watch/live re-validation at CLI layer | ABSENT | Editor integration is the substitute |

## Doc-platform validation scope (what gets validated in the cohort)

Commonly validated across the surveyed tools:
- Internal link integrity (cross-references between docs) — Mintlify, Docusaurus
- Anchor-vs-heading-slug — Mintlify (`--check-anchors`)
- Frontmatter schema conformance — Astro, Fumadocs (build-time)
- OpenAPI validity — Mintlify

NOT commonly validated:
- External link liveness (HTTP HEAD checks) — none of the surveyed tools
- Image reference validity — none
- Code-block language tag correctness — none

## Implications for OK's spec

1. **Per-domain commands is the safe namespace.** `ok config validate` doesn't paint us into a corner. Future siblings would be peer top-level commands (`ok validate-links`, `ok lint`, `ok validate-frontmatter`), not subcommands of a `validate` umbrella. None of the surveyed tools used the umbrella pattern, so we'd be inventing it.
2. **No "checks framework" precedent.** Fancy plugin architectures don't appear in this cohort. Tools either ship a fixed set of validators (Mintlify) or push extensibility to the editor layer (actionlint via LSP).
3. **Error shape is naturally Zod-style.** Path-based `{path: (string|number)[], message, code}` is the dominant config-validator shape (Renovate, JSON Schema, Zod). Reusable across future validators.
4. **`ok start` already does build-time validation.** The CLI command would be the fast-feedback companion (matches Mintlify's `mint validate` + standalone domain commands; matches Astro's `astro check`).
5. **`--json` is a nice-to-have, not table stakes.** Only actionlint surfaces it. Add when CI consumers ask for it; not required for v0.

## Sources

- [Mintlify CLI installation](https://www.mintlify.com/docs/installation)
- [mintlify npm](https://www.npmjs.com/package/mintlify)
- [Fumadocs CLI user guide](https://www.fumadocs.dev/docs/cli)
- [fumadocs-mdx (frontmatter schema)](https://www.fumadocs.dev/docs/mdx)
- [Astro CLI reference](https://docs.astro.build/en/reference/cli-reference/)
- [@astrojs/check](https://www.npmjs.com/package/@astrojs/check)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Docusaurus broken-links source](https://github.com/facebook/docusaurus/blob/main/packages/docusaurus/src/server/brokenLinks.ts)
- [Renovate config validation](https://docs.renovatebot.com/config-validation/)
- [renovate-config-validator discussion](https://github.com/renovatebot/renovate/discussions/27202)
- [actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md)
