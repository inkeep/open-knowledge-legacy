# Evidence: Git Integration & Docs-as-Code

**Dimension:** Git Integration & Docs-as-Code
**Date:** 2026-04-02
**Sources:** fumadocs.dev, mintlify.com

---

## Key files / pages referenced

- https://fumadocs.dev/docs — Fumadocs development workflow
- https://www.mintlify.com/docs/editor — Web editor + Git sync
- https://www.mintlify.com/blog/improved-web-editor — Bi-directional sync details
- https://www.mintlify.com/docs/quickstart — GitHub App deployment

---

## Findings

### Finding: Fumadocs is natively git-backed — files ARE the content, no sync layer needed
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs

Git is inherent:
- MDX files in `content/docs/` are the documentation
- meta.json files control organization
- source.config.ts defines the content schema
- No separate content database or sync mechanism
- Build reads directly from filesystem
- Git history = version history
- PRs = review workflow
- Standard dev workflow: branch -> edit files -> commit -> PR -> merge -> deploy

There is no "git integration" because git IS the system. The filesystem is the API.

**Implications:** For an agent-native platform, this is the purest git-as-substrate model. An agent with filesystem access can create, edit, delete, and reorganize docs with standard git operations.

### Finding: Mintlify adds a bi-directional sync layer between Git and their visual editor
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor, https://www.mintlify.com/blog/improved-web-editor

Bi-directional sync:
- Web editor changes → committed to Git repository
- Git pushes → reflected in web editor
- GitHub App installation enables automatic deployments
- Preview deployments for every branch
- Changes deployed to production on push to default branch

The sync layer is the key innovation:
- Engineers: work in IDEs, push via Git
- Writers: use browser editor, commits happen automatically
- Both converge on the same Git repo
- Mintlify acts as a bidirectional adapter between visual editing and Git

**Implications:** This bi-directional sync pattern is the most important architectural insight for the knowledge platform. It proves that a visual editor and git-backed storage can coexist — and that the visual editor can be the authoring surface while Git remains the source of truth.

---

## Gaps / follow-ups

- Mintlify's conflict resolution strategy when simultaneous web edits and Git pushes occur
- Whether Mintlify supports custom Git workflows (e.g., custom branch names, commit message formats)
- Fumadocs' git-based timestamp features (last-modified dates from git log)
