# Evidence: `npx skills` as the install mechanism for the OK user-global skill

**Date:** 2026-04-22
**Sources:** npm registry (skills@1.5.1), vercel-labs/skills GitHub, skills.sh docs

---

## Key files / pages referenced

- [vercel-labs/skills GitHub](https://github.com/vercel-labs/skills)
- [skills-v1-1-1 changelog post](https://vercel.com/changelog/skills-v1-1-1-interactive-discovery-open-source-release-and-agent-support) — v1.1.1 open-source release
- [skills npm registry metadata](https://registry.npmjs.org/skills) — published as `skills@1.5.1`

---

## Findings

### Finding: `skills@1.5.1` is stable, maintained, MIT-licensed, minimal-dep

**Confidence:** CONFIRMED
**Evidence:** Queried `https://registry.npmjs.org/skills`:

```json
{
  "name": "skills",
  "dist-tags": { "latest": "1.5.1", "snapshot": "1.4.5-snapshot.2" },
  "versions_count": 64,
  "time_modified": "2026-04-17T19:08:08.919Z",
  "latest": {
    "version": "1.5.1",
    "description": "The open agent skills ecosystem",
    "license": "MIT",
    "dependencies": { "yaml": "^2.8.3" },
    "bin": { "skills": "bin/cli.mjs", "add-skill": "bin/cli.mjs" },
    "main": null,
    "exports": null
  }
}
```

Key facts:
- **Latest published 2026-04-17** (5 days before this spec — active maintenance).
- **64 versions** published over the package lifecycle.
- **MIT licensed.**
- **1 dependency** (`yaml@^2.8.3`).
- **Two bin entries:** `skills` and `add-skill` (backwards compat with older `add-skill` CLI).
- **`main: null`, `exports: null`** — CLI only; no library API. Integrations must shell out.

---

### Finding: Non-interactive cross-host install is supported

**Confidence:** CONFIRMED
**Evidence:** vercel-labs/skills README:

```bash
npx skills add <source> --skill '<name>' --agent '*' -g -y --copy
```

Breakdown:
- `<source>` — accepts local paths, GitHub shorthand (`owner/repo`), full GitHub URLs, GitLab URLs, any git URL, or local path. For OK: local path to bundled SKILL.md directory.
- `--skill '<name>'` — optional filter when source contains multiple skills.
- `--agent '*'` — target all supported agent hosts (27 currently, including Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf, Junie, Goose, Gemini CLI, Amp, OpenCode, Roo Code, Firebender, Laravel Boost, Trae, Kiro, and 11 more).
- `-g` — global (user-level) install.
- `-y` — skip all confirmation prompts.
- `--copy` — force file copy mode. Symlink mode requires interactive prompt; `-y` without `--copy` would force copy anyway.

This is the invocation shape `ok init` will use.

---

### Finding: Symlink mode requires interactive prompts; non-interactive forces `--copy`

**Confidence:** CONFIRMED
**Evidence:** vercel-labs/skills docs: "When installing interactively, you can choose: Symlink (Recommended) — Creates symlinks from each agent to a canonical copy... or Copy."

**Implications:**
- In automated `ok init`, we get file copies into each agent's directory (e.g. `~/.claude/skills/open-knowledge/SKILL.md`, `~/.cursor/skills/open-knowledge/SKILL.md`, etc.).
- On upgrade (bundled SKILL.md content changes): we re-run `npx skills add`, each copy gets rewritten. No divergence unless user edited individual copies.
- User-edit preservation: we detect by checksumming one installed copy (e.g. Claude Code's) and comparing to the sidecar hash.

---

### Finding: No native version-check-skip flag

**Confidence:** CONFIRMED
**Evidence:** vercel-labs/skills README + flag audit — documented flags: `--skill`, `--agent` (-a), `--global` (-g), `--yes` (-y), `--copy`, `--symlink`, `--list`. No `--check-only`, `--if-current`, `--skip-if-installed` flags.

**Implications:**
- Each `ok init` that calls `npx skills add` does a full install (even if nothing changed).
- We must gate the call ourselves. Our pre-check: hash bundled SKILL.md, compare to sidecar at `~/.open-knowledge/skill-installed-hash`, skip if match.
- No protection against user edits from the tool side — we add that layer.

---

### Finding: Local path source supported for bundled skills in npm packages

**Confidence:** CONFIRMED
**Evidence:** vercel-labs/skills README: "Source formats: local path (e.g., `./my-local-skills`)." Confirmed by Vercel Knowledge Base article on skills.

**Implications:**
- We can ship `SKILL.md` inside `@inkeep/open-knowledge` npm package at `packages/cli/assets/skills/open-knowledge/SKILL.md`.
- At `ok init` runtime, compute the absolute path to the bundled skill dir (via `import.meta.url` resolution or `path.join(__dirname, ...)` after tsdown build).
- Pass that path to `npx skills add <abs-path> --agent '*' -g -y --copy`.

---

### Finding: `update` subcommand exists (but redundant for our use case)

**Confidence:** CONFIRMED
**Evidence:** vercel-labs/skills README mentions `npx skills update` to refresh installed skills.

**Implications:**
- Could be used instead of re-running `add`, but:
  - `update` refreshes from the original source (remote git URL or path).
  - For OK, the source is our own bundled path which doesn't change except via CLI upgrade.
  - Running `add` on every `ok init` (gated by checksum skip) is simpler.
- Not relevant for M1.

---

### Finding: `npx skills` supports `--agent '*'` which auto-targets detected hosts

**Confidence:** PARTIAL (INFERRED — documented as "all agents," empirical behavior not tested)
**Evidence:** README states `--agent '*'` covers "all supported agents." Unclear from docs whether it:
- (a) Installs to every agent's path regardless of which hosts the user has installed (would leave unused dirs), OR
- (b) Detects installed hosts and only writes to those.

**Implications:**
- If (a): user's `~/` gets ~27 subdirectories after `ok init`, some pointing to agent hosts they've never used. Low-grade clutter; not harmful.
- If (b): clean behavior; only installed hosts get the skill.
- Q10 in SPEC.md §11 tracks this for investigation during implementation.

---

## Gaps / follow-ups

- **Q10:** Empirical behavior of `--agent '*'` (installs to all paths regardless, or only detected hosts). Read vercel-labs/skills source during implementation to confirm.
- **Q11:** Exit behavior when no agents are installed (error vs success-with-warning).
- **Subprocess timeout:** Need to confirm what happens if `npx` takes >60s on slow network; current plan is 60s timeout kill + log warning.
- **`skills@^1.5.0` stability across minors:** Vercel Labs semver commitment implied but not formally declared. Mitigation: pinned range + smoke test in CI.
