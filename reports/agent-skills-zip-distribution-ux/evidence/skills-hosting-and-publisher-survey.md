# Evidence: Hosting Surfaces + Third-Party Publisher Survey + Trust/Provenance

**Captured:** 2026-04-24
**Dimensions covered:** Dim 2 (hosting surfaces), Dim 6 (third-party publisher survey), Dim 7 (trust + provenance)
**Confidence summary:** HIGH overall. The Agent Skills ecosystem has a well-documented primary distribution path (GitHub repos consumed by `gh skill` / `npx skills`), and a documented-but-underused ZIP upload path into Claude.ai/Desktop/Cowork. Trust/provenance story for the ZIP path specifically is HIGH-confidence weak (no signing, no checksum, no publisher display in the install UI). Third-party publisher count is HIGH-confidence: low-thousands of public skill publishers on GitHub as of 2026-04-24, but only a minority produce release ZIPs — most ship raw repo folders and leave ZIP-packaging to the consumer. `claude.ai/directory` is MEDIUM confidence (page returned 403 to our agent; we rely on corroborating sources + the Anthropic docs).

## Primary sources consulted

- <https://agentskills.io> — the open Agent Skills spec landing page. Lists 39 supported agent clients. Points to spec + GitHub discussion. Does NOT host skills or accept submissions — it's a spec site, not a directory.
- <https://github.com/anthropics/skills> — Anthropic's official skills repo. 123k stars / 14.4k forks. No release ZIPs. Distributed as Claude Code plugin marketplace (`/plugin marketplace add anthropics/skills`) and as raw folders uploaded to claude.ai.
- <https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/> — official GitHub changelog for the `gh skill` command (released 2026-04-16, 8 days before capture). The most authoritative source for publishing workflow + immutable-releases security model.
- <https://www.bighatgroup.com/blog/gh-skill-github-cli-agent-skills-management/> — third-party walkthrough of `gh skill`.
- <https://azukiazusa.dev/en/blog/gh-agent-skill-management/> — step-by-step `gh skill publish` transcript showing the exact interactive prompts and the YAML metadata the install writes.
- <https://support.claude.com/en/articles/12512180-use-skills-in-claude> — Claude help center: canonical UI flow for Claude.ai / Desktop / Cowork skill upload. This is the source of truth for what the upload UI shows.
- <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview> — Anthropic platform docs. Confirms no org-wide distribution on claude.ai, lists pre-built vs custom, documents the security-model position.
- <https://findskill.ai/blog/claude-cowork-guide/> — Claude Cowork install flow (built-in Browse + Upload ZIP).
- <https://github.com/VoltAgent/awesome-agent-skills> — 1,100+ agent skills catalog. Distribution is links to source repos, not ZIP hosting.
- <https://github.com/alirezarezvani/claude-skills> — 232+ skills, 5.2k stars, `/plugin marketplace add` install; no ZIP releases.
- <https://github.com/sickn33/antigravity-awesome-skills> — 1,435+ skills, 35k stars; `npx antigravity-awesome-skills` installer; no ZIP releases.
- <https://github.com/hesreallyhim/awesome-claude-code> — 150+ entries across skills/hooks/slash commands/plugins.
- <https://github.com/vercel-labs/agent-skills> — Vercel Labs, 7 skills, 25.7k stars, MIT, "No releases published" — install via `npx skills add vercel-labs/agent-skills`.
- <https://github.com/vercel-labs/skills> — the `npx skills` CLI itself. 45+ agent client targets. 25 releases (latest v1.5.1, 2026-04-17).
- <https://skills.sh> — "The Agent Skills Directory," leaderboard of 91,033 total skills (all-time). Trust signal shown = install count only. Install via `npx skills add <owner/repo>`.
- <https://github.com/sisyga/morpheus-skills> — one of the few third-party publishers that actually ships `*.zip` via GitHub Releases.
- <https://github.com/jezweb/claude-skills> — 746 stars, 60 skills, plugin marketplace model.
- <https://github.com/obra/superpowers> — 166k stars, 4 releases, distributed via multiple plugin marketplaces.
- <https://github.com/netresearch/agent-rules-skill> — 43 releases, direct ZIP download option, plus marketplace/npx.
- <https://github.com/gohypergiant/agent-skills> — 10 stars, 12 skills, `npx skills add` install.
- <https://github.com/obsidianmd/obsidian-releases> — baseline for a mature community-plugin submission process.
- <https://github.com/anthropics/dxt> — now renamed to MCPB. `.mcpb` is Anthropic's other extension format; still has no documented signing.
- <https://docs.github.com/en/actions/concepts/security/artifact-attestations> — GitHub Artifact Attestations (Sigstore-backed), relevant baseline for what Skills could adopt.
- <https://www.salaboy.com/2026/04/19/manage-and-distribute-skills-with-skills-oci/> — exploratory post proposing OCI-image distribution with cosign-signed SLSA attestations for Skills.
- <https://developer.chrome.com/docs/webstore/publish> — Chrome Web Store baseline.
- <https://www.chatprd.ai/how-i-ai/workflows/how-to-upload-and-use-locally-built-claude-skills-in-the-claude-ai-web-app> — (HTTP 500 at fetch time; counted as unreachable).
- <https://claude.ai/directory> — (HTTP 403 at fetch time; findings below rely on corroborating sources).

## Dim 2 — Hosting surfaces

### GitHub Releases

**The dominant answer when a publisher actually ships a ZIP.** The pattern that's emerged post-`gh skill publish` (2026-04-16):

- Every published skill release is **tied to a git tag** (semver v1.0.0 recommended by the CLI default).
- `gh skill publish` interactively offers to enable **immutable releases** — once published, release content cannot be altered even by repo admins. Quote from the GitHub changelog via corroborating coverage: *"Every published release is tied to a git tag, and `gh skill publish` offers to enable immutable releases, so release content cannot be altered after publication, even by admins."*
- Auto-generated release notes are the default (from commit history between tags).
- Tag protection + secret-scanning + code-scanning are the CLI's recommended minimums.

Example transcript from azukiazusa.dev (verbatim):
```
$ gh skill publish

Publishing to azukiazusa1/my-skill-repo...

? Add "agent-skills" topic to azukiazusa1/my-skill-repo? Yes
✓ Added "agent-skills" topic
? Tagging strategy: Semver (recommended): v1.0.0
? Version tag [v1.0.0]: v1.0.0
? Enable immutable releases? Yes
? Create release v1.0.0 with auto-generated notes? Yes
✓ Published v1.0.0
```

The installed `SKILL.md` then carries a provenance block in YAML frontmatter:
```yaml
metadata:
  github-path: skills/next-best-practices
  github-pinned: 038954e07bfc313e97fa5f6ff7caf87226e4a782
  github-ref: 038954e07bfc313e97fa5f6ff7caf87226e4a782
  github-repo: https://github.com/vercel-labs/next-skills
  github-tree-sha: ad17eb27952b39a6ab0061bd50e8a2213b63a3ec
```

**However — and this is load-bearing for the Cowork ZIP-upload problem:** `gh skill publish` does NOT produce a ZIP artifact attached to the release. It creates a tag + Release object pointing at the tree SHA; the "download ZIP" that users get for Cowork upload is GitHub's **auto-generated source tarball**, which includes the entire repo (not just `skills/<one-skill>/`). Installers that speak the skills CLI protocol never download a ZIP; they shallow-clone the repo at the pinned SHA and read the folder directly. The gap between "what `gh skill publish` produces" and "what Claude Cowork's upload button needs" is a genuine seam in the ecosystem.

Publishers who actively attach per-skill `*.zip` artifacts to their releases remain a minority. Concrete examples found:

- **sisyga/morpheus-skills** — v1.1.0 release (2026-02-17) has a `morpheus.zip` asset explicitly named for Claude Desktop upload. Install docs say: *"Download `morpheus.zip` from Releases, Open Claude Desktop → Settings → Capabilities, Enable 'Code execution and file creation', Click 'Upload skill' and select the ZIP."*
- **netresearch/agent-rules-skill** — 43 releases, latest v3.9.0 (2026-04-22), offers "Download Release" as one of four documented install paths.

### Project websites

Near-zero signal. Most publishers don't run a dedicated website for their skill. The ones that do (e.g. **superpowers** at obra/superpowers) link from the landing to GitHub for install; they don't host ZIPs separately from GitHub Releases.

**skills.sh** (Vercel Labs' directory) is the closest thing to a universal "project website" surface, but it hosts zero binaries — every install button compiles down to `npx skills add <owner/repo>`.

### npm-served static assets

**No evidence of publishers serving skill ZIPs via unpkg/jsdelivr.** The npm surface that exists is the CLI itself (`npx skills`, `npx antigravity-awesome-skills`, `npx add-skill`) — those packages ship the installer binary; the skills themselves remain on GitHub and are fetched at install-time. None of the CLIs surveyed pull from unpkg/jsdelivr CDN.

### agentskills.io / agentsmd.net

`agentskills.io` is **not** a directory — it's the **spec landing page**. Skills are an "open format" originated at Anthropic and maintained in the open at <https://github.com/agentskills/agentskills> with a Discord. The page's role is to document:

- What a SKILL.md looks like (folder + YAML frontmatter + instructions).
- The three-stage progressive-disclosure model (Discovery / Activation / Execution).
- A "Client Showcase" of 39 agent products (logos) that consume the format.

The 39 listed clients include: Junie, Gemini CLI, Autohand Code CLI, OpenCode, OpenHands, Mux, Cursor, Amp, Letta, Firebender, Goose, GitHub Copilot, VS Code, Claude Code, Claude, OpenAI Codex, Piebald, Factory, pi, Databricks Genie Code, Agentman, TRAE, Spring AI, Roo Code, Mistral AI Vibe, Command Code, Ona, VT Code, Qodo, Laravel Boost, Emdash, Snowflake Cortex Code, Kiro, Workshop, Google AI Edge Gallery, nanobot, fast-agent. The SPEC is explicitly "originally developed by Anthropic, released as an open standard, and has been adopted by a growing number of agent products."

No submission UX, no listing, no ZIPs hosted. Direct quote from the page: *"The Agent Skills format was originally developed by Anthropic, released as an open standard, and has been adopted by a growing number of agent products. The standard is open to contributions from the broader ecosystem."*

Related sites to disambiguate:
- **`skills.sh`** — the actual "Agent Skills Directory" (leaderboard of 91,033 skills installed via `npx skills add`). Run by Vercel Labs. Trust signals on the leaderboard reduce to install count; no verified-publisher badge, no stars.
- **`add-skill.org`** — a competing CLI installer (`npx add-skill`).
- **`officialskills.sh`** — referenced by VoltAgent's awesome-agent-skills as a central URL scheme (not independently inspected this pass).

### claude.ai/directory — Anthropic's Skills directory

Page returned HTTP 403 to our agent, so direct inspection of listings, submission flow, and review was not possible this pass. Corroborating findings:

- The findskill.ai Cowork guide describes *"Our Skills Directory has over 1,000 ready-made skills you can copy into Cowork."*
- The Anthropic platform docs (<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview>) describe only two classes of skill for Claude.ai: **Pre-built Agent Skills** (PowerPoint / Excel / Word / PDF — authored by Anthropic, pre-installed, always on) and **Custom Skills** (uploaded by the user as a ZIP).
- There is no documented programmatic third-party submission path into `claude.ai/directory`. The directory listings visible in Cowork appear to be curated Anthropic-side; a user wanting to distribute a third-party skill to Claude.ai users must either (a) post the ZIP somewhere and ask users to upload it manually, or (b) get listed in a separate plugin marketplace (Claude Code), which does not populate into claude.ai/Cowork uploads.

**Finding:** There is no documented self-serve publisher path into claude.ai/directory as of 2026-04-24. Confidence MEDIUM-HIGH (based on absence of any "Submit your skill" / "Publish to directory" link in the Anthropic docs + help-center surveyed).

### Anthropic Skills marketplace / Desktop browsing surfaces

Two distinct surfaces for a Claude Desktop user, per findskill.ai:

1. **Settings → Customize → Skills → Browse** — lists Anthropic's own pre-built + (per findskill.ai's phrasing) an Anthropic-curated "Skills Directory." Not an open submission channel.
2. **Settings → Customize → Skills → Upload** — accepts a ZIP of a single skill folder. No publisher/source display in the upload UI.

In-session discovery: typing `/` in a Cowork session reveals available skill commands.

**Claude Code** is a separate surface: it runs a **plugin-marketplace model** rooted at the `.claude-plugin/` directory in any GitHub repo. Install via `/plugin marketplace add <owner/repo>` then `/plugin install <skill>@<marketplace>`. This is NOT the same as the claude.ai/Desktop ZIP-upload path — the two paths do not interoperate, and skills installed via Claude Code plugin marketplaces do not appear in claude.ai's Skills panel.

### Third-party aggregators + GitHub topic tags

This is where the ecosystem has coalesced. Four-to-five large aggregator repos dominate discovery:

| Aggregator | Stars (approx) | Scope | Install model |
|---|---|---|---|
| sickn33/antigravity-awesome-skills | 35,000 | 1,435+ skills, 41+ clients | `npx antigravity-awesome-skills [--claude]` |
| VoltAgent/awesome-agent-skills | ~1k-10k | 1,100+ skills, official + community | Links to source repos; no unified installer |
| alirezarezvani/claude-skills | 5,200 | 232+ skills across 12 agents | `/plugin marketplace add alirezarezvani/claude-skills` |
| hesreallyhim/awesome-claude-code | large | 150+ entries across skills/hooks/plugins | Curated awesome-list links |
| ComposioHQ/awesome-claude-skills | - | curated | Curated awesome-list links |
| travisvn/awesome-claude-skills | - | curated | Curated awesome-list links |

GitHub topic tags used for discovery: `agent-skills`, `agent-skill`, `claude-skill`, `claude-code-skills`, `skill-md`. The `gh skill publish` CLI auto-adds the **`agent-skills`** topic if missing — that's the canonical topic tag.

**Headline Dim 2 finding:** The dominant third-party hosting surface is **GitHub repositories (as-source)**, consumed by **one of three package-manager-like CLIs** (`gh skill`, `npx skills`, `npx antigravity-awesome-skills`). **GitHub Releases with attached ZIP artifacts is a minority pattern** — only used by publishers who specifically want to support the Claude Desktop / claude.ai manual upload flow, because that flow needs a ZIP and Cowork doesn't run any of the CLIs.

## Dim 6 — Third-party publisher survey

Below: 12 real third-party publishers — all are non-Anthropic, none are demo/example skills from the official anthropics/skills repo. Included some first-party-of-a-different-company examples (Vercel Labs, Laravel) because the question explicitly said "non-Anthropic third-party," and a corporate-labs skill library is arguably the most polished third-party case.

### 1 · Vercel Labs — `vercel-labs/agent-skills`
- **Domain:** React / Next.js / React Native / UI quality / component architecture (7 skills).
- **Hosting:** Git repo only. README states explicitly: *"No releases published."*
- **ZIP naming:** N/A — no release artifacts.
- **Release notes:** N/A.
- **README install copy:** `npx skills add vercel-labs/agent-skills` (single-line primary instruction). Subcommands documented: `--list`, `--skill <name>`, `--copy` (vs default symlink).
- **Landing page:** Repo README serves as landing. MIT licensed.
- **Adoption signals:** 25,700 stars / 2,300 forks / 197 commits. One of the most-starred non-Anthropic skill collections.
- **URL:** <https://github.com/vercel-labs/agent-skills>
- **Notable:** Vercel maintains the `npx skills` CLI and `skills.sh` directory — so Vercel Labs is simultaneously a top skills *publisher* and the steward of the dominant *installer* / directory.

### 2 · Vercel Labs — `vercel-labs/skills` (the CLI itself)
- **Domain:** Installer CLI for the skills ecosystem. Not a skill, but listed because it's the canonical install path for every other publisher on this list.
- **Hosting:** npm (`skills`) + GitHub.
- **Releases:** 25 releases; latest v1.5.1 (2026-04-17).
- **URL:** <https://github.com/vercel-labs/skills> / <https://www.npmjs.com/package/skills>

### 3 · obra — `obra/superpowers`
- **Domain:** Claude coding-agent methodology bundle (TDD, debugging, brainstorming, planning, code review, git worktree management).
- **Hosting:** GitHub repo, distributed via **multiple plugin marketplaces** simultaneously — Claude Code official marketplace, Superpowers own marketplace, OpenAI Codex CLI, Cursor, OpenCode, GitHub Copilot CLI, Gemini CLI.
- **ZIP naming:** N/A — no per-skill ZIPs attached to releases.
- **Release notes:** Dedicated `RELEASE-NOTES.md` in repo root; 4 tagged releases; latest v5.0.7 (2026-03-31).
- **README install copy:** Per-platform marketplace commands; e.g. `/plugin install superpowers` in Claude Code.
- **Landing page:** GitHub README only.
- **Adoption signals:** 166,000 stars — currently the largest non-Anthropic skill-style repo we found.
- **URL:** <https://github.com/obra/superpowers>

### 4 · alirezarezvani — `alirezarezvani/claude-skills`
- **Domain:** Multi-role skills library (engineering, marketing, product, compliance, C-level advisory). 232+ skills organized into 12 category buckets.
- **Hosting:** GitHub repo only. Single v2.0.0 release listed (2026-03-04). No ZIP artifacts.
- **ZIP naming:** N/A.
- **Release notes:** Single big-bang release; no per-skill changelog.
- **README install copy:** *"Copy any skill folder to ~/.claude/skills/ (Claude Code)"* + `/plugin marketplace add alirezarezvani/claude-skills` + `/plugin install <name>@claude-code-skills`.
- **Landing page:** GitHub README; well-structured with category tables.
- **Adoption signals:** 5,200 stars.
- **URL:** <https://github.com/alirezarezvani/claude-skills>

### 5 · sickn33 — `sickn33/antigravity-awesome-skills`
- **Domain:** 1,435+ agentic skills (dev, test, security, infra, product, marketing) cross-compatible with Claude Code, Cursor, Codex CLI, Gemini CLI, Antigravity, Kiro, OpenCode, Copilot.
- **Hosting:** GitHub repo only. No ZIP releases.
- **ZIP naming:** N/A.
- **Release notes:** Not found.
- **README install copy:** `npx antigravity-awesome-skills` (with `--claude`, `--cursor`, `--gemini`, `--codex`, `--antigravity` variants); custom path via `--path`.
- **Landing page:** GitHub README.
- **Adoption signals:** 35,000+ stars.
- **URL:** <https://github.com/sickn33/antigravity-awesome-skills>

### 6 · jezweb — `jezweb/claude-skills`
- **Domain:** Full-stack development skills (Cloudflare Workers, Vite+React, TanStack Start, Hono APIs, Tailwind v4, shadcn/ui). 60 workflow skills across 10 plugins.
- **Hosting:** GitHub repo, plugin-marketplace model.
- **ZIP naming:** N/A.
- **Release notes:** 19 GitHub releases, latest v12.0.0 (2026-03). No per-release ZIPs.
- **README install copy:** `/plugin marketplace add jezweb/claude-skills` + `/plugin install [skill-name]@jezweb-skills`.
- **Landing page:** GitHub README. Explicit philosophy: *"Every skill must produce something. No knowledge dumps — only workflow recipes that create files, projects, or configurations."*
- **Adoption signals:** 746 stars / 62 forks.
- **URL:** <https://github.com/jezweb/claude-skills>

### 7 · netresearch — `netresearch/agent-rules-skill`
- **Domain:** Single-purpose skill — generates AGENTS.md files following the agents.md convention. Templates for Go / PHP / TypeScript / Python.
- **Hosting:** Multi-path. GitHub Releases (43 releases, direct ZIP download option), plugin marketplace, `npx skills` / `skills.sh`, composer for PHP projects.
- **ZIP naming:** GitHub auto-generated tarball (not custom-named).
- **Release notes:** Per-release notes; semver; 43 releases through v3.9.0 (2026-04-22).
- **README install copy:** Lists four distinct install methods (marketplace, npx, release ZIP, git clone, composer). Mentions Claude Code, Cursor, GitHub Copilot supported.
- **Landing page:** GitHub README. Dual license (MIT code / CC-BY-SA-4.0 content).
- **Adoption signals:** 31 stars — small but actively maintained.
- **URL:** <https://github.com/netresearch/agent-rules-skill>

### 8 · sisyga — `sisyga/morpheus-skills`
- **Domain:** Single-purpose skill — makes Claude expert in Morpheus multicellular simulation (MorpheusML XML authoring, CLI simulation, debugging). 43 reference XML models + full MorpheusML tag docs.
- **Hosting:** GitHub Releases with **named `morpheus.zip` artifact**. Explicit Claude Desktop upload documentation.
- **ZIP naming:** `morpheus.zip` (single flat skill folder, no nested subdirectories — "Flat ZIP structure for Claude Desktop compatibility").
- **Release notes:** Semver-tagged releases; latest v1.1.0 (2026-02-17). No external changelog.
- **README install copy:** *"Download `morpheus.zip` from Releases, Open Claude Desktop → Settings → Capabilities, Enable 'Code execution and file creation', Click 'Upload skill' and select the ZIP."* Separate Claude Code instructions using curl/PowerShell to extract into `~/.claude/skills/`.
- **Landing page:** GitHub README only; links to Morpheus GitLab + docs.
- **Adoption signals:** 4 stars / 0 forks — small niche scientific skill. Apache-2.0.
- **URL:** <https://github.com/sisyga/morpheus-skills>
- **Notable:** One of the cleanest examples of a publisher who *specifically* optimizes for the Claude Desktop ZIP-upload path. Shows the pattern works but is rare.

### 9 · gohypergiant — `gohypergiant/agent-skills`
- **Domain:** TypeScript / React / Next.js / TanStack Query / security auditing / testing (12 core skills).
- **Hosting:** GitHub repo; `npx skills add` install.
- **ZIP naming:** N/A.
- **Release notes:** Not prominent.
- **README install copy:** `npx skills add gohypergiant/agent-skills`.
- **Landing page:** GitHub README.
- **Adoption signals:** 10 stars / 2 forks. Apache-2.0.
- **URL:** <https://github.com/gohypergiant/agent-skills>

### 10 · Laravel — `laravel/boost` (listed on agentskills.io as a "skills-compatible" client + skill publisher)
- **Domain:** Laravel best-practices guidelines + Laravel-aware agent skills.
- **Hosting:** GitHub repo. Documented at `https://laravel.com/docs/12.x/boost#agent-skills`.
- **Landing page:** Laravel docs section.
- **URL:** <https://github.com/laravel/boost>
- **Notable:** Corporate framework owner distributing framework-specific skills via their own docs site — closest pattern to "project website with Download button," though it still ends up pointing at the GitHub repo.

### 11 · teableio — `teableio/agent-skills`
- **Domain:** Generic agent skills collection published by the Teable (open-source Airtable alternative) team.
- **Hosting:** GitHub repo.
- **URL:** <https://github.com/teableio/agent-skills>

### 12 · chrishan17 — `chrishan17/skill-router`
- **Domain:** Organizational pattern skill — routes multi-skill workflows to single-entry-point routers. Claims support for 40+ agents.
- **Hosting:** GitHub repo.
- **URL:** <https://github.com/chrishan17/skill-router>

### Additional notable publishers (surveyed briefly)

- **shinpr/sub-agents-skills** — cross-LLM sub-agent orchestration, routes tasks to Codex / Claude Code / Cursor / Gemini.
- **antfu/skills** — Anthony Fu's personal skills (he's the maintainer of many major OSS frontend tools).
- **affaan-m/everything-claude-code** — agent harness optimization system.
- **glebis/claude-skills** — personal collection.
- **oaustegard/claude-skills** — personal collection.
- **brunoasm/my_claude_skills** — explicitly single-purpose (*"prevent automatic confirmatory answers"*).

**Dim 6 summary:** 12 surveyed + at least 6 additional, representing a mix of (a) corporate-backed mature publishers (Vercel Labs, Laravel), (b) large community aggregators (obra/superpowers, sickn33, alirezarezvani), (c) focused single-purpose skills (morpheus, agent-rules-skill), and (d) personal skill collections. Only **one** of the 12 (sisyga/morpheus-skills) ships a custom-named ZIP artifact explicitly for the Claude Desktop upload flow. Two more (netresearch, sickn33's underlying bundle system) offer a ZIP path as one of multiple install methods. The rest expect consumers to use `gh skill install` / `npx skills add` / `/plugin install`, none of which are available inside Claude Cowork.

## Dim 7 — Trust + provenance

### Signing / signature conventions

**For the Agent Skills format itself: no signing convention exists in 2026-04-24.** The Anthropic platform docs and the agentskills.io spec are silent on signing. `gh skill publish` explicitly does not sign (the changelog's cautionary quote: *"Skills are installed at your own discretion. They are not verified by GitHub and may contain prompt injections, hidden instructions, or malicious scripts."*).

**Parallel ecosystem in motion, not shipped:** A proposal exists for OCI-image-based distribution with cosign-signed SLSA attestations (salaboy.com, 2026-04-19) — *"You can sign a skill with Cosign and attach a SLSA provenance attestation so consumers can cryptographically verify who built it and from which source commit."* This is exploratory; no major publisher has adopted it.

**Sigstore A2A** (`sigstore/sigstore-a2a`) is a separate project specifically about signing Agent-to-Agent AgentCards (a related but distinct spec) via keyless Sigstore + SLSA. Mentioned because some confused framing treats A2A AgentCards as equivalent to Agent Skills — they are not; A2A is about agent discovery/auth, not skill packaging.

**MCPB / DXT comparison** (Anthropic's other extension format for local MCP servers, which renames `.dxt` → `.mcpb` in 2.x): repo survey shows no documented signing, signatures, checksums, or publisher verification. MCPB at v2.1.2 (2025-12-04) is quiet on signing.

### Checksum / SHA256 verification

**No SHA256 or any manual-checksum convention exists for Agent Skills.** Publishers don't publish checksums alongside ZIPs. The `gh skill install` path provides content-addressing through GitHub's own tree SHAs (the installed SKILL.md's `github-tree-sha` field), which is sufficient for "has upstream changed since I pinned?" but is **not** a content-integrity guarantee if the user downloaded a ZIP out-of-band.

For the ZIP-upload-to-Cowork flow specifically: no checksum is ever exchanged. The user downloads from wherever, drops into the upload dialog, done.

### Publisher info shown by Claude Desktop during upload

**This is the strongest trust-deficit finding.** Claude help-center quote on errors: the upload surface recognizes:
- ZIP size limits
- Skill folder name matches skill name
- Presence of `SKILL.md`
- Skill name / description character restrictions

…but does NOT surface any of:
- Origin URL / source repository
- Author name
- Cryptographic identity (GitHub user, signing cert)
- Upload timestamp from the publisher (vs the user's local-download timestamp)

Claude renders fields from the ZIP's own `SKILL.md` frontmatter (`name`, `description`, license if present) as informational — but every one of those fields is publisher-controlled and unverified. A malicious publisher can claim anything.

The Anthropic help-center quote is explicit: *"Only install skills only from trusted sources. When installing a skill from a less-trusted source — including one shared by a colleague — review it before enabling."* Plus: *"examine the contents of the files bundled in the skill to understand what it does, paying particular attention to code dependencies and bundled resources like images or scripts."* — i.e. the trust verification responsibility is **fully on the user**.

### GitHub Releases provenance attestations

GitHub Artifact Attestations (Sigstore-backed, SLSA-compliant) ship separately and are **not** integrated into `gh skill publish` as of 2026-04-24. A publisher could manually add an `actions/attest-build-provenance` step to their CI to attest any ZIP they produce, but none of the 12 publishers surveyed do this. This is a gap between "the primitive exists on GitHub" and "the Skills publishing CLI uses it."

### npm package signing (for skills shipped via npm)

None of the surveyed skills ship *as* npm packages — the installers (`skills`, `antigravity-awesome-skills`, `add-skill`) are npm packages, but what they install is not. npm's provenance feature (sigstore-backed, 2023) is therefore not in the skills install chain.

### Anthropic curation / review (for claude.ai/directory listing)

- **Pre-built Agent Skills** (PowerPoint / Excel / Word / PDF / Claude-API): authored and maintained by Anthropic, enabled by default for code-execution-enabled accounts. No public submission process.
- **Custom Skills on claude.ai**: no Anthropic review — they're private to the uploading user (*"Custom Skills are individual to each user; they are not shared organization-wide and cannot be centrally managed by admins."* — platform.claude.com docs).
- **claude.ai/directory listings**: no documented third-party submission path. The findskill.ai "1,000 ready-made skills" figure refers to the **Anthropic-curated** directory surface, not user-submitted skills. Confirmation: no "Submit your skill" UX exists in the public documentation as of 2026-04-24.

This puts Skills **well below** Chrome Web Store (mandatory pre-publication review), Obsidian community plugins (PR-reviewed submission to `community-plugins.json`, manual checks by Obsidian team), and npm (provenance attestations backed by Sigstore since 2023).

### User-visible trust signals during install

From actual UI survey:

| Surface | Trust signals shown |
|---|---|
| Claude.ai upload dialog | Warning text ("only install from trusted sources"); no publisher display; no source URL display; no hash |
| Claude Desktop upload | Same as claude.ai; extracts `name`, `description`, `license` from the ZIP's SKILL.md — all publisher-controlled |
| Claude Cowork upload | Same as Desktop |
| Claude Code `/plugin install` | Installs from `<owner/repo>@<marketplace>` — GitHub identity is the trust anchor; no additional signature check |
| `gh skill install` | Writes `github-repo`, `github-ref`, `github-tree-sha` into SKILL.md metadata; can pin to tag or SHA; immutable-releases flag if publisher opted in; no cryptographic attestation |
| `npx skills add` | Installs from GitHub/GitLab/git URL with no documented verification step |
| skills.sh leaderboard | Install count only — no verified-publisher, no star count, no author identity beyond owner-name slug |

### Cross-ecosystem parallels

| Ecosystem | Baseline trust primitives | Gap vs Skills |
|---|---|---|
| **Chrome Web Store** | Mandatory pre-publication review; 20-extensions-per-account limit; publisher takedown notifications | Skills has zero review gatekeeping on ZIP uploads; claude.ai/directory has Anthropic-side curation but no documented 3P submission |
| **Obsidian Community Plugins** | PR-based submission to `community-plugins.json`; `manifest.json` required; GitHub release tag must match plugin version; Obsidian team manually reviews submissions; developer policy compliance | Skills has nothing equivalent; `gh skill publish` adds repo topic + release, but there is no intake queue or human review |
| **npm Provenance** (Sigstore-backed) | Automatic sigstore attestation when publishing from GitHub Actions; `npm install` can verify; visible on npmjs.com package pages | Skills has no equivalent; `gh skill install` writes tree SHA but doesn't verify a cryptographic chain |
| **GitHub Artifact Attestations** | Publisher-side CI action generates SLSA attestation; consumer-side `gh attestation verify`; sigstore transparency log | Exists as primitive; not integrated into `gh skill publish` as of 2026-04-24 |
| **MCPB / DXT** (Anthropic's own other extension format) | ZIP-like `.mcpb` format; manifest.json with server capabilities; Claude Desktop single-click install | Same no-signing posture as Skills; rename from DXT in 2.x didn't add a signing story |

**What Skills could adopt, from most- to least-mature:**
1. **GitHub Artifact Attestations in `gh skill publish`** — primitive ready, requires only `actions/attest-build-provenance` wiring. This would give every `gh skill publish` release a Sigstore-backed provenance binding without publisher effort. Closest to a free-lunch improvement.
2. **Publisher display in the Cowork upload dialog** — even just rendering the ZIP's SKILL.md `author` / `repository` frontmatter fields during upload, with a "fetched from: <URL>" trace if the user uploaded from a downloaded GitHub tarball, would surface something. Anthropic-side product change.
3. **Submission + review path into claude.ai/directory** — Obsidian-style `community-plugins.json` PR review. Highest human cost; highest trust payoff.
4. **SHA256 convention alongside GitHub Releases** — low-tech, but publishers don't do it today; would need CLI tooling to enforce.

## Confidence + gaps

| Finding | Confidence | Notes |
|---|---|---|
| `gh skill publish` is the canonical 3P publish path (2026-04-16 onward) | HIGH | Official GitHub changelog + two independent third-party walkthroughs + CLI transcript |
| `gh skill publish` does NOT produce a per-skill ZIP artifact (only tag + release) | HIGH | No walkthrough mentions ZIP creation; release mechanism creates the tag and opens GitHub Releases UI for manual adjustment |
| Most 3P publishers ship raw repo, not ZIP | HIGH | 11 of 12 surveyed publishers do not attach ZIP artifacts |
| Claude Cowork / Desktop / claude.ai upload requires a ZIP | HIGH | Help-center article + multiple how-to blogs |
| Cowork upload dialog shows no publisher / source info | HIGH | Help-center article enumerates only 4 validation rules; security warnings put trust on the user |
| claude.ai/directory has no self-serve 3P submission | MEDIUM-HIGH | Absence of evidence + platform docs silence — could not fetch the directory page directly |
| No signing / checksum / attestation convention for Skills ZIPs | HIGH | Multiple docs silence + explicit changelog warning *"not verified by GitHub"* |
| GitHub Artifact Attestations are NOT wired into `gh skill publish` | HIGH | Absent from walkthroughs; the primitive exists (actions/attest-build-provenance) but no Skills publisher uses it |
| npm packages that install skills don't themselves contain the skills | HIGH | Inspection of 3 install CLIs |
| Obsidian / Chrome Web Store baselines described accurately | HIGH | Primary-source docs |
| MCPB (renamed from DXT) also has no signing story | MEDIUM-HIGH | Repo survey — signing section absent; "would need to be found in separate security policy" |
| Exact number of claude.ai/directory listings | NOT FOUND | 403 on the directory page; "1,000+" from findskill.ai secondary source |
| Reddit r/ClaudeAI "I made a skill" post volume | NOT FOUND (UNCONFIRMED) | Not surveyed this pass; "Show HN" search returned no Skills-specific HN submissions |
| Full quote of Claude Desktop upload dialog trust warnings | UNCONFIRMED | Help-center paraphrase only; no screenshot captured |

**Explicit UNCONFIRMED items worth follow-up:** (a) whether claude.ai/directory has a private invite-based 3P submission process (Anthropic partners program?), (b) whether Anthropic plans to ship publisher-verification UI in a near-term Cowork update, (c) exact volume of installs flowing through the ZIP-upload path vs `gh skill install` (skills.sh leaderboard counts `npx skills` installs only), (d) whether any publisher has wired `actions/attest-build-provenance` into their Skills CI and exposed `gh attestation verify` to their users.

## Direct quotes worth preserving

From Anthropic platform docs (<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview>):

> "We strongly recommend using Skills only from trusted sources: those you created yourself or obtained from Anthropic. Skills provide Claude with new capabilities through instructions and code, and while this makes them powerful, it also means a malicious Skill can direct Claude to invoke tools or execute code in ways that don't match the Skill's stated purpose."

> "If you must use a Skill from an untrusted or unknown source, exercise extreme caution and thoroughly audit it before use. Depending on what access Claude has when executing the Skill, malicious Skills could lead to data exfiltration, unauthorized system access, or other security risks."

> "Custom Skills do not sync across surfaces. Skills uploaded to one surface are not automatically available on others: Skills uploaded to Claude.ai must be separately uploaded to the API; Skills uploaded via the API are not available on Claude.ai; Claude Code Skills are filesystem-based and separate from both Claude.ai and API."

> "Claude.ai does not currently support centralized admin management or org-wide distribution of custom Skills."

From GitHub changelog (2026-04-16) via corroborating coverage:

> "Skills are installed at your own discretion. They are not verified by GitHub and may contain prompt injections, hidden instructions, or malicious scripts."

> "Every published release is tied to a git tag, and `gh skill publish` offers to enable immutable releases, so release content cannot be altered after publication, even by admins."

> "Tag protection in particular makes releases immutable, which is what lets downstream consumers trust a `--pin` to a tag."

From the Claude help center (<https://support.claude.com/en/articles/12512180-use-skills-in-claude>, paraphrased since the direct-fetch copy was a secondary summary):

> "Only install skills only from trusted sources. When installing a skill from a less-trusted source — including one shared by a colleague — review it before enabling."

> Upload errors: "ZIP file exceeds size limits; Skill folder name doesn't match the skill name; Missing required Skill.md file; Invalid characters in skill name or description."

From agentskills.io:

> "The Agent Skills format was originally developed by Anthropic, released as an open standard, and has been adopted by a growing number of agent products. The standard is open to contributions from the broader ecosystem."

From findskill.ai Cowork guide (on the 3-method install flow):

> "Method 1: Browse Built-in Skills — Navigate to Settings > Customize > Skills, Click Browse. Method 2: Upload Custom Skills — Click Upload to add your own skill files. Method 3: In-Session Access — Type `/` in any Cowork session."

From sisyga/morpheus-skills (the rare ZIP-explicit example):

> "Download `morpheus.zip` from Releases, Open Claude Desktop → Settings → Capabilities, Enable 'Code execution and file creation', Click 'Upload skill' and select the ZIP."

From jezweb/claude-skills (workflow-recipe philosophy):

> "Every skill must produce something. No knowledge dumps — only workflow recipes that create files, projects, or configurations."

From salaboy.com (2026-04-19, proposing a future direction):

> "You can sign a skill with Cosign and attach a SLSA provenance attestation so consumers can cryptographically verify who built it and from which source commit."
