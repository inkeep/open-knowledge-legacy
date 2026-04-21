# Design Challenge — Editor Asset + Embed Surface

**Challenger posture:** Cold-reader adversarial pass. Not rubber-stamping. Evidence-grounded.

**Scope under challenge:** SPEC.md §10 Decision Log — 4 DIRECTED (D1–D4) + 11 LOCKED (D-A through D-K). Plus overall scope framing (8 FRs).

---

## Executive summary

**Challenges surfaced: 13.** Severity breakdown:
- **STRONG** (rejection reasoning is shaky; reopening is warranted): **3** — D-I (auto-emit on drop); D-K (rename-rewrite asymmetric reversibility); scope Q (FR-3 + FR-4 vs FR-1/FR-2 splittability).
- **MODERATE** (rejection reasoning holds but new evidence or guardrails should be added): **5** — D-A (text-file rejection UX); D-C read-time promotion (P0 plain-link dogfood gap); D-F Phase-2 slippage risk; D-J (schema brittleness); FR-2 same-dir dedup (counter-intuitive for scrapbook collector).
- **WEAK** (rejection holds as-written; due-diligence note only): **5** — D-B toast UX; D-D Map-not-Trie; D-G endpoint rename; D-H file-watcher widening; NG4 disjoint-keyspace claim.

**Headline challenges:**

1. **D-I auto-emit is universe-novel in a way the spec doesn't fully defend.** Six editors parse `![[...]]`; zero editors auto-emit it on file drop. The spec's citation of "6-editor convergence" conflates READ capability with WRITE behavior. Every one of those six editors emits `![](...)` on drop (or has no drop pipeline at all). Being genuinely first-mover is either a blessing or a curse — the spec leans strongly on "blessing" without an evidence-backed case for why the absence of prior art is a signal rather than a warning.

2. **D-K refs-only plus D-I auto-emit creates a latent 2-3-year storage-drift tech debt.** The spec acknowledges D-K is "asymmetric" (easy to add relocation later; hard to remove). With auto-emit producing `![[...]]` refs at scale, and assets staying put on doc rename, over 2-3 years of use the `docs/` tree will accumulate "orphan assets" in directories where the owning docs have moved away. SilverBullet — the one editor that ships asset relocation — made the opposite tradeoff. The spec's rationale ("shared-asset breakage without a backlink graph") is a real concern, but the proposed escape ("revisit when drift becomes a real complaint") has a mechanical problem: `.open-knowledge` is a wiki, not a publishing pipeline, so drift will manifest as silent navigability decay, not loud errors.

3. **Scope is a stack of 8 items but the riskiest three (FR-3 + FR-4 + FR-1a auto-emit) are all "persistence shape" 1-way doors shipping together.** Any one of them could be independently valuable; shipping all together means the first P2 Obsidian refugee who hits a parser edge case on `![[photo.png|640x480]]` (NG12 deferred) reports it as a blocking bug across all three features. A scope split (ship FR-1/FR-2/FR-5 first; FR-3/FR-4 as a Phase B in the same session or adjacent PR) would let the team de-risk auto-emit against real usage before committing.

**Recommended actions:**
- **Reopen:** D-I auto-emit on drop (add emit-flag config default with explicit opt-in consideration, OR add a stronger "why we're first" evidence paragraph).
- **Reopen:** D-K with 2-3-year drift analysis + concrete re-visit trigger (not just "real complaint").
- **Reopen:** Scope splittability between "upload widening" (FR-1/FR-2/FR-5) and "wiki-embed" (FR-3/FR-4/FR-1a).
- **Strengthen evidence:** D-A rejection UX for CSV/TXT users; D-C P0 plain-link fallback; D-F Phase-2 slippage guardrail; D-J schema version-stability; FR-2 scrapbook-collector case.

---

## Challenges by decision

### D-I: Wiki-embed storage as default emit shape (STRONG challenge)

**Current resolution:** `![[file.ext]]` for `upload.wikiEmbedExtensions` match on DROP; `[name](path)` markdown-link fallback for opaque types. LOCKED at HIGH confidence. Cited: "6-editor convergence (Obsidian + Logseq + Foam + Dendron + Fumadocs + SilverBullet) on `![[...]]`".

**Opposite path:** Ship `![alt](src)` markdown-image emit as default. Expose `upload.emitFormat: 'wikiembed' | 'markdown-image'` with **`'markdown-image'` as the default** (or even REQUIRE explicit opt-in). Wiki-embed parsing (FR-3a/b/c) still ships — Obsidian refugees get their read path — but OK's OWN authoring pipeline emits standards-compliant markdown images. Obsidian refugees can flip the config to `'wikiembed'` on vault detection (already planned via FR-4), so the interop win is preserved.

**Evidence that might shift the balance:**

1. **The spec's "6-editor convergence" conflates READ with WRITE.** Let me audit the cross-editor report's own findings on this:
   - Obsidian: user authoring is the source of `![[...]]`. Not a drop-emit pattern.
   - Logseq: drop emits `[name](./assets/file.ext)` (markdown link) per REPORT.md §D1. DOES NOT auto-emit `![[...]]` on drop.
   - Foam: drop handled by synthetic markdown render (`### filename` header for non-image) per REPORT.md §D1. DOES NOT auto-emit `![[...]]` on drop.
   - Dendron: drop emits `[filename](assets/kebab-name.ext)` per REPORT.md §D1. DOES NOT auto-emit `![[...]]` on drop.
   - Fumadocs: build-time tool, no drop pipeline. Not comparable.
   - SilverBullet: CM6 drop emits `![[file.ext]]` per REPORT.md §D1. **THIS IS THE ONLY TRUE PRECEDENT FOR AUTO-EMIT.**

   So the "6-editor convergence" is: 6 editors can READ `![[...]]`; **1 editor auto-emits on drop** (SilverBullet). The spec's rationale section on D-I (line 247) says "reuses FR-3 parser; Obsidian refugee fidelity." That's parse-side. The write-side claim that `![[...]]` on drop is the convergence answer is unsupported by the report the spec cites.

2. **GitHub/VS Code/Cursor users opening a `.open-knowledge` wiki see broken images.** `![[photo.png]]` is NOT rendered by GitHub's markdown preview, VS Code's markdown preview, Cursor, Claude Code's read/grep, or ANY general-purpose markdown consumer. The spec R9 acknowledges this as "accepted tradeoff — Obsidian + OK + Fumadocs parity prioritized; GitHub preview is secondary." But for a wiki that's meant to be agent-readable (MCP tools, Claude reading files in the repo via grep/read), `![[photo.png]]` is structurally different from `![alt](photo.png)`. An agent grepping for "image references" with `!\[.*\]\(.*\)` will miss wiki-embeds; they have to know the wiki-embed syntax and write a second pattern.

3. **Agent markdown-read UX favors standard syntax.** LLM training corpora are overwhelmingly CommonMark/GFM, where `![alt](url)` is the dominant image reference. `![[file.png]]` appears in Obsidian-specific content but is not a first-class markdown primitive. An agent asked to "list all images in this wiki" via `grep` would default to the standard pattern. CLAUDE.md's own precedent #2 ("generic primitives over specific ones") argues for broader compatibility, not narrower.

4. **The "auto-emit" is genuinely first-mover territory.** The spec's executive framing of "first-mover blessing or curse" is the right question but gets skipped. Being first mover on a WRITE behavior when 5 of 6 cited editors chose the opposite WRITE behavior is a strong signal that either (a) the opposite path has unexamined downside we haven't found, or (b) OK has insight the others missed. The spec should explicitly argue (b) with citations, or default to the safe path (a) with opt-in for Obsidian refugees.

5. **"Markdown-canonical" framing is load-bearing but leaky.** The spec cites "OK is markdown-canonical per CLAUDE.md's fidelity invariants" as justification. But the fidelity invariants (I1-I7 in CLAUDE.md) are about ROUND-TRIP byte-identity for supported constructs, not about which emit shape is the default. A wiki that emits `![alt](src)` and parses BOTH `![alt](src)` AND `![[photo.png]]` (as FR-3a already specifies) satisfies all 7 invariants identically to a wiki that emits `![[...]]`.

**Assessment: STRONG challenge.** The rejection reasoning in D-I leans on a "6-editor convergence" that the cited REPORT does not actually support for write behavior. The auto-emit is genuinely first-mover and the spec's executive case for being first-mover is thin. The spec should either:
- (a) Add a paragraph to D-I's rationale explicitly acknowledging that SilverBullet is the only precedent for auto-emit, and making the positive case for why OK should follow SilverBullet rather than Logseq/Foam/Dendron (the 3 markdown-canonical peers that chose markdown-link emit);
- (b) Flip the default to `'markdown-image'` with opt-in via FR-4 Obsidian detection (free config flag, no new feature), preserving all other decisions identically;
- (c) Stay the course but document the 2-3-year risk explicitly (if Obsidian loses market share, if GitHub/VS Code ecosystem becomes more important for our users, we're locked into a syntax we'll want to migrate away from).

**Recommendation: reopen.** The current D-I rationale undersells the novelty and oversells the convergence. Not necessarily wrong, but needs stronger evidence.

---

### D-K: Refs-only on rename (no asset relocation) (STRONG challenge)

**Current resolution:** Do NOT move co-located assets when containing doc moves. Basename index resolves from new doc location. MEDIUM-HIGH confidence. Asymmetric reversibility noted. LOCKED.

**Opposite path:** SilverBullet pattern — `batchRenameDocuments` moves co-located assets with the page. Requires building a "which-assets-are-co-located" query (simple: `assets in dirname(docPath)` that have no OTHER docs referencing them in that dirname) before rename. For shared assets (e.g., `logo.png` referenced by 5 docs in different dirs), leave in place.

**Evidence that might shift the balance:**

1. **Over 2-3 years, D-I auto-emit + D-K refs-only produces silent drift.** Scenario: user creates `docs/project-alpha/notes.md`, drops `screenshot-1.png` through `screenshot-50.png` co-located. After 6 months, they move `notes.md` to `archive/2026-q1/notes.md` (natural workflow). Under D-I + D-K:
   - The 50 screenshots STAY at `docs/project-alpha/` because D-K refs-only.
   - The `notes.md` wiki-embed refs still resolve via basename index (D-I immunity, as the spec claims).
   - But the user looking at `docs/project-alpha/` sees 50 orphan assets with no associated docs.
   - When they open `archive/2026-q1/notes.md`, the basename index resolves correctly. No broken images.
   - **BUT: if the basename index rebuild has any correctness bug** — e.g., two `screenshot-1.png` files in different dirs — the shortest-path resolver (Foam-style per FR-3b) might pick the wrong one. Silent corruption of which screenshot is shown.

2. **The "shared-asset breakage" rationale cuts both ways.** The spec (D-K line 249) argues SilverBullet-pattern risks silent breakage of shared assets. True. BUT refs-only risks the opposite: silent BASENAME COLLISIONS when users drag files around. User drops `chart.png` into `docs/project-alpha/chart.png`, then later drops a DIFFERENT `chart.png` into `docs/project-beta/chart.png`. Under D-I + D-K, `docs/project-beta/notes.md` references `![[chart.png]]`. If the user later moves `notes.md` to `archive/`, the basename index has two `chart.png` candidates and the shortest-path resolver picks one. **Silent wrong-image display is the failure mode.** This is NOT addressed in the spec.

3. **"Revisit when drift becomes a real complaint" has a mechanical problem.** Drift in a wiki is silent (orphan files in old dirs; occasional wrong-image selection). Users may never notice until they do `find . -name "*.png" | wc -l` and discover 1000 assets in `docs/old-project-alpha/` that are effectively dead. By that time, deciding to relocate retroactively is MORE expensive (because every doc that moved has refs that worked fine under refs-only but might break under retroactive relocation). The "revisit trigger" should be time-based (e.g., "after 12 months of dogfooding, audit orphan density") OR add a GC path (NG5 was demoted to NOT NOW for `openknowledge gc` — this decision reinforces its P0-adjacent status).

4. **Obsidian ecosystem does indeed stay put.** The spec cites "Obsidian refugee ecosystem expectation matches" (line 249). True — Obsidian moves ONLY when the user asks via `Files & Links > Update internal links` and specific rename flows. But Obsidian ALSO has the `obsidian-attachment-management` community plugin (cited in INV1 sources) that specifically adds relocation-on-rename because users ask for it. So the "refugee expectation" is bimodal: Obsidian's default is refs-only, but a non-trivial fraction of Obsidian users install a plugin to get relocation. This counterweight isn't in the decision rationale.

**Assessment: STRONG challenge.** The asymmetric-reversibility claim ("easy to add later") is true for the CODE but not for the USER EXPERIENCE — by the time drift is a "real complaint," retroactive cleanup is harder than never-had-drift. The spec should either:
- (a) Add a 12-month time-based revisit trigger (not a "complaint-based" trigger);
- (b) Pair D-K with an explicit commitment to ship `openknowledge gc` (NG5) in the next spec cycle, with a clear orphan-asset identification path;
- (c) Reconsider: SilverBullet's pattern — move co-located assets when no other doc in the source dir references them — is narrower than the spec's "all or nothing" framing, and the "shared asset breakage" risk is constrained to the specific case of assets with multiple referrers.

**Recommendation: reopen D-K with 2-3-year drift analysis + concrete re-visit trigger.** The current "Purely additive to add later if drift emerges as a real complaint" language is too passive for a 1-way-asymmetric door.

---

### D-A: Strict magic-byte-only (MODERATE challenge)

**Current resolution:** Non-sniffable MIMEs (TXT, CSV, JSON, MD) rejected outright. LOCKED at HIGH confidence. Rationale: "text belongs in markdown pipeline."

**Opposite path:** Extension-fallback for a short allowlist — accept `.txt`, `.csv`, `.json` with extension-derived MIME, documented in the config as `upload.textExtensions`. SVG already uses this pattern (shipped at `api-extension.ts:2539-2543` per INV3).

**Evidence that might shift the balance:**

1. **CSV is a common data-workflow file.** A user building a wiki page about a dataset naturally wants to drop the CSV for download as an attachment. Under D-A strict, they get "Unsupported file type" with no actionable path (the spec says "belongs in markdown pipeline" but CSV is NOT markdown — it's tabular data). The user's next step is: copy the CSV into a code fence? That's 500 lines of noise in the doc source. Or: rename `.csv` to `.zip` to sneak past the filter? That's worse.

2. **The "text belongs in markdown pipeline" framing is too strong.** The spec's own clipboard-mdast-canonical pipeline is for text/HTML PASTE, not for file-drop. A user dropping `references.csv` isn't trying to render CSV content — they're attaching a reference data file for download. Treating this as "markdown pipeline" territory is a category error.

3. **SVG already breaks the "strict magic-byte-only" claim.** The shipped code has an extension-fallback branch for SVG (INV3 line 59-60, `api-extension.ts:2539-2543`). D-A LOCKED "strict magic-byte-only" is already violated by production code. The spec's §SCOPE does not mention preserving this SVG fallback, which it needs to (else SVG upload breaks on the first widening PR).

4. **The security surface is bounded.** The spec R7 argues "widened MIME allowlist enables novel XSS via content-type confusion" but mitigates via "server ignores client MIME; magic-byte sniff determines type; SVG-via-img unchanged." For text formats, the analogous mitigation is: server serves with `Content-Type: text/plain; charset=utf-8` and `X-Content-Type-Options: nosniff`, which blocks browser sniffing. This is a well-known pattern; the spec doesn't consider it.

5. **INV3 Option B was considered and rejected with a specific argument.** INV3 (line 125-128) argues Option B "adds a filename-trust surface (client can send a binary executable renamed `.txt`); widens attack surface; sets a precedent that extensions matter elsewhere." This is sound reasoning — but it applies uniformly, and SVG is already an exception. If the spec commits to strict-magic-byte, it should remove the SVG fallback (which is a bigger attack surface than TXT/CSV, since SVG can execute scripts via `<script>` tags).

**Assessment: MODERATE challenge.** The rejection reasoning is largely sound, but (a) the SVG inconsistency needs resolution, (b) CSV user-expectation needs an actionable path (maybe "wrap CSV in a code fence" via a paste action), and (c) the "text belongs in markdown pipeline" framing is too strong for the CSV attach-file case.

**Recommendation:** Hold D-A LOCKED, but ADD:
- Explicit preservation of SVG extension-fallback in §SCOPE (or remove it and document impact);
- An actionable rejection UX: "TXT/CSV not supported as attachments. Paste contents into a code fence for inline display, or use the Future Work `upload.textExtensions` config (not yet shipped)" with a link to an issue;
- Add to R1 mitigation: "if user demand for text-file attachments materializes, this is an additive config surface."

---

### D-C + D-F: Image node + read-time Phase-2 promotion (MODERATE challenge)

**Current resolution:** P0 renders image-extension embeds as image node; other extensions (PDF/MP4/MP3) render as plain-link fallback. Phase 2 promotes to Video/Audio/PDFViewer via extension dispatch. Storage shape never migrates (D-F).

**Opposite path:** Ship Phase 1.5 — image node + minimal inline renderers for video (HTML5 `<video>`), audio (HTML5 `<audio>`), PDF (native `<iframe>` or `<embed>`) using simple PM node wrappers. These are 100-200 LOC each, not full MDX components, and would cover 80% of the "real preview" use case without waiting for Phase 2's full typed-component-nodes work.

**Evidence that might shift the balance:**

1. **The P0 dogfood experience is "worse than Outline."** Outline ships typed-node attachment widgets for video/audio/PDF on drop today (per REPORT.md §D3). OK's P0, per the spec, ships "plain-link fallback" for these types — a text link the user clicks to open in a new tab. P1 dogfooders (Nick/internal team) will compare this to Obsidian (inline preview) and Outline (pill widget) and perceive OK as regressive.

2. **Phase 2 might not ship for 6+ months.** Typed-component-nodes is cited (SPEC header) as a separate spec (`specs/2026-04-08-typed-component-nodes/`). The spec states "Phase 2 is pure render dispatch" but Phase 2 is itself gated on:
   - MDX component schema stability;
   - PM NodeView implementation for each media type;
   - Observer bridge compatibility (content-shape changes per CLAUDE.md precedent #10);
   - Round-trip fidelity (I1-I7 invariants).
   None of these are trivial. A 6-month slip is realistic. If Phase 2 slips, OK ships with a "plain-link fallback" for PDF/MP4/MP3 permanently in users' minds.

3. **The "storage shape never migrates" claim is strong but has a gotcha.** Storage shape is `![[file.pdf]]`. Phase 2 renders via extension dispatch. But what happens if a user drops `report.pdf`, Phase 2 ships, and the PDFViewer needs additional attrs (e.g., `page=3`, `zoom=150%`)? Those attrs are encoded in `file.pdf#page=3&zoom=150%` syntax (per Future Work: "audio/video/PDF anchor modifiers"). The storage shape has to grow to accept modifiers; that growth is not trivial migration ("pure render dispatch") — it's a tokenizer extension.

4. **The Phase-1 fallback node has UX consequences that aren't documented.** A "plain-link fallback" for `![[draft.pdf]]` in WYSIWYG renders as a clickable link. But:
   - Does the link show a filename? An icon? A file size?
   - What does it look like when selected in the editor (cursor, keyboard nav)?
   - Does clicking it open in a new tab, or trigger download?
   - How does the user know `.pdf` vs `.mp4` without reading the extension?

   These are detailed UX decisions bundled into "plain-link fallback" with zero specification. The spec should either (a) define the fallback UX precisely, or (b) commit to Phase 1.5 minimal renderers.

5. **"PDF rendering is pure HTML"** — dropping into `<iframe src="file.pdf">` is a 10-LOC NodeView, not a full MDX component. Browsers ship a native PDF viewer. The spec defers this to Phase 2 as if it were complex; it's not.

**Assessment: MODERATE challenge.** D-C and D-F are defensible architecture, but the P0 UX gap is real and the Phase-2 slippage risk is real. The spec should either:
- (a) Ship Phase 1.5 inline for video/audio/PDF using native HTML elements (cheap, no MDX dependency); OR
- (b) Add a concrete "fallback UX spec" to FR-3c describing what the plain-link fallback looks like; OR
- (c) Commit to Phase 2 timeline with a sunset clause ("if Phase 2 doesn't ship by $DATE, revisit Phase 1.5").

**Recommendation: strengthen evidence (don't reopen) — add a fallback UX sub-spec.** Consider Phase 1.5 as an alternative worth naming explicitly.

---

### D-J: Free-form string for `attachmentFolderPath` (MODERATE challenge)

**Current resolution:** Free-form string matching Obsidian's literal schema. HIGH confidence. INV1 confirmed 4 patterns.

**Opposite path:** Typed enum + parsed variant — `{ mode: 'vault-root' } | { mode: 'co-located' } | { mode: 'co-located-subdir', subdir: string } | { mode: 'global', path: string }`. Parse at read time, fail loudly on unknown shapes.

**Evidence that might shift the balance:**

1. **Malformed configs produce silent misbehavior.** A user types `attachmentFolderPath: "assets/"` (trailing slash). Under D-J free-form, this falls into the "other string → global path" branch. But is `assets/` the same as `assets` for path resolution? Node's `path.join` handles it, but does OK's codebase? Without strict parsing, the answer depends on every consumer's path handling. This is a class of bug that typed parsing would catch.

2. **Obsidian field rename risk.** Nick's CLAUDE.md memory includes "Remark-prosemirror migration shipped" which called out upstream dependency risks. What if a future Obsidian release renames `attachmentFolderPath` to `attachmentPath` (the `ConfigurationProvider` plugin cited in INV1 sources actually uses both names in different contexts)? Under D-J free-form, OK silently doesn't read the new field. Under typed parsing with zod `.passthrough()` + warnings, the absence of expected field is logged — user has a signal to investigate.

3. **"./subdir" is handled but lossy.** INV1 §4.3 explicitly notes: "Our upload config does not model 'co-located with subdir.' Either extend the schema (best) or drop the subdir on P0 (simpler, potentially surprising to users). Recommend (a) for P0." The spec follows (a) — drops the subdir hint. A user with `attachmentFolderPath: "./attachments"` (co-located subdir) would silently get `attachmentFolderPath: "./"` (co-located, no subdir) under OK. Their attachments go to a DIFFERENT directory than Obsidian puts them in. This is a migration correctness issue the spec acknowledges but doesn't solve.

4. **The "matches Obsidian literal schema" claim is a precedent pitfall.** CLAUDE.md precedent #5 ("Contract-first MCP tools — we define the MCP protocol; clients conform. Required parameters are required, not optional-with-fallback") argues for strict contracts. D-J free-form is the opposite pattern — "accept any string Obsidian might emit." The spec should either explicitly acknowledge this is an exception to precedent #5 (with rationale), or lean into typed parsing.

**Assessment: MODERATE challenge.** The free-form string contract is PRAGMATIC for interop but GIVES UP on detecting malformed configs. Typed parsing with `.passthrough()` + per-variant branches would catch the "./subdir" lossy case, the trailing-slash normalization case, and any future Obsidian field rename.

**Recommendation: strengthen evidence (don't reopen) — add typed parsing as a sub-implementation detail.** The FR-4 implementation can internally use a zod discriminated union (`ObsidianPathSchema`) with 4 variants, then expose the parsed value to `upload.*` config. The "free-form string" is the WIRE format; the parsing is an internal detail. INV1 line 289-305 already sketches this. The spec should commit to the typed parsing internally.

---

### FR-2: Same-dir sha256 dedup (MODERATE challenge)

**Current resolution:** Same-dirname sha256 dedup with explicit toast. D-B LOCKED.

**Opposite path:** No dedup. When user drops `photo.png` twice, create `photo.png` and `photo-1.png` — the universal pattern (zero editors in the universe do content-hash dedup, per REPORT.md §D4).

**Evidence that might shift the balance:**

1. **Why does nobody do it?** The REPORT.md §D4 finding is the clearest "unclaimed territory" signal. Obsidian has carried this annoyance for 6 years. Is there a reason? Possibilities:
   - **User expectation mismatch.** Users dropping the same file twice may actually WANT a second copy (e.g., scrapbook collector, intentional duplicate-for-annotation). "Reuse existing" is the OPPOSITE of their intent.
   - **Scrapbook collector scenario.** User builds a "references" page with screenshots of different UI states. Two screenshots might be BYTE-IDENTICAL if the app hasn't changed, but the user means them to be distinct (e.g., "state before my change" vs "state after my change" that happened to look the same). Dedup would collapse them.
   - **Privacy leakage.** User drops `client-logo.png` into `clients/acme/notes.md`, then drops the same `client-logo.png` into `clients/globex/notes.md`. If dedup is CROSS-DIR (not the spec's same-dir), both notes reference the SAME file. If the user later deletes the `acme/` dir, the `client-logo.png` it contains could be what `globex/` is referencing. Same-dir scope mitigates this, but the spec doesn't explicitly cite "privacy" as a reason for same-dir scope.

2. **Same-dir scope is defensible but has its own edge case.** User drops `photo.png` into `docs/2026-q1/notes.md` (creates `docs/2026-q1/photo.png`). Same day, drops the same photo into `docs/2026-q2/notes.md`. Under same-dir scope, this creates `docs/2026-q2/photo.png` (no dedup across dirs). If the file is large (20MB), storage bloat is real. The spec cites whole-vault dedup as NG1 Future Work; same-dir dedup is a half-measure that solves only the "drop twice into same note" case.

3. **The toast UX IS the mitigation for scrapbook-collector concern.** "Already at `docs/photo.png` — reusing" is informational; the user can see the dedup happened and, if they wanted two copies, they can rename their intended second file before dropping. D-B's toast is doing real work here. **This is a positive for the current design.**

**Assessment: MODERATE challenge.** FR-2 + D-B (toast) is defensible as a differentiator, but the "why nobody does it" question isn't fully answered. The spec should explicitly address:
- Scrapbook-collector intent (user wants duplicate): toast + (future) "upload as new anyway" confirm button;
- Cross-dir dedup deferred to NG1 — but whole-vault dedup is the full solution; same-dir is a half-measure.

**Recommendation: strengthen evidence (don't reopen) — add scrapbook-collector scenario to R5 mitigation.** Consider D-B's toast as a genuine differentiator that needs a confirm-as-new escape hatch (which the spec's `upload.dedup.ui: 'confirm'` config provides — this should be called out as the mitigation, not just an option).

---

### D-H: Widen file-watcher for asset DiskEvents (WEAK challenge)

**Current resolution:** Widen `file-watcher.ts` to emit asset DiskEvents; reuse `ch:'files'`. LOCKED.

**Opposite path:** New channel `ch:'asset-index'` per INV6 Option B. Keeps `ch:'files'` pure for file-list view.

**Evidence that might shift the balance:**

1. **Blast radius.** INV6 cites "~20 LOC in file-watcher.ts + ~10 in standalone.ts" as the estimate. Audit: the shipped `handleDiskEvent` in `standalone.ts` has 9 call sites of `signalChannel('files')` (I verified via grep). Each handles a markdown-file event type. Widening to asset events means adding asset cases to the same switch — the risk is that existing markdown handlers assume `event.path` ends in `.md`. If an asset event with `.png` path flows into the wrong branch, silent corruption follows.

2. **The ASSET_EXTENSIONS constant is currently `['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']`.** D-H widens file-watcher to these extensions. But FR-1 / FR-5 widens the MIME allowlist to include PDF, MP4, MP3, etc. There's a coupling: `ASSET_EXTENSIONS` (in `upload.ts`) must stay in sync with `wikiEmbedExtensions` (in config schema) must stay in sync with the file-watcher's widening. CLAUDE.md precedent #9 ("Schema is add-only") applies — but the set is currently defined in two places (constants + config default). The spec should commit to a single source of truth.

3. **CC1 `ch:'files'` semantics.** The channel description in CLAUDE.md (§CC1 push-over-awareness) says "`ch:'files'` fires on `create | delete | rename` DiskEvents only (`update` / `conflict` do not change the file list)." Widening to asset events means asset CREATE/DELETE/RENAME also fire. An asset UPDATE (e.g., overwrite) doesn't need to fire because basename doesn't change. This is consistent and fine, BUT — Option B (new channel) would have different semantics: the basename index ONLY cares about create/delete/rename, not other disk changes. Using `ch:'files'` means the FileSidebar component and the basename-index consumer receive the SAME signal and both must filter by what they care about.

**Assessment: WEAK challenge.** Option A (widen) is defensible on blast-radius grounds. The ~20 LOC estimate is probably correct, and shipping Option B would add a new channel for marginal semantic clarity. Option A's downside (shared signal for different consumers) is mitigated by the simple fact that BOTH consumers want to know about asset create/delete/rename.

**Recommendation: hold D-H LOCKED.** Minor addition: SCOPE should explicitly list the single-source-of-truth question for `ASSET_EXTENSIONS` vs `wikiEmbedExtensions` (they likely should be the same set, with config overriding).

---

### D-B: Dedup toast UX (WEAK challenge)

**Current resolution:** Toast ("Already at `docs/photo.png` — reusing"). MEDIUM confidence. Config escape hatch `upload.dedup.ui: 'silent' | 'toast' | 'confirm'` with default `'toast'`.

**Opposite paths:** (a) silent — match universal pattern; (b) modal confirm — "File already exists; reuse or upload as new?"

**Assessment: WEAK challenge.** Toast is the right middle ground. Silent would surprise users (who expect "drop file = new file"); modal confirm would interrupt flow for a case that's rare but not rare enough to block on. The config escape hatch is adequate. Universe-wide "nobody does dedup UX" signal is real but not a reason to not do it first.

**Recommendation: hold.**

---

### D-D: Map (not TrieMap) for basename index (WEAK challenge)

**Current resolution:** In-memory `Map<basename, string[]>` rebuild at startup. LOCKED.

**Opposite path:** TrieMap (Foam's choice via `mnemonist`). Adds dep but scales better at 10k+ files.

**Assessment: WEAK challenge.** At OK's current scale (hundreds to low-thousands of files), Map is sufficient (INV2-validated). TrieMap would be premature optimization. If users surface performance at 10k+, refactor is trivial. D-D is right.

**Recommendation: hold.**

---

### D-G: Endpoint rename `/api/upload-image` → `/api/upload` (WEAK challenge)

**Current resolution:** Rename + one-release shim. LOCKED.

**Opposite path:** Keep `/api/upload-image` as the canonical name; just widen its handler.

**Assessment: WEAK challenge.** Given D1 scope expansion to non-image types, the existing endpoint name is misleading. Rename + shim is the right pattern. Shim adds ~5 LOC; removing the old path in next release is clean.

**Recommendation: hold.**

---

### NG4: Disjoint key space (page titles vs file basenames) (WEAK challenge)

**Current resolution:** Note-to-note `[[Page Name]]` resolution is separate from file-embed `![[basename.ext]]`. "Disjoint key space" argument.

**Challenge:** What happens when a user has both `docs/guide.md` (page title "guide") AND a file `docs/guide.png`? Under the disjoint key space claim, `[[guide]]` resolves to the page and `![[guide.png]]` resolves to the file. But what about `[[guide.png]]` (no bang)? Under the current spec, it's a note-to-note wiki-link that doesn't resolve (NG4 carveout). But wiki-link serialization is a Bucket 7 scope; today it would serialize as text. Edge case: bare `[[guide]]` with the `.png` file existing — some users will expect `[[guide]]` to resolve to the file. The disjoint-key-space claim is a design invariant, but users may violate it.

**Assessment: WEAK challenge.** This is a genuine edge case, but it's Bucket 7 territory (note-to-note resolution) which is already NG. Disjoint key spaces is a defensible design invariant. The risk is acceptable.

**Recommendation: hold.**

---

## Scope challenges

### Can the 8-item scope be split? (STRONG challenge)

**Current:** 8 items (FR-1 through FR-8) shipped as one coherent surface.

**Analysis:** There are two genuinely independent sub-features bundled:

**Sub-feature A — "Upload widening" (independently valuable, low-risk):**
- FR-1: Accept magic-byte-sniffable types on drop
- FR-2: Same-dir sha256 dedup
- FR-5: Upload config schema
- FR-8: Endpoint rename

This is a ~2-day ship. Zero new persistence shape. Zero new mdast nodes. Zero index modules.

**Sub-feature B — "Wiki-embed + vault interop" (independently valuable, higher-risk):**
- FR-3a: `![[file.ext]]` embed tokenizer (new mdast node)
- FR-3b: File-basename index (new module)
- FR-3c: Embed render by extension
- FR-3d: Embed write on drop (D-I auto-emit — the riskiest decision)
- FR-4: Obsidian vault detection
- FR-1a: Emit-shape dispatch
- FR-6: CC1 reuse for index invalidation
- FR-7: Image-ref rewrite on rename

This is a ~5-day ship. Introduces new mdast node type (1-way persistence shape door), new basename index module, auto-emit behavior (genuine first-mover territory).

**Why separating helps:**
1. **De-risking.** Sub-feature A ships first as a standalone PR. 48 hours of dogfooding surfaces any MIME-widening surprises before Sub-feature B bundles the riskier auto-emit behavior.
2. **Clearer decision reversibility.** Under a single PR, reverting D-I auto-emit means reverting the whole PR. Under split PRs, D-I can be reverted independently.
3. **Review bandwidth.** A 5-day PR with 8 FRs is hard to review deeply. Two 2-3-day PRs are reviewable.

**Counter-argument for staying bundled:** FR-7 (image-ref rewrite on rename) depends on FR-3b (basename index) for the wiki-embed case. FR-6 (CC1 reuse) only makes sense once FR-3b consumes the signal. But these cross-FR dependencies are INTERNAL to Sub-feature B — they don't bridge Sub-features A and B.

**Recommendation:** CONSIDER SCOPE SPLIT. The current spec is tight, but the opportunity for two sequential PRs (Sub-feature A → real user feedback → Sub-feature B) is worth calling out explicitly.

---

### Missing items the spec dismissed too early?

**NG9 Paste-image-from-URL (clipboard URL → download bytes → store locally).** The spec says "Clipboard URL → `![](url)` direct-link is fine for P0." But the clipboard-mdast-canonical spec (INV5) notes "Mixed paste behavior (prose + inline images in one clipboard): rehype-remark's default handling maps `<img>` → mdast `image` → `![alt](url)` markdown → our PM image node. URLs from source apps (e.g. googleusercontent.com, cid: references) typically 403 or fail to resolve outside their context — user sees broken image placeholder and must re-upload manually."

This is a genuine UX gap. A user pasting from Gmail or Google Docs gets broken images. The spec defers to Future Work (NG9) but this is a very common case — it's not P2 for agent use cases but it's P1 for Obsidian refugees. The spec should at least mention how users discover and work around this.

**NG7 MCP `upload_asset` tool for agents.** The spec says "Agents write markdown refs; binary upload is a follow-on." Fine. But what does an MCP agent DO today when it wants to include an image? It generates markdown referencing a path that doesn't exist. The user gets broken image. This is relevant TODAY, not just for NG7 future work. The spec should mention agent-generated broken-image behavior under FR-3c or Risks.

**What about embed size modifiers?** NG12 defers `![[image.png|640x480]]`. Obsidian supports this; SilverBullet supports this. Users with existing Obsidian vaults will have such refs. Under the current spec, `![[image.png|640x480]]` parses as `![[image.png]]` + modifier stripped? Or fails to parse entirely? This affects FR-4 (vault detection) more than the spec acknowledges — importing a vault with modifier-bearing refs could silently degrade fidelity.

---

## Cross-cutting concerns

### Concern 1: "Markdown-canonical" is invoked as a framing across multiple decisions but isn't defined load-bearingly

D-I rationale: "OK is markdown-canonical per CLAUDE.md's fidelity invariants." D-A rationale: "text belongs in markdown pipeline." D-C rationale: "Inline image is the universal embed render" (because markdown-canonical editors do this).

But "markdown-canonical" is being used to justify THREE different things:
1. Storage-layer contract (D-I): emit `![[...]]` because we store markdown verbatim.
2. Type filter (D-A): reject CSV because it's not markdown.
3. Rendering invariant (D-C): render `![[...]]` like `![](...)` because markdown editors render identically.

These are three different invocations and not all require "markdown-canonical" as load-bearing. The spec should clarify which invocation is load-bearing where.

### Concern 2: 1-way door classification may be too generous on some decisions

- D-I marked 1-way: correct. Persistence shape change is a user-data 1-way door.
- D-C marked 1-way (user-visible UX): correct.
- D-F marked 1-way (storage shape never migrates): correct — it's the DUAL of D-I.
- D-G marked 1-way (client breaking): slightly generous. The shim makes this reversible — we can re-expose `/api/upload-image` if needed. Call it a 1-way door for the rename but the shim IS the reversibility mechanism.
- D-K marked "Asymmetric (easy to add relocation later; hard to remove it)": THIS IS LOAD-BEARING AND UNDERCLAIMED. "Easy to add later" in code ≠ "easy to migrate users' content later." If users accumulate 1000s of orphan assets, adding SilverBullet-style relocation later has to deal with retroactive cleanup. See D-K challenge above.

### Concern 3: No blast-radius analysis for storage-shape change

D-I introduces `![[file.ext]]` as a default emit. What this does to:
- **Shadow repo attribution** (`.git/openknowledge/`): does the shadow repo treat `![[...]]`-referenced assets differently from `![](...)`-referenced? Based on CLAUDE.md §Shadow repo, the attribution journal tracks agent vs upstream writes on the markdown files, not the referenced assets. So the shadow repo is likely transparent to the ref shape. BUT: the basename index (FR-3b) is a new system that the shadow repo doesn't know about; does a shadow repo commit that renames a file require an entry in the basename index to stay consistent?
- **MCP `search` tool:** does search for "image" find wiki-embeds? If the search index is keyword-based over markdown source, `![[photo.png]]` is keyword `photo.png` but NOT keyword `image`. `![alt="my photo"](photo.png)` would be keyword `my photo`. The spec doesn't address how MCP search interacts with the new ref shape.
- **`exec` MCP tool for wiki reading:** CLAUDE.md §Open Knowledge says "every returned path is enriched with frontmatter (title, description, tags), backlink count, and recent shadow-repo activity." Does backlink count include wiki-embed refs? This should be explicit.

These aren't showstoppers but they're unaddressed.

---

## Challenges that did NOT hold up (due-diligence)

### CH-X1: "D-E rename race should use DMP three-way merge for asset rename-during-typing"

**Initial challenge:** CLAUDE.md precedent #11 ("minimize CRDT mutation in sync bridges") argues for DMP `patch_make`/`patch_apply` for CRDT writes. Does FR-7 image-ref rewrite need the same treatment?

**Why it doesn't hold:** FR-7 operates at the MARKDOWN STRING level (managed-rename-rewrite.ts), not at the Y.Text CRDT level. It's a pure markdown transformation invoked on a write path. The CRDT-preservation concerns of precedent #11 don't apply because the rewrite runs as a "server-side markdown compose" (per precedent #12 template), which then flows through the usual XmlFragment-authoritative path. **Dismissed.**

### CH-X2: "FR-4 Obsidian detection should persist findings to user config"

**Initial challenge:** Why not WRITE the detected values to `.open-knowledge/config.yml` so subsequent starts don't re-read `.obsidian/app.json`?

**Why it doesn't hold:** The spec explicitly calls this out — "non-destructive (does NOT write to `.open-knowledge/config.yml`)." Writing would:
- Create a user-facing surprise (random config file gets a new section);
- Break the Obsidian-as-source-of-truth contract (if user changes Obsidian settings, OK's cached config drifts);
- Add a migration path (what if user deletes `.obsidian/app.json` later?).

Non-destructive read-on-startup is correct. **Dismissed.**

### CH-X3: "CC1 `ch:'files'` debounce (100ms) is too long for real-time basename-index updates"

**Initial challenge:** Obsidian-refugee opens vault with 1000 files; 100ms debounce means 10 signal-and-rebuild cycles during the initial scan. What if the basename index rebuild takes 200ms and signals arrive every 100ms? Backpressure?

**Why it doesn't hold:** The rebuild is not a per-signal operation. On signal, the consumer re-fetches the canonical endpoint (per CC1 contract). The fetch itself is the work unit; signals coalesce naturally via the 100ms debounce. If rebuild takes longer than signal interval, the consumer serializes (doesn't dispatch until current rebuild completes). Standard backpressure pattern. **Dismissed.**

### CH-X4: "`upload.wikiEmbedExtensions` default list is too aggressive — what about SVG with script content?"

**Initial challenge:** `wikiEmbedExtensions` default includes `svg`. If an embedded SVG has `<script>`, it could execute when rendered as an image node.

**Why it doesn't hold:** The spec NFR-3 and shipped code both note "SVG `<img>`-only rendering." Rendering SVG via `<img src>` (not `<iframe>` or `<object>`) blocks script execution per browser security model. The wiki-embed → image-node render path uses the same `<img>` rendering. **Dismissed.**

---

## Final recommendations summary

**Reopen (STRONG challenges):**
1. **D-I auto-emit on drop** — add stronger evidence for why OK is first-mover on auto-emit `![[...]]`; OR flip default to markdown-image with opt-in.
2. **D-K refs-only** — add time-based revisit trigger (not "complaint-based"); pair with concrete GC (NG5) commitment.
3. **Scope split** — consider splitting FR-1/FR-2/FR-5/FR-8 (upload widening) from FR-3/FR-4/FR-1a (wiki-embed) as two PRs.

**Strengthen evidence (MODERATE challenges, not reopens):**
4. D-A — preserve SVG fallback explicitly; add actionable rejection UX for TXT/CSV.
5. D-C + D-F — specify plain-link fallback UX precisely; consider Phase 1.5 inline renderers.
6. D-J — commit to typed parsing internally (INV1 §4.3 sketch).
7. FR-2 — call out `upload.dedup.ui: 'confirm'` as the mitigation for scrapbook-collector intent.
8. NG9/NG7 edge cases — acknowledge broken-image UX for paste-from-URL and MCP agent ref generation.
9. NG12 — define parse behavior for `|modifier` refs in vault import.

**Cross-cutting:**
- Clarify "markdown-canonical" invocation per-decision.
- Blast-radius analysis for storage shape change (shadow repo, MCP search, `exec` backlink count).
- D-K asymmetric reversibility needs explicit user-data-migration language.

**Held as-is (WEAK challenges):**
- D-B toast UX, D-D Map-not-Trie, D-G endpoint rename, D-H file-watcher widening, NG4 disjoint keyspace.
