# Audit Findings

**Artifact:** specs/2026-04-13-image-upload-and-asset-resolution/SPEC.md
**Audit date:** 2026-04-13
**Total findings:** 9 (3 High, 4 Medium, 2 Low)

---

## High Severity

### [H1] `safeContentPath` signature does not match D15's proposed usage — decision-implicating

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** D15 (§10), FR9 (§6), §9 "Enforcement points", §13 rework step 5, Failure-modes table (§9).
**Issue:** The spec repeatedly claims `safeContentPath` (from `persistence.ts`) can be reused to guard upload destination paths. The actual helper signature is `safeContentPath(documentName: string, contentDir: string)` and it **appends `.md`** to the documentName before resolving (`resolve(contentDir, \`${documentName}.md\`)`). It cannot be applied to asset paths (`.png`, etc.) without modification — calling it for `docs/screenshot` would land at `docs/screenshot.md`, and calling it for `docs/screenshot.png` would land at `docs/screenshot.png.md`.
**Current text:** "Upload endpoint MUST apply `safeContentPath` (existing `persistence.ts` helper) to `realpath(destPath)`" and "`safeContentPath` on `contentDir/docs/screenshot.png`".
**Evidence:** `packages/server/src/persistence.ts:39-48` — function body literally `resolve(contentDir, \`${documentName}.md\`)`.
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) extract a lower-level primitive (e.g. `assertWithinContentDir(absPath, contentDir)` — `isWithinContentDir` already exists at `persistence.ts:50`) and have D15 target *that*, or (b) generalize `safeContentPath` to accept an optional extension. The STOP_IF clause "`safeContentPath` cannot be reused in upload context" is exactly this condition and is likely to fire. This is decision-implicating: D15's rationale "reuse existing invariant" is undermined because the helper as-written is not reusable.

### [H2] D4 priority arithmetic is internally inconsistent

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §10 D4; §11 Open questions.
**Issue:** D4 claims "P0 set (12)" but enumerates only 11 question-refs: Q1, Q3/Q11, Q4, Q7, Q8, Q9, Q10, Q17, Q20, Q21, Q22. Even counting Q3/Q11 as two entries yields 12 Qs packed into 11 bullets, not 12 items. P2 set (7) lists 7. Union = 19. Spec §11 claims "22 candidate questions from Intake are pending triage." Q2, Q16, Q19 are never classified. The 22-question list itself is not included in the spec.
**Current text:** "P0 set (12): Q1, Q3/Q11, Q4, Q7, Q8, Q9, Q10, Q17, Q20, Q21, Q22. P2 set (7): Q5, Q6, Q12, Q13, Q14, Q15, Q18."
**Evidence:** Direct count from D4 row.
**Status:** INCOHERENT
**Suggested resolution:** Either embed the 22-Q list inline (or reference an evidence file that contains it) and make classification exhaustive, or rewrite D4 with correct counts. A reader today cannot verify which P0 questions "must close before rework of PR #41 can land" because the questions themselves are not enumerated.

### [H3] `parentDocName` spoofing risk is under-scoped

**Category:** COHERENCE / FACTUAL
**Source:** Reader pass + L3 (missing conditionality)
**Location:** §14 Risks table row 3; §6 FR4; §13 step 5.
**Issue:** Mitigation says "worst case is uploading a sibling into *any* doc's folder. No elevation." This is incomplete: `parentDocName` is any client-supplied string (no auth, no awareness check). With `dirname(parentDocName)` used verbatim, a client can pass `../../` components or an absolute path. `safeContentPath` as currently written (even after fixing H1 via `isWithinContentDir`) bounds this, but the spec does not explicitly state that `parentDocName` is normalized/validated before `dirname()` — only that the *destination* is checked. If an attacker sets `parentDocName = "../../etc/passwd.md"`, `dirname` gives `../../etc`, `resolve(contentDir, "../../etc")` escapes, and the escape check must fire. The spec needs to explicitly require this check path, not hand-wave.
**Current text:** "Upload path still goes through `safeContentPath`, so worst case is uploading a sibling into *any* doc's folder."
**Evidence:** §13 step 5 lists `safeContentPath(destDir, ...)` but — per H1 — that helper is not applicable as-described. FR4 acceptance criterion (`dirname(parentDocName)/<sanitized-filename>`) contains no path-normalization step.
**Status:** INCOHERENT
**Suggested resolution:** Add explicit requirement: `parentDocName` must be a non-absolute, non-traversal-containing string before `dirname()` is computed; escape check must occur on the resolved destination directory, not just the final file path. State this in FR4 acceptance, in D15 rationale, and in the mitigation cell.

---

## Medium Severity

### [M1] D11 include-pattern precedence contradicts current `isExcluded` semantics

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** D11 (§10); Claim audited: "the claim that `ContentFilter` currently gates only on include patterns."
**Issue:** The `isExcluded` logic today is a short-circuit: `if (!isIncluded(relativePath)) return true` — include is a **gate** (not-included ⇒ excluded). D11 says "if matched by include → include (existing). Else if extension ∈ ASSET_EXTENSIONS AND dirname ∈ set AND not in gitignore/exclude → include." The current impl does not have the "else include asset" branch today, correct. But D11's wording "Else → exclude" after the else-if is ambiguous about gitignore precedence: today gitignore is checked *after* include succeeds. D11 must preserve gitignore check even on the include-path, which the current logic does (line 123). Minor but worth tightening.
**Current text:** "at construct time, walk `contentDir` and build `Set<string>` of directories containing ≥1 included `.md`. `isExcluded(path)` new logic: if matched by include → include (existing)."
**Evidence:** `packages/server/src/content-filter.ts:115-125`.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Restate D11 as: "(1) gitignore/exclude check runs first and can reject anything; (2) if path matches include OR (ext∈ASSET_EXTENSIONS AND dirname∈dirsWithIncludedMd), not excluded; (3) else excluded." This preserves FR6 ("exclude supersedes allowlist") explicitly in the algorithm, not just in prose.

### [M2] Filter-wrapper + sirv: `.md` source exposure is a new public surface, risk rated "Low"

**Category:** COHERENCE
**Source:** Reader pass + L3
**Location:** §14 Risks row 2; D9.
**Issue:** "Raw `.md` sources now HTTP-reachable" rated Med/Low. The mitigation reasons content is "browseable via `/api/document`" — but that endpoint requires knowing the docName (query param), while filter-wrapped sirv exposes a *directory index*-style URL space where any `.md` path is fetchable by guessing filenames. This is a materially larger surface. For dev-only this is fine; for CLI prod (which the spec targets) it's a behavior change deserving explicit acknowledgment. Also: `sirv` has a `dotfiles: false` default already set in the snippet — good — but nothing prevents a user from naming a file `secret.md` and having it served.
**Current text:** "Content is inherently browseable via `/api/document`; direct `.md` GET returns the same bytes."
**Evidence:** §13 step 4 middleware snippet.
**Status:** INCOHERENT (risk mischaracterization)
**Suggested resolution:** Bump impact to Med; note that the change grows the public URL surface from "IDs known to client via watcher index" to "any path matching include globs." Add a Non-goal or test asserting `.md` responses aren't cached aggressively.

### [M3] "Filter-stale window is ms-scale" is unverified

**Category:** FACTUAL
**Source:** T1
**Location:** §14 Risks row 5.
**Issue:** Claim is plausible but unverified. `@parcel/watcher` event latency is platform-dependent (macOS FSEvents can coalesce up to ~100ms; Linux inotify is sub-10ms; the chokidar fallback debounces). There is no benchmark or evidence cell supporting the "ms-scale" number.
**Current text:** "Filter refreshes on watcher event; window is ms-scale."
**Evidence:** `packages/server/src/file-watcher.ts` — no debounce configured; native watcher latency varies by OS.
**Status:** UNVERIFIABLE
**Suggested resolution:** Replace "ms-scale" with "within one watcher tick (platform-dependent; typically <200ms)" or add an assumption (A4) with verification plan.

### [M4] PR #41 response-shape change is a breaking-contract call not called out as 1-way

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** §9 API/transport; D7.
**Issue:** The response changes from `{ ok, src: '<uploadsDir>/<file>' }` to `{ ok, src: '<bareFilename>' }`. For any consumer outside the editor (future MCP tool, external automation), this is a wire-contract change. D7 is marked 1-way=Yes for the *markdown convention* but the HTTP contract shift gets no decision row. Pre-v0 / no external consumers makes it low-risk, but it deserves an explicit row (or annotation under D7).
**Current text:** "`{ ok: true, src: '<bareFilename>' }` (CHANGED from PR #41 — bare filename, not path)."
**Evidence:** PR #41 diff line 943 (`src: \`${uploadsDir}/${destFilename}\``) vs §9/§13.
**Status:** INCOHERENT (missing decision row)
**Suggested resolution:** Either add "Dx: Upload response returns bare filename (sibling-relative)" with 1-way=No because pre-v0, or annotate D7 to cover the HTTP contract change explicitly.

---

## Low Severity

### [L1] Decision IDs are non-contiguous

**Category:** COHERENCE
**Source:** L1
**Location:** §10.
**Issue:** D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13, D14, D15, D16 all present, order jumbled (D3→D6 skips D4/D5 which appear later; D16 appears before D5). Scan-ability low; no real semantic impact. Also: `evidence/` column is "—" for D2/D4/D5/D6/D10/D14, which is acceptable when the rationale is "user-stated" but would be stronger with a meeting-transcript reference.
**Suggested resolution:** Reorder by ID ascending; move user-stated decisions' "source of truth" pointer to the Links list at top.

### [L2] NG6 tag inconsistency

**Category:** COHERENCE
**Source:** L1
**Location:** §3 Non-goals vs §15 Future Work.
**Issue:** NG6 MCP asset-write is tagged `[NOT UNLESS]` in §3 but §15 lists "MCP asset-write tool (NG6)" under "Identified" (which implies it *will* be a spec someday). "NOT UNLESS" and "Identified" are compatible but the trigger condition ("agents produce enough generated-image workflows") should appear in §15, not only §3. Minor cross-section drift.
**Suggested resolution:** Mirror the NOT-UNLESS trigger into §15 Identified bullet.

---

## Confirmed Claims (summary)

- **PR #41 uses busboy** ✓ (`pr41.diff:756`)
- **PR #41 caps at 10 MB** ✓ (`pr41.diff:765` — `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`)
- **PR #41 uses `openSync('wx')`** ✓ (`pr41.diff:789`)
- **PR #41 adds `content.uploadsDir` default `'uploads'`** ✓ (`pr41.diff:581, 679, 685`)
- **PR #41 wires `@tiptap/extension-file-handler` onDrop + onPaste** ✓ (`pr41.diff:271-281`)
- **PR #41 MIME allowlist = jpeg/png/gif/webp** ✓ (`pr41.diff:696-699`)
- **`Image` extension is in `sharedExtensions`** ✓ (`packages/core/src/extensions/shared.ts:6,66`)
- **mdast `image` has Tier-A passthrough handler** ✓ (`packages/core/src/markdown/index.ts:193-197`)
- **`ContentFilter.isExcluded` gates on include patterns first** ✓ (`packages/server/src/content-filter.ts:118`)
- **PR #41's sirv scoped at `/${uploadsDir}/`** ✓ (`pr41.diff:619-620, 650, 661`)

## Unverifiable Claims

- **A2 (root-relative path break on nested routes):** Not tested; listed as MEDIUM assumption with verification plan — acceptable.
- **A3 (filter startup <500ms on 10k-file repo):** Not benchmarked; acceptable as-tagged.
- **"Hugo/Zola/Typora convention" for sibling-relative refs:** Not independently verified; evidence file `markdown-asset-conventions.md` exists but not spot-checked in this audit.
