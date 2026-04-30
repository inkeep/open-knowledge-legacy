---
title: "Eval Group B — Operational / network (server + preview)"
date: 2026-04-28
group: "Operational / network (server + preview)"
framework: "specs/2026-04-25-config-edit-paths/evidence/config-architecture-framework.md"
schema_source: "packages/cli/src/config/schema.ts:69-92"
fields_evaluated: 4
---

## Summary

Group: "Operational / network (server + preview)"
Fields evaluated: 4
Verdict counts:
  - keep_config: 0
  - env_only: 0
  - both_config_and_env: 4
  - drop: 0
  - wire_engine_features: 0

Recommended schema diff:
  - keep `server.port` (z.int().min(0).max(65535).default(0))
  - keep `server.host` (z.string().regex().default('localhost'))
  - keep `server.openOnAgentEdit` (z.boolean().default(false))
  - keep `preview.baseUrl` (z.url().optional())
  - **all four are kept fully wired** — no schema deletions. Three of four
    already have hybrid config+env semantics in production code; the fourth
    (`openOnAgentEdit`) deliberately ships without an env override and the
    audit recommends keeping it that way.
  - **Documentation drift to fix**: `packages/cli/src/content/init.ts:61`
    seeds `port: 3000` in the user-facing comment, but `schema.ts:74`
    defaults to `port: 0` (kernel-allocated). Either update the comment to
    `port: 0` or call out the seeded value as an intentional opinionation.

All four fields land at `both_config_and_env` (or close to it), but the
shape of the hybrid differs in each case:

| Field | Verdict | Default scope | Env name | Notes |
|---|---|---|---|---|
| `server.port` | both_config_and_env | local (per D27/D25) | `PORT` | Local override use case is real; workspace ❌ (breaks teammates) |
| `server.host` | both_config_and_env | local (per D27/D25) | `HOST` | Bind-address override; workspace ❌ for `0.0.0.0` checked in |
| `server.openOnAgentEdit` | keep_config (config-only) | user (per D25) | none today | Per-shell override has weak use case; user-global is the natural home |
| `preview.baseUrl` | both_config_and_env | local (per D27/D25) | `OPEN_KNOWLEDGE_PREVIEW_BASE_URL` | Workspace canonical (deployed-wiki URL); env per-developer-local-override |

Net: all four schema fields stay. Three have well-established env+CLI overrides
already wired. One (`openOnAgentEdit`) is config-only by design. None of the
four are vestigial — every read site is fully wired.

---

## Per-field verdicts

### `server.port`

```yaml
field: "server.port"
type: "z.number().int().min(0).max(65535)"
default: "0"  # kernel-allocated; resolved port written to server.lock for MCP discovery

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/cli.ts:70"   # CLI flag override (--port)
    - "packages/cli/src/cli.ts:78"   # ENV override (PORT)
    - "packages/cli/src/commands/start.ts:412"  # bootStartServer({port: config.server.port, ...}) → bootServer({port}) → httpServer.listen(port, host)
    - "packages/cli/src/commands/start.ts:511"  # CLI flag override (`opts.port`) on the start subcommand
    - "packages/cli/src/config/loader.ts:115"  # applyProcessEnvConfigOverrides — second env-application path used by createProjectConfigResolver
  wired: fully
  notes: |
    Two precedence chains exist and both apply env (and CLI on the parent path).
    (a) CLI parent preAction hook (cli.ts:55-85) — runs at every command
    invocation; applies global flags + CLI per-command flags + env (PORT, HOST).
    (b) MCP long-lived resolver (loader.ts:144-182) — `createProjectConfigResolver`
    re-reads YAML per cwd and re-applies `applyProcessEnvConfigOverrides`. Both
    paths converge on the same precedence: CLI flag > env > workspace > user >
    schema-default. CONFIRMED. Default 0 means kernel-allocates; the resolved
    port is stored in `<lockDir>/server.lock` (`updateServerLockPort`,
    `boot.ts:438`) so MCP/UI children can discover it. `spawnOkUi` strips
    `PORT` from the child env (`start.ts:91`) to avoid the parent and child
    fighting over a fixed port.

evaluation:
  ninety_percent_test: |
    90%+ leave at default 0 (kernel-allocated). The whole point of D-033 was
    making port choice ephemeral so multi-project concurrency works without
    coordination. A small minority will set a stable port — operators
    pinning behind a reverse proxy, or a dev who memorized
    `http://localhost:3000`. CONFIRMED via the QA-007 / D-033 design notes
    inline in `start.ts:78-84`.
  team_shared_use_case: |
    NO at workspace scope. A workspace `.open-knowledge/config.yml` with
    `server.port: 3000` would force every teammate to use the same port,
    breaking concurrent dev (each teammate's machine may already have 3000
    bound) and breaking parallel worktrees on the same machine. Framework
    P9 ❌ entry. INFERRED but explicit in framework §II P9 + SPEC D27.
  per_machine_use_case: |
    YES — the canonical case for `.open-knowledge/config.local.yml` (per D27).
    A developer who wants a stable port for muscle memory + IDE bookmarks
    sets it in the gitignored local file. Env name `PORT` already wired
    (loader.ts:115). CONFIRMED.
  secret_or_credential: no
  array_or_record: no

verdict: both_config_and_env
rationale: |
  Apply decision tree §III. (1) Not a secret — pass. (2) Read sites exist and
  are wired through bootServer.listen — not vestigial. (3) Scalar — proceed.
  (4) 90%+ leave at default 0; this triggers the P32 question. The SPEC's
  resolution (D27, 2026-04-28) is to ship `config.local.yml` as the per-
  machine scope tier in v0 — which means there IS a persistent-record value
  for the field beyond env. A developer who wants stable port 3000 across
  shell sessions, without leaking it to teammates, has nowhere else to put it
  (env requires direnv or rc-file plumbing per-machine; CLI flag requires
  retyping per invocation). So the field earns its keep at config (with
  `defaultScope: 'local'`) AND env (per-process override). Hybrid pattern
  per P16. The CLI flag (`--port`) already exists on the start subcommand
  and wins above env. CONFIRMED via cli.ts:69-79 + start.ts:511.

if_keeping_in_config:
  default_scope: local  # per D27 / D25
  scope_tolerance:
    user: ⚠   # would persist a stable port across all OK projects on this machine — unusual but not broken
    workspace: ❌  # breaks teammate concurrency — framework P9 explicit ❌ entry
    local: ✅  # natural home — gitignored, per-machine
    env: ✅  # PORT — well-known name, wired

env_name: "PORT"
```

---

### `server.host`

```yaml
field: "server.host"
type: 'z.string().regex(/^[\w.\-:]+$/, "Invalid hostname")'
default: "'localhost'"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/cli.ts:73"   # CLI flag override (--host)
    - "packages/cli/src/cli.ts:81"   # ENV override (HOST)
    - "packages/cli/src/commands/start.ts:413"  # bootStartServer({host: config.server.host, ...}) → bootServer({host}) → httpServer.listen(port, host)
    - "packages/cli/src/commands/start.ts:512"  # CLI flag override (opts.host) on the start subcommand
    - "packages/cli/src/commands/start.ts:566"  # banner: `http://${config.server.host}:${booted.port}`
    - "packages/cli/src/commands/start.ts:568"  # banner: detect 0.0.0.0 / :: and emit a network URL hint
    - "packages/cli/src/commands/start.ts:580"  # banner: UI URL string
    - "packages/cli/src/commands/mcp.ts:52"  # MCP --port override path: builds `ws://${startupConfig.server.host}:${parsed}`
    - "packages/cli/src/commands/mcp.ts:62"  # MCP autostart path: passes host to createProjectServerUrlResolver
    - "packages/cli/src/mcp/server-discovery.ts:73"  # ws URL construction via lock branch
    - "packages/cli/src/mcp/server-discovery.ts:171"  # `host: opts.host` threaded through ensure()
    - "packages/cli/src/mcp/server-discovery.ts:334"  # ws URL construction via spawn-and-wait branch
    - "packages/cli/src/mcp/server-discovery.ts:368"  # createProjectServerUrlResolver: `host: config.server.host`
    - "packages/cli/src/config/loader.ts:124"  # applyProcessEnvConfigOverrides — second env-application path
    - "packages/server/src/api-extension.ts:3402-3418"  # security comment + isAllowedWorkspaceHostHeader gating; behavior changes when host is 0.0.0.0/::
  wired: fully
  notes: |
    Same precedence chain as `server.port`. Two env-application sites
    (cli.ts:81 and loader.ts:124) — confirmed in §VII trace. The host value
    affects security posture: `api-extension.ts:3402` calls out that
    binding `0.0.0.0` enables network-exposed access and the loopback +
    Host-header allowlist prevents leaking absolute paths over the
    network. CONFIRMED. The MCP server-discovery pipeline also reads it
    (mcp.ts:52, mcp.ts:62, server-discovery.ts:368) to build WebSocket URLs
    pointing at the locally-running collab server.

evaluation:
  ninety_percent_test: |
    90%+ leave at 'localhost'. Demos / shared dev boxes / Codespaces /
    LAN-pairing bind 0.0.0.0 or '::' — operator-grade overrides. INFERRED
    but explicit in api-extension.ts:3402 ("`server.host: 0.0.0.0` (demos,
    shared dev boxes, Codespaces)").
  team_shared_use_case: |
    NO at workspace. A workspace value of `host: 0.0.0.0` checked into
    git would force every teammate's local server to expose itself on the
    LAN — that's a per-developer-environment decision (am I on a trusted
    network right now?), not a team-shared one. Framework P9 ❌. INFERRED.
  per_machine_use_case: |
    YES — same case as `server.port`. A developer pairing on a shared
    network sets `host: 0.0.0.0` in `config.local.yml`. Env name `HOST`
    already wired (loader.ts:124). CONFIRMED.
  secret_or_credential: no
  array_or_record: no

verdict: both_config_and_env
rationale: |
  Symmetric to `server.port`. Decision tree (1)–(3) pass. (4) 90%+ leave
  at 'localhost', so P32 applies — but the per-machine override case is
  real (LAN pairing, demo boxes, Codespaces) and `.local.yml` is the right
  home for a stable opt-in. Env override (`HOST`) already wired for
  per-process override. Hybrid pattern per P16. CLI flag (`--host`) wins
  above env. CONFIRMED — same trace as `server.port` plus the
  api-extension security gating that depends on the resolved value.

if_keeping_in_config:
  default_scope: local  # per D27 / D25
  scope_tolerance:
    user: ⚠   # rare — would persist a non-localhost host across all OK projects
    workspace: ❌  # leaks per-developer security posture decision to all teammates — framework P9 explicit ❌
    local: ✅  # natural home
    env: ✅  # HOST — well-known name, wired

env_name: "HOST"
```

---

### `server.openOnAgentEdit`

```yaml
field: "server.openOnAgentEdit"
type: "z.boolean()"
default: "false"

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/commands/start.ts:362"  # `const onAgentWrite = config.server.openOnAgentEdit ? () => {...openBrowser(uiUrl)} : undefined`
  wired: fully
  notes: |
    Single read site. When true, threads an `onAgentWrite` callback into
    bootServer; the callback fires on the first agent-write request handler
    in api-extension.ts (lines 1483 / 1615 / 2224) and opens the browser
    once per boot (`agentEditOpened` flag debounces). When false, the
    callback is `undefined` and bootServer never invokes it. Confirmed
    by reading start.ts:360-375 — the `agentEditOpened` boolean ensures
    one open per boot, then no-ops. NO env override exists today —
    grep for `OPEN_ON_AGENT_EDIT|OK_OPEN|OK_BROWSER|OK_AUTO_OPEN`
    returns zero hits. CONFIRMED.
  documented_in_init: |
    `packages/cli/src/content/init.ts:55-63` seeds a documented `server:`
    block with `openOnAgentEdit: false` shown commented out. Side note:
    the same block shows `port: 3000` as the comment, but the schema
    default is `0` — minor doc drift worth fixing in this spec's scope.

evaluation:
  ninety_percent_test: |
    Most users leave at default false. The `true` case is for
    pair-with-Claude-Code workflows where the user wants the live preview
    to surface automatically when an agent first writes. Adoption pattern
    is "set once and forget" — once a user decides they want this on for
    their personal machine, it stays on. INFERRED.
  team_shared_use_case: |
    NO at workspace. Auto-opening a browser is a per-user UX preference,
    not a team policy. Two teammates sharing a workspace config.yml may
    have opposite preferences. Closer to user-global than workspace.
    Framework P10 case. INFERRED.
  per_machine_use_case: |
    Marginal. A power user on a multi-machine setup might want it on for
    their dev laptop and off on a build server / CI box, but in practice
    `false` on CI is already the default — they only need to flip it on
    interactively, and CI never invokes `ok start` interactively. Env
    override could be added cheaply (`OK_OPEN_ON_AGENT_EDIT`) but no
    user need has been articulated. INFERRED.
  secret_or_credential: no
  array_or_record: no

verdict: keep_config
rationale: |
  Apply decision tree §III. (1) Not a secret. (2) Wired (single read
  site, exercised on every agent-write). (3) Scalar boolean — proceed.
  (4) 90%+ leave at default — but this is a persistent UX preference,
  not an operational ephemeral. Per-shell override has no articulated
  use case (no env name exists today; pairing with Claude Code is a
  durable workflow choice, not a per-shell-session decision). (5/6)
  Falls into §III step 6: scalar persistent UX preference → CONFIG.
  Framework P15. Default scope `'user'` per D25 — this follows the
  user across all OK projects on their machine. Adding `OK_OPEN_ON_AGENT_EDIT`
  env override later is additive non-breaking — but absent a real
  use case, "no env" is the right v0 stance per P32 (avoid
  speculative knobs).

if_keeping_in_config:
  default_scope: user  # per D25
  scope_tolerance:
    user: ✅  # natural home — UX preference follows the user
    workspace: ⚠   # not broken, but non-canonical — teammates may disagree on auto-open
    local: 👍  # acceptable; per-machine override valid (laptop on, server off) but the case is weak
    env: —   # no env name today; do NOT add speculatively

env_name: ""
```

---

### `preview.baseUrl`

```yaml
field: "preview.baseUrl"
type: "z.url().optional()"
default: "unset"  # field is optional — `preview` block defaults to `{}`

current_state:
  schema_defined: yes
  read_sites:
    - "packages/cli/src/mcp/tools/preview-url.ts:221"  # `const configBase = ctx.config.preview?.baseUrl;`
  env_override:
    - "packages/cli/src/mcp/tools/preview-url.ts:66"   # ENV_VAR = 'OPEN_KNOWLEDGE_PREVIEW_BASE_URL'
    - "packages/cli/src/mcp/tools/preview-url.ts:194-198"  # env wins over lock+config when valid URL
  wired: fully
  notes: |
    Resolution chain in `resolvePreviewUrl` (preview-url.ts:171-227):
      0. electron-protocol (env-flagged)
      1. env (`OPEN_KNOWLEDGE_PREVIEW_BASE_URL`)
      2. lock (`<lockDir>/ui.lock` — local UI process)
      3. config (`preview.baseUrl`)
    Returns null when none resolve. The chain order is deliberate (per the
    file's top comment): env wins over lock+config so per-shell overrides
    are explicit; lock wins over config so a local checkout of a
    cloud-deployed repo resolves to the local UI rather than the
    prod URL checked into config.yml. CONFIRMED.
    Used by `resolvePreviewUrlForTool` (single-doc) and `buildListResolver`
    (list-producing MCP tools, FR-2.6) — every MCP tool response that emits
    a `previewUrl` flows through this. NOT applied via
    `applyProcessEnvConfigOverrides` — it bypasses the loader and reads
    `process.env[ENV_VAR]` directly at resolution time, so it sees env
    changes without a config reload. INFERRED from preview-url.ts:194-198.

evaluation:
  ninety_percent_test: |
    Most users leave unset (lock branch resolves the local UI port for
    them). The team-shared use case is real: a cloud-deploy organization
    that publishes its KB at `https://wiki.acme.com` checks this into
    workspace config so every clone of the repo emits links that point
    at the canonical hosted instance. A small minority sets it
    per-shell via env for tunnel/ngrok testing. CONFIRMED via
    SPEC §50 (cloud-deploy story, "Admin deploys Open Knowledge with
    `preview.baseUrl: ...`") and preview-url.ts top comment.
  team_shared_use_case: |
    YES — strongest workspace candidate in this group. A team-canonical
    deployed-wiki URL is exactly the kind of value that benefits from
    being checked into the repo. Framework P9 + P15 + P16 hybrid
    pattern. CONFIRMED via SPEC 2026-04-15-preview-url-pre-edit/SPEC.md
    §245 ("Cloud deploy | Document `preview.baseUrl` in deploy guide").
  per_machine_use_case: |
    YES — a developer with a local clone of a cloud-deployed repo that
    has `preview.baseUrl: https://wiki.acme.com` in workspace config
    might want to override it locally to point at their dev tunnel
    (`https://username.ngrok.io`) without dirtying workspace config.
    The env override (`OPEN_KNOWLEDGE_PREVIEW_BASE_URL`) handles this
    today; `config.local.yml` (per D27) would also work and is more
    durable. The lock branch already handles the most common case
    (local server running locally) without any config or env. CONFIRMED
    via preview-url.ts:13-15 + SPEC 2026-04-15 D-013 / D-014.
  secret_or_credential: no
  array_or_record: no

verdict: both_config_and_env
rationale: |
  Apply decision tree §III. (1) Not a secret (it's a public URL). (2)
  Wired — resolution path exercised on every MCP tool that emits
  `previewUrl`. (3) Scalar — proceed. (5) Real team-shared workspace
  use case (cloud-deploy default URL) — strongest workspace fit in
  this group per framework P9. Env override layered on top per P16
  (well-known env name `OPEN_KNOWLEDGE_PREVIEW_BASE_URL` already
  wired and intentional — env beats lock beats config so per-developer
  overrides are explicit and a local server still wins for normal
  dev). Default scope `'local'` per D27 / D25 because most workspace
  values are committed by ops/admin and the per-developer override
  case is the dominant edit path; SPEC §50 confirms the workspace
  case is real but admin-driven, not the typical developer write
  path.

if_keeping_in_config:
  default_scope: local  # per D27 / D25 — most edits are per-developer overrides; admin-checked-in workspace value is a separate path
  scope_tolerance:
    user: 👍  # acceptable — a developer who works on multiple cloud-deployed KBs could set a per-user default, but workspace is more typical
    workspace: ✅  # canonical home for the team-shared deployed-wiki URL
    local: ✅  # canonical home for per-developer-override (tunnel, ngrok) of a checked-in workspace value
    env: ✅  # OPEN_KNOWLEDGE_PREVIEW_BASE_URL — well-known, wired

env_name: "OPEN_KNOWLEDGE_PREVIEW_BASE_URL"
```

---

## Cross-cutting findings

### F1. `init.ts` template drifts from schema default

`packages/cli/src/content/init.ts:60-63` shows the seeded `server:` block as:

```yaml
# server:
#   port: 3000
#   host: localhost
#   openOnAgentEdit: false
```

But `schema.ts:74` defaults `port: 0` (kernel-allocated, per D-033 in
`start.ts:77-84`). This is documentation drift — a fresh user uncommenting
the block as-is would pin themselves to 3000, defeating multi-project
concurrency. CONFIRMED. Fix is in scope for this spec (one-line correction
in the seed string). Recommendation: change the example to `port: 0` plus
a one-line comment explaining "0 = kernel-picks-a-free-port; set to a
specific number to bind a stable port." Reads cleanly with the surrounding
prose about defaults.

### F2. Two env-application paths (CLI + MCP) — confirmed convergent

There are two places that apply `PORT`/`HOST` env to config:

1. `packages/cli/src/cli.ts:77-82` — preAction hook on every command invocation.
2. `packages/cli/src/config/loader.ts:105-128` — `applyProcessEnvConfigOverrides`,
   used by `createProjectConfigResolver` for the long-lived MCP stdio process
   that re-reads config per cwd.

Both implement the same precedence (env wins over loaded config for `PORT`
and `HOST`). Confirmed by reading both sites — same Number/String coercion,
same field paths. No drift today. CONFIRMED.

`preview.baseUrl` deliberately bypasses both paths and reads `process.env`
directly at resolution time (`preview-url.ts:194`) so env changes are
visible without a config reload. This is a justified divergence — the
URL resolver is called per-tool-invocation and tracking env at that
granularity is the point. INFERRED but consistent with comment block
at top of `preview-url.ts`.

### F3. SPEC verdicts converge with this audit

D27 (LOCKED 2026-04-28) declares `defaultScope: 'local'` for `server.port`,
`server.host`, `preview.baseUrl`; D25 declares `'user'` for
`server.openOnAgentEdit`. This audit's per-field analysis lands on the same
mapping, derived independently from the decision tree. CONFIRMED.

### F4. No `OK_OPEN_ON_AGENT_EDIT` env override exists today

Grep for `OPEN_ON_AGENT_EDIT|OK_OPEN|OK_BROWSER|OK_AUTO_OPEN` returns zero
hits across `packages/`. The field is intentionally config-only — adding
an env override is additive non-breaking but speculative without a
documented use case. The verdict respects this stance.

## Confidence labels

- **CONFIRMED** — every read site cited above was opened and verified
  this session. Both env-application paths read in full. SPEC D25/D27
  text quoted directly.
- **INFERRED** — adoption-pattern claims about "90%+ leave at default"
  rely on the inline design notes in code (D-033 in `start.ts`,
  api-extension security comment for `host`) plus the SPEC's framing,
  not telemetry. Standard for a v0 framework decision; flagged here
  for completeness.
- **UNCERTAIN** — none of the load-bearing claims fall here. The only
  open thread is F1 (init.ts doc drift) — whether the spec author
  intends to fix in this scope or call out as out-of-scope. Surface
  as a finding rather than a verdict.
