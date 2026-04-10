# Evidence: D8 — Collaboration

**Dimension:** Real-time multi-user editing, agent-human collaboration, review workflows
**Date:** 2026-04-02
**Sources:** Mintlify collaboration docs, editor docs, Workflows docs

---

## Key pages referenced
- https://www.mintlify.com/docs/editor/collaborate — Collaboration features
- https://www.mintlify.com/docs/agent/workflows — Workflow agent collaboration
- https://www.mintlify.com/blog/launch-week-3-day-3 — Editor branching

---

## Findings

### Finding: Collaboration is branch-based with NO real-time co-editing
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor/collaborate

Available collaboration features:
- Branch-based isolation (multiple people on different branches)
- Preview deployments per branch (`org-branch.mintlify.app`)
- Editor link sharing (`dashboard.mintlify.com/{org}/{project}/editor/{branch}/~/filepath`)
- PR creation from editor
- Changes auto-push to existing PRs
- Review through GitHub/GitLab (not in Mintlify)

NOT available:
- Real-time co-editing (no simultaneous editing of same page)
- Live cursors or presence indicators
- Inline comments on content blocks
- @mentions
- Threaded discussions
- Comment resolution
- Suggested edits (review mode)
- Content-level approval workflows
- Granular permissions (viewer/commenter/admin)

### Finding: Agent-human collaboration happens through git PRs only
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/agent/workflows

The Mintlify Agent (Workflows) creates PRs that humans review through GitHub/GitLab. The workflow:
1. Agent runs on trigger (schedule or push event)
2. Agent generates changes in ephemeral sandbox
3. Agent opens PR with descriptive branch name
4. Human reviews PR in GitHub
5. Human merges or requests changes

There is no:
- Agent presence in the editor (cannot see agent activity)
- Agent suggestions inline in content
- Agent-human chat about specific content
- Agent attribution in version history (commits are from the Mintlify GitHub App, not a named agent)
- Conflict resolution between agent and human edits (delegated to git)
- Auto-merge with human oversight (available via `automerge` config, bypasses review)

### Finding: The review workflow is entirely GitHub/GitLab-native
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor/collaborate

All review happens through the git provider:
- PR reviews and approvals
- Inline code/content comments
- Branch protection rules
- CI checks (if configured)
- Merge/squash/rebase

Mintlify adds preview deployments as the only layer on top of standard git collaboration. This is a thin wrapper, not a collaboration platform.

---

## Negative searches

* Searched: "Mintlify real-time editing simultaneous" — No real-time co-editing
* Searched: "Mintlify comments suggestions review" — No in-product review features
* Searched: "Mintlify agent attribution identity" — No agent identity system

---

## Gaps / follow-ups

* Whether the editor supports any presence indicators (seeing who's on what branch) is unclear but evidence suggests no
