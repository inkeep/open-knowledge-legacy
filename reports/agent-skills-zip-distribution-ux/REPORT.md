---
title: "Agent Skills ZIP-Release UX: Packaging, Hosting, Versioning, and Install Hand-off for Third-Party Publishers"
description: "How third-party publishers should package, host, version, and distribute Agent Skills for Claude Desktop + Cowork given that programmatic install is unavailable. Covers SKILL.md frontmatter allowlist (six fields; no version), Claude Desktop's zero automation hooks (no URL scheme, no file association, no deep-link, no drop-target), ecosystem hosting patterns (GitHub-repo-as-source dominates; `gh skill publish` launched 2026-04-16 standardized publish but produces tag+release, not per-skill ZIP), a survey of 12 third-party publishers (only 1 ships a Cowork-ready named ZIP), session-reset burden analysis (3+ months of bug reports on #26254/#31542/#39400 with zero Anthropic staff engagement), trust/provenance gap (no signing, no checksum, no publisher display), and Open Knowledge-specific recommendations for the dual-track install flow (keep `npx skills` for Claude Code; ship a Cowork ZIP release + Category D concierge handoff from the Electron app)."
createdAt: 2026-04-24
updatedAt: 2026-04-24
subjects:
  - Agent Skills
  - Claude Desktop
  - Claude Cowork
  - SKILL.md
  - gh skill
  - npx skills
  - Vercel Labs
  - skills.sh
  - agentskills.io
  - MCPB
  - DXT
  - GitHub Artifact Attestations
  - Open Knowledge
topics:
  - agent skills packaging
  - skills zip distribution
  - skills versioning
  - install handoff ux
  - cowork session reset mitigation
  - third-party publisher survey
  - trust and provenance
  - download-and-guide install pattern
---
# Agent Skills ZIP-Release UX

**Purpose:** For third-party publishers shipping an Agent Skill into Claude Desktop / Claude Cowork — where programmatic install is confirmed unavailable ([[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12) — characterize the packaging, hosting, versioning, and in-product hand-off choices that actually work today. Factual / external-sources framing through Dims 1-7; Open Knowledge-specific recommendation in Dim 8.

---

## Executive Summary

**The ecosystem is bifurcated: GitHub-repo-as-source for CLI installers vs named ZIP artifact for the Desktop upload UI — and almost nobody ships both.** Since the 2026-04-16 launch of `gh skill publish`, the dominant third-party pattern is "publish the repo, let `gh skill install` / `npx skills add` shallow-clone at a pinned SHA." That pattern covers \~45 agent IDs via `vercel-labs/skills` but specifically does **not** cover Claude Cowork (its VM instance doesn't mount host `~/.claude/skills/` and has no target in the registry). Of the 12 third-party publishers surveyed, only one — `sisyga/morpheus-skills` — ships a custom-named ZIP (`morpheus.zip`) explicitly for the Claude Desktop upload flow. Everyone else leaves Cowork users to manually zip a folder from a clone.

**Claude Desktop has zero automation hooks for Skills install.** No `claude://install-skill` URL scheme exists (issues #26952 and #10366 both closed "not planned"). No `.skill.zip` file association exists (only `.mcpb`, which is a different format targeting Claude Desktop Chat's MCP connector system, not Skills). No deep-link to the `Customize > Skills` panel exists. No user-writable filesystem drop-target exists that Cowork reads (per-session UUID paths wipe on cleanup; #31422). No HTTP or CLI install API exists (#50148 open as a feature request, zero engagement). The only sanctioned install paths are personal UI upload (`Customize > Skills > + > Upload`) and Team+ org-admin upload or GitHub-sync — both 7-click UI flows with no programmatic entry.

**Versioning: there is no version field.** The SKILL.md frontmatter allowlist is six fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) enforced by Anthropic's own `quick_validate.py`. A top-level `version:` is **actively rejected** with the error `"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"`. Anthropic's own 18+ example skills use zero git tags, zero GitHub releases, zero `version:` declarations. The only standards-conformant escape hatch is `metadata.version: "1.0"` nested under the arbitrary `metadata` map — invisible to Claude Desktop's UI but machine-readable for tooling. Claude Desktop shows no version column, no version tooltip, no update-check button, no "newer version available" notification. Replace-on-same-name is the update model, but in Cowork "Save and Replace" is documented-broken (#46836 as of Claude Code 2.1.92) — same-name re-uploads silently no-op and users think they're running the latest when they're not.

**Session-reset re-upload burden is severe for the custom-skill audience.** Three anchor issues (#26254, #31542, #39400) document "metadata registered but SKILL.md not mounted in Cowork VM" across 3+ months (2026-02-17 → 2026-04-14 latest comment), with **zero Anthropic-staff engagement** on any of them. The bug classifies Cowork user/org skills as silently failing: enabled in the UI, referenced in the `<available_skills>` system-prompt block, but absent from the container's `/mnt/skills/user/` path at runtime. Severity is bimodal — transparent for users who only use Anthropic's 6 built-in skills; severe for anyone investing in custom skills. The best publisher-side mitigations today: (1) promote core instructions into `~/.claude/CLAUDE.md` (loses Agent Skills structure but survives everything, pattern used by `claude-distill-me`); (2) for Team+, ship as a GitHub-synced plugin (moves the burden from user to org-admin, does not fix #26254); (3) document the zip-upload workaround explicitly. No community tool automates the "re-upload on every session start" workflow.

**Trust + provenance: bottom of the barrel.** No signing convention. No checksum / SHA256. No publisher display in Cowork's upload dialog. No review process for 3P submission into `claude.ai/directory` (Anthropic-curated only). `gh skill publish` does offer immutable-releases + tag-protection, but does NOT wire GitHub Artifact Attestations (the Sigstore-backed primitive exists — `actions/attest-build-provenance` — but no Skills publisher uses it). Even the `.mcpb` / DXT format from Anthropic itself lacks a signing story. Chrome Web Store, Obsidian community plugins, and npm provenance are all well ahead of the Skills ecosystem on publisher verification.

**Key findings:**

- **Package shape (HIGH confidence):** ZIP root = the skill folder (not a subfolder); `SKILL.md` at top; frontmatter allowlist = 6 fields exactly; `name:` must match the folder name (lowercase kebab-case, ≤64 chars); description canonically ≤1024 chars per spec but Anthropic support article caps at 200 chars (likely UI display cap vs storage cap).
- **`version:` top-level is rejected** by Anthropic's validator. Use `metadata.version` if you must carry a version in the frontmatter. No Claude surface renders it.
- **The dominant third-party install path is NOT ZIP.** `gh skill publish` (official since 2026-04-16, GitHub CLI 2.90+) produces a git tag + Release object pointing at a tree SHA; installers (`gh skill install`, `npx skills add`) shallow-clone at the pinned SHA. No ZIP artifact is produced; the "download ZIP" users get is GitHub's auto-generated source tarball (whole repo, not one skill). **This pattern doesn't reach Cowork at all.**
- **Only one third-party publisher out of 12 surveyed ships a Cowork-ready named ZIP artifact** (`sisyga/morpheus-skills` → `morpheus.zip`). Others (`netresearch/agent-rules-skill`, `sickn33/antigravity-awesome-skills`) offer a ZIP as one of multiple install methods but not as the primary artifact.
- **Install hand-off for Cowork is stuck in Category D** (download + guided UI walkthrough). Publishers can pre-validate the ZIP, show screenshots, trigger `shell.openExternal('claude://')` to launch Claude Desktop, and `shell.showItemInFolder` to reveal the download — none of this closes the automation gap. The Shortcuts app's `shortcuts://import-shortcut/?url=...` is the exemplar UX, and `.mcpb` double-click / drag-drop is Anthropic's own precedent for what Skills could (but doesn't) have.
- **Cowork session-reset is severe and daily** for custom-skill users. Zero Anthropic engagement on the three anchor issues over 3+ months. No known community tool automates re-upload. The "promote to `CLAUDE.md`" workaround is the most robust but structurally regressive.
- **Trust primitives are all missing.** No signing, no attestation, no checksum, no publisher display, no review. Open primitives (GitHub Artifact Attestations, Sigstore, `actions/attest-build-provenance`) exist but aren't wired into `gh skill publish`.
- **For Open Knowledge specifically:** keep the existing `npx skills add --agent '*'` flow for Claude Code (it works; don't change it). Add a parallel Cowork track: publish a named `openknowledge.skill.zip` artifact on GitHub Releases, surface a "Install in Claude Cowork" CTA in the Electron app that downloads + reveals + opens Claude + shows an inline walkthrough. Document session-reset expectations in the README with a re-upload hint, and offer a `CLAUDE.md` fallback for Pro/Max users who hit the mount bug.

---

## Research Rubric

| # | Dimension                                  | Priority | Depth  |
| - | ------------------------------------------ | -------- | ------ |
| 1 | Skills ZIP package shape                   | P0       | Deep   |
| 2 | Skills-directory hosting surfaces          | P0       | Medium |
| 3 | Versioning + update UX                     | P0       | Medium |
| 4 | In-product install hand-off patterns       | P0       | Deep   |
| 5 | Cowork session-reset re-upload mitigations | P1       | Medium |
| 6 | Third-party skill publisher survey         | P1       | Medium |
| 7 | Trust + provenance                         | P2       | Light  |
| 8 | Open Knowledge–specific recommendation     | P0       | Medium |

---

## Detailed Findings

### Dim 1 — Skills ZIP package shape

**Evidence:** [evidence/skills-package-and-versioning.md](evidence/skills-package-and-versioning.md)

**Canonical layout** (from agentskills.io/specification + Anthropic support articles, HIGH confidence):

```
my-skill/                     <- ZIP root IS this folder (not a subfolder above)
├── SKILL.md                  <- required; YAML frontmatter then body
├── scripts/                  <- optional: Python/Bash/JS helpers
├── references/               <- optional: on-demand docs
├── assets/                   <- optional: templates, images, data
└── LICENSE.txt               <- convention (reference from frontmatter)
```

The most common silent-failure mode is flattening contents into the ZIP root (no wrapper folder) — uploads *succeed* but the skill never triggers. `support.claude.com/12512198` explicitly says: *"The ZIP should contain the Skill folder as its root (not a subfolder)."*

**SKILL.md frontmatter — exactly 6 fields allowed** (enforced by Anthropic's `quick_validate.py` in the skill-creator skill):

| Field           | Required | Max char                            | Constraints                                                                          |
| --------------- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `name`          | Yes      | 64                                  | Lowercase `[a-z0-9-]`, no leading/trailing/double hyphen, must match parent dir name |
| `description`   | Yes      | 1024 (spec) / 200 (support article) | Non-empty; no `<` or `>` chars                                                       |
| `license`       | No       | unbounded                           | Name or reference to bundled LICENSE.txt                                             |
| `compatibility` | No       | 500                                 | Environment requirements                                                             |
| `metadata`      | No       | —                                   | Arbitrary key-value map (only place `version` can live)                              |
| `allowed-tools` | No       | —                                   | Space-separated; experimental                                                        |

Anything else hard-fails with: `"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"` (verbatim from `quick_validate.py`; note `compatibility` is in the validator's allowlist but missing from the error string — the message itself is stale).

**Claude Code's SKILL.md is a superset** — it also accepts `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`. These are Claude-Code-only; **they are rejected by the Claude.ai Desktop/web uploader.** A skill meant for both surfaces must stay inside the 6-field allowlist and put Claude-Code customizations in the body or in `metadata.*`.

**Allowed bundled resources:** Python/Bash/JS scripts (run in Claude's code-execution sandbox — the skill does not ship the runtime), references (on-demand markdown), assets (templates, binary fonts, images). Nested directories allowed. Recursive SKILL.md (sub-skills within one ZIP) is NOT described in the spec; assume one ZIP = one skill.

**Size limits:** no skill-specific ZIP size limit is published. Closest anchor: Claude's general chat-file upload is 30 MB. Treat 30 MB as the planning cap until Anthropic documents otherwise.

**Validation failures surfaced by the upload UI:**

- Folder name doesn't match the skill name
- Invalid characters in skill name or description
- ZIP exceeds size limits (exact size unspecified)
- Missing required `SKILL.md`
- Frontmatter key outside the 6-field allowlist

**Silent failure modes** (more dangerous than rejections):

- No wrapper folder (flat ZIP) → upload succeeds, skill never triggers
- Files mount fails while metadata registers (Cowork specifically; #26254, #39400)
- Old SKILL.md persists after "Save and Replace" (Cowork; #46836)

**Personal vs Team+ org upload differences:** personal is Customize > Skills > + > + Create skill > Upload; org-admin is Organization settings > Skills > + Add; no approval workflow at org level (any member can publish org-wide); **GitHub sync is NOT documented for standalone skills** — only for plugins that bundle skills (see Dim 5).

### Dim 2 — Hosting surfaces

**Evidence:** [evidence/skills-hosting-and-publisher-survey.md](evidence/skills-hosting-and-publisher-survey.md)

**The dominant hosting surface is the GitHub repo itself, consumed by a CLI installer that shallow-clones at a pinned SHA.** Three CLIs compete:

| CLI                              | Source                            | Agent targets                          | ZIP-producing?        |
| -------------------------------- | --------------------------------- | -------------------------------------- | --------------------- |
| `gh skill`                       | GitHub CLI 2.90+ (2026-04-16)     | covers Claude Code + \~10 via metadata | No — tag+release only |
| `npx skills add` (Vercel Labs)   | `vercel-labs/skills`, 25 releases | \~45 agent IDs                         | No — clones repo      |
| `npx antigravity-awesome-skills` | sickn33/antigravity               | 41+ clients                            | No — clones repo      |

**`gh skill publish` workflow** (since 2026-04-16):

1. Publisher runs `gh skill publish` in a repo with a valid SKILL.md.
2. CLI offers: add `agent-skills` topic (canonical tag), pick tagging strategy (default `v1.0.0` semver), enable immutable releases, generate auto release notes.
3. Publishes a git tag + GitHub Release — **no ZIP artifact is attached.**
4. Consumer runs `gh skill install <owner/repo>`, which shallow-clones at the pinned SHA and writes a `SKILL.md` frontmatter metadata block with `github-repo`, `github-ref`, `github-tree-sha`, `github-pinned` fields.

**The seam for Cowork:** `gh skill publish` produces nothing Cowork's ZIP upload UI can consume. The "Download ZIP" button on a GitHub Release gives the whole-repo source tarball, not the one-skill-folder-as-root ZIP Cowork needs. A publisher who wants to reach Cowork users must **separately produce and attach a named `.zip` or `.skill.zip` artifact**, which almost none do (see Dim 6).

**Hosting surfaces surveyed:**

- **GitHub Releases with attached ZIP artifact** — minority pattern; works for Cowork upload; examples: `sisyga/morpheus-skills`, `netresearch/agent-rules-skill`.
- **GitHub repo + CLI install** — dominant pattern; doesn't reach Cowork.
- **Plugin marketplaces** (`/plugin marketplace add <owner/repo>` for Claude Code) — different substrate from Cowork; marketplace-installed plugins' skills silently fail to mount in Cowork per #39400.
- **Project websites** — near-zero signal; `skills.sh` (Vercel Labs' directory) is the closest "project website" but hosts no binaries; every install button compiles to `npx skills add`.
- **npm-served static assets** — zero publishers found serving ZIPs via unpkg/jsdelivr. The npm surface is CLI packages, not skill ZIPs.
- **agentskills.io** — **NOT a directory.** It's the open-spec landing page (Anthropic-originated, multi-vendor) with a 39-agent-client showcase. No submissions, no listings, no ZIPs hosted.
- **claude.ai/directory** — Anthropic-curated ("over 1,000 ready-made skills" per findskill.ai). **No documented self-serve third-party submission path.** Third parties must host elsewhere and ask users to upload the ZIP manually.
- **Third-party aggregators** — discovery-only, no hosting:
  - `sickn33/antigravity-awesome-skills` — 35k stars, 1,435+ skills across 41+ clients
  - `VoltAgent/awesome-agent-skills` — 1,100+ skills
  - `alirezarezvani/claude-skills` — 5.2k stars, 232+ skills
  - `hesreallyhim/awesome-claude-code` — 150+ entries across skills/hooks/plugins
- **GitHub topic tags** — `agent-skills` (canonical, auto-added by `gh skill publish`), `agent-skill`, `claude-skill`, `claude-code-skills`, `skill-md`.

### Dim 3 — Versioning + update UX

**Evidence:** [evidence/skills-package-and-versioning.md](evidence/skills-package-and-versioning.md)

**There is no version field.** Verbatim from `quick_validate.py` + issue [`anthropics/skills#37`](https://github.com/anthropics/skills/issues/37): `"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"`. Issue #37 explicitly lists `version`, `author`, and `category` as "Not Supported."

**The four escape hatches for carrying a version:**

1. **`metadata.version: "1.0"`** — nested under the `metadata` map. The open spec's own example uses this. Only in-SKILL.md path that passes validation. Invisible to Claude surfaces.
2. **Bundled `VERSION` / `CHANGELOG.md`** — human-discoverable, not machine-readable.
3. **ZIP filename** (`my-skill-1.2.0.zip`) — purely cosmetic; not surfaced in Claude UI.
4. **Git tags** on the upstream repo — invisible to the Desktop installer; meaningful only to human maintainers or distribution tooling.

**Claude Desktop is version-blind.** The Customize > Skills list shows name, creator, toggle, brief description, timestamp. No version column, no tooltip, no "newer version" notification, no update-check. Per Jonathan Blow's "Definitive Guide": *"Update process: Re-upload the compressed file for changes to both Web and Desktop platforms—no automatic updates exist."*

**Anthropic's own skills have no versioning.** `GET /repos/anthropics/skills/tags` returns `[]`. `GET /repos/anthropics/skills/releases` returns `[]`. None of the 12 sampled Anthropic example skills use `metadata.version`. Updates land as commits to `main` with messages like `"Update docx, xlsx, pdf, pptx skills with latest improvements"`.

**Replace-on-same-name** is the dedupe model. Re-uploading a ZIP with the same `name:` overwrites (web/API). **Cowork "Save and Replace" is broken** — issue [#46836](https://github.com/anthropics/claude-code/issues/46836) (April 2026, Claude Code 2.1.92): `.skill` files with same-name skills silently no-op on disk; users think they installed the update but are running the old code. Workaround: `rm -rf ~/.claude/skills/{name}/` then re-install, OR use the ZIP upload path instead of `.skill` double-click.

**Content-aware dedup does not exist.** A publisher who ships `my-skill` v1.1 then `my-skill-v1-2` under a different name creates two separate installations; users end up with both simultaneously. Keep `name:` stable across versions; let versioning live outside the identifier.

**Update shared-skill carve-out:** per support article, *"If you update the skill later, recipients automatically get the updated version"* — but this applies only to skills directly shared between named colleagues in a Team+ org. The recipient's instance points at the uploader's canonical copy; on re-upload by the uploader, recipients see the new version without doing anything. How this behaves in the broken-Cowork-replace case is undocumented.

**Community conventions are fragmented:** some publishers use git tags (`git tag -a v1.0.0`), some use ZIP filename, some use `metadata.version`, most use nothing. No settled convention exists.

### Dim 4 — In-product install hand-off patterns

**Evidence:** [evidence/in-product-install-handoff.md](evidence/in-product-install-handoff.md)

**Claude Desktop's capability surface for third-party install hand-off: zero automation hooks.**

| Hook                                  | Status                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude://install-skill` URL scheme   | **NOT EXIST.** Issue [#26952](https://github.com/anthropics/claude-code/issues/26952) (closed not-planned) confirms Claude Desktop's shell filters custom URL schemes to `http(s)://` only. Issue [#10366](https://github.com/anthropics/claude-code/issues/10366) also closed not-planned. |
| `.skill.zip` file association         | **NOT EXIST.** Only `.mcpb` is registered — different format, targets Claude Desktop Chat's MCP connectors, not Skills.                                                                                                                                                                     |
| Deep-link to Customize > Skills panel | **NOT EXIST.** No `claude://settings/*` documented.                                                                                                                                                                                                                                         |
| Filesystem drop-target for Cowork     | **NOT EXIST.** Per-session UUID paths (#31422); wipes on session cleanup.                                                                                                                                                                                                                   |
| `claude skill add` CLI subcommand     | **NOT EXIST.** No feature request merged; #50148 open with zero staff engagement.                                                                                                                                                                                                           |
| HTTP localhost install API            | **NOT EXIST.** No primary source.                                                                                                                                                                                                                                                           |

**Net verdict:** For Cowork, the only install path is a 7-click UI walkthrough:

1. User downloads `<skill>.zip`.
2. User opens Claude Desktop.
3. User clicks `Customize` in sidebar.
4. User clicks `Skills`.
5. User clicks `+` then `+ Create skill`.
6. User clicks `Upload a skill`.
7. User selects the ZIP.

**Adjacent ecosystems by integration level:**

| Category | Pattern                                              | Examples                                                                                                                                    | Claude Desktop Skills?                                                 |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A        | Zero-click deep-link (app opens, confirms, installs) | Cursor `cursor://...mcp/install`, VS Code `vscode:mcp/install`, Raycast, `shortcuts://import-shortcut/?url=`, Firefox off-AMO signed `.xpi` | **NO**                                                                 |
| B        | File-association double-click                        | Claude Desktop `.mcpb`, VS Code `.vsix`, macOS `.shortcut`, `.dmg` / `.pkg`                                                                 | **NO** (only `.mcpb`, wrong target)                                    |
| C        | Download + manual drop (known directory)             | Obsidian manual install, VS Code `.vsix` sideload, Claude Code CLI `~/.claude/skills/` (via `npx skills add`)                               | **NO** for Cowork (no deterministic path); **YES** for Claude Code CLI |
| D        | Download + guided UI walkthrough                     | Pre-2018 Chrome extensions, Claude Desktop Skills today                                                                                     | **YES — this is where we live**                                        |
| E        | Cloud-side registry (no local install)               | Claude Custom Connectors (remote MCP), ChatGPT Connectors                                                                                   | N/A for Skills (no remote-skill transport)                             |
| F        | Companion CLI fan-out writing config files           | `npx skills`, `add-mcp`, `install-mcp`, Smithery                                                                                            | Helps for Claude Code; doesn't cross Category D wall for Cowork        |

**The `shortcuts://import-shortcut/?url=<url>` pattern is the exemplar.** Apple built exactly what Claude could build for Skills: app focus → remote fetch → preview → user confirms → installed. A `claude://import-skill/?url=<zip-url>` would work identically. It doesn't exist.

**What we can do in Category D without Anthropic changes:**

1. Pre-download and pre-validate the ZIP (use `skills validate` to confirm structural correctness before offering).
2. Auto-name correctly (Claude rejects ZIPs where folder name ≠ skill name).
3. In an Electron app, `shell.showItemInFolder(zipPath)` to reveal the file in Finder.
4. In an Electron app, `shell.openExternal('claude://')` or `open -a "Claude"` to launch Claude Desktop.
5. Inline screenshots / animated step-by-step walkthrough of the 7-click path.
6. Link to the canonical Anthropic support article.
7. Post-install self-verification prompt.

**Asks that would unblock automation** (file to Anthropic):

1. `claude://install-skill?url=<url>` URL scheme (exemplar: `shortcuts://`).
2. `.skill` or `.skill.zip` file association (exemplar: Anthropic's own `.mcpb`).
3. Deep-link to Customize > Skills panel.
4. Deterministic user-writable Skills drop-target.
5. `claude skill add` CLI subcommand (exemplar: `claude mcp add`).
6. Fix the mount-race bugs #26254 / #31542 / #39400.

### Dim 5 — Cowork session-reset re-upload mitigations

**Evidence:** [evidence/cowork-session-reset-mitigations.md](evidence/cowork-session-reset-mitigations.md)

**The three anchor issues are unresolved over 3+ months with zero Anthropic-staff engagement:**

| Issue                                                            | Status                    | Reporter                   | What breaks                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#26254](https://github.com/anthropics/claude-code/issues/26254) | OPEN, no staff engagement | `danrparsons` (2026-02-16) | User/org skill metadata registered in `<available_skills>` system prompt; `/mnt/skills/user/` path absent at runtime. 3 of 4 org skills missing on disk in reporter's repro. |
| [#31542](https://github.com/anthropics/claude-code/issues/31542) | CLOSED (auto-stale)       | `akolotov` (March 2026)    | Plugin-bundled skills silently dropped in Cowork even when MCP connectors mount successfully. Reporter pushed back on duplicate-close; bot closed anyway.                    |
| [#39400](https://github.com/anthropics/claude-code/issues/39400) | OPEN, no staff engagement | `Ruckth` (2026-03-26)      | Marketplace plugins fail to load skills in Cowork. **Zip upload of the same plugin works.** Proves the failure is in the marketplace pipeline, not the skill itself.         |

Labels applied to #39400 (`area:cowork`, `area:skills`, `area:plugins`, `platform:macos`) confirm internal triage awareness without public engagement.

**Team+ GitHub sync:**

- Exists for **plugins** (bundles of MCP connectors + skills), not standalone skills. Documented at [support.claude.com/13837433](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization).
- Setup: Org settings > Plugins > Add > GitHub > `owner/repo` (requires Claude GitHub App). Pull triggered by push, sync latency up to 30 min.
- Requires Team/Enterprise plan + Owner role; no Pro/Max path.
- **Does not mitigate the session-reset bug.** The #26254 class is in the VM provisioning pipeline, not the host-side source of truth. #39400 evidence suggests GitHub-sourced plugins get WORSE outcomes than zip-upload in Cowork. Issue #38429 documents that `RemotePluginManager.syncPlugins()` wipes GitHub-sourced plugins on every Desktop restart (while protecting `source: "manual"` uploads).
- **What it mitigates:** removes the manual re-upload step when the skill source changes — publisher pushes, org admin doesn't re-upload. End-user session-reset is unaffected.

**Community workarounds:**

- **Symlink tricks** from `~/.claude/skills/` into per-session Cowork paths — documented for Manjaro/Linux; fragile; does NOT fix the #26254 mount bug because Cowork provisioning doesn't read `~/.claude/skills/`.
- **Re-upload scripts** (ad-hoc zip-and-upload) — the de facto workflow since 2026-02-17; no automation wrapper found.
- **Ephemeral-session helpers** — no community tool automates re-upload on session start.

**Anthropic-side guidance:** NOT FOUND. Zero public acknowledgment of the re-upload burden in any support article, blog post, changelog, or Dev-Day announcement. The Fin AI help-desk agent suggests ZIP-structure checks and "try again in a few minutes" — non-workarounds.

**Third-party publisher coping copy is thin.** The one robust pattern found:

- **`LewenW/claude-distill-me`** acknowledges the bug: *"Current workaround I recommend to users: manually copy the generated SKILL.md content into `~/.claude/CLAUDE.md`. Not ideal, but it works across all environments."* — trades Agent Skills structure for reliability.

**No publisher found** that: ships a re-upload helper script, documents GitHub sync as the Team+ install path with session-reset framing, or links #26254 / #39400 directly from their README.

**Severity verdict:**

- **Bimodal:** transparent for Anthropic-curated-skill-only users; severe for custom-skill users.
- **HIGH for the target audience** of this report (publishers with custom skills).
- Affected users characterize it as **blocking / "effectively unusable in Cowork" / "enterprise adoption blocker"** (quotes from #26254 thread).

**Best publisher mitigations (ranked most-robust → most-convenient):**

1. Promote skill's core instructions into `CLAUDE.md`. Survives everything. Loses Agent Skills structure. (The `claude-distill-me` pattern.)
2. Ship as a Claude Code CLI plugin via a CLI-installable marketplace. Works in Claude Code, not Cowork. Horizontal pivot, not mitigation.
3. For Team+ only: ship as a GitHub-synced org marketplace plugin. Moves re-upload burden from user to org-admin; doesn't fix #26254.
4. Document the zip-upload workaround explicitly with a re-package script. Most honest UX given current Anthropic behavior.
5. No-op and hope. Dominant pattern today. Produces user complaints.

### Dim 6 — Third-party publisher survey

**Evidence:** [evidence/skills-hosting-and-publisher-survey.md](evidence/skills-hosting-and-publisher-survey.md)

**12 publishers surveyed, +6 additional spot-checked.** The ZIP-for-Cowork pattern is a minority:

| #  | Publisher                            | Domain                           | Stars | Hosting                          | ZIP for Cowork?                          |
| -- | ------------------------------------ | -------------------------------- | ----- | -------------------------------- | ---------------------------------------- |
| 1  | `vercel-labs/agent-skills`           | React/Next.js/UI                 | 25.7k | Git repo only                    | NO — "No releases published"             |
| 2  | `vercel-labs/skills` (CLI)           | Installer                        | —     | npm + 25 releases                | N/A (installer, not skill)               |
| 3  | `obra/superpowers`                   | Coding-agent methodology         | 166k  | Multi-marketplace                | NO                                       |
| 4  | `alirezarezvani/claude-skills`       | Multi-role (232+ skills)         | 5.2k  | Plugin marketplace               | NO                                       |
| 5  | `sickn33/antigravity-awesome-skills` | 1,435+ skills                    | 35k   | `npx antigravity-awesome-skills` | NO                                       |
| 6  | `jezweb/claude-skills`               | Full-stack dev (60 skills)       | 746   | Plugin marketplace, 19 releases  | NO                                       |
| 7  | `netresearch/agent-rules-skill`      | AGENTS.md generator              | 31    | Multi-path (43 releases)         | **YES** (as one of four install methods) |
| 8  | `sisyga/morpheus-skills`             | Scientific (Morpheus simulation) | 4     | **Named `morpheus.zip`**         | **YES — explicitly for Claude Desktop**  |
| 9  | `gohypergiant/agent-skills`          | TS/React (12 skills)             | 10    | `npx skills add`                 | NO                                       |
| 10 | `laravel/boost`                      | Laravel best-practices           | —     | Corporate docs site + git        | NO                                       |
| 11 | `teableio/agent-skills`              | Generic                          | —     | Git repo                         | NO                                       |
| 12 | `chrishan17/skill-router`            | Skill routing (40+ agents)       | —     | Git repo                         | NO                                       |

**Pattern observations:**

- **11 of 12 surveyed publishers do NOT attach a Cowork-ready ZIP** to their releases. The one who does (`sisyga/morpheus-skills`) is a single-skill niche scientific tool, 4 stars, clear product focus on "user needs Claude Desktop to do Morpheus XML authoring."
- **Corporate-backed publishers** (Vercel Labs, Laravel) ship raw repos consumed by their own installers, not ZIPs.
- **Large community aggregators** (`obra/superpowers`, `sickn33`, `alirezarezvani`) bet entirely on plugin-marketplace install models, which don't work reliably in Cowork (#39400).
- **Single-purpose skills** with Claude Desktop focus (`sisyga`, `netresearch`) are most likely to ship a named ZIP.
- **None of the surveyed publishers**: ships a SHA256 checksum, signs the release, documents session-reset behavior, links the #26254 bug class, or offers a re-upload helper.

**`sisyga/morpheus-skills` exact README copy for the ZIP path:**

> *"Download `morpheus.zip` from Releases, Open Claude Desktop → Settings → Capabilities, Enable 'Code execution and file creation', Click 'Upload skill' and select the ZIP."*

This is the cleanest ZIP-for-Cowork pattern found. Flat ZIP structure (no nested subdirectories); single-skill focus; explicit platform targeting.

### Dim 7 — Trust + provenance

**Evidence:** [evidence/skills-hosting-and-publisher-survey.md](evidence/skills-hosting-and-publisher-survey.md)

**The Skills ecosystem has no signing, no checksum, no publisher display, no review.** Gaps vs every comparable ecosystem:

| Ecosystem                             | Baseline trust primitives                                                      | Skills gap                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Chrome Web Store                      | Mandatory pre-publication review + 20-ext/account limit                        | No review gatekeeping on ZIP uploads; claude.ai/directory has Anthropic curation but no 3P submission path |
| Obsidian community plugins            | PR-based submission + manual team review + `manifest.json` + version tag match | No equivalent intake queue; `gh skill publish` adds topic + release but no human review                    |
| npm Provenance                        | Automatic Sigstore attestation on GitHub Actions publish                       | Skills CLIs install from repos with no cryptographic chain                                                 |
| GitHub Artifact Attestations          | Sigstore + SLSA attestation primitive; `gh attestation verify`                 | Primitive exists; NOT wired into `gh skill publish` as of 2026-04-24                                       |
| MCPB / DXT (Anthropic's other format) | ZIP-like with `manifest.json` + single-click install                           | Same no-signing posture as Skills — cross-Anthropic gap                                                    |

**What Claude Desktop's upload dialog shows:** ZIP size OK check, folder-name-matches-skill-name check, SKILL.md presence check, name/description character check. **Does NOT show:** origin URL, source repo, author name, cryptographic identity, upload timestamp from publisher.

**Anthropic's explicit trust posture is "it's on the user":**

> *"We strongly recommend using Skills only from trusted sources: those you created yourself or obtained from Anthropic. \[...] If you must use a Skill from an untrusted or unknown source, exercise extreme caution and thoroughly audit it before use."* ([platform.claude.com/docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview))

> *"Skills are installed at your own discretion. They are not verified by GitHub and may contain prompt injections, hidden instructions, or malicious scripts."* (GitHub changelog for `gh skill publish`)

**What Skills could adopt** (easiest → hardest):

1. **GitHub Artifact Attestations in `gh skill publish`** — primitive ready, requires only `actions/attest-build-provenance` wiring. Free-lunch improvement.
2. **Publisher display in the upload dialog** — render SKILL.md `metadata.author` / `metadata.repository` + "fetched from: <URL>" trace.
3. **Submission + review path into claude.ai/directory** — Obsidian-style PR review. High human cost; high trust payoff.
4. **SHA256 convention alongside GitHub Releases** — low-tech; publishers don't do it today.

**Exploratory proposals** (not shipped): OCI-image distribution with cosign-signed SLSA attestations ([salaboy.com, 2026-04-19](https://www.salaboy.com/2026/04/19/manage-and-distribute-skills-with-skills-oci/)). Sigstore A2A is a separate project (Agent-to-Agent AgentCards, not Skills).

### Dim 8 — Open Knowledge-specific recommendation

**Keep the current `npx skills add` flow for Claude Code.** The bundled skill at `packages/server/assets/skills/open-knowledge/SKILL.md` + `installUserSkill()` shelling out to `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy` is the right Claude Code path. It covers the \~45-target registry. Don't change it.

**Add a parallel Cowork track.** Since `npx skills`' wildcard doesn't reach Cowork and there's no programmatic install surface for Cowork, ship a ZIP release artifact and build a Category D concierge flow:

#### Recommended packaging

Produce a named release artifact `openknowledge.skill.zip` with:

```
open-knowledge/                    <- ZIP root = this folder
├── SKILL.md                       <- frontmatter: name, description, license, metadata.version, metadata.author, metadata.repository, compatibility
├── scripts/                       <- existing bundled scripts (stay lean; Cowork 30 MB cap)
├── references/                    <- on-demand docs
└── LICENSE.txt
```

- `name: open-knowledge` — kebab-case, ≤64 chars, matches folder.
- `description: "[concise]"` — plan for ≤200 chars to survive the support-article UI cap; ≤1024 for storage.
- `license: MIT. See LICENSE.txt.`
- `compatibility: "Claude Desktop, Claude Cowork, Claude.ai web. Requires code execution."`
- `metadata.version: "<open-knowledge-cli-version>"` — mirror the `@inkeep/open-knowledge` npm version so users can sanity-check.
- `metadata.author: "Inkeep"`
- `metadata.repository: "https://github.com/inkeep/open-knowledge"`

Keep `name:` stable across versions. Don't ship `open-knowledge-v2` as a new name — it stacks installs.

#### Recommended hosting

1. **GitHub Releases on `inkeep/open-knowledge`** with a named `openknowledge.skill.zip` asset on every tagged release. Auto-generated notes from the `@inkeep/open-knowledge` changelog. Tag protection ON. Optional: add `actions/attest-build-provenance` to produce a SLSA attestation (free-lunch, even if consumers can't verify it through Claude Desktop today).
2. **Keep `npx skills` as the Claude Code path.** `skills.sh` leaderboard already tracks `npx skills add inkeep/open-knowledge` (or similar) installs.
3. **Do NOT submit to `claude.ai/directory`** — no documented 3P submission path exists today.
4. **Do NOT build a standalone website just for the skill.** The GitHub release + README is sufficient.

#### Recommended in-product install hand-off

In the Electron app and the web editor, add a "Install in Claude Cowork" CTA (distinct from the existing "Initialize LLM brain" button which targets Open Knowledge projects, not Cowork). Flow:

| Step | User experience                                                                           | Technical implementation                                                        |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | Click "Install in Claude Cowork" in our app                                               | CTA button                                                                      |
| 2    | Modal: "Installing in Cowork takes 3 clicks. Here's how." + inline screenshots/screencast | React component                                                                 |
| 3    | "Download Skill (ZIP)" button → downloads `openknowledge.skill.zip`                       | `fetch` GitHub release asset; Electron: also `shell.showItemInFolder(zipPath)`  |
| 4    | "Open Claude Desktop" button                                                              | `shell.openExternal('claude://')` + fallback: `open -a Claude` / `start Claude` |
| 5    | Persistent "Waiting for install" with "Done / Skip" controls                              | Local state                                                                     |
| 6    | Post-install self-verification prompt: "Ask Claude: 'search my Open Knowledge'"           | Optional toast with copy-to-clipboard                                           |

The Electron app has an existing M6 first-launch MCP consent milestone — mirror its IPC discipline for this flow using `createHandler` / `createInvoker` from `packages/desktop/src/shared/ipc-*.ts` (per CLAUDE.md).

#### Recommended README / docs copy

Explicit session-reset expectation-setting:

> **Claude Cowork note:** Cowork has an open bug class ([#26254](https://github.com/anthropics/claude-code/issues/26254), [#31542](https://github.com/anthropics/claude-code/issues/31542), [#39400](https://github.com/anthropics/claude-code/issues/39400)) where custom skills can be registered in the UI but not mounted in the session VM. If you see "it looks like there isn't a \[skill\] skill available" after installing, try: (a) deleting the skill and re-uploading; (b) if you're on Team/Enterprise, having your admin ship Open Knowledge as a GitHub-synced plugin; (c) as a fallback, paste the skill's core instructions into `~/.claude/CLAUDE.md` (loses Agent Skills triggering but works reliably cross-session).

For Pro/Max users specifically, a `CLAUDE.md` fallback stub could be auto-generated alongside the ZIP — single-file, drop into home, works everywhere `~/.claude/CLAUDE.md` is read.

#### Recommended versioning

- `metadata.version` mirrors the `@inkeep/open-knowledge` npm version. Invisible to Claude surfaces but machine-readable.
- GitHub tag + Release per published version (standard semver).
- **No update-check mechanism on the client side** — Claude Desktop doesn't surface updates, so client-side version-polling is pointless. Instead, the Electron app can detect (via a local check against the latest GitHub Release) whether the user's `@inkeep/open-knowledge` CLI version is newer than their last ZIP upload, and surface a one-shot "A newer Open Knowledge skill is available for Cowork — download + re-upload" hint in the status area.

#### Asks to file with Anthropic

File (and link this report + [[reports/mcp-server-auto-install-harnesses/REPORT]]) in:

- A new feature request on `anthropics/claude-code` asking for `claude://install-skill?url=<zip-url>` (analogous to `shortcuts://import-shortcut/?url=`).
- Upvote / cross-link [#50148](https://github.com/anthropics/claude-code/issues/50148) (gh skill as remote source for Desktop).
- Attach evidence to the open anchor bugs #26254 / #31542 / #39400 if we can reproduce the mount failure with Open Knowledge's skill specifically.

#### What NOT to do

- **Don't try to be Cursor.** We have no `cursor://` equivalent to lean on. Category A (zero-click deep-link) is closed.
- **Don't ship a `.mcpb`** and hope. MCPB is for MCP servers, not Skills — wrong target.
- **Don't wait for Anthropic to fix #26254.** 3+ months of zero engagement; not a near-term certainty. Build Category D concierge assuming the bug persists.
- **Don't redefine the skill per plan tier.** One artifact, document the Pro/Max vs Team+ UX differences in-README.
- **Don't couple the Cowork ZIP release to the CLI release cycle too tightly.** The CLI can release frequently; the skill package is a rougher-grained artifact (the published skill text doesn't change on every CLI patch).

---

## Conclusions & Implications

Five patterns emerge from the landscape:

**1. The Skills ecosystem is bifurcated between "CLI-installable repos" and "Desktop-uploadable ZIPs."** Almost nobody bridges. Publishers who want Cowork reach have to ship the extra ZIP artifact explicitly, and almost none do. The `sisyga/morpheus-skills` pattern (named `*.zip` attached to GitHub Releases, explicit README copy for the Desktop upload UI) is the template — but it's rare because the CLI path covers most publishers' actual users.

**2. `gh skill publish` standardized publishing in 2026-04-16 but produced a Cowork gap.** The CLI's release artifact is a tag + Release pointing at a tree SHA, not a ZIP. Consumers using `gh skill install` / `npx skills add` shallow-clone at the pinned SHA and never download a ZIP. But Cowork's upload UI needs a ZIP. Publishers must do extra work (and extra CI) to attach one.

**3. Claude Desktop's automation surface for Skills install is empty.** No URL scheme, no file association, no deep-link, no drop-target, no CLI subcommand, no HTTP API. Category D (download + guided UI walkthrough) is the only game. Anthropic has built Category A / B machinery (`.mcpb` double-click) for MCP servers — the precedent exists — just not for Skills yet.

**4. The session-reset bug class (#26254 et al.) turns Cowork into a publisher-hostile surface for custom skills today.** Three months of zero staff engagement on the anchor issues. The "promote to `CLAUDE.md`" workaround used by `claude-distill-me` is the most robust publisher pattern, but it regresses from the Agent Skills value prop. A publisher shipping to Cowork in 2026-04 should treat the bug as permanent for planning purposes and encode session-reset awareness into their UX copy.

**5. Trust / provenance is a shared cross-Anthropic gap.** Skills ZIPs, `.mcpb` / DXT, and Claude Code plugin marketplaces all have the same no-signing, no-attestation, no-review posture. GitHub Artifact Attestations are ready to wire into `gh skill publish` as a free-lunch improvement — somebody will eventually do it, or Anthropic will. Early-adopter publishers can attach attestations today via `actions/attest-build-provenance` even if consumers can't verify through Claude Desktop's UI, for future-proofing + a weak-signal trust bump.

**For a new publisher planning to ship a skill to Cowork today:**

- **Ship a named ZIP artifact on GitHub Releases** (not just a tag). Name it `<skill>.skill.zip` or `<skill>.zip`; keep it flat-inside-wrapper-folder structure.
- **Validate the ZIP structurally** before offering it (`skills validate`); the #1 silent-failure mode is flat ZIPs with no wrapper folder.
- **Use `metadata.version`** for machine-readable versioning inside SKILL.md; git tags for human-readable repo state; filename for UI-visible "you got v1.2" signal. Don't put `version:` at the top level.
- **Document session-reset behavior** explicitly: link #26254, describe the "metadata registered but SKILL.md not mounted" symptom, offer the delete-then-re-upload workaround and the `CLAUDE.md` fallback.
- **Assume Category D** install. Build the best concierge flow you can: download → reveal → open Claude → screenshots → post-install verify.
- **Don't wait for Anthropic** to ship `claude://install-skill`. File the request, but plan as if it never lands.
- **For Team+ users**, document the GitHub-sync path alongside ZIP upload, but warn about #38429 (plugin wipe on Desktop restart for GitHub-sourced marketplaces). Suggest manual sync + pinned commit.
- **Don't rely on directory / registry curation.** `claude.ai/directory` has no 3P submission; `skills.sh` ranks by install count only; aggregators (`awesome-agent-skills` etc.) are discovery-only.

**For Open Knowledge specifically** (Dim 8 is the authoritative recommendation; condensed here):

- Keep `npx skills add --agent '*'` for Claude Code (works, don't change).
- Ship `openknowledge.skill.zip` on GitHub Releases for Cowork.
- Build the Category D concierge flow in the Electron app + web editor.
- Document session-reset expectations; offer a `CLAUDE.md` fallback stub for Pro/Max users.
- `metadata.version` mirrors the npm CLI version for sanity-checking.

---

## Limitations & Open Questions

### Dimensions covered with residual UNCERTAIN findings

- **`description` max char count** — spec says 1024, support article says 200. Real storage limit is likely 1024; UI display truncation is likely 200. Not independently verified.
- **ZIP size limit** — no skill-specific number published; 30 MB (Claude's general chat-upload cap) is the planning assumption.
- **Recursive / nested SKILL.md inside a single ZIP** — unspecified in any source. Assume unsupported.
- **Symbolic link handling inside a skill ZIP** — unspecified; unsafe to rely on.
- **Dependencies frontmatter field** — support article `12512198` claims it works; `quick_validate.py` rejects it. Do not use.
- **`claude.ai/directory` internals** — page returned 403 to research agent. Corroborating sources used; direct inspection pending.
- **Reddit r/ClaudeAI signal volume** for "I made a skill" posts — not surveyed this pass.
- **Exact cross-platform behavior of symlink workarounds** under current Cowork releases post-v1.1.7053 path migration (#35131).

### Items explicitly out of scope (non-goals)

- Re-investigating programmatic Skills install for Cowork (closed in [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12).
- Anthropic's internal Skills evaluation / ranking / curation policies.
- Full design of the Open Knowledge integration (Dim 8 is the recommendation, not a spec).
- 1P Open Knowledge codebase analysis beyond the recommendation in Dim 8.

### Open questions worth a follow-up pass

- **Is there a private / invite-based Anthropic Partners program** for claude.ai/directory submissions? Not documented publicly.
- **Does any publisher wire `actions/attest-build-provenance`** into their Skills CI today? None found in the 12-publisher survey; a broader sweep might find an early adopter.
- **What's the actual install-volume breakdown** between ZIP-upload, `gh skill install`, `npx skills add`, and plugin marketplaces? Skills.sh only tracks the `npx skills` path.
- **Does Anthropic have a roadmap commitment for any of #26254 / #31542 / #39400 / #50148 / #26952?** No public signal; periodic re-check warranted.
- **How does macOS Sequoia Gatekeeper** interact with a `.skill.zip` downloaded from the web? If Anthropic ever registers `.skill.zip` as a file association, quarantine-attribute handling becomes a UX surface.

---

## References

### Evidence Files

- [evidence/skills-package-and-versioning.md](evidence/skills-package-and-versioning.md) — Dim 1 (package shape) + Dim 3 (versioning/update UX). Headline: frontmatter allowlist = 6 fields; `version:` rejected; Anthropic's own skills have zero versioning; Cowork "Save and Replace" is broken.
- [evidence/skills-hosting-and-publisher-survey.md](evidence/skills-hosting-and-publisher-survey.md) — Dim 2 (hosting) + Dim 6 (publisher survey) + Dim 7 (trust/provenance). Headline: `gh skill publish` launched 2026-04-16; only 1 of 12 publishers ships a Cowork-ready ZIP; trust primitives are all missing.
- [evidence/in-product-install-handoff.md](evidence/in-product-install-handoff.md) — Dim 4 (install hand-off patterns). Headline: Claude Desktop has zero automation hooks; Category D (download + guided walkthrough) is the only path; `shortcuts://import-shortcut/?url=` is the exemplar Anthropic hasn't built.
- [evidence/cowork-session-reset-mitigations.md](evidence/cowork-session-reset-mitigations.md) — Dim 5 (session-reset mitigations). Headline: 3+ months of zero Anthropic engagement on #26254/#31542/#39400; GitHub sync doesn't fix the mount bug; `CLAUDE.md` promotion is the most robust publisher workaround.

### Primary external sources

**Anthropic / Claude docs:**

- [Skills — Use Skills in Claude (support)](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Skills — How to create custom Skills (support)](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)
- [Skills — Provision and manage Skills for your organization (support)](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)
- [Skills — Browse skills, connectors, and plugins in one directory (support)](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory)
- [Claude Cowork plugins for organizations (support)](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization)
- [Use plugins in Claude Cowork (support)](https://support.claude.com/en/articles/13837440-use-plugins-in-claude-cowork)
- [Building Desktop Extensions with MCPB (support)](https://support.claude.com/en/articles/12922929-building-desktop-extensions-with-mcpb)
- [Agent Skills overview (platform.claude.com)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Code Skills (code.claude.com)](https://code.claude.com/docs/en/skills)
- [Desktop Extensions engineering post (anthropic.com)](https://www.anthropic.com/engineering/desktop-extensions)

**Spec + publisher ecosystem:**

- [Agent Skills open spec (agentskills.io)](https://agentskills.io/specification)
- [anthropics/skills repo](https://github.com/anthropics/skills)
- [`quick_validate.py` (anthropics/skills)](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/scripts/quick_validate.py)
- [`package_skill.py` (anthropics/skills)](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/scripts/package_skill.py)
- [Manage agent skills with GitHub CLI (github.blog, 2026-04-16)](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/)
- [vercel-labs/skills (CLI)](https://github.com/vercel-labs/skills)
- [skills.sh (Agent Skills Directory)](https://skills.sh)
- [modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb)

**Key bug reports (Cowork mount class + session reset):**

- [#26254 — metadata registered, SKILL.md not mounted](https://github.com/anthropics/claude-code/issues/26254)
- [#31542 — personal plugin skills not mounted in Cowork](https://github.com/anthropics/claude-code/issues/31542)
- [#39400 — marketplace plugins fail to load skills, zip upload works](https://github.com/anthropics/claude-code/issues/39400)
- [#46836 — `.skill` "Save and Replace" silent failure](https://github.com/anthropics/claude-code/issues/46836)
- [#38429 — RemotePluginManager wipes GitHub-sourced plugins on restart](https://github.com/anthropics/claude-code/issues/38429)
- [#31422 — user-created skills in ephemeral session dirs silently deleted](https://github.com/anthropics/claude-code/issues/31422)

**Closed "not planned" / open feature requests:**

- [#26952 — claude:// MCP install URL scheme](https://github.com/anthropics/claude-code/issues/26952)
- [#10366 — deep-linking support](https://github.com/anthropics/claude-code/issues/10366)
- [#50148 — gh skill as remote skill source for Desktop](https://github.com/anthropics/claude-code/issues/50148)

**Cross-ecosystem UX references:**

- [Cursor — MCP install links](https://cursor.com/docs/context/mcp/install-links)
- [Cursor security advisory GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv)
- [VS Code — Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [VS Code — MCP API guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [Chrome — Inline-installation deprecation FAQ (2018)](https://developer.chrome.com/docs/extensions/mv2/inline-faq)
- [Apple Shortcuts — URL schemes](https://support.apple.com/guide/shortcuts-mac/apda283236d7/mac)
- [Raycast Deeplinks API](https://developers.raycast.com/information/lifecycle/deeplinks)
- [Obsidian — Community plugins help](https://obsidian.md/help/community-plugins)
- [GitHub Artifact Attestations docs](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

### Related research

- [[reports/mcp-server-auto-install-harnesses/REPORT]] — MCP harness landscape + Cowork Agent Skills install surface (Dim 12). This report extends that one's Skills dimension from "what's available programmatically" to "how to actually ship for the manual path."
- [[reports/anthropic-knowledge-infrastructure-positioning/REPORT]] — strategic positioning of Agent Skills + Cowork + MCP.
- [[reports/mcp-guidance-delivery-no-project-pollution/REPORT]] — how MCP servers deliver agent-readable guidance without polluting project directories (related to the question of "should Open Knowledge's skill live in the MCP tool description or as a standalone SKILL.md").
