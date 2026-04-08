# Spec: CI PR Review System Setup

**Status:** Ready to implement
**Date:** 2026-04-07
**Scope:** Set up automated Claude PR review for `inkeep/open-knowledge`

---

## 1. Problem

The open-knowledge repo has no CI at all — no `.github/` directory, no automated checks, no PR review. PRs merge without any automated quality gate. The team-skills PR review system (17 domain-specific reviewers + orchestrator) is production-proven in `~/agents` and `~/openbolt` and should be extended to this repo.

## 2. Goals

1. Automated Claude PR review on every non-draft PR (open, synchronize, ready_for_review)
2. Manual review trigger via `@claude --review` / `@claude --full-review` comments
3. Delta re-review support (scope to changes since last review)
4. Copy 4 repo-specific skills referenced by `pr-review-frontend` subagent

## 3. Non-goals

- `product-surface-areas` and `internal-surface-areas` skills (separate effort)
- Basic CI pipeline (typecheck, lint, test) — separate workflow, not this spec
- Closed-PR auto-improver workflow
- Local review script (`pr-review.sh`)

## 4. Solution

### 4.1 GitHub Actions Workflow

Create `.github/workflows/claude-code-review.yml` — adapted from `openbolts/.github/workflows/claude-code-review.yml` (677 lines).

**What stays identical:**
- Trigger conditions (PR events + `@claude` comment dispatch)
- Concurrency group (cancel prior runs per PR)
- Permissions (contents: read, pull-requests: write, issues: read, id-token: write)
- PR details extraction step
- Git diff analysis with lock file exclusion and 100KB summary mode
- GraphQL review context gathering (threads, reviews, linked issues, comments)
- Stale comment cleanup
- PR context skill generation (auto-generates `.claude/skills/pr-context/SKILL.md`)
- GitHub App token generation for team-skills clone
- Team-skills clone step (`inkeep/team-skills` → `/tmp/team-skills`)
- Claude code action invocation with plugin-dir, agent, and allowed tools
- Progress comment cleanup
- Debug artifact upload

**What changes:**
- Nothing structural. The workflow is repo-agnostic by design — it uses `${{ github.repository }}` throughout. The only repo-specific values are secrets (already org-level).

**Adaptation:** Copy the file verbatim. No modifications needed.

### 4.2 Repo-Specific Skills (4 skills, copy as-is)

Copy from `~/agents/.agents/skills/` into `.claude/skills/`:

| Skill | Contents | Size | Used by |
|-------|----------|------|---------|
| `vercel-react-best-practices` | `SKILL.md` + `AGENTS.md` + `rules/` (68 files) | ~370KB | `pr-review-frontend` |
| `vercel-composition-patterns` | `SKILL.md` + `AGENTS.md` + `rules/` (10 files) | ~60KB | `pr-review-frontend` |
| `accessibility-checklist` | `SKILL.md` only | ~12KB | `pr-review-frontend` |
| `web-design-guidelines` | `SKILL.md` only | ~1KB | `pr-review-frontend` |

These are framework-agnostic React/web quality skills. No adaptation needed — the content applies to any React project (open-knowledge uses React 19 + TipTap + Vite).

**Directory structure after:**
```
.claude/skills/
├── pr-context/          (exists — will be overwritten by CI at runtime)
├── vercel-react-best-practices/
│   ├── SKILL.md
│   ├── AGENTS.md
│   └── rules/           (68 .md files)
├── vercel-composition-patterns/
│   ├── SKILL.md
│   ├── AGENTS.md
│   └── rules/           (10 .md files)
├── accessibility-checklist/
│   └── SKILL.md
└── web-design-guidelines/
    └── SKILL.md
```

### 4.3 Required GitHub Configuration

**Secrets (org-level, already configured for `inkeep/`):**
- `ANTHROPIC_API_KEY` — Claude API key
- `INTERNAL_CI_APP_ID` — GitHub App ID for cross-repo access
- `INTERNAL_CI_APP_PRIVATE_KEY` — GitHub App private key
- `EXA_API_KEY` — Exa web search API key (used by reviewers for evidence verification)

**Repo permissions:**
- GitHub Actions must be enabled
- Workflow permissions: read contents, write pull-requests, read issues
- The `GITHUB_TOKEN` auto-provides these via the `permissions:` block in the workflow

**Verification:** All 4 secrets exist at org level (confirmed — openbolt uses the same secrets in the same org). No new secrets needed.

## 5. Implementation Plan

### Step 1: Copy the workflow file
```
cp ~/openbolts/.github/workflows/claude-code-review.yml \
   .github/workflows/claude-code-review.yml
```

### Step 2: Copy the 4 skills
```
cp -r ~/agents/.agents/skills/vercel-react-best-practices .claude/skills/
cp -r ~/agents/.agents/skills/vercel-composition-patterns .claude/skills/
cp -r ~/agents/.agents/skills/accessibility-checklist .claude/skills/
cp -r ~/agents/.agents/skills/web-design-guidelines .claude/skills/
```

### Step 3: Verify GitHub Actions is enabled
Check repo settings → Actions → General → allow all actions.

### Step 4: Test with a real PR
Create a test PR (or use the current `feat/init-spike` branch) and verify:
1. Workflow triggers on PR open
2. PR context skill is generated
3. Team-skills clone succeeds
4. Review completes and posts comments

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing `product-surface-areas` / `internal-surface-areas` skills | Certain (not in scope) | Reviewers that reference these skills will have degraded context | The orchestrator and subagents gracefully handle missing skills — they proceed without that context. Create these skills in the follow-up effort. |
| Org secrets not propagated to this repo | Low | Workflow fails at token generation | Verify secrets are available at org level for all repos (not restricted to specific repos). |
| Large diff handling on init-spike branch | Medium | First PR may hit summary mode | Expected behavior — the workflow handles large diffs with on-demand reading. |

## 7. Acceptance Criteria

- [ ] `.github/workflows/claude-code-review.yml` exists and is syntactically valid
- [ ] 4 skill directories exist under `.claude/skills/` with complete contents
- [ ] Workflow triggers on a PR event (verified by GitHub Actions run)
- [ ] Claude posts a review comment on a test PR

## 8. Future Work

| Item | Maturity | Trigger |
|------|----------|---------|
| `product-surface-areas` skill | Identified | Before shipping v1 — improves reviewer blast-radius analysis |
| `internal-surface-areas` skill | Identified | Before shipping v1 — improves reviewer system-level analysis |
| Basic CI workflow (typecheck, lint, test) | Identified | When init-spike graduates to main development |
| Closed-PR auto-improver workflow | Noted | When review volume is high enough to learn from |
| Local review script | Noted | When developers want pre-push review locally |

---

## Decision Log

| # | Decision | Type | Reversibility | Date |
|---|----------|------|---------------|------|
| D1 | Copy workflow verbatim from openbolt (no modifications) | Technical | Reversible | 2026-04-07 |
| D2 | Copy 4 frontend skills as-is (no adaptation for TipTap/Vite) | Technical | Reversible | 2026-04-07 |
| D3 | Skip product-surface-areas and internal-surface-areas for now | Product | Reversible | 2026-04-07 |
| D4 | No .gitignore changes needed (skills are committed, pr-context is overwritten at CI time) | Technical | Reversible | 2026-04-07 |

## Open Questions

_None remaining — scope is fully defined._

## Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|--------------|
| A1 | Org-level secrets (ANTHROPIC_API_KEY, INTERNAL_CI_APP_ID, INTERNAL_CI_APP_PRIVATE_KEY, EXA_API_KEY) are available to this repo | HIGH | First workflow run will confirm |
| A2 | GitHub Actions is enabled for inkeep/open-knowledge | HIGH | Check repo settings |
| A3 | The 4 skills are stable and don't need repo-specific adaptation | HIGH | They're framework-agnostic React/web patterns |
