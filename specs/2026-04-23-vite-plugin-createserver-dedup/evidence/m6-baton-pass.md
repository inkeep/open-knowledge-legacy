---
name: M6 spec explicitly carves out this refactor as out-of-scope
description: Proof that `docs/m6-spec-sharpen` branch's sharpened M6 spec names the exact file set this spec targets and places them out of M6's scope — clean baton-pass, zero code overlap.
sources:
  - specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md (origin/docs/m6-spec-sharpen version)
  - specs/2026-04-21-m6-cli-and-mcp-wiring/meta/audit-findings.md (m6 branch)
gathered: 2026-04-23
confidence: HIGH (verified via `git diff main..origin/docs/m6-spec-sharpen --stat`)
---

# M6 baton-pass to this spec

## Scope carve-out in the sharpened M6 spec

From `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` §1 (quoted verbatim from the `docs/m6-spec-sharpen` branch):

> "**Scope clarification — what M6 does not touch.** M6 narrows on the install boundary (how `ok` reaches a user's PATH and AI tools' MCP configs) and the first-launch UX. **The runtime server model — the existing set of collab-server entry points and Hocuspocus composition paths in `packages/cli/src/commands/`, `packages/server/src/boot.ts`, `packages/server/src/standalone.ts`, and `packages/app/src/server/hocuspocus-plugin.ts` — is out of scope and untouched. Reviewers should not expect entry-point consolidation or composition-path unification from this spec.**"

This spec targets exactly `packages/app/src/server/hocuspocus-plugin.ts` — the last file named in M6's carve-out list. Clean handoff.

## Zero code overlap

`git diff main..origin/docs/m6-spec-sharpen --stat` on the critical paths (2026-04-23 check):

| Path | m6 branch changes |
|---|---|
| `packages/app/src/server/` | 0 lines |
| `packages/server/src/` | 0 lines |
| `packages/cli/src/commands/start.ts` | 0 lines |
| `packages/cli/src/commands/mcp.ts` | 0 lines |
| `packages/cli/src/commands/ui.ts` | 0 lines |

M6's touched files (summary):
- `packages/desktop/src/main/*` — install-boundary code (cli-install, mcp-wiring).
- `packages/app/src/components/McpConsentDialog.tsx` — NEW, renderer-side.
- `packages/cli/src/commands/init.ts` + `editors.ts` — new `writeUserMcpConfigs` export + UX changes; does not touch server wiring.
- `AGENTS.md` — prose changes in install/UX sections.
- `specs/2026-04-21-m6-cli-and-mcp-wiring/*` — the spec itself.

Disjoint from this refactor.

## Audit finding relevant to our worldmodel pass

`specs/2026-04-21-m6-cli-and-mcp-wiring/meta/audit-findings.md` (m6 branch) — Finding 11:

> "Claim about 'seven collab entry points / three wiring paths' in §1 scope-clarification paragraph is load-bearing and not evidence-backed ... No citation, no reference. A reader cannot verify the taxonomy without grepping `createServer` / `bootServer` / `new Hocuspocus` across the repo."

The claimed taxonomy:

1. `ok start` — via `bootServer()`
2. `ok mcp` **as a spawner** — not independently verified
3. `bun run dev` via the Vite plugin — verified as "raw `new Hocuspocus()`"
4. Electron spawn mode — via `bootServer()`
5. Electron attach mode — not independently verified
6. `createTestServer` harness — via `createServer()` + hand-rolled HTTP
7. Playwright per-worker fixture — not independently verified

Three wiring paths claimed: `bootServer()` · `createServer()` · raw `new Hocuspocus()` in the Vite plugin.

**Action for this spec's worldmodel phase:** independently verify entries 2, 5, 7. If `ok mcp` as spawner creates its own Hocuspocus, there's a fourth wiring path to catalog. If Electron attach mode doesn't create Hocuspocus, drop from count. If Playwright fixture routes through the Vite plugin, it shares the dev path (no new wiring).

## Sequencing & merge risk

- No expected merge conflicts between `origin/docs/m6-spec-sharpen` and this refactor's PR — file sets are disjoint.
- Both branches touch `AGENTS.md` in different sections. M6 touches install/UX paragraphs; this spec touches the bootServer section. Grep-based conflict if both land on same hunk is unlikely given the file's 1600+ line span.
- Sequencing: either branch can merge first. If M6 merges first, this spec's post-merge CLAUDE.md breadcrumb remains valid (different section). If this spec merges first, M6's AGENTS.md changes stay orthogonal.
