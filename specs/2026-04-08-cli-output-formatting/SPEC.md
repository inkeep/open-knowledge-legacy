# CLI Output Formatting & Color Support — Spec

**Status:** Approved
**Owner(s):** Andrew
**Last updated:** 2026-04-08
**Baseline commit:** 278832b
**Links:**
- Evidence: [./evidence/](./evidence/)
- Changelog: [./meta/_changelog.md](./meta/_changelog.md)

---

## 1) Problem statement

**Situation:** The `@inkeep/open-knowledge` CLI (v0.0.1) outputs all terminal text via plain `console.log`/`console.error` with no colors, no visual hierarchy, and no terminal capability detection. The startup banner is hand-indented text. Error messages are raw `console.error`. There is no awareness of the `NO_COLOR` standard, no `FORCE_COLOR` support, and no `--no-color` flag.

**Complication:** As a published developer tool CLI, the terminal output is the primary user interface. Plain monochrome output makes it harder to scan logs, spot errors, and feel confidence the tool is working. The CLI also cannot accommodate CI environments or accessibility needs that require colorless output. As more features ship (file watcher events, git commits, agent sessions), the lack of visual hierarchy compounds.

**Resolution:** Add colorized output throughout the CLI package using picocolors, render a Vite-style boxed startup banner using boxen/cli-boxes, and implement full `NO_COLOR`/`FORCE_COLOR`/`--no-color` support per the no-color.org standard. Lightweight libraries only — no React/Ink dependency for a v0.0.1 CLI.

## 2) Goals
- G1: Colorized, visually structured CLI output with clear hierarchy (errors red, success green, info dim, module prefixes styled)
- G2: Full compliance with the NO_COLOR standard — respect `NO_COLOR` env var, `FORCE_COLOR` env var, and `--no-color` CLI flag
- G3: Vite-style boxed startup banner that matches modern dev server CLI aesthetics
- ~~G4: Architecture that supports future Ink-based interactive surfaces without rework~~ — Removed: Ink deferred to future work. Building infrastructure for deferred scope is premature.

## 3) Non-goals
- **[NOT NOW]** NG1: Structured logging (pino-based) for server package — separate workstream. Revisit if: pino workstream needs color integration.
- **[NOT NOW]** NG2: Ink / React-for-CLI — investigated and deferred; 17MB/38 deps is disproportionate for current needs. Revisit if: interactive TUI commands (`init`, `config`, `status`) are specced.
- **[NOT NOW]** NG3: Spinner/progress indicators during server startup — additive. Revisit if: server boot time exceeds ~2s.
- **[NEVER]** NG4: Full-screen TUI dashboard — misaligned with CLI's purpose as a server launcher.
- **[NOT NOW]** NG5: Log level filtering (`--log-level`) — the flag exists but is unwired. Revisit if: logging workstream reaches CLI.

## 4) Personas / consumers
- P1: **Developer running locally** — wants clear, scannable output with visual hierarchy during development
- P2: **CI/automation pipeline** — needs parseable, colorless output via `NO_COLOR=1`
- P3: **MCP consumer** — `mcp` command routes diagnostics to stderr; stdout must remain clean for MCP wire protocol

## 5) User journeys

### P1: Developer starting the server
1. Runs `open-knowledge` or `open-knowledge start`
2. Sees a styled startup banner with version, local URL, network URL (if applicable)
3. Sees `Press Ctrl+C to stop` with visual affordance
4. During operation, sees color-coded log messages (green for success, red for errors, dim for debug)
5. On error (e.g., missing content dir), sees clearly formatted error with red highlight and actionable suggestion
6. On Ctrl+C, sees a clean shutdown message

### P2: CI environment
1. `NO_COLOR=1 open-knowledge start` or pipeline sets `NO_COLOR`
2. All output is plain text — no ANSI escape codes
3. Same information content, just no formatting

### P3: MCP consumer
1. Runs `open-knowledge mcp`
2. stdout carries MCP protocol (JSON-RPC) — zero interference from formatting
3. stderr carries diagnostic logs, optionally colored

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Colorized CLI output with visual hierarchy | Errors display red, success green, info default, module prefixes styled | CLI package only |
| Must | `NO_COLOR` env var support | When `NO_COLOR` is set and non-empty, all ANSI codes are suppressed | Per no-color.org spec |
| Must | `FORCE_COLOR` env var support | When `FORCE_COLOR` is set, override NO_COLOR and terminal detection | Levels: 0=off, 1=basic, 2=256, 3=truecolor |
| Must | `--no-color` CLI flag | Flag suppresses color output | Overrides env detection |
| Must | Boxed startup banner | Server-ready output rendered with box-drawing (boxen or cli-boxes + picocolors) | Vite-style |
| Must | MCP stdout isolation | `mcp` command output on stdout is never affected by color formatting | stderr diagnostics may be colored |
| Should | Styled error messages | Errors display with red prefix, actionable help text | Replace raw console.error |
| Should | Consistent color scheme | Defined palette: error, warning, success, info, dim, accent | Documented in code |
| Could | `--color` flag to force color on | Explicit opt-in for color in non-TTY contexts | Complement to --no-color |

### Non-functional requirements
- Performance: Color/banner output must not add measurable overhead to CLI startup
- Reliability: Color detection must not crash in any terminal environment
- Compatibility: Must work with Bun 1.3.x runtime and tsdown bundler

## 7) Success metrics & instrumentation
- Metric 1: NO_COLOR compliance
  - Baseline: Zero support
  - Target: Full no-color.org compliance
  - Instrumentation: Test that `NO_COLOR=1` output contains zero ANSI escape codes
- What we will log/trace: N/A (this is the output layer itself)
- How we'll know adoption/value: Subjective DX improvement; absence of NO_COLOR-related issues

## 8) Current state (how it works today)
- All output via `console.log()` / `console.error()` — zero ANSI codes
- Startup banner: hand-indented plain text (version, URL, Ctrl+C hint)
- Error messages: raw `console.error` with manual indentation
- Log prefixes: `[module-name]` convention (e.g., `[persistence]`, `[file-watcher]`)
- MCP: diagnostics routed to stderr via `process.stderr.write()`
- No color library in CLI's direct dependencies
- Transitive: kleur (via @hocuspocus/server), picocolors (via babel/postcss)
- `--log-level` flag exists in Commander setup but is not wired to anything

## 9) Proposed solution (vertical slice)

### Architecture overview

```
cli.ts (entry point)
├── Early --no-color detection (sets process.env.NO_COLOR before imports)
├── picocolors import (reads NO_COLOR at import time)
├── Commander.js setup (--no-color flag, --color flag)
│
├── start command (action)
│   ├── Render boxed startup banner (picocolors + boxen/cli-boxes)
│   ├── Server startup (colored console.log via picocolors)
│   └── Runtime log output (picocolors-colored prefixes)
│
└── mcp command (action)
    └── stderr diagnostics (picocolors-colored, if TTY)
```

### Color scheme

| Semantic | Color | Usage |
|----------|-------|-------|
| error | red | Error messages, failed operations |
| warning | yellow | Warnings, deprecations |
| success | green | Server ready, successful operations |
| info | cyan | URLs, paths, key information |
| dim | gray/dim | Debug messages, secondary info |
| accent | bold | Section headers, version, server name |

### Startup banner (boxen/cli-boxes + picocolors)

Vite-style boxed banner containing:
- Product name + version (bold)
- Local URL (cyan)
- Network URL (if applicable)
- Ctrl+C hint (dim)

Implementation options (DELEGATED to implementer):
- `boxen` (23KB, 19 deps — includes chalk, string-width, alignment) for turnkey box rendering
- `cli-boxes` (6KB, 0 deps — just box characters) + manual string assembly with picocolors

Both output via `console.log()` — no special lifecycle, no cleanup needed.

### Error formatting

```
  Error: Content directory not found: ./content
         ↳ red prefix, white message

  No config file found. Create one at:
    .open-knowledge/config.yml
         ↳ dim help text with cyan path
```

### --no-color / NO_COLOR implementation

```typescript
// cli.ts — BEFORE any other imports
if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
  delete process.env.FORCE_COLOR; // Explicit flag overrides env
}
if (process.argv.includes('--color')) {
  process.env.FORCE_COLOR = '1';
  delete process.env.NO_COLOR; // Explicit flag overrides env
}
```

Detection hierarchy (effective priority after flag-to-env propagation):
1. CLI flags `--no-color` / `--color` (highest — mutate env vars before library import)
2. `FORCE_COLOR` env var
3. `NO_COLOR` env var
4. Terminal TTY detection (automatic via picocolors/chalk)

Note: CLI flags work by setting/deleting env vars at process start, before any color library is imported. This makes them effectively the highest priority, consistent with the no-color.org recommendation that "per-instance command-line arguments should override NO_COLOR."

### New dependencies

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| picocolors | ^1.1.1 | Colored output + NO_COLOR support | 6KB, 0 deps |
| boxen or cli-boxes | ^8.0.1 or ^4.0.1 | Startup banner box rendering | boxen: 23KB/19 deps, cli-boxes: 6KB/0 deps |

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cli.ts` | Modify | Add early --no-color detection, --no-color/--color flags |
| `src/commands/start.ts` | Modify | Colored output, boxed banner |
| `src/commands/mcp.ts` | Modify | Colored stderr diagnostics via picocolors |
| `src/ui/banner.ts` | Create | Startup banner function (box rendering) |
| `src/ui/colors.ts` | Create | Centralized color scheme + helper functions |
| `package.json` | Modify | Add picocolors + boxen/cli-boxes deps |

Note: **No tsconfig.json or tsdown.config.ts changes needed.** No JSX, no React — pure TypeScript.

### Alternatives considered

**Option A: Ink for everything** — Full Ink TUI for all output. Rejected: 17MB/38 deps, Bun compat risk, unnecessary for log output.

**Option B: Ink for banner + picocolors for logs** — Initially chosen, then rejected after audit challenged the cost/benefit. Ink introduces 17MB/38 deps (React, react-reconciler, yoga-layout) for a 4-line startup box that immediately unmounts. G4 (future Ink foundation) overlapped with NG2 (deferred interactive commands). No production CLI uses Ink for this pattern.

**Option C (chosen): picocolors + boxen/cli-boxes** — Lightest viable stack. picocolors (6KB) for all colored output. boxen (23KB) or cli-boxes (6KB) for the startup banner box. Zero JSX, zero React, zero build pipeline changes. Vite achieves an equivalent banner with this approach.

### Data flow diagram

- Primary flow: CLI args → Commander parse → config load → (start: boxed banner + colored logs + server) or (mcp: plain stderr + stdout protocol)
- Shadow paths:
  - **NO_COLOR set:** picocolors becomes identity functions — all output plain text
  - **Non-TTY (piped):** picocolors auto-detects and disables colors
  - **FORCE_COLOR set:** Overrides NO_COLOR — colors forced on even in non-TTY

## 10) Decision log
| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | ~~Use Ink for select surfaces~~ → **No Ink; use picocolors + boxen/cli-boxes for all output** | X | LOCKED | No | Originally chose Ink for banner + future interactive foundation. Audit challenged: 17MB/38 deps for a 4-line box is disproportionate; G4 overlapped with NG2; no production CLI uses Ink for this. Switched to lightweight stack. | Audit DC1 + user confirmation | Eliminates React, JSX, yoga-layout, Bun compat risk (A1), ~118ms overhead, build pipeline changes |
| D2 | Scope to CLI package only; server logging is separate pino workstream | X | LOCKED | No | User direction — avoids coupling CLI formatting to server internals | User input | Server's console.log calls remain unchanged |
| D3 | Use picocolors for all colored output | T | DIRECTED | No | 6KB, 0 deps, native NO_COLOR, already transitive. chalk 7x larger for no benefit. kleur 3x larger with no advantage. | evidence/color-libraries.md | Single color library for entire CLI |
| D4 | Color utility is CLI-internal (not in core package) | T | DIRECTED | No | Server logging is separate pino workstream; no need for shared color module | User direction (D2) | If pino workstream later needs colors, it handles independently |
| D5 | Node >= 22 requirement is acceptable | X | LOCKED | No | CLI already requires Node >= 22 in package.json engines field | packages/cli/package.json | No change needed |
| D6 | ~~Ink render → unmount~~ → Superseded by D1 | T | N/A | — | Ink removed from scope | — | — |
| D7 | ~~Ink dynamic import~~ → Superseded by D1 | T | N/A | — | Ink removed from scope | — | — |
| D8 | --no-color flag sets process.env.NO_COLOR (and deletes FORCE_COLOR) early in cli.ts | T | DIRECTED | No | picocolors reads NO_COLOR at import time. Setting env before imports ensures flag takes effect. --no-color also deletes FORCE_COLOR so explicit flag always wins. | evidence/ink-lifecycle.md, audit finding | Must be at top of cli.ts, before static imports of picocolors |
| D9 | ~~JSX in tsconfig~~ → Superseded by D1; no build pipeline changes needed | T | N/A | — | Ink removed; no JSX in codebase | — | — |
| D10 | ~~Accept Ink startup overhead~~ → Superseded by D1; no overhead with lightweight stack | X | N/A | — | Ink removed | — | — |
| D11 | Vite-style boxed startup banner | P | DIRECTED | No | Box with border containing version, URLs, Ctrl+C hint. Exact styling and box library choice (boxen vs cli-boxes) delegated to implementer. | User direction | Use picocolors for colors within the box |

## 11) Open questions
| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Which color library for non-Ink output? picocolors vs chalk vs kleur | T | P0 | Yes | Investigate — see D3 | Resolved → D3 |
| Q2 | How to handle Ink + Bun + tsdown bundling? yoga-layout WASM externalization? | T | P0 | Yes | Verified: only tsconfig.json needs `"jsx": "react-jsx"`. yoga-layout is base64 WASM (not native), no externalization needed. Leave ink/react as external deps. | Resolved → D9 |
| Q3 | Should the color utility be a new shared module in core, or CLI-internal? | T | P0 | Yes | User directed CLI-only scope → CLI-internal | Resolved → D4 |
| Q4 | Ink startup overhead on Bun — is ~118ms acceptable? | T | P0 | Yes | Accepted — one-time cost for long-running server process | Resolved → D10 |
| Q5 | Node >= 22 requirement from Ink v7 — acceptable for CLI consumers? | X | P0 | Yes | CLI already requires Node >= 22 | Resolved — non-issue |
| Q6 | What does the startup banner look like? Box style, content, layout | P | P0 | No | Vite-style boxed banner with Ink Box component | Resolved → D11 |
| Q7 | Ink render lifecycle — how to render banner then release terminal for log output? | T | P0 | Yes | Investigated: render() → unmount() releases terminal. See evidence/ink-lifecycle.md | Resolved → D6 |
| Q8 | MCP command: must Ink be lazy-loaded to avoid startup overhead + stdout pollution? | T | P0 | Yes | Yes — dynamic import inside start action. See evidence/ink-lifecycle.md | Resolved → D7 |
| Q9 | --no-color flag propagation: how to make Commander flag control both picocolors and Ink/chalk? | T | P0 | Yes | Set process.env.NO_COLOR early in cli.ts before imports. See evidence/ink-lifecycle.md | Resolved → D8 |
| Q10 | Two color libraries (chalk via Ink + picocolors for logs) — acceptable or consolidate? | T | P2 | No | Acceptable — independent, both respect NO_COLOR | Resolved — acceptable |

## 12) Assumptions
| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | ~~Ink v7 works with Bun 1.3.x runtime~~ | — | Eliminated — Ink removed from scope | N/A | Eliminated |
| A2 | ~~tsdown can bundle Ink correctly~~ | — | Eliminated — Ink removed from scope | N/A | Eliminated |
| A3 | picocolors respects NO_COLOR natively | HIGH | Verified in research | N/A | Verified |
| A4 | boxen/cli-boxes works with Bun + tsdown | HIGH | Standard CJS/ESM packages, no native bindings | Before implementation | Active |

## 13) In Scope (implement now)

### S1: NO_COLOR / FORCE_COLOR / --no-color support
- **Goal:** Full compliance with no-color.org standard
- **Requirements:** R1 (NO_COLOR env), R2 (FORCE_COLOR env), R3 (--no-color flag)
- **Acceptance criteria:**
  - `NO_COLOR=1 open-knowledge start` produces zero ANSI escape codes in output
  - `FORCE_COLOR=1 open-knowledge start | cat` produces colored output even in non-TTY
  - `open-knowledge start --no-color` produces zero ANSI escape codes
  - `open-knowledge start --color` forces colors on
- **Implementation:** Early argv detection in cli.ts sets env vars before color library imports
- **Risk:** Low — straightforward env var + argv check

### S2: Colored CLI output with picocolors
- **Goal:** Visual hierarchy for all CLI output (errors, success, info, debug)
- **Requirements:** R4 (colorized output), R5 (consistent color scheme)
- **Acceptance criteria:**
  - Error messages display with red prefix
  - Success messages (server ready) display green
  - URLs display cyan
  - Module prefixes display with consistent styling
  - All colors disabled when NO_COLOR is set
- **Implementation:** `src/ui/colors.ts` module wrapping picocolors with semantic helpers
- **Risk:** Low — picocolors is 6KB, zero deps, verified Bun compat

### S3: Boxed startup banner for `start` command
- **Goal:** Modern, styled startup display matching dev server CLI aesthetics (Vite-style)
- **Requirements:** R6 (boxed startup banner)
- **Acceptance criteria:**
  - Startup displays boxed banner with version, URLs, Ctrl+C hint
  - Banner uses picocolors for colors (bold, cyan, dim)
  - Box rendered via boxen or cli-boxes
  - Renders via console.log — no special lifecycle
  - NO_COLOR disables box border styling and colors (plain text fallback)
- **Implementation:** `src/ui/banner.ts` function, called from start.ts listen callback
- **Risk:** Low — standard string output, no exotic deps

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| boxen introduces chalk as transitive dep (redundant with picocolors) | Low | Low — two color libraries in dep tree | Both respect NO_COLOR independently. Alternatively, use cli-boxes (0 deps) to avoid. | Implementer |
| Server log messages remain uncolored (partially undermines G1) | Known | Low — cosmetic inconsistency | Accepted trade-off; pino workstream will address server logging separately | Andrew |

## 15) Future Work

### Explored
- **Ink / React-for-CLI adoption**
  - What we learned: Ink v7 (released 2026-04-08) provides a React reconciler for terminal UIs. 533KB own code, 17MB installed (38 packages). Requires React >= 19.2.0, Node >= 22. Uses yoga-layout (base64 WASM) for Flexbox. ~118ms startup overhead on Bun. Works with tsdown (only needs `"jsx": "react-jsx"` in tsconfig). Bun compat is unofficial but functional.
  - Recommended approach: Adopt Ink when interactive CLI commands (`init`, `config`, `status`) are specced. The current picocolors + boxen foundation does not foreclose Ink adoption later.
  - Why not in scope now: 17MB/38 deps is disproportionate for a one-shot banner. Building infrastructure for deferred interactive commands is premature.
  - Triggers to revisit: When interactive TUI commands are specced.
  - Implementation sketch: Dynamic import of Ink in command actions that need it. render() → unmount() for one-shot displays. See evidence/ink-research.md and evidence/ink-lifecycle.md for full investigation.

### Identified
- **Spinner/progress for server startup**
  - What we know: ora can provide spinners (~38KB). Server boot is currently fast but may slow with more extensions.
  - Why it matters: Visual feedback during initialization improves perceived performance.
  - What investigation is needed: Measure actual boot time, decide if spinner is warranted.

- **Structured logging integration**
  - What we know: Pino workstream is planned separately. CLI color output may need to integrate with pino's transport system.
  - Why it matters: Avoid duplicate formatting layers.
  - What investigation is needed: Coordinate with pino workstream on color/format boundaries.

### Noted
- **Custom theme support** — User-configurable color schemes via config.yml. Might matter for accessibility beyond NO_COLOR.

## 16) Agent constraints

- **SCOPE:** `packages/cli/src/` — specifically `cli.ts`, `commands/start.ts`, `commands/mcp.ts`, new `ui/banner.ts`, new `ui/colors.ts`, `package.json`
- **EXCLUDE:** `packages/server/`, `packages/core/`, `packages/app/`, `docs/` — server logging is a separate workstream; do not modify console.log calls in the server package
- **STOP_IF:** Implementation requires changes to tsdown.config.ts or tsconfig.json beyond what's documented; any new dependency exceeds 50KB unpacked or has native bindings
- **ASK_FIRST:** Choice between boxen (23KB, 19 deps including chalk) vs cli-boxes (6KB, 0 deps) — present trade-offs to user
