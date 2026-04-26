# Evidence: Cowork Session-Reset Re-Upload Mitigations

**Captured:** 2026-04-24
**Dimension covered:** Dim 5 (Cowork session-reset re-upload mitigations)
**Confidence summary:** MEDIUM-HIGH — GitHub-issue primary sources are thorough and consistent; Anthropic public docs are sparse on the specific session-reset failure mode (a signal in itself); community workarounds are documented in shell-level detail on a handful of issues; third-party publisher coping copy is thin.

## Primary sources consulted

- [https://github.com/anthropics/claude-code/issues/26254](https://github.com/anthropics/claude-code/issues/26254) — canonical "metadata registered, SKILL.md not mounted" bug
- [https://github.com/anthropics/claude-code/issues/31542](https://github.com/anthropics/claude-code/issues/31542) — personal plugin skills not mounted in Cowork
- [https://github.com/anthropics/claude-code/issues/39400](https://github.com/anthropics/claude-code/issues/39400) — marketplace plugins fail to load skills, zip upload works
- [https://github.com/anthropics/claude-code/issues/26131](https://github.com/anthropics/claude-code/issues/26131) — "cowork skils bug" (36 user skills registered, none at runtime)
- [https://github.com/anthropics/claude-code/issues/26172](https://github.com/anthropics/claude-code/issues/26172) — skills not loading to Cowork on Mac (drag-and-drop 500s)
- [https://github.com/anthropics/claude-code/issues/26998](https://github.com/anthropics/claude-code/issues/26998) — Windows 11 Home skills not saving/loading (Hyper-V partial)
- [https://github.com/anthropics/claude-code/issues/31422](https://github.com/anthropics/claude-code/issues/31422) — user-created skills in ephemeral session dirs silently deleted
- [https://github.com/anthropics/claude-code/issues/28641](https://github.com/anthropics/claude-code/issues/28641) — feature request: live-sync from user-managed skill files
- [https://github.com/anthropics/claude-code/issues/35124](https://github.com/anthropics/claude-code/issues/35124) — scheduled-task path points at ephemeral session uploads
- [https://github.com/anthropics/claude-code/issues/38429](https://github.com/anthropics/claude-code/issues/38429) — RemotePluginManager deletes GitHub-sourced plugins on every sync
- [https://github.com/anthropics/claude-code/issues/43270](https://github.com/anthropics/claude-code/issues/43270) — Cowork doesn't load `~/.claude/skills/`
- [https://github.com/anthropics/claude-code/issues/47347](https://github.com/anthropics/claude-code/issues/47347) — uploaded personal plugin: skills not registered in runtime
- [https://github.com/anthropics/claude-code/issues/45097](https://github.com/anthropics/claude-code/issues/45097) — Cowork custom instructions reset to initial value on app restart
- [https://github.com/anthropics/claude-code/issues/46836](https://github.com/anthropics/claude-code/issues/46836) — `.skill` "Save and Replace" silent failure
- [https://github.com/anthropics/claude-code/issues/46844](https://github.com/anthropics/claude-code/issues/46844) — P0 same as above, full cascading-failure narrative
- [https://github.com/anthropics/claude-code/issues/35131](https://github.com/anthropics/claude-code/issues/35131) — v1.1.7053 upgrade loses all Cowork sessions/projects/tasks
- [https://github.com/anthropics/claude-code/issues/45076](https://github.com/anthropics/claude-code/issues/45076) — Cowork session history silently lost between sessions (macOS)
- [https://github.com/anthropics/claude-code/issues/33130](https://github.com/anthropics/claude-code/issues/33130) — Cowork lost after restart
- [https://github.com/anthropics/claude-code/issues/39686](https://github.com/anthropics/claude-code/issues/39686) — claude.ai skills and Cowork plugins silently injected into Claude Code
- [https://github.com/anthropics/claude-code/issues/30064](https://github.com/anthropics/claude-code/issues/30064) — `permissions.additionalDirectories` does not load skills
- [https://github.com/anthropics/claude-code/issues/34667](https://github.com/anthropics/claude-code/issues/34667) — Windows non-standard Documents path breaks scheduled tasks
- [https://github.com/anthropics/claude-code/issues/37590](https://github.com/anthropics/claude-code/issues/37590) — feature: support symlinks in `.claude/skills/`
- [https://github.com/anthropics/claude-code/issues/25367](https://github.com/anthropics/claude-code/issues/25367) — symlinked `~/.claude/skills/` fails validation but executes
- [https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization)
- [https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)
- [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [https://support.claude.com/en/articles/13455879-use-cowork-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13455879-use-cowork-on-team-and-enterprise-plans)
- [https://support.claude.com/en/articles/13837440-use-plugins-in-claude-cowork](https://support.claude.com/en/articles/13837440-use-plugins-in-claude-cowork)
- [https://claude.com/blog/cowork-plugins](https://claude.com/blog/cowork-plugins)
- [https://github.com/anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins)
- [https://github.com/LewenW/claude-distill-me](https://github.com/LewenW/claude-distill-me)
- [https://github.com/deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills)
- [https://alexmcfarland.substack.com/p/you-need-a-private-claude-plugin](https://alexmcfarland.substack.com/p/you-need-a-private-claude-plugin) (paywalled, headline only)
- [https://github.com/JesperLive/ClaudeFix](https://github.com/JesperLive/ClaudeFix) (VM-level remediation toolkit)

## The three anchor issues

### #26254 — [BUG] User and Organization Skills — Metadata Registered in System Prompt but SKILL.md Files Not Mounted in Container

- **Status:** OPEN (labelled `bug`, no area tags, no milestone). Last updated 2026-03-31; 8 comments total.
- **Reporter:** `danrparsons`, 2026-02-16 (filed Feb 17 UTC).
- **Specific breakage:** On Claude.ai web / Cowork (Team/Enterprise plan, Opus 4.6), the system prompt's `<available_skills>` block lists user and org skills with names, descriptions, and paths (`/mnt/skills/user/<name>/SKILL.md`, `/mnt/skills/organization/<name>/SKILL.md`), but at runtime:
  - `/mnt/skills/user/` **does not exist** in the container filesystem.
  - 3 of 4 organization skills are declared but missing on disk (only `people-lookup` is present out of `ld-employee-profiles`, `ld-vault-update`, `ld-vault-read`, `people-lookup`).
  - All 6 public skills and 11 example skills ARE present — so the mount mechanism works; the bug is specific to user/org skill injection.
  - Claude is instructed to `view` skill files that don't exist → silent skill failure, no user-visible error.
- **Last Anthropic-staff engagement:** **None.** Zero comments from `MEMBER` / `CONTRIBUTOR` / `COLLABORATOR` associations. All 8 comments are from `NONE` (community). Labelled `bug` but has no Anthropic assignee, no milestone, no area-tag triage despite other Cowork-skill issues receiving `area:cowork`, `area:skills`, `area:plugins`. Zero staff engagement confirmed as of 2026-04-24.
- **Reproduction steps (verbatim from reporter):**
  1. Upload custom skills via Settings > Capabilities (ZIP files with valid SKILL.md)
  2. Confirm skills appear in the Settings > Capabilities UI as enabled
  3. Start a new conversation in Claude.ai
  4. Ask Claude to use one of the custom skills
  5. System prompt contains metadata and instructs Claude to `view` the file
  6. Claude attempts to read the file — file not found
- **Thread workarounds suggested:**
  - None actionable. The Anthropic Fin AI agent (in the reporter's transcript) suggested: verify single-root zip, verify code execution is enabled, retry in a few minutes — non-workarounds for this class.
  - `rohanlad` (2026-03-17) reports the same class via API (`client.beta.skills.create`) and works around binary-file bundle failures by injecting the bundle via `container_upload` on the user message — accepting that Claude misinterprets the upload as user-attached content.
  - `mi6l10r3` (2026-03-02) documents the stale-cache variant: metadata loads but Cowork reads CACHED content referencing deleted files. Only workaround: paste URLs / constants inline in the chat message.
- **Related issues referenced:** #26131, #25072, #24859, #22163, #19212, #14733, #11266, #21428.

### #31542 — [BUG] Personal plugin skills not mounted in Cowork container despite being enabled in UI

- **Status:** CLOSED as `invalid` + `stale` via auto-close by `github-actions`. Reporter `akolotov` explicitly pushed back on the auto-duplicate classification ("It is not a duplicate for #26254 since as per the investigation availability of the skill within `<available_skills>` is not confined"). Bot closed anyway for inactivity, then locked after 7 days. No human Anthropic staff response.
- **Reporter:** `akolotov`, March 2026.
- **Specific breakage:** Plugin has two components — MCP connector AND skill. On install into Cowork:
  - Connector is mounted; its MCP tools appear in `enabledMcpTools`.
  - Skill is **silently dropped**: not in `/sessions/<name>/mnt/.skills/skills/` (only 6 Anthropic built-ins present: docx, pdf, pptx, schedule, skill-creator, xlsx), not in `slashCommands`, not in `<available_skills>`.
  - Plugin UI shows it as installed + enabled. No error surfaced to user.
- **Key distinguishing observation:** #26254 is about metadata being registered but files missing. #31542 is the inverse — files AND metadata both missing for plugin-skills, even though MCP succeeds. Two disjoint failure modes in the provisioning pipeline.
- **Last Anthropic-staff engagement:** **None.** Entire thread is `github-actions` bot + reporter pushback.
- **Reproduction steps:**
  1. Install the "Blockscout analysis" plugin from marketplace (blockscout-ai)
  2. Verify Customize > Personal plugins shows enabled
  3. Start Cowork session with plugin selected
  4. Run `ls -la /mnt/skills/` and `find /mnt -name "SKILL.md"`
- **Thread workarounds suggested:** None. Issue auto-closed before community consolidated workarounds.
- **Related issues:** #26254, #26131, #16575, #24859.

### #39400 — [BUG] Marketplace plugins fail to load skills in Cowork — zip upload of same plugin works fine

- **Status:** OPEN. Labels: `area:cowork`, `area:plugins`, `area:skills`, `bug`, `platform:macos`. Last updated 2026-04-14; 2 substantive comments.
- **Reporter:** `Ruckth`, 2026-03-26.
- **Specific breakage:** Every plugin installed from the marketplace fails to load its skills in Cowork. The SAME plugin folder zipped and uploaded via Plugins > Add plugin > Upload works perfectly. Two failure modes:
  1. "It looks like there isn't a \[plugin:skill] skill available in your current setup" (chain to #26254)
  2. Loading spinner "Working... Running skill..." hangs without producing a response
- **Last Anthropic-staff engagement:** **None.** Only `yurukusa` (community workaround) and `LewenW` (plugin author, same issue from author side).
- **Reproduction steps (verbatim):**
  1. Install any plugin from the marketplace (e.g., `sabai-remotion` from `sabai-claude-marketplace`)
  2. Open a new Cowork session
  3. Invoke a plugin skill (e.g., `/video`)
  4. Result: spinner hangs OR "no such skill" response
- **Thread workarounds suggested (verbatim):**
  - `yurukusa` (2026-03-30): "use zip upload instead of marketplace install... This bypasses the marketplace delivery pipeline."

    ```bash
    ls ~/.claude/plugins/cache/
    cd ~/.claude/plugins/cache/marketplace-name/plugin-name
    zip -r ~/plugin-export.zip .
    ```
  - `Ruckth` in body: manual re-zip of the exact same plugin folder:

    ```bash
    cd plugins/plugin-name
    zip -r ~/Desktop/plugin-name.zip . -x "*/node_modules/*" -x "*/.DS_Store"
    ```
  - `LewenW` (plugin developer, 2026-04-14): For their plugin `distill-me` which GENERATES a SKILL.md as final output, the recommended workaround is "manually copy the generated SKILL.md content into `~/.claude/CLAUDE.md`. Not ideal, but it works across all environments."
- **Related issues:** #26254, #35641 (/reload-plugins doesn't pick up new marketplace plugin skills), #23910 (custom marketplace plugins show enabled but fail to load skills).

## Team+ GitHub sync

### What it is

Organization-level **plugin** marketplace that pulls from a GitHub repo. Available only on **Team and Enterprise** plans. Documented at [support.claude.com/en/articles/13837433](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization).

Setup flow:

1. Enable both Code execution + file creation AND Skills in Organization settings > Capabilities.
2. Organization settings > Plugins > "Add plugin" > select "GitHub" as source.
3. Enter `owner/repo` format.
4. Verify Claude GitHub App is installed on that repository.

### How it works (push vs pull, poll interval, scope)

- **Pull, triggered by push.** Not continuous polling. Anthropic docs: "Cowork compares the latest commit in your repo against the last-synced commit." Initial sync runs automatically on connection. Subsequent syncs are either (a) automatic when a PR is merged to the repo (requires toggling "Sync automatically" per marketplace — opt-in), or (b) manual via the "Update" button.
- **Sync latency:** "up to 30 minutes depending on the number of plugins."
- **Replacement semantics:** "each sync replaces all plugins in the marketplace with the current state of the repo." Total-state replacement, not diff-apply.
- **Scope: plugins (which may bundle skills), not standalone skills.** The Anthropic docs for **org-wide skill provisioning** ([article 13119606](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)) make **no mention of GitHub sync whatsoever** — skills are uploaded as `.zip` via Organization settings > Skills > "+ Add". GitHub sync only reaches skills transitively when bundled inside a plugin.

### Does it mitigate the session-reset bug?

**Partially, and probabilistically.** Key findings:

1. **The mount bug (#26254, #39400) is not about WHERE skill files live on the host — it's about the container-provisioning pipeline failing to copy registered skills into `/mnt/skills/<user|organization>/` when the VM session spawns.** GitHub sync changes the host-side source of truth from "operator uploaded a zip" to "CI pulled from repo". It does not touch the VM mount pipeline at all. Core metadata-vs-mount failure shape is unaffected.
2. **#39400 evidence suggests GitHub-sourced marketplace plugins specifically get WORSE outcomes than zip-upload plugins** in Cowork: marketplace-pulled skills silently fail to mount whereas the literal-same-files zip-uploaded version works. GitHub sync may be a trigger surface, not a mitigation.
3. **#38429** shows an actively damaging interaction: on every app restart, `RemotePluginManager.syncPlugins()` removes all plugins from third-party GitHub-sourced marketplaces because the cleanup allowlist only protects `source: "manual"` marketplaces, not `source: "github"`. Installed plugins from a GitHub marketplace vanish on restart. `installed_plugins.json` is emptied while orphaned caches remain.
4. The one thing GitHub sync **does** partially mitigate: it removes the manual re-upload step for users when the skill source changes. If a publisher pushes, the org admin doesn't re-upload — Cowork re-syncs. But this is org-admin convenience, not end-user session-reset convenience. The end-user still experiences per-session mount failures identical to the zip case.

### Setup friction

- Requires Team or Enterprise plan (no Pro/Max path).
- Requires Owner or Primary Owner role — regular members cannot connect a GitHub marketplace.
- Requires Claude GitHub App installed on the target repo (OAuth app install + per-repo grant).
- Repo must exist in `owner/repo` format; private repos supported if Claude GitHub App has read access.
- Initial sync can take up to 30 min — first-time setup is not instant.
- Two 1-way-door decisions: "Sync automatically" opt-in toggle (per marketplace); `source: "github"` is permanent for that marketplace (to change source type, delete and re-add).
- "Replaces all plugins" sync semantic means a bad PR can temporarily wipe the org-wide plugin catalog. Help article acknowledges: "failed syncs create friction: plugins may be temporarily removed, and installation preferences are still set correctly — they may have been reset during the failure."

### Publisher-side implications

- Third-party skill publishers CAN guide Team+ users into this flow, but must package their skill as part of a **plugin** (plugin.json + skills/ subdir). A standalone skill `.zip` cannot be GitHub-synced at org level — the skill-provisioning article explicitly lacks GitHub sync.
- The publisher's repo must conform to the plugin marketplace schema: top-level `plugin.json` or `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md` layout. The Anthropic `knowledge-work-plugins` repo is the canonical shape.
- A publisher cannot instruct Pro/Max users into this flow at all. Those users must use zip upload. Fundamental plan-tier fork in the distribution story.
- Even for Team+ users, given the #39400 and #38429 interactions, a publisher promising "GitHub sync = seamless" will get bug reports. Responsible publisher copy: "Team+ admins can connect our repo for versioned updates; end users may still need to re-install from the org marketplace after Desktop app upgrades."

## Community workarounds

### Symlink tricks

**Verdict:** Documented, partially working on macOS/Linux, fragile, not officially supported.

From **#31422** (`~/.config/Claude/local-agent-mode-sessions/.../local_<uuid>/.claude/skills/`, Linux):

```bash
# 1. Centralize skills in persistent store
mkdir -p ~/.claude/skills/

# 2. Symlink into Cowork's per-session skills-plugin directory
ln -s ~/.claude/skills/* \
  ~/.config/Claude/local-agent-mode-sessions/skills-plugin/.../skills/

# 3. Promote ephemeral skills after the fact
promote-skill.sh  # user-authored script to copy from session dir to persistent
```

Reported working on Manjaro/Arch Linux; Cowork VM sandbox resolves symlinks. **Fragility caveats from the reporter**:

- "Requires manual intervention after each skill creation."
- "Depends on symlink resolution behavior that could change."
- Session-UUID path changes per session, so the symlink target must be re-created or glob-expanded each time.

From **#37590** (feature request) and **#25367** (bug): symlink support is inconsistent:

- `.claude/rules/` explicitly supports symlinks (documented).
- `.claude/skills/` does not — `/skills` command doesn't find them (#14836), validation fails but execution succeeds (#25367).
- Plugin cache DOES preserve symlinks (they resolve at runtime), but the `.claude/skills/` scanner does not follow them.

**Does it survive Desktop restart?** Mixed. The symlink persists (host-filesystem), but #38429 shows the app's `RemotePluginManager` on restart actively wipes `installed_plugins.json` for github-sourced plugins — symlinks into `plugin/cache` directories are orphaned, not removed, but the app no longer references them.

**Does it survive OS reboot?** Yes at the filesystem layer, subject to the same `RemotePluginManager` cleanup on next app launch.

**Does it survive Cowork session restart (the primary bug class)?** **No.** The symlink trick targets the persistent `~/.claude/skills/` tree — the mount bug is inside the VM provisioning pipeline, which doesn't read from `~/.claude/skills/` at all for Cowork sessions (that's what #43270 reports). The symlink workaround helps with session history persistence of skills the USER wrote during a session (the #31422 scenario), not with the "VM doesn't mount my uploaded skill" scenario (#26254 / #39400). Two different workarounds for two different bugs conflated in the community as "Cowork skill persistence."

### Ephemeral-session helpers / watchers

**Partial evidence:**

- **`JesperLive/ClaudeFix`** — Windows VM-boot toolkit (VirtioFS mount failed, HCS operation failed). Four tools: prevent / fix / monitor / stop cleanly. Remediates **VM boot**, not skill-mount-in-VM. Not a session-reset skill-reupload daemon.
- **`patrickjaja/claude-cowork-service`** (pkg.go.dev reference) — Go service surfaced in search; scope is Cowork VM lifecycle, not skill re-uploading.
- **`watcher.sh` pattern** referenced in community jailbreak literature — watches for requests and executes them on the host with full permissions. Privilege-escalation / sandbox-escape pattern, not a skill-mount daemon.
- **No community tool found that automates "re-upload skill ZIP on every session start".** Zero evidence of a daemon or watcher that shims the Cowork upload API or writes into the VM-mount source-of-truth on session spawn. This is a gap — the class of tool users would need.

### Re-upload scripts

Ad-hoc re-package-and-upload scripts exist but are ceremonial:

- `yurukusa`'s zip-and-upload (from #39400) is the de facto workaround:

  ```bash
  ls ~/.claude/plugins/cache/
  cd ~/.claude/plugins/cache/marketplace-name/plugin-name
  zip -r ~/plugin-export.zip .
  ```

- The workflow: every time a session resets OR the app restarts OR GitHub sync wipes the plugin, the user manually re-runs this and re-uploads via the UI. No automation wrapper found.

**Per-session manual re-upload has been the de facto workflow for affected users since at least 2026-02-17 (#26254 opening date), with no sanctioned automation path from Anthropic in the subsequent 9+ weeks.**

## Anthropic-side guidance

**NOT FOUND in any public Anthropic doc reviewed.** Specifically:

- [support.claude.com/en/articles/12512180](https://support.claude.com/en/articles/12512180-use-skills-in-claude) — no mention of session-reset persistence.
- [support.claude.com/en/articles/13119606](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization) — no mention of GitHub sync, re-upload, Cowork session persistence, or the 50-skill limit.
- [support.claude.com/en/articles/13455879](https://support.claude.com/en/articles/13455879-use-cowork-on-team-and-enterprise-plans) — notes "Cowork activity is not captured in Audit Logs, Compliance API, Data Exports" but nothing on skill persistence.
- [claude.com/blog/cowork-plugins](https://claude.com/blog/cowork-plugins) — "Plugins are currently saved locally to your machine" and "Organization-wide sharing and private plugin marketplaces are coming in the weeks ahead" (blog predates the Team+ GitHub sync GA; by 2026-04-24 GitHub sync is shipped for Team+).

**Zero public acknowledgment of the re-upload burden.** The Anthropic help-desk Fin AI agent (seen in #26254's original transcript) suggests file-size checks, zip-structure checks, and "try again in a few minutes" — workarounds that do not address the class.

**Zero staff comments across all three anchor issues** (#26254, #31542, #39400) as of 2026-04-24. Triage labels were applied to #39400 (`area:cowork`, `area:skills`, `area:plugins`, `platform:macos`) — evidence of internal awareness without public engagement. #26254 has only `bug` label despite being the most-upvoted of the three. #31542 was auto-closed by the `github-actions` stale bot.

## Third-party publisher coping copy

**Thin — most publishers either don't acknowledge the Cowork mount bug, or they dodge it by recommending alternate channels.** Concrete examples:

- **`LewenW/claude-distill-me`** — plugin that GENERATES a SKILL.md as its deliverable. README claims broad compatibility: "Works everywhere Claude loads `~/.claude/CLAUDE.md`" and lists Cowork compatibility as available. Author's comment on #39400 reveals the truth: "the generated `skills/enhanced-self/SKILL.md` is never picked up by Claude in Cowork. Current workaround I recommend to users: manually copy the generated SKILL.md content into `~/.claude/CLAUDE.md`." This workaround — **promote the skill into `CLAUDE.md`** — is the most robust publisher pattern found. It works because `CLAUDE.md` IS loaded cross-environment, unlike `~/.claude/skills/`.
- **`deanpeters/Product-Manager-Skills`** — README has one line for Cowork: "Cowork: Import skills as knowledge modules, invoke via natural language." No persistence guidance, no acknowledgment of re-upload friction. Falls back to "use the Streamlit beta if session persistence is critical" — punting to an out-of-band interface.
- **`anthropics/knowledge-work-plugins`** — Anthropic's own repo. Installation: `claude plugin marketplace add anthropics/knowledge-work-plugins` + `claude plugin install sales@knowledge-work-plugins`. README does not mention Cowork session-reset behavior. "Once installed, plugins activate automatically. Skills fire when relevant" — a claim the bug tracker materially contradicts.
- **`phuryn/pm-skills`, `abubakarsiddik31/claude-skills-collection`, `timescale/marketing-skills`** (via search result titles) — none surface session-reset coping copy in their top-level READMEs.

**Observed publisher pattern:** When a publisher DOES acknowledge the bug, they hide the skill content inside `CLAUDE.md` or inline-paste it in chat messages, trading triggerability and structured-invocation for reliability. This is a **regression from the Agent Skills value prop** (structured metadata, triggerable by name, progressive disclosure) back to stuffed-context-window.

**No publisher found** that:

- Ships a re-upload script with installation instructions
- Documents GitHub sync as the Team+ install path with "session-reset tolerance" framing
- Acknowledges the mount bug directly in a README with a link to #26254 / #39400

## Contrasting: persistent vs non-persistent skills

### Anthropic's 6 built-in skills (docx, pdf, pptx, xlsx, schedule, skill-creator)

These persist across sessions reliably. Filesystem evidence from #31542:

```
/sessions/friendly-bold-darwin/mnt/.skills/skills/schedule/SKILL.md
/sessions/friendly-bold-darwin/mnt/.skills/skills/xlsx/SKILL.md
/sessions/friendly-bold-darwin/mnt/.skills/skills/pdf/SKILL.md
/sessions/friendly-bold-darwin/mnt/.skills/skills/skill-creator/SKILL.md
/sessions/friendly-bold-darwin/mnt/.skills/skills/pptx/SKILL.md
/sessions/friendly-bold-darwin/mnt/.skills/skills/docx/SKILL.md
```

And from #26254:

```
/mnt/skills/public/docx/SKILL.md
/mnt/skills/public/frontend-design/SKILL.md
/mnt/skills/public/pdf/SKILL.md
/mnt/skills/public/pptx/SKILL.md
/mnt/skills/public/product-self-knowledge/SKILL.md
/mnt/skills/public/xlsx/SKILL.md
```

**Hypothesized mechanism (not confirmed by Anthropic docs):** these skills ship baked into the Cowork VM image or are fetched on VM-spawn from an internal Anthropic-controlled endpoint. They're not routed through the user-plugin-provisioning pipeline that is failing. The directory naming (`/mnt/skills/public/`, `/mnt/skills/examples/`) versus the missing `/mnt/skills/user/` and partially-missing `/mnt/skills/organization/` supports this: two provisioning tracks — built-in and user-provisioned — with the mount bug only on the user-provisioned track.

Supporting evidence: the `<available_skills>` system prompt block distinguishes them by `(public)` / `(example)` / `(user)` / `(organization)` labels. Claude's instruction to `view` a skill follows the declared path; the mount pipeline is what fails for user/org paths.

### Any third-party skills that DO survive session resets

**None identified that survive cleanly in their natural packaging.** What works (with caveats):

- **Plugin-bundled skills INSTALLED VIA CLI** (`claude plugin install <name>@<marketplace>`) persist because they live in `~/.claude/plugins/installed_plugins.json` (global, not touched by `RemotePluginManager` per #38429). But this is Claude Code CLI, NOT Cowork. Same plugin marketplace-installed in Cowork fails to mount its skill (#39400); CLI-installed is invisible to Cowork (#43270).
- **Skill content promoted into `~/.claude/CLAUDE.md`** persists trivially, but sacrifices Agent-Skills structure (no triggerable `/skill-name`, no progressive disclosure, permanent context-window cost).
- **Organization skills uploaded via Organization settings > Skills** — still affected by #26254 (3 of 4 org skills missing from disk in the reporter's repro).
- **Zip-uploaded plugins** — #39400 workaround — DO mount correctly on the session in which uploaded, but no evidence they survive Desktop restart any better than marketplace plugins. The wipe in #38429 is source-specific (`source: "github"`); `source: "manual"` is protected — that's the one case where restart survives. End-user upshot: zip-upload survives Desktop restarts, but the first Cowork session after a restart may still expose #26254 on the zip-uploaded skill.

**Finding: there is no known third-party skill packaging that survives both a Cowork session reset AND a Desktop restart AND loads into a fresh Cowork VM with its SKILL.md accessible at the path declared in `<available_skills>`.** The closest is a `source: "manual"` zip-uploaded plugin on a Team+ plan, but the #26254 mount bug still applies intermittently.

## Synthesis

### Severity of the re-upload burden for Cowork users

**Severe and daily for the subset of users who rely on custom skills in Cowork.** Evidence:

- Issue dates span 2026-01-07 (#16625) through 2026-04-14 (#39400 latest comment) — 3+ months of continuous bug reports on the same class.
- Ecosystem-wide: reports from Luxembourg, Germany, US, macOS/Windows/Linux, Pro/Max/Team/Enterprise plans, API and Desktop.
- Reporters characterize it as blocking: "effectively unusable in Cowork" (jan-nikolov on #26254), "cascading failures to customers" (cravino on #46844), "enterprise adoption blocker" (danrparsons on #26254).
- Re-upload is not occasional — every session reset, every Desktop restart, every `RemotePluginManager` sync triggers a replay of the friction.
- The 6 built-in skills + the `CLAUDE.md` promotion hack are the only reliable paths, and both are structural concessions.

Users who ONLY use the 6 built-in skills + 11 Anthropic examples do not experience this burden. Severity is bimodal: transparent for Anthropic-curated-only users, severe for anyone investing in a custom skill library. Given the audience that evaluates Agent Skills ZIP-release UX is by definition the custom-skill audience, severity for the target audience is **HIGH**.

### Best currently-achievable mitigation for a publisher

Ranked from most-robust to most-convenient:

1. **Promote the skill's core instructions into `CLAUDE.md`** (publisher instructs user to copy-paste or auto-generates via a one-shot script). Survives everything. Loses Agent-Skills structure. Pattern used by `claude-distill-me`.
2. **Ship as a Claude Code CLI plugin via a CLI-installable marketplace** — works in Claude Code, not Cowork. Horizontal pivot, not a Cowork mitigation.
3. **For Team+ users only: ship as a GitHub-synced organization marketplace plugin** — document for the admin how to connect the repo. Removes per-user re-upload once initially provisioned but does NOT fix the underlying #26254 mount bug; admins will see intermittent "skill not loading" reports and need to manually trigger "Update" / restart the user's Desktop. And #38429 means plugins get wiped on Desktop restart unless protected. Net: moves the re-upload burden from end-user to org-admin, partially; does not eliminate it.
4. **Document the zip-upload workaround explicitly in the README**, with a re-package script users can run post-clone. Accept that every session reset may require a re-upload. Most honest publisher UX given current Anthropic behavior.
5. **No-op: hope it works.** The pattern of most third-party READMEs today. Produces user complaints and silent churn.

**Bottom line: if your users are primarily Pro/Max, you have no session-reset mitigation — ship option 1 OR accept the re-upload burden and document it. If your users are Team+ admins, ship as a GitHub-sync-able plugin AND still document the manual refresh dance.**

### Decision triggers for publishers

- **Team/Enterprise plan with security-conscious admin:** recommend GitHub sync. Document the 30-min sync latency and the "Sync automatically" toggle. Warn admins about #38429 (github-sourced plugin wipe on Desktop restart) — suggest using manual sync + an internal pinned commit.
- **Pro/Max audience:** do not recommend GitHub sync (no path exists). Ship the zip + a `CLAUDE.md` fallback extraction. Document #26254 as a known Anthropic-side issue with a link to the GitHub issue.
- **Skill behavior MUST survive session reset (auth state, scheduled task, credential):** do not ship as a skill. Ship as an MCP server + a stable persistent-file contract in the user's home. The MCP connector mount pipeline is more reliable than the skill mount pipeline, per #31542.
- **Skill is the END OUTPUT of another workflow (like `claude-distill-me`):** treat `CLAUDE.md` promotion as the default delivery; the skill format is currently unreliable as a cross-session carrier.

## Confidence + gaps

- **HIGH confidence:** The three anchor issues have zero Anthropic-staff engagement as of 2026-04-24. Verified by full comment-thread enumeration.
- **HIGH confidence:** Team+ GitHub sync exists for PLUGINS, does not exist for standalone SKILLS. Confirmed via help-center article content retrieval.
- **HIGH confidence:** GitHub sync does not mitigate the VM-mount class of bug — orthogonal pipelines. Supported by #39400 (same files, different entry points, different outcomes).
- **MEDIUM-HIGH confidence:** Zero known automation-tool / daemon handling session-reset re-upload. Active search across GitHub, blogs, Reddit indices. Possible in closed / paid communities (Alex McFarland's paywalled Substack is a candidate — content not verified).
- **MEDIUM confidence:** The 6-built-in-skill persistence is via a VM-image-baked-in / separate-track provisioning. Not directly confirmed by Anthropic docs; inferred from filesystem evidence + differential success pattern.
- **LOW confidence:** Symlink tricks' exact cross-platform behavior under current Cowork releases. The v1.1.7053 migration moved the host path from `local-agent-mode-sessions/` to `claude-code-sessions/` (#35131) — any tutorial predating that migration targets a stale path.
- **NOT FOUND:** Any Anthropic staff roadmap / changelog / release-note entry that directly addresses the re-upload burden or commits to a fix. Public position is effectively silent.
- **NOT FOUND:** A third-party publisher that has shipped a fully-working mitigation (GitHub sync path + session-reset-tolerant install + user-facing coping copy) as an end-to-end story.
- **NOT FOUND:** Any official policy or doc specifying the 50-skill limit — it's user-reported, undocumented in official Anthropic help. (Referenced in #35434 for organization skills at 50 and an independent Threads post by `@hisham_cato` confirming the limit for individual skill files.)
- **NOT FOUND:** Any way for a publisher to expose a "GitHub sync install" link for Pro/Max users. Plan-tier fork is hard.

## Direct quotes worth preserving

- **`jan-nikolov` on #26254 (2026-03-31):** "In Cowork: plugins appear as installed in the Extensions UI, but skills are completely ignored in sessions. `/skill-name` commands produce no response. This makes custom plugins effectively unusable in Cowork."
- **`danrparsons` on #26254 (2026-02-16):** "Enterprise adoption blocker: Organization-wide skill deployment (a flagship feature shipped Dec 2025) does not reliably work. Silent failure: Users have no indication that skills aren't loading. The Settings UI shows them as enabled, Claude's system prompt references them, but they silently fail at runtime."
- **`Ruckth` on #39400 (2026-03-26):** "The marketplace pipeline appears to register skill metadata in the system prompt (plugin shows in UI menu) but fails to mount the actual SKILL.md files in the container filesystem at runtime. The zip upload path bypasses this pipeline and correctly mounts all files."
- **`LewenW` on #39400 (2026-04-14):** "For my plugin this is especially painful because the SKILL.md is the final deliverable. Users run a multi-step distillation process, get a 'Saved to: skills/enhanced-self/SKILL.md' confirmation, and then... nothing happens. Current workaround I recommend to users: manually copy the generated SKILL.md content into `~/.claude/CLAUDE.md`."
- **`mi6l10r3` on #26254 (2026-03-02):** "Cowork loads the skill name and triggers correctly, but executes against stale cached content that references deleted files and removed instructions. The actual SKILL.md on disk is ignored. ... This confirms the container mount is incomplete — `.claude.json` is missing from the mount point, and skill files are not being injected."
- **`akolotov` on #31542 (rebuttal to auto-duplicate-close):** "It is not a duplicate for #26254 since as per the investigation availability of the skill within `<available_skills>` is not confined. It is not duplicate for #15178 and #24453 since both of them against Claude Code while the original issue is for Claude Desktop/Claude Cowork."
- **`yurukusa` on #39400 (2026-03-30, only documented workaround):** "Workaround: use zip upload instead of marketplace install. As you discovered, exporting the plugin as a zip and uploading via 'Add plugin → Upload' works. This bypasses the marketplace delivery pipeline. This is a viable workaround until the marketplace delivery pipeline is fixed for Cowork sessions."
- **#31422 reporter on ephemeral skill loss (Manjaro Linux, 2026-03-06):** "A custom anti-flicker skill was collaboratively built over 30-45 minutes of interactive work in a Cowork session... Completely lost when the session was cleaned up. ... Requires manual intervention after each skill creation; depends on symlink resolution behavior that could change."
- **#46844 reporter Nicolas Cravino (2026-04-11, P0):** "User edits skills in Cowork session, packages and installs via 'Save and Replace', UI shows success with no error message, files on disk remain unchanged (old version persists), scheduled tasks execute with outdated skill definitions. ... 11+ scheduled tasks affected. Weeks of cascading failures. User wasted weeks debugging skill logic when real issue was the installer. No discoverability — only found accidentally via grep."
- **Anthropic support-article, plugin GitHub sync:** "When you push changes, you can trigger a sync to update your marketplace—either manually or automatically." + "each sync replaces all plugins in the marketplace with the current state of the repo" + "up to 30 minutes depending on the number of plugins." (from [support.claude.com/en/articles/13837433](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization))
- **Anthropic support-article, org skill provisioning:** (no mention of GitHub sync, re-upload burden, Cowork session-reset behavior, or the 50-skill limit — the absence itself is the finding; [support.claude.com/en/articles/13119606](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)).
