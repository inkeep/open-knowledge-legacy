---
title: "Linting Coverage and Gaps in the Open Knowledge Workflow"
description: "Factual inventory of what linting (code + content) is built into this repo, what each layer actually catches, where it runs (pre-commit / pre-push / CI), and what categories of content quality — staleness, frontmatter drift, hub-rot, closed-loop grounding — are not detected by anything today. Distinguishes detection capability from enforcement."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Biome
  - knip
  - husky
  - lint-staged
  - GitHub Actions
  - Open Knowledge MCP
topics:
  - code linting
  - markdown content quality
  - frontmatter validation
  - link integrity
  - graph health
  - staleness detection
  - enforcement surfaces
  - CI gating
---

# Linting Coverage and Gaps in the Open Knowledge Workflow

**Purpose:** Map what linting the repo actually has, distinguish *detection capability* from *enforcement*, and call out which content-quality concerns (staleness, frontmatter drift, hub-rot, grounding) have no automation behind them today.

---

## Executive Summary

The repo has **strong code-side linting** and **almost no content-side linting**. The asymmetry is deliberate-by-omission: every directory where wiki content lives — `specs/`, `reports/`, `evidence/`, `meta/` — is explicitly excluded from Biome, and no other content linter (markdownlint, remark-lint, Vale, cspell, etc.) is configured anywhere. Markdown content quality is delegated entirely to *agent discipline* via the Open Knowledge skill — there is no machine-checked gate.

A capability for graph-health audits (`get_dead_links`, `get_orphans`, `get_hubs`) exists as MCP tools that agents and humans can invoke on demand, but **no CI workflow runs them on any cadence**. The user's awareness of "broken links" is accurate — that's the one detection capability that is wired up and prescribed by the OK skill — but even it is not enforced; it depends on the agent remembering to call `get_dead_links` after each write.

**Stale data, frontmatter drift, hub freshness, closed-loop grounding violations, doc-age decay, external-URL rot, prose quality, and markdown style consistency** are detected by *nothing*. Several of them have no detection capability at all (not "capability exists but isn't gated" — actually no implementation).

The only "staleness" automation in the repo is `stale.yml`, which closes inactive *PRs* after 7 days; there is no doc-staleness analog.

**Key Findings:**
- **Code linting is comprehensive and PR-blocking** — Biome (lint+format), knip (dead exports/types/files/deps), TypeScript typecheck, THIRD_PARTY_NOTICES drift, AGENTS.md size cap, all enforced via husky pre-commit + pre-push + CI Tier 1.
- **Content linting is effectively zero** — wiki dirs are explicitly excluded from Biome; no markdown / prose / spell linter is configured; lint-staged's markdown globs are aspirational (Biome 2 has no `.md` rules).
- **Graph-health detection exists as MCP tools, not as CI gates** — `get_dead_links`, `get_orphans`, `get_hubs` are agent-callable; the OK skill prescribes per-write invocation but there is no enforcement layer.
- **Multiple content-quality categories have no detection at all** — staleness, frontmatter conformance, hub freshness, supersedes-chain integrity, closed-loop grounding, external-URL rot. Each is governed only by agent self-discipline through the skill.

---

## Research Rubric

**Primary question:** What linting is built into this workflow (code + content), what does it actually catch, and where are the gaps — particularly for content quality issues like staleness, drift, or coverage gaps?

**Reader cares most about:** Whether anything in the workflow detects content-side issues beyond the dead-links check the user already knows about.

**Dimensions (P0):**
1. Code linting (TS/JS/CSS/JSON) — Biome, knip, typecheck, notices drift, AGENTS.md size.
2. Content/wiki linting — markdown lint, frontmatter validation, prose lint, what's excluded.
3. Link integrity & graph health — dead links, orphans, hubs, backlinks; tools vs gates.
4. Enforcement surfaces — pre-commit, pre-push, CI tiers; blocking vs advisory.

**P1:**
5. Gaps — content categories with neither detection nor enforcement.

**Stance:** Factual current-state inventory, no recommendations.

---

## Detailed Findings

### 1. Code linting

**Finding:** Five distinct code-side gates run on every push. They are all PR-blocking via CI Tier 1 (`.github/workflows/ci.yml`) and reproducible locally via `bun run check`.

**Evidence:** [evidence/code-linting.md](evidence/code-linting.md)

| Gate | Tool | Where | Catches |
|---|---|---|---|
| Lint + format | Biome 2.4.10 | pre-commit (lint-staged), pre-push, CI | TS/TSX/JS/JSX/JSON/JSONC/CSS issues; React Compiler violations (`useMemo` / `useCallback` / `memo` / `useContext` blocked via `noRestrictedImports`); deprecated alias imports |
| Dead-code | knip 6.5.0 | pre-push, CI | unused exports, unused TS types, unused files, unused dependencies |
| Type check | `tsc --noEmit` per package via turbo | pre-push, CI | type errors with `verbatimModuleSyntax: true` |
| Dependencies drift | `scripts/check-notices-clean.sh` | pre-push, CI | THIRD_PARTY_NOTICES.md not regenerated after dep change |
| Single-file size | `scripts/check-agents-md-size.sh` | pre-commit | AGENTS.md > 40k chars (hard fail) / > 35k (warn) |

Two notable design choices:
- `--error-on-warnings` removes Biome's advisory tier — every rule is enforcement-grade.
- `scripts/check-knip-clean.sh` snapshots `git diff` before/after running knip, so CI's "knip auto-fixed something" surprises become local pre-push failures with the same blast radius.

**Implications:**
- Code-side quality bar is high and consistent — there is no advisory or "warn but allow" middle ground.
- The same gate runs locally (pre-push) and remotely (CI Tier 1), so push-time surprises are rare.
- Tier 2 (`nightly.yml` — perf regression, parse-health) and Tier 3 (`weekly.yml` — elevated PBT) are `workflow_dispatch`-only; they were intentionally retired from the PR critical path per `specs/2026-04-19-ci-signal-quality/`. The PR gate explicitly does not cover those signals.

**Decision triggers:** Adding a new Biome rule has CI-test-equivalent blast radius. Adding a new turbo task to `bun run check` is the canonical way to extend the PR gate.

---

### 2. Content / wiki linting

**Finding:** No markdown linter, no frontmatter validator, no prose linter, no spell-checker is configured anywhere in the repo. Wiki content directories are explicitly excluded from Biome. Markdown content discipline is delegated to the Open Knowledge agent skill — enforced only by agent self-policing, not by any machine check.

**Evidence:** [evidence/content-linting.md](evidence/content-linting.md)

Three reinforcing pieces of evidence:

1. **Negative searches confirm absence.** No `markdownlint`, `remark-lint`, `vale`, `cspell`, `alex`, `write-good` — neither in config files nor as dependencies. Only hit was a fixture file in `specs/2026-04-13-mdx-tolerant-parsing/evidence/` that contains the string `markdownlint` as test data.

2. **Wiki dirs are blacklisted in Biome.** `biome.jsonc:38-58` lists `!specs`, `!reports`, `!evidence`, `!meta` — the four directories where most wiki content lives. Biome would not lint them even if it had markdown rules.

3. **Lint-staged's markdown globs are aspirational.** `package.json:38-48` runs Biome on `packages/**/*.md` and `docs/**/*.md` with `--files-ignore-unknown=true`. Biome 2 has no first-class markdown lint rules, so these globs activate the file-pattern match but contribute zero validation.

The OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`) prescribes:
- Per-file frontmatter with `title`, `description`, `tags` (lines 132-142).
- Closed-loop grounding — every factual claim must cite a local doc, external URLs must be `ingest`-ed first (lines 63-77).
- Standard markdown links only — no backticked links, no HTML `<a>`, meaningful image alt text (lines 79-87, 109-116).
- Per-write `get_dead_links` invocation to verify link integrity (line 86).
- Hub maintenance interleaved with child writes (lines 188-198).
- Project-log discipline if a `log.md` exists (lines 200-204).

These rules are loaded into agent context — none are checked by a runner.

**Implications:**
- A doc with malformed YAML frontmatter, missing `title`, or typo'd field name will commit, push, and merge unchallenged.
- A human editing markdown directly (not through an agent) is not subject to any of the OK skill's rules.
- The lint-staged markdown globs are a forward-compat hook: the moment Biome ships markdown rules, those entries will activate. Until then, they are no-ops.

**Decision triggers:** Adding any markdown linter would be net-new tooling; there is no existing config to extend. The natural integration point would be a new turbo task wired into `bun run check`.

**Remaining uncertainty:** Whether the docs/ Fumadocs build performs implicit frontmatter validation as part of MDX compilation. The `docs` workspace builds via turbo, but its build job does not lint `.md` files outside the `docs/` tree.

---

### 3. Link integrity & graph health

**Finding:** Detection capability exists as a complete suite of MCP tools (`get_dead_links`, `get_orphans`, `get_hubs`, `get_backlinks`, `get_forward_links`, `suggest_links`), but no automation invokes them on any cadence. They are agent-callable on demand, not gates.

**Evidence:** [evidence/link-and-graph-health.md](evidence/link-and-graph-health.md)

`get_dead_links` (`packages/cli/src/mcp/tools/get-dead-links.ts:14-20`) finds *internal* missing page targets — references like `[text](./other-doc.md)` whose target does not resolve to any doc in the corpus. It is strict-exact: the OK skill explicitly warns that the editor's red-underline visual is permissive (tolerates slug-fallback) and that the MCP tool is the source of truth (`SKILL.md:87`).

`get_orphans` (`packages/cli/src/mcp/tools/get-orphans.ts:14-20, 37-39`) finds disconnected pages with three lenses: `incoming` (no backlinks), `outgoing` (no forward links), `both` (fully disconnected).

`get_hubs`, `get_backlinks`, `get_forward_links` complete the graph-navigation surface and are registered alongside the audit tools (`packages/cli/src/mcp/tools/index.ts`).

All graph-health tools require the Hocuspocus server to be running (`get-dead-links.ts:14` — `[Requires: Hocuspocus server]`). A CI integration would need to boot Hocuspocus headless first or call the underlying `/api/dead-links` / `/api/orphans` HTTP endpoints directly.

The skill prescribes invocation:
> **Verify before walking away.** After writing a doc, call `get_dead_links({ sourceDocNames: ['your/doc'] })` to find broken references. Fix each redlink or explicitly accept it. (`SKILL.md:86`)

Compliance is unverifiable. Direct human editing via the editor UI is not subject to the skill's prescription at all.

The git history on the relevant tool files (`feat: add dead-link audit surface (#141)`, `Finish V0-11 graph surfaces with fullscreen Orphans and Hubs (#140)`) shows these tools were introduced as **editor surfaces and agent-callable APIs**, not as CI gates. Re-purposing them as a deterministic regression gate is an explicit step that has not been taken.

**Implications:**
- The detection-vs-enforcement gap is widest here: the capability is fully built, but the enforcement layer is empty.
- Internal-link rot is the only content-quality concern that the OK skill *prescribes* a check for. External-URL rot is a separate concern with no detection at all.
- The lightest-weight integration would be a CI workflow that boots `open-knowledge start` headless and curls `/api/dead-links` + `/api/orphans` — no capability work, just orchestration.

**Decision triggers:** If wiki health degrades faster than ad-hoc audits keep up, the tools are already there to gate against.

---

### 4. Enforcement surfaces

**Finding:** Four enforcement surfaces are active — pre-commit, pre-push, CI Tier 1, and on-demand Tier 2/3. The taxonomy is internally consistent (`tier1` / `tier2` / `tier3` package scripts mirror the workflow tiers). No content-quality check runs on any surface.

**Evidence:** [evidence/enforcement-surfaces.md](evidence/enforcement-surfaces.md)

| Surface | Trigger | What runs | Blocking? |
|---|---|---|---|
| pre-commit (`.husky/pre-commit`) | every `git commit` | AGENTS.md size + lint-staged (Biome on staged files) | yes (locally) |
| pre-push (`.husky/pre-push`) | every `git push` | `bun run format && bun run lint && bun run check` | yes (locally) |
| CI Tier 1 (`ci.yml`) | every PR + push to `main` | `lint` + `test` matrix + `playwright` | yes (PR-blocking) |
| CI Tier 2 (`nightly.yml`) | `workflow_dispatch` only | perf, parse-health, R15 guard | advisory |
| CI Tier 3 (`weekly.yml`) | `workflow_dispatch` only | elevated PBT, perf trend | advisory |
| Ad-hoc | manual `bun run measure:fuzz` / `measure:stress` | residual sampling | advisory |

Two facts shape the enforcement model:

1. **Pre-push mirrors CI Tier 1.** `bun run check` is the canonical local equivalent of the PR gate. Anything CI catches, pre-push catches first.

2. **Tier 2/3 schedule triggers were retired.** Per `specs/2026-04-19-ci-signal-quality/`, the `schedule:` triggers for nightly/weekly were removed pre-production — nobody is on-call for nightly signal, and tier 1 catches regressions at merge time. Tier 2/3 run only on manual dispatch.

The Claude PR review bot (`.github/workflows/claude-code-review.yml`) runs on every PR and on `@claude --review` comments from authorized users. It is the only AI-mediated review surface but produces opinion, not pass/fail.

`stale.yml` runs daily and closes PRs inactive for 7+ days. It does not touch wiki content — `days-before-issue-stale: -1` (disabled), and there is no doc analog.

**Implications:**
- Content-quality gates would naturally fit either the pre-push surface (deterministic, fast) or a new CI Tier (dispatch-able, slower-cadence audits).
- The `tier1`/`tier2`/`tier3` taxonomy has a natural Tier-2 slot for content audits if added.

---

### 5. Gaps — what is NOT covered

**Finding:** Multiple categories of content quality have no detection at all. Several more have detection capability via MCP tools but no enforcement layer.

**Evidence:** [evidence/gaps-not-covered.md](evidence/gaps-not-covered.md)

Categorized by detection × enforcement state:

**Has neither detection nor enforcement (12 categories):**

| Concern | Status |
|---|---|
| Stale wiki content (doc-age decay, status drift) | No detection. |
| Frontmatter schema conformance (`title` / `description` / `tags` presence, type, validity) | No detection. Folder defaults silently mask absence at read time. |
| Hub freshness — hub doc not updated when children change | No detection. OK skill prescribes interleaving, agent-discipline only. |
| `supersedes:` chain integrity (terminating chains, cycles) | No detection. |
| `status:` field validity (`provisional` / `canonical` / ...) | Workflow tools enforce at *creation*, not periodic re-validation. |
| External-URL rot (web links in wiki content) | No detection. `get_dead_links` is internal-only. |
| Closed-loop grounding (every claim → local source) | No detection. OK skill rule, agent-discipline only. |
| Prose quality / typos / inclusive language | No detection. |
| Markdown style consistency (heading levels, list markers, fenced-code) | No detection. |
| Image alt-text presence and quality | No detection. OK skill rule, agent-discipline only. |
| Empty or generic alt text on images | No detection. OK skill rule, agent-discipline only. |
| HTML in markdown (per OK skill, prohibited) | No detection. |

**Has detection capability but no enforcement (2 categories):**

| Concern | Capability | Enforcement |
|---|---|---|
| Internal dead links | `get_dead_links` MCP tool (strict-exact) | OK skill prescribes per-write call; agent-discipline only. No CI gate. |
| Orphan accumulation | `get_orphans` MCP tool (3 modes) | None. Manual ad-hoc invocation. |

**Implications:**
- The user's intuition is correct: "broken links" is the *one* content concern with both detection and a prescribed (if unenforced) check. Everything else is either undetected or detected only on ad-hoc invocation.
- The closed-loop grounding rule is the highest-stakes content-quality rule (per project memory: source-grounded LLM reasoning is core to the OK thesis) and has the weakest enforcement of any rule in this repo. It is treated as an axiom that agents must obey, with no machine-side verification.
- Doc staleness is not just "not enforced" — it has no detection mechanism either. There is no implementation to point at and gate; building any staleness signal would be net-new.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Fumadocs build-time validation:** The `docs/` workspace uses Fumadocs (Next.js). Whether its build step performs frontmatter or MDX validation that effectively gates the published-docs surface was not exhaustively traced. Ad-hoc evidence: `docs/` runs Biome on its tree via the root `lint` script, but Biome lint is JS/JSON only.
- **Per-spec frontmatter conventions:** Spec docs (`specs/<dated-spec>/SPEC.md`) follow a richer frontmatter convention than the OK skill's recommended `title`/`description`/`tags` (decision IDs, US/FR numbering, etc.). Whether any spec-specific validation exists was not investigated.

### Out of Scope (per Rubric)

- Recommending what should be added (factual stance).
- 3P landscape research on OSS markdown linters.
- Per-package nuances (each package's `bunx tsc --noEmit && bun test` pattern).

---

## References

### Evidence Files
- [evidence/code-linting.md](evidence/code-linting.md) — Biome, knip, typecheck, notices, AGENTS.md size; rules, files, gates.
- [evidence/content-linting.md](evidence/content-linting.md) — Negative searches confirming no markdown / prose linter; the OK skill as the de facto content-discipline rule set.
- [evidence/link-and-graph-health.md](evidence/link-and-graph-health.md) — MCP tool surface; detection vs enforcement gap; CI orchestration path.
- [evidence/enforcement-surfaces.md](evidence/enforcement-surfaces.md) — pre-commit / pre-push / CI Tier 1/2/3 mapping; what's blocking vs advisory.
- [evidence/gaps-not-covered.md](evidence/gaps-not-covered.md) — categorized inventory of undetected + unenforced content-quality concerns.

### Internal Sources
- `package.json` — `lint`, `format`, `check`, `tier1`/`tier2`/`tier3`, `lint-staged`.
- `biome.jsonc` — Biome 2.4.10 rules, includes/excludes.
- `.husky/pre-commit`, `.husky/pre-push` — local gates.
- `.github/workflows/ci.yml`, `nightly.yml`, `weekly.yml`, `stale.yml`, `claude-code-review.yml`.
- `scripts/check-knip-clean.sh`, `scripts/check-notices-clean.sh`, `scripts/check-agents-md-size.sh`.
- `packages/server/assets/skills/open-knowledge/SKILL.md` — agent-discipline content rules.
- `packages/cli/src/mcp/tools/get-dead-links.ts`, `get-orphans.ts` — detection capability.
- `.open-knowledge/config.yml` — folder frontmatter defaults.

### Related Research (navigation aids only)
- [reports/wiki-links-backlinks-architecture/](../wiki-links-backlinks-architecture/) — 3P landscape on backlink architectures (motivates the graph-tool design).
- [reports/frontmatter-schema-conventions-for-agent-readable-docs/](../frontmatter-schema-conventions-for-agent-readable-docs/) — 3P landscape on frontmatter schemas (could inform a future frontmatter validator).
- [reports/agents-md-size-reduction/REPORT.md](../agents-md-size-reduction/REPORT.md) — context behind the AGENTS.md size cap.
