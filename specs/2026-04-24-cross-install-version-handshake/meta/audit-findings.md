# Audit Findings

**Artifact:** `specs/2026-04-24-cross-install-version-handshake/SPEC.md`
**Audit date:** 2026-04-24
**Auditor:** same agent that drafted the spec (bias acknowledged; factual verifications delegated to a fresh Explore agent where possible)
**Total findings:** 12 (2 high, 5 medium, 5 low)

## Resolution status (post-audit pass, same day)

All H + M + most L findings applied to SPEC in the same commit. Summary:

| Finding | Status   | Applied how                                                                                                          |
|---------|----------|----------------------------------------------------------------------------------------------------------------------|
| H1      | APPLIED  | Added SIGTERM+SIGINT handler to `bootServer` scope (§5 server row); relaxed kill-poll to process-death only (§6.4); reframed D12; added AC A6. |
| H2      | APPLIED  | Split G2 / §6.2 into fresh-vs-adopt; adoption path writes `stateSchemaVersion: 0` sentinel with `createdBy.adoptedAt`; added AC B6. |
| M1      | APPLIED  | Tagged-union `readProcessLock` return — `'absent' \| 'stale' \| 'live' \| 'incompatible'` — defined in §6.1; A4/A5 updated; callers enumerated. |
| M2      | APPLIED  | New `'incompatible'` compatibility value, distinct from `'older-desktop'`. Matrix row split (§6.3). Desktop scope row updated with `promptRefuseIncompatible`. AC C9 added. |
| M3      | APPLIED  | Retired NG8 (was "bump policy deferred"); closed Q1 via new D13; renumbered remaining NGs (old NG9 → NG8) and Qs (old Q2 → Q1, etc.). §6.5 "non-normative" qualifier dropped (L1). |
| M4      | APPLIED  | Introduced `describeLockHolder(lock)` in the new `version-mismatch-dialog.ts` scope row. G4 dialog copy parameterized on the resolver. AC C10 covers the label builder. |
| M5      | APPLIED  | New §5 "Files — app package (Vite dev-server)" section with `packages/app/src/server/hocuspocus-plugin.ts` as a lock writer. |
| L1      | APPLIED  | §6.5 heading changed from "non-normative guidance; Q1 defers final policy" to "(D13)". Section reads as normative now. |
| L2      | APPLIED  | D3 codesigning claim softened to "believed to carry… not empirically tested in this spec; revisit per NG6 trigger". |
| L3      | APPLIED  | Windows SIGTERM note added to §12 and to Q2 (the renumbered Windows/Linux policy question). |
| L4      | APPLIED  | `version-constants.ts` row rewords tsdown mechanism to `define`/`env` entry that reads `package.json` at build time. |
| L5      | DEFERRED | Non-load-bearing colorful analogy in D1 left as-is per finding recommendation. |

SPEC grew from 342 → 383 lines. Scope and goal counts: G1-G8 (unchanged), NG1-NG8 (was 9, one merged), D1-D13 (added D13), Q1-Q5 (was 6, two collapsed + renumbered).

The findings below are preserved as the original audit record. Do NOT re-read this file as a current-state description — read SPEC.md.

---

## High Severity

### [H1] Kill-and-restart flow assumes a SIGTERM handler that does not exist

**Category:** FACTUAL
**Source:** T1 (own codebase, Explore + direct grep)
**Location:** §3 G4, §6.4 ("The SIGTERM path relies on the server package's existing graceful-shutdown handler"), D12 ("5s gives graceful Hocuspocus shutdown time to drain WS + flush persistence").
**Issue:** The spec designs the kill-and-restart flow around an existing `SIGTERM` handler on the lock-owning server process that drains Hocuspocus, flushes persistence, and releases the lock. **This handler does not exist.** `packages/server/src/boot.ts` contains zero `process.on('SIGTERM' …)` registrations; grep over the whole server package turns up only references to SIGTERM-ing *child* processes (e.g., the `ok ui` sibling from `start.ts`). `acquireProcessLock`'s `release` function is not wired to `process.on('exit', …)` either. On receipt of SIGTERM, Node default-exits, and the lock file persists until the next acquirer declares it stale (stale-replace semantics in `process-lock.ts:144-149`).
**Current text:** "The SIGTERM path relies on the server package's existing graceful-shutdown handler (`SIGTERM` → drain Hocuspocus → flush persistence → release lock)."
**Evidence:**
- `grep "SIGTERM\|process.on\|signal" packages/server/src/boot.ts` → returns only doc-comment mentions of the UI sibling handler, not a server-side signal subscription.
- `packages/server/src/process-lock.ts:167-178` — `buildHandle` returns `{release, updatePort}` but never binds `release` to a signal or exit event.
- The kill-poll condition in §6.4 — `poll every 100ms until !isProcessAlive(lock.pid) AND (no lock || lock.pid !== original)` — requires either the lock file to be removed or the pid to change. Neither happens on a default-kill SIGTERM. Result: the poll will always time out in the real kill flow as written.
**Status:** CONTRADICTED
**Suggested resolution:** Two options, both should probably ship:
1. **Add scope item: register a graceful-shutdown handler in `bootServer`.** `process.on('SIGTERM', async () => { await hocuspocus.destroy(); await flushPersistence(); release(); process.exit(0) })`. Add unit + integration test coverage. Add AC row in Group A or Group F.
2. **Relax the kill-poll condition to just `!isProcessAlive(lock.pid)`.** A stale lock is not a blocker — `acquireProcessLock` handles the stale-replace case natively (`process-lock.ts:144-149`). Simpler and correct even if the graceful handler lands late. The "lock removed or pid changed" clause in §6.4 becomes unnecessary.

Preferred: do both. (1) gives users a clean shutdown under normal operation; (2) makes the desktop's kill path robust to a server that does not yet / cannot run the graceful handler (e.g., wedged event loop).

---

### [H2] "Missing manifest → fresh project" rule is wrong on existing pre-rollout projects

**Category:** COHERENCE
**Source:** L1 (logical consistency), reader pass
**Location:** §3 G2, §6.2 ("Missing file → treat as fresh project (write one, continue).")
**Issue:** The rollout scenario is not handled. When this spec ships, **every existing project** has:
- `.open-knowledge/` directory (with sync state, caches)
- `.git/open-knowledge/` shadow repo (with per-writer branches, checkpoints — real durable state)
- No `state.json` (never existed)

The rule "missing manifest → treat as fresh project, write one" would write a new `state.json` stamping `stateSchemaVersion = <current>`, claiming the current binary authored all the existing shadow-repo state. If a future `STATE_SCHEMA_VERSION = 2` binary then opens the same project and finds `stateSchemaVersion = 1`, it refuses — trusting a lie written at rollout time. Worse, the shadow repo might actually be schema-0 or schema-NaN-from-pre-rollout; the "fresh" write has erased that information forever.

The design is sound for genuinely fresh projects but conflates "no manifest" with "no prior state" — an invariant that only holds on greenfield opens.
**Current text:** "Boot-time rule: if present, `stateSchemaVersion` must equal the current binary's `STATE_SCHEMA_VERSION`. Not-equal → throw with clear message. **Missing file → treat as fresh project (write one, continue).** Corrupt (parse-fail or schema-fail) → throw (NG9)."
**Evidence:** Reader pass identified the rollout case. No explicit one-time migration/adoption logic in §6.2. The `.open-knowledge/` directory already exists on every project that has ever run `ok start` or the DMG.
**Status:** INCOHERENT
**Suggested resolution:** Distinguish "fresh project" from "missing manifest on an existing project". Concretely:
1. On missing manifest + no pre-existing `.open-knowledge/` + no `.git/open-knowledge/` → genuinely fresh; write manifest at `STATE_SCHEMA_VERSION`.
2. On missing manifest + any pre-existing state → treat as "adopting a pre-versioned project"; write manifest at `stateSchemaVersion: 0` (or a sentinel like `stateSchemaVersion: "pre-manifest"`), log a one-time warning, continue. The current binary then checks "is schema 0 readable by me? yes if I'm v1, no if I'm v2" — which is what the compatibility rule should do anyway.
3. Add an AC to Group B for the rollout scenario: "Opening a project that has `.git/open-knowledge/` but no `state.json` writes the manifest at schema version 0 (adoption), not current."

---

## Medium Severity

### [M1] `readProcessLock` return-type collision between "no lock" and "incompatible lock"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L3 (missing conditionality)
**Location:** §5 Scope (server package), §7 AC A4/A5, §6.3 attach matrix.
**Issue:** Today `readProcessLock(...) → ProcessLockMetadata | null` returns `null` for "missing / stale / cross-host / corrupt" locks. The spec's A4 says "`readProcessLock` returns null if any version field is missing or non-string/non-number." Callers like `tryAttachExistingServer` currently treat `null` as "no lock; proceed to acquire our own." Collapsing "incompatible lock" into the same `null` makes the matrix row *"Live lock, missing version fields → same as 'desktop protocol < lock protocol'"* (§6.3) unimplementable: the desktop has no way to distinguish "no holder at all" (proceed to acquire) from "live holder with missing fields" (refuse + surface).

If the spec ships as written, the missing-fields path falls through to `acquireProcessLock`, which then either races the live holder (pre-empting its lock file via stale-replace if the holder's pid happens to look dead to `isProcessAlive`) or fails with `ProcessLockCollisionError` — neither matches the "fail closed refuse + surface" intent.
**Current text:** "A4 — `readProcessLock` returns `null` if any version field is missing or non-string/non-number."
**Evidence:** `packages/server/src/process-lock.ts:235-263` defines `readProcessLock` with `ProcessLockMetadata | null` return. Existing callers (`tryAttachExistingServer` at `window-manager.ts:595-606`, `decideAutoStart` at `server-discovery.ts:79-114`) branch only on null vs object.
**Status:** INCOHERENT
**Suggested resolution:** Promote the return type to a tagged union:
```ts
type ReadLockResult =
  | { status: 'absent' }
  | { status: 'live'; lock: ProcessLockMetadata }
  | { status: 'incompatible'; reason: 'missing-fields' | 'corrupt'; rawLock: unknown }
  | { status: 'stale'; lock: ProcessLockMetadata };
```
Update every caller. Add an AC in Group A explicitly covering the four return shapes. `tryAttachExistingServer` maps `'incompatible'` → `compatibility: 'older-desktop'` (or a new `'incompatible'` compatibility value per [M2]).

---

### [M2] "Missing version fields" conflated with "desktop protocol < lock protocol" in §6.3

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §6.3 attach matrix row: *"Desktop cold open | Live lock, missing version fields | Same as 'desktop protocol < lock protocol' — fail closed (NG9-adjacent)."*
**Issue:** The rationale for "older-desktop → refuse" (D4) is state-integrity: *"Killing a newer server to start an older one could corrupt on-disk state the newer server already wrote."* But *missing* version fields don't imply *newer*; they imply *unknown* (pre-rollout binary). The policy outcome (refuse) might be correct, but the D4 justification doesn't apply, and the user-facing copy "newer protocol vP" would be factually wrong (there is no vP to name). A distinct `'incompatible'` compatibility value with its own dialog copy is needed, not re-using `'older-desktop'`.
**Current text:** Matrix row collapsing missing-fields into the older-desktop path.
**Evidence:** D4 rationale specifically cites newer-state corruption; missing-fields could be older, older-but-compatible, or truly unknown. Three different policy stances, one conflated handler.
**Status:** INCOHERENT
**Suggested resolution:** Split the matrix row. Add compatibility value `'incompatible'` with dialog copy along the lines of *"An unrecognized Open Knowledge server is driving this project (lock version unknown). Quit it or check your installs."* This also cleanly supports [M1]'s tagged-union mapping.

---

### [M3] G1 defines the `protocolVersion` bump rule; NG8 / Q1 say the rule is deferred

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §3 G1 vs §4 NG8 vs §9 Q1.
**Issue:** G1 states: *"protocolVersion (integer incremented on any cross-process API break)"*. §6.5 elaborates with specific examples (lock field rename, WS frame shape, MCP handshake addition). But NG8 reads *"protocolVersion bump granularity defined in this spec — deferred (Q1)"* and Q1 treats the rule as an open question with three competing options. Either G1 + §6.5 *are* the policy (and NG8/Q1 should be retired), or §6.5 is truly "non-normative guidance" and G1's "on any cross-process API break" should be softened.
**Current text:** G1 text + NG8 text (conflict).
**Evidence:** Cross-section read.
**Status:** INCOHERENT
**Suggested resolution:** Decide which is load-bearing. If G1 + §6.5 is the policy, retire NG8 and convert Q1 to a closed decision (D13). If not, soften G1 to *"protocolVersion is an integer — bump policy TBD per Q1"* and mark §6.5 clearly as "illustrative, not prescriptive".

---

### [M4] G4 dialog copy assumes lock owner is always "CLI"

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** §3 G4 dialog copy template.
**Issue:** G4 template reads *"Open Knowledge CLI vA.B is currently driving this project."* But the lock could be owned by another desktop instance (cross-version DMG ↔ DMG case, noted as unlikely in the spec but not ruled out), or by a test-harness server, or by a `bun run dev` Vite-plugin instance. The dialog lies when the holder is anything other than a CLI.
**Current text:** G4 quoted template.
**Evidence:** §6.3 matrix includes "Live lock, desktop protocol > lock protocol" without constraining the lock owner's install shape. The user's `lock.executablePath` field (G1) carries the owner's binary path — introspectable.
**Status:** INCOHERENT
**Suggested resolution:** Parameterize the dialog copy on `lock.executablePath`. Heuristic: basename ends with `.app/Contents/...` → "Open Knowledge desktop"; ends with `cli.mjs` or `/ok` → "Open Knowledge CLI"; else "Open Knowledge server". Or just show the raw path and let the user decide. Move the copy into the dialog-builder's test matrix per AC group.

---

### [M5] Vite-plugin lock-writing path not explicitly enumerated in §5 Scope

**Category:** COHERENCE
**Source:** T1 (Explore agent confirmation)
**Location:** §5 Scope — server package table.
**Issue:** §11 Implementation order says *"Every lock writer (CLI, desktop, test harness, Playwright fixture) is updated to write them"*. The Explore agent confirmed a fifth writer: the Vite plugin at `packages/app/src/server/hocuspocus-plugin.ts:121` calls `acquireServerLock(LOCK_DIR, {port: 0, worktreeRoot: PROJECT_ROOT})`. Not in the enumerated list. A reader following §5 as a checklist would miss this surface. The `bun run dev` integration (entry #3 in the companion `reports/server-paths/REPORT.md`) writes `server.lock`; the new version fields need to reach there too.
**Current text:** §5 Scope enumerates files per-package; the Vite plugin is not listed.
**Evidence:** `packages/app/src/server/hocuspocus-plugin.ts:121` call to `acquireServerLock`.
**Status:** INCOHERENT (incomplete scope)
**Suggested resolution:** Add a row to §5 Scope (app package, or a "shared lock writers" block): `packages/app/src/server/hocuspocus-plugin.ts` — wire version fields into `acquireServerLock`. Add a test asserting the Vite-plugin path carries the fields.

---

## Low Severity

### [L1] §6.5 marked "non-normative" but gives prescriptive rules

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §6.5 heading: *"Version-bump policy (non-normative guidance; Q1 defers final policy)"*
**Issue:** The section then presents rules ("bumped whenever…", "non-breaking additions do not bump") that read as normative. Mixed signal. Tied to [M3].
**Status:** INCOHERENT
**Suggested resolution:** Change heading to *"Version-bump policy — illustrative examples (final policy TBD per Q1)"* or just retire the hedge and own the rules.

---

### [L2] D3 rationale "macOS code-signing implications" asserted without citation

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** §8 D3 rationale.
**Issue:** *"Re-exec has real macOS code-signing / entitlement implications for a signed Electron app invoking an un-adjacent CLI binary."* No citation. This is load-bearing for the D3 LOCKED decision (choosing kill-and-restart over re-exec). A reader who wants to verify the constraint has nothing to follow. The claim is plausible but unsupported.
**Status:** UNVERIFIABLE
**Suggested resolution:** Add a one-line reference to Apple's hardened-runtime documentation or to a specific Electron-apps-shelling-out precedent (e.g., VS Code's code.sh wrapper vs. direct exec). Alternatively, soften to *"believed to have code-signing implications, not empirically verified"* — D3's core argument (desktop owns its own bundled server, zero cross-binary codesign surface) survives without the assertion.

---

### [L3] Windows SIGTERM semantics not addressed

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §6.4 kill flow, D12 timeout, NG7 (defers Win/Linux desktop UX).
**Issue:** `process.kill(pid, 'SIGTERM')` on Windows does not actually send SIGTERM — Node maps it to `TerminateProcess`, which is immediate (no graceful drain). The spec's D12 "5s gives graceful Hocuspocus shutdown time to drain" is a macOS/Linux story. Mitigated: NG7 defers Windows desktop UX, so the kill flow is macOS-only in practice. But the CLI-side lock fields will still exist on Windows. A one-line note would close the ambiguity.
**Status:** INCOHERENT (minor scope gap)
**Suggested resolution:** Add to §12 ("Non-obvious things to verify"): *"On Windows, `process.kill(pid, 'SIGTERM')` is not a real graceful signal — the kill-and-restart flow is implicitly macOS-only (NG7). CLI-side lock fields still apply to Windows and work regardless."*

---

### [L4] tsdown build-time injection mechanism under-specified

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** §5 Scope, `version-constants.ts` row: *"`RUNTIME_VERSION: string` (from `package.json` via tsdown inline)"*
**Issue:** tsdown does not have a first-class "inject package.json version" feature. Users typically read `package.json` in `tsdown.config.ts` and pass the value via the `define` / `env` options (pattern similar to Vite / esbuild). The spec's phrasing is loose. Not wrong, but the implementer may stub around for the specific mechanism.
**Evidence:** [tsdown docs](https://tsdown.dev/guide/getting-started); [claude-task-master example](https://github.com/eyaltoledano/claude-task-master/blob/main/tsdown.config.ts).
**Status:** UNVERIFIABLE (implementation detail)
**Suggested resolution:** Replace *"via tsdown inline"* with *"via a `define` / `env` entry in `tsdown.config.ts` that reads `package.json` at build time"*.

Sources:
- [tsdown — Getting Started](https://tsdown.dev/guide/getting-started)
- [claude-task-master/tsdown.config.ts](https://github.com/eyaltoledano/claude-task-master/blob/main/tsdown.config.ts)
- [Bun — Build-time constants with --define](https://bun.com/docs/guides/runtime/build-time-constants)

---

### [L5] D1 analogy ("pyenv/nvm/rustup") unsourced; minor overreach

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** §8 D1 rationale: *"The pyenv/nvm/rustup analogy is a warning: pointer files grow into full install managers."*
**Issue:** Non-load-bearing colorful analogy. Accurate directionally (those tools did start as simpler pointers and accreted complexity) but unsourced. A reader wanting to check the analogy has nothing.
**Status:** UNVERIFIABLE (non-load-bearing)
**Suggested resolution:** Leave as-is; the D1 core argument (one-file electors have their own drift story) is self-supporting. Or add a footnote linking to one of the tools' origin docs.

---

## Confirmed Claims (summary)

| Claim                                                                                     | Source                                           |
|-------------------------------------------------------------------------------------------|--------------------------------------------------|
| `ProcessLockMetadata` today is `{pid, hostname, port, startedAt, worktreeRoot}`           | `packages/server/src/process-lock.ts:28-35`      |
| `@inkeep/open-knowledge-server` + `-core` are devDependencies of the CLI                  | `packages/cli/package.json:62-65`                |
| `resolveSelfSpawn()` re-invokes `process.execPath + process.argv[1]`                      | `packages/cli/src/commands/self-spawn.ts:24-48`  |
| `resolveSelfSpawn` is used at exactly two intra-tree sites (mcp→start; start→ui)          | Explore grep confirmed: `server-discovery.ts:210`, `start.ts:92` |
| `tryAttachExistingServer` gates on liveness only                                          | `packages/desktop/src/main/window-manager.ts:595-606` |
| `buildManagedServerEntry` emits bare `{command: 'npx', args: [...]}`                       | `packages/cli/src/commands/editors.ts:64-77`     |
| `decideAutoStart` actions today are exactly `'connect' | 'spawn' | 'disk-only'`            | `packages/cli/src/mcp/server-discovery.ts:37-40` |
| `updateProcessLockPort` exists and preserves the rest of the lock                          | `packages/server/src/process-lock.ts:184-228`    |
| `runClean` is called AFTER `tryAttachExistingServer`                                       | `packages/desktop/src/main/window-manager.ts:345-365` |
| `createTestServer()` reuses `createServer()` directly, not `bootServer()`                  | `packages/app/tests/integration/test-harness.ts:122` |
| Playwright per-worker fixture writes `server.lock` via `acquireServerLock`                 | `packages/app/tests/stress/_helpers/fixtures.ts:205` → Vite plugin → `acquireServerLock` |
| DMG utility fork loads `bootServer` via `@inkeep/open-knowledge-server` import             | `packages/desktop/src/utility/server-entry.ts:24` |
| Parent Electron spec D51 locks macOS-only v0                                              | `specs/2026-04-11-electron-desktop-app/SPEC.md:1062` |
| M6 writes `{"command": "/usr/local/bin/ok", "args": ["mcp"]}` for Electron-origin MCP configs | `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` G8/D52 |
| `boot.test.ts` exists                                                                     | `packages/server/src/boot.test.ts` (6648 bytes)  |

---

## Unverifiable Claims

| Claim                                                                              | What was checked                                                                                |
|------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Hocuspocus graceful-shutdown drains in <5s (D12 timeout basis)                      | Empirical, not measurable statically. §12 already flags as "verify during implementation". OK. |
| electron-updater quit+relaunch race with Hocuspocus shutdown drain (§12)            | Flagged in §12 as a thing to verify. Agreed — can't confirm from code alone.                    |
| "macOS code-signing implications" for exec'ing un-adjacent binary (D3)              | [L2] — asserted without citation, plausible.                                                    |
| `tsdown` "from package.json via inline" mechanism                                   | [L4] — mechanism exists but under-specified in the spec.                                        |
| D1 analogy about pyenv/nvm/rustup                                                   | [L5] — directionally true, non-load-bearing.                                                    |

---

## Coverage Notes

- **Reader pass** caught [H2] (the rollout backward-compat gap) which systematic lens analysis likely would have missed.
- **Factual track T1** delegated to a fresh Explore agent produced the [H1] contradiction.
- **Track T4 (web)** spot-checked tsdown documentation for [L4].
- **Tracks T2 (OSS repos) and T5 (external claims beyond dependencies) were not exercised** — this spec's claims are overwhelmingly internal-codebase or internal-spec cross-references, and the two external claims (Windows SIGTERM, macOS codesigning) are well-established patterns where web search adds no verification beyond what a careful reader could assert.
- **Audit bias:** I am the spec author. The "cold read" is compromised despite good-faith attempts. The findings above are those I could generate under that bias; a truly independent auditor may surface more (especially in stance and tone — L6-style issues).
