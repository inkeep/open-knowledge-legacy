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

## 2026-04-28 — TypeScript API Design pass: greenfield architectural alignment (D30-D38, FR-26-28)

**Catalyst.** User loaded the `/typescript-api-design` skill (Anthropic's TS-API design playbook + 12 references) and asked for a greenfield-stance application: "no deferred tech debt, optimize for best architecture, clean codebase, best UX without over-engineering." The skill's references (`schemas-across-boundaries.md`, `mcp-tools.md`, `mutation-shape.md`, `errors.md`, `evolvability.md`, `polymorphism.md`, `network-boundary.md`, `human-authored.md`, `bulk-mutations.md`) compounded against the spec's existing decisions and surfaced a set of architectural deltas the prior iterations had marked as "additive only" or "deferred for 3P research."

**Posture shift.** Prior iterations resolved tensions by minimizing breaking changes (Q1 "additive only," Q6 "deferred"). The greenfield stance flips this: when an architectural correction is clean and serves customer outcomes, ship it now even if it means a one-day refactor of existing code. The resulting decisions all replace "defer" with "do."

**Decisions added this iteration (all LOCKED):**

1. **D30 — Single canonical `ApiError` envelope across all OK routes.** Resolves Q1 → align all routes (NOT additive). One Zod discriminated union keyed on `code` literal; existing `{ok, error: string}` (~50 routes) and seed `{ok: false, error: {kind, message}}` (2 routes) refactor to `{ok: false, error: ApiError}` as part of v0. Forward-compat tail variant included. Per-consumer rendering (HTTP body+status, MCP `isError + structuredContent + content[].text`, CLI `prettifyError`) is mechanical. Inspired by RFC 9457 Problem Details + Stripe typed-error-class hierarchy. ~50 routes × ~5 LoC = one focused day for a clean precedent that pays back forever.

2. **D31 — RFC 7396 JSON Merge Patch dialect for `applyConfigPatch`.** Recursive merge, null-as-delete, arrays replace; `folders[]` cross-scope merge is the documented exception. HTTP signals via `Content-Type: application/merge-patch+json`. Picks the IETF-standardized partial-update semantics over the TypeScript-backend default of "spread the body and silently drop nested user data."

3. **D32 — Two-validator pattern.** Patch payload validator + merged-document validator. Catches the null-as-clear failure class (a patch that validates against the partial shape but produces a merged document with required fields missing). Kubernetes admission webhook precedent.

4. **D33 — Concurrency control: ETag/If-Match (HTTP), `expectedVersion` (MCP).** Atomic tmp+rename prevents file corruption but NOT lost updates. Concrete failure: agent + Modal both write `mcp.tools.search.maxResults` simultaneously; one silently overwrites the other. RFC 7232 ETag/If-Match for HTTP; optional `expectedVersion: string` for MCP (no protocol header primitive). LLM-retry framing on 409 ensures agents retry rather than abandon.

5. **D34 — `z.looseObject` for the on-disk config schema.** Forgiveness over strictness. Critical interaction with D29: existing user configs with `sync.*` set don't fail validation post-upgrade — the fields pass through, sit on disk via yaml@2 round-trip, and the engine ignores them. With D37 codemod for proactive cleanup. Biome v2 migration precedent.

6. **D35 — `applyConfigPatch` returns `Result<T, E>`, not throws.** Each consumer (HTTP, MCP, CLI, seed/apply) translates Result → envelope at its boundary. Failure modes are part of the type contract; compiler forces every caller to handle them.

7. **D36 — Source-located error messages.** Switch loader from `parseYaml` to yaml@2 `parseDocument`; thread Document AST through `safeParse` failures to compute `file:line:col`. Reused by `loadConfig`, `ok config validate`, `applyConfigPatch`, and the Modal. Biome lint output is the bar.

8. **D37 — Ship `ok config migrate` codemod paired with D29.** Same-day codemod discipline. ESLint v9's 20-month migration was harder than necessary because `@eslint/migrate-config` shipped a month late; Turborepo 2.0's `pipeline → tasks` was smooth because the codemod shipped same-day. With D34 + D37 both shipping, users mid-upgrade aren't broken AND get explicit cleanup.

9. **D38 — `folders[]` MCP API: state-based replace + per-rule convenience tools (resolves Q6).** `set_config({patch: {folders: [...]}})` for state-based; `add_folder_rule`, `remove_folder_rule`, `update_folder_rule` for single-rule operations. The `match` field is immutable element identity; renames go through `update_folder_rule`'s `new_match` field (Pattern A, matching GitHub's label-rename API). ⚠ **Tool count under follow-up** — user has signaled the agent's primary use case (add description to folder) + minimize MCP surface may motivate consolidating to a single `set_folder_defaults` upsert tool. Flag in D38 carries the follow-up; resolution after this iteration's broader refactor lands.

**Decisions amended:**

- **D14 — Sharpened.** From "shape contract" to "discriminated union with rendering layer." Renamed `errors[]` (plural) to `error: ApiError` (singular discriminated union). Forward-compat tail variant included. Specifies path coercion (`PropertyKey[]` symbol → string) at the wire boundary.
- **D29 — Augmented.** Now ships paired with `ok config migrate` codemod (D37) + `z.looseObject` schema mode (D34). Same-day-codemod discipline replaces the prior "users will figure it out" stance.

**FRs added/replaced:**

- **FR-6 expanded** — `set_config` now specifies `idempotentHint: true`, optional `expectedVersion: string` for concurrency, dual-emit on success+error per the 2025-06-18 MCP spec, LLM-retry framing in error text. Description draft referenced in §9.7.2.
- **FR-6b added** — `add_folder_rule`/`remove_folder_rule`/`update_folder_rule` MCP convenience tools (D38).
- **FR-6c expanded** — `get_config` now specifies `readOnlyHint: true`, returns `etag` for concurrency, description drafted.
- **FR-8 reframed** — `outputSchema` is the success/error projection of the canonical `ApiError` envelope (one source, multiple renderings).
- **FR-9 expanded** — `applyConfigPatch` shape with RFC 7396 + two-validator + ETag + Result return type.
- **FR-9c augmented** — D29 cleanup now ships with `z.looseObject` migration + codemod requirement.
- **FR-11 replaced** — was "server-side validation runs after every patch"; now "two-validator pattern: patch payload + merged document."
- **FR-12 expanded** — HTTP endpoint now requires `If-Match`, returns 412 on mismatch, 428 if missing.
- **FR-13 expanded** — `GET /api/config` now returns `ETag` header.
- **FR-17 sharpened** — magic comment URL pinned to package major.minor (Biome `$schema` URL precedent).
- **FR-18 sharpened** — `z.toJSONSchema` call now specifies `io: 'input'` (a defaulted field is optional in IDE input view, not required); CI test asserts JSON-Schema↔runtime equivalence.
- **FR-26 added** — `ok config migrate` CLI subcommand (D37 codemod).
- **FR-27 added** — Source-located error messages (D36).
- **FR-28 added** — Single canonical `ApiError` envelope export + ~50-route + 2-seed-route refactor (D30).

**Q resolutions this iteration:**
- Q1 → D30 (align all routes — NOT additive) ⭐ posture flip from prior iteration
- Q6 → D38 (state-based + 3 convenience tools, with follow-up on tool count)
- Q7 → silent file create
- Q8 → inline per-field + toast for envelope-level
- Q11 → per-array merge semantic (folders concat+dedup, others replace per RFC 7396)

**Architectural sections added to spec:**
- §9.6 — Mutation contract (PATCH dialect, two-validator, concurrency, source-located errors)
- §9.7 — Error envelope (canonical schema + per-consumer rendering)
- §9.8 — Boundary discipline (`Result<T,E>`, schema as source of truth, `z.looseObject` rationale)

**Cost delta.** Original spec estimated ~600 LoC + Modal UI. New estimate: ~1,600 LoC + Modal UI. The +1,000 LoC headline is dominated by: (a) existing-routes envelope refactor (~250 LoC × 50 routes); (b) supporting infrastructure for the architectural decisions (Result, ETag, codemod, source-located errors — ~600 LoC); (c) the MCP convenience tools (~200 LoC) and tests (~200 LoC). Each of these was a "deferral" in the original draft and is now in-scope under the no-deferred-tech-debt stance.

**Open after this iteration:** Q9 (cross-scope override badge — confirmed post-v0 polish); D38 tool-count follow-up (user's request to minimize MCP surface for `folders[]` operations).

**Process discipline note.** This iteration intentionally took the architectural-correctness side of every greenfield-vs-pragmatism trade-off, then surfaced the cost delta honestly (~1,600 LoC vs ~600 LoC). The user's stance — "we prioritize architectural choices and correctness as aligned with customer/product deliverables" — was the steering signal. The risk is over-engineering; the mitigation is that every D30-D38 decision cites a specific failure mode (lost updates, error-shape drift, half-merged nested objects, stale-field accumulation, missing source positions) that the architecture prevents — none are "this would be cleaner" without a concrete consequence behind it.

## 2026-04-28 — D38 follow-up resolved: 3-tool MCP draft → 1 upsert primitive shared across HTTP/MCP/UX

**Catalyst.** User flagged two requirements after the prior iteration's D38 (3 convenience tools) landed: (a) the agent's primary use case is "add a description to a folder" — single per-folder upsert, not a discrimination between add/update/remove; (b) keep MCP surface minimal. Then surfaced a forward-looking signal: a future right-click-folder UX in the sidebar where users can edit frontmatter directly. The prior 3-tool design served (a) acceptably but missed (b) and didn't anticipate (c) the right-click UX as a load-bearing consumer.

**Architectural insight.** The agent's "add description to specs/" flow and the right-click-folder UX are the **same operation**: per-folder upsert. Two consumers want the same thing — the operation belongs as a first-class server primitive, not as an MCP-only convenience. Following OK's existing pattern (every MCP tool wraps an HTTP endpoint via `httpPost`), the upsert becomes a 3-layer primitive:

```
              ┌─ Modal (full-form save) ────► POST /api/config/patch ──┐
              │                                                          ├─► applyConfigPatch
Right-click ──┼─ POST /api/config/folders/upsert ──► applyFolderRuleUpsert (server helper) ─┘
              │
       Agent ─┴─ MCP set_folder_defaults ──► POST /api/config/folders/upsert
```

**D38 revised:**
- Replace 3 MCP convenience tools (`add_folder_rule`/`remove_folder_rule`/`update_folder_rule`) with ONE: `set_folder_defaults({match, frontmatter, new_match?, expectedVersion?})`.
- Add server helper `applyFolderRuleUpsert` (~30 LoC) wrapping `applyConfigPatch` with find-or-append-or-rename logic.
- Add HTTP endpoint `POST /api/config/folders/upsert` (~20 LoC) — same as other config endpoints (loopback gate, EXEMPT from extractAgentIdentity per D23).
- MCP tool is a thin `httpPost` wrapper (~15 LoC) — matches OK's canonical MCP pattern.
- **Removal stays as `set_config({patch: {folders: [<filtered>]}})`** at all three layers — no dedicated remove primitive (rare op; read-modify-write is fine).

**FR-6b rewritten** to specify the 3-layer primitive instead of the 3-tool draft. **Q6 resolution updated** to reflect the consolidated design.

**Three benefits:**
1. **Smaller MCP surface** — 3 new tools (`set_config`, `get_config`, `set_folder_defaults`), under the 2-6/server domain optimum.
2. **Right-click UX is pure UI work later** — calls the existing HTTP endpoint; no schema/server changes needed when it ships.
3. **One primitive, three consumers** — server helper, HTTP endpoint, MCP wrapper all use the same logic. Adding a future fourth consumer (e.g., a CLI subcommand `ok config folder set <match> --frontmatter '...'`) is a 5-LoC addition.

**Why this consolidation is correct (vs. the prior 3-tool draft):**
- "Add" and "update" are the same intent — the user/agent declares "this match should have these defaults"; whether the rule exists is incidental. Splitting them adds sibling-tool-discrimination overhead the agent doesn't need.
- The MCP-tool consolidation rule says: "if every call to A is followed by B with B's argument from A's response, collapse them." The agent's read-modify-write pattern (`get_config` → modify array → `set_config`) for single-rule changes IS that shape; the upsert primitive collapses it.
- Removal is genuinely rare (folders don't get un-conventioned often); the 80% rule says don't pay for tool surface that won't pull its weight.

**Future Work updated:**
- Right-click-folder UX entry now reads "server surface already exists; pure UI work later" — no schema/server changes needed when it ships.
- Stale "Per-rule folder MCP tools" entry struck through (resolved by D38).
- Stale "`add_folder_rule` / `set_folder_defaults` MCP convenience tool" entry struck through (resolved by D38). Possible v1 follow-up flagged: paired `get_folder_defaults({path})` if the "what frontmatter applies to X?" query becomes common.

**Cost delta vs. the prior 3-tool draft:** roughly neutral (~65 LoC for the 3-layer primitive vs. ~30 LoC for 3 MCP tools, but the 3-tool draft would have needed similar server-side glue anyway when the right-click UX shipped — so the prior estimate was understated). Net: same order of magnitude, better factored.

**Open**: Q9 (cross-scope override badge — confirmed post-v0 polish). No new Q's introduced.

**Process discipline note.** Caught two design-time mistakes in this iteration:
1. The prior 3-tool draft optimized for "MCP-tool ergonomics" but didn't anticipate the right-click-folder UX as a peer consumer. When the user surfaced the UX, the design implication was clear: the operation is the primitive, not the tool. Always check: "what other consumers will want this same operation?" before locking a tool surface.
2. The user's "minimize MCP surface" signal is a constraint, not a preference — MCP surface is the LLM contract, read every turn, and surface bloat costs token budget for every agent invocation forever. Treat it as a budget, not a wish.

## 2026-04-28 — D38 sharpened: rename `set_folder_defaults` → `set_folder_rule`; always-array transactional shape

**Catalysts.** Two questions from the user surfaced sharper architecture:

1. *"What are 'defaults'?"* — A code check (`packages/cli/src/content/folder-rules.ts` + `enrichment.ts:355-380`) showed the merge semantics are field-shape-dependent: `title`/`description` ARE fall-back defaults (file's own value wins; folder fills in if absent), but `tags` are *unioned* (folder tags + file tags, deduped, folder first). So "defaults" was wrong by ⅓ — accurate for the scalars, false for tags.

2. *"Should it be able to do multiple upserts at a time?"* — Per the bulk-mutations design space (the typescript-api-design `bulk-mutations.md` reference): bulk on N=N≤50 fits an array body with per-item DU response IF using fail-soft semantics. But for folder rules, validation runs against the merged config (D32 two-validator) — there's no per-row failure to surface; either the merged result validates or it doesn't. Transactional all-or-nothing fits naturally.

**D38 amendments locked:**

1. **Renamed `set_folder_defaults` → `set_folder_rule`.** "Folder rule" matches the `FolderRule` type, `FolderRuleSchema`, the seed apply.ts vocabulary, and the prior 3-tool draft's terminology. Avoids the half-true "defaults" framing entirely. The data model is the precise label.

2. **Always-array shape: `set_folder_rule({rules: Array<{match, frontmatter, new_match?}>, expectedVersion?})`.** Even N=1 callers wrap in `[{...}]`. The right-click UX posts `{rules: [{match, frontmatter}]}`; the agent's batch-reorganization posts `{rules: [{...}, {...}, {...}]}`. Single shape, no scalar/array mutex, evolves cleanly.

3. **Transactional all-or-nothing semantics.** If any rule causes the merged config to fail Zod validation, NO writes happen — the response is `{ok: false, error: ApiError}` with the validation issues. This sidesteps the entire bulk-mutations partial-success machinery (`207 Multi-Status`, per-item discriminated union, per-row idempotency keys, per-row concurrency primitives) because the failure model is whole-batch by virtue of `applyConfigPatch`'s atomicity. Hasura multi-mutation is the production precedent for this pattern with declarative configs (Postgres-level rollback when all-Postgres mutations).

4. **Server helper renamed `applyFolderRuleUpsert` → `applyFolderRulesUpsert`** (plural) to match the array shape. Iterates rules, find-or-append-or-rename in a working array, single `applyConfigPatch` call.

5. **HTTP endpoint body updated to `{rules: [...], scope?, expectedVersion?}`** — same path (`POST /api/config/folders/upsert`).

**FRs and Q resolutions updated:** FR-6b rewritten for the array shape; D38 rewritten with always-array + transactional rationale; Q6 resolution updated; SCOPE file path renamed (`set-folder-defaults.ts` → `set-folder-rule.ts`); risk row updated; Future Work entries renamed.

**Why always-array (vs. polymorphic single-or-array):**
- One shape, one description, no mutex between scalar and array forms
- The agent's tool selection cost is unchanged (one tool either way)
- Per Anthropic's tool-design guidance: minimize parameters AND minimize mode-switching across the surface — polymorphic shapes are mode-switches in disguise
- Future evolution (e.g., `position?` per-row metadata) is a clean per-rule field addition, not a shape rework

**Why transactional all-or-nothing (vs. per-row fail-soft):**
- `applyConfigPatch` is atomic by construction (one yaml round-trip → one validate → one tmp+rename)
- Validation runs on the merged config, not per-row — there's no "this rule succeeded but rule N failed" intermediate state to expose
- Folder rules are declarative (the user/agent declares the desired set of rules); partial application would leave the config in an unintended state
- Per the bulk-mutations failure-model spectrum: this is the GraphQL-transactional pattern (Hasura precedent), correct for declarative configs

**What's lost / not-shipped:**
- No `position?` per-row metadata in v0 — appended rules go to end of array (the natural insertion point); fine for now, additive later
- No per-row error reporting if multiple rules each fail validation differently — the merged-doc validator surfaces all issues with their paths, but they're presented as one `VALIDATION_FAILED` envelope, not per-rule. This is correct for transactional all-or-nothing semantics, and the path-based issues let the agent localize each problem to its rule.

**Tool count check.** 3 new MCP tools (`set_config`, `get_config`, `set_folder_rule`), under the 2-6/server domain optimum. The "minimize MCP surface" constraint stays satisfied.

**Process discipline note.** The naming question caught a real semantic drift — "defaults" had been used colloquially in the spec without ever checking the actual merge code. The bulk question was even more useful: it surfaced that bulk-mutation complexity (207, per-item DU) is conditional on per-row fail-soft semantics, NOT on whether you accept N>1. Transactional batches don't pay that complexity tax. This is the kind of insight that's only visible when you read the bulk-mutations reference rigorously rather than skimming for guidance — the failure-model section (§5.0) is the load-bearing distinction, not the bulk-input-shape section.

---

## 2026-04-28 — Release-pivot intake (worktree `spec-config-edit-paths`, baseline 7b0283c1)

**Major architectural pivot driven by Andrew's intake conversation.** Existing HTTP-centric architecture (D5 `applyConfigPatch` server primitive + `POST /api/config/patch` + `ApiError` envelope across ~50 routes per D30) is being collapsed in favor of a Hocuspocus-based transport with TypeScript-function-shaped APIs.

**User direction (verbatim captured in `evidence/_user_outcomes.md`):**
1. Evolve this spec, not a new one
2. No dedicated REST API for config — use Hocuspocus Y.Text-only docs as transport for UI writers; fs-direct for headless writers (MCP/CLI)
3. config.yml is the one-stop-shop for entered config; auth.yml stays separate (secrets threat model)
4. VSCode-style scope-as-constraint: each field declares legal scope(s), schema validates illegal placements
5. User-global tier stays in v0 — theme is the load-bearing user-config field (confirms D20)
6. The "API" is a TypeScript-function contract (`ConfigBinding.patch` for UI; `writeConfigPatch` for headless) running over the collab WS or fs — /typescript-api-design discipline applies in Step 5

**Evidence files created:**
- `evidence/_user_outcomes.md` — verbatim user direction + decoded outcomes + initial per-field scope map
- `evidence/architectural-pivot-hocuspocus.md` — fate map of all 38 existing decisions under the pivot (~60-75% collapse), proposed D39-D44, worldmodel scope for Step 2
- `evidence/api-shape-typescript-not-rest.md` — refines the pivot: API is TypeScript function surface, two shapes (UI binding + headless writer), shared schema/validation core; /typescript-api-design applies in Step 5

**Provisional decision fate (will be formalized in Step 5 after worldmodel + framing):**
- DROPS: D6 (CC1 'config' channel — Y.Text observer IS the channel), D17 (HTTP local-op security — no endpoints), D30 (all-routes ApiError refactor — no new routes), D31 (RFC 7396 PATCH dialect — no HTTP), D33 (ETag/If-Match — replaced by CRDT + persistence-hook validation)
- SHRINKS: D5 (still a shared write primitive but split into ConfigBinding + writeConfigPatch), D14 (ApiError → ConfigValidationError, TS-only), D32 (two-validator collapses to one merged-doc validator + persistence-hook), D38 (folder upsert HTTP route drops; MCP tool + helper stay)
- KEEPS: D1, D2, D3, D4, D7-D13, D15 (relocates to core), D16, D18-D29, D34, D35, D36, D37
- NEW (proposed): D39 admit workspace config.yml as Y.Text-only doc; D40 admit user-global as synthetic `__user__/config.yml`; D41 per-doc bridge bypass; D42 persistence-time validation hook; D43 scope-as-constraint Zod metadata; D44 ConfigSchema migrates to @inkeep/open-knowledge-core
- NG2 reframes from "no Hocuspocus for config" → "no markdown bridge for config docs; no awareness/presence rendering"

**What's locked vs. open:**
- LOCKED: pivot direction (Hocuspocus transport + TS-function API + scope-as-constraint), evolve-existing-spec, theme is user-config
- OPEN (Step 2 worldmodel scope): doc admission mechanism, bridge bypass mechanism, persistence-hook reject-and-revert pattern, cross-process fan-out for user-global, ConfigSchema browser-compat audit, CRDT merge edge cases on Y.Text-as-YAML, awareness suppression
- DEFERRED to Step 5: /typescript-api-design invocation for ConfigBinding + writeConfigPatch + ConfigSchema metadata

**Process discipline note.** This was a five-message intake that fundamentally reshaped the spec. The discipline that worked: I investigated each user assertion (current code state, NG2 reasoning, schema fields under user-global) before responding, and surfaced the load-bearing question (web Settings UI? user-global content?) honestly each time. The user pushed at the right moment ("can we just use Hocuspocus?") to dissolve a complexity layer the existing spec had taken for granted. Captured the chain in three evidence files so Step 3 has the full trail without me re-deriving it.

---

## 2026-04-28 — Worldmodel + three follow-up investigations

**Step 2 worldmodel landed.** `evidence/_init_worldmodel.md` (739 lines) covers the seven open technical questions raised by the architectural pivot. Key findings:
- Doc admission, bridge bypass, schema migration, awareness suppression: HIGH confidence answers, mechanical implementations
- Persistence rejection: Hocuspocus has NO atomic Y.Doc rollback — must implement manually
- Cross-process fan-out: chokidar + atomic-rename detection works; lost-update window is real
- Zod metadata propagation: `.meta()` does NOT cross `.default()` wrappers — known v4 gotcha

**Three follow-up investigations completed in response to user direction:**

1. **Zod v4 catalogs/registries** (Track from user message: "/research that")
   - Dispatched `general-purpose` Task subagent loading /research
   - Output: `reports/zod-v4-catalogs-registries/REPORT.md` (full investigation, ~600 lines with empirical Zod 4.3.6 verification)
   - **Conclusion:** Registries do NOT solve `.default()` propagation alone — but a 6-line walker descending `_zod.def.innerType` does. Use `.register(reg, meta)` BEFORE wrappers (returns same instance; `.meta()` clones). `z.toJSONSchema(schema, { metadata: registry })` correctly emits inner-leaf metadata for SchemaStore export. No version pinning concerns at 4.3.6.
   - **Pattern adopted:** Custom `fieldRegistry` (not `z.globalRegistry`) carrying `{scope, agentSettable, defaultScope?}`. `getFieldMeta(schema)` walker finds metadata regardless of `.default()/.optional()/.nullable()` chains.
   - **Spec implication:** D43 (proposed scope-as-constraint) becomes mechanical to implement. Evidence in report Dimension 4.

2. **Server-side validation pattern** (Track from user message: "Can we do special server side validation as well, with rejection or revert?")
   - Output: `evidence/server-side-validation-pattern.md`
   - **Three-layer defense-in-depth:**
     - L1: Modal walker validates per-field commit before Y.Text (D10)
     - L2: `writeConfigPatch()` validates merged config before fs writes (MCP/CLI/seed)
     - L3: Hocuspocus `onStoreDocument` config-doc branch validates Y.Text → YAML → schema before disk; on rejection, reverts Y.Text via server-origin transaction using in-memory LKG cache + emits CC1 'config-validation-rejected'
   - **Cost:** ~75-90 LoC server-side. Comparable to a single HTTP route handler.
   - **Catches:** Direct dev-tools mutation, buggy clients, schema-version drift, hand-edits breaking YAML, non-OK writers
   - **Proposed D45** supersedes D32's two-validator HTTP-boundary framing (collapses to one effective validator at three entry points)

3. **Cross-process write strategy** (Track from user message: "happy with lock for user config writes or explore the idea of last write wins")
   - Output: `evidence/cross-process-write-strategy.md`
   - **Recommendation: LWW for v0.** No lock infrastructure.
   - **Rationale:**
     - Lost-update window is ~2 seconds (Hocuspocus persistence debounce); requires user editing same field in two `ok start` instances within window
     - Multi-window theme sync (canonical user-global use case) does NOT race — only one write happens; the other window reads via file watcher
     - Persistence-time validation (L3 / D45) ensures lost-updates produce stale-but-valid YAML, never broken YAML
     - File watcher converges all windows within ~100ms of any write
   - **Future Work (NG14):** Per-machine `proper-lockfile` advisory lock if real-world lost-updates become a complaint
   - **Proposed D46** captures the explicit trade-off (replaces dropped D33 ETag/If-Match)

**Three new decisions emerging:**
- D45: Three-layer defense-in-depth validation (supersedes D32)
- D46: LWW for cross-process user-global writes (replaces dropped D33)
- D47 (proposed): Custom `fieldRegistry` + `getFieldMeta` walker pattern for scope-as-constraint metadata (resolves Zod `.default()` propagation gap; supersedes D25's "metadata as inference hint" framing)

**Step 3 framing can now proceed.** All architectural risks from worldmodel either have proposed solutions (D45 for persistence rejection, D46 for cross-process LWW, D47 for Zod metadata) or are acknowledged Future Work.

Next: rewrite SPEC.md primary path (Problem Statement, Goals, NG2-revised, FRs, Decision Log, Open Questions) reflecting the pivot + the three follow-up resolutions. Mark D5/D6/D14/D17/D30/D31/D32/D33/D38 with strikethrough+rationale; promote D39-D47 from "proposed" to formal entries.

---

## 2026-04-28 — Step 5 cascade complete: §6 FRs + §13/§14/§15/§16

§6 Requirements rewritten: FR-1, FR-2, FR-3, FR-3b, FR-5, FR-6/6b/6c, FR-8, FR-9, FR-9b, FR-11, FR-15, FR-23, FR-25 reframed for pivot. FR-7 merged into FR-6c. FR-12, FR-13, FR-14, FR-24, FR-28 marked DROPPED with rationale. New FRs FR-29 through FR-40 added covering D39–D63. FR-14b added for the residual CC1 channel. Non-functional requirements rewritten: HTTP perf/security/cost references replaced with Hocuspocus equivalents; new code budget total ~1,580 LoC (comparable to original ~1,600 LoC, composed differently — heavier on UI walker + Hocuspocus integration, lighter on HTTP envelope alignment).

§5 User Journeys rewritten: P1 example changed from sync interval (dropped per D29) to editor mode default; P4 agent flow shows fs-direct + file-watcher loop instead of HTTP+CC1; P3 IDE flow updated for FR-15/FR-34 path. Added pivot-reframe note.

§13 In Scope: 16-step implementation list rewritten reflecting Hocuspocus admission, persistence-hook L3, fs-direct MCP, ConfigSchema migration to core, scope-as-constraint via fieldRegistry. Deployment/rollout table updated: HTTP-related rows dropped; cold-start recovery and cross-process write rows added.

§14 Risks: new NR1–NR7 risks added (Hocuspocus revert pattern, cross-process LWW, Zod metadata propagation, CRDT-on-YAML, package relocation, lifecycle leaks, SchemaStore latency). Surviving risks updated to drop HTTP-specific framing.

§15 Future Work: added all-routes ApiError envelope alignment (was D30, now Future Work), per-machine advisory lock (NG14), HTTP for config (NG13), auth.yml metadata migration (NG15).

§16 Agent Constraints rewritten: SCOPE expanded with new core package files (writeConfigPatch, bindConfigDoc, fieldRegistry, ConfigValidationError, readConfigSafely, applyFolderRulesUpsert), server modules (config-edit-origin, config-file-watcher, persistence config-doc branch), app component (SettingsPane). EXCLUDE updated to drop HTTP files. STOP_IF and ASK_FIRST rewritten to reflect post-pivot constraints.

---

## 2026-04-28 — Step 6 audit + Step 7 assess findings

Dispatched two parallel Task subagents:
- **Auditor** (factual + coherence): 22 findings (8 HIGH, 9 MED, 5 LOW). HIGH-severity issues all mechanical: §9 had duplicate post-pivot + HTTP-centric sections (fixed via SUPERSEDED block); D56 row missing due to formatting bug (restored); 7 P0 NQs still showed Open in §11 despite Cluster A resolutions (NQ1/NQ2/NQ4/NQ8/NQ11/NQ18 marked RESOLVED with D-pointers; NQ12 also resolved via FR cascade); yaml@2 dep needs adding to core's package.json (added to §16 SCOPE).
- **Challenger** (design challenges): 10 tracks reviewed; overall stance "directionally defensible." Top concerns: phasing recommendation (split MCP+CLI from Settings pane), theme UNSET-vs-localStorage gap (D29 × D55), Y.Text concurrent writes producing invalid YAML, Sheet-vs-pane UX choice.

User responded to four challenge questions:
1. **Phasing**: Ship as one v0 release (recommended option). No spec changes needed.
2. **Theme gap**: Accept the gap (current spec position). Captured as NR8 in §14.
3. **Y.Text concurrency**: Accept + L3 catches it (recommended). Captured as NR9 in §14.
4. **Settings UX**: Keep editor-pane swap (current D54). No spec changes needed.

Mechanical fixes applied. Two new risk rows (NR8, NR9) document the explicitly accepted trade-offs. Findings files retained at `meta/audit-findings.md` and `meta/design-challenge.md` for audit trail.

---

## 2026-04-28 — Step 8 verify and finalize (COMPLETE)

**Mechanical adversarial checks (self-applied):**
- ✅ Zero ASSUMED-status decisions (verified via grep)
- ✅ Zero LOW-confidence 1-way doors (verified via grep)
- ✅ Non-goal temporal tags accurate (NEVER for NG1/NG2/NG3/NG10/NG13; NOT NOW for NG4/NG5/NG6/NG7/NG14; NOT UNLESS for NG8/NG9/NG15)
- ✅ Pre-mortem: D58/D42 persistence-hook revert correctness is the most fragile load-bearing assumption — captured as NR1 (HIGH likelihood, MED impact); manual revert via server-origin transaction works around Hocuspocus's lack of atomic Y.Doc rollback. Mitigation is an integration-test-coverage discipline, not a design alternative; user accepted.

**Resolution completeness gate:** every In Scope item passes:
- ✅ All decisions made (D1–D63 LOCKED or DIRECTED; superseded ones clearly point to replacements)
- ✅ 3P deps named (yaml@2, Hocuspocus, chokidar, Zod 4.3.6, MCP TS SDK ^1.x; yaml@2 added to core's package.json per audit fix)
- ✅ Architectural viability — worldmodel + Cluster A + Cluster B all returned HIGH confidence on every track; zero blockers
- ✅ Integration feasibility — every component named has either an existing precedent (`__system__` doc admission, `OBSERVER_SYNC_ORIGIN`, `tracedRename`, `provider-pool.ts`) or a HIGH-confidence path (`fieldRegistry` Zod 4.3.6 verified, chokidar `awaitWriteFinish` documented)
- ✅ Acceptance criteria verifiable — every FR has explicit ACs
- ✅ No dependency on Out of Scope items

**Collective end-to-end check:** v0 ships at least one end-to-end user-visible outcome:
- P1 Electron user opens Settings pane → toggles `appearance.editorModeDefault` → value persists across windows
- P4 agent calls `set_config` → fs write lands → Settings pane refreshes via Y.Text observer
- P3 IDE user opens config.yml in VS Code → magic comment + SchemaStore unlock autocomplete + validation
- P5 CI runs `ok config validate` → exit 0 on valid, exit 1 with source-located errors on invalid

**Future Work classification:** §15 has Explored / Identified / Noted tiers. New entries added for the all-routes ApiError envelope alignment (was D30, now Future Work), per-machine advisory lock (NG14), HTTP for config (NG13), auth.yml metadata migration (NG15).

**Quality bar checklist:** must-haves verified — single canonical SPEC.md ✓, Decision Log with status per decision ✓, Open Questions resolved ✓, Risks + mitigations ✓, Future Work tiered ✓, Agent Constraints (SCOPE/EXCLUDE/STOP_IF/ASK_FIRST) ✓, Personas, journeys, FRs with ACs ✓.

**Artifact sync checkpoint (final):**
- ✅ All factual findings written to `evidence/` (10 files: 3 release-pivot framing files + worldmodel + Cluster A/B + 2 design-decision files + 2 audit/challenge findings in `meta/`)
- ✅ All SPEC.md sections affected by decisions updated
- ✅ Decision Log (D1–D63), Open Questions (Q1–Q12 + NQ1–NQ18), Assumptions (A1–A8), Risks (NR1–NR9 + 11 surviving), Future Work (Explored/Identified/Noted) tables current
- ✅ `meta/_changelog.md` has full session history including this closing entry

**Baseline commit:** `7b0283c1` (unchanged from start of session — all changes uncommitted; user will commit + push when ready).

**Spec status: READY FOR IMPLEMENTATION via `/ship`** (or manual implementation against the §13 In Scope 16-step plan).

Pending items carried forward to implementation:
- Step 8 quality bar identified some MED/LOW prose-cleanup items (legacy "Modal"/"applyConfigPatch" references in §7 success metrics + §12 assumptions) — these are wording-only and don't change semantics; can be addressed during implementation when the FR cascade lands the corresponding code.
- Q9 (P2 Future Work) — "Modal All projects tab override-by-workspace badge" — VS Code precedent at `settingsTreeModels.ts:435-485`; ~30 LoC + CSS when ready.
- §16 Agent Constraints includes a STOP rule about declaration order (`.register()` before wrappers) — this should also land in the repo's AGENTS.md as a permanent rule alongside the spec.

End of session. Spec evolves the original 2026-04-25 draft from HTTP-centric architecture to Hocuspocus + TypeScript API + scope-as-constraint architecture per the 2026-04-28 release pivot. ~60-75% of original decision surface collapsed; new D39–D63 codify the pivot. Ready for `/ship`.
