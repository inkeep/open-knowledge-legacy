# Evidence: Claude Code MCP Roots Capability — Source-Level Audit

**Dimension:** Does Claude Code (CLI + Desktop Code tab + Cowork in-VM) advertise `roots`? Does `/add-dir` emit `roots/list_changed`? What does Cowork advertise as a root?
**Date:** 2026-04-18
**Version audited:** `@anthropic-ai/claude-code@2.1.114` (build timestamp `2026-04-17T22:37:24Z`)
**Method:** Binary string extraction from distributed Mach-O (ARM64, 204 MB); identifiers minified but string literals, method names, template strings are grep-able

**Vendor-bias flag:** Anthropic is vendor. Binary is distributed closed-source; sourcemap not published. Inferences are from observable string pool + call-site context.

---

## Bottom-line verdict

**Claude Code advertises `roots` capability but as a static, single-entry root = `file://<startup-cwd>`.**

| Aspect | Finding |
|---|---|
| `roots` capability declared at `initialize` | **YES** — as `roots: {}` (empty object) |
| `listChanged` advertised | **NO** — field omitted; schema validation rejects `list_changed` notifications |
| `roots/list` response | Exactly one entry: `file://${originalCwd}` |
| `/add-dir` → `notifications/roots/list_changed` | **NO** — updates internal state only, never reaches MCP clients |
| Cowork-specific behavior | **NONE** — Cowork inherits CLI behavior; advertises whatever cwd it was launched in |

---

## Findings

### Finding 1: `roots` capability declared as `{}` (not `{listChanged: true}`)
**Confidence:** CONFIRMED (string evidence in distributed binary)
**Evidence:** Binary offset ~9164

```javascript
{capabilities:{roots:{},elicitation:{}}}
```

**Note:** `roots:{}` — NOT `roots:{listChanged:true}`. Per MCP spec, omitting `listChanged` means the client MUST NOT send `notifications/roots/list_changed`. Schema validation elsewhere in the binary throws `"Client does not support roots list changed notifications"` when the field is absent.

### Finding 2: `roots/list` returns exactly one root = `file://${originalCwd}`
**Confidence:** CONFIRMED
**Evidence:** Binary offset ~9320

```javascript
w.setRequestHandler(u$6, async () => {
  return i_(H, "Received ListRoots request from server"),
  { roots: [{ uri: `file://${T8()}` }] }
})
```

Where `T8()` is:
```javascript
function T8() { return m_.originalCwd }
```

`originalCwd` is a **session-scoped constant captured once at startup from `process.cwd()`**. It is never reassigned by `/add-dir`, `--add-dir`, `additionalWorkingDirectories`, or `setToolPermissionContext`.

**Implication:** Any MCP server querying `roots/list` from Claude Code gets exactly one path — the directory where `claude` was launched. No workspace-folder list, no multi-root.

### Finding 3: `/add-dir` does NOT emit `roots/list_changed`
**Confidence:** CONFIRMED (by exhaustive grep + call-site trace)
**Evidence:** Binary offsets ~12319, ~12698, ~1697

The `/add-dir` slash command definition:
```javascript
g_1 = {type:"local-jsx", name:"add-dir", description:"Add a new working directory"}
```

Dispatches an `addDirectories` action. The reducer (~offset 66708) only:
1. Updates `additionalWorkingDirectories` (a `Map<path, {path, source}>`)
2. Optionally persists to `localSettings`

**Zero call path from `/add-dir` to `sendRootsListChanged()` or `notifications/roots/list_changed`.** The `addDirectories` dispatcher does not touch any MCP client instance in the session's `mcp.clients` map.

`sendRootsListChanged()` exists as a method on the bundled MCP Client SDK class (~offset 11934) but has **zero application-level callers**.

**This corrects an earlier INFERRED claim in `mcp-resolution-multi-kb.md` Finding 2** that assumed `/add-dir` would trigger `roots/list_changed`. It doesn't.

**Implication:** MCP servers cannot observe user workspace expansions via the roots protocol. If a user runs `/add-dir ~/kb2` after starting in `~/kb1`, the MCP subprocess continues to see only `~/kb1` as its root.

### Finding 4: Cowork inherits CLI behavior — no special root handling
**Confidence:** CONFIRMED (by exhaustive search for Cowork-specific branches)
**Evidence:** 41 `cowork`/`CLAUDE_COWORK` matches inspected

Cowork-specific env vars present in the binary:
- `CLAUDE_CODE_IS_COWORK` — affects telemetry payloads (`isCowork: EH(process.env.CLAUDE_CODE_IS_COWORK)`) and eager-flush timing
- `CLAUDE_CODE_USE_COWORK_PLUGINS` — swaps `plugins` → `cowork_plugins` and `settings.json` → `cowork_settings.json`
- `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`, `CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES` — memory feature overrides

**None of these affect the `roots/list` handler or `T8()` resolution.**

No `virtiofs`, `mnt/host`, `mnt/.virtiofs`, or VM-mount-aware strings in the binary:
```
grep -c "virtiofs\|mnt/host\|/mnt/\.virtiofs"  →  0
```

**Cowork's in-VM Claude Code advertises whatever `process.cwd()` was at spawn time — nothing more.** Whatever path the Cowork launcher invokes `claude` in becomes the sole advertised root.

### Finding 5: Cross-reference — what does Cowork launch `claude` in?

This is the remaining question. The Claude Code binary doesn't fork on Cowork detection for root handling, but the Cowork **launcher** (outside the VM) controls the cwd at spawn time. Based on the architecture (prior research: Cowork mounts user folders at `/mnt/.virtiofs-root/shared` inside the VM), the most plausible launcher behavior is:
- Cowork launches `claude` in the user's selected workspace folder (mounted path)
- Advertises that path as the MCP root

**UNCERTAIN** — not verifiable from the Claude Code binary alone; would need to inspect Cowork's launcher logic (the native `@ant/claude-swift` addon, not publicly distributed).

If this assumption holds, Cowork + PR #207 works correctly. If Cowork launches from `/` or `/home/user`, Cowork breaks with PR #207.

---

## Consolidated roots-capability landscape — all 7 harnesses

Combining this audit with Codex source audit (`codex-roots-source-audit.md`) and prior research:

| Harness | Declares `roots`? | `listChanged`? | `roots/list` returns | `/add-dir` emits `list_changed`? |
|---|---|---|---|---|
| Claude Code terminal | YES | NO | 1 root (startup cwd) | NO |
| Claude Code Desktop (Code tab) | YES (same binary) | NO | 1 root (startup cwd) | NO |
| Claude Cowork in-VM | YES (same binary) | NO | 1 root (launcher cwd, likely mounted folder) | N/A (no /add-dir) |
| Codex CLI | **NO** | N/A | Method not handled — error | N/A |
| Codex Desktop / IDE ext | **NO** (same code) | N/A | Method not handled — error | N/A |
| Cursor CLI | YES | **false** (per forum #77248) | Workspace folder(s) | UNCERTAIN |
| Cursor Desktop | YES | **false** (per forum #77248) | Workspace folder(s); multi-root spawns N MCPs | UNCERTAIN |
| Claude Desktop Chat | **NO (no workspace concept)** | N/A | Error / empty | N/A |

---

## Critical implication: PR #207 breaks on Codex + Claude Desktop Chat

**PR #207's strict-routing contract assumes the client advertises roots.**

```typescript
try { roots = await loadRoots(); } catch { throw ROOTS_UNAVAILABLE_ERROR; }
if (roots.length === 0) throw NO_CLIENT_ROOTS_ERROR;
if (roots.length > 1) throw MULTIPLE_ROOTS_ERROR;
return roots[0];
```

Against the harnesses:
- **Claude Code CLI + Desktop Code tab + Cowork in-VM:** `loadRoots()` returns 1 root → `return roots[0]` → works ✅
- **Cursor CLI + Desktop:** `loadRoots()` returns 1 root per MCP instance → works ✅
- **Codex CLI + Desktop:** `loadRoots()` errors (client didn't declare capability) → `ROOTS_UNAVAILABLE_ERROR` on every tool call ❌
- **Claude Desktop Chat:** No workspace concept → roots empty or absent → `NO_CLIENT_ROOTS_ERROR` or `ROOTS_UNAVAILABLE_ERROR` ❌

**2 of 7 harnesses fail under PR #207's strict routing** (Codex CLI, Codex Desktop as one surface; Claude Desktop Chat as another).

---

## What this means for our spec

### For harnesses where PR #207 works (Claude Code family + Cursor family, 4 of 7):

- Standard install: plain `npx @inkeep/open-knowledge mcp` entry
- No `--project` arg needed
- Single-project-per-MCP-instance via roots/list

### For harnesses where PR #207 fails (Codex family + Claude Desktop Chat, 3 of 7):

Three options:

1. **Ship `--project <abs-path>` arg baked at install time** for these harnesses. Extends earlier recommendation from "Claude Desktop Chat only" to "Codex family + Claude Desktop Chat." Our `mcp` command grows a `--project` flag that triggers `bypassProjectSelection: true` in PR #207's resolver.
2. **PR #207 adds a `processCwdFallback` option** that activates when roots are unavailable. Restores pre-#207 behavior for these clients. Trades "strict routing" promise for broader client support.
3. **Document as known limitation** — users of Codex/Claude-Desktop-Chat get "pass cwd explicitly" errors and must handle at the tool-call level. Worst UX; probably unacceptable.

**Option 1 is the cleanest** — arg-baking is a well-understood pattern and fits the existing `init` writes. For Codex specifically:
```toml
[mcp_servers.open-knowledge]
command = "npx"
args = ["@inkeep/open-knowledge", "mcp", "--project", "/Users/nick/my-project"]
```
For Claude Desktop (Chat) — same pattern, same flag.

### For Cowork specifically:

Depends on whether Cowork advertises the mounted workspace as a root (UNCERTAIN pending launcher inspection). If yes, Cowork works with PR #207 without `--project`. If no, Cowork needs `--project` — but since our MCP runs on the host (not in-VM), `--project` wouldn't reach it anyway in the SDK-bridge path, so Cowork is blocked on Anthropic bugs regardless.

---

## References

- npm package audited: `@anthropic-ai/claude-code@2.1.114`
- Native binary: `darwin-arm64/package/claude` (Mach-O 64-bit ARM64, 204 MB)
- Strings extraction: 33 MB, 141,380 lines
- Key string offsets (all in binary string table):
  - Client capability declaration: 9164 (`{capabilities:{roots:{},elicitation:{}}}`)
  - ListRoots handler: 9320 (`{ roots: [{ uri: \`file://${T8()}\` }] }`)
  - `T8()` definition (the `m_.originalCwd` getter)
  - `/add-dir` slash command definition: 13923 (`g_1={type:"local-jsx",name:"add-dir",...}`)
  - `addDirectories` action reducer: 66708
  - `sendRootsListChanged()` method definition: 11934 (no application-code caller)
- Access date: 2026-04-18
- Cross-referenced: `codex-roots-source-audit.md` (same-day companion finding on Codex)
