---
title: M5 investigation findings — codebase grounding before /decompose
description: PR #166 substrate state verified against SPEC.md assumptions; design decisions for IPC relay, smoke key isolation, driver-script self-exit mode, and fallback-test mocking strategy.
tags: [spec, desktop, m5, investigation]
status: Final — 2026-04-21
---

# M5 investigation findings

This file captures the **OQ-1 implementer read-the-code** outcome before decomposition. It complements, does not modify, SPEC.md — the SPEC.md on this branch is the signed-off contract; these are the ground-truth facts and design decisions the implementer needs to convert SPEC.md into spec.json with confidence.

## 1) Substrate verification

### 1.1 `token-store.ts` — AC1 upsert assertion status

**Verified at `packages/cli/src/auth/token-store.ts` on this branch (origin/main tip).**

```ts
// KeyringBackend.set (lines 53–63)
async set(host, login, token, extra) {
  const { Entry } = await import('@napi-rs/keyring');
  const entry = new Entry(KEYRING_SERVICE, host);
  const data: TokenEntry = { login, token, ...extra };
  entry.setPassword(JSON.stringify(data));
}

// KeyringBackend.clear (lines 65–73) — ONLY here is deletePassword called
async clear(host) {
  const { Entry } = await import('@napi-rs/keyring');
  const entry = new Entry(KEYRING_SERVICE, host);
  try { entry.deletePassword(); } catch { /* absent — ignore */ }
}
```

**Finding:** The substrate already satisfies G5. `set()` invokes `Entry.setPassword(...)` exactly once and never calls `deletePassword` on the refresh path. `clear()` is the **sign-out** flow — not a refresh, and expected to call `deletePassword`.

**Implication for AC1:** OQ-1's escape hatch ("if the test fails on current impl, fix the substrate") does NOT trigger. The AC1 test is a **characterization + regression gate**, not a fix. Constraint "do NOT touch token-store.ts unless AC1 fails" stays intact.

### 1.2 `FileBackend` — AC3 substrate status

`FileBackend` (same file, lines 80–134) is exported, implements the `TokenStore` interface, writes `~/.open-knowledge/auth.yml` at `chmod 0600`, creates the parent dir at `0o700` if missing. Existing test file `token-store.test.ts` covers: round-trip, extra-fields, multi-host isolation, clear, overwrite, mode-0600, corrupt-YAML tolerance, nested-dir creation.

**Missing for AC3:** a test that verifies `createTokenStore` (the factory) actually falls back to `FileBackend` when `@napi-rs/keyring` import fails. The existing `createTokenStore` smoke test only asserts the returned shape, not the selection logic.

### 1.3 `createTokenStore` fall-through shape

```ts
// lines 147–158
export async function createTokenStore(authFile?: string): Promise<TokenStore> {
  try {
    const { Entry } = await import('@napi-rs/keyring');
    new Entry(KEYRING_SERVICE, '__probe__');        // ← probe; throws on broken ABI
    return new KeyringBackend();
  } catch {
    return new FileBackend(authFile);
  }
}
```

**Finding:** two failure points feed the single `catch` — (a) `import('@napi-rs/keyring')` itself throws (native binding missing / ABI mismatch / entitlement refusal), (b) `new Entry(...)` throws (library loaded but cannot construct an entry). Both route to `FileBackend`. Silent — only stderr INFO line `[auth] token storage: file (~/.open-knowledge/auth.yml)` distinguishes the paths.

### 1.4 Server ↔ keyring wiring — does NOT import keyring directly

**Verified at `packages/server/src/api-extension.ts`** — the `/api/local-op/auth/*` relay endpoints spawn `ok auth login --json`, `ok auth status --json`, etc. as **child_process subprocesses** of the utility process (lines 3507–3516 for `handleLocalOpAuthLogin`). The `localOpCliArgs` config (default `['open-knowledge']`) picks the CLI bin.

**Implication for R15:** the ACTUAL keychain access today happens inside a CLI subprocess, not inside the utility process. R15's "native module loads inside utilityProcess.fork()" proof is therefore a **NET-NEW verification surface** added by M5 — not just a documentation of current behavior. The `runKeyringSmoke()` utility loads `@napi-rs/keyring` **directly in the utility process context** for the first time. This is intentional and preserves future optionality (e.g., if a follow-up spec wants to move keychain access out of subprocess into utility-direct for latency reasons).

### 1.5 CFBundleDisplayName path — R16

`packages/desktop/electron-builder.yml` sets `productName: Open Knowledge`. electron-builder's behavior (confirmed in its codebase, `app-builder-lib/out/macPackager.js`) maps `productName` into both `CFBundleName` and `CFBundleDisplayName` in `Info.plist` when no explicit override exists. No extra plist-injection is required for R16.

### 1.6 IPC architecture snapshot

| Channel class | Transport | Type surface |
|---|---|---|
| Renderer ↔ main (request/response) | `ipcRenderer.invoke` / `ipcMain.handle` via `createInvoker` / `createHandler` | `RequestChannels` in `packages/desktop/src/shared/ipc-channels.ts` |
| Main → renderer (events) | `webContents.send` | `EventChannels` in `packages/desktop/src/shared/ipc-events.ts` |
| Main ↔ utility | `process.parentPort.postMessage` / `parentPort.on('message')` | `UtilityIncomingMessage` / `UtilityOutgoingMessage` discriminated unions in `packages/desktop/src/utility/server-entry.ts` |

No correlation-ID scheme exists today in the main↔utility channel — messages are one-shot (`init`/`shutdown` → `ready`/`error`/`degraded`). The debug-keyring-smoke relay is the first request/response pattern on this transport and will introduce a minimal correlation-ID scheme.

### 1.7 `packages/desktop/src/main/debug-ipc.ts` — does NOT exist today

Confirmed absent from `packages/desktop/src/main/` listing. Creating it net-new is in scope for M5.

### 1.8 `packages/desktop/tests/smoke/` — does NOT exist today

Confirmed absent. Creating the dir + runbook markdown is in scope.

---

## 2) Design decisions (to be respected in spec.json)

### D-M5-1 — Smoke key isolation

**Decision.** The utility-process smoke uses `(service='open-knowledge-smoke', account='test-user')`. The real auth substrate uses `(service='open-knowledge', account=<host>)`. Different service prefix guarantees keychain entries cannot collide even if cleanup fails mid-run.

**Why it matters.** If the smoke ever wrote to the real service prefix and a crash interrupted `deletePassword`, the user's real GitHub token could be corrupted on the next real auth flow. Service-prefix isolation makes that class of accident impossible.

### D-M5-2 — Main↔utility debug IPC uses correlation IDs

**Decision.** Extend `UtilityIncomingMessage` with `{ type: 'debug-keyring-smoke', correlationId: string }` and `UtilityOutgoingMessage` with `{ type: 'debug-keyring-smoke-result', correlationId: string, result: KeyringSmokeResult }`. Main maintains `pendingSmokeRequests: Map<string, { resolve, reject, timer }>`. Timer default 10 s → reject with `timeout`.

**Alternative considered.** One-shot handler (main listens for next result, matches to in-flight request). Rejected: even though debug IPC is gated on env/dev-mode, future debug endpoints may want concurrency. The correlation-ID pattern is the minimum additive cost (a `randomUUID()` + a `Map` entry) and sets a reusable precedent.

### D-M5-3 — `runKeyringSmoke` is injectable + pure

**Decision.** `runKeyringSmoke(deps?: RunKeyringSmokeDeps)` where `RunKeyringSmokeDeps = { loadKeyring: () => Promise<typeof import('@napi-rs/keyring')>, now?: () => number }`. Production call site defaults `loadKeyring` to `() => import('@napi-rs/keyring')`. Bun tests mock `loadKeyring` to simulate native-module failure, ABI mismatch, or read-mismatch.

**Why.** Keeps the utility module **unit-testable under Bun** (Bun's dev-ABI is not Electron's Node-ABI; cannot load the real N-API binding from `bun test`). Production path is one line of default injection.

### D-M5-4 — AC3 test uses `mock.module('@napi-rs/keyring', ...)`

**Decision.** Bun's `mock.module()` (seen at 4 other sites in this repo: `handle-paste.test.ts`, `paste-failure-toast.test.ts`, etc.) is the cleanest way to force the dynamic import inside `createTokenStore` to throw without touching the substrate. No `token-store.ts` change needed.

**Alternative considered.** Inject a `loadKeyring` parameter into `createTokenStore`. Rejected: violates the "SCOPE: do NOT touch token-store.ts" constraint. `mock.module` is test-only and leaves the substrate intact.

### D-M5-5 — Driver script uses **self-exit via output file**, not DevTools automation

**Decision.** `scripts/verify-keyring-in-packaged-dmg.mjs` sets two env vars on the child Electron process:
- `OK_DEBUG_KEYRING_SMOKE=1` — enables the gated utility path + auto-runs the smoke at utility boot (before the `ready` IPC fires).
- `OK_DEBUG_KEYRING_SMOKE_OUT=<tmpfile>` — utility writes the JSON result here, then the app exits 0.

The driver waits up to 30 s for the file, reads it, exits 0 on `ok:true`, exits 1 on `ok:false` (prints diagnostics).

**Alternative considered.** Drive DevTools via Playwright-Electron or AppleScript. Rejected: adds a CDP/UI automation dependency for a smoke that is fundamentally process-level, and couples the driver to renderer lifecycle (window-creation timing, React hydration). File-based handoff is the minimum surface.

The DevTools-Console IPC path (spec AC2) remains — that's the **interactive manual** smoke. The driver (AC8) uses the headless self-exit path.

### D-M5-6 — Utility auto-smoke fires ONCE, before `ready` IPC

**Decision.** When `OK_DEBUG_KEYRING_SMOKE=1` is set, the utility invokes `runKeyringSmoke()` once, synchronously awaits the result, writes the JSON to `OK_DEBUG_KEYRING_SMOKE_OUT` (if set), then continues normal boot. If `OK_DEBUG_KEYRING_SMOKE_EXIT=1` is also set (driver-only), the utility exits 0 after writing without booting the server.

**Why.** Boot-time invocation is the earliest point we can prove the native module loaded in the packaged utility. Gating on `EXIT` prevents the smoke from permanently breaking normal dev-mode use of the env var (devs may want to keep the flag on for multiple sessions).

### D-M5-7 — Debug channel lives in `RequestChannels` with a runtime gate

**Decision.** `ok:debug:keyring-smoke` is a first-class entry in `RequestChannels` with a `debug:` namespace prefix. The main-side handler gates at runtime: `if (app.isPackaged && !process.env.OK_DEBUG_KEYRING_SMOKE) throw new Error('debug-channel disabled in production')`.

**Alternative considered.** Separate `DebugRequestChannels` map and separate invoker. Rejected: doubles surface area (two imports, two handlers map, two preload invokers) for a 1-channel savings. Single typed map with a `debug:` namespace keeps it grep-able.

### D-M5-8 — Renderer surface is `window.okDesktop.debug?.keyringSmoke()` (optional namespace)

**Decision.** The `debug` namespace on `OkDesktopBridge` is **optional** (`debug?: { keyringSmoke(): Promise<KeyringSmokeResult> }`). Preload only populates it when `process.env.OK_DEBUG_KEYRING_SMOKE === '1'` OR `app.isPackaged === false`. Absent in normal production runs.

**Why.** Shape-optional is the right encoding: the channel simply doesn't exist on the bridge in production, so a typo in renderer code (calling a non-existent method) surfaces at compile time rather than at runtime. Biome/TS catch the error; no need for a second runtime check.

---

## 3) What remains creds-gated

AC4 (DisplayName prompt), AC5 (relaunch persistence), AC6 (v0.1.0→v0.1.1 upgrade), AC7 (`log show` evidence) require a **signed + notarized DMG on a fresh Mac**. Apple Developer credentials (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are NOT available on this machine.

**Deliverable shape for this PR:** the runbook `packages/desktop/tests/smoke/keyring-e2e.md` + the driver script `scripts/verify-keyring-in-packaged-dmg.mjs`. The runbook is executable when creds land (same creds gate that already blocks M2's full DOD — the M2 SPEC explicitly acknowledges this as shared external dependency).

**What the PR CAN prove locally (no Apple creds):**
- AC1 (upsert unit test) — runs under `bun test`.
- AC2 (dev-mode utility smoke) — runs under `bun run --filter=@inkeep/open-knowledge-desktop dev` + DevTools Console or env-driven self-exit.
- AC3 (fallback YAML mock) — runs under `bun test`.
- AC8 (driver against **unsigned** DMG) — `bun run --cwd packages/desktop build:mac:unsigned` produces a DMG; the driver script smoke-tests it. Unsigned DMG proves the utility-process native-module load **minus** hardened-runtime entitlements + notarization. The signed-DMG delta is gated on creds.
- AC9 (README updates) — docs inspection.
- AC10 (`bun run check`) — CI gate.

---

## 4) Files the implementer will create/modify

| File | Status | Change |
|---|---|---|
| `packages/desktop/src/utility/keyring-smoke.ts` | NEW | Export `runKeyringSmoke(deps)` + `KeyringSmokeResult` type |
| `packages/desktop/src/utility/keyring-smoke.test.ts` | NEW | Mock `loadKeyring` — success, native-missing, read-mismatch |
| `packages/desktop/src/utility/server-entry.ts` | MODIFY | Extend `UtilityIncomingMessage` + `UtilityOutgoingMessage`; wire debug-keyring-smoke handler; auto-invoke on `OK_DEBUG_KEYRING_SMOKE=1` |
| `packages/desktop/src/utility/server-entry.test.ts` | MODIFY | New tests for debug-smoke-relay + auto-invoke-on-env |
| `packages/desktop/src/main/debug-ipc.ts` | NEW | Main-side handler: relays renderer `ok:debug:keyring-smoke` → utility with correlation-ID; manages pending requests; gates on `app.isPackaged` + env var |
| `packages/desktop/src/main/debug-ipc.test.ts` | NEW | Relay + timeout + correlation + gating tests |
| `packages/desktop/src/main/index.ts` | MODIFY | Register debug-ipc handler at main boot (conditional) |
| `packages/desktop/src/main/window-manager.ts` | MODIFY | Route debug messages from utility → debug-ipc's pending map |
| `packages/desktop/src/shared/ipc-channels.ts` | MODIFY | Add `ok:debug:keyring-smoke` entry |
| `packages/desktop/src/shared/bridge-contract.ts` | MODIFY | Add optional `debug?: { keyringSmoke(): Promise<KeyringSmokeResult> }` |
| `packages/core/src/desktop-bridge.ts` | MODIFY | Mirror `bridge-contract.ts` addition (duplicated-by-design) |
| `packages/desktop/src/preload/index.ts` | MODIFY | Populate `bridge.debug.keyringSmoke` when `OK_DEBUG_KEYRING_SMOKE=1` or dev |
| `packages/cli/src/auth/token-store.test.ts` | MODIFY | ADD: upsert-semantics assertion test (G5/AC1); fallback-to-FileBackend test (AC3) |
| `packages/desktop/tests/smoke/keyring-e2e.md` | NEW | Manual runbook for AC4–AC7 on signed-DMG |
| `packages/desktop/README.md` | MODIFY | Add "Keychain + auth" subsection (AC9) — DisplayName UX, bundle-ID stability contract, `OK_DEBUG_KEYRING_SMOKE=1` debug path |
| `scripts/verify-keyring-in-packaged-dmg.mjs` | NEW | Driver: spawn app with env gates, wait for output file, exit 0/1 |
| `scripts/verify-keyring-in-packaged-dmg.test.mjs` | NEW | Unit/integration test of the driver's path handling, exit codes, diagnostics |

**No changes to:** `electron-builder.yml` (asarUnpack + entitlements correct; ASK_FIRST constraint honored), `packages/cli/src/auth/token-store.ts` substrate (SCOPE constraint honored — AC1 passes on current impl), `packages/cli/src/auth/device-flow.ts`, `packages/cli/src/auth/resolve-auth.ts`, `packages/cli/src/auth/fallback-yaml.ts` (does not exist; the FileBackend *is* the fallback — spec's name is aspirational; actual home is `token-store.ts:FileBackend`).

---

## 5) Aspirational name vs actual code — reconciled

Spec §4 mentions `packages/cli/src/auth/fallback-yaml.ts (if not already present per PR #166) + test`.

**Actual state.** No such file; `FileBackend` class in `token-store.ts:80–134` IS the plaintext YAML fallback. The spec's language "if not already present... verify there" acknowledges this possibility.

**Implementer action.** Treat "the fallback" as `FileBackend`. AC3 tests land in `token-store.test.ts` (existing file, augment). Do NOT create a new `fallback-yaml.ts` shim — it would be a no-op indirection.

---

## 6) Open risks at decomposition time

| Risk | Mitigation |
|---|---|
| `@napi-rs/keyring` dynamic `import(...)` fails under Bun test ABI even without mocking | Mock the module at the top of the smoke test file; never let the real import evaluate under Bun |
| Debug IPC correlation-ID `Map` leaks on timeout | Timer must `delete` the entry on both resolve AND reject paths; tested via the timeout test |
| Utility auto-smoke races against `bootServer` | Run the smoke BEFORE `handleInit` is processed; ordered by `parentPort.on('message')` queue — the `init` message won't be processed until the synchronous module-load path completes |
| Driver script hangs when child Electron crashes before writing output file | 30s timeout + stderr capture + exit 1 with captured stderr tail in diagnostics |
| CFBundleDisplayName prompt differs per macOS version | Runbook documents tested macOS versions; fallback to visual-prompt confirmation if `log show` signature doesn't match (OQ-2 acknowledged in spec) |

---

## 7) Handoff to /decompose

`/decompose` should produce user stories grouped as follows:

| Story group | Spec ACs covered | Evidence surface |
|---|---|---|
| **US-1: Upsert semantics regression gate** | AC1 | Bun unit test on `token-store.ts` |
| **US-2: YAML fallback under keyring-load failure** | AC3 | Bun unit test on `createTokenStore` + `FileBackend` round-trip |
| **US-3: utility-process smoke primitive** | AC2 partial | `keyring-smoke.ts` + unit tests |
| **US-4: Main↔utility debug IPC relay** | AC2, AC8 | Extend utility protocol; add `debug-ipc.ts`; bridge-contract optional namespace; preload wiring |
| **US-5: Boot-time auto-smoke + file-output mode** | AC8 | Gated on `OK_DEBUG_KEYRING_SMOKE` env; writes to `OK_DEBUG_KEYRING_SMOKE_OUT` |
| **US-6: Driver script for packaged-DMG** | AC8 | `verify-keyring-in-packaged-dmg.mjs` + test |
| **US-7: Runbook for creds-gated manual E2E** | AC4, AC5, AC6, AC7 | `packages/desktop/tests/smoke/keyring-e2e.md` |
| **US-8: README documentation** | AC9 | `packages/desktop/README.md` subsection |
| **US-9: Quality gate green** | AC10 | `bun run check` passes; Playwright unchanged (IPC-based, no UI) |

Dependency graph: US-1, US-2, US-3 parallel. US-4 depends on US-3 (needs `KeyringSmokeResult` type). US-5 depends on US-3 + US-4. US-6 depends on US-5. US-7, US-8 depend on the code surfaces existing (can draft in parallel, finalize after US-6). US-9 covers all.
