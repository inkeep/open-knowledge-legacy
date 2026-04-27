---
oq_refs: [OQ2]
decisions: [D5, D8]
sources: [packages/server/assets/skills/open-knowledge/SKILL.md:1-3]
captured: 2026-04-24
---

# Evidence: current SKILL.md frontmatter shape

**Captured:** 2026-04-24
**Path:** `packages/server/assets/skills/open-knowledge/SKILL.md`

## Current frontmatter

The SKILL.md at `packages/server/assets/skills/open-knowledge/SKILL.md` has only two frontmatter fields: `name: open-knowledge` and `description: "..."`. Both required, both present. No `metadata`, no `license`, no `compatibility`, no `allowed-tools`. Live source: read the file in repo (content rewritten post-evidence-capture; the exact text at the time of this evidence's 2026-04-24 capture may already be stale).

## Findings

- **Two fields only:** `name` + `description`.
- **Description length:** ~930 chars at baseline commit `46751128` — near spec's 1024-char limit, well past the support-article 200-char cap.
- **In-body version prose** (line 7): `> Skill version: tracks '@inkeep/open-knowledge-server' package version. Check 'cat ~/.open-knowledge/skill-installed-version' to see what's installed locally.` — human-readable but not machine-parseable.

## Implication for D5 + D8 (version injection)

- We need to **add** `metadata.version` at build time (D8 = build-time injection path). Source of truth: `packages/server/package.json` version field (D5).
- **Description length caveat:** the current description is near spec limits. If the support article's 200-char cap is enforced (per reports/agent-skills-zip-distribution-ux/REPORT.md Dim 1), Claude Desktop may display a truncated version. Not a build-blocker but worth flagging — consider a shorter description as a follow-up.
- **In-body prose can stay** — it references the sidecar file which is still the Claude Code install's idempotency signal.

## Proposed build-time injection shape

```yaml
---
name: open-knowledge
description: "<existing>"
metadata:
  version: "0.2.0"  # injected from packages/server/package.json at build time
  author: "Inkeep"
  repository: "https://github.com/inkeep/open-knowledge"
---
```

Adding `metadata.author` and `metadata.repository` is cheap and gives Claude Desktop something to display if/when it adds publisher-info UI (per research report Dim 7, it currently shows nothing).
