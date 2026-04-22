# Agent Change Notes — commit-body summarization from mutation tools

**Status:** Seed (awaiting `/spec` loop)
**Depends on:** [[2026-04-18 agent-identity-attribution-foundation SPEC]] shipped (specifically FR-5 handler sweep, FR-7 ref fan-out, FR-8 `ok-actor:` body, FR-13 subject-prefix scheme, D38 per-writer L2 drain partition).
**Last updated:** 2026-04-21
**Baseline commit:** (TBD — first commit after foundation lands)
**Worldmodel:** _(optional — this spec is narrow; worldmodel may not be warranted)_
**Evidence:** `./evidence/`

---

## 1) Problem statement

**Situation.** Post-foundation, the history repo emits one commit per writer per L2 drain window with subject `wip: <docName>` and a structured `ok-actor:` JSON body carrying principal + session + docs\[]. `git log refs/wip/<branch>/<writer>` is legible by **who** and **which docs** — but every commit subject for a given writer looks identical (`wip: notes.md`). A user reviewing a week of Claude's activity sees a wall of indistinguishable subjects and must diff each tree to learn what the agent actually *intended*.

**Complication.** The foundation SPEC captures:

- *Identity* (who — principal + session + agent\_type) via `ok-actor:` body.
- *Effect* (what bytes changed) via `Y.Map('agent-flash')` y-lite delta ring-buffer (live, 50-entry bounded) and the git tree itself (durable).

Neither captures *intent* — the one-sentence "why did the agent make this edit." Intent is the only information the agent possesses at tool-call time that can't be reconstructed post-hoc from bytes + metadata. It exists in the model's reasoning but evaporates between "tool call issued" and "commit written" because no field in the mutation tool schemas carries it.

**Resolution.** Thread an optional `summary` parameter from every mutating MCP tool through the existing contributor-tracker drain into the `ok-actor:` body and (when single) the commit subject. Agents self-author one sentence per tool call describing the change they intend; those sentences coalesce per-writer-per-drain into commit messages that read like `git log` on a well-run team.

## 2) Goals

- **G1 — Legible per-agent history at `git log`.** A reviewer running `git log refs/wip/main/agent-<claude-a4f2>` sees distinct subjects that explain *why*, not just *where*.
- **G2 — Zero coupling to identity foundation semantics.** Summary is payload on the contributor-tracker drain; it rides the FR-7 fan-out without changing any LOCKED identity decision.
- **G3 — Optional, non-blocking.** Agents that don't summarize still produce attributed commits — behavior identical to post-foundation baseline.
- **G4 — Render-layer reuse.** Timeline / history panel UX can render summaries alongside y-lite delta cards without a new data source.
- **G5 — Greenfield-aligned.** Schema additions to `ok-actor:` are additive; subject-format change is a D53 addendum, not a reopen.

## 3) Non-goals

- **\[NOT NOW] NG1 — Summary enforcement / required field.** Keep optional. If product signal later shows unannotated commits are a drag, revisit.
- **\[NOT NOW] NG2 — Summary quality gates / linting.** No "agent must produce ≥5 words" style validation. Trust the agent; iterate on prompt guidance instead.
- **\[NOT NOW] NG3 — Human-authored summaries from the browser editor.** Humans express intent via save-version messages; per-tab-session change-notes from the browser side are a separate flow. Data model leaves room (`ok-actor` `summaries[]` is writer-agnostic) but UI is out.
- **\[NEVER] NG4 — Summary as primary identity/attribution source.** Identity = `ok-actor:` JSON; summary = intent annotation. Never conflate.
- **\[NOT UNLESS] NG5 — Retroactive summarization of past commits.** Not re-writing history. Forward-only.
- **\[NOT NOW] NG6 — LLM-generated summaries on the server side.** The server does not call a model to invent a summary when the agent omitted one. If the agent said nothing, the commit says nothing.

## 4) Personas / consumers

- **P1 — Human reviewer (knowledge-base owner).** Reads `git log` on a history ref, expects subjects like "added auth section" not "wip: notes.md". Primary consumer of G1.
- **P2 — AI agent (MCP subprocess).** Writes via mutation tools; must be able to pass a summary cheaply and ignore the field when not useful.
- **P3 — Timeline / history panel UX.** Already renders y-lite delta cards from `Y.Map('agent-flash')` / activity log; wants summary as hover/expanded text above the delta.
- **P4 — Compliance / audit future consumer.** §15 Noted item in foundation spec ("Compliance/audit views"). Summaries are an audit-friendly annotation without being a full audit-trail substrate.
- **P5 — Spec loop / follow-up spec author.** Needs this seed to converge into a decided SPEC without reopening any foundation-spec LOCKED decision.

## 5) User journeys

### P1 — Reviewing Claude's week

1. Alice runs `git -C .open-knowledge/history log refs/wip/main/agent-claude-a4f2 --oneline`.
2. Output reads:
   ```
   a3f2910 wip: notes.md — added auth design outline
   7b12d4c wip: notes.md — expanded token-rotation section
   2e9a8e1 wip: architecture.md — first draft of data flow diagram
   ```
   …instead of the pre-spec:
   ```
   a3f2910 wip: notes.md
   7b12d4c wip: notes.md
   2e9a8e1 wip: architecture.md
   ```
3. Alice picks the commit that sounds suspicious, `git show`, finds issue.

### P2 — Agent adds summary to a `write_document` call

1. Claude calls `write_document({ docName: 'notes.md', markdown: '…', position: 'append', summary: 'added auth design outline' })`.
2. Server routes through existing FR-5 identity threading + stashes `summary` in contributor-tracker entry (extension of existing map shape).
3. At L2 drain (15s debounce), the per-writer commit fires. Subject: `wip: notes.md — added auth design outline` (single summary). Body: existing `ok-actor:` JSON with new `summaries: ["added auth design outline"]` field.

### P3 — Multi-call coalescing

1. Claude makes three `edit_document` calls in one 15s window, each with its own summary: `"fixed typo in header"`, `"tightened intro paragraph"`, `"linked [[Auth Design]]"`.
2. L2 drain fires one commit for Claude-a4f2 (per FR-7 per-writer fan-out).
3. Subject: `wip: notes.md (3 edits)`. Body:
   ```
   wip: notes.md (3 edits)

   - fixed typo in header
   - tightened intro paragraph
   - linked [[Auth Design]]

   ok-actor: {"v":1,"principal":"principal-6f3a…","agent_session":"conn-abc","agent_type":"claude","display_name":"Claude (a4f2)","color_seed":"claude-code","docs":["notes.md"],"summaries":["fixed typo in header","tightened intro paragraph","linked [[Auth Design]]"]}
   ```

### P4 — Agent omits summary

1. Claude calls `write_document({ …, summary: undefined })`.
2. Subject: `wip: notes.md` (unchanged from baseline). Body: `ok-actor:` JSON with `summaries` field absent or `[]`.
3. No regression — baseline behavior.

### P5 — Non-content structural op

1. Claude calls `rename_document({ from: 'notes.md', to: 'auth-design.md', summary: 'clarifying scope — this is auth-specific, not general notes' })`.
2. Subject: `rename: notes.md -> auth-design.md — clarifying scope — this is auth-specific, not general notes` (truncated to \~72).
3. Same coalescing rules apply if multiple renames happen in one drain (rare but possible in batch-rename flows).

## 6) Requirements

### Functional

- **FR-1 (tool-schema extension).** Every mutating MCP tool accepts optional `summary?: string` (max length TBD — see Q1). Tools in scope: `write_document`, `edit_document`, `rename_document`, `rollback_to_version`, `save_version`, plus any of the 12 handlers covered by foundation FR-5 that expose a user-intent surface. Excluded: non-attributable structural ops (`delete_path` — if used in cleanup batches, summary may still apply; TBD Q2).
- **FR-2 (HTTP body threading).** Each mutating endpoint in `api-extension.ts` accepts `summary` in its JSON body, passes to the same `recordContributor`-style call site that foundation FR-5 already opens.
- **FR-3 (contributor-tracker shape extension).** The per-writer snapshot entry in [contributor-tracker.ts](packages/server/src/contributor-tracker.ts) gains a `summaries: string[]` field. Shape: `{ writerId, displayName, colorSeed, docs: string[], summaries: string[] }`. Summaries accumulate in call order during the drain window; snapshot swap drains them atomically.
- **FR-4 (`ok-actor:` body extension).** Extend the LOCKED foundation FR-8 JSON line with an optional `summaries?: string[]` field. Additive only — consumers that ignore unknown fields continue to parse. All summary strings deduplicated + length-capped (TBD Q1) before serialization.
- **FR-5 (subject-format rules — D53 addendum).** Per-writer commit subject:
  - 0 summaries → existing foundation format unchanged (`wip: <docName>`).
  - 1 summary → `<prefix>: <target> — <summary>` truncated to 72 chars (CommonMark convention).
  - ≥2 summaries → `<prefix>: <target> (N edits)` and body carries full list as markdown bullets above `ok-actor:`.
- **FR-6 (body markdown bullets for ≥2 summaries).** When summary count > 1, emit a markdown bullet list between the subject and the `ok-actor:` line. Ordered by call timestamp ascending. Separator: single blank line above and below bullet block.
- **FR-7 (save-version co-authored summaries).** Main-git save-version commits produced by foundation FR-9 include per-agent `Co-Authored-By:` trailers; this spec adds `Co-Authored-Notes:` **informal** trailer (one per agent session with non-empty summaries) listing that session's summaries as a compact `·`-joined string. NB: non-standard git trailer; GitHub renders trailers generously. If rendering is poor, fall back to plain body paragraph. Q3.
- **FR-8 (no activity-log coupling).** Summaries do NOT write to `Y.Map('agent-flash')` or the D49 activity-log Y.Map. Summary lives commit-path only. Timeline UX fetches summaries via history-repo reads (`git log` / `/api/history`), joined with activity-log deltas client-side by `{sessionId, docName, timestamp-window}`. (Q4 — verify the join is cheap enough.)
- **FR-9 (tool-description prompting).** The MCP tool DESCRIPTION strings nudge agents to summarize — one sentence, present-tense, imperative or past-tense acceptable ("add auth section" / "added auth section"). No hard validation. Prompt-engineering tweak, revisable without schema migration.

### Non-functional

- **NFR-1 (zero regression on foundation tests).** Foundation spec's `session-cleanup.test.ts`, `persistence-fan-out.test.ts`, `bridge-matrix.test.ts` must pass unchanged. This spec adds new tests; it does not touch foundation tests.
- **NFR-2 (backwards-compatible history reads).** Existing tooling that parses `ok-actor:` JSON continues to work — `summaries` is optional and additive. `/api/history` renderer emits summaries when present, elides when absent.
- **NFR-3 (byte budget on commit body).** Cap total summaries-bytes per commit at \~4KB. If exceeded, truncate with ellipsis + emit a metric event. Q1.
- **NFR-4 (drain atomicity).** Summaries drain with the rest of the contributor snapshot via existing `swapContributors` — no separate drain path, no new race surface.
- **NFR-5 (observability).** Bracket-prefix Pino log on drain: `[history] commit <sha> writer=<id> docs=<n> summaries=<n>`. Structured JSON counter `agentChangeNoteEmitted` in `metrics.ts` (counted, not aggregated).

### Acceptance criteria (per FR)

Expanded during `/spec` loop. Placeholder list:

- FR-1 acceptance: Zod schema on every in-scope tool accepts `summary`; existing callers work unchanged.
- FR-5 acceptance: git log on a test history ref shows the three subject shapes (0/1/≥2) per the rules.
- FR-6 acceptance: multi-call drain → bullets appear above `ok-actor:` in body.
- FR-7 acceptance: main-git save-version commit includes `Co-Authored-Notes:` trailer when any session had non-empty summaries.
- NFR-3 acceptance: 100 calls of 200-char summaries in one drain emits a single commit ≤4KB body with truncation metric fired.

## 7) Current state (post-foundation, brief)

Assumes foundation spec has landed all of FR-1 through FR-20 and renamed to `history-repo.ts`. Specifically:

- `recordContributor(docName, writerId, displayName, colorSeed)` (per foundation D41) exists and is called by all 12 mutating handlers.
- `contributor-tracker.ts` maintains a per-writer pending map drained at L2 debounce.
- `commitWip(history, writer, contentRoot, subject, branch, body?)` emits per-writer commits (FR-7 fan-out).
- `ok-actor:` JSON line is the canonical body schema (D13 LOCKED).
- `Y.Map('agent-flash')` is the live-recent y-lite ring (D49 LOCKED, 50-entry bound).
- D53 locks subject-prefix convention `<prefix>: <target>` with specific targets per action kind.

## 8) Proposed solution

### 8.1 Tool schema

```ts
// packages/cli/src/mcp/tools/write-document.ts (and 3-4 others)
{
  docName: z.string(),
  markdown: z.string(),
  position: z.enum(['append', 'prepend', 'replace']),
  summary: z.string().max(SUMMARY_MAX_LEN).optional(), // NEW — SUMMARY_MAX_LEN = 200 TBD Q1
}
```

DESCRIPTION string (per FR-9):

> `summary` — Optional one-sentence description of the intent of this edit, surfaced in the history commit message. Present-tense imperative ("add auth section") or past-tense ("added auth section") both OK. Omit if not useful.

### 8.2 HTTP plumbing

`api-extension.ts` handler extracts `summary` from body alongside the identity fields it already pulls post-foundation:

```ts
const { agentId, agentName, clientName, colorSeed, summary } = req.body;
// …existing identity path…
recordContributor(docName, writerId, displayName, colorSeed, summary);
```

### 8.3 Contributor-tracker extension

```ts
// packages/server/src/contributor-tracker.ts (post-foundation)
interface PendingEntry {
  writerId: string;
  displayName: string;
  colorSeed: string;
  docs: Set<string>;
  summaries: string[]; // NEW — ordered by record call, deduplicated at drain
}

export function recordContributor(
  docName: string,
  writerId: string,
  displayName: string,
  colorSeed: string,
  summary?: string, // NEW — optional
): void {
  const entry = ensureEntry(writerId, displayName, colorSeed);
  entry.docs.add(docName);
  if (summary && summary.trim()) {
    entry.summaries.push(summary.trim());
  }
}
```

### 8.4 L2 drain — subject + body composition

Pseudocode for `commitToWipRef` (extends foundation's per-writer loop):

```ts
for (const entry of snapshot.entries) {
  const { subject, body } = composeCommitMessage(entry, branch);
  await commitWip(history, entry.writer, contentRoot, subject, branch, body);
}

function composeCommitMessage(entry: PendingEntry, branch: string): { subject: string; body: string } {
  const prefix = 'wip'; // or per-action prefix from FR-13
  const target = formatTarget(entry.docs); // one doc or "<first> + N others"
  const deduped = [...new Set(entry.summaries.map(s => s.trim()))].filter(Boolean);

  let subject: string;
  let body = '';

  if (deduped.length === 0) {
    subject = `${prefix}: ${target}`;
  } else if (deduped.length === 1) {
    subject = truncateSubject(`${prefix}: ${target} — ${deduped[0]}`);
  } else {
    subject = `${prefix}: ${target} (${deduped.length} edits)`;
    body += deduped.map(s => `- ${s}`).join('\n') + '\n\n';
  }

  body += formatOkActorLine(entry, deduped);
  return { subject, body };
}
```

### 8.5 Save-version trailer (FR-7)

```
Author: Nick Gomez <nick@inkeep.com>
Committer: Nick Gomez <nick@inkeep.com>

checkpoint: <user message>

Co-Authored-By: Claude (a4f2) <agent-conn-abc@openknowledge.local>
Co-Authored-Notes: Claude (a4f2): added auth design outline · expanded token-rotation section
Co-Authored-By: Cursor (9d2e) <agent-conn-xyz@openknowledge.local>
Co-Authored-Notes: Cursor (9d2e): refactored data flow diagram
```

Drawn from the contributor-tracker snapshot drained for the save-version window.

## 9) System design — delta-only diagram

Additions to foundation spec's §9 component view shown as `[+]`:

```
MCP tool call (write_document, edit_document, …)
  { docName, markdown, position, agentId, …, summary? [+] }
          ▼
api-extension.ts handler
  extractAgentIdentity(body) + extractSummary(body) [+]
          ▼
recordContributor(…, summary?) [+]
          ▼
contributor-tracker: PendingEntry.summaries[] [+]
          ▼
L2 drain (15s debounce, existing fan-out)
          ▼
composeCommitMessage(entry) [+]
  { subject, body with bullets + ok-actor.summaries }
          ▼
commitWip(history, writer, contentRoot, subject, branch, body)
          ▼
refs/wip/<branch>/<writer-id>
```

## 10) Decision log

| ID | Decision                                                                                                         | Type    | Resolution | 1-way?  | Rationale                                                                                                                  |
| -- | ---------------------------------------------------------------------------------------------------------------- | ------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| D1 | Summary is optional at the tool boundary. Agents choose when to annotate; no server-side synthesis.              | Product | PROPOSED   | Yes     | NG1 + NG6. Trust-the-agent + zero server inference. Revisit only if UX signal demands.                                     |
| D2 | Summary rides the existing contributor-tracker drain, not a new side-channel.                                    | Tech    | PROPOSED   | No      | Matches foundation D38 per-writer partition. Zero new race surface. NFR-4.                                                 |
| D3 | `ok-actor:` JSON gains `summaries?: string[]`; NOT a new `ok-summary:` body line.                                | Tech    | PROPOSED   | Partial | Additive to LOCKED D13 schema, preserves single-line-parse for existing consumers.                                         |
| D4 | Subject format: 0 → unchanged; 1 → `— <summary>` truncated 72; ≥2 → `(N edits)` + body bullets.                  | Product | PROPOSED   | No      | D53 addendum, not reopen. CommonMark 72-char convention. Human-legibility optimized.                                       |
| D5 | No coupling to `Y.Map('agent-flash')` activity log. Timeline UX joins summary + delta client-side.               | Tech    | PROPOSED   | Yes     | D49 is live-recent ring (50-entry, ephemeral); summary is durable commit-path. Separation preserves D49's bound.           |
| D6 | Save-version adds non-standard `Co-Authored-Notes:` trailer (plus `Co-Authored-By:` per foundation FR-9).        | Product | OPEN       | No      | Q3 — verify GitHub/GitLab rendering. Fallback: plain body paragraph with same content.                                     |
| D7 | Summary max length = 200 chars at tool boundary; total summaries-bytes per commit capped at 4KB with truncation. | Tech    | PROPOSED   | No      | Q1 — empirical tuning. 200 chars ≈ one tweet, comfortable for one-sentence intent. 4KB budget comfortably under git limit. |
| D8 | Deduplication at drain: identical summary strings collapsed; dedup-by-trim-and-exact-match.                      | Tech    | PROPOSED   | No      | Rapid identical tool calls (retry loops) shouldn't produce N bullet lines.                                                 |
| D9 | Summary omission by agent = baseline commit behavior exactly. No "(no summary)" placeholder.                     | Product | PROPOSED   | Yes     | Avoid noise. Git log of pre-spec commits reads identically to post-spec unsummarized commits.                              |

Further decisions deferred to `/spec` loop as open questions surface.

## 11) Open questions

| ID | Question                                                                                                                                                                                                                                                           | Type         | Priority | Blocking? | Plan to resolve                                                                        |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------- | --------- | -------------------------------------------------------------------------------------- |
| Q1 | Summary length cap at tool schema and aggregate byte budget at commit body. Proposed: 200-char per summary, 4KB per commit, truncate with ellipsis + metric. Is 200 right? Tweet-length feels sufficient; empirically check how Claude/Cursor naturally summarize. | Product/Tech | P1       | No        | Sample 20-50 real calls during prototype; calibrate.                                   |
| Q2 | Scope of mutating tools eligible for summary. `write_document`, `edit_document`, `rename_document`, `rollback_to_version`, `save_version` are clear yes. `delete_path`, `create_page` — less clear intent surface. Structural `sync/*` handlers — skip?            | Product      | P1       | No        | Align with foundation FR-5 handler list; confirm with product stakeholder.             |
| Q3 | `Co-Authored-Notes:` trailer rendering on GitHub/GitLab/Bitbucket. Non-standard git trailers may render as plain lines or be stripped. Verify + fallback to body paragraph if rendering poor.                                                                      | Product      | P2       | No        | Prototype + inspect on a real GitHub PR in a test repo.                                |
| Q4 | Timeline UX join cost. Rendering "summary + delta card" requires joining commits (durable) with `Y.Map('agent-flash')` entries (ephemeral) by `(sessionId, docName, time-window)`. Is the join fast enough for live timeline scroll?                               | Tech         | P2       | No        | Benchmark after FR-1 through FR-6 ship; defer UX work if join is expensive.            |
| Q5 | Do we include summary on `file-system` / `git-upstream` / `openknowledge-service` classified writers? These have no agent speaking; logically summary is always absent. Spec assumes yes (absent), but confirm.                                                    | Tech         | P3       | No        | Implementation-time check; likely trivially "classified writers never record summary." |
| Q6 | Interaction with V0-14 agent-undo (foundation FR-4). Should `applyAgentUndo` accept a `summary` too ("reverting accidental deletion") or is undo's intent self-evident? If yes, extend undo tool schema similarly.                                                 | Product      | P2       | No        | Decide when V0-14 tool lands; likely yes for symmetry.                                 |
| Q7 | Browser-principal summaries. Foundation D50 introduces per-tab-session origins for human browser writes. Do humans get a change-note surface in the editor UI (like a git commit message prompt after save-version)? This spec says NG3 (not now); confirm.        | Product      | P3       | No        | Deferred — separate UX spec if/when product demands.                                   |

## 12) Assumptions

- **A1 — Foundation spec landed.** This spec's whole dependency model is: FR-5 handler sweep + FR-7 fan-out + FR-8 body + FR-13 subject + D38 per-writer partition all live. If foundation ships with any of those descoped, this spec re-scopes accordingly.
- **A2 — `recordContributor` extension is non-breaking.** Adding an optional `summary` param after the existing 4 params is source-compatible with foundation call sites.
- **A3 — Agents willing to self-summarize.** The FR-9 tool-description nudge is sufficient to get \~50%+ of writes annotated. If empirical rate is <20%, re-examine prompting.
- **A4 — git subject truncation at 72 is accepted convention.** We truncate in-band with ellipsis; body carries full text. No configurable subject length.
- **A5 — `Y.Map('agent-flash')` stays the live-recent layer.** Summary does not migrate there.

## 13) In scope / out of scope

### In scope

1. Tool-schema `summary?` on in-scope mutating tools (FR-1, FR-9).
2. HTTP body threading in `api-extension.ts` (FR-2).
3. Contributor-tracker extension (FR-3).
4. `ok-actor:` JSON extension (FR-4).
5. Subject-format + body-bullets composition (FR-5, FR-6).
6. Save-version `Co-Authored-Notes:` trailer (FR-7).
7. Tool DESCRIPTION prompt updates (FR-9).
8. Observability (NFR-5).
9. Byte budgets + truncation (NFR-3).

### Out of scope (Future Work or NG)

- Timeline UX changes to render summaries (FR-8 leaves the hook; UX is a separate spec).
- Browser-side human-authored change-notes (NG3).
- Summary quality gates (NG2).
- Server-side LLM summarization (NG6).
- Retroactive summarization (NG5).
- Any foundation-spec LOCKED decision reopen.

## 14) Risks & mitigations

| Risk                                                                               | Likelihood | Impact | Mitigation                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Agents rarely use `summary` → feature is dead code                                 | Medium     | Low    | FR-9 prompt nudge; measure opt-in rate; iterate prompt if <20%.                                                            |
| Summary cap / truncation produces misleading commits                               | Low        | Low    | Truncate with ellipsis + metric; body always carries full text.                                                            |
| Non-standard `Co-Authored-Notes:` trailer renders poorly on forges                 | Medium     | Low    | Q3 — fallback to body paragraph.                                                                                           |
| Foundation spec ships with different field names and invalidates assumptions       | Low        | Medium | Seed-stage spec; re-baseline at `/spec` loop entry after foundation lands.                                                 |
| Abuse — agent puts PII or prompt-injection content in summary → appears in git log | Low        | Medium | Summary is self-reported like `clientInfo.name` (D15 posture). Document; no sanitization beyond D36 git-identity-sanitize. |

## 15) Future work

### Explored

- **Server-side summarization fallback.** If an agent omits `summary`, the server could generate one from y-lite delta + doc context. Explicitly NG6 for this spec; re-examine if G1 payoff is limited by agent opt-in rate.
- **Timeline UX integration.** Render summary above delta card in timeline / history panel. Own spec, depends on Q4 join benchmark.

### Identified

- **Browser human change-notes (per-save-action).** Matches save-version `-m` message but at smaller granularity. Tied to foundation D50 per-tab-session origin.
- **Summary-based search.** `git log --grep` already works; a richer "search across all my edits by intent" UX belongs in future spec.

### Noted

- **Multi-summary dedup rules beyond exact-match.** E.g., fuzzy-dedup "added section" vs. "added the section." Over-engineering at seed stage.
- **Agent-type-specific summary styles.** Some agents (e.g., Codex) may summarize differently from Claude; could encode style hints in `ok-actor:` body. Out for foundation + this spec.

## 16) Agent constraints

**SCOPE** — Implementation of this spec will touch:

- `packages/cli/src/mcp/tools/*.ts` (tool schemas + DESCRIPTION for mutating tools).
- `packages/server/src/api-extension.ts` (handler bodies extract + pass `summary`).
- `packages/server/src/contributor-tracker.ts` (PendingEntry.summaries, recordContributor signature).
- `packages/server/src/persistence.ts` (L2 drain compose subject + body).
- `packages/server/src/history-repo.ts` (optional — if `commitWip` needs a body parameter extension).
- Tests: new `change-notes.test.ts` integration test; extend `persistence-fan-out.test.ts` if needed.

**OUT of touch:** any foundation-spec LOCKED code path beyond the specific extension points named above. Especially: do NOT modify `Y.Map('agent-flash')` schema, `AGENT_WRITE_ORIGIN` / `AGENT_UNDO_ORIGIN` shape, per-session UM scope, or `isPairedWriteOrigin` check.

**STOP rules:**

1. Summary MUST NOT be stored in `Y.Map('agent-flash')` or any Y.Doc state. Commit-path only (D5).
2. Summary MUST NOT be used as an identity or attribution signal — it's an intent annotation. `ok-actor:` remains the identity source.
3. Server MUST NOT invent a summary when the agent omitted one (NG6).
4. Subject truncation MUST preserve the `<prefix>: <target>` portion — only the `— <summary>` tail gets truncated.

**Precedent alignment:**

- Foundation precedent "Classified writer IDs + subject-prefix action encoding" extends naturally here (subject appending after prefix).
- No new AGENTS.md precedent proposed at seed stage; may add one at spec-loop completion if the pattern seems reusable (e.g., "MCP mutation tools carry optional intent annotations threaded via contributor-tracker").

