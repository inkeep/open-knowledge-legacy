# Design Challenge Findings

**Artifact:** `specs/2026-04-24-skill-dual-track-install/SPEC.md`
**Challenge date:** 2026-04-24
**Total findings:** 7 (4 High, 2 Medium, 1 Low)

Reviewed cold against:

- [[specs/2026-04-24-skill-dual-track-install/SPEC]] §1–§16
- `evidence/` (5 files)
- Referenced research: [[reports/agent-skills-zip-distribution-ux/REPORT]] (Dim 5, Dim 8) + [[reports/mcp-server-auto-install-harnesses/REPORT]] (Dim 12)
- Codebase touchpoints cited in the spec (`EditorArea.tsx`, `SeedDialog.tsx`, `editors.ts`, `init.ts`, `release.yml`, `skill-install.ts`, `README.md`)

---

## High Severity

### [H] Finding 1: Phase 3 (plugin marketplace) is knowingly regressive vs the wedge it sits on top of

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC3 (Framing validity)
**Location:** §2 G6, §6 FR13–FR15, §10 D1 + D13, §15 Phase 3

**Issue.** The spec's own source research ([[reports/agent-skills-zip-distribution-ux/REPORT]] Dim 5) and its own `evidence/plugin-marketplace-schema.md` state that the plugin marketplace path produces **worse** Cowork outcomes than ZIP upload:

- **#39400** — marketplace-sourced plugin skills silently fail to mount in Cowork; the exact same files ZIP-uploaded work. The research evidence file calls this out verbatim: *"#39400 evidence suggests GitHub-sourced marketplace plugins specifically get WORSE outcomes than zip-upload plugins in Cowork."*
- **#38429** — `RemotePluginManager.syncPlugins()` wipes `source: "github"` marketplaces on every Desktop restart. Installed plugins from GitHub vanish; only `source: "manual"` uploads are protected.
- The mount bug class (#26254/#31542/#39400) has had **zero Anthropic-staff engagement for 3+ months**. The research report explicitly advises: *"treat the bug as permanent for planning purposes."*

The spec's Future-Work entry FW4 previously captured the same reasoning (`"Deferred per research report Dim 5 given #39400 / #38429"`), but FW4 is now shadowed by Phase 3 and Goal G6 without any new evidence that the upstream bugs have improved.

**Current design:** "Phase 3 (target: 1 week) — Add `.claude-plugin/marketplace.json` at repo root … test marketplace connection with a throwaway Team/Enterprise workspace."

**Alternative.** Keep FW4 as-is (deferred) and do not ship Phase 3 in this spec. Revisit only when (a) #39400 or #38429 is triaged/fixed upstream, or (b) we have a real paying Team+ customer who explicitly asks and accepts the "re-install after every Desktop restart" burden in writing. In the interim, the docs page's Team+ section can simply describe the ZIP-upload-to-org-settings flow, which is documented in the research report and is not affected by #38429.

**Trade-off.** Lose: a discovery surface for Team+ admins that (per the research) currently doesn't work reliably and actively *removes* the plugin on restart. Gain: \~1 week of calendar, one less inline directory at repo root (Finding 2), no ongoing maintenance burden for a surface whose upstream is broken with no ETA, no customer-support tickets from Team+ admins whose plugin disappeared on a restart pointing at our README.

**Status:** CHALLENGED
**Suggested resolution:** Reopen D1 and D13. Either (a) defer Phase 3 entirely until the upstream bugs get staff engagement, or (b) ship Phase 3 narrowly as the docs-only section of FR15 (explaining the zip-upload flow to Team+ admins via Organization settings → Skills → +) and drop FR13/FR14 plus the `.claude-plugin/` + `open-knowledge-plugin/` repo-root directories. This aligns with what the research report actually recommends for Team+ (document the path with caveats, don't become the path).

---

### [H] Finding 2: D14's symlink-from-plugin-subdir-to-packages/server creates a fragile, cross-boundary coupling for a single 21 KB file

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** §10 D14, §6 FR14, `evidence/plugin-marketplace-schema.md` "Pragmatic simplification"

**Issue.** The proposed layout places `.claude-plugin/marketplace.json` at repo root and `open-knowledge-plugin/skills/open-knowledge/SKILL.md` as a **symlink** that traverses three levels up into `packages/server/assets/skills/open-knowledge/SKILL.md`. The spec itself flags this as fragile ("fallback to CI copy if Windows-git config breaks symlink tracking") and marks OQ12 ("does symlink resolve when Claude pulls the plugin from GitHub?") as **unresolved** with `Confidence: MEDIUM`.

Concrete concerns:

1. **Windows `core.symlinks=false`** is the default for many Windows git installs that don't run as admin; git-cloned checkouts contain the *link text* as a plain file, which Claude's plugin loader will almost certainly misread.
2. **GitHub release tarball / git-archive** preserves symlinks as symlinks — but Claude Desktop's `source: "github"` plugin pull may or may not (research didn't verify this; spec admits it).
3. The source file lives in `packages/server/assets/skills/open-knowledge/SKILL.md`, which is inside a *private-facing* package-implementation directory. Exposing it via a repo-root symlink creates an implicit "do not move or rename this file" constraint that future maintainers won't see.
4. The "fallback to CI copy" is a real second code path that needs to be specified (when is it triggered? how is the source-of-truth preserved? what detects drift?) — not a fallback, a second implementation.

Given the whole payload is 21 KB of markdown, most of the complexity is self-inflicted.

**Current design:** `"Symlink open-knowledge-plugin/skills/open-knowledge/SKILL.md → packages/server/assets/skills/open-knowledge/SKILL.md. Fallback to CI copy if Windows-git config breaks symlink tracking."`

**Alternatives (pick one):**

- **(A) Commit the SKILL.md twice.** Accept the duplication. Add a one-liner CI check (`diff -q` between the two paths) that fails if they drift. No symlink, no build-time copy, no OS quirks. Zero-cost every day; fails fast if someone edits one but not the other.
- **(B) Move the canonical SKILL.md to the repo root.** Put the source at `open-knowledge-plugin/skills/open-knowledge/SKILL.md` (or a neutral `skill/` top-level dir) and have `packages/server/assets/` reference it via a build-time read or a `bunfig.toml` path alias. Single source of truth, no symlinks.
- **(C) Commit-time hook (pre-commit).** Hook copies canonical file into the plugin location on commit; fails if either was edited without the other.

Each alternative is simpler than a runtime-resolved symlink whose behavior in Claude Desktop's plugin loader is marked MEDIUM confidence and deferred to "Phase 3 kickoff."

**Trade-off.** Alternative A: \~10 lines of additional CI YAML, trades for eliminating the entire OQ12 investigation and the fallback branch. Alternative B: one file move at spec-implementation time, trades for cleaner structure. Alternative C: one tiny hook, trades for git-hook fragility (agents skip hooks frequently).

**Status:** CHALLENGED
**Suggested resolution:** Reopen D14. Strong prior for Alternative A given the payload size. If Finding 1 lands and Phase 3 is deferred, D14 becomes moot entirely.

---

### [H] Finding 3: D16's Electron CTA competes with "Initialize LLM brain" and conflates two unrelated concerns

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap) + DC3 (Framing validity)
**Location:** §10 D16, §6 FR9, §15 Phase 2

**Issue.** I read `packages/app/src/components/EditorArea.tsx:380–405` cold. "Initialize LLM brain" is the CTA inside `<EmptyEditorState>` when no document is open. Per the code docstring:

> *"Landing state when no document is selected. Shows the OkBlob plus an optional CTA to initialize the Karpathy three-layer knowledge-base structure (`external-sources/`, `research/`, `articles/` + log.md + matching `config.yml` `folders:` entries)."*

That button is an **OK-project scaffolder** (Karpathy 3-layer + config.yml). It is not a Claude-integration entry point.

The spec's D16 proposes adding a second CTA "**in EditorArea adjacent to 'Initialize LLM brain'**" that installs the skill into Claude Desktop. Two problems:

1. **Cognitive cost.** The new user lands in an empty editor and sees two OK-branded CTAs that do completely different things at completely different trust boundaries: one scaffolds a filesystem folder locally, one downloads + reveals a ZIP + launches an external app + walks a 3-click UI sequence inside someone else's product.
2. **Discoverability claim is wrong.** `<EmptyEditorState>` shows only when no document is selected. A user who already has documents open (the population that has been using OK for a while — the primary Phase 2 target per persona P3's framing) will never see the CTA. It's off for exactly the users who most need the Cowork integration nudge.
3. **The research report's Dim 8 recommendation is a standalone CTA, not one adjacent to a scaffolder.** Dim 8 describes the modal/download/reveal flow without specifying placement adjacent to an existing button.

**Current design:** *"Electron 'Install in Claude Desktop' button UX: standalone modal, triggered from (a) app menu under 'Setup' and (b) a CTA in EditorArea adjacent to 'Initialize LLM brain'."*

**Alternative.** Single surface, app-menu-only (entry-point (a) alone). The app menu's `Setup` submenu is both (i) always reachable regardless of document state and (ii) semantically the right home for a one-time "set up this machine for Claude integration" action. If first-run discoverability is the core concern, consider a one-shot toast/banner on first boot that links into the menu item — but don't permanently squat a CTA in the landing state next to an unrelated scaffolder.

**Trade-off.** Lose: in-context nudge visible in the empty-editor state. Gain: no cognitive collision with the existing scaffolder, works in both empty-state and open-document states, fewer modifications to `EditorArea.tsx` (a file that already carries the hybrid-render-tree constraint per `CLAUDE.md` STOP rules), smaller Phase 2 surface area.

**Status:** CHALLENGED
**Suggested resolution:** Reopen D16 and OQ10. Default to menu-only. If data later shows discoverability is thin, a first-run banner is additive and reversible.

---

### [H] Finding 4: The "most intuitive minimum ship" is much smaller than Phase 1 as currently defined

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC3 (Framing validity)
**Location:** §1 Complication + Resolution, §2 G1–G3, §15 Phase 1

**Issue.** The Complication has exactly one immediate urgency vector: *"the docs page tells users to download a ZIP that doesn't exist, so users hitting the page today get a 404."* Every other Phase 1 element (Claude.app detection + init hint, `metadata.version` injection, Bun validator port, OS-coverage story, `scripts/build-skill-zip.ts`) is nice-to-have scaffolding around that one user-visible failure.

The **truly minimum shippable** closure of the 404 loop is a single PR that:

1. Runs `zip -r openknowledge.skill.zip open-knowledge/` against the existing bundled skill directory as part of `release.yml`'s existing `gh release create` call, using a 6-line inline bash step — no Bun script, no port of `quick_validate.py`, no `scripts/build-skill-zip.ts`, no `metadata.version` frontmatter change.
2. Nothing else.

This is \~15 lines of YAML and closes G1 completely. G2 (init hint) and G3 (metadata version lockstep) are real goals but they are **not** what makes the docs page stop 404-ing. They are incremental improvements that can ship independently over the next 2 weeks without user-visible damage, because every subsequent release keeps the ZIP in place.

The spec collapses the urgent (unblock the docs) with the tidy (frontmatter hygiene, init polish, cross-OS detection) into a 2–3 day Phase 1. The urgent piece could ship **today** as a 15-line workflow tweak. The tidy pieces could ship over the next few days at their own cadence without pressure.

The spec's framing is not wrong — the pieces are all reasonable — but it foregrounds a "Phase 1 = 3 days" package when the actually-load-bearing minimum is a single workflow step. This matters because:

- The spec's stated Complication urgency (**"docs are ahead of reality, 404 on download"**) *does not justify* the `metadata.version` injection, the Bun validator port, or the `ok init` detection hint. Those are different user needs.
- If the rationale for shipping Phase 2+3 is "we're shipping Phase 1 anyway so might as well add polish," that's scope creep fueled by spec packaging rather than user-value anchoring. Once Phase 1 is a 15-line YAML step, the "while we're here" justification for Phase 2+3 evaporates.

**Current framing:** Phase 1 = CI ZIP + validator + init hint + metadata.version injection (2–3 days).

**Alternative framing:**

- **Ship 1a (today, 1 hour):** add 6 lines to `release.yml` to `zip` and attach the existing bundled asset folder as-is. Docs page resolves.
- **Ship 1b (next day, 2 hours):** add `metadata.version` to SKILL.md source (commit-time, not build-time — removes D8 from open questions, removes R2 risk entirely).
- **Ship 1c (when there's bandwidth):** `ok init` Desktop-detection hint.
- **Ship 1d (when Electron team has capacity):** Phase 2's concierge modal.
- **Defer Phase 3** per Finding 1.

This sequence maps each user-visible value delta to a deploy rather than packaging them into a "phase."

**Trade-off.** Lose: the satisfying "one PR, one phase, all the hygiene at once" packaging. Gain: (1) closes the 404 loop in hours instead of days, (2) removes pressure to ship Phase 2/3 under the "bundled work" umbrella, (3) converts D8 from INVESTIGATING to a commit-time choice (no build-time mutation, R2 disappears), (4) shrinks the blast radius of any single PR.

**Status:** CHALLENGED
**Suggested resolution:** Reopen D1 and D15. Repackage as 1a/1b/1c/1d and defer Phase 3 per Finding 1. If the user explicitly wants the tidy package shipped atomically for workflow reasons, keep Phase 1 as one PR but commit-time `metadata.version` (resolves D8) and treat `scripts/build-skill-zip.ts` as optional — a 6-line inline step is sufficient if the bundled asset directory already has correct structure.

---

## Medium Severity

### [M] Finding 5: D13's "inline plugin marketplace at repo root" re-shapes the public repo surface in a way no current user expects

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §10 D13, §15 Phase 3

**Issue.** The `inkeep/open-knowledge` repo today has a clear public shape per `README.md`: it's a monorepo with `packages/`, `docs/`, etc. The README prominently documents `bunx @inkeep/open-knowledge init` as the front door and does not describe a plugin product.

Phase 3 adds **two new top-level directories** at repo root — `.claude-plugin/` and `open-knowledge-plugin/` — alongside the existing `packages/`, `docs/`, `specs/`, etc. For a non-plugin user browsing the GitHub repo or cloning it, these top-level directories are genuinely confusing:

- A user cloning the repo to contribute to the editor or CLI now sees a repo whose structure suggests two products at the top: a monorepo (`packages/`) and a plugin (`open-knowledge-plugin/`).
- The README will need a new section explaining that `open-knowledge-plugin/` is a marketplace-discovery surface for Team+ Claude Cowork admins and not a second product.
- Contributing newcomers may try to add code to `open-knowledge-plugin/` thinking it's the plugin implementation — but it's really just a 21 KB SKILL.md rendezvous for an external tool.

The spec's D13 rationale is *"Matches `anthropics/knowledge-work-plugins` pattern. Single source of truth; no cross-repo sync."* Comparison to `anthropics/knowledge-work-plugins` is apples-to-oranges: that repo's primary product *is* a plugin marketplace. `inkeep/open-knowledge`'s primary product is a CRDT-backed local-first markdown editor.

**Current design:** `"Plugin marketplace shape: inline in inkeep/open-knowledge root. Add .claude-plugin/marketplace.json + open-knowledge-plugin/ subdir. No separate repo."`

**Alternative.** If Phase 3 survives Finding 1, put the marketplace scaffolding under `packages/plugin/` (or similar) rather than the repo root. This preserves the monorepo top-level shape and signals to readers "this is the plugin part of the product, not a new top-level product." The marketplace.json `source` field can point at `./packages/plugin/` just as easily as `./open-knowledge-plugin/`.

If Finding 1 prevails and Phase 3 is deferred, this finding is moot.

**Trade-off.** Lose: exact symmetry with `anthropics/knowledge-work-plugins` naming. Gain: repo top-level remains coherent for non-plugin users, monorepo shape preserved, README requires no new top-level-dir disambiguation.

**Status:** CHALLENGED
**Suggested resolution:** If D13 survives Finding 1, change the sub-location from repo root to `packages/plugin/`.

---

### [M] Finding 6: R2 ("version drift between in-body prose and metadata.version") is created by D8 build-time injection, not mitigated by it

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §12 R2, §10 D8, `evidence/skill-md-frontmatter-current-state.md`

**Issue.** The spec's R2 says *"Version drift between SKILL.md's in-body prose ('Skill version: tracks `@inkeep/open-knowledge-server` package version') and the injected `metadata.version` — mitigate by having CI inject both at build time or by removing the in-body prose in favor of the frontmatter."*

But R2 only exists *because* D8 is INVESTIGATING build-time vs commit-time injection. If D8 goes commit-time (the source file carries `metadata.version: "0.2.0"` in git, tracked by changesets alongside `package.json` version bumps), then:

- The single source of truth is the source file.
- The in-body prose either stays (it refers to the sidecar file, a separate signal) or is rewritten to reference `metadata.version` directly.
- No build-time mutation, no CI-only code path, no validator to run, no risk of the pre-release-on-a-Friday case where the build script misbehaves and everyone gets `metadata.version: "undefined"` for the weekend.

The spec's only argument for build-time is *"Build-time is simpler (version always matches package.json at release) but mutates the SKILL.md as a build artifact."* Simpler **at release time** — but more complex **at all other times** because it introduces an asymmetric source (git says one thing, CI artifact says another). `changeset version` already atomically bumps all package.json files in the monorepo; adding `metadata.version` to the same bump list is trivial (one-line `changeset version` hook or a post-bump script already used for `packages/server/package.json` → `packages/cli/package.json` version sync).

**Current design:** D8 INVESTIGATING, leaning build-time; R2 mitigation is "inject both at build time."

**Alternative.** Commit-time. Extend the existing changeset-version hook to also bump `metadata.version:` in `packages/server/assets/skills/open-knowledge/SKILL.md` whenever `packages/server/package.json` version changes. Single file, single source of truth, no build-time mutation, no asymmetric artifact, no R2, no D8 follow-up decision, no Bun script needed for the version-injection piece.

**Trade-off.** Lose: the tiny convenience of "never think about SKILL.md version when cutting a release." Gain: R2 disappears entirely, D8 resolves to LOCKED at commit-time, `scripts/build-skill-zip.ts` shrinks to a `cd packages/server/assets/skills && zip -r <out> open-knowledge/` (or an inline bash step per Finding 4).

**Status:** CHALLENGED
**Suggested resolution:** Reopen D8. Strong prior for commit-time given the monorepo already has changeset-based version sync. This also interacts with Finding 4 — if Phase 1 is a 6-line YAML step, there's no `scripts/build-skill-zip.ts` to carry the build-time mutation logic anyway.

---

## Low Severity

### [L] Finding 7: D3's Bun-port of `quick_validate.py` is over-engineered for a single 21 KB file authored in-tree

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §10 D3, §6 FR4, `evidence/skills-cli-validator-check.md`

**Issue.** D3 proposes porting Anthropic's `quick_validate.py` structural checks into a Bun script. The checks enumerated are: wrapper-folder-at-root, SKILL.md present, frontmatter has `name` + `description`, frontmatter keys in 6-field allowlist, `name` matches wrapper folder name, `name` is lowercase kebab-case ≤64 chars, `description` ≤1024 chars no `<`/`>`, `compatibility` ≤500 chars.

For this repo's actual situation — **one** SKILL.md, **authored in-tree** and reviewed via normal PR review, not accepting contributions — these checks catch failure modes that the repo's existing review practices and TypeScript strict mode + biome will already catch. The `evidence/skills-cli-validator-check.md` recommendation notes Option C (bash `unzip -l` + `grep` assertions) as "less thorough but zero code to maintain" and dismisses it in favor of Option B. But Option C's "less thorough" only matters if contributors can accidentally break the structural invariants — and in this repo's authoring model, they can't, because the wrapper folder is literally the `packages/server/assets/skills/open-knowledge/` directory checked into git.

The real validator work — if any is needed — is a CI post-build `unzip -l openknowledge.skill.zip | grep -q 'open-knowledge/SKILL.md$'` smoke test. Everything else is caught at PR review and by TypeScript.

**Current design:** *"CI validator: Bun script porting structural checks from Anthropic's `quick_validate.py` (name/description required; 6-field frontmatter allowlist; folder-name matches `name`; char-limit checks)."*

**Alternative.** Two-line bash assertion in the release workflow:

```bash
unzip -l openknowledge.skill.zip | grep -q 'open-knowledge/SKILL.md'
test $(stat -c%s openknowledge.skill.zip) -lt 35000   # 21 KB source + compression overhead
```

If Anthropic publishes a real `skills validate` subcommand later, pivot to it.

**Trade-off.** Lose: the structural-conformance story that makes us look like careful publishers. Gain: no Bun script to maintain as Anthropic's SKILL.md spec evolves; no drift between our port and the upstream `quick_validate.py`.

**Status:** CHALLENGED
**Suggested resolution:** Reopen D3. Default to bash smoke-test. Port `quick_validate.py` only if we catch an actual structural breakage in practice that the bash smoke-test misses.

---

## Confirmed Design Choices (summary)

The following design choices held up under challenge:

### DC1 (Simpler alternative)

- **Dual-track** (Claude Code unchanged, Cowork via ZIP) — correct call; research Dim 8 directly supports it.
- **`openknowledge.skill.zip` naming** (D2) — locked by docs page; no simpler alternative exists.
- **Pinned `v${version}` release URL in init hint** (D7) — correct call vs `/latest/`; prevents CLI↔skill mismatch.
- **Reusing `EDITOR_TARGETS['claude-desktop'].detectPath`** (D12) — exactly right; zero-cost reuse.

### DC2 (Stakeholder gap)

- **Non-interactive init hint** (D6) — right call for the CI-piping user.
- **Desktop detection covering macOS/Windows/Linux** (D10) — Linux is a free-lunch no-op, correct.
- **Documenting #26254 workaround in docs page** (P1 failure path) — right call; research Dim 8 specifically recommends this.
- **IPC discipline via `createHandler`/`createInvoker`** (FR12) — matches CLAUDE.md STOP rule.

### DC3 (Framing validity)

- **Complication's "docs 404 today"** — the urgency is real; the docs page is already live.
- **Keeping Claude Code path (`npx skills`) unchanged** — research Dim 8's top-line recommendation; spec correctly avoids touching it.
- **Phase 2 concierge flow (Electron modal)** — research Dim 8 explicitly recommends this shape; the finding against D16 is about *placement*, not about whether to build it.

Finding 4 is the most severe because it calls out a framing problem: the spec is packaged as "full scope across 3 phases" when the user-visible urgency only justifies a 15-line workflow tweak. Findings 1–3 follow from that packaging pressure.
