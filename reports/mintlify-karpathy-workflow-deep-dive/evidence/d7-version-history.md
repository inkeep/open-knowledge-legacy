# Evidence: D7 — Version History and Persistence

**Dimension:** Git-based version control UX, preview deployments, revert/compare capabilities
**Date:** 2026-04-02
**Sources:** Mintlify deploy docs, preview deployment docs, collaboration docs

---

## Key pages referenced
- https://www.mintlify.com/docs/deploy/preview-deployments — Preview deployments
- https://www.mintlify.com/docs/editor/collaborate — Branch workflows
- https://www.mintlify.com/docs/quickstart — Deployment model

---

## Findings

### Finding: Version history is entirely delegated to git — no Mintlify-native history UI
**Confidence:** CONFIRMED
**Evidence:** Documentation review across deploy, editor, and collaboration docs

Mintlify has NO built-in version history viewer. There is no "view page history," "compare versions," or "revert to previous" button in the web editor or dashboard.

Version history is accessible only through:
1. Git log in the connected GitHub/GitLab repository
2. GitHub/GitLab web UI for commits, diffs, blame
3. Local git tools

This means:
- Reverting requires a git revert/reset (through GitHub UI or CLI)
- Comparing versions requires GitHub's diff view
- Non-technical users have no version history access through Mintlify

### Finding: Preview deployments provide branch-based visual review
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/deploy/preview-deployments

**How they work:**
- Available on Pro and Enterprise plans
- Each PR targeting the deployment branch gets an automatic preview
- Mintlify bot posts preview link in the PR
- Preview updates automatically with each new commit
- Manual previews creatable for any branch (dashboard -> Previews -> Create custom)

**URL format:** `organization-branch-name.mintlify.app`

**Access:** Publicly viewable by default. Can restrict to authenticated members.

**Preview widget:** Shows changed files — appears only on preview deployments, not production.

### Finding: Auto-deploy on merge is the standard deployment model
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/quickstart

Deployment flow:
1. Push to default branch (or merge PR)
2. Mintlify GitHub App detects change
3. Managed build pipeline runs
4. Site auto-deploys to Mintlify CDN
5. MCP server, llms.txt, skill.md, search index all auto-regenerated

No manual deployment step. No deployment approval gate (beyond git branch protection).

### Finding: No visual diff, no page-level history, no revert button
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched across Mintlify docs

NOT available in Mintlify:
- Page-level version history timeline
- Visual diff between page versions
- One-click revert to previous version
- Content audit log (who changed what, when)
- Rollback to previous deployment
- Draft/staging states beyond git branches

---

## Negative searches

* Searched: "Mintlify version history" — No version history UI found
* Searched: "Mintlify revert rollback" — No revert capability (delegated to git)
* Searched: "Mintlify diff compare versions" — No diff viewer

---

## Gaps / follow-ups

* Whether Mintlify stores deployment artifacts that could enable rollback is unclear
* Git-based history is complete but requires git literacy to use
