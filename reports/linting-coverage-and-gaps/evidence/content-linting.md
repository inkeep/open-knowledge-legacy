# Evidence: Content / Wiki Linting

**Dimension:** Markdown content lint, frontmatter validation, prose quality
**Date:** 2026-04-27
**Sources:** root config files, `biome.jsonc`, `package.json`, all `.github/workflows/`, `.open-knowledge/config.yml`, OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`)

---

## Key files referenced

- `biome.jsonc` — Biome config (excludes wiki dirs)
- `package.json` lint-staged block
- `.open-knowledge/config.yml` — folder frontmatter defaults
- `packages/server/assets/skills/open-knowledge/SKILL.md` — agent-discipline rules (the *de facto* "content lint" prescription)

---

## Findings

### Finding: No markdown linter is configured anywhere in the repo
**Confidence:** CONFIRMED
**Evidence:** Negative search across config files

```text
$ grep -rilE "markdownlint|remark-lint|vale|cspell|alex|write-good" \
    . --include="*.json" --include="*.yml" --include="*.yaml" --include="*.toml"
specs/2026-04-13-mdx-tolerant-parsing/evidence/crash-class-probe-raw.json
# (only hit is a fixture file containing the string, not a config)
```

No `.markdownlint.json`, `.remarkrc`, `vale.ini`, `.cspell.json`, or equivalent exists. No CI step shells out to any markdown-lint tool.

**Implications:** Markdown style consistency (heading levels, list markers, line length, trailing whitespace, etc.), prose quality, spell-check, inclusive language — none of these are checked. Wiki content that is malformed, contains typos, or violates internal style is not flagged by any automated process.

### Finding: Wiki content directories are explicitly excluded from Biome
**Confidence:** CONFIRMED
**Evidence:** `biome.jsonc:38-58` (see also `code-linting.md`)

```text
"!specs", "!reports", "!evidence", "!meta",
```

`specs/`, `reports/`, `evidence/`, `meta/` — the four directories where most wiki content lives — are blacklisted.

**Implications:** Even if Biome had markdown rules, they would not apply to the bulk of wiki content. The exclusion is intentional but means there is no fallback content gate.

### Finding: Lint-staged invokes Biome on `packages/**/*.md` and `docs/**/*.md` — but Biome 2 has no markdown lint rules
**Confidence:** CONFIRMED
**Evidence:** `package.json:38-48`

```text
"lint-staged": {
  "packages/**/*.{ts,tsx,js,jsx,json,md}": [
    "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true ..."
  ],
  ...
}
```

Note `--files-ignore-unknown=true`: Biome silently skips files it doesn't recognize. Markdown is in that "unknown" set in current Biome.

**Implications:** The `md` glob entries are aspirational — they will activate the moment Biome adds markdown linting, but today contribute zero validation. Pre-commit changes to markdown in `packages/` or `docs/` go through unchallenged.

### Finding: No frontmatter schema validator is wired in
**Confidence:** CONFIRMED
**Evidence:** `.open-knowledge/config.yml`, schema location

```yaml
folders:
  - match: "specs/**"
    frontmatter:
      title: Specifications
      description: Product + technical specs ...
      tags: [spec]
  - match: "reports/**"
    frontmatter:
      title: Research Reports
      ...
```

The OK config defines folder-level frontmatter *defaults* that merge at read time (per the OK skill, not as a validator). The schema reference in `config.yml` (line 14) points to `packages/cli/src/config/schema.ts`, but that schema validates `config.yml` itself — not per-document frontmatter.

**Implications:** Per-file frontmatter conformance to the OK skill's recommended fields (`title`, `description`, `tags`) is not checked. A doc missing `title` or with a typo'd field name will not be flagged at commit, push, or CI. Folder defaults silently fill in missing scalars at read time, masking the absence.

### Finding: No CI step audits markdown content
**Confidence:** CONFIRMED
**Evidence:** Inventory of `.github/workflows/`

```text
$ ls .github/workflows/
bundle-size.yml ci.yml claude-code-review.yml desktop-build.yml
desktop-release.yml nightly-e2e-stability.yml nightly.yml release.yml
stale.yml weekly.yml

# Workflows that grep mention "markdown|.md|docs|content":
# - ci.yml (only via the `docs` workspace build, not a content lint)
# - claude-code-review.yml (the AI review bot — opinion, not deterministic)
# - desktop-build.yml, desktop-release.yml (release notes)
# - nightly-e2e-stability.yml, weekly.yml, release.yml (incidental)
```

No workflow runs `get_dead_links`, `get_orphans`, or any markdown-specific check.

**Implications:** Content quality issues — dead links, orphans, frontmatter drift, missing sources — never block a PR. The Claude PR-review bot (`claude-code-review.yml`) may surface them as opinion, but it is not deterministic and is not gating.

### Finding: `claude-code-review.yml` is an AI review bot, not a deterministic linter
**Confidence:** CONFIRMED
**Evidence:** `.github/workflows/claude-code-review.yml:1-40`

```text
name: Claude PR Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]
```

Triggered on every PR + on `@claude --review` comments from owners/members/collaborators. Produces opinion-shaped review output.

**Implications:** Useful as an extra eye, but its output is not a binary pass/fail and varies turn-to-turn. Cannot substitute for a deterministic content-lint gate.

### Finding: `stale.yml` operates on PRs, not on wiki content
**Confidence:** CONFIRMED
**Evidence:** `.github/workflows/stale.yml:1-50`

```text
days-before-pr-stale: 7
days-before-pr-close: 7
days-before-issue-stale: -1   # disabled
days-before-issue-close: -1   # disabled
```

The only "staleness" automation in the repo is for PRs that haven't moved in 7 days. There is no doc-staleness equivalent.

**Implications:** "Stale wiki data" — docs that haven't been touched in N months, specs whose implementation has shipped but whose status field still says "in progress," reports with sources that have rotted — are not detected by anything.

### Finding: Content discipline is delegated entirely to the OK agent skill
**Confidence:** CONFIRMED
**Evidence:** `packages/server/assets/skills/open-knowledge/SKILL.md:63-90`

```text
## Grounding — every factual claim needs a source (MUST)
- Every factual claim MUST cite its source at the point of claim.
- Web sources for knowledge-base docs → fetch the page, then `ingest`,
  then cite the local path.
...
## Linking — use standard markdown links
- Verify before walking away. After writing a doc, call
  `get_dead_links({ sourceDocNames: ['your/doc'] })` to find broken
  references. Fix each redlink or explicitly accept it.
```

The skill prescribes (a) sourced claims, (b) post-write `get_dead_links` invocation, (c) alt-text rules, (d) hub maintenance, (e) markdown-link-only convention, (f) `log.md` discipline.

**Implications:** Content quality is enforced by *agent self-discipline* every turn — there is no machine check that confirms the agent actually called `get_dead_links` after writing, ingested its sources, or wrote meaningful alt text. Skipped checks accumulate silently. Humans editing markdown directly are not subject to the skill's rules at all.

### Finding: The editor's red-underline dead-link visual is permissive; the MCP tool is the strict source of truth
**Confidence:** CONFIRMED
**Evidence:** `SKILL.md:87`

```text
The editor's red-underline visual lies. Its dead-link detection
tolerates slug-fallback (e.g., `foo` may appear resolved because
`foo.md` exists at root). `get_dead_links` is strict-exact —
trust the tool, not the visual.
```

**Implications:** Even the human-visible content-quality signal (red underline in the live editor) silently understates the problem. The accurate signal is only available via an MCP tool call.

---

## Negative searches

- `find . -maxdepth 3 -name "knip.json*" -o -name ".markdownlint*" -o -name ".remarkrc*" -o -name "vale.ini" -o -name ".cspell*"` → no results outside `node_modules`.
- `grep -rE "markdownlint|remark-lint|vale|cspell" package.json packages/*/package.json docs/package.json` → no results.
- `grep -rE "lint:content|lint:docs|lint:md|check:links|check:docs" package.json turbo.json` → no results.
- `grep -E "(get_dead_links|get_orphans|consolidate)" .github/workflows/*.yml` → no results. The MCP tools are not called from CI.

---

## Gaps / follow-ups

- The OK skill's `consolidate` and `research` workflow tools enforce *creation-time* shape (status frontmatter, supersedes chains, sources list) but do not periodically re-validate existing docs. A doc consolidated 6 months ago that has since been superseded does not get flagged.
- `log.md` discipline (skill §Log discipline) detects KB *changes per turn* — useful for audit, not for staleness.
