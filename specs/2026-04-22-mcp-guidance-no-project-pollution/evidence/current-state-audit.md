# Evidence: Current-state audit of OK's guidance-delivery surfaces

**Date:** 2026-04-22
**Sources:** `packages/cli/src/` (local codebase)

---

## Key files referenced

- [packages/cli/src/commands/init.ts](../../../packages/cli/src/commands/init.ts) — lines 26, 544: imports + calls `upsertRootInstructions`
- [packages/cli/src/content/init.ts](../../../packages/cli/src/content/init.ts) — `AGENTS_MD_CONTENT`, `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE`, `upsertRootInstructions`, `SCAFFOLD_FILES`
- [packages/cli/src/constants.ts](../../../packages/cli/src/constants.ts) — `AGENTS_FILENAME = 'AGENTS.md'`
- [packages/cli/src/mcp/server.ts](../../../packages/cli/src/mcp/server.ts) — `buildInstructions()` builds live instructions string
- [packages/cli/src/mcp/tools/*](../../../packages/cli/src/mcp/tools/) — 20 tools, each with a description
- [packages/cli/src/content/init.test.ts](../../../packages/cli/src/content/init.test.ts) — tests for `upsertRootInstructions`, `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE`
- [packages/cli/src/mcp/server.test.ts](../../../packages/cli/src/mcp/server.test.ts) — tests `buildInstructions` embeds `PREVIEW_GUIDANCE`

---

## Findings

### Finding: `buildInstructions` emits 24,019 bytes — 12× Claude Code's 2 KB per-server truncation cap

**Confidence:** CONFIRMED
**Evidence:** Ran `buildInstructions(minimalConfig)` and measured `.length`:

```
Total: 24019 bytes
Prose only (before per-tool block): 11031 bytes
Per-tool descriptions section: 12988 bytes
Number of tool entries: 20
```

The prose section (11 KB) covers: intro, `exec` usage, reading/writing, linking conventions, cadence, frontmatter, tools summary, preview guidance. The per-tool section (13 KB) inlines every tool's full description into the `instructions` string via `${Object.entries(TOOL_DESCRIPTIONS).map(([name, desc]) => \`### \\\`${name}\\\`\n${desc}\`).join('\\n\\n')}` at server.ts:283-285.

**Implications:**

1. **Per-tool descriptions are duplicated.** MCP hosts receive tool descriptions via `tools/list` independently — they don't need them in the `instructions` string too. Removing this redundancy saves 13 KB from `instructions` at zero information loss.
2. **Claude Code silently truncates 22 KB of this content.** The 2 KB cap means only the first ~1,000 words of prose reach the agent. STOP rules (at the top) survive; linking conventions, cadence, frontmatter guidance (in the middle/end) don't.
3. **FR3 target of ≤ 1500 bytes is achievable.** After removing the tool-inlining block (saves 13 KB) and compressing the prose (from 11 KB to ~1.5 KB), the total fits comfortably under the cap.

---

### Finding: Root `AGENTS.md` / `CLAUDE.md` injection flows through a single code path

**Confidence:** CONFIRMED
**Evidence:** Traced `upsertRootInstructions` usage:

- `packages/cli/src/content/init.ts:277` — function definition (51 lines).
- `packages/cli/src/content/init.ts:282` — default file list: `[AGENTS_FILENAME, ...(extraFiles ?? [])]`.
- `packages/cli/src/commands/init.ts:26` — import.
- `packages/cli/src/commands/init.ts:544` — single call site inside `runInit`:
  ```typescript
  const rootInstructions =
    options.rootInstructions === false
      ? []
      : upsertRootInstructions(cwd, options.force ?? false, extraInstructionFiles);
  ```
- `packages/cli/src/commands/init.ts:537-540` — `extraInstructionFiles` derived from `targets[].instructionsPath?.(cwd)` — today only Claude (`CLAUDE.md`) declares one.
- `packages/cli/src/commands/editors.ts:270` — `instructionsPath: (cwd) => join(cwd, 'CLAUDE.md')` for Claude's editor entry.

Additionally, results are surfaced to users via `formatInitResult` (console output section "Root instructions:"). `InitCommandResult.rootInstructions: RootInstructionResult[]` is part of the public return shape.

**Implications:**

- Removing `upsertRootInstructions` requires: (a) delete the function, (b) delete the call site in `runInit`, (c) delete the `options.rootInstructions` flag, (d) delete `rootInstructions: []` from `InitCommandResult`, (e) delete the "Root instructions:" block from `formatInitResult`, (f) delete `instructionsPath` from `EDITOR_TARGETS.claude` (and the `instructionsPath?:` type declaration on `EditorMcpTarget`), (g) update all tests that reference these symbols.
- One clean surgical removal — not scattered. Good.

---

### Finding: `AGENTS_FILENAME` is used BOTH as the internal scaffold filename AND as the default external-file target

**Confidence:** CONFIRMED
**Evidence:** `constants.ts:7`:

```typescript
export const AGENTS_FILENAME = 'AGENTS.md';
```

Two usages in `content/init.ts`:

1. `upsertRootInstructions` default file list: `const files = [AGENTS_FILENAME, ...(extraFiles ?? [])];` — this is the ROOT project AGENTS.md write.
2. `SCAFFOLD_FILES` array: `{ name: AGENTS_FILENAME, content: AGENTS_MD_CONTENT }` — this is the `.open-knowledge/AGENTS.md` internal README write.

**Implications:** Both usages must be removed as part of FR1 + FR2. After removal, `AGENTS_FILENAME` constant may be unused — delete it from `constants.ts` too (per D9).

---

### Finding: MCP tool descriptions reference `.open-knowledge/AGENTS.md` in 4 places

**Confidence:** CONFIRMED
**Evidence:** Grep on `mcp/tools/`:

- `init-content.ts:43` — describes `ok init` as creating `AGENTS.md` inside `.open-knowledge/`.
- `init-content.ts:51` — suggests the agent "Read `README.md`, `CLAUDE.md` or `AGENTS.md`, `package.json`" during codebase exploration (refers to user's repo root files, NOT the internal one — this is OK, still valid advice).
- `init-content.ts:118` — `"Full convention: read \`${OK_DIR}/AGENTS.md\`."`
- `research.ts:172` — same "Full convention: read..." line.
- `consolidate.ts:169` — same line.
- `ingest.ts:75` — same line.

**Implications:**

- The "Full convention: read `.open-knowledge/AGENTS.md`" pointers in research/consolidate/ingest/init-content become dead references once `.open-knowledge/AGENTS.md` is no longer scaffolded.
- Q8 in SPEC.md §11: need to either (a) inline the convention content into each tool's description, (b) point at the MCP handshake instructions string, or (c) point at the installed user-global skill.
- `init-content.ts:43`'s mention of AGENTS.md as one of the scaffolded files must be updated (that claim becomes false).
- `init-content.ts:51`'s reference to the user's own `AGENTS.md` / `CLAUDE.md` as codebase-exploration targets is fine — those are real user files to read, not something OK creates.

---

### Finding: Per-tool description surface already exists in `TOOL_DESCRIPTIONS` map

**Confidence:** CONFIRMED
**Evidence:** `mcp/server.ts:283` references `TOOL_DESCRIPTIONS` — a map of 20 tool names → descriptions. Individual tool files in `mcp/tools/*.ts` are the source.

**Implications:**

- FR4 (per-tool description upgrades) doesn't need new infrastructure — the descriptions are already rendered into the `tools/list` response via existing wiring. We just need to audit/edit the content of each relevant description.
- Highest-leverage tools for call-site-local prerequisite guidance: `write_document`, `edit_document`, `exec`, `search`, `get_preview_url`, `read_document`. Other tools are lower-priority but auditing all 20 is low cost.

---

### Finding: Tests for affected symbols are centralized in two files

**Confidence:** CONFIRMED
**Evidence:** Grep for `upsertRootInstructions|CLAUDE_MD_SECTION|PREVIEW_GUIDANCE|AGENTS_FILENAME`:

- `content/init.test.ts` — imports `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE`, `upsertRootInstructions`. Contains `describe('upsertRootInstructions', ...)` block with 6+ tests. Contains test `'CLAUDE_MD_SECTION embeds PREVIEW_GUIDANCE'`.
- `mcp/server.test.ts:43-48` — test `'buildInstructions embeds shared PREVIEW_GUIDANCE constant'` — dynamically imports `PREVIEW_GUIDANCE` and asserts `instructions.toContain(PREVIEW_GUIDANCE)`.
- `commands/init.test.ts` — likely tests `runInit` output shape including `rootInstructions` field. Need to read.

**Implications:**

- Deleting `upsertRootInstructions`, `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE` will break these tests. Strategy: remove the obsolete tests; add new tests for skill-install logic (FR9) + `buildInstructions` size cap (FR3).
- `PREVIEW_GUIDANCE` export may still be useful as a shared constant between `buildInstructions` (slim version) and the SKILL.md body (full version). Or: scrap the shared constant entirely and let each surface own its content. Judgment call — lean toward letting each surface own its content since they have different audiences and budgets.

---

## Gaps / follow-ups

- **OK's existing `options.home` parameter** on `runInit` — already used for test isolation (per `EDITOR_TARGETS.claude.configPath(cwd, home)`). Check if the same home-override mechanism extends cleanly to user-skill-install logic, or if we need a separate `skillsHome` option. (OQ Q6)
- **Exact current content of `mcp/tools/*.ts` descriptions** — not read yet for every tool. Audit step during Iterate phase. (OQ Q7)
- **Existing test harness patterns for filesystem mocking** — `content/init.test.ts` uses `mkdtempSync` (standard). Same pattern works for skill install tests.
