# Evidence: Bot/CI Auto-Commit Patterns

**Dimension:** D3 — Bot patterns + CI automation
**Date:** 2026-04-15
**Sources:** GitHub repos, official docs for 12 tools/patterns

---

## Key files / pages referenced

- https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-pull-requests-for-dependency-updates — Dependabot PR management
- https://github.blog/changelog/2025-04-22-dependabot-now-lets-you-schedule-update-frequencies-with-cron-expressions/ — Dependabot cron scheduling
- https://nesbitt.io/2026/01/02/how-dependabot-actually-works.html — Dependabot architecture analysis
- https://docs.renovatebot.com/key-concepts/automerge/ — Renovate automerge
- https://docs.renovatebot.com/key-concepts/scheduling/ — Renovate scheduling
- https://docs.mend.io/wsk/renovate-ee-job-processing-in-renovate — Mend Renovate job processing
- https://docs.snyk.io/scan-with-snyk/pull-requests/snyk-pull-or-merge-requests/enable-automatic-fix-prs — Snyk auto-fix PRs
- https://github.com/stefanzweifel/git-auto-commit-action — git-auto-commit-action
- https://pre-commit.ci/ — pre-commit.ci docs
- https://autofix.ci/ — autofix.ci docs
- https://github.com/autofix-ci/action — autofix.ci GitHub Action
- https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions — semantic-release GitHub Actions recipe
- https://gonzalohirsch.com/blog/semantic-release-and-branch-protection-rules/ — semantic-release branch protection analysis
- https://github.blog/changelog/2022-08-18-bypass-branch-protections-with-a-new-permission/ — GitHub bypass permissions
- https://github.com/changesets/action — changesets/action
- https://github.com/changesets/changesets/blob/main/docs/automating-changesets.md — Automating changesets
- https://github.com/lint-staged/lint-staged — lint-staged (pre-commit hook, not CI bot)
- https://prettier.io/docs/precommit — Prettier pre-commit docs
- https://github.com/JamesIves/github-pages-deploy-action — GitHub Pages deploy action

---

## Findings

### Finding: Dependency bots default to PR isolation, never direct-push to main
**Confidence:** CONFIRMED
**Evidence:** Dependabot, Renovate, Snyk docs

All three major dependency bots (Dependabot, Renovate, Snyk) create dedicated side-branches and open PRs. They never push directly to the default/main branch. Dependabot's open-source core (`dependabot-core`) is "stateless and outputs instructions; it never pushes commits directly" — GitHub's infrastructure executes the git operations.

Renovate's `automergeType=branch` is the narrow exception: with passing CI and no branch protection, it pushes directly to the base branch. But this is explicitly opt-in and blocked by branch protection rules.

### Finding: The PR model provides three safety functions that auto-sync bypasses
**Confidence:** CONFIRMED
**Evidence:** GitHub branch protection docs, Renovate automerge docs

1. **Human review checkpoint** — PRs stay open until approved; branch protection enforces required reviews and code owner approval.
2. **CI gating** — required status checks fire at merge time, not on side-branch commits.
3. **Conflict isolation** — conflicting dependency PRs show as merge-conflict indicators, not as fast-forward overwrites.

### Finding: semantic-release is the sharpest exception — pushes directly to release branch
**Confidence:** CONFIRMED
**Evidence:** https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions, https://gonzalohirsch.com/blog/semantic-release-and-branch-protection-rules/

`@semantic-release/git` pushes version-bump commits directly to the release branch (often `main`). This requires either a PAT with admin permissions or a GitHub App explicitly added to the "bypass branch protection" allowlist. Multiple ecosystem threads document the friction with branch protection rules.

### Finding: CI auto-commit tools push to branches, not to main
**Confidence:** CONFIRMED
**Evidence:** git-auto-commit-action, pre-commit.ci, autofix.ci docs

`git-auto-commit-action` pushes to the current branch (typically a feature/PR branch, not main). `pre-commit.ci` commits auto-fixes to the PR's source branch. `autofix.ci` pushes to the existing PR branch via a GitHub App token. None target the default branch.

### Finding: Bot scheduling models split into cron/polling vs event-driven
**Confidence:** CONFIRMED
**Evidence:** Per-tool docs

| Schedule model | Tools |
|---|---|
| Cron/polling (independent of repo events) | Dependabot (daily/weekly/monthly/cron), Renovate runner (hourly) |
| Event-driven (SCM events trigger work) | Renovate (PR/manifest change), Snyk (new vulnerability) |
| Parent CI workflow (passive step) | git-auto-commit-action, pre-commit.ci, autofix.ci, semantic-release, changesets, Pages deploy |
| Local developer hook | Husky + lint-staged |

### Finding: Bot identity and attribution is universal
**Confidence:** CONFIRMED
**Evidence:** https://github.blog/changelog/2022-08-18-bypass-branch-protections-with-a-new-permission/

All major CI bots commit under synthetic identities: `github-actions[bot]` (GITHUB_TOKEN), `renovate[bot]`, `dependabot[bot]` (GitHub App registrations). This makes bot commits identifiable in `git log` and subject to separate bypass allowlists in branch protection.

---

## Per-tool classification

| Tool | Auto-commit | Auto-push | Creates PRs | Direct to main |
|------|-------------|-----------|-------------|---------------|
| Dependabot | Yes (via API) | To side-branch | Always | Never |
| Renovate | Yes | To side-branch | Default; `automergeType=branch` can skip | Opt-in only |
| Snyk | Yes | To side-branch | Always | Never |
| git-auto-commit-action | Yes | To current branch | No (pushes directly) | Only if workflow runs on main |
| pre-commit.ci | Yes | To PR branch | N/A (fixes existing PR) | Never |
| autofix.ci | Yes | To PR branch | N/A (fixes existing PR) | Never |
| semantic-release | Yes | To release branch | No | Yes (the exception) |
| changesets/action | Yes | Via PR only | Yes ("Version Packages" PR) | Only after PR merge |
| Husky + lint-staged | No (within human's commit) | No | N/A | N/A |
| GitHub Pages deploy | Yes | Force-push to gh-pages | No | To deployment branch only |

---

## Gaps / follow-ups

- Dependabot's rebase frequency and failure handling when auto-rebase fails — not fully documented
- Renovate's exact behavior when `branchConcurrentLimit` is exceeded — deferred vs queued
