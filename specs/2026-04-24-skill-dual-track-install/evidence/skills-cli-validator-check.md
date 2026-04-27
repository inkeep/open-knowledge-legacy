---
oq_refs: [OQ1]
decisions: [D3]
sources: [npm skills@~1.5.0]
captured: 2026-04-24
---

# Evidence: `skills` CLI has no `validate` subcommand

**Captured:** 2026-04-24
**Command run:** `npx -y skills@~1.5.0 --help`

## Finding

`skills@~1.5.0` exposes these subcommands: `add`, `remove`, `list`/`ls`, `find`, `update`/`upgrade`, `experimental_install`, `init`, `experimental_sync`. **No `validate` subcommand.**

## Implication for D3 (CI validator)

- **Option A (REJECTED):** `skills validate <path>` — doesn't exist.
- **Option B (VIABLE):** Port structural checks from Anthropic's `quick_validate.py` (upstream at `anthropics/skills/skills/skill-creator/scripts/quick_validate.py`) into a small Bun script. Checks: wrapper folder at root, SKILL.md present at wrapper-folder root, frontmatter has `name` + `description`, frontmatter keys in 6-field allowlist (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`), `name` matches wrapper folder name, `name` lowercase kebab-case ≤64 chars, `description` ≤1024 chars with no `<`/`>`, `compatibility` ≤500 chars.
- **Option C (VIABLE, simpler):** Inline bash check in the CI step — `unzip -l` + `grep` assertions. Less thorough but zero code to maintain.

## Recommendation

Option B — small Bun script at `scripts/build-skill-zip.ts` that does both build + validate in one pass. Reuses Bun runtime already in CI; typechecks; easier to extend if Anthropic clarifies the spec.

## `skills init` subcommand (adjacent)

`skills init [name]` creates a new `<name>/SKILL.md` stub. Not relevant for our ZIP-build case — we already have the SKILL.md authored at `packages/server/assets/skills/open-knowledge/SKILL.md`.
