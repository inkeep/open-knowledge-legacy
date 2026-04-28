---
title: "Group C evaluation — MCP server + tools (mcp.*)"
group: "MCP server + tools"
fields_evaluated: 3
date: 2026-04-28
framework: "specs/2026-04-25-config-edit-paths/evidence/config-architecture-framework.md"
schema_source: "packages/cli/src/config/schema.ts:94-126"
loader: "packages/cli/src/config/loader.ts"
---

## Summary

Group: "MCP server + tools (mcp.*)"
Fields evaluated: 3
Verdict counts:
  - keep_config: 2
  - env_only: 0
  - both_config_and_env: 1
  - drop: 0
  - wire_engine_features: 0

Recommended schema diff:
  - **keep + tag** `mcp.tools.read_document.historyDepth` — config-only,
    `defaultScope: 'user'`, `agentSettable: true`. No env override needed.
  - **keep + tag** `mcp.tools.search.maxResults` — config-only,
    `defaultScope: 'user'`, `agentSettable: true`. No env override needed.
  - **keep + tag** `mcp.autoStart` — both config + env (`OK_MCP_AUTOSTART`).
    `defaultScope: 'user'`. NOT `agentSettable` (per D26: only the two
    `mcp.tools.*` paths are agent-allowlisted; autoStart is a per-machine
    operator concern).

All three fields are fully wired (read sites verified), documented in
`docs/content/guides/configuration.mdx`, and aligned with D25/D26 spec
direction. No fields require dropping or engine work.

---

## Field 1: `mcp.autoStart`

```yaml
field: "mcp.autoStart"
type: "z.boolean()"
default: "true"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/mcp/server-discovery.ts:96"     # !configAutoStart → disk-only
    - "packages/cli/src/mcp/server-discovery.ts:371"    # configAutoStart: config.mcp.autoStart
    - "packages/cli/src/commands/mcp.ts:64"             # envAutoStart: process.env.OK_MCP_AUTOSTART (sibling source)
  wired: fully
  notes: |
    Hybrid config+env pattern. `commands/mcp.ts:64` reads
    `process.env.OK_MCP_AUTOSTART` directly and threads it alongside
    `config.mcp.autoStart` into `createProjectServerUrlResolver`, which
    forwards both into `ensureServerRunning`/`decideAutoStart`. Inside
    `decideAutoStart` (server-discovery.ts:90-101), env is checked FIRST
    (`envAutoStart === '0'`), config second — env strictly wins per FR-1.15.

    Unlike `PORT`/`HOST`, `OK_MCP_AUTOSTART` is NOT processed by
    `applyProcessEnvConfigOverrides` (loader.ts:105-128); it bypasses the
    Config object and is consumed at the discovery decision point. This is
    structurally a "both" pattern but plumbed differently from `server.{port,host}`.

    A live `server.lock` (running `ok start`) takes precedence over both
    knobs — opt-out only suppresses the spawn path, never blocks connection
    to a manually-started server (server-discovery.ts:79-87, comment 58-61).
    CONFIRMED.

evaluation:
  ninety_percent_test: |
    ~90%+ users will leave `autoStart: true` (the seamless "first MCP tool
    call spawns the server" UX is the headline DX). The knob exists for
    operators who want to manage `ok start` lifecycle separately (CI runs,
    custom systemd unit, debugging). Tuning frequency is low but the
    population that DOES tune is meaningful (CI, multi-tenant hosts) and
    needs persistence. INFERRED from docs/content/guides/configuration.mdx:33,
    docs/content/internals/lifecycle.mdx:56, and CI test surface
    (server-discovery.test.ts has explicit env+config precedence tests).
  team_shared_use_case: |
    Mostly no — autoStart preference is per-machine (operator's environment,
    not project content). A monorepo team would NOT want
    `mcp.autoStart: false` baked into workspace config because it would
    silently disable auto-spawn for every teammate cloning the repo. P9
    boundary case: setting in workspace is technically valid but unusual
    (⚠). User-global is the natural home (P10). CONFIRMED.
  per_machine_use_case: |
    Yes. CI agents, headless servers, debugging sessions all want
    `OK_MCP_AUTOSTART=0` per-shell-session without polluting any config
    file. Env name is well-known, documented in
    docs/content/guides/configuration.mdx:102. CONFIRMED.
  secret_or_credential: no
  array_or_record: no

verdict: both_config_and_env
rationale: |
  Decision tree path: scalar bool → step 4 → has well-known env name
  (`OK_MCP_AUTOSTART`) AND has persistent identity use case (operator
  baking `false` into `~/.open-knowledge/config.yml` to permanently opt
  out of auto-spawn on a personal machine). Per P16, this is the canonical
  hybrid pattern: config = persistent record, env = per-process override.

  The field is already wired both ways in production (server-discovery.ts
  precedence test asserted at line 516). Removing config and going env-only
  would lose the persistent-opt-out use case (operator who never wants
  auto-spawn on their machine has to set the env in shell rc, which is
  per-shell, not per-user-account). Keeping config-only would lose the
  per-CI-run override.

  Per D26, NOT in the agent-settable allowlist — agents shouldn't be able
  to disable their own auto-spawn capability (that's an operator decision
  with system blast radius). CONFIRMED via specs/2026-04-25-config-edit-paths/SPEC.md:388.

if_keeping_in_config:
  default_scope: user
  scope_tolerance:
    user: ✅
    workspace: ⚠   # technically allowed but would silently break teammates per P9
    env: ✅ (OK_MCP_AUTOSTART)

env_name: "OK_MCP_AUTOSTART"
agent_settable: false  # per D26
```

---

## Field 2: `mcp.tools.read_document.historyDepth`

```yaml
field: "mcp.tools.read_document.historyDepth"
type: "z.number().int().min(0)"
default: "5"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/mcp/tools/read-document.ts:134"  # const historyDepth = config.mcp.tools.read_document.historyDepth
    - "packages/cli/src/mcp/tools/read-document.ts:143"  # passed to enrichPath as historyDepth option
  wired: fully
  notes: |
    Read per-tool-call (not at process start) inside `executeReadDocument`.
    The MCP server is long-lived; per-cwd config resolution happens via
    `createProjectConfigResolver` (loader.ts:144-182, 1-second TTL cache),
    so each `read_document` invocation gets a fresh resolved Config.

    Consumer is `enrichPath` (content/enrichment.ts:184, 398) which
    forwards to `readShadowLog`/`readProjectGitLog` for git history slicing.
    `0` disables history (valid per `.min(0)`).

    No env override exists. No CLI flag exists. Documented in schema
    `.describe()` only — NOT in user-facing
    docs/content/guides/configuration.mdx (D26 surfaces it via `set_config`'s
    `inputSchema`, not via prose docs). CONFIRMED.

evaluation:
  ninety_percent_test: |
    ~90%+ users keep the default `5`. Agent-self-tuning use case: an agent
    with a smaller context window asks for `historyDepth: 2` to reduce
    payload size; an agent doing forensic work asks for `15`. This is the
    canonical "agent self-tunes its own MCP tool params" pattern that D26
    explicitly preserved. INFERRED from D26 rationale (specs SPEC.md:388):
    "agents have direct domain knowledge for [...] agent self-tuning (their
    own MCP tool params)".
  team_shared_use_case: |
    Yes-ish. A team with a "spec-heavy / lots of churn" KB might want
    `historyDepth: 10` workspace-wide so every teammate's agent sees the
    same history depth. But the more common case is "user/agent prefers
    deeper history regardless of project" → user-global is more natural.
    Per P10, user-global is the inference default; per D26, `defaultScope`
    is `'user'`. Workspace is acceptable (👍), not natural (✅). CONFIRMED.
  per_machine_use_case: |
    No clean per-machine use case. Tool param tuning is about agent
    preference + context size, not host environment. No env name exists,
    none would carry information that config can't (and there's no
    well-known convention for "MCP tool history depth"). P32: skip the
    env knob. CONFIRMED.
  secret_or_credential: no
  array_or_record: no

verdict: keep_config
rationale: |
  Decision tree path: scalar int → step 6 (persistent UX/preference value
  for the agent) → CONFIG. Already wired, agent-self-tuning use case is the
  reason it exists. Per P15 (config-only). Per D25/D26: `defaultScope: 'user'`,
  `agentSettable: true`. No env override needed (P17 inverse — there's no
  per-process scenario where the env would carry info the config can't, and
  no well-known env name for this knob).

  Schema `.describe()` should mention "agents may tune via `set_config`" so
  the inputSchema text surfaces the use case. The field is the cleanest
  fit for D26's allowlist rationale — narrow blast radius, genuine
  agent-domain-knowledge tuning case.

if_keeping_in_config:
  default_scope: user
  scope_tolerance:
    user: ✅
    workspace: 👍   # team-wide override is sensible, just not the natural home
    env: —           # no env name, no per-process scenario

env_name: null
agent_settable: true  # per D26 .meta({ agentSettable: true })
```

---

## Field 3: `mcp.tools.search.maxResults`

```yaml
field: "mcp.tools.search.maxResults"
type: "z.number().int().min(1)"
default: "50"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/mcp/tools/search.ts:106"   # const maxResults = config.mcp.tools.search.maxResults
    - "packages/cli/src/mcp/tools/search.ts:115"   # passed to grep() as maxResults: maxResults + 1
    - "packages/cli/src/mcp/tools/search.ts:118"   # truncated = matches.length > maxResults
    - "packages/cli/src/mcp/tools/search.ts:204"   # user-visible truncation hint mentions config path
  wired: fully
  notes: |
    Read per-tool-call inside `buildSearchResult`. Two distinct uses:
    (1) the cap that limits results returned to the agent;
    (2) a truncation-detection trick (request `maxResults + 1` from the
    `grep` helper, `truncated = len > maxResults`).

    Line 204 surfaces the config path to the agent in the truncation
    message: "_N of M+ matches shown. Raise `mcp.tools.search.maxResults`
    in config.yml to see more._" — this is a load-bearing reference. If we
    rename the field, the user-visible string must update. CONFIRMED.

    No env override, no CLI flag.

evaluation:
  ninety_percent_test: |
    ~90%+ users keep the default `50`. Tuning population matches
    historyDepth (agent context size, KB density). Per D26 the agent itself
    can call `set_config` to tune this when it hits a truncated-result
    pattern — this is the most useful agent-self-tuning surface in the
    schema. The user-visible message at search.ts:204 explicitly invites
    this tuning. INFERRED.
  team_shared_use_case: |
    Yes-ish (same as historyDepth). A KB with `>>50` matches per typical
    search would benefit from a workspace-wide bump; a sparse KB
    `<10`-match-typical doesn't notice. User-global remains more natural
    (agent's own tuning, follows the user). `defaultScope: 'user'` per D26,
    workspace acceptable.
  per_machine_use_case: |
    No clean per-machine use case. No env name exists. P32: skip. CONFIRMED.
  secret_or_credential: no
  array_or_record: no

verdict: keep_config
rationale: |
  Same shape as historyDepth. Decision tree: scalar int → step 6 → CONFIG.
  Agent self-tuning, no env override needed (P15 / no env name / no
  per-process scenario). Per D25/D26: `defaultScope: 'user'`,
  `agentSettable: true`.

  The user-visible truncation hint at search.ts:204 is the cleanest
  documentation of intent — the agent literally sees "raise this in
  config.yml" in its tool output, then can call `set_config` to do exactly
  that. The field is wired correctly for the D26 design.

if_keeping_in_config:
  default_scope: user
  scope_tolerance:
    user: ✅
    workspace: 👍
    env: —

env_name: null
agent_settable: true  # per D26 .meta({ agentSettable: true })
```

---

## Cross-field findings

1. **`mcp.autoStart` env override is NOT in `applyProcessEnvConfigOverrides`.**
   Loader handles `PORT`/`HOST` only (loader.ts:110-127). `OK_MCP_AUTOSTART`
   is read independently in `commands/mcp.ts:64` and threaded into
   `decideAutoStart` as a sibling input. This is structurally fine (the
   spec contract is "env wins over config" and the test at
   server-discovery.test.ts:516 asserts exactly that), but it's worth
   noting for symmetry: a future reader looking at loader.ts to enumerate
   "all env overrides" would miss this one. Not a bug, just asymmetric
   plumbing. CONFIRMED.

2. **`mcp.tools.*` are NOT documented in user-facing docs.**
   `docs/content/guides/configuration.mdx:23-43` lists every config field
   except the two `mcp.tools.*` knobs. They surface only via:
   (a) Zod `.describe()` (currently absent on these fields — schema.ts:106,
   111 have no `.describe()`),
   (b) D26's `set_config` `inputSchema` (not yet implemented).
   This is fine for v0 since the agent is the primary consumer (per D26),
   but if humans are expected to tune via direct YAML edit, the docs page
   should add a row. INFERRED — defer to spec author whether to extend the
   docs page.

3. **All three fields satisfy the framework's "fully wired" gate.**
   No P31 violations (nothing half-wired), no P32 candidates for removal
   (each has a clear non-default use case). The group is in good shape;
   the spec changes for this group are entirely additive (`.meta(...)` tags
   per D26, no shape changes).

4. **D26 allowlist alignment.**
   The two `agentSettable: true` fields in this group are the exact two
   `mcp.tools.*` paths called out in D26 (specs/.../SPEC.md:388):
   `mcp.tools.search.maxResults` + `mcp.tools.read_document.historyDepth`.
   `mcp.autoStart` is correctly excluded — operator concern, not agent
   self-tuning. CONFIRMED.

## Confidence summary

- `mcp.autoStart` plumbing + verdict — **CONFIRMED** (multiple read sites,
  test coverage, docs alignment).
- `mcp.tools.*` plumbing — **CONFIRMED** (single read site each, but
  trivially correct and per-tool-call).
- 90%-test framing — **INFERRED** (no telemetry available; reasoned from
  default values, doc commentary, and D26 rationale).
- D26 allowlist alignment — **CONFIRMED** against SPEC.md:388.
