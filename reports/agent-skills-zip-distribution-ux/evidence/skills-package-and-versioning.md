# Evidence: Skills ZIP Package Shape + Versioning/Update UX

**Captured:** 2026-04-24
**Dimensions covered:** Dim 1 (package shape), Dim 3 (versioning + update UX)
**Confidence summary:** HIGH on Dim 1 package shape and upload mechanics (spec site + skill-creator validator both back it; Anthropic's own 12 example skills consistent). HIGH on the headline versioning finding (top-level `version:` is actively rejected by Anthropic's official `quick_validate.py` and by the Claude.ai uploader per issue #37; metadata.version is the only standards-conformant escape). MEDIUM on ZIP size limit (no official number published; inference is 30 MB based on general chat-file limit, not a skill-specific limit). MEDIUM on Cowork session-reset / re-upload UX (confirmed as known, reproducible pain with workaround-level guidance from users, not yet a documented fix from Anthropic).

## Primary sources consulted

- https://code.claude.com/docs/en/skills — Claude Code Skills doc. Full frontmatter reference (name, description, when_to_use, argument-hint, arguments, disable-model-invocation, user-invocable, allowed-tools, model, effort, context, agent, hooks, paths, shell). Share-skills scopes (Project / Plugin / Managed). Live change detection. Describes Claude Code's *superset* of the open Agent Skills standard — notably there is NO `version` field here either.
- https://agentskills.io/specification — Authoritative open-standard spec (Anthropic-originated, now a multi-vendor standard). Defines the six-field frontmatter: two required (`name`, `description`) + four optional (`license`, `compatibility`, `metadata`, `allowed-tools`). Directory layout (`scripts/`, `references/`, `assets/`). Naming rules. Validation tool reference.
- https://github.com/anthropics/skills — Public Anthropic skills repo. README confirms only `name` + `description` are required. 18+ example skills visible in `/skills/`. Has a `/spec/agent-skills-spec.md` file that redirects to agentskills.io.
- https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/scripts/quick_validate.py — The actual Python validator Anthropic ships. Confirms allowlist of frontmatter fields: `{name, description, license, allowed-tools, metadata, compatibility}`. Rejects anything else. Name max 64 chars, description max 1024 chars, compatibility max 500 chars. Description must not contain `<` or `>`.
- https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/scripts/package_skill.py — Anthropic's official packager. Excludes `__pycache__/`, `node_modules/`, root-level `evals/`, `.DS_Store`, `*.pyc`. Writes `.skill` (a ZIP with `ZIP_DEFLATED`). No size check.
- Raw SKILL.md files sampled for frontmatter patterns: `algorithmic-art`, `brand-guidelines`, `canvas-design`, `claude-api`, `doc-coauthoring`, `docx`, `frontend-design`, `internal-comms`, `mcp-builder`, `pdf`, `pptx`, `slack-gif-creator`, `webapp-testing`, `xlsx`. All use only `name`, `description`, and (usually) `license`. NONE use `version`.
- https://github.com/anthropics/skills/issues/37 — "skill-creator: Generated skills fail validation due to missing frontmatter property documentation". Confirms verbatim rejection message: `"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"`. Explicitly lists `version`, `author`, `category` as "Not Supported".
- https://github.com/anthropics/skills/issues/249 — "`skill-creator` skill incorrectly prohibits optional frontmatter fields allowed by Agent Skills spec" (Jan 18 2026). Maps the mismatch between skill-creator's internal doc ("Do not include any other fields") and the open standard's four optional fields.
- https://support.claude.com/en/articles/12512180-use-skills-in-claude — Help Center "Use Skills in Claude". Defines Customize > Skills > + > + Create skill > Upload a skill path. "Skill folder name must match the skill name." "Invalid characters in skill name or description" is a rejection cause. "ZIP file cannot exceed size limits" (size not specified). Delete flow: ... menu > Delete, with confirmation. "Re-uploading restores deleted skills."
- https://support.claude.com/en/articles/12512198-how-to-create-custom-skills — Help Center "How to create custom Skills". Confirms ZIP must contain the skill folder as its root (NOT a subfolder). Name max 64 chars, description max 200 chars (note: this contradicts the spec's 1024 — see gap section). Plan availability: Free, Pro, Max, Team, Enterprise (all plans with code execution).
- https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization — Help Center "Provision and manage Skills for your organization". Org owner path: Organization settings > Skills > "+ Add" > select .zip. "Immediately provisioned to all users in your organization." Prereqs: code execution + Skills both enabled org-wide. Provisioned skills show a "visual indicator." **No approval workflow.** No GitHub sync mentioned.
- https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory — Help Center "Browse skills, connectors, and plugins in one directory". "Skills you install from the directory are view-only—you can use them, but you can't edit." To modify a directory skill, users "must download a copy and upload it as their own." Org tab for Team/Enterprise. No dedup or version-display info surfaced.
- https://github.com/anthropics/claude-code/issues/26254 — "User and Organization Skills — Metadata Registered in System Prompt but SKILL.md Files Not Mounted in Container" (Feb 17 2026). Documents the silent-failure class: skills appear enabled in Settings, but `/mnt/skills/user/` is missing at runtime. Anthropic-provided skills work; user-uploaded skills do not. Regression.
- https://github.com/anthropics/claude-code/issues/39400 — "Marketplace plugins fail to load skills in Cowork -- zip upload of same plugin works fine" (March 26 2026). Same metadata-vs-mount pattern. **Critically: manual ZIP upload via `Add plugin > Upload` IS the reliable workaround.** Author shipped identical files both ways; manual ZIP works, marketplace install doesn't.
- https://github.com/anthropics/claude-code/issues/46836 — "[BUG] .skill file 'Save and Replace' does not overwrite existing skill files in Cowork" (April 12 2026, Claude Code 2.1.92, macOS). When a `.skill` file with a name that already exists prompts "Save and Replace", the in-place overwrite DOES NOT happen. Files on disk stay unchanged. Workaround: `rm -rf ~/.claude/skills/{name}/` then re-install. Closed as duplicate.
- https://github.com/anthropics/claude-code/issues/45076 — "Cowork session history, conversation logs, and project metadata silently lost between sessions (macOS)". Support reclassified as a "current Cowork limitation."
- https://github.com/anthropics/claude-code/issues/45097 — "Cowork custom instructions reset to initial value on app restart".
- https://github.com/anthropics/claude-code/issues/26172 — "Skills are not loading to Claude Cowork on Mac" (predecessor bug referenced by #26254 and #46836).
- https://limitededitionjonathan.substack.com/p/the-definitive-guide-to-claude-skills — Third-party practitioner guide. Confirms semver + `git tag -a v1.0.0` as a *git-level* convention, distinct from any in-skill version field. Confirms "Update process: Re-upload the compressed file for changes to both Web and Desktop platforms—no automatic updates exist."
- https://medium.com/@creativeaininja/how-to-actually-upload-claude-skills-without-breaking-everything-1e8c436df2f2 — Third-party practitioner. Confirms the most common failure mode is zipping files at the wrong level: "The upload would succeed, but the Skill would never trigger." (when SKILL.md is not inside the folder-as-root).
- https://github.com/anthropics/skills/tags and /releases — Both empty arrays via `api.github.com`. Zero tags, zero releases on Anthropic's own skills repo as of 2026-04-24.
- https://github.com/anthropics/skills/commits?path=skills/pdf/SKILL.md — `pdf` SKILL.md has 2 total commits in repo history; latest message "Update docx, xlsx, pdf, pptx skills with latest improvements" (2026-02-04). No version in message.

## Dim 1 — Package shape

### File tree expected by Claude Desktop Skills uploader

**Canonical layout** (from agentskills.io/specification + Anthropic support article):

```
my-skill/                 <- this folder is the ZIP root (NOT a subfolder)
├── SKILL.md              <- required; MUST start with `---` YAML frontmatter
├── scripts/              <- optional: executable code (Python/Bash/JS)
│   └── helper.py
├── references/           <- optional: on-demand doc bundles (REFERENCE.md etc.)
│   └── REFERENCE.md
├── assets/               <- optional: templates, images, data files
│   └── template.docx
└── ...                   <- any additional files or directories allowed
```

The ZIP must wrap this folder at its root. Per the `support.claude.com/12512180` article: *"Skill folder name must match the skill name."* Per `support.claude.com/12512198`: *"The ZIP should contain the Skill folder as its root (not a subfolder)."* The most common real-world rejection is flattening the contents into the ZIP root (no wrapper folder) — uploads *succeed* but the skill never triggers (per Dunham on Medium: *"The upload would succeed, but the Skill would never trigger."*).

`package_skill.py` — Anthropic's official packager — outputs a `.skill` file, which is a standard ZIP with `ZIP_DEFLATED`. It excludes these paths at any level: `__pycache__/`, `node_modules/`, `.DS_Store`, `*.pyc`. Root-only: `evals/`. These are *exclusions* in Anthropic's tooling; the uploader does not (publicly) reject them.

SKILL.md is case-sensitive `SKILL.md` in the open spec, though both the help center articles and the `quick_validate.py` validator match `SKILL.md` exactly. The Help Center article uses "Skill.md" in prose (likely a casing typo). Safe assumption: use `SKILL.md` (all caps for `SKILL`).

Nested / recursive SKILL.md files: the open spec does NOT describe nested skills inside one archive (a skill is a single directory). Claude Code's docs describe monorepo auto-discovery (`.claude/skills/<skill-name>/SKILL.md` in multiple dirs), but this is a filesystem convention for the CLI, not a packaging convention for the Desktop/web uploader. For the Desktop ZIP path, assume one skill = one top-level folder = one SKILL.md.

Symbolic links: unspecified in any source. Given the `package_skill.py` script uses `rglob('*')` + `is_file()`, symlinks to files inside the skill dir likely follow; symlinks escaping the skill dir are not contemplated. Treat as UNDOCUMENTED — do not ship skills that rely on symlinks.

### SKILL.md frontmatter fields

**Open Agent Skills spec (agentskills.io/specification):**

| Field           | Required | Max     | Constraints                                                                 |
| --------------- | -------- | ------- | --------------------------------------------------------------------------- |
| `name`          | Yes      | 64 char | Lowercase `[a-z0-9-]`, no leading/trailing hyphen, no `--`. Must match parent directory name. |
| `description`   | Yes      | 1024 char | Non-empty. "What the skill does AND when to use it."                       |
| `license`       | No       | (unbounded) | "License name or reference to a bundled license file."                     |
| `compatibility` | No       | 500 char | Environment reqs (intended product, packages, network access).             |
| `metadata`      | No       | —       | Arbitrary key-value mapping. *"Clients can use this to store additional properties not defined by the Agent Skills spec."* |
| `allowed-tools` | No       | —       | Space-separated. Experimental. Support varies by client.                   |

**Claude.ai uploader enforcement (per quick_validate.py + issue #37):**

- Allowlist: `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`. Anything else hard-fails with: *"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"*.
- `description` must not contain `<` or `>` characters (quick_validate.py rule; probably anti-injection for system-prompt injection into Claude).

**Discrepancy worth flagging:** `support.claude.com/12512198` says `description` max is 200 characters. `quick_validate.py` and the open spec both say 1024. Either (a) support article is stale, (b) uploader was tightened separately, or (c) 200 chars is the UI display/truncation limit, not the storage limit. Recommend treating 200 chars as the effective planning limit for descriptions to maximize triggering reliability, while knowing the storage cap is 1024.

**Claude Code (docs.claude.com/code.claude.com) is a SUPERSET** — Claude Code's `SKILL.md` additionally accepts: `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`. These are Claude-Code-only; **they will be rejected by the Claude.ai Desktop/web uploader.** A skill meant to ship to both surfaces must keep frontmatter inside the open-standard six-field allowlist, and put Claude-Code-only customizations either in the body or in `metadata.*`.

**No `version:` field.** This is repeated across: (a) the open spec table, (b) quick_validate.py's allowlist, (c) issue #37's rejection message, (d) all 12 Anthropic example skills I inspected. If third-party publishers want to carry a version, they must use `metadata.version: "1.0"` (nested under the `metadata` map), or store it outside the SKILL.md frontmatter entirely (bundled file, git tag, filename).

### Allowed bundled resources

Per spec + code.claude.com/skills:

- **Helper scripts** in `scripts/`: Python, Bash, JavaScript are common; *"supported languages depend on the agent implementation"*. Claude.ai support article lists Python (pandas, numpy, matplotlib), JavaScript/Node.js. Skills run in Claude's code execution sandbox — the skill itself does not ship the runtime.
- **References** in `references/`: additional markdown (REFERENCE.md, FORMS.md, domain-specific files). Agents load these on demand, so the main SKILL.md stays lean.
- **Assets** in `assets/`: static resources — templates, images, data files, fonts, schemas. The PPTX skill ships LICENSE.txt + pptxgenjs helpers; the DOCX skill ships similar.
- **License file**: LICENSE.txt is a convention; the `license:` frontmatter can reference it verbatim (Anthropic uses `license: Proprietary. LICENSE.txt has complete terms` for its source-available docx/pptx/xlsx/pdf skills, and `license: Complete terms in LICENSE.txt` for MIT-licensed examples).
- **Binary assets**: allowed (fonts, images, templates). No declared whitelist of extensions.
- **Nested directories**: allowed; spec says *"Any additional files or directories"* are permitted beyond the three conventional ones.
- **Recursive SKILL.md**: not contemplated by the spec; no evidence the uploader supports sub-skills within one ZIP.
- **Symbolic links**: NOT FOUND in primary sources. Unsafe to rely on.
- **Dependencies declaration**: Per `support.claude.com/12512198`, the `dependencies` frontmatter field is mentioned as optional with example `"python>=3.8, pandas>=1.5.0"`. **This contradicts the open-spec allowlist** — `dependencies` is NOT in the six-field allowlist and would fail quick_validate.py. Treat this as either (a) an older/undocumented Claude.ai-only extension, (b) a doc error, or (c) `metadata.dependencies` misreported. **Do not rely on `dependencies:` working.** If environment reqs need to be declared, use `compatibility:` per the open spec.

### Size + naming constraints

**Size limits — primary sources DO NOT specify a skills-specific ZIP size limit.** The support article `12512180` says *"ZIP file cannot exceed size limits"* with no number. The closest external anchor is Claude's general file upload limit:
- Claude chat/project/web general upload: **30 MB per file** (per third-party aggregators; corroborated multiple sources).
- Claude Files API: **500 MB per file** / **File too large (413)** error above.
- No skill-specific ZIP limit is published. Treat as UNCONFIRMED; a reasonable planning number is 30 MB (chat-surface file limit), assuming the skill uploader piggybacks on the same ingress.

**No per-file size limit** is published. `package_skill.py` does not enforce one.

**Naming constraints (HIGH confidence):**

- ZIP filename: no documented constraint. Convention is `<skill-name>.zip` or `<skill-name>.skill`.
- Top-level folder inside the ZIP: MUST match `frontmatter.name` (per support article + spec's *"Must match the parent directory name"*).
- `name` field: 1-64 chars, `[a-z0-9-]`, no leading/trailing hyphen, no consecutive hyphens. The directory-name match is enforced.
- `description`: 1-1024 chars per spec; 200 char ceiling per support article; no `<` or `>` per quick_validate.py.
- `compatibility`: 1-500 chars.

The skill name IS the identifier Claude uses. It is what appears in Claude.ai's Customize > Skills list and what Claude Code binds to `/skill-name` as a slash command. The ZIP filename is cosmetic (display/download only).

### Validation + rejection messages

Primary verbatim rejections collected:

- From `quick_validate.py` and issue #37: `"unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"` (note: `compatibility` is missing from this message but IS in the validator's allowlist — the message string itself is stale).
- Support article: *"Invalid characters in skill name or description"* — triggered when `name` violates the `[a-z0-9-]` regex, or `description` contains forbidden chars.
- *"ZIP file cannot exceed size limits"* (exact size unspecified).
- From `support.claude.com/12512180`: Deleting requires a confirmation dialog before the skill is removed.
- From spec: validation CLI `skills-ref validate ./my-skill` available in the `agentskills/agentskills` repo.

**Silent failure modes** (more dangerous than explicit rejections):

- ZIP without the wrapper folder ("files at the ZIP root") — upload succeeds, skill never triggers. Repeated in multiple third-party guides.
- Files mount fails while metadata registration succeeds — skill shows enabled in UI but does nothing at runtime (issues #26254, #39400).
- Old SKILL.md persists after "Save and Replace" re-upload in Cowork (issue #46836).

### Personal vs Team+ org upload differences

| Dimension              | Personal (Pro/Max)                         | Team / Enterprise                                     |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Upload path            | Customize > Skills > + > + Create skill    | Organization settings > Skills > + Add                |
| Who sees it            | Only the uploader                          | Every org member by default                           |
| Approval workflow      | N/A                                        | **None.** Any member can publish org-wide (per `support.claude.com/13119606`) |
| Visual indicator       | No                                         | Yes — org skills show a "visual indicator"            |
| Deletion authority     | Uploader only                              | Org owner or original sharer only                     |
| Enabled-by-default     | User toggles in personal list              | Enabled across org by default; users can toggle off individually |
| Prereqs                | Code execution enabled                     | Code execution + Skills both enabled at org level     |
| GitHub sync            | **NOT mentioned in any support article**   | **NOT mentioned in any support article**              |
| Update mechanism       | Re-upload (bug #46836 makes this unreliable in Cowork) | Unspecified; presumably re-upload via Org settings    |

The headline cross-tier divergence: the Claude skills directory (`support.claude.com/14328846`) lets users install third-party-published or directory-listed skills read-only. To customize an installed directory skill, the user must *"download a copy and upload it as their own"* — there is no forked/overlay pattern, only clone-and-republish. For Team+ orgs, shared-by-colleague skills bypass the directory entirely: they *"don't appear in the directory—they go straight to your skills list."*

GitHub sync for enterprise plans was *referenced in the original research prompt* but I did NOT find a primary source describing it. The `support.claude.com/13119606` article only describes ZIP upload to Organization settings. If GitHub-sync exists, it's undocumented in the public help center as of 2026-04-24. **Flag as NOT FOUND.**

## Dim 3 — Versioning + update UX

### Where version lives

**Short answer: there is no blessed version field.** The open Agent Skills spec does NOT define a `version:` frontmatter key. The Claude.ai uploader actively rejects it with an explicit error message. The Claude Code Skills frontmatter (superset of 13+ fields) also does not include `version:`.

The only standards-conformant escape hatches for carrying a version inside a SKILL.md:

1. `metadata.version: "1.0"` — nested under the `metadata` map. The spec's own example shows this exact pattern: `metadata: { author: example-org, version: "1.0" }`. Because `metadata` is defined as *"arbitrary key-value mapping,"* any string is legal; clients that don't know about the key ignore it. This is the ONLY in-SKILL.md path that passes quick_validate.py.
2. A bundled `VERSION` file, `CHANGELOG.md`, or `LICENSE.txt` that mentions version — not machine-readable but human-discoverable.
3. The ZIP / `.skill` filename — e.g. `my-skill-1.2.0.zip`. Purely cosmetic; not surfaced in Claude UI.
4. Git tags on the skill's upstream repository — e.g. `git tag v1.2.0`. Invisible to the Claude Desktop installer; only meaningful to human maintainers or to distribution tooling like marketplaces.

**Does Claude Desktop display a version anywhere?** Per the Help Center articles, the Customize > Skills list shows: skill name, creator (Anthropic vs. custom), enable toggle, brief description, timestamp of when enabled/uploaded. **No version column, no version tooltip, no version in the settings pane.** The Desktop UI is version-blind.

### How users replace installed skills

Primary path (Claude.ai web + Desktop):
1. Re-upload a ZIP whose inner folder has the same `name:` as the installed one.
2. The system prompts with a "Save and Replace" dialog (Cowork) or silently overwrites (reported behavior on web).
3. Per `support.claude.com/12512180` (for shared skills at least): *"If you update the skill later, recipients automatically get the updated version."*

**Known broken path in Cowork (issue #46836):** "Save and Replace" on a `.skill` file with a same-name skill DOES NOT update the files on disk. The dialog claims success; the old SKILL.md persists verbatim. Workaround: manually delete `~/.claude/skills/{name}/` and re-install. Filed 2026-04-12 against Claude Code 2.1.92; closed as a duplicate of prior reports.

**Personal skill delete flow:** Customize > Skills > click skill > toggle off > ... menu > Delete > confirm. Re-uploading restores a deleted skill.

**Org skill update flow:** Not explicitly documented in `support.claude.com/13119606`. The article says owners can "remove" skills but does not describe re-upload semantics or replace-with-prompt behavior. **NOT FOUND as a primary-sourced spec.**

### Dedup / overwrite behavior

The match key is `frontmatter.name` (== top-level folder name in the ZIP). Same `name` → replace attempt. Different `name` → new skill, stacked as a separate entry.

Whether a same-name upload with different *content* dedupes or stacks: documented behavior says it replaces (web/API). Cowork Desktop reality: broken ("Save and Replace" silently no-ops — #46836). Users who need the update must manually delete the directory on disk first.

**The UI does not offer content-aware dedup.** A third-party publisher who ships v1.2 under a different `name:` (e.g. `my-skill-v1-2`) will create a separate installation; users will have BOTH v1.1 and v1.2 enabled simultaneously unless one is manually disabled. This is a failure mode to design against — publishers should keep `name:` stable across versions and let versioning live outside the identifier.

### Update-check mechanisms (if any)

**NONE.** Per Jonathan Blow's "Definitive Guide" Substack: *"Update process: Re-upload the compressed file for changes to both Web and Desktop platforms—no automatic updates exist."*

No "check for updates" button, no per-skill version display, no notification when a directory-listed skill gets updated, no RSS/webhook feed for "newer version available." The Skills directory (`support.claude.com/14328846`) lists skills for install but does not surface version metadata in any way the evidence shows.

**One partial carve-out:** *"If you update the skill later, recipients automatically get the updated version"* — this applies only to skills that were directly shared from you to a named colleague within a Team+ org, per `support.claude.com/12512180`. This is an in-band share-link, NOT a general update channel. The mechanism appears to be that the recipient's enabled instance points at the uploader's canonical copy; when the uploader re-uploads, the recipients see the new version without doing anything. How this behaves in the broken-Cowork-save-and-replace case is undocumented.

### Version schemes in anthropics/skills (reverse-engineered)

Evidence from the repo (2026-04-24):

- **Zero git tags.** `GET /repos/anthropics/skills/tags` returns `[]`.
- **Zero GitHub releases.** `GET /repos/anthropics/skills/releases` returns `[]`.
- **No `version:` frontmatter** in any of the 12 example skills I sampled (algorithmic-art, brand-guidelines, canvas-design, claude-api, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, slack-gif-creator, webapp-testing, xlsx). All use only `name`, `description`, and (usually) `license`.
- **Update commits are unversioned.** The `pdf` skill's most recent update commit message is: `"Update docx, xlsx, pdf, pptx skills with latest improvements (#330)"` (2026-02-04). No version number. No `v1.x` tag on the associated release.

**Conclusion: Anthropic has no version convention for their own skills.** They ship updates via git commits to `main`, with no public versioning primitive. Third-party publishers who want semver/CalVer/any versioning are on their own.

### Community conventions for third-party skill versioning

Sparse and fragmented evidence:

- Jonathan Blow's Substack recommends `git tag -a v1.0.0 -m "..."` — semver via git, not via skill metadata. This works for repo-hosted skills but is invisible to the Claude Desktop installer.
- The `travisvn/awesome-claude-skills` curated list (surfaced via WebSearch) exists as a skill directory but search preview did not reveal a versioning convention.
- The awesome-list pattern, combined with third-party guide observations, points toward an informal convention:
  - **Version in filename** (`my-skill-1.2.0.zip`) — informal, user-facing.
  - **Version in git tags** — for GitHub-distributed skills.
  - **Version in `metadata.version`** — for those aware of the open spec's `metadata` map.
  - **No version at all** — most common, matches Anthropic's own practice.

The marketplace ecosystem (third-party skill catalogs like `skillsdirectory.com` surfaced in searches) appears to exist, but the public docs there don't show a mandated version field.

**Bottom line:** there is no settled third-party convention. Publishers who care about versioning have to pick one of the four paths above and document it themselves. The path that survives Claude.ai's uploader AND is machine-readable IS `metadata.version` — but nothing in the Desktop UI will display it.

### Interaction with Cowork session-reset bug class

The session-reset symptom matters here because every skill re-installation in Cowork hits the known-broken "Save and Replace" path (#46836). The chain:

1. **User's prior session state vanishes** — issues #45076 (session history lost overnight), #45097 (custom instructions reset), #33130 (Cowork doesn't work after restart). Support classified this as *"a current Cowork limitation"* where session history *"is not guaranteed to persist,"* and Cowork *"does not sync to the web."*
2. **User re-uploads skill ZIP to restore functionality.**
3. **Hit bug #46836 if a same-name skill is already half-present on disk** — "Save and Replace" silently no-ops; the user thinks they installed the latest but is running the old code. Or hit #26254 / #39400 — skill appears enabled but files aren't mounted.
4. **Effective workaround:** manual `rm -rf ~/.claude/skills/{name}/` → re-install, OR use the ZIP upload path instead of `.skill` double-click, OR avoid same-name reinstalls entirely by bumping `name:` (but then the user ends up with stacked installations).

**Implication for third-party publishers on Dim 3:** in Cowork specifically, users who re-upload every session due to state loss are NOT guaranteed to get the latest version if they double-click a `.skill` file with a name that already exists on disk. A publisher who ships v1.1 then v1.2 on the same `name:` risks users running v1.1 forever because Cowork's replace-on-re-upload is broken.

Two publisher-side patterns that survive this:
- **Stable name + clear re-upload instructions**: tell users to delete the skill in the UI first, then re-upload the new ZIP. This bypasses the broken silent-replace path.
- **Version-in-name (NOT recommended)**: ship `my-skill-v2` instead of `my-skill` when the internals change. Works but stacks installations and confuses the trigger description, since Claude may now see both versions' descriptions in context.

**The "re-upload every session" cache question:** for a user whose session resets constantly, it IS reasonable to cache a "known good" version — the skill doesn't need to auto-update mid-session, and Anthropic's own update cadence (per git history) is slow and unversioned. The friction is in RELIABILITY of re-upload, not in FRESHNESS. A publisher who writes a re-upload helper (CLI, MCP tool, script) that handles the manual-delete workaround for Cowork gives users a smoother path than an auto-update story would.

## Confidence + gaps

**HIGH confidence findings:**
- Canonical ZIP structure (folder-as-root, SKILL.md required at top of folder).
- Frontmatter allowlist exactly = 6 fields (name, description + license, compatibility, metadata, allowed-tools).
- `name:` rules (lowercase kebab-case, ≤64 chars, matches folder).
- `version:` top-level is rejected by Anthropic's validator.
- Anthropic's own example skills use zero `version:`, zero git tags, zero GitHub releases.
- Claude Desktop UI does not display a version anywhere.
- Cowork "Save and Replace" is broken (bug #46836, closed as duplicate — i.e. known issue class).

**MEDIUM confidence findings:**
- `description` max char count — spec says 1024, support article says 200. Real storage limit is likely 1024; UI display/truncation is 200.
- ZIP size limit — no skill-specific number published. Planning assumption: ≤30 MB (Claude's general upload cap).
- Dedup-by-name semantics on the web surface — described as "replace" in support docs; Cowork Desktop behavior contradicts this. Web/API behavior not independently confirmed.

**LOW confidence / NOT FOUND:**
- GitHub-sync for Team+/Enterprise skill provisioning. The research prompt hinted this exists; I did not find a primary source. Only ZIP upload via Org settings is documented. Flag as NOT FOUND in primary sources.
- Per-file size limits inside a skill ZIP.
- Symbolic link behavior inside a skill ZIP.
- Recursive / nested SKILL.md inside a single ZIP.
- Cowork-specific ZIP size limit vs web.
- Whether the `dependencies:` field mentioned in `support.claude.com/12512198` is real or a doc error. quick_validate.py rejects it; the support article claims it works. **Do not ship SKILL.md with `dependencies:` as a top-level field.**
- Whether Claude.ai runs ZIP-level malware/AV scanning before accepting an upload.
- What happens if two skills in the same account declare the same `name:` — the dedup model — is not described in the research-visible docs. Inferred replace semantics, unverified by a direct test.

## Direct quotes worth preserving

**From `quick_validate.py` error message (via issue #37):**
> "unexpected key in SKILL.md frontmatter: properties must be in ('name', 'description', 'license', 'allowed-tools', 'metadata')"

(Note: `compatibility` is in the validator's allowlist but not in this error string — the message itself is stale.)

**From https://support.claude.com/en/articles/12512198-how-to-create-custom-skills:**
> "The ZIP should contain the Skill folder as its root (not a subfolder)."

**From https://support.claude.com/en/articles/12512180-use-skills-in-claude on shared skill updates:**
> "If you update the skill later, recipients automatically get the updated version."

**From https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization on org governance:**
> "There's no approval workflow for org-wide sharing. If you enable Share with organization, any member can publish a skill to the directory without review."

**From https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory on directory skills:**
> "Skills you install from the directory are view-only—you can use them, but you can't edit the skill contents."

**From https://agentskills.io/specification on the `metadata` field (the only path to carry a version):**
> "Clients can use this to store additional properties not defined by the Agent Skills spec. We recommend making your key names reasonably unique to avoid accidental conflicts."

**From issue #46836 (the Cowork Save-and-Replace bug):**
> "The install appears to succeed with no error, but files on disk remain unchanged. The old SKILL.md persists with no updates."
> Workaround: "Delete `~/.claude/skills/{skill-name}/` directory. Re-install the `.skill` file."

**From issue #39400 (marketplace vs manual upload):**
> "User exported the exact same plugin folder as a ZIP. Uploaded via `Plugins > Add plugin > Upload`. Invoked `/video` skill — works perfectly. This demonstrates the issue lies in the marketplace pipeline, not the plugin itself."

**From third-party guide (Kristopher Dunham, Medium) on the #1 failure mode:**
> "I kept zipping the files wrong, which meant Claude.ai couldn't find the SKILL.md file. The upload would succeed, but the Skill would never trigger."

**From Jonathan Blow's "Definitive Guide" on update UX:**
> "Update process: Re-upload the compressed file for changes to both Web and Desktop platforms—no automatic updates exist."
