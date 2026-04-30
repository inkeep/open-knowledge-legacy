# Audit Findings — Editor Asset + Embed Surface SPEC (Session 2 finalize pass)

**Artifact:** `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`
**Audit date:** 2026-04-21
**Declared baseline:** `2ad0177a` (SPEC line 7)
**Worktree HEAD:** `9629664c` (spec commit absorbing F8 + F9 + D-L + E2E scenarios — codebase identical to `2ad0177a`; only the spec text changed)
**Total findings:** 14 (5 HIGH, 5 MEDIUM, 4 LOW)

This is a cold-read re-audit after Session 2's close-out absorbed F8 + F9 into FR-1a/NFR-3, added D-L two-message rule, added `evidence/e2e-acceptance-scenarios.md`, and moved the declared baseline from `432a834b` → `2ad0177a`. Session 1's findings (H1 / H2 / H3 / M1-M7 / L1-L6) are resolved per `meta/_changelog.md` 2026-04-17 entry and not re-enumerated here.

The concentrated failure mode for this pass is **baseline drift**: the declared baseline moved from `432a834b` to `2ad0177a`, but §8 and most of §16's file:line citations were not re-verified at the new baseline, and `evidence/current-shipped-state.md` is explicitly locked to `432a834b` without a re-verification pass. Combined with four not-yet-purged "FIX-SHIPPED MICRO-PR" callsites that directly contradict the F8+F9 absorbed scope, the spec contains internal contradictions an implementer will hit on first read. The E2E scenarios file itself is well-constructed and traces cleanly to FRs + Goals — no findings there.

---

## High Severity

### [H1] §16 EXCLUDE list contradicts §13 In Scope on F8 + F9

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions), directly called out in audit-focus #4
**Location:** SPEC.md §16 lines 381-382 vs §13 lines 311-312 vs §3 Status line 3 + §6 line 158 + §6 line 186
**Status:** INCOHERENT

**Issue.** Session 2 absorbed F8 (shortestImageRef dirname-matrix fix) and F9 (unicode-safe sanitizeFilename) into FR-1a and NFR-3 respectively. The §13 In Scope list explicitly includes these fixes (lines 311-312). The status line 3 advertises "F8 + F9 absorbed into scope 2026-04-21." But §16 EXCLUDE still tells the implementer NOT to touch these sites:

**Current text — §16 EXCLUDE, lines 381-382:**
> - Do not touch `shortestImageRef()` behavior change (F8 micro-PR handles separately)
> - Do not touch filename sanitization regex (F9 micro-PR handles separately)

**Directly contradicted by §13 In Scope, lines 311-312:**
> - **F8 absorbed fix (FR-1a):** one-line `shortestImageRef` correction at `packages/app/src/editor/image-upload/index.ts:91` + dirname-matrix test…
> - **F9 absorbed fix (NFR-3):** one-line `sanitizeFilename` regex at `packages/server/src/api-extension.ts`…

**Evidence.** The changelog at `meta/_changelog.md` 2026-04-21 session-2 entry says "§15 Identified: F8 and F9 entries removed" and "F8 fix absorbed" / "F9 fix absorbed" — but does not list the §16 EXCLUDE removals. The purge was incomplete.

**Impact.** An implementer following /spec's `Agent Constraints` discipline (§16 is the canonical hand-off to `/ship` / `/implement`) would skip both F8 and F9 — leaving two known-broken sites untouched, which are the whole point of "no deferred tech debt on greenfield."

**Suggested resolution.** Delete both bullets from §16 EXCLUDE. Do NOT replace with a "Do modify F8/F9 sites" bullet — the SCOPE list already names `image-upload/index.ts` (line 373) and `api-extension.ts` (line 367) as in-bounds.

---

### [H2] §8 "Current state" contains two "micro-PR" leftovers that contradict F8 + F9 absorbed scope

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions) + Lens L5 (summary coherence); directly called out in audit-focus #4
**Location:** SPEC.md §8 lines 203-204
**Status:** INCOHERENT

**Issue.** Two more stale "micro-PR" references survived the Session 2 purge:

**Line 203:**
> ASCII-only filename sanitization at lines 137-144 (F9 micro-PR fixes separately).

**Line 204:**
> `shortestImageRef()` at `image-upload/index.ts:91-96` (needs fix, see §9 separate F8 micro-PR).

Both say the fixes are out of scope / handled separately, directly contradicting the absorbed-scope claim in the status line and in §13 / §9 / §6 FR-1a / §6 NFR-3.

**Suggested resolution.** Strike the parenthetical "(F9 micro-PR fixes separately)" and "(needs fix, see §9 separate F8 micro-PR)." Optionally replace with a forward pointer: "(F9 absorbed — see NFR-3 + §13)" and "(F8 absorbed — see FR-1a + §13)."

---

### [H3] §8 upload-handler citations are stale against the declared baseline (off by ~35-230 lines)

**Category:** FACTUAL
**Source:** Track T1 (own codebase); directly called out in audit-focus #6
**Location:** SPEC.md §8 line 203 (upload-handler line numbers)
**Status:** CONTRADICTED

**Issue.** SPEC line 7 declares `Baseline commit: 2ad0177a`. The file:line citations in §8 line 203 are from `432a834b` and have NOT been re-verified at the new baseline. Verified at HEAD `9629664c` (code-identical to `2ad0177a`):

| Claim | §8 cites (432a834b numbers) | Actual at 2ad0177a |
|---|---|---|
| `POST /api/upload-image` handler | `api-extension.ts:2779-2894` | `api-extension.ts:3014-3129` |
| `MAX_UPLOAD_BYTES = 10MB` | line 132 | line 167 |
| `ALLOWED_MIME_TYPES` Set | line 133 | line 168 |
| `GENERIC_PASTE_NAMES` regex | line 135 | line 170 |
| `readUploadBody` start | line 176 | line 211 |
| `sanitizeFilename` regex | lines 137-144 | lines 172-179 |

Session 1's audit caught the prior drift (evidence/current-shipped-state.md line 19 shows a 2026-04-17 re-verification at `432a834b`), but Session 2 moved the baseline to `2ad0177a` without re-running that pass.

**Evidence.** `git show 432a834b:packages/server/src/api-extension.ts | grep -n "sanitizeFilename\|MAX_UPLOAD_BYTES\|readUploadBody"` returns lines 132, 137, 176 — matching §8's citations exactly. The current-tree `grep -n` returns lines 167, 172, 211.

**Impact.** Implementer navigating from §8 "Current state" lands 35-230 lines away from the real code. Every identifier listed in §8 line 203 requires re-locating. Compounds with H2 because the stale citations sit next to the "micro-PR fixes separately" language that also needs removal.

**Suggested resolution.** Re-verify every `api-extension.ts` citation in §8 against HEAD. Specifically update line 203 to: `api-extension.ts:3014-3129` (handler), `:167`, `:168`, `:170` (constants), `:211` (readUploadBody), `:172-179` (sanitizeFilename). Also update `evidence/current-shipped-state.md` lines 23-41 + header assertion at line 19.

---

### [H4] §16 SCOPE + §13 In Scope reference `packages/core/src/markdown/handlers.ts` which does not exist

**Category:** FACTUAL
**Source:** Track T1 (own codebase)
**Location:** SPEC.md §13 lines 303-304 and §16 line 364
**Status:** CONTRADICTED

**Issue.** Three bullets direct the implementer to edit a file that does not exist on disk:

**§13 line 303:**
> - Embed mdast → PM handler (FR-3c) — `packages/core/src/markdown/handlers.ts`: extension-dispatch…

**§13 line 304:**
> - Embed PM → mdast handler (FR-3c reverse) — same file…

**§16 line 364:**
> - `packages/core/src/markdown/handlers.ts` — add `wikiLinkEmbed` → PM handler (extension dispatch) + PM → mdast reverse

**Verified absent.** `ls packages/core/src/markdown/` at HEAD shows `handlers.test.ts`, `handlers.mdx.test.ts`, `mdast-to-hast-handlers.ts`, `to-markdown-handlers.ts`, and `index.ts` — but no `handlers.ts`. Actual wiki-link handlers live in `packages/core/src/markdown/index.ts` — `handlers.wikiLink` at `index.ts:591-594` (mdast → PM) and `nodeHandlers.wikiLink` at `index.ts:876-884` (PM → mdast).

CLAUDE.md line 958 has the same stale citation: `packages/core/src/markdown/handlers.ts → index.ts`. The spec seems to have inherited it verbatim from CLAUDE.md without verifying; CLAUDE.md itself needs a corrigendum on the path contract but that's out of scope for this audit.

**Impact.** Implementer follows §13/§16, opens `handlers.ts`, gets file-not-found, has to detour into `index.ts` (~600+ lines of `MarkdownManager`) to locate the correct handler tables. Non-trivial detour — `index.ts` doesn't advertise "mdast handler table" in its symbol names.

**Suggested resolution.** Change all three citations (§13 lines 303-304, §16 line 364) from `handlers.ts` to `index.ts`. Additionally specify the existing handler anchors: "add `wikiLinkEmbed` handler near the existing `wikiLink` handler at `index.ts:591-594` (mdast → PM) and the PM → mdast handler at `index.ts:876-884`."

---

### [H5] §13 F9 breadcrumb misstates the `432a834b` line number (claims 176; actual was 137)

**Category:** FACTUAL
**Source:** Track T1 (own codebase); directly called out in audit-focus #6
**Location:** SPEC.md §13 line 312
**Status:** CONTRADICTED

**Issue.** The §13 F9 absorbed-fix bullet carries a drift breadcrumb:

**Current text:**
> **F9 absorbed fix (NFR-3):** one-line `sanitizeFilename` regex at `packages/server/src/api-extension.ts` (line has drifted from 176 at baseline `432a834b` to 172-179 at baseline `2ad0177a`)…

**Verified via `git show 432a834b:packages/server/src/api-extension.ts`:**
- `sanitizeFilename` at `432a834b` was at line **137** (not 176).
- Line 176 at `432a834b` was `readUploadBody` — a different function.
- Current `2ad0177a` position of `sanitizeFilename` is `172-179` ✓ (this half of the breadcrumb is correct).

The breadcrumb confuses two different symbols. It claims `sanitizeFilename` was at 176, when in fact 176 was `readUploadBody` and `sanitizeFilename` was at 137-144.

**Impact.** Low-cost to fix (it's a single number) but the breadcrumb is meant to teach an archaeologist how the line moved. Getting the start-line wrong defeats the purpose. Also erodes trust in the other breadcrumbs planned for post-ship corrigendum work (per CLAUDE.md §Post-ship corrigendum annotations).

**Suggested resolution.** Change "drifted from 176" to "drifted from 137-144." Rationale: evidence/current-shipped-state.md line 45 cites the `432a834b` range as `api-extension.ts:137-144`; the breadcrumb should match the same claim.

---

## Medium Severity

### [M1] §16 STOP_IF SVG-fallback line range is stale against the declared baseline

**Category:** FACTUAL
**Source:** Track T1 (own codebase); audit-focus #6
**Location:** SPEC.md §16 line 390
**Status:** CONTRADICTED

**Issue.**

**Current text:**
> SVG extension-fallback at `api-extension.ts:2853-2858` is removed without compensating guard…

**Actual at 2ad0177a.** The SVG manual detection block is at lines `3088-3093`:
```typescript
if (!detectedMime) {
  const head = buffer.subarray(0, 256).toString('utf-8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    detectedMime = 'image/svg+xml';
    detectedExt = 'svg';
  }
}
```

`2853-2858` was the `432a834b` range (verified by session 1 audit H1 resolution).

**Impact.** This STOP_IF is load-bearing: if the implementer searches for `2853-2858` they will find random code unrelated to SVG, miss the real guard, and possibly think the spec's STOP_IF is stale enough to ignore. Worse — when they remove / modify the SVG block in §13 FR-1 work, the STOP_IF may not fire in review because the line numbers no longer match.

**Suggested resolution.** Update to `api-extension.ts:3088-3093`. Or use a symbolic anchor: "the `<svg` text-sniff block inside `handleUploadImage` (currently around line 3088)."

---

### [M2] `evidence/current-shipped-state.md` header explicitly locked to `432a834b` while SPEC declares `2ad0177a`

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions) between SPEC metadata and evidence artifact; audit-focus #6
**Location:** `evidence/current-shipped-state.md` line 19
**Status:** INCOHERENT

**Issue.** The evidence file's verification header reads:
> All file:line citations re-verified at commit `432a834b` (current worktree HEAD) on 2026-04-17 during audit remediation.

SPEC now declares `Baseline commit: 2ad0177a` (line 7). The evidence file is the SPEC's only grounding for "current shipped state" file:line claims, and it has not been re-verified at the new baseline. Every line number in this evidence file drifts the same way as §8 (e.g., `readUploadBody` claimed at line 176, actual at line 211; sanitizeFilename claimed at 137-144, actual at 172-179).

The Session 2 close-out changelog acknowledged drift for the F9 fix but did not re-verify the evidence file as a whole. Per the task-level instruction ("the prior baseline was 432a834b so some evidence-file citations may need breadcrumbs"), the choice is either to:
1. Re-verify at `2ad0177a` and rewrite the numbers, or
2. Add a breadcrumb per CLAUDE.md §Post-ship corrigendum convention alongside the existing header, documenting that this file was last verified at `432a834b` and that citations may need +35 to +230 line shift against the current baseline.

Neither has been done.

**Impact.** Same class as [H3] but for the evidence artifact that /ship will consume. Implementers who cross-reference SPEC §8 against the evidence file will see two out-of-sync versions of the same claims.

**Suggested resolution.** Option 1 is more durable: re-run the `grep -n` spot-checks against HEAD, update the numbers, update the header date + baseline. Option 2 is cheaper but pushes the drift cost to future readers. The worktree is named `finalize-asset-embed-surface` — Option 1 fits the finalize posture.

---

### [M3] CC1 broadcaster API references `signalChannel` in three places; actual method is `signal`

**Category:** FACTUAL
**Source:** Track T1 (own codebase)
**Location:** SPEC.md §6 line 166 (FR-6 acceptance), §13 line 308 (In Scope entry), §16 line 369 (SCOPE entry)
**Status:** CONTRADICTED

**Issue.** The `CC1Broadcaster` class in `packages/server/src/cc1-broadcast.ts` exposes a public `signal(channel: string): void` method at line 36. No method named `signalChannel` exists:

```typescript
signal(channel: string): void {
  const existing = this.timers.get(channel);
  …
}
```

The SPEC uses three names inconsistently:
- §6 FR-3b line 161 correctly says: `cc1Broadcaster.signal('files')` ✓
- §6 FR-6 line 166 says: `signalChannel('files') fires on asset events too` ✗
- §13 line 308 says: `→ signalChannel('files')` ✗
- §16 line 369 says: `→ signalChannel('files')` ✗

**Impact.** Low-cost navigation break — implementer will grep for `signalChannel`, not find it, eventually realize the method is `signal()`. Creates ambiguity about whether the spec means to call `signal()` or propose a new `signalChannel` wrapper.

**Suggested resolution.** Replace `signalChannel` with `signal` (or `cc1Broadcaster.signal`) in all three sites. The correct precedent is already in FR-3b line 161.

---

### [M4] §11 references `evidence/inv4-outline-drop-pattern.md` which does not exist

**Category:** FACTUAL
**Source:** Track T1 (own filesystem)
**Location:** SPEC.md §11 line 278 (Q-INV4 row)
**Status:** UNVERIFIABLE (evidence file absent)

**Issue.**

**Current text:**
> Q-INV4 | Outline's non-image drop pattern for convergence | Technical | RESOLVED — `evidence/inv4-outline-drop-pattern.md`. Outline uses typed nodes (image/video/attachment) with `[title size](url)` metadata encoding. Contributed to D-I analysis.

**Verified.** `ls specs/2026-04-16-editor-asset-and-embed-surface/evidence/` returns `inv1`, `inv2`, `inv3`, `inv5`, `inv6` — no `inv4`. The changelog 2026-04-16 entry lists "INV4: Outline's non-image drop pattern — subagent" but no `evidence/inv4-*.md` artifact was ever committed.

The INV4 findings are loosely reflected in the full-sweep D-I rationale at §10 and in `reports/editor-asset-embed-patterns-across-universe/REPORT.md` (second external input) — so the *knowledge* wasn't lost, but the Q-INV4 row in §11 points to a nonexistent file.

**Impact.** Any reader clicking through to verify the "RESOLVED" claim will hit 404 on the evidence file. Slight trust erosion plus blocks independent verification of the Outline-pattern claim.

**Suggested resolution.** Either (a) back-fill `evidence/inv4-outline-drop-pattern.md` with the subagent output (if preserved in session logs), (b) repoint the Q-INV4 row to `reports/editor-asset-embed-patterns-across-universe/REPORT.md` which has the Outline cross-survey, or (c) mark Q-INV4 as "RESOLVED via external cross-survey — see reports/editor-asset-embed-patterns-across-universe/" and drop the dead evidence pointer.

---

### [M5] `evidence/inv3-file-type-mime-coverage.md` file:line citations are stale against declared baseline

**Category:** FACTUAL
**Source:** Track T1 (own codebase); audit-focus #6
**Location:** `evidence/inv3-file-type-mime-coverage.md` line 29
**Status:** CONTRADICTED

**Issue.**

**Current text in inv3 file:**
> Call site: `packages/server/src/api-extension.ts:38` (`import { fileTypeFromBuffer } from 'file-type'`) used at line 2535

**Actual at 2ad0177a:**
- Import at line **40** (not 38).
- Use site at line **3084** (not 2535).

Same drift pattern as H3 / M1 / M2 — inv3 was written at `432a834b` (or earlier) and never re-verified at `2ad0177a`.

**Impact.** Same class as M2 — implementer cross-referencing inv3 will find the numbers misaligned with both the SPEC and the real code.

**Suggested resolution.** Bundle the fix with M2's re-verification pass. Same dated-header update is appropriate.

---

## Low Severity

### [L1] §15 Future Work line 341 describes Phase 2 as replacing `[name](path)` emit — but FR-1a/D-I emits `![[...]]`

**Category:** COHERENCE
**Source:** Lens L5 (summary coherence)
**Location:** SPEC.md §15 line 341
**Status:** INCOHERENT (leftover from pre-D-I scope)

**Issue.**

**Current text:**
> | Typed-component-nodes Phase 2 rich previews | Video/Audio/PDFViewer replace `[name](path)` emit from FR-1 | Phase 2 lands |

D-I (line 260) locks wiki-embed `![[file.ext]]` as the P0 storage shape for renderable non-image extensions (pdf/mp4/mp3/…). §3 NG2 (line 68) and §5 P1 journey step 7 (line 99) consistently say P0 renders `![[file.ext]]` as plain-link fallback and Phase 2 promotes that same wiki-embed to a typed component at render time — storage shape never changes.

Line 341 still says Phase 2 "replaces `[name](path)` emit from FR-1" — describing a pre-D-I world where FR-1 emitted markdown-link for non-image. It's a leftover from the session-1 scope before D-I pivoted.

**Impact.** Misleads a Phase 2 implementer into thinking they need to migrate stored `[name](path)` refs to typed components. Under D-I, they only need to switch the render dispatch for existing `![[name.ext]]` refs — no content migration.

**Suggested resolution.** Rewrite to: "Typed-component-nodes Phase 2 rich previews | Video/Audio/PDFViewer swap for the P0 plain-link fallback on read (D-F read-time promotion); storage shape `![[file.ext]]` unchanged | Phase 2 lands."

---

### [L2] "Builds on" line 9 count of "8 items not shipped" is loose relative to REPORT.md findings inventory

**Category:** COHERENCE
**Source:** Lens L7 (inline source attribution); audit-focus #5
**Location:** SPEC.md line 9
**Status:** INCOHERENT (loose, not load-bearing)

**Issue.**

**Current text:**
> **Builds on:** `reports/editor-input-surface-worldmodel/REPORT.md` — triage of an earlier 30-decision draft SPEC that was developed in a sibling worktree but never committed to main. 8 items not shipped; others superseded, refuted, or fixed in this spec. See §9 for per-row disposition.

Triangulation of the "8 items" claim:
- REPORT.md exec summary: "13 findings inventory" = 5 S-items + 5 DIFF-items + 3 A-items.
- `meta/_changelog.md` 2026-04-16: "7 items classified ACTION-NOW by /assess-findings became the scope of this spec (FR-1 through FR-7)."
- Session 2 added FR-8 (endpoint rename) which is NOT from the prior spec. So post-Session-2, there are 8 FRs in this spec but only 7 of them trace back to the prior-spec triage.

The "8 items not shipped" claim appears to be counting the current spec's 8 FRs (FR-1 through FR-8) rather than 8 prior-spec items. That's internally defensible but misleading when paired with "prior 30-decision draft" — FR-8 (endpoint rename) is a new decision that didn't exist in the prior spec.

Separately: REPORT.md describes itself as "findings inventory ready for /assess-findings triage" (line 8) — it's the INPUT to triage, not the triage OUTPUT. The SPEC's characterization "triage of an earlier 30-decision draft" + "(worldmodel + assess-findings triage)" at line 15 reads like the report contains the classifications, when actually the classifications were reached in conversation + persisted only in changelog + §9.

**Impact.** Low — reader confusion, not load-bearing. §9 has the per-row disposition for real.

**Suggested resolution.** Either (a) change "8 items not shipped" to "7 items from the prior spec's 30-decision inventory still needed (FR-1..FR-7); FR-8 is net-new in this spec; others superseded, refuted, or fixed" — or (b) leave the phrasing but change "triage" to "findings inventory for /assess-findings triage; triage outcomes in §9."

---

### [L3] §13 `evidence/inv4` reference interacts with M4 — push-down list implicitly consumes the Outline drop pattern

**Category:** COHERENCE
**Source:** Lens L5 (summary coherence)
**Location:** SPEC.md §13 line 316 (push-down list)
**Status:** INCOHERENT (ambiguity only)

**Issue.** The push-down list (line 316) mentions:
> **MIME allowlist precision** (every `file-type@22.0.1` supported extension behaves correctly): parameterized narrow integration…

This reflects INV3 findings correctly. But there's no equivalent entry that consumes the Outline drop pattern (INV4) — which supposedly "contributed to D-I analysis" per §11. Combined with M4 (inv4 evidence file missing), the Outline pattern's role is unclear: is it an incidental cross-editor datapoint (in which case just linking the universe REPORT is enough), or is it load-bearing on D-I and thus should be re-findable?

**Impact.** Low. D-I itself is LOCKED with 6-editor convergence rationale; INV4 is one supporting datapoint and its loss doesn't re-open D-I. But it is a dangling citation.

**Suggested resolution.** Combine with M4 resolution. If M4 picks "repoint to universe REPORT," this finding resolves in tandem.

---

### [L4] FR-3a's `CODE_BANG (33)` parenthetical in §6 leaks implementation detail into acceptance criteria

**Category:** COHERENCE
**Source:** Lens L7 (inline source attribution)
**Location:** SPEC.md §6 line 160 (FR-3a acceptance criteria)
**Status:** stylistic

**Issue.**

**Current text:**
> …Adding the `CODE_BANG` (33) entry to the syntax extension's text map at construct-registration time is the expected shape.

Acceptance criteria typically state *what* must be true, not *how* to achieve it. "Adding CODE_BANG (33)" is an implementation tip. Under CLAUDE.md anti-patterns, acceptance criteria should be verifiable end-states, not code recipes. CODE_BANG is also already defined implicitly (character code 33 = `!`); spelling out the numeric constant is noise.

That said, this is consistent with how the spec pins other low-level expectations (precedent #15 identity-dedup, precedent #9 add-only schema), and removing it might lose a useful signal for the implementer about which extension slot to add to.

**Impact.** Negligible.

**Suggested resolution.** Either accept as-is (a load-bearing hint), or rewrite to: "the embed branch should register on the `!` text entry of the syntax extension's `text` map (sharing the singleton pattern with the `[` entry per precedent #15)."

---

## Confirmed Claims (summary)

The following claims verified cleanly at baseline `2ad0177a`:

**Track T1 (own codebase) — passing:**
- `shortestImageRef` function exists at `packages/app/src/editor/image-upload/index.ts:91` ✓ — F8 fix-point citation correct.
- Client POST target at `packages/app/src/editor/image-upload/index.ts:132` ✓ — FR-8 endpoint-rename client edit site.
- `managed-rename-rewrite.ts:243` contains `line[idx - 1] !== '!'` exclusion ✓ — FR-7 anchor site.
- `readMarkdownLink` at `managed-rename-rewrite.ts:77`, regex at line 88 ✓.
- `rewriteWikiLinksForDocumentRename` at `managed-rename-rewrite.ts:270`, `rewriteMarkdownLinksForDocumentRename` at line 302 ✓.
- `wiki-link-micromark.ts:42` `CODE_LBRACKET` check ✓ — FR-3a tokenizer reuse point.
- `MICROMARK_EXT` singleton at `wiki-link-micromark.ts:238` ✓.
- Identity-dedup checks at `wiki-link-micromark.ts:259, 265, 270` ✓.
- `enterWikiLink` line 154, `exitWikiLink` line 187 ending ~197, `wikiLinkHandler` 211-220 ✓.
- `content-filter.ts` `ASSET_EXTENSIONS.has(ext)` at line 204 ✓.
- `content-filter.ts` `dirCount` at line 175 ✓.
- `content-filter.ts` `incrementMdDir` / `decrementMdDir` lifecycle at lines 229-240 ✓.
- `file-type@^22.0.1` in `packages/server/package.json` line 22 ✓ — consistent with INV3.
- `reports/editor-input-surface-worldmodel/REPORT.md` exists and contains D1-D30 characterization + 13 F-numbered findings ✓.
- `reports/editor-asset-embed-patterns-across-universe/REPORT.md` exists ✓.
- `shared.ts` FileHandler block with `allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]` at lines 31-43 ✓ (SPEC's `32-44` range is off by one but §8 still resolves to the right block).

**Lenses L1-L7 — passing (Session-2-scope checks):**
- D-L two-message rule (§10 line 263) is internally consistent with FR-1 (line 157) — trigger conditions, message A/B texts, client-side extension check all match. Byte-exact message-A text propagates consistently through FR-1 → D-L → `e2e-acceptance-scenarios.md` P1.2 invariant 2. Byte-exact message-B text propagates through FR-1 → D-L → P1.2d invariant + P4.1 invariant 1.
- FR-1 + D-L edge cases traced to the emit-dispatch matrix (§6 lines 170-180) and to P1.2e (extension `.txt`, bytes sniff as PDF → accepts per D-A; emit uses extension → opaque → markdown-link) — coherent.
- D-L decision rationale (staff-eng + staff-PM convergence on message-specificity principle) is load-bearing for the two-message shape. Reversibility-on-copy is correctly noted.
- `evidence/e2e-acceptance-scenarios.md` — 10 primary scenarios (P1.1, P1.2, P2.1, P3.1, P4.1, P5.1, P5.1a, P5.2, P6.1, P6.2) exactly match §13 line 315 enumeration. "Top 10 budget" at scenarios line 325 matches same enumeration. Push-down list (scenarios line 344-357) is coherent with the push-down carve-out at §13 line 316.
- Each E2E scenario names perturbation classes that a silent regression would introduce — not vague ("test should fail") but specific (e.g., P5.1's perturbation names the line-243 exclusion guard, P6.2's perturbation names the FR-6 file-watcher widening). Each scenario states numbered invariants that are byte-level verifiable (exact strings, file existence, HTTP response shapes, CRDT Y.Text contents).
- Cross-FR coherence — §6 ↔ §9 ↔ §10 ↔ §13: the FR-to-prior-decision mapping in §9 correctly reflects F8 (D3 row) and F9 (D7 row) absorption into FR-1a and NFR-3 respectively. §10 D-L row is well-formed. §13 In Scope enumeration matches §6 FRs 1:1.
- Phase 2 coordination protocol in scenarios lines 362-371 (marking P1.1 / P1.1a / P1.1b / P1.1c / P6.1 as assertions to flip at Phase 2) is a sound handoff to the `specs/2026-04-08-typed-component-nodes/` Phase 2 In-Scope list.

## Unverifiable Claims

- **Q-INV4 Outline drop pattern.** Referenced evidence file missing (M4). The loose version of the claim (Outline uses typed nodes) is consistent with Outline's public design, but the "[title size](url)" metadata-encoding detail cannot be confirmed without either the evidence file or a targeted re-probe of the Outline source. Low urgency because D-I is locked with 6-editor convergence independent of INV4.
- **"8 items not shipped"** numerical claim (L2). The intended count is ambiguous (7 prior-spec items + 1 new FR-8, or 8 total FRs treating FR-1a as extension of FR-1). Not load-bearing; prose should just be tightened.
