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
