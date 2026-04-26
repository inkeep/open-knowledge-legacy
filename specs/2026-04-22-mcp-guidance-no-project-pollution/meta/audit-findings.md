# Audit Findings

**Artifact:** `/Users/timothycardona/inkeep/open-knowledge/specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md`
**Audit date:** 2026-04-22
**Auditor:** `/audit` (Opus 4.7, cold reader)
**Baseline commit verified:** `5fdd5557` (matches spec)
**Total findings:** 19 (5 high, 7 medium, 7 low)

---

## High Severity

### [H] Finding 1: G5 still describes the rejected Alt E architecture (`~/.agents/` canonical + 2 symlinks)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §2 (Goals), line 32
**Issue:** G5 says skill content works "with at most two symlinks off a canonical `~/.agents/skills/open-knowledge/` location." This describes **Alt E** (rejected per line 286) — a custom install scheme with a canonical file + symlinks. Alt F (chosen, `npx skills --copy`) produces **per-host copies** with NO canonical `~/.agents/` file that OK writes. The `~/.agents/skills/` path may be written by `npx skills` to some hosts (it's the universal agent path) but spec uses it as if it's the canonical anchor point of OK's design, which it is not.
**Current text:** "G5. Cross-host portability. Skill content works on Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf with at most two symlinks off a canonical `~/.agents/skills/open-knowledge/` location."
**Evidence:** §9 diagram (lines 216–224) enumerates per-host copies; §5 happy path says "each host gets its own copy"; Alt E at line 286 explicitly marked Rejected.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite G5 to match Alt F: "Skill content works uniformly on all 6 OK-supported hosts plus ~40 additional hosts via `npx skills add --agent '*'`, which writes per-host copies to each detected host's global skills directory." Remove the "~/.agents/skills/" anchor claim.

---

### [H] Finding 2: "27 agents" host count contradicts documented 45+ and is inconsistent with spec's own "36+" mention

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** §6 FR6 (line 107); §9 (line 223 "+22 other hosts"); §10 D1 ("36+"); §10 D4 ("27 agent hosts"); §14 ("27-host coverage"); §11 Q10 ("all 27 regardless"); evidence/npx-skills-investigation.md line 63
**Issue:** Spec repeatedly cites "27 agents" for `npx skills` ecosystem coverage. Vercel's official documentation and multiple third-party sources (as of 2026-04) document **45+ supported agents**. Moreover, the spec itself introduces a third number: "36+ host skills adoption" at D1 (line 293). At least three different counts appear in the document.
**Current text:** "27 agents" / "all 27" / "27-host coverage" (multiple places); "36+ host skills adoption" (D1)
**Evidence:** vercel-labs/skills README describes coverage as "OpenCode, Claude Code, Codex, Cursor, and 41 more agents" = 45; Vercel blog post about agent skills references 45+; research report states "36+".
**Status:** CONTRADICTED (stale/wrong number)
**Suggested resolution:** Pick one figure (likely 45) and use consistently, or use a softer qualifier ("40+ agent hosts as of `skills@1.5.1`") with a pointer to the registry that avoids baking a specific count into durable spec text.

---

### [H] Finding 3: FR4 per-tool description budget is internally inconsistent (500 vs 2048 bytes)

**Category:** COHERENCE
**Source:** L1, L5
**Location:** FR4 (line 105); §9 "Affected routes" (line 196); §9 diagram (line 211); §9 failure modes (line 275)
**Issue:** FR4 acceptance criteria (line 105) states "(b) total length ≤ 2,048 bytes (Claude Code's per-tool cap)". BUT three other places in the spec say 500 bytes:
  - Line 196: "per-tool `description` | Protocol | Each ≤ 500 bytes"
  - Line 211 (diagram): "per-tool `description` ≤ 500 bytes each"
  - Line 275 (failure modes): "Per-tool description at boot | Exceeds 500 bytes"

The meta/_changelog.md line 51 documents the user's late-session decision to raise the cap from 500 → 2048, but the rest of the spec wasn't updated to match.
**Current text:** Four different statements about the per-tool description cap.
**Evidence:** Changelog entry 2026-04-22 session 1 post-Q7: "FR4 budget tuned: user approved B — per-description ≤ 2,048 bytes ... Replaces original '≤ 500 bytes' target."
**Status:** INCOHERENT
**Suggested resolution:** Replace all three stale "500 bytes" references with the FR4 canonical: "≤ 2,048 bytes total AND first 500 bytes contain the call-site prerequisite." The 500-byte number is the truncation-safety budget for front-loaded content, not the total cap — the spec must distinguish these two.

---

### [H] Finding 4: Multiple file paths in §16 (Agent Constraints) use underscore naming that contradicts actual hyphenated filenames

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §16 SCOPE (line 428)
**Issue:** Line 428 lists `packages/cli/src/mcp/tools/{write_document,edit_document,exec,search,get_preview_url,read_document}.ts` — but the actual filenames in the repo use hyphens: `write-document.ts`, `edit-document.ts`, `get-preview-url.ts`, `read-document.ts`. Implementers following this path literal would not find the files.
**Current text:** `packages/cli/src/mcp/tools/{write_document,edit_document,exec,search,get_preview_url,read_document}.ts`
**Evidence:** `ls packages/cli/src/mcp/tools/` shows `write-document.ts`, `edit-document.ts`, `get-preview-url.ts`, `read-document.ts` (hyphens). The MCP *tool names* use underscores (`write_document`, `edit_document`, `get_preview_url`, `read_document`) but the *files* use hyphens. Spec conflates the two naming schemes.
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite as `packages/cli/src/mcp/tools/{write-document,edit-document,exec,search,get-preview-url,read-document}.ts` so implementer path literals match disk paths.

---

### [H] Finding 5: SKILL.md bundled asset path (`packages/cli/assets/skills/…`) not included in published `files` array

**Category:** FACTUAL / COHERENCE
**Source:** T1 (codebase)
**Location:** §16 "New files to create" (line 432); §13 Next actions; FR5
**Issue:** FR5 + §16 require shipping `packages/cli/assets/skills/open-knowledge/SKILL.md` inside the published `@inkeep/open-knowledge` npm package. But `packages/cli/package.json` line 21-24 publishes only `dist/` and excludes `dist/**/*.map`. Running `npx @inkeep/open-knowledge init` from an end-user's machine won't find the SKILL.md at `packages/cli/assets/skills/…` because `assets/` is not in the published package. The path the spec cites exists only in the source repo.
**Current text:** "SKILL.md shipped at `packages/cli/assets/skills/open-knowledge/SKILL.md`"
**Evidence:** `packages/cli/package.json` `"files": ["dist", "!dist/**/*.map"]`. §16 STOP_IF does not list "update package.json files array" as a required companion change; `ASK_FIRST` also does not flag it.
**Status:** INCOHERENT (missing companion change) — would break installs at runtime
**Suggested resolution:** Either (a) move SKILL.md under `dist/` (e.g. tsdown copies `assets/skills/…` → `dist/assets/skills/…` at build) and resolve via `new URL('./assets/skills/open-knowledge', import.meta.url)` in the CLI, OR (b) add `"assets"` to the `files` array in `packages/cli/package.json` and have `installUserSkill` resolve the path relative to the CLI package root. SCOPE §16 should enumerate the package.json edit.

---

## Medium Severity

### [M] Finding 6: Research-report evidence claim in D4 ("27 agent hosts") links to npx-skills-investigation.md, which is the same 27 claim — no independent verification

**Category:** FACTUAL
**Source:** L7, T4
**Location:** D4 Evidence column (line 296)
**Issue:** D4 cites `evidence/npx-skills-investigation.md` as evidence for the "27 agents" claim. That evidence file bases the count on a README skim and does NOT cite source / commit / date at which that count was true. No third-party corroboration exists in evidence. Vercel's own agents table is already larger (45+ as of 2026-04).
**Current text:** D4 Evidence: "[evidence/npx-skills-investigation.md](./evidence/npx-skills-investigation.md) (to be written)"
**Evidence:** The evidence file exists now but is self-referential for the count. (Note also that D4's evidence cell still says "(to be written)" — stale editing artifact from when the file didn't exist yet.)
**Status:** STALE
**Suggested resolution:** Remove "(to be written)" from the link cell. Reconcile with Finding #2 — either bump to 45 or switch to a qualitative "covers all 6 OK-supported hosts plus many others."

---

### [M] Finding 7: "Windows users get copy because `npx skills` requires interactive mode for symlinks" is not conclusively documented

**Category:** FACTUAL
**Source:** T3, T4
**Location:** A5 (line 334); FR6 notes (line 107); D7 note (line 299); evidence/npx-skills-investigation.md Finding "Symlink mode requires interactive prompts"
**Issue:** Spec states as documented fact that "symlink mode requires interactive prompt" and that `-y` non-interactive mode "would force copy anyway." Independent verification of the vercel-labs/skills README shows only `--copy` is documented as a flag; a `--symlink` flag is NOT documented. Whether `-y` defaults to copy or symlink is not explicitly documented by Vercel. The spec's claim could be true but is based on one paraphrase in the evidence file, not a citable README line.
**Current text:** "A5. Windows users get copy (not symlink) since `npx skills --copy` is the non-interactive mode — Confidence HIGH"; "`--copy` because `npx skills` requires interactive mode for symlinks" (FR6 note)
**Evidence:** Official vercel-labs/skills README documents 7 flags (`-g`, `-a`, `-s`, `-l`, `--copy`, `-y`, `--all`); no `--symlink` flag documented. Whether omitting `--copy` under `-y` produces symlinks or copies is silent in the README. Spec's evidence file at line 66 paraphrases this but doesn't quote a definitive source.
**Status:** UNVERIFIABLE (confidence label HIGH is too strong)
**Suggested resolution:** Downgrade A5 to MEDIUM confidence; add a smoke test in implementation that confirms `--copy` behavior on both platforms; update FR6 note from "requires" to "we pass `--copy` explicitly to force copy mode" — which is true regardless of default.

---

### [M] Finding 8: `paths:` frontmatter is Claude Code-specific; not part of the open Agent Skills standard

**Category:** FACTUAL
**Source:** T3, T4
**Location:** A2 (line 331); FR5 (line 106); §5 P4 happy path (line 82); §9 diagram (line 226)
**Issue:** Spec assumes `paths: '**/*.md, **/*.mdx'` frontmatter provides cross-host auto-activation scoping. Per the authoritative Anthropic Agent Skills spec at `platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`, only `name` and `description` are supported frontmatter fields in the Agent Skills standard. `paths:` is documented only at `code.claude.com/docs/en/skills` — it's a **Claude Code CLI extension** to the standard, NOT a cross-host feature. The official Anthropic best-practices page does not mention `paths:` at all.

The implication: on Cursor, Codex, Windsurf, Copilot, and Claude Desktop, the `paths:` field will likely be ignored, and the skill will either always activate or activate only via `description`-matching. A2 acknowledges this risk ("MEDIUM confidence, manual-test post-impl") but the spec body treats `paths:` as load-bearing for cross-host auto-activation.
**Current text:** A2: "Claude Code's `paths: '**/*.md, **/*.mdx'` frontmatter properly auto-activates the skill on markdown-touching turns"; FR5: "frontmatter `{name, description, paths: '**/*.md, **/*.mdx'}`"
**Evidence:** `platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` frontmatter table shows only `name` and `description`. `code.claude.com/docs/en/skills` frontmatter table has a `paths` field described as Claude Code-specific.
**Status:** INCOHERENT (accurate for Claude Code; misleading for cross-host claims)
**Suggested resolution:** Reword FR5 + A2 to clarify that `paths:` is a Claude Code bonus-optimization and cross-host activation relies primarily on `description`-matching. On non-Claude hosts, consider whether the skill might always-activate (low cost) or activate on description-match (expected). Add this nuance to A7 as well.

---

### [M] Finding 9: "Corrupt-frontmatter recovery" test listed in FR9, but the sidecar is a SHA-256 hex — no frontmatter

**Category:** COHERENCE
**Source:** L1
**Location:** FR9 (line 110)
**Issue:** FR9 acceptance criteria list required unit tests including "corrupt-frontmatter recovery." The skill-install design has two artifacts: (a) SKILL.md (has frontmatter, but it's created by the bundled asset, not user-writable at install time) and (b) `~/.open-knowledge/skill-installed-hash` sidecar (64-hex + newline, no frontmatter at all). The shadow-paths list at §9 (lines 256-258) correctly tests sidecar corruption as "wrong type: sidecar content not 64 hex chars." FR9's "corrupt-frontmatter recovery" test case doesn't correspond to anything in the design.
**Current text:** FR9: "Unit tests: canonical write, symlink success, symlink failure fallback, version-present skip, stale-version upgrade, corrupt-frontmatter recovery"
**Evidence:** D5 sidecar format (line 297); §9 failure modes table.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite FR9 to match the actual install shape: "Unit tests: fresh install, current-install skip, stale-bundled-hash upgrade, user-edited skill skip + warn, `--force` overrides, subprocess-failure non-fatal, sidecar missing/empty/wrong-hex treated as fresh install." Delete "symlink success / symlink failure fallback" (Alt E residual). Delete "corrupt-frontmatter."

---

### [M] Finding 10: FR9 mentions "symlink success, symlink failure fallback" — Alt E residue

**Category:** COHERENCE
**Source:** L1
**Location:** FR9 (line 110)
**Issue:** Same finding as #9 but for symlink tests. FR9 requires testing symlink logic that `installUserSkill` never performs — `npx skills --copy` is the mechanism, and there's no symlink logic in OK's code path per Alt F (D4, D7-dropped). The test name is a holdover from Alt E.
**Current text:** FR9: "symlink success, symlink failure fallback"
**Evidence:** D7 marked DROPPED; Alt F rejects custom symlink path; `--copy` eliminates symlink branch.
**Status:** INCOHERENT
**Suggested resolution:** Same as #9 — rewrite FR9 unit-test enumeration.

---

### [M] Finding 11: §9 "Error messages" and state matrix contain stale Alt E language

**Category:** COHERENCE
**Source:** L1
**Location:** §9 Error messages (lines 180-181); §5 state matrix (line 90)
**Issue:**
- Line 180: `copy ~/.agents/skills/open-knowledge/SKILL.md from <CLI-bundle-path>` — there is no `~/.agents/skills/` canonical file that OK writes; per Alt F, the user would run `npx skills add <bundled-path>` manually.
- Line 181: `User-global skill: wrote canonical file at ~/.agents/skills/open-knowledge/SKILL.md; copied to ~/.claude/skills/open-knowledge/SKILL.md (symlinks unsupported on this platform).` — describes Alt E "canonical + fallback" pattern. Alt F has no such semantics; copies are uniform.
- Line 90 (state matrix, Success): `"Skill installed at ~/.agents/skills/open-knowledge (symlinks: claude, windsurf)"` and Partial: `"Skill installed; windsurf symlink failed (permission denied)"` — Alt E symlink-partial semantics. Alt F has no symlinks on this code path.
**Current text:** Multiple Alt-E-shaped error messages in §9 and state matrix.
**Evidence:** Alt F per D4, D7 (DROPPED), FR6 note "requires interactive mode for symlinks."
**Status:** INCOHERENT
**Suggested resolution:** Rewrite all four strings to describe the Alt F flow: failure message should point to `npx skills add <bundled-path> --agent '*' -g -y --copy`; success message should say "Skill installed via npx skills to detected agents: claude, cursor, …"; remove "symlinks: …" and "canonical" language.

---

### [M] Finding 12: FR12 targets `~/.agents/skills/open-knowledge/SKILL.md` — which OK doesn't write

**Category:** COHERENCE
**Source:** L1
**Location:** FR12 (line 113)
**Issue:** FR12 (Could-tier) says: "`buildInstructions` or boot-phase check detects missing `~/.agents/skills/open-knowledge/SKILL.md`; emits one-line suggestion to re-run `ok init`." That path is not where OK writes anything per Alt F. OK writes only `~/.open-knowledge/skill-installed-hash` (sidecar). `npx skills` writes to per-agent paths like `~/.claude/skills/`, `~/.cursor/skills/`, etc. There may or may not be a `~/.agents/skills/` copy depending on whether `npx skills` treats the universal-agent path as a target — the spec is silent on this.
**Current text:** "detects missing `~/.agents/skills/open-knowledge/SKILL.md`"
**Evidence:** Install flow at §9 data-flow diagram. No code path writes to `~/.agents/skills/open-knowledge/SKILL.md` explicitly.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite FR12 to check the sidecar at `~/.open-knowledge/skill-installed-hash` (what OK actually owns) OR explicitly probe the first available host copy (what the `installUserSkill` pre-check already does). Prefer the former for symmetry.

---

## Low Severity

### [L] Finding 13: NG6 has both `[NOT UNLESS]` and `**DROPPED**` markers — contradictory

**Category:** COHERENCE
**Source:** L6
**Location:** §3 NG6 (line 41)
**Issue:** NG6 starts "[NOT UNLESS]" (a live, conditional non-goal) but immediately says "DROPPED" (no longer applicable). These are contradictory markers — the item is either a live NOT UNLESS or it's dropped, not both. Convention per CLAUDE.md: a dropped item loses its marker.
**Current text:** "**[NOT UNLESS]** NG6: ~~Windows-specific skill-install paths beyond symlink-fallback-to-copy~~ **DROPPED** (D7 dropped — …)"
**Evidence:** Convention inference + D7 dropped.
**Status:** INCOHERENT
**Suggested resolution:** Either delete NG6 entirely (since D7 dropped the concern) or rewrite as a standalone historical note in §15 Future Work. Remove the `[NOT UNLESS]` prefix.

---

### [L] Finding 14: D4 Evidence link says "(to be written)" but evidence file exists

**Category:** COHERENCE
**Source:** L6 (editing artifact)
**Location:** D4 (line 296)
**Issue:** Evidence column reads `[evidence/npx-skills-investigation.md](./evidence/npx-skills-investigation.md) (to be written)` — the "(to be written)" qualifier is stale; the file exists (6,530 bytes). Minor editing hygiene.
**Current text:** "[evidence/npx-skills-investigation.md](./evidence/npx-skills-investigation.md) (to be written)"
**Evidence:** `ls specs/2026-04-22-mcp-guidance-no-project-pollution/evidence/` shows `npx-skills-investigation.md` present.
**Status:** STALE
**Suggested resolution:** Remove "(to be written)."

---

### [L] Finding 15: Spec says "20 tools" in tool description registry; actual is 21

**Category:** FACTUAL
**Source:** T1
**Location:** §8 table (line 151); evidence/current-state-audit.md; evidence line 113 "map of 20 tool names"
**Issue:** Both the spec §8 (line 151, "13 KB of per-tool descriptions inlined"; talks about 20 entries implicitly through evidence reference) and evidence file line 31 say "Number of tool entries: 20." Actual count of DESCRIPTION exports in `packages/cli/src/mcp/tools/index.ts` is 21 (I counted 21 entries in the `TOOL_DESCRIPTIONS` object). The `suggest_links` tool DESCRIPTION is included in the count along with the other 20.
**Current text:** "20 tools" / "20 tool names"
**Evidence:** `packages/cli/src/mcp/tools/index.ts` `TOOL_DESCRIPTIONS` literal has 21 keys: exec, init-content, ingest, research, consolidate, read_document, rename_document, search, suggest_links, write_document, edit_document, get_history, save_version, rollback_to_version, list_documents, get_backlinks, get_forward_links, get_orphans, get_hubs, get_dead_links, get_preview_url. `ls packages/cli/src/mcp/tools/*.ts | grep -v test` confirms 21 tool files.
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Update evidence and §8 to say 21.

---

### [L] Finding 16: "VS Code Copilot 1024" caps cited at D11 is unsourced / likely misattributed

**Category:** FACTUAL
**Source:** T4
**Location:** D11 (line 303)
**Issue:** D11 says "~500 chars; within all host caps (VS Code Copilot 1024, Claude Code 1536)." The 1024 char limit is the **Anthropic Agent Skills spec-wide description cap** (`platform.claude.com` docs: "description: Maximum 1024 characters"). VS Code Copilot follows the open Agent Skills standard so it inherits 1024, but this isn't a Copilot-specific cap — it's the cross-standard cap. Calling it "Copilot 1024" misleads the reader about which cap is authoritative.
**Current text:** "within all host caps (VS Code Copilot 1024, Claude Code 1536)"
**Evidence:** `platform.claude.com` Agent Skills best-practices page: description max = 1024. `code.claude.com` Claude Code skills: description/when_to_use cap = 1,536.
**Status:** INCOHERENT (mislabeled source, not the number)
**Suggested resolution:** Rewrite as "within all host caps (Agent Skills standard: 1,024; Claude Code: 1,536)."

---

### [L] Finding 17: "--no-root-instructions flag removed" — flag isn't actually wired in Commander

**Category:** FACTUAL
**Source:** T1
**Location:** FR1 (line 102); D8 (line 300)
**Issue:** FR1 requires removing `--no-root-instructions`. Reading `packages/cli/src/commands/init.ts` lines 819-834, the Commander command declares only `--mcp`, `--no-mcp`, `--force`, `--dev-mcp`, `--editor`. There's no `--no-root-instructions` CLI flag. The `options.rootInstructions` exists as a **programmatic API field** on `InitCommandOptions` (line 145), consumed by `runInit`, but it's never wired to a command-line flag. So "remove the flag" is a no-op at the CLI surface; what actually needs removal is the `rootInstructions?: boolean` field from the options type and the `options.rootInstructions === false` branch.
**Current text:** FR1: "`--no-root-instructions` flag removed"
**Evidence:** `grep "rootInstructions" packages/cli/src/commands/init.ts` shows only type field + usage, no `.option()` declaration.
**Status:** STALE / imprecise
**Suggested resolution:** Rewrite FR1 acceptance criteria to: "`runInit` does not call `upsertRootInstructions`; the `rootInstructions` field removed from `InitCommandOptions` and `InitCommandResult`; export removed from `content/init.ts`." The changelog / release notes can still reference "removed flag" colloquially but the acceptance criteria should be precise.

---

### [L] Finding 18: Section 4 (Personas) P1 description conflates "disables the feature via `--no-root-instructions`" with the actual UX

**Category:** FACTUAL
**Source:** T1
**Location:** §4 P1 (line 47)
**Issue:** P1 says "Today: disables `--no-root-instructions` or feels resentful toward auto-injected content." Per Finding #17, `--no-root-instructions` isn't a CLI flag. Users cannot currently "disable the feature via `--no-root-instructions`" from the terminal — they'd have to do it programmatically, which they wouldn't. Persona description sets up a false backstory.
**Current text:** "disables `--no-root-instructions` or feels resentful toward auto-injected content"
**Evidence:** Same as #17.
**Status:** CONTRADICTED (minor — persona narrative detail)
**Suggested resolution:** Reword to "resents the auto-injected content in `CLAUDE.md`/`AGENTS.md` and has to manually revert / remove it after each `ok init`."

---

### [L] Finding 19: Section 16 (Agent Constraints) doesn't mention the `.open-knowledge/AGENTS.md` content port destination

**Category:** COHERENCE (completeness)
**Source:** L1
**Location:** §16 SCOPE; D12
**Issue:** D12 says "Port `CLAUDE_MD_SECTION` body into SKILL.md + port Frontmatter Conventions section from deleted `.open-knowledge/AGENTS.md`" — but §16 SCOPE doesn't enumerate the source-of-truth locations of (a) the frontmatter-conventions text inside the deleted `AGENTS_MD_CONTENT`, (b) the lifecycle guidance that ports into `CONFIG_YML_CONTENT` comments. D12 is DELEGATED (implementer drafts) but SCOPE doesn't pin them down enough to prevent the implementer drafting from the wrong template. Also: §16 mentions "port lifecycle guidance into `CONFIG_YML_CONTENT` comments" but doesn't identify which source section that is in `AGENTS_MD_CONTENT` (it's the "Suggested lifecycle (optional pattern)" section at init.ts:34-41).
**Current text:** "port lifecycle guidance into `CONFIG_YML_CONTENT` comments" (without pointer)
**Evidence:** packages/cli/src/content/init.ts:34-41 (lifecycle) and :56-74 (frontmatter conventions).
**Status:** INCOHERENT (soft)
**Suggested resolution:** Add explicit source-line pointers to the SCOPE list so the implementer can see the three sections to port without reading the entire file.

---

## Confirmed Claims (summary)

**Verified from codebase (T1):**
- `buildInstructions` exists at `packages/cli/src/mcp/server.ts:175` and renders the per-tool block at lines 283-285. (Spec §8, evidence/current-state-audit.md)
- `upsertRootInstructions` defined at `packages/cli/src/content/init.ts:277`, called from `commands/init.ts:544`.
- `AGENTS_FILENAME = 'AGENTS.md'` constant at `constants.ts:7`, used in both `SCAFFOLD_FILES` and `upsertRootInstructions` default file list.
- `PREVIEW_GUIDANCE` exists at `content/init.ts:192`, imported by `mcp/server.ts:25`, referenced in `mcp/server.test.ts:43-48`.
- `"Full convention: read \`${OK_DIR}/AGENTS.md\`."` exists in 4 tool files: `consolidate.ts:169`, `ingest.ts:75`, `init-content.ts:118`, `research.ts:172`.
- `init-content.ts:43` includes AGENTS.md in scaffold claim.
- Tool files use hyphenated names (`write-document.ts`, etc.) with underscored MCP tool names.
- 5 of 6 highlighted tool DESCRIPTIONS (`write-document`, `edit-document`, `get-preview-url`, `search`, `read-document`) front-load a prerequisite; `exec` does not. FR4 audit claim confirmed.

**Verified externally (T3/T4):**
- `skills@1.5.1` is the current published version, released 2026-04-17 (5 days before spec date). MIT, published by vercel-labs.
- `skills` package has `main: null`, `exports: null` — CLI only; no library API. Supports `CLI shell-out only` constraint.
- `--agent '*'` is documented and does target all supported agents.
- `--copy` flag documented; `--symlink` flag NOT documented (spec's `--copy` choice is defensible even absent conclusive interactive-vs-non-interactive default docs).
- `paths:` frontmatter field IS documented at `code.claude.com` for Claude Code specifically.
- Claude Code truncates tool descriptions and server `instructions` at 2KB each (confirming FR3 + FR4 choices).
- `~/.claude/skills/`, `~/.cursor/skills/`, `~/.codex/skills/`, `~/.copilot/skills/`, `~/.codeium/windsurf/skills/` are all valid global-skill paths per host.
- Agent Skills standard (platform.claude.com) requires only `name` + `description` frontmatter; other fields are host extensions.

**Coherence checks passed (L1-L7):**
- Decision Log resolution statuses (LOCKED/DIRECTED/DELEGATED) are present on all D1-D16 entries.
- Open Questions Q1-Q9 properly marked Resolved or Deferred; Q10/Q11 properly Open.
- Most of the spec hangs together around the layered hybrid thesis; the problems cluster in the stale Alt E residue and the budget-number inconsistency.

---

## Unverifiable Claims

- **M2 target (≥ 95% tool-routing fidelity across 6 hosts)** — no public dataset or established benchmark exists (NG5 acknowledges this gap). Cannot confirm or refute target is achievable without implementation.
- **Q10 (does `npx skills --agent '*'` auto-detect installed hosts or install to all)** — spec acknowledges this as open; I could not find definitive docs either way. Spec's plan to verify during implementation is appropriate.
- **Q11 (`npx skills add` exit behavior with zero installed agents)** — same as Q10. Spec properly marks as open for implementation.
- **A7 (agent skills' description-matching reliability across 6 hosts)** — NG5 directly acknowledges this as the biggest data gap; spec's MEDIUM confidence is appropriate.
- **`~/.agents/skills/` path written by `npx skills`** — whether the universal `~/.agents/skills/` directory is treated as one of the "agents" targeted by `--agent '*'`, or whether it's a canonical-plus-symlinks root (per Alt E) regardless of `--copy`, is not clearly documented. Spec implicitly assumes per-host copies only; if `npx skills` writes there too, some spec assertions about "no canonical location" are false.
