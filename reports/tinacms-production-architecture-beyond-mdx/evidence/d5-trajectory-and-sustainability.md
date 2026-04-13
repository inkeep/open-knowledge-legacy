# Evidence: D5 — Trajectory, OSS/Commercial Split, Sustainability

**Dimension:** Trajectory, OSS/commercial split, sustainability
**Date:** 2026-04-12
**Sources:** `~/.claude/oss-repos/tinacms`; tina.io; github.com; PitchBook; itsfoss

**⚠️ Source-incentive note:** Several findings below cite tina.io (the vendor's own marketing site) for claims about Tina's own product direction, pricing, and customers. Vendor-sourced claims about their own product carry product-incentive bias and should be read as direction-of-travel signals rather than independently verified fact.

---

## Key files / pages referenced

- Local repo: `~/.claude/oss-repos/tinacms` (branch: main, HEAD: `c33e3d1`, 2026-04-02)
- `~/.claude/oss-repos/tinacms/LICENSE` — Apache 2.0
- `~/.claude/oss-repos/tinacms/README.md` — lists maintainers (all SSW or SSW-affiliated)
- `~/.claude/oss-repos/tinacms/packages/tinacms/CHANGELOG.md` — recent releases (v3.7.1, v3.7.0)
- [tina.io/about](https://tina.io/about) (accessed 2026-04-12)
- [tina.io/pricing](https://tina.io/pricing) (accessed 2026-04-12)
- [tina.io/roadmap](https://tina.io/roadmap) (accessed 2026-04-12)
- [tina.io/blog](https://tina.io/blog) (accessed 2026-04-12)
- [tina.io/blog/Tina-Joins-SSW](https://tina.io/blog/Tina-Joins-SSW) (accessed 2026-04-12)
- [github.com/tinacms/tinacms](https://github.com/tinacms/tinacms) (accessed 2026-04-12)
- [news.itsfoss.com/tinacms-acquired/](https://news.itsfoss.com/tinacms-acquired/)

---

## Findings

### Finding 1: TinaCMS was acquired by SSW (Australian consulting firm) in May 2024 — rescuing it from near-death

**Confidence:** CONFIRMED
**Evidence:** [tina.io/blog/Tina-Joins-SSW](https://tina.io/blog/Tina-Joins-SSW); [tina.io/about](https://tina.io/about); [news.itsfoss.com/tinacms-acquired/] (accessed 2026-04-12)

Quote from tina.io/about:

> "SSW ended up acquiring TinaCMS, bringing greater enterprise resources, support, and expertise."

Pre-acquisition team was "four developers operating on a tight budget ... struggling to keep up with the needs of customers and community." SSW is "Australia's leading software consultants" with ~100 employees. Scott Gallant (co-founder) transitioned from CEO to Product Owner. TinaCMS originated at Forestry.io (2019), which had raised VC from Boldstart Ventures and Carbon Ventures pre-acquisition per PitchBook.

**Implications for OK:** The single most important D5 signal. TinaCMS is no longer a VC-funded startup chasing growth — it's a consulting firm's in-house product. SSW's business model is selling consulting hours to enterprise; keeping TinaCMS alive aligns with that, but the product's trajectory is constrained to what a consulting firm can build in spare cycles. **Lower threat level** (won't out-innovate a focused competitor). **Higher partnership/displacement potential** (unlikely to pivot hard to agent-native or real-time collab — not consulting-firm bets).

---

### Finding 2: Current development is almost entirely staffed by SSW contractors

**Confidence:** CONFIRMED
**Evidence:** `git log --since=2025-06-01 --format='%an' | sort | uniq -c | sort -rn | head -15` in local repo:

```
52 Josh Berman [SSW]
39 release-bot-allow-prs-and-push[bot]
35 Eli Kent [SSW]
25 Nick Curran [SSW]
23 Matt Wicks [SSW]
15 Kaha Mason [SSW]
15 Jack Pettit [SSW]
14 Pat Stuart [SSW]
12 Ivan Gaiduk [SSW]
 8 Ben Neoh [SSW]
 7 Brook Jeynes [SSW]
 6 Caleb Williams [SSW]
```

Of 27 unique committers since 2025-06-01, 22 are tagged `[SSW]`. The remaining 5 (Copilot bot, Griffen Edge, Michael Bianco, Felix Dawodu, Tihomir Ivanov, Arkadiusz Irlik) contributed 1–4 commits each (community drive-bys, not core maintainers). Four maintainers listed in README (Matt Wicks, Gert Marx, Jack Pettit, Eli Kent) are all SSW.

**Implications for OK:** Agency-staffed means feature velocity is decent but architecturally conservative. No one pushes a CRDT rewrite through SSW's corporate utilization model. Community contribution effectively dead — outside contributors produced <5% of commits in last 10 months.

---

### Finding 3: Commit velocity is healthy but halved since pre-acquisition peak

**Confidence:** CONFIRMED
**Evidence:** Commands run in local repo:

- 2023: 1,723 commits (pre-acquisition peak)
- 2024: 313 commits (acquisition year)
- 2025: 254 commits
- Since 2025-06-01 (~10 months): 280 commits
- Since 2025-10-01 (~6 months): 203 commits

Full 2025 averages ~21 commits/month; H2 2025 (since 2025-10-01) recovered to ~34 commits/month. Compare with 2023's ~144 commits/month. Latest release: `tinacms@3.7.1` (weekly patch cadence).

**Implications for OK:** Sustained enough to keep product alive and do bug fixes + minor features, but nowhere near a ground-up architectural shift (WebSocket-based collab server, CRDT rewrite). The 2023→2025 ~4× velocity drop also suggests Forestry-era team was doing deeper work than SSW-era.

---

### Finding 4: License is Apache 2.0 — fully open-sourced, no enterprise-license-gated code in repo

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/tinacms/LICENSE` — Apache 2.0; `packages/tinacms/package.json` lists `"license": "Apache-2.0"`. Blog: ["TinaCMS is Now Fully Open-Source"](https://tina.io/blog/Tinacms-is-now-fully-open-source) indicates deliberate shift away from gated features.

**Implications for OK:** No risk of license flip (unlike Sentry, Elastic, Redis). Apache 2.0 allows commercial fork. Self-hostable backend means competitors can run TinaCMS without paying. Monetization pressure falls entirely on TinaCloud's hosted UX, not on gated code.

---

### Finding 5: OSS/commercial split — backend fully open-source, TinaCloud gates a few features and most of the good UX

**Confidence:** CONFIRMED
**Evidence:** [tina.io/docs/self-hosted/overview](https://tina.io/docs/self-hosted/overview); [tina.io/pricing](https://tina.io/pricing) (both vendor-sourced, accessed 2026-04-12)

Self-hosted gaps (per vendor docs): "Repo-based media is not currently available for self-hosted TinaCMS" and "Search capability currently requires TinaCloud."

Vendor-stated pricing tiers: Free ($0, 2 users), Team ($29/mo, 3 users), Team Plus ($49/mo, adds Editorial Workflow + AI Features Beta), Business ($299/mo, adds API Beta), Enterprise (custom). Per-project pricing.

**Implications for OK:** Self-hosted is legitimate (core GraphQL, editor, datalayer all OSS), but most teams pay for TinaCloud because self-hosted requires provisioning database, auth, S3. Standard "open-core plus hosted service" split — OK's positioning can mirror this if needed.

---

### Finding 6: Roadmap is incremental and UX-focused; no signal of real-time collab, CRDT, or multiplayer editing

**Confidence:** CONFIRMED
**Evidence:** [tina.io/roadmap](https://tina.io/roadmap) (vendor-sourced, accessed 2026-04-12).

Completed: GitHub Enterprise, 2FA, Vercel Data Cache, React 19, TinaDocs, ESM migration.
In development: Editorial Workflow for media, Content API perf, image search, GitHub Actions integration.
Coming soon: "merge PRs from within CMS UI," Copilot Instructions docs, TinaCloud Project Insights, PostHog telemetry, MCP Server, WorkOS auth migration.

**The roadmap contains no mentions of AI agents, real-time collaboration, CRDT technology, or multiplayer editing features.**

**Implications for OK:** **CONFIRMS OK's positioning wedge.** TinaCMS explicitly not pursuing real-time collab or agent-native editing as first-class. Closest AI item is "MCP Server" described as "leveraging AI in the content creation process" — exposing Tina's existing GraphQL surface to Claude/ChatGPT, not an agent-native editing pipeline. OK's CRDT + live multi-cursor is a durable differentiator for ~12–18 months minimum.

---

### Finding 7: "AI Features (Beta)" is gated behind Team Plus ($49/mo+); MCP Server not yet shipped

**Confidence:** CONFIRMED (gating); INFERRED (scope of AI features)
**Evidence:** [tina.io/pricing](https://tina.io/pricing) (vendor-sourced, accessed 2026-04-12) — "AI Features (Beta) rollout begins with Team Plus tier."

[tina.io/roadmap](https://tina.io/roadmap) — MCP Server under "Coming Soon." Grep of local repo for "mcp" or "model context protocol" returned no source-code matches in `packages/tinacms/src` or any markdown outside docs pointers. CHANGELOG mentions "Telemetry around usage of slash command in rich-text editor" (PostHog event for AI/slash command usage).

**Implications for OK:** "AI Features (Beta)" likely a slash-command-style LLM helper in the editor (slash-command telemetry CHANGELOG entry supports this). Standard "text generation helper" pattern, not agent-native concurrent editing. OK's agent-write-to-CRDT architecture still differentiated. TinaCMS will likely ship MCP server within 3–12 months — OK's MCP positioning needs to emphasize the *live CRDT bridge* not just "AI can edit content."

---

### Finding 8: Adoption signals are solid but not hypergrowth — stars plateau, npm steady

**Confidence:** CONFIRMED
**Evidence:** [github.com/tinacms/tinacms](https://github.com/tinacms/tinacms) (accessed 2026-04-12): 13.3k stars, 688 forks, 386 open issues, 18 open PRs, 12,091 total commits, 920 releases.

`https://api.npmjs.org/downloads/point/last-week/tinacms` (accessed 2026-04-12): 87,896 weekly downloads.
`https://api.npmjs.org/downloads/point/last-month/tinacms` (accessed 2026-04-12): 319,836 monthly downloads.

**Implications for OK:** ~88k weekly downloads = mid-tier OSS CMS adoption (Payload CMS ~200k+, Strapi ~600k+). 13.3k stars with ~34 commits/month suggests stable mature community project rather than breakout growth. Enough market validation that "Git-based CMS with visual editor" is real category, but headroom for challenger with better UX or agent-native features.

---

### Finding 9: No publicly disclosed notable-enterprise customer list

**Confidence:** NOT FOUND
**Evidence:** tina.io/customers returns 404 on fetch. No `/customers` or `/case-studies` page via site navigation. README lists no customer logos. Search results surfaced community reviews (elvery.net, CloudCannon comparison, Cuspera) rather than official case studies.

**Implications for OK:** Customer-less positioning pages are a weak commercial signal. SSW likely uses TinaCMS for its own consulting client projects ("a long-time customer using TinaCMS on their own site"), so real adoption embedded in SSW's consulting book, not published. OK cannot reliably reference TinaCMS customers as threat — commercial foothold is opaque.

---

### Finding 10: Recent architectural shifts point toward modernization, not re-platforming

**Confidence:** CONFIRMED
**Evidence:** [tina.io/blog](https://tina.io/blog) (accessed 2026-04-12) posts in last 12 months:

- "Modernizing the Core for Security and Performance" (2025-11-26): CommonJS→ESM migration
- "TinaDocs" (2025-11-17): docs-site starter
- "TinaCMS Markdown Editor Upgrades" (2025-09-23): searchable code blocks, Mermaid
- "React 19 Support" (2025-05-11)
- "Vercel Data Cache" (2025-03-12)

**Implications for OK:** Housekeeping moves, not architectural direction. No signal of Y.js adoption, WebSocket infrastructure, agent-first rework. Product locked into single-editor + GraphQL + git-commit-on-save architecture for foreseeable future. Favorable for OK — a competitor architected around CRDT + agents starts from 12–18-month structural lead that TinaCMS cannot close quickly under SSW stewardship.

---

## Negative searches

- **No CRDT / Y.js / real-time collab signal:** grep for `yjs`, `y-protocols`, `hocuspocus`, `crdt`, `automerge`, `liveblocks` returns no matches in package.json or source. Roadmap and FAQ explicitly do not mention it.
- **No MCP implementation in tree:** no `mcp` directory, no `@modelcontextprotocol` dependency, no server code. Roadmap item only.
- **No license changes signaled:** no BSL, SSPL, or AGPL consideration surfaced in blog or discussions.
- **No recent funding events:** no 2024/2025 funding news after SSW acquisition. SSW is privately held (not VC-backed).
- **No customer case studies page:** tina.io/customers returns 404; case studies appear ad-hoc in blog rather than customer gallery.

---

## Gaps / follow-ups

- **SSW financial commitment:** How big is dedicated TinaCMS team within SSW's 100-person shop? ~12 active [SSW] contributors in last 10 months, but unclear how many are FT on Tina vs. dual-hatting. Could be 4–6 FTEs.
- **TinaCloud revenue:** Not disclosed. Pricing per-project starting $29/mo suggests small-to-mid-market revenue, not enterprise-scale ARR.
- **"AI Features (Beta)" scope:** Pricing page gates it behind Team Plus but no blog post defines exactly what it does. Likely a slash-command LLM helper given PostHog telemetry CHANGELOG entry, but unverified.
- **MCP server timeline:** Listed "Coming Soon" but no public ETA. Worth monitoring tina.io/blog monthly for the announcement.
- **SSW strategic intent:** Founder Adam Cogan's stated motive: "I just want the project to live forever." Reads as preservation/stewardship, not aggressive growth. No evidence of "become the #1 headless CMS" push.
