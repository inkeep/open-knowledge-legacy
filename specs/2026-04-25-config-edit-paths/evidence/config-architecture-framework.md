---
title: "Config Architecture Framework — evaluation principles for every schema field"
description: "Self-contained evaluation framework subagents apply to schema fields. Defines the principles, the decision tree (config vs env vs drop), the per-scope tolerance matrix, and the expected output shape."
date: 2026-04-28
purpose: |
  Hand-off artifact for /nest-claude subagents evaluating natural/semantic groups of
  ConfigSchema fields. Each subagent reads this file, traces code paths for their
  assigned fields, applies the framework, and returns a structured per-field
  verdict (config, env, drop, or hybrid).
---

# Config Architecture Framework

## I. Project context

Open Knowledge is a greenfield project. ConfigSchema lives at
`packages/cli/src/config/schema.ts`. Loader at `packages/cli/src/config/loader.ts`
walks `defaults → ~/.open-knowledge/config.yml → <project>/.open-knowledge/config.yml → ENV → CLI`.
This framework decides what belongs in config.yml vs env vs neither.

The schema is being aggressively simplified for v0. Fields that are vestigial
(documented but unwired), speculative (90%+ users won't tune), or operational
(per-deployment overrides only) get removed or moved to env-only. Fields that
serve real persistent user/team intent stay in config.

## II. Principles

### Foundational (architecture)

- **P1. Settings vs state separation.** Declarative user intent → YAML config files
  (mutated only via `applyConfigPatch`). Runtime observations → dedicated JSON
  state files, gitignored, never user-settable. The two never overlap.
- **P2. The user's file is authoritative.** Config files accept whatever valid YAML
  allows. The runtime is opinionated about effective values. Never reject-on-write.
- **P3. Layering / composability.** Storage / schema-validator / loader /
  effective-value-computation / UI are separate layers, each with one narrow job.
- **P4. Single shared write primitive.** All writers funnel through `applyConfigPatch`.
- **P8. Open writes, opinionated reads.** If we ever add per-field scope restrictions
  (VS Code's `machine`/`window` analog), enforcement happens at read time, not
  write time. Out of v0 scope.

### Scope ladder (v0 = 2 tiers, future = 3)

- **P5. Two-tier ladder + env + CLI in v0.** Resolution: `defaults → user-global →
  workspace → ENV → CLI`. `.local.yml` deferred to Future Work (additive when a
  field genuinely needs per-machine override).
- **P6. Scope = read precedence = default write target.** Closer-to-target wins.
- **P7. `defaultScope` is an inference hint, not enforcement.** Per-field metadata
  declares the field's natural home; used only by the inference algorithm to
  choose a write target when the field is unset everywhere.

### Per-scope tolerance (v0 = user, workspace; future adds local)

- **P9. Workspace scope (`<project>/.open-knowledge/config.yml`).** Things ALL
  teammates can sensibly inherit. Project structure, content rules, team-shared
  preferences, deployed-wiki URL. NEVER per-machine values that would break
  colleagues (e.g., `server.port` at workspace breaks teammate concurrency —
  ❌ entry).
- **P10. User-global scope (`~/.open-knowledge/config.yml`).** Things that follow
  the user across all OK projects. Personal preferences, identity, agent
  self-tuning defaults, theme.
- **P12. Env scope.** Per-process / per-deployment / per-CI override. Wins over
  all config layers. Reserved for: scalar values that fit a string AND have
  well-known env names AND have a per-deployment scenario.
- **P13. CLI flag scope.** Per-invocation override. Highest precedence.

### Per-field shape rules (config vs env)

- **P14. Array / record fields → config-only.** Env vars can't represent arrays
  or nested records cleanly.
- **P15. Scalar + team-shared use case → config-only or hybrid (config + env override).**
  If a workspace value is meaningful, the field belongs in config. Env can layer
  on top for per-process override.
- **P16. Scalar + per-machine + well-known env name → config + env override (BOTH).**
  VS Code's hybrid pattern. Config is canonical persistent record; env wins
  per-process. (E.g., `server.port` IF kept in config — but see P32.)
- **P17. Operational/ephemeral with no team-shared use case → env-only.** Things
  inherently per-process with no persistence value (`DEBUG`, `NODE_ENV`-style).

### Greenfield + opinionated simplicity

- **P31. No deferred tech debt.** Resolve findings in-scope. Don't leave
  half-implemented features behind. Schema-says-but-runtime-doesn't is the
  forbidden pattern.
- **P32. Opinionated for the 90% case.** When a config knob is unlikely to be
  tuned by ≥90% of users, ship without the knob. Schema simplicity > speculative
  configurability. Engine has hardcoded well-considered defaults; per-machine
  override (when needed) goes through env+CLI. Adding the knob back later when
  evidence justifies is **additive and clean**. *Tension with P31:* P31 forbids
  half-implemented; P32 says "no schema field at all" is the right shape, not
  "schema field that doesn't work." The two align — both forbid the "schema
  documents speculative knobs" pattern.

### Secrets

- **P33. Secrets never in config.yml or env exposed to processes.** Tokens,
  API keys, passwords, certificates → OS keychain (preferred) or chmod-0600
  file (fallback). Config holds public identifiers (OAuth client IDs, OAuth
  app names) but never credentials.

## III. Decision tree per field

Apply in order. The first verdict that matches wins.

1. **Is the field a token / credential / secret?**
   → **DROP** from schema. Use OS keychain (`@napi-rs/keyring`) or auth.yml fallback.
   Per P33.

2. **Is the field currently in schema but its read site is missing or broken
   (vestigial / half-wired)?**
   → Investigate: was the wiring intentional but incomplete? Did the engine
   ever support it? Apply P32:
   - If 90%+ won't tune → **DROP** from schema; engine hardcoded
   - If real user value + completable → **wire it through** (engine work in scope)
   - Don't leave half-implemented.

3. **Is the field an array or record?**
   → **CONFIG-ONLY**. Per P14. Env can't represent it.

4. **Is the field a scalar that 90%+ of users will leave at default?**
   → Apply P32:
   - If it has a per-deployment scenario AND a well-known env name (`PORT`,
     `HOST`, `DEBUG`) → **ENV-ONLY** (drop from config). Power users set in
     shell rc / direnv / launch config.
   - If it has a persistent identity / fork use case → **CONFIG** (keep).
   - If it's purely operational with no team-shared value → **ENV-ONLY**.

5. **Is the field a scalar with a real team-shared workspace use case?**
   → **CONFIG**. Per P15. Optionally add env override (P16) if it also has
   per-process semantics.

6. **Is the field a scalar persistent UX/preference value?**
   → **CONFIG**. Per P15. User-global scope is natural.

## IV. Per-scope tolerance matrix definition

For each kept field, classify per scope:

| Marker | Meaning |
|---|---|
| ✅ | Natural home (set `defaultScope` here) |
| 👍 | Acceptable / valid |
| ⚠ | Unusual but not broken |
| ❌ | Would actively misbehave (machine-scoped equivalent — "would break teammates") |

Most fields tolerate every scope. ❌ entries are rare and indicate fields where
P8 (read-side enforcement, future) would eventually kick in.

## V. Hybrid config+env rule

A field can be in BOTH config and env. The semantics:
- **Config.yml is the canonical persistent record** (with scope ladder).
- **Env is a per-process override** that wins over all config layers.
- Loader applies env after config (`loader.ts:105-128`'s
  `applyProcessEnvConfigOverrides`).
- Documented for users: "set X in config.yml for default; override via $X for a
  specific shell session."

Examples that fit this pattern: `server.port` (PORT env), `server.host` (HOST env),
`mcp.autoStart` (`OK_MCP_AUTOSTART`), `preview.baseUrl`
(`OPEN_KNOWLEDGE_PREVIEW_BASE_URL`).

But per P32, ASK whether config gives anything env doesn't:
- If team would never commit it to workspace AND user doesn't set it
  per-shell-session-rc → env-only is enough; remove from config.
- If config is the persistent record + env is the per-process override → keep both.

## VI. Output format expected from subagents

For each assigned field, return:

```yaml
field: "<dot-path>"
type: "<Zod type signature>"
default: "<default value or 'unset'>"

current_state:
  schema_defined: yes|no
  read_sites: # file:line list or "none"
    - "<file>:<line>"
  wired: fully|half|vestigial|n/a
  notes: |
    Concise observation about how it's used (or not).

evaluation:
  ninety_percent_test: |
    Will 90%+ of users tune this? Brief justification.
  team_shared_use_case: |
    Does workspace-scope make sense for this field? Concrete example or "no".
  per_machine_use_case: |
    Does per-machine override make sense? Env name if applicable.
  secret_or_credential: yes|no  # if yes, drop entirely
  array_or_record: yes|no  # if yes, config-only

verdict: keep_config|env_only|both_config_and_env|drop|wire_engine_features
rationale: |
  One paragraph applying the decision tree.

if_keeping_in_config:
  default_scope: user|workspace
  scope_tolerance:
    user: ✅|👍|⚠|❌
    workspace: ✅|👍|⚠|❌
    env: ✅ if env name|—

env_name: "<NAME>"  # if env_only or both
```

Plus a summary section at the top per group:

```
## Summary
Group: "<name>"
Fields evaluated: N
Verdict counts:
  - keep_config: N
  - env_only: N
  - both_config_and_env: N
  - drop: N
  - wire_engine_features: N
Recommended schema diff:
  - <add / remove / keep / modify>
```

## VII. Investigation discipline

Before applying the framework, the subagent MUST:

1. **Trace every read site** for the field via grep on `config.<path>`,
   `cfg.<path>`, deep-property access patterns. Cite file:line.
2. **Check for env overrides** in `loader.ts:105-128` (`applyProcessEnvConfigOverrides`)
   and other env-applying paths.
3. **Check for CLI flag overrides** in `commands/*.ts`.
4. **Check for runtime consumer** — engine class, server, MCP tool — that actually
   reads the resolved value.
5. **Check for documentation hazard** — is the schema field documented as a
   knob in `init.ts` (the seeded config.yml template) or in user-facing docs?
   If it documents a knob that doesn't work, that's a P31 violation.

If a field is in the schema but has no read site, that's a half-wired bug.
Apply P32: drop it (90%+ won't tune what doesn't work) — don't wire speculative
features.

## VIII. Confidence labels

Use **CONFIRMED** (multiple sources or upstream code agree),
**INFERRED** (single source or reasoned), or **UNCERTAIN** (sources disagree
or insufficient evidence). Apply to load-bearing claims in your verdict.

## IX. Stance

- **3P-honest**: cite file:line for every claim about code behavior.
- **Greenfield**: don't optimize for "minimal v0 surface" if it leaves drift.
  Don't optimize for "complete v0 wiring" if 90%+ users won't tune.
- **Per-field, not per-section**: each leaf field gets its own verdict, even
  if its siblings get the same one.
- **Apply principles, don't invent new ones**: if a field doesn't fit any
  rule, surface that as a finding for the spec author to resolve, don't paper
  over it.
