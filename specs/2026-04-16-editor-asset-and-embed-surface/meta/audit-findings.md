# Audit Findings — Editor Asset + Embed Surface SPEC

**Artifact:** `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`
**Baseline commit:** `432a834b` (current worktree HEAD — confirmed via `git log -1`)
**Audit date:** 2026-04-17
**Total findings:** 16 (3 HIGH, 7 MEDIUM, 6 LOW)

Cold-read audit covering (1) coherence across §1-§16, (2) factual verification of file:line citations, evidence, dependency versions, and CLAUDE.md precedent references, and (3) spec-specific pattern checks (schema add-only, typed origins, opaque-content-bearing, idempotent micromark attacher, I1-I10 fidelity invariants). The spec is substantively sound — architecturally coherent, well-grounded in prior art, decisions traceable to evidence. The HIGH findings are concentrated in one surface (stale file:line citations in §8 and evidence/current-shipped-state.md against the current baseline); the MEDIUM findings cluster around config-field name drift between sections that were written at different iteration points.

---

## High Severity

### [H1] Finding 1: §8 Current State and evidence/current-shipped-state.md file:line citations are stale — systematically off by 200-300 lines against the claimed baseline

**Category:** FACTUAL
**Source:** Track T1 (own codebase)
**Location:** SPEC.md §8 lines 189-198; `evidence/current-shipped-state.md` lines 17-67 (upload-handler section)
**Status:** CONTRADICTED

**Issue.** The evidence file header states (line 19): "All file:line citations verified at commit `432a834b` (origin/main tip at spec intake)." Spot-checking against the actual file at HEAD (`432a834b`, verified via `git log -1`) shows every line number for the upload handler is wrong by ~200-300 lines. The handler has moved without the evidence being re-verified.

**Verified discrepancies (evidence claim → actual at 432a834b):**

| Claim | Evidence/§8 | Actual |
|---|---|---|
| `handleUploadImage` function | `api-extension.ts:2465-2580` | `api-extension.ts:2779-2894` |
| `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` | line 122 | line 132 |
| `ALLOWED_MIME_TYPES` Set construction | line 123 | line 133 |
| `GENERIC_PASTE_NAMES` regex | line 125 | line 135 |
| `sanitizeFilename` regex | lines 127-134 | lines 137-144 |
| `readUploadBody` | lines 166-238 | starts line 176 |
| `fileTypeFromBuffer` magic-byte call | line 2535 | line 2849 |
| `ALLOWED_MIME_TYPES.has(detectedMime)` check | line 2546 | line 2860 |
| SVG manual detection | lines 2539-2544 | lines 2853-2858 |
| `destDir = resolve(...)` | line 2505 | line 2819 |
| Path-escape guards | lines 2494-2532 | lines 2809-2846 |
| `writeUploadAtomic` call | line 2571 | line 2885 |
| Success response `{ ok: true, src: ... }` | line 2574 | line 2888 |

**Additionally** the evidence claims `file-type@8.x` at `api-extension.ts:2535` (line 40). This is contradicted by INV3 in the same evidence dir, which confirms `file-type@22.0.1` (verified: `packages/server/package.json` `"file-type": "^22.0.1"` and `bun.lock` resolves `file-type@22.0.1`). The two evidence files disagree with each other.

**Also:** SPEC §8 states the sanitizeFilename regex is `[^a-zA-Z0-9_\-.]+` (the plus quantifier implied by the `replace` semantics). Actual code at line 141 is `stem.replace(/[^a-zA-Z0-9_\-.]/g, '_')` — no `+` quantifier. Not load-bearing (semantically equivalent under `g` flag when replacing with a fixed string) but shows the evidence was not a literal read.

**Impact.** Any implementer using §8 / evidence/current-shipped-state.md as a map to modify the upload handler will land ~300 lines away from the real code. Implementer will have to re-navigate from scratch. Also erodes trust in other citations in the evidence dir.

**Suggested resolution.** Re-verify every file:line citation in evidence/current-shipped-state.md against HEAD (`432a834b`) and update. Update the claim in the evidence file header to either note a re-verify date or remove the verification assertion. Also remove the `file-type@8.x` claim in evidence/current-shipped-state.md line 40 (already superseded by INV3) — keep exactly one source of truth on the version.

---

### [H2] Finding 2: §5 P2 journey (line 106) specifies config fields (`assetLocation`, `globalAssetDir`, `emitFormat: 'wikilink'`) that FR-5 does not define

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions) + L5 (summary coherence)
**Location:** SPEC.md §5 line 106 (P2 user journey) vs §6 FR-5 line 165
**Status:** INCOHERENT

**Issue.** The P2 "Obsidian refugee opens vault" journey describes the behavior as "pre-populates `upload.assetLocation: 'global'`, `upload.globalAssetDir: 'attachments/'`, `upload.emitFormat: 'wikilink'`". None of these three field names/values match FR-5's actual schema lock:

- FR-5 (line 165) defines `attachmentFolderPath` (free-form string per D-J) — not `assetLocation` + `globalAssetDir` pair.
- FR-5 specifies `emitFormat: 'wikiembed' | 'markdown-image'` — not `'wikilink' | 'markdown'`.

§5 P2 appears to predate the D-I / D-J session-2 pivot. FR-4 (line 164) already uses the new names (`upload.attachmentFolderPath` + `upload.emitFormat`).

**Additional occurrences of stale names:**
- §3 NG14 (line 80): "FR-5's `assetLocation` default is `co-located`" — but FR-5 has no `assetLocation` field.
- §9 D28 mapping (line 227): "D28 `assetLocation` default" — refers to a field FR-5 doesn't define.
- §10 D2 row (line 236): "`assetLocation` default is `co-located`, config exposes free-form string (per D-J)" — internal contradiction: can't be both a `co-located` default AND a free-form string, unless "co-located" is the semantic meaning of `attachmentFolderPath: "./"` (INV1 §2.1 confirms this mapping). Needs to be stated that way.

**Impact.** An implementer reading §5 P2 first will build a Zod schema with `assetLocation`/`globalAssetDir`, discover it conflicts with FR-5 at review time, and have to re-implement. Worse, the test vector in P2 is used as acceptance criteria (M2) — tests will encode the wrong field names.

**Suggested resolution.** Three-part edit in §5 P2 (line 106):
1. Replace `upload.assetLocation: 'global'` with the equivalent in the new schema: `upload.attachmentFolderPath: 'attachments'` (global path form per D-J).
2. Drop `upload.globalAssetDir: 'attachments/'` (subsumed into attachmentFolderPath).
3. Replace `upload.emitFormat: 'wikilink'` with `upload.emitFormat: 'wikiembed'`.

Also fix §3 NG14 (line 80), §9 D28 mapping (line 227), §10 D2 (line 236) to use the new names consistently. Spell out the semantic bridge in D2: "default is co-located, modeled as `attachmentFolderPath: './'` per D-J".

---

### [H3] Finding 3: NG6 "Hard reject at 25MB (FR-5)" contradicts FR-5's operator-configurable `maxBytes`

**Category:** COHERENCE
**Source:** Lens L1 (cross-finding contradictions)
**Location:** SPEC.md §3 NG6 line 72; §5 P4 journey lines 124-134; §6 FR-5 line 165
**Status:** INCOHERENT

**Issue.** §3 NG6 (line 72): "[NOT NOW] NG6: Git LFS for large binaries. **Hard reject at 25MB (FR-5)**; revisit when someone hits the ceiling." The word "hard reject at 25MB" reads as a floor/ceiling invariant.

But FR-5 (line 165): "`maxBytes` (default 25MB)" — it's a **default**, explicitly tunable. P4 journey (lines 124-134) shows the operator bumping it to 100MB via `.open-knowledge/config.yml`. M5 success metric (line 184) encodes operator-tunability.

**Impact.** Reader understands NG6 as "there's a 25MB ceiling you cannot exceed" but the product ships an operator-configurable limit. If an implementer hardcodes 25MB as a floor-capped max-of-config-and-25MB, they'd break the P4 journey and M5 metric.

**Suggested resolution.** Rewrite NG6 to match FR-5's actual semantics:

> "[NOT NOW] NG6: Git LFS for large binaries. **Default reject at 25MB (FR-5 `upload.maxBytes` default; operator-tunable); revisit if someone hits practical upload-size ceilings (e.g. 100MB+ video assets forcing a Git LFS integration).**"

---

## Medium Severity

### [M1] Finding 4: §6 NFR-5 under-specifies which fidelity invariants apply to `![[file.ext]]` round-trip

**Category:** COHERENCE
**Source:** Spec-specific pattern check (Storage-layer fidelity invariants I1-I10)
**Location:** SPEC.md §6 NFR-5 line 176
**Status:** INCOHERENT (completeness gap)

**Issue.** NFR-5: "`![[file.ext]]` byte-identical through parse → PM → serialize. Preserves I1 (Identity) and I4 (Idempotence) invariants from CLAUDE.md Storage-layer fidelity contract." Only I1 and I4 are named.

The spec introduces both (a) a new mdast type (`wikiLinkEmbed`) with its own to-markdown handler, and (b) multiple write surfaces (FR-3a parse, FR-3d emit on drop). This means at minimum **I5 (Layer A === Layer B — mdManager path and Y.Doc path produce the same output)** and **I7 (Cross-path consistency — all write paths produce equivalent serialized output)** also apply. FR-3a+FR-3d+FR-3c form exactly the "multiple write paths / multiple render paths" shape that I5/I7 exist to cover.

**Impact.** Implementer may not add I5/I7 to the test matrix; fidelity test gates (`bun run test:fidelity`) cover I1-I10 PBTs via property tests, but the spec's acceptance criteria should explicitly include them so new `wikiLinkEmbed` fixtures join the corpus.

**Suggested resolution.** Expand NFR-5 to: "Preserves I1 (Identity), I4 (Idempotence), I5 (Layer A === Layer B: mdManager parse/serialize and Y.Doc → PM → Y.Text round-trip agree), and I7 (Cross-path consistency: FR-3d emit on drop and FR-3a parse of hand-authored `![[...]]` produce equivalent mdast + PM) invariants from CLAUDE.md Storage-layer fidelity contract."

---

### [M2] Finding 5: Semantic relationship between `emitFormat` enum and `wikiEmbedExtensions` allowlist is under-specified

**Category:** COHERENCE
**Source:** Lens L1 + L3 (missing conditionality)
**Location:** SPEC.md §6 FR-5 line 165, §6 FR-1a line 158, §3 NG11 line 77
**Status:** INCOHERENT (ambiguity blocks implementer)

**Issue.** Two configuration knobs control the same emit dispatch and their interaction is not specified:

1. `wikiEmbedExtensions` (allowlist): "`['png', 'jpg', ..., 'pdf', 'mp4', ...]`". If extension matches → `![[basename.ext]]`; else → `[basename](relativePath)`. (FR-1a)
2. `emitFormat` (enum): `'wikiembed' | 'markdown-image'`. Default `'wikiembed'`. (FR-5)

Question the spec does not answer: when `emitFormat: 'markdown-image'` is set, does it
  - (a) override the `wikiEmbedExtensions` gate, forcing ALL drops to `[basename](path)` (including PDF/MP4)?
  - (b) only flip IMAGE drops to `![...](path)` while PDFs/videos still use `![[...]]` (since they're in `wikiEmbedExtensions` but not images)?
  - (c) something else?

NG11 (line 77) says "The `emitFormat` config flag is retained in FR-5 but scoped to image emit only (`![[img.png]]` wiki-embed vs `![img](img.png)` plain markdown)." This reads like interpretation (b). But FR-1a's single extension-gate is silent on this override. §5 journeys never exercise the toggle.

**Impact.** Direct implementation ambiguity. Zod schema may be wired one way; tests written the other; operators can't rely on the flag.

**Suggested resolution.** Add an explicit table to FR-1a or FR-5 showing all emit-dispatch combinations:

| File ext in `wikiEmbedExtensions`? | `emitFormat` | Emit shape |
|---|---|---|
| Yes, extension is an image ext | `wikiembed` | `![[file.ext]]` |
| Yes, extension is an image ext | `markdown-image` | `![alt](path)` |
| Yes, extension is non-image (mp4/pdf/...) | `wikiembed` (default) | `![[file.ext]]` |
| Yes, extension is non-image (mp4/pdf/...) | `markdown-image` | TBD — DECIDE |
| No (opaque: zip/docx/generic) | (ignored) | `[name](path)` |

And cross-reference NG11 so the narrow scope of `emitFormat` is unambiguous.

---

### [M3] Finding 6: FR-3b `resolveEmbed` tiebreak rule for true ambiguity is undefined

**Category:** COHERENCE
**Source:** Lens L3 (missing conditionality) + L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §6 FR-3b line 161; `evidence/inv2-foam-shortest-path-algorithm.md` §2.3 line 108-112 + §8 item 1
**Status:** INCOHERENT (design gap surfaced in evidence but not resolved in spec)

**Issue.** FR-3b specifies: "`resolveEmbed(basename, sourcePath) → resolvedPath | null` with Foam-style shortest-path from sourcePath's dirname." INV2 explicitly notes (§8, unresolved item 1): "When haystack isn't empty at end of needle tokens, Foam returns full path. No secondary tiebreak (alphabetical, filesystem order, etc.) is documented in code." And §10 gotcha 4: "True ambiguity: Foam falls back to full path; we should document our tiebreak rule explicitly."

The spec inherits Foam's ambiguity gap without resolving it. The P2 journey implicitly assumes the resolver returns a single hit. What happens when two vaults have `photo.png` in different directories, both equidistant from the source doc's dirname? No declaration:

- Return `null`? (breaks G2 "just works")
- Return the first-indexed? (non-deterministic across rebuilds)
- Prefer the source dir's own subtree? (reasonable — document it)
- Return an ambiguity signal and surface a picker UI? (scope creep)

**Impact.** Real repos with shared basenames (`README.md`, `icon.png`, `diagram.png`) will hit this on day one. Without a stated rule, behavior drifts between dev/production or across startup orders.

**Suggested resolution.** Add explicit tiebreak rule to FR-3b. Suggestion (aligned with Obsidian's "shortest" semantics per INV1 §2.3):
1. Shortest-path match wins.
2. If multiple paths tie on suffix length: prefer the one in the source doc's own dirname subtree (depth-first from sourcePath's dir).
3. If still tied: prefer alphabetical path order (deterministic, not startup-order-sensitive).
4. Document as NG if user-facing ambiguity resolution (picker UI) is out of scope.

---

### [M4] Finding 7: SCOPE list does not list `packages/server/src/cc1-broadcast.ts` or the CC1 subscriber wiring location — FR-6 "basename index subscribes to CC1 `ch:'files'`" has no explicit implementation site

**Category:** COHERENCE
**Source:** Lens L1 + L3
**Location:** SPEC.md §13 In Scope lines 283-298; §16 SCOPE lines 343-357; §6 FR-6 line 166
**Status:** INCOHERENT (gap)

**Issue.** FR-6 says the basename index subscribes to CC1 `ch:'files'` and rebuilds on asset-event fires. §16 SCOPE lists `packages/server/src/standalone.ts` (extend `handleDiskEvent`) and a NEW `packages/core/src/utils/path-resolve.ts` (basename index). But the subscriber wiring — how `path-resolve.ts` (in `core`, browser-compatible) subscribes to a server-side CC1 broadcast — is not specified.

The CC1 broadcaster is a server-side class (`packages/server/src/cc1-broadcast.ts`). The basename index is specified as `packages/core/src/utils/path-resolve.ts` which must stay browser+Node compatible per the `packages/core` constraint in CLAUDE.md. Core cannot import server-side primitives. So the wiring must happen in one of:

- `packages/server/src/standalone.ts` (server side) — instantiates index there and passes it in
- Split: index core → data structure only; wiring file in server.

Neither is explicit.

**Impact.** FR-3b declares the index in core, FR-6 wires it server-side — the split is load-bearing for `packages/core` purity but not called out. Implementer may accidentally add server deps to core, breaking the browser build.

**Suggested resolution.** Add a sentence to FR-3b or FR-6 clarifying: "The basename index data structure (`Map<basename, string[]>` + `resolveEmbed()` function) lives in `packages/core/src/utils/path-resolve.ts` (browser+Node compatible, no server deps). The CC1 subscription + rebuild-on-signal wiring lives server-side in `packages/server/src/standalone.ts`, which constructs the index and wires it to the broadcaster (via `cc1Broadcaster.subscribe('files', () => rebuildIndex())` or equivalent primitive per `cc1-broadcast.ts`'s public API)."

Also: CC1 broadcast is push-only via `broadcastStateless` (verified at `cc1-broadcast.ts:75`). If client-side code (e.g. a UI panel) also needs to invalidate, that's out of FR-6's scope and should be a non-goal.

---

### [M5] Finding 8: FR-3a extension of wiki-link-micromark does not explicitly require preservation of precedent #15 (idempotent attacher) or #9 (schema add-only)

**Category:** COHERENCE + FACTUAL
**Source:** Spec-specific pattern check (CLAUDE.md precedents #9 and #15)
**Location:** SPEC.md §6 FR-3a line 160; §13 In Scope line 287; §16 SCOPE line 344
**Status:** INCOHERENT (missing explicit constraint)

**Issue.** CLAUDE.md precedent #15 (Idempotent micromark-extension attachers) documents that `wiki-link-micromark.ts` currently uses identity-based dedup via a module-level singleton (`MICROMARK_EXT = wikiLinkSyntax()` at line 238, then `data.micromarkExtensions.some((e) => e === MICROMARK_EXT)` at lines 259, 265, 270 — verified). Any extension adding `!` prefix branch must preserve this pattern (re-running the attacher must not accumulate duplicate extensions).

Precedent #9 (Schema add-only) forbids narrowing mdast/PM schemas. The spec treats `wikiLinkEmbed` as a new node distinct from `wikiLink` — good. But does the `wiki-link-micromark.ts` tokenizer state machine add a new `!`-prefixed code path without modifying the existing `[[...]]` code path? §16 EXCLUDE says "the embed branch is additive" — this is the right direction, but precedent #15 is not explicitly named.

**Impact.** An implementer who rewrites the tokenizer rather than extends it may drop the identity-dedup and trigger the duplicate-extension accumulation that precedent #15 prevents. Risk is small (`MICROMARK_EXT` is reusable) but the contract should be explicit.

**Suggested resolution.** Add a line to FR-3a acceptance criteria or §16 SCOPE: "Extending `wiki-link-micromark.ts` MUST preserve the module-level singleton + identity-dedup pattern (precedent #15) by using the same `MICROMARK_EXT` constant for both `[[...]]` and `![[...]]` tokenization. Adding `CODE_BANG` entry to the syntax extension's text map at construct-registration time is the expected shape."

Also reference precedent #9 in STOP_IF: "STOP_IF `wikiLinkEmbed` node definition or tokenizer changes narrow the existing `wikiLink` shape — schema changes must be add-only per precedent #9."

---

### [M6] Finding 9: §10 D-E rename race rationale references "CC1 100ms debounce handles common bursts" — verified correct, but conflates two different debounces

**Category:** COHERENCE / FACTUAL
**Source:** Track T1 + Lens L3
**Location:** SPEC.md §10 D-E line 243
**Status:** INCOHERENT (imprecise citation)

**Issue.** D-E says: "CC1 100ms debounce handles common bursts." Verified: `cc1-broadcast.ts:11` `const DEBOUNCE_MS = 100`. Confirmed correct. But the reader should understand what is being debounced.

The CC1 debounce batches **signal-to-clients broadcasts**, i.e., how often the `__system__` Y.Doc broadcasts `{v:1, ch:'files', seq:N}` stateless messages. It does NOT debounce the server-side rewriter path for doc moves. If a burst of fs-events (user `git checkout` touching 200 files) hits the rewriter, the CC1 broadcaster coalesces the UI-invalidation signal, but the per-file rename-rewrite logic in `managed-rename-rewrite.ts` still runs per file.

For the markdown-image case that D-E worries about, the race is: doc moved + asset moved in same fs burst. The rewrite logic (FR-7) either (a) resolves the rename against the new doc location with an old asset path that's about to be different once the asset-move event fires, or (b) rewrites twice.

D-E's rationale conflates "CC1 signal debounce" with "rename-rewrite event-ordering". The 100ms debounce is on the signal; rewriter bursts are a separate question.

**Impact.** The stated rationale may not actually eliminate the race — it just batches the UI-side invalidation after the race has occurred. If an implementer leans on the "CC1 debounce handles bursts" framing, they may under-test the rename+asset-move race.

**Suggested resolution.** Rewrite D-E rationale to separate the concerns:

> "The CC1 100ms broadcast debounce coalesces UI-side invalidation signals (so ProviderPool sees one `ch:'files'` event after a burst), not the rewriter path itself. For the residual markdown-image case, Foam/Dendron/SilverBullet all rely on fs-event ordering (no documented pathology). If P0 dogfood surfaces a concrete repro, additively debounce the rewriter itself."

---

### [M7] Finding 10: §8 claim "regex for markdown link — `readMarkdownLink` at line 87 — starts with `\[`, not `!\[`" has wrong file:line and wrong character analysis

**Category:** FACTUAL
**Source:** Track T1
**Location:** `evidence/current-shipped-state.md` line 111
**Status:** CONTRADICTED

**Issue.** Evidence line 111: "Regex for markdown link: `readMarkdownLink` at line 87: `/^\[([^\]\n]*)\]\(.../` — starts with `\[`, not `!\[`. Even without the exclusion guard, the regex wouldn't match image refs."

Verified at 432a834b:
- `readMarkdownLink` is at `managed-rename-rewrite.ts:77` (not line 87).
- The regex is at line 88 (inside the function body).
- The regex string is correct: starts with `\[`.
- The claim that "even without the exclusion guard, the regex wouldn't match image refs" is accurate semantically.

**Impact.** Low-severity citation error — interpretation is right, file:line is wrong.

**Suggested resolution.** Update line reference to `readMarkdownLink` at line 77 (regex at line 88). Less impact than H1 since the semantic claim is correct, but still part of the evidence-file staleness pattern.

---

## Low Severity

### [L1] Finding 11: §6 FR-5 counts "7 fields" in agent constraints but lists 8 top-level + 1 nested

**Location:** SPEC.md §16 SCOPE line 348 ("`upload.*` Zod section (7 fields per FR-5)") vs FR-5 line 165 enumeration
**Severity:** LOW (counting convention ambiguity)

FR-5 enumerates: `attachmentFolderPath`, `emitFormat`, `maxBytes`, `warnBytes`, `dedup`, `dedup.ui`, `allowedMimeTypes`, `wikiEmbedExtensions` = 8 mentions (with `dedup.ui` as nested). §16 says "7 fields". Interpretation: count `dedup` + `dedup.ui` as one "field with nested" = 7 top-level. Fine but inconsistent counting invites drift at implementation time.

**Suggested resolution.** Say "7 top-level fields with `dedup` being an object containing `scope` + `ui`", or simply "upload config section (see FR-5)".

---

### [L2] Finding 12: Evidence handler line ranges in wiki-link-micromark.ts are off by 1-6 lines

**Location:** `evidence/current-shipped-state.md` lines 89-91
**Severity:** LOW

- "Handlers: `enterWikiLink/exitTarget/exitAnchor/exitAlias/exitWikiLink` at lines 154-191" — actual `enterWikiLink` at 154, `exitWikiLink` ends at 197. Close; end-line off by 6.
- "Serializer: `wikiLinkHandler` at lines 204-214" — actual at 211-220. Off by 7.

Both are ballpark correct, not load-bearing for implementation.

---

### [L3] Finding 13: §8 current-state enumeration of config schema sections omits `preview` and `folders`

**Location:** `evidence/current-shipped-state.md` lines 117-121
**Severity:** LOW

Evidence enumerates: `content.dir/include/exclude`, `server.port/host`, `persistence.debounceMs/maxDebounceMs`, `mcp.tools.read_document.historyDepth`, `mcp.tools.search.maxResults`. Verified actual `packages/cli/src/config/schema.ts` also has `preview.baseUrl` and `folders: FolderRule[]`. Not load-bearing for FR-5 (which adds a disjoint `upload.*`), but completeness issue in the evidence.

---

### [L4] Finding 14: Spec §10 D-I claims "6-editor convergence" when underlying report §D2 lists 5 surveyed editors

**Location:** SPEC.md §10 D-I line 247; REPORT §D2 line 113
**Severity:** LOW (ambiguous, defensible framing)

D-I says: "6-editor convergence (Obsidian + Logseq + Foam + Dendron + Fumadocs + SilverBullet)". The REPORT §D2 table lists 5 "YES" editors (Logseq, Foam, Dendron, Fumadocs, SilverBullet) and does not include Obsidian in its 16-editor surveyed set (Obsidian is proprietary). Counting Obsidian as the 6th (canonical/reference) is defensible but not transparent in the SPEC — the REPORT §D2 opens with "Finding: 5 of 16 surveyed editors". If a reader cross-references, the "6 vs 5" mismatch invites confusion.

**Suggested resolution.** Change D-I rationale to "6-editor convergence (5 surveyed: Logseq + Foam + Dendron + Fumadocs + SilverBullet; plus proprietary Obsidian as canonical reference)". Or just "5 surveyed + Obsidian".

---

### [L5] Finding 15: INV1 evidence §2.2 recommends `emitFormat: 'markdown' | 'wikilink'` values but FR-5 locks `'wikiembed' | 'markdown-image'`

**Location:** `evidence/inv1-obsidian-app-json-schema.md` §2.2 lines 156-166
**Severity:** LOW

INV1's mapping recommendation (line 160-166) uses `emitFormat: "markdown" | "wikilink"` — these are the old-spec values. FR-5 / D-I pivot locked `'wikiembed' | 'markdown-image'`. The semantic mapping is:
- `useMarkdownLinks: true` → `emitFormat: 'markdown-image'`
- `useMarkdownLinks: false` → `emitFormat: 'wikiembed'`

Not load-bearing for the Zod schema (FR-5 is canonical) but could confuse an implementer reading INV1 before FR-5.

**Suggested resolution.** Add a footnote to INV1 §2.2 noting that the `emitFormat` values in §2.2 predate the D-I pivot; see SPEC FR-5 for the locked enum.

---

### [L6] Finding 16: Content-filter line-number citations in evidence/current-shipped-state.md are off

**Location:** `evidence/current-shipped-state.md` lines 136-142 (ContentFilter section)
**Severity:** LOW

Claims "content-filter.ts:125-192" for the asset-admission rule and "dirCount: Map<string, number> (lines 179-192)" for the refcount map.

Verified:
- `ASSET_EXTENSIONS.has(ext)` check at `content-filter.ts:204` (evidence OK at "125-192" range but sibling-asset rule narrower).
- `dirCount` declared at line 175 (not 179).
- `incrementMdDir` / `decrementMdDir` methods at lines 229-240 (not 179-192).

Consistent with the H1 stale-citation pattern at a smaller scale.

---

## Checked (all clear)

- **Baseline commit.** Verified `git log -1` returns `432a834b Restore config.yml to default`. SPEC header claim is correct.
- **file-type version.** `packages/server/package.json` line `"file-type": "^22.0.1"`; `bun.lock` resolves `file-type@22.0.1`; `node_modules/file-type/package.json` shows `"version": "22.0.1"`. INV3 version claim confirmed.
- **CLAUDE.md precedent references.** Precedents #1 (typed transaction origins), #9 (schema add-only), #10 (opaque-but-content-bearing), #15 (idempotent micromark attacher) all exist at CLAUDE.md lines 75, 83, 84, 98 respectively, and the spec's characterization of each matches CLAUDE.md's own language.
- **Wiki-link tokenizer baseline.** `wiki-link-micromark.ts` verified: `start` state at line 42 confirms `CODE_LBRACKET` (91) check only; `CODE_BANG` (33) not referenced; module-level singleton `MICROMARK_EXT = wikiLinkSyntax()` at line 238 with identity dedup at 259, 265, 270 matches SPEC's characterization and precedent #15.
- **Managed-rename-rewrite exclusion guard.** `line[idx - 1] !== '!'` at line 243 — exactly as claimed in SPEC §6 FR-7, §8, and §16 SCOPE. `rewriteWikiLinksForDocumentRename` at 270 and `rewriteMarkdownLinksForDocumentRename` at 302 — evidence-exact.
- **CC1 broadcaster.** `DEBOUNCE_MS = 100` at `cc1-broadcast.ts:11` confirmed (INV6 + §10 D-E claim accurate). `signalChannel` function at `standalone.ts:162`; `handleDiskEvent` at line 262; `case 'create'` fires `signalChannel('files')` + backlinks + graph at 271-273; `case 'update'` fires backlinks + graph only (not 'files') at 285-286 — matches INV6 exactly.
- **Content-filter ASSET_EXTENSIONS import.** `content-filter.ts` imports `ASSET_EXTENSIONS` from `@inkeep/open-knowledge-core` at line 11 — confirming that widening `packages/core/src/constants/upload.ts` (in §13 In Scope) is sufficient to widen content-filter admission without a separate edit. Evidence's stated "Consequence for FR-5" is self-resolving.
- **Clipboard-mdast-canonical NG4 boundary.** NG4 in `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md:46` verified verbatim. INV5 quote matches.
- **Decision mapping in §9.** All 30 prior-spec decisions (D1-D30) are accounted for. D5+D27 and D22-D26 are appropriately joined; none dropped.
- **11 LOCKED decisions count.** D-A through D-K = 11 LOCKED decisions. Spec header "All 11 decisions LOCKED" is accurate.
- **Goals → Requirements traceability.** G1→FR-1/FR-1a/FR-5; G2→FR-3/FR-4; G3→FR-2; G4→FR-5; G5→FR-7; G6→NFR-5 + §16 EXCLUDE. All goals have an FR anchor.
- **User-journey coverage in FR table.** P1 → FR-1, FR-1a, FR-8; P2 → FR-3, FR-4; P3 → FR-2, FR-1a; P4 → FR-5; P5 → FR-7, FR-3b. All journeys traceable through FR rows.
- **Non-goals do not conflict with requirements.** Each NG is consistent with an in-scope FR (NG1 references FR-2 narrowed scope; NG6 is the boundary case of FR-5; etc.).
- **Success metrics falsifiability.** M1-M6 all include a test vector or observable outcome. Testable.
- **Risks & mitigations coverage.** R1 resolved by D-A, R2/R6 covered by additive pattern, R7 covered by NFR-3, R8 covered by realpath + isWithinContentDir. No orphan risks.
- **D-I cross-check vs REPORT §D2.** "6 editors" matches Obsidian + the 5 surveyed with "YES" in REPORT §D2 table (Logseq, Foam, Dendron, Fumadocs, SilverBullet). Counting is defensible (see L4 for framing note).
- **Schema add-only (precedent #9).** `wikiLinkEmbed` is a new mdast type distinct from `wikiLink`; existing `wikiLink` tokenizer left alone per §16 EXCLUDE; FR-3a explicitly "additive". Consistent with precedent #9.
- **Typed transaction origins (precedent #1).** FR-7 operates on markdown strings (line-based rewrite), no Y.Doc transaction origin needed. FR-3d is PM `tr.insert` through existing `uploadAndInsert` path — uses existing origin plumbing. No new transaction origins introduced, so no new `LocalTransactionOrigin` object refs needed. Consistent.
- **Opaque-but-content-bearing (precedent #10).** `wikiLinkEmbed` mdast → PM dispatches to existing PM node types (image, link) per FR-3c; no new raw-content-in-attrs PM node introduced. Precedent #10 does not apply in this spec. Non-issue.
- **Obsidian `app.json` schema (INV1) field samples.** Spot-checked 3 sample repos from INV1 §3 — `daniel-vera-g/obsidian-config`, `chatopera/docs`, `Sma-Das/Minimalistic-Obsidian-Config` — field names `attachmentFolderPath`, `useMarkdownLinks`, `newLinkFormat` confirmed stable across samples, consistent with INV1's claims.

---

## Scope covered

**Did cover:**
- End-to-end intuitive read of SPEC.md
- Extraction and verification of every load-bearing file:line citation in SPEC §8 and evidence/current-shipped-state.md (upload-handler, wiki-link-micromark, managed-rename-rewrite, cc1-broadcast, content-filter, standalone, image-upload)
- Verification of file-type version claim (package.json, bun.lock, node_modules)
- Verification of CLAUDE.md precedents #1, #9, #10, #15 existence and accuracy of characterization
- Clipboard-mdast-canonical NG4 cross-reference
- Goals → Requirements → Decisions traceability
- Non-goals non-conflict with requirements
- §9 prior-spec decision mapping completeness
- Schema add-only pattern for `wikiLinkEmbed`
- Idempotent micromark attacher (precedent #15) for existing code
- Fidelity invariants I1/I4/I5/I7 spec coverage
- Coherence lenses L1 (cross-finding contradictions), L2 (confidence-prose alignment), L3 (missing conditionality), L4 (evidence-synthesis fidelity — spot-checked), L5 (summary coherence), L6 (stance consistency), L7 (inline source attribution)
- Spot-check of 3 INV1 sample repos for field stability

**Did not cover:**
- End-to-end read of the 16-editor cross-survey REPORT.md (only sampled Executive Summary, D1-D8 detailed findings, Cross-Editor Convergences). Per-editor evidence citations in `reports/editor-asset-embed-patterns-across-universe/evidence/per-editor-findings.md` were not spot-checked.
- Evidence INV4 (`inv4-outline-drop-pattern.md`) was not directly read — only consumed via the REPORT D1 table. If an OK decision depends on INV4 specifics (e.g. Outline's metadata-encoding in `[title size](url)`), that evidence file would need separate verification.
- Dynamic verification (running tests, executing the upload handler) was not attempted — static read-only audit.
- Security analysis of the widened MIME allowlist (SVG/PDF rendering paths, ZIP peek-inside as new attack surface via file-type's OOXML expansion) was not the audit's scope; R7 mitigation was accepted as stated.
- Performance validation of A6 (sha256 <200ms on 25MB) — the napkin math (500MB/s CPU throughput) was accepted without measurement.
- Deep coherence check of prior-spec SPEC.md (`specs/2026-04-08-editor-input-surface/SPEC.md`) beyond the §9 mapping — the prior spec's claims were not independently audited.
