# Evidence: Headless CMS Git Auto-Behavior

**Dimension:** D2 — Headless CMS / content-editing tools with git provider
**Date:** 2026-04-15
**Sources:** Official docs, GitHub repos for 15 tools

---

## Key files / pages referenced

- https://decapcms.org/docs/intro/ — Decap CMS overview (GitHub API backend)
- https://decapcms.org/docs/github-backend/ — Decap GitHub backend
- https://github.com/sveltia/sveltia-cms — Sveltia CMS (Decap fork, GitHub GraphQL API)
- https://sveltiacms.app/en/docs/backends/github — Sveltia GitHub backend docs
- https://staticcms.org/docs/docs/backends/overview/ — Static CMS backends
- https://keystatic.com/docs/github-mode — Keystatic GitHub mode
- https://keystatic.com/docs/local-mode — Keystatic local mode
- https://medium.com/short-bits/forestry-a-cms-for-git-5030a2ea802 — Forestry review (historical)
- https://medium.com/devseed/introducing-prose-a-content-editor-for-github-89bcc9855ab4 — Prose.io intro
- https://getpublii.com/docs/host-static-website-git-repository.html — Publii git sync (one-directional)
- https://forum.getpublii.com/topic/git-feature-in-publii-v-0-44-0-alpha/ — Publii git alpha discussion
- https://mintlify.mintlify.app/editor — Mintlify web editor
- https://www.mintlify.com/blog/launch-week-3-day-3 — Mintlify branching blog
- https://gitbook.com/docs/getting-started/git-sync — GitBook Git Sync overview
- https://gitbook.com/docs/getting-started/git-sync/enabling-github-sync — GitBook GitHub Sync
- https://gitbook.com/docs/getting-started/git-sync/commits — GitBook commit semantics
- https://cloudcannon.com/documentation/developer-articles/connecting-a-github-repository-as-your-source/ — CloudCannon GitHub connection
- https://cloudcannon.com/documentation/developer-articles/introduction-to-syncing/ — CloudCannon syncing intro
- https://cloudcannon.com/documentation/user-articles/save-your-changes/ — CloudCannon save
- https://frontmatter.codes/docs/git-integration — Front Matter CMS git integration
- https://docs.netlify.com/manage/visual-editor/cloud-setup/publishing/ — Netlify Create publishing
- https://docs.netlify.com/manage/visual-editor/concepts/how-visual-editor-works/ — Netlify Visual Editor
- https://statamic.dev/git-automation — Statamic git automation docs
- https://www.contentful.com/developers/docs/tutorials/general/continuous-integration-with-circleci/ — Contentful CI docs
- https://strapi.io/blog/git-based-vs-api-first-cms — Strapi git vs API-first analysis
- https://www.sanity.io/content-lake — Sanity Content Lake

---

## Findings

### Finding: API-mediated commit-on-save is the dominant CMS git pattern
**Confidence:** CONFIRMED
**Evidence:** Decap CMS, Sveltia CMS, Static CMS, Keystatic (GitHub mode), Prose.io docs

Five tools (plus TinaCMS from parent report = 6 total) use the same architecture: no local git process, no working directory. The GitHub/GitLab REST or GraphQL API IS the git layer. "Save" = one API call that atomically creates a commit on the remote. No separate push step exists because there is no local state to push. No pull step exists because reads go directly to the API.

**Implications:** This architecture sidesteps the entire auto-pull/auto-push question — there is no local/remote divergence to manage.

### Finding: Three CMS tools achieve full-auto bidirectional git sync
**Confidence:** CONFIRMED
**Evidence:** CloudCannon, GitBook, and Forestry (sunset 2023) docs

- **CloudCannon:** Persistent webhook subscription ingests remote commits automatically; every save auto-commits and auto-pushes. Fully bidirectional, continuous, no user action required.
- **GitBook:** When Git Sync is enabled, incoming GitHub/GitLab commits auto-sync INTO GitBook. Outgoing commits occur per change-request merge. Bidirectional but not per-keystroke.
- **Forestry (sunset 2023):** Watched repository via webhooks; committed back on save. CloudCannon positioned itself as the successor.

### Finding: Publii's git sync is one-directional and destructive
**Confidence:** CONFIRMED
**Evidence:** https://getpublii.com/docs/host-static-website-git-repository.html, https://forum.getpublii.com/topic/git-feature-in-publii-v-0-44-0-alpha/

Publii commits rendered static HTML to git on sync, then force-pushes. External changes to the remote are silently overwritten. This is deployment-style output, not content-level bidirectional sync.

### Finding: Statamic auto-commits on save by default but auto-push is off
**Confidence:** CONFIRMED
**Evidence:** https://statamic.dev/git-automation

Statamic's git integration fires a commit on every `Saved`/`Deleted` event (configurable, default on). Auto-push is configurable via `'push' => true` but defaults to off. No auto-pull capability exists.

### Finding: Three major proprietary CMSs have no git content storage
**Confidence:** CONFIRMED
**Evidence:** Contentful, Strapi, Sanity docs

Contentful uses Content Lake (proprietary CDN-backed API). Strapi uses SQL databases. Sanity uses Content Lake. In all three, git is used only for schema/code versioning by developers, not for content storage.

---

## Per-tool classification table

| Tool | Category | Default behavior |
|------|----------|-----------------|
| Decap CMS | (a) API-mediated | Save = GitHub API commit, no local git |
| Sveltia CMS | (a) API-mediated | Same as Decap (GraphQL) |
| Static CMS | (a) API-mediated | Same as Decap (fork) |
| Keystatic (GitHub) | (a) API-mediated | GitHub API commit on save |
| Prose.io | (a) API-mediated | GitHub API commit on explicit save |
| Mintlify | (a) API-mediated | Publish = API commit or PR |
| Publii | (b) Auto-push (one-way) | Commits rendered output + force-push |
| Netlify Create | (b) Auto-push on publish | Branch merge on explicit publish |
| Statamic | (c) Auto-commit only | Commits on save; push off by default |
| CloudCannon | (d) Full-auto bidirectional | Webhook-driven pull + commit+push on save |
| GitBook (Git Sync) | (d) Full-auto bidirectional | When enabled: auto-pull + commit-on-merge |
| Forestry (sunset) | (d) Full-auto bidirectional | Webhook pull + commit on save |
| Front Matter CMS | (e) Manual | Manual sync button wrapping VS Code git |
| Keystatic (local) | (e) Manual | Plain filesystem writes, no git ops |
| Contentful | (f) No git | Content Lake API |
| Strapi | (f) No git | SQL database |
| Sanity Studio | (f) No git | Content Lake |

---

## Gaps / follow-ups

- CloudCannon's conflict handling behavior when webhook pull produces conflicts — not documented in surveyed sources
- GitBook's precise latency from GitHub commit to GitBook availability — not measured
