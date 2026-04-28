# Changelog: 2026-04-25-config-edit-paths

Append-only process history. Latest entries at bottom.

---

## 2026-04-25 — Spec scaffolded (commit 49eda816)

**Initial scaffolding after Intake.**

Created:
- `SPEC.md` — full PRD + Technical Spec with 18 decisions, 9 open questions, 8 assumptions
- `evidence/validation-cli-patterns-3p.md` — 3P landscape on Mintlify/Fumadocs/Astro/Renovate/actionlint validation CLI patterns
- `evidence/codebase-integration-points.md` — 1P codebase findings from /explore: shadcn Dialog substrate, Settings entry candidates, CLI structure, ok init scaffold, CC1 broadcaster, HTTP API extension, MCP tool patterns, Electron menu+Navigator, file watcher, build pipeline, localStorage prefs

Decisions locked at scaffold time (carry-forward from prior research thread):
- D1 — YAML on disk + yaml@2 Document layer
- D2 — Zod single source of truth; z.toJSONSchema export
- D3 — Single MCP set_config upsert tool
- D4 — Custom shadcn form (no library)
- D5 — Shared applyConfigPatch primitive
- D6 — CC1 'config' channel
- D8 — Auto-save per-control commit
- D11 — Workspace + user-global both via Modal scope picker
- D13 — `ok config validate` (per-domain CLI naming)
- D14 — Zod-style error shape `{path, message, code, severity?}` across all validators
- D16 — Settings hidden in Electron Navigator

Decisions DIRECTED (details flexible):
- D7 — Modal as shadcn Dialog
- D9 — Per-field Reset to default
- D10 — Block writes while invalid
- D12 — Bundle Tier 1 in this spec
- D15 — runConfigValidation lives in server pkg
- D17 — checkLocalOpSecurity gate for new endpoints
- D18 — New file watcher for .open-knowledge/config.yml

Open questions surfaced from /explore findings:
- Q1 — Multi-error response shape `{ok, errors[]}` is new; propagate to existing routes or only new?
- Q2 — Identity threading semantics (agent-attributed vs admin)
- Q3 — Settings entry-point selection (multiple cheap; pick all)
- Q4 — localStorage UI prefs (theme/mode/pin) in same Settings dialog?
- Q5 — Zod walker: public `_def` or internal `_zod.def`?
- Q6 — Folders array UX: replace-array or add/remove ops?
- Q7 — First-time UX: silent file creation or prompt?
- Q8 — Server-side rejection UX rendering
- Q9 — Show overridden user-global fields visually (P2)

Next phase: extract + prioritize OQs from systematic walkthrough; investigate P0 items autonomously; present iteration batches.

## 2026-04-25 — Iteration batch 1 (Q5 resolved, D19 added)

**Investigation:** Empirical check of `node_modules/zod/v4/core/schemas.d.cts` — `_zod: $ZodTypeInternals` is exposed as a TypeScript-typed field on every schema instance in Zod 4.3.6. The `_def` of v3 was restructured to `_zod.def` in v4 and is part of the published `.d.cts` types. Conclusion: react-formgen's use of `_zod` is NOT private-API; the brittleness concern reduces to "patch releases can change schema-internals shapes."

**Q5 resolved:** Walker uses `schema._zod` introspection (the published surface). RESOLVED status applied in SPEC.md §11.

**D19 added (DIRECTED):** Walker uses explicit per-tag type-guards on `schema._zod.def.type` + JSON-text editor fallback for unknown tags. Pin Zod to exact `4.3.6` (no `^`) so patch releases can't surprise the walker.

**Cascade:** A1 already covered Zod-shape verification; no changes. FR-21 ("Reset to default works on every Zod-defaulted field") implementation will use `_zod.def` to detect `.default()` wrappers — confirmed available.

**Pending user input (batch 1, this turn):** Q1 (error shape consistency), Q3 (entry-point selection), Q4 (localStorage prefs in Settings), Q6 (folders array UX). Q2/Q7/Q8/Q9 deferred to subsequent batches.

## 2026-04-25 — Iteration batch 1.5 (Q3 resolved via nested research)

**Method:** Spawned nested Claude Code instance with /research --headless skill loaded. Background subprocess (~5 min, $3.20). Output written to `evidence/electron-cmdk-omnisearch-3p.md` (~1300 words, 15 sources).

**Q3 resolved:** All four Settings entry points — HelpPopover submenu, Cmd-, shortcut, CommandPalette entry, Electron App menu item. Skip dedicated icon.

**D21 added (LOCKED):** The cognitive-mode insight — Cmd-, is muscle-memory for a known destination; Cmd-K omnisearch is discovery for an unknown destination. They are **complementary, not competitive**. Every surveyed unified-Cmd-K app (Linear, Slack, Notion, Arc, Obsidian, VS Code) keeps BOTH; none collapses one into the other. Apple HIG additionally requires the App menu Settings… entry for accessibility binding of Cmd-,.

**Cascade:** FR-1 (Settings entry point) confirmed in current shape. Future Work: when omnisearch ships, the existing CommandPalette "Settings" entry migrates naturally to a "Commands" source within the unified palette — no breaking change.

**Pending user input:**
- Q1 (error shape consistency) — recommend (a) additive only
- Q4 (localStorage UI prefs in Settings) — pending D20 confirmation: apply VS Code's settings-vs-state topology, move theme + editor-mode-default to `userPrefs` in config.yml user scope; pin + graph state stay localStorage and never appear in Settings UI
- Q6 (folders array UX) — recommend (a) replace-array

## 2026-04-26 — Iteration batch 2 (Tim precedents folded in)

**Investigation:** Pulled origin main (we were already at HEAD `6ecff6ef`). Surveyed @tim-inkeep's recent merged work (#297, #315, #318) and the in-flight #319. Read his spec at `specs/2026-04-24-skill-dual-track-install/SPEC.md` for placement rationale.

**Key finding from Tim's spec:** D13 + FR10 explicitly place the Install dialog at "Settings panel row (primary)" — `In packages/app/src/components/Settings*.tsx (or equivalent)`. The Help submenu / HelpPopover / CommandPalette entries from #318 are **interim placements** because the Settings panel didn't exist yet. There was no architectural rationale for "Help over App menu" — Help was just available.

**Implication:** Settings → App menu (macOS) / File menu (Windows/Linux) per Apple HIG is correct. Help submenu was a placeholder destination, not a deliberate convention.

**Deltas applied:**
1. **FR-1 reshaped** — references `InstallInClaudeDesktopDialog` integration patterns (HelpPopover useState, CommandPalette URL hash, App.tsx Trigger, MenuDeps optional callback). Implementation copies the shape verbatim instead of inventing.
2. **FR-17 sharpened** — magic comment goes BEFORE the existing `# Open Knowledge — workspace configuration` header in `CONFIG_YML_CONTENT`. Existing schema-reference prose comment stays.
3. **FR-25 added** — Settings UI exposes "Install in Claude Desktop" row in an "Integrations" section, reusing existing `<InstallInClaudeDesktopDialog>`. Fulfills Tim's D13 destination intent.
4. **D21 amended** — explicitly clarifies App menu vs Help submenu placement: Settings → App menu (HIG-blessed); diverges from Tim's #318 Help placement deliberately because Install (custom action) and Settings (standard preferences) have different conventional homes.
5. **D22 added (DIRECTED)** — Settings UI hosts Install row per Tim's intent; #318 entry points stay as secondary discoverability.
6. **New evidence file** — `evidence/tim-precedents-from-main.md` captures the four integration patterns + the "Tim's intent for Install was Settings" finding.
7. **Links section updated** — added Tim's spec + folders report as related work; added Cmd-K research file.

**Pending user input (still):**
- Q1 (error shape consistency) — recommend (a) additive only [reinforced by Tim's #315 precedent]
- Q4 / D20 (userPrefs in config.yml — VS Code settings-vs-state topology)
- Q6 (folders array UX) — recommend (a) replace-array [order semantics validated against Tim's `reports/config-driven-folder-frontmatter/`]

**Coordination posture:** No blocking on Tim. Greenfield freedom acknowledged; we can diverge from his patterns where ours is better (Settings placement diverges deliberately). Courtesy ping after audit lands but not before.

## 2026-04-26 — Catch-up edits (drift caught by user audit)

User asked "did you capture OQs/decisions in the spec?" — honest audit revealed drift:

**Items discussed in conversation but missing from SPEC.md:**

1. **D20 (VS Code settings-vs-state topology)** — discussed in detail when user asked "how does VS Code think about these types of things?" Got a "sounds good" implicitly but never formalized. Now added as DIRECTED (pending Q4 confirm). Q4 framing updated to reflect D20 instead of the stale "Preferences tab" framing.

2. **Q10 (`<project>/.open-knowledge/config.local.yml` fourth scope)** — surfaced this turn from `reports/config-surfaces-vscode-and-claude-code/REPORT.md` D10 finding. Now in OQ table.

3. **Q11 (cross-scope array merge semantics for `folders`)** — surfaced this turn from same report's D6 Choice 2. Now in OQ table.

4. **Future Work — Per-field Valid Scopes concept** — surfaced this turn from same report's D9 (Claude Code Managed-only / Project-disallowed; VS Code `restricted`). Now in Future Work — Identified tier.

5. **Q4 framing was stale** — old framing said "Recommend separate Preferences tab"; that's superseded by D20 (which puts user-tunable prefs in `userPrefs` config.yml section, NO separate tab). Updated.

**Discipline note for future iterations:** apply the artifact-sync checkpoint (per spec workflow §5 step 7) at the END of every iteration turn, not "when convenient." Conversation drift accumulates fast. Going forward, every newly-surfaced OQ or decision gets written to SPEC.md within the same turn it's proposed, even if user confirmation is pending (the Status field carries the "pending confirm" caveat).

## 2026-04-26 — Iteration: no-pollution principle + right-click-folder Future Work

**User-stated principle:** "We don't want to pollute a user's content outside of `.open-knowledge/*`."

**Captured in spec:**
- NG10 added (NEVER) — explicitly forbids per-folder `.frontmatter.yml` sidecars (Shape C from the right-click-folder analysis), per-doc `.<filename>.metadata.json` companions, Astro-style `_meta.json`, Hugo-style `_index.md`. Folder defaults live in `config.yml`'s `folders[]` array — sole source of truth.
- Future Work — Identified — added "Right-click folder → Edit folder defaults… modal" (Shape A only — data model unchanged).
- Future Work — Identified — strengthened `add_folder_rule` MCP convenience tool entry to mention right-click-folder as the primary motivation.

**AGENTS.md gap surfaced:** the no-pollution principle is NOT in AGENTS.md (verified via grep). User asked to flag this for addition. Proposed STOP rule wording surfaced in §4 of the iteration response for user to apply or ask to apply.

**Tasks: still in iterate phase (#19).**

## 2026-04-26 — AGENTS.md STOP rule added (no-pollution principle)

Added STOP rule to AGENTS.md (between "Don't emit unbounded-cardinality" and "## WARN rules"):

> "OK never writes to user content outside `<contentDir>/.open-knowledge/**`. All OK-managed metadata (config, locks, caches, principal, telemetry sidecars, schema artifacts) lives in `.open-knowledge/`. No per-folder `.frontmatter.yml`, no per-doc `.<filename>.metadata.json`, no Astro/Hugo-style `_meta.json` or `_index.md`. User content is sacrosanct — markdown writes via the agent-write rails (`applyAgentMarkdownWrite` / `applyAgentUndo`) are the only OK-driven mutations to user-content paths. Folder-scoped configuration belongs in `config.yml`'s `folders[]` array — single source of truth (precedent: `reports/config-driven-folder-frontmatter/REPORT.md`)."

This is the load-bearing principle that grounds NG10 in our spec and rules out Shape C (per-folder `.frontmatter.yml` files) for the right-click-folder Future Work entry.

## 2026-04-27 — MCP tool scoping + folders API design deferred (Q12 added, Q6 broadened)

Two related additions to the iterate phase, after analytical re-walk of every field in the actual `ConfigSchema` against the question "what should an agent be able to set?".

**Q12 added — MCP `set_config` field-level gating.** Currently FR-6 accepts deep-partial input over the full ConfigSchema, which is overly permissive (a malicious or confused agent could rewrite `github.oauthAppClientId`, `preview.baseUrl`, or `server.host`). Recommendation (a): allowlist of 5 paths via Zod `.meta({ agentSettable: true })` — `folders[]`, `content.include`, `content.exclude`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`. Everything else is rejected by the tool with `errors[].code: 'not-agent-settable'`. Modal still shows full schema (humans edit anything via UI/file/CLI). ~20 LoC. Marked 1-way: widening later is fine, retracting breaks any agents that adopted the wider surface.

**Rationale (preserved here for the eventual D-decision):** agent-settable fields are the ones where the agent has natural domain knowledge and low blast radius if wrong. Three categories emerge:
- Content-organization (yes — `folders[]`, `content.include`, `content.exclude`) — agent sees the file tree, understands content
- Agent self-tuning (yes, narrow — `mcp.tools.*`) — agent tuning its own tool params
- Identity / network / UX preference / system tuning (no — `github.*`, `preview.*`, `server.*`, `persistence.*`, `sync.*`, `mcp.autoStart`, `content.dir`)

**Q6 broadened — folders API design across MCP, HTTP, UI.** Original Q6 framed the question as UI-only: "replace-array vs add/remove operations?" with a recommendation toward replace. After Q12, the surface that actually matters is the MCP tool shape (and corresponding HTTP endpoint). `folders` is the only schema field that's a list-of-records — every other field is a scalar or primitive map — so it's worth its own design pass, not just a corollary of FR-6's deep-partial. **Marked deferred:** worth a focused 3P pass on how mature platforms expose array-mutation APIs to LLMs (GitHub per-item endpoints, Linear bulk update, Notion append-only blocks, Anthropic's own Memory tool) before committing to a public agent contract. Marked 1-way for the same reason as Q12.

**FR-6 updated** to reference Q12 (allowlist gating) and Q6 (folders shape) as dependencies. The `inputSchema` registered with MCP is now narrowed to the allowlisted paths so agents discover the bounded surface, not the full schema.

**Tasks: still in iterate phase (#19).** Q12 and Q6 join the existing pending batch (Q1, Q4/D20, Q10, Q11) for the next user pass.

**Process discipline note:** the threat-model framing for Q12 was initially overstated — I cited a hypothetical `embedding.openai.endpoint` field that doesn't exist in the schema. Corrected after user pushback. Walking the actual schema field-by-field surfaced 3 real fields (OAuth app ID, preview URL, server host) and zero of the speculative ones — the spec's threat surface is much narrower than VS Code's Workspace Trust scope. The `agentSettable` allowlist is the minimum viable response.

## 2026-04-27 — origin/main delta audit + spec amendments from Tim's #319 (e1f3adcf) and #340 (698f104b)

Pulled origin/main (was at `7c9ca6b4`, now at `698f104b` — 12 new commits). /explore subagent audited each. 9 commits unrelated; 1 LOW (#338 CLI bundling — minor FR-18 note); 1 MEDIUM (#340 Dialog viewport cap → D24); 1 HIGH (#319 seed: pick-subfolder → cascading spec amendments).

**MCP tool inventory check** (user-prompted): main has 16 MCP tools — workflow (`consolidate`, `ingest`, `research`), document mutation (`write_document`, `edit_document`, `rename_document`, `save_version`, `rollback_to_version`), document read (`read_document`, `list_documents`, `get_history`), link graph (`get_backlinks` + 5 siblings), and `exec` / `search` / `preview-url`. **No config-edit tools exist.** `mcp__open-knowledge__init-content` was deliberately deleted in `specs/2026-04-23-ok-seed-scaffold/` (D7 LOCKED) for tool-surface pollution (purely instructional, no side effects). That rationale **does not apply** to our `set_config` (real side effects, narrow allowlist via Q12). The seed-scaffold spec's §3 NG explicitly leaves a future MCP `seed` wrapper open — added to §15 Future Work.

**Three spec amendments from #319** (all in this commit; recorded individually below):

1. **D5 expanded** — was: "All three CRUD surfaces funnel through `applyConfigPatch`." Now: "All `config.yml` writers — Modal, MCP, HTTP, AND existing `seed/apply.ts` `folders[]` writer (#319 prior art) — funnel through it." `seed/apply.ts:85-113` already does the exact `parseDocument` → mutate → `toString` round-trip our spec planned for `applyConfigPatch`, but bypasses our planned primitive and (critically) does NOT signal CC1 `'config'` — structurally violating FR-14 if left as-is.

2. **FR-9b added** — Migrate `seed/apply.ts:85-113` onto `applyConfigPatch` after the latter lands. Closes the D5 gap. New seed test asserts CC1 `'config'` signal.

3. **D23 (new, LOCKED) — Q2 RESOLVED.** Config-edit handlers EXEMPT from `extractAgentIdentity`, same rationale as `handleSeedPlan` / `handleSeedApply` / sync / local-op handlers per `attribution-sweep-coverage.test.ts:82-86`: project-level operations on the local user's machine settings, not agent content. FR-12 dropped the `extractAgentIdentity` call. `handleConfigPatch` joins the sweep `EXEMPT_HANDLERS` set on implementation. **In-repo precedent — not a research recommendation.** This was the strongest possible signal.

**One spec amendment from #340** (Dialog viewport cap):

4. **D24 (new, DIRECTED)** — Settings Modal long-form layout adopts SeedDialog's scrollable-region pattern (post-#340). Required because the Modal renders 8 schema sections + `folders[]` array-of-records, which overflow on small Electron windows without `min-h-0 flex-col overflow-y-auto` between pinned header and footer. `SeedDialog.tsx:182-190` is the canonical post-#340 long-form precedent.

**Smaller amendments:**

5. **Q1 reinforced (not resolved)** — seed routes ship a third distinct error shape `{ok: false, error: {kind, message}}` (singular discriminated). Three shapes already coexist; consistency-via-refactor no longer cheap. Recommend additive — confirm.
6. **A2 status upgraded** — was research-verified (via `evidence/d1-yaml-storage-roundtrip.md`); now repo-verified (in-production at `seed/apply.ts:88-104`).
7. **Future Work entry added** — `seed` MCP wrapper after `applyConfigPatch` unifies the primitive (per seed-scaffold spec §3 NG explicitly leaving this open).

**Open after this iteration:** Q1 (recommended additive), Q4/D20 (proposed `userPrefs` topology), Q6 (deferred — folders API design follow-up), Q10 (recommended add `.local.yml`), Q11 (recommended per-array semantic), Q12 (recommended allowlist gating), Q13 not added (subsumed by FR-9b directly).

**Resolved this iteration:** Q2 → D23 (in-repo precedent).
**No LOCKED decisions reverted.** No merge/rebase conflict surface — schema unchanged across the 12 commits.

## 2026-04-28 — Agent MCP surface narrowed: zero scope concept exposed (D25, D26 LOCKED; Q12 RESOLVED)

User pushback on the prior FR-6 design caught two over-engineerings: (1) `inspectConfig` was being framed as if exposed publicly when it's actually internal-only, (2) the `scope` parameter on `set_config` exposed an internal concern to the agent contract that no other OK MCP tool surfaces. Recovered with a cleaner design.

**Net change**: agents see no `scope` concept anywhere. Server picks via per-field metadata + inference.

**D25 LOCKED — agent-facing tools expose no scope.** Server algorithm: `inspectConfig(path).local ?? .workspace ?? .user ?? schema.meta.defaultScope ?? 'user'`. Per-field `defaultScope` Zod metadata declares the natural home: `folders[]` / `content.*` / `sync.commitMessage` → `'workspace'`; `mcp.tools.*` / `sync.auto*` / `server.openOnAgentEdit` / `mcp.autoStart` → `'user'`; `server.port` / `server.host` / `preview.baseUrl` / `sync.{push,pull}IntervalSeconds` → `'local'`. Modal scope tabs and HTTP endpoint still take explicit `scope` (those are user-driven gestures); only the agent-facing MCP tools drop it. Algorithm precedent: VS Code `Configuration.update()` Layer-B `deriveConfigurationTargets` ([microsoft/vscode `configurationService.ts:1087-1115`](https://github.com/microsoft/vscode), confirmed by 2026-04-27 /explore source-walk). ~80 LoC server-side, all internal.

**D26 LOCKED — agent-settable allowlist (resolves Q12).** Five paths tagged `.meta({ agentSettable: true })`: `folders[]`, `content.include`, `content.exclude`, `mcp.tools.search.maxResults`, `mcp.tools.read_document.historyDepth`. Read side (`get_config`) is unrestricted. Allowlist is the only gate the agent sees — paths only, no scopes.

**FR-6 simplified** — drops `scope` parameter; tool input is `{patch: DeepPartial<AllowlistedConfig>}`. Response: `{ok, applied: string[], scope: 'workspace'|'user'|'local', current: object}` — `scope` is informational (where it landed), `current` is the effective merged config so the agent stays in sync without a separate `get_config` round-trip. Idempotent.

**FR-6c added** — `get_config(path?)` MCP tool. Read effective merged config (defaults → user → workspace → local). No allowlist gating on read. Initial context comes via MCP instructions handshake; this tool is for mid-session re-reads.

**Why this design** (preserved here for the eventual D-decision rationale):
1. Agent surface stays minimal — 2 new tools, no new concepts beyond "patch one of these 5 paths."
2. Category-aligned with rest of OK's MCP surface — no other tool exposes scope (`read_document`, `write_document`, `edit_document`, etc. all deal in content/paths, not scope ladders).
3. Server-side `defaultScope` metadata doubles as documentation — declaring `folders[]` as `'workspace'` makes the field's natural home explicit in the schema itself.
4. Inference algorithm matches VS Code's well-tested behavior (write-back-to-current-scope, fallback to declared default) — users coming from VS Code don't have to learn a new mental model.
5. Optional `scope` override in `set_config` deferred to v1+ (additive, non-breaking) — no v0 evidence agents need it; all 5 allowlisted fields have unambiguous natural scope.

**Open after this iteration**: Q1 (recommended additive), Q4/D20 (proposed `userPrefs` topology — possibly rename to `appearance.theme` per 3-cluster analysis), Q6 (deferred — folders API design follow-up), Q7 (first-time UX), Q8 (validation error UX), Q9 (P2 deferred), Q10 (recommended add `.local.yml`), Q11 (recommended per-array semantic).

**Resolved this iteration**: Q12 → D26.
**Process discipline note**: caught two design over-extensions before locking. (a) `inspectConfig` was framed as a public API; corrected to internal-only. (b) `scope` on `set_config` was framed as needed; corrected to server-side concern. Both errors stemmed from extending VS Code's API shape (which has both visible) without distinguishing what's visible to the *user* vs the *agent*. Net win is a cleaner spec.

## 2026-04-28 — Q10 RESOLVED → D27 + sync.* wiring + base modified-indicator (FR-3b, FR-9c)

User flagged a sharp question on Q10: "how are server.port / server.host / preview.baseUrl / sync.{push,pull}IntervalSeconds even used today? do they belong in config.yml?" — triggered a /explore audit of the 5 candidate per-machine fields.

**Audit findings (in retrospect, partly wrong on first pass):**

First /explore reported all sync.* as "schema-only with zero production read sites." Closer look (after user asked "did knip catch this") found the more accurate picture: **`SyncEngine` IS a real consumer** (`packages/server/src/sync-engine.ts:216-217, 348-349, 594, 606` reads the interval fields), but the wiring from loaded `config.sync.*` → `new SyncEngine({...})` is missing in `standalone.ts:1574-1585`. Half-wired feature, not vestigial. Same shape for the other 5 sync subfields (`enabled`, `autoCommit`, `autoPush`, `autoPull`, `commitMessage`).

**Why knip didn't catch it**: knip is a symbol-level static analyzer. The schema, the `Config` type, and `SyncEngineOptions` are all "used." The bug is a **3-hop semantic chain** (schema → BootServerOptions → SyncEngine constructor) where hop 2 is missing. Static analysis tools don't model intent. Catchable by integration tests asserting "config field X actually changes runtime behavior Y," but OK doesn't have those today.

**Decisions made this iteration:**

1. **D27 LOCKED — Q10 resolved.** Ship `<project>/.open-knowledge/config.local.yml` as a fourth scope tier in v0. Precedence `defaults → user → workspace → LOCAL → ENV → CLI`. Gitignored by `ok init`. Modal gets a third scope tab ("Just this machine"). Cluster B has substance once FR-9c wires sync.* through.

2. **FR-9c added — sync.* wiring (in scope, this spec).** Extend `BootServerOptions` and `ServerOptions` with the 7 sync subfields; pass them to `new SyncEngine({...})` in `standalone.ts:1574-1585`. Integration test asserts config-to-behavior contract. Was a separate cleanup PR; now in-scope because Q10's case rests on it.

3. **FR-3b added — base modified-at-current-scope indicator.** Per /explore on VS Code / JetBrains / Cursor / Obsidian: every editor-class product with a scope ladder ships a "modified at this scope" visual (VS Code 2-3px colored bar; JetBrains blue text; Cursor inherits; Obsidian doesn't have one because single scope). **Foundational, not polish-tier.** Distinct from Q9 (cross-scope override-by-workspace badge), which IS polish-tier. ~10 LoC + CSS.

4. **Q9 confirmed deferred (post-v0).** The cross-scope override-by-workspace badge is genuinely polish: only VS Code does it across the surveyed set; JetBrains has no per-setting cross-scope indicator. When/if shipped, copy VS Code's pattern (inline `Modified elsewhere` text link, no strikethrough, no inline preview).

**Cleanup items surfaced by the audit (not blocking):**
- `init.ts:61` doc says `port: 3000` but `schema.ts:74` defaults to `0` (kernel-allocated). Fix in same wiring PR. Pick `port: 0` (matches schema + multi-project concurrency).
- The 5 unwired non-sync.* sync subfields (`enabled`, `autoCommit`, `autoPush`, `autoPull`, `commitMessage`) — wired alongside intervals via FR-9c.

**Process discipline note**: I overstated the audit's conclusion on first pass ("schema-only, no production read site"). User's "did knip catch this" question prompted a closer look that surfaced the half-wired pattern. The corrected analysis flipped Q10 back to "ship in v0" with the wiring as a co-requisite.

**Open after this iteration:** Q1 (recommended additive), Q4 → D20 LOCKED with `appearance.theme` rename, Q6 (deferred — folders API design), Q7 (silent file create — recommended), Q8 (inline + toast — recommended), Q9 (deferred to post-v0 polish, confirmed).
**Resolved this iteration:** Q10 → D27 (with FR-9c as co-requisite for substance).

## 2026-04-28 — Schema cleanup + 4-subagent /explore audit + D27 reversal

User clarified the principle: "elegant simplicity while preserving correctness — opinionated for the 90% case is fine when architecturally clean and clearly evolvable; deferred tech debt is forbidden but 'we don't ship the knob' is opinionated, not deferred." This caught me oscillating between under-simplification (wire every speculative knob) and over-simplification (drop fields with legitimate persistent-config use cases).

**Process:** Wrote `evidence/config-architecture-framework.md` capturing P1-P33 + decision tree + per-scope tolerance matrix + output format. Dispatched 4 parallel general-purpose subagents to apply the framework to natural/semantic groups via /eng:explore tracing:
- Group A (`content.*`, `folders[]`) → `evidence/eval-group-A-content-folders.md`
- Group B (`server.*`, `preview.baseUrl`) → `evidence/eval-group-B-server-preview.md`
- Group C (`mcp.*`) → `evidence/eval-group-C-mcp.md`
- Group D (`appearance.*` NEW) → `evidence/eval-group-D-appearance.md`

**Key /explore findings (verified by user follow-up):**
- Multi-project model: each OK project has its own `.open-knowledge/server.lock`; `port: 0` (default) → kernel-allocated unique ports → multi-project concurrency works. Setting fixed port at user-global = collisions across projects (CONFIRMED via `boot.ts:430-438`).
- `preview.baseUrl` priority chain: `electron-protocol → env → ui.lock → config` per `preview-url.ts:1-19`. Config value is the team's deployed-wiki URL (workspace-canonical); ui.lock supersedes for local-UI-running case.
- `mcp.autoStart` consumer `commands/mcp.ts:11-18` confirms per-installation-preference semantics with rare per-project opt-out for non-git projects.

**Decisions locked this iteration:**

1. **D29 LOCKED — Schema cleanup.** Drop `sync.*` (7 fields — engine opinionated about full sync lifecycle), `persistence.*` (2 fields — engine opinionated about CRDT-disk debounce), `server.port` (per-machine only; env+CLI is the natural override path). Add `appearance.{theme, editorModeDefault}` per D20. Net: 7 sections, ~12 leaf fields. P31 (no half-implemented) + P32 (opinionated for 90% case).
2. **D27 REVISED — DEFER `.local.yml` to Future Work.** After D29, every retained field has a clean 2-tier home (user-global + workspace) per the `defaultScope` mapping. No current field forces a 3rd tier. Adding later when a real per-machine field arrives is purely additive.
3. **D25 UPDATED — 2-tier inference algorithm.** `inspectConfig(path).workspace ?? .user ?? schema.meta.defaultScope ?? 'user'`. Per-field `defaultScope` (verified by all 4 eval files): workspace — `folders[]`, `content.*`, `preview.baseUrl`; user — `github.oauthAppClientId`, `server.host`, `server.openOnAgentEdit`, `mcp.autoStart`, `mcp.tools.*`, `appearance.*`.

**FRs:**
- **FR-9c REPLACED** — was "wire all sync.* fields"; now "schema cleanup: drop 10 fields, add 2." Captures the D29 implementation work.
- **FR-3b retained** — base modified-at-current-scope indicator (foundational UX).
- **Q9 confirmed deferred** — cross-scope override badge (`Modified elsewhere` VS Code pattern) is post-v0 polish; relevant only after `.local.yml` ships.

**Q resolutions this iteration:**
- Q4 → D20 LOCKED (with `appearance` rename from `userPrefs`)
- Q10 → D27 REVISED — DEFERRED
- Q12 → D26 (already resolved prior iteration)

**Future Work expanded** to capture every additive re-introduction path: `.local.yml` 3rd tier, `sync.*` re-add when engine gains skip-modes + templates, `persistence.*` re-add on slow-disk evidence, `server.port` re-add paired with `.local.yml`, per-rule folder MCP tools (Q6 follow-up), cross-scope override badge (Q9), per-field scope read-side enforcement, settings-vs-state full migration (D28 paired with `.local.yml`).

**Architectural framework captured.** `evidence/config-architecture-framework.md` is the durable artifact establishing P1-P33 + per-field/per-scope decision tree + tolerance matrix. Will be cited from future schema-additions PRs as the precedent set; consumers reference it before adding/removing/moving config fields.

**Open after this iteration:** Q1 (recommended additive — confirm), Q6 (deferred for follow-up), Q7 (silent file create — confirm), Q8 (inline + toast — confirm), Q11 (per-array semantic — confirm), Q9 (deferred to post-v0).

**Process discipline note:** Three over-corrections in one iteration. (a) "wire every speculative knob" too eager; (b) "drop everything to env" too aggressive; (c) framework-aligned "ship .local.yml + hybrid for server.port" came back from subagents but was over-correct given the simplification path. Final position threads the needle: opinionated drops where 90%+ won't tune AND no clean home exists; keeps in config where field has real persistent-record value with team-shared or user-pref scope. The 4-subagent independent verification + user's per-field "global vs project" probe provided the grounding.
