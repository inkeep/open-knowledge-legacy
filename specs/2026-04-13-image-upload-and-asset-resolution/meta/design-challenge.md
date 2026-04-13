# Design Challenge Findings

**Artifact:** specs/2026-04-13-image-upload-and-asset-resolution/SPEC.md
**Challenge date:** 2026-04-13
**Total findings:** 6 (2 H, 3 M, 1 L)

---

## High Severity

### [H] Finding 1: D9 filtered-sirv exposes the *entire* content tree, not just "`.md` is browseable"

**Category:** DESIGN — **Source:** DC2 (security/SRE lens) — **Location:** §9 Enforcement / §14 Risks / D9 / D11

**Issue:** The spec's risk row for D9 says "content is browseable by design; direct `.md` GET returns the same bytes as `/api/document`." That framing is incomplete. The filter's `isExcluded` logic is: *include if matched by `content.include`* (defaults to `**/*.md`) *OR if extension ∈ ASSET_EXTENSIONS and dir has a sibling `.md`*. Everything else — gitignore, exclude, non-allowlisted ext — returns 404. Good. But:

1. **`.open-knowledge/config.yml` is inside `projectDir` but — critically — is it under `contentDir`?** If contentDir is the project root (a valid config), config.yml lives at `./.open-knowledge/config.yml`. `.open-knowledge/` is not in `.gitignore` by default and not in `content.exclude`. The include glob `**/*.md` won't match `config.yml`, and `.yml` isn't in the asset allowlist, so it 404s — OK. But `.open-knowledge/instructions/*.md` *would* match the include and would be served. There's no spec-level assertion that content roots are `.open-knowledge`-free.
2. **No `Content-Disposition` for `.md`.** Browsers happily render markdown as plaintext, and a hostile page on another origin could `<iframe>` an attacker-seeded `.md` (or reflected via injected content). More importantly: a file like `docs/guide.html` dropped via `cp` into a `.md`-containing dir is *not* allowlisted (FR10's wording is extension-gated), but `docs/guide.md` rendered in a browser lets crafted content (e.g. phishing text masquerading as a page) live under the dev server's origin.
3. **The `.md`-browseable equivalence claim** ("same bytes as `/api/document`") is false when the file has been edited but not yet flushed. `/api/document` reads live Y.Text; filtered-sirv reads disk. Divergence is observable.

**Current design:** "Raw `.md` sources now HTTP-reachable (filtered-sirv) ... Content is inherently browseable via `/api/document`; direct `.md` GET returns the same bytes." (§14)

**Alternative:** (a) Narrow filtered-sirv to `ASSET_EXTENSIONS` *only* — don't serve `.md` at all over HTTP (editor never needed that; `/api/document` remains the only read path). Asset-serving is the only new requirement. (b) If `.md` serving is actually needed, add `Content-Disposition: attachment` for `text/markdown` and explicitly list what lives in `contentDir` that is *not* user content (config files, caches).

**Trade-off:** (a) is simpler and smaller attack surface; loses the theoretical "view raw .md in browser" affordance nobody asked for. (b) keeps the capability but adds headers + an audit of what's under contentDir.

**Status:** CHALLENGED — **Suggested resolution:** Confirm what file types actually need HTTP GET. If only assets, gate filtered-sirv on `ASSET_EXTENSIONS` (extension-allowlist serve), not the general filter. This also collapses D9+D11 into a single check.

---

### [H] Finding 2: D7 sibling-relative refs silently break on `.md` relocation — the "bundles move together" claim is aspirational

**Category:** DESIGN — **Source:** DC3 (framing validity) — **Location:** §1 Resolution / §2 G1-G2 / D7

**Issue:** The spec justifies sibling-relative references with "bundles move together." In practice, users rarely move `.md` + all its siblings atomically. Real flow: author moves `docs/guide.md` → `archive/guide.md` via VS Code / Finder drag. `screenshot.png` stays in `docs/`. The reference `![](screenshot.png)` now resolves to `archive/screenshot.png` → 404, with no warning. There is no reference-rewrite UI (NG3 deferred) and no broken-link reporter.

G2 ("a single image can be referenced from multiple .md files via relative paths") is *also* at odds with sibling storage: the image lives next to exactly one `.md`, and other referrers use `../../docs/screenshot.png` — which breaks if *either* file moves.

**Current design:** "Inserted markdown references are sibling-relative from the editing `.md`" (D7); "bundles move together" (§1).

**Alternative:** **Root-relative paths with a leading `/`** (`![](/docs/screenshot.png)`) — same as Docusaurus `static/`, same as GitHub raw. Survives `.md` relocation; server mount at `/` makes this the natural resolution. The PR #41 bug was *no* leading slash (root-relative-without-root); adding the slash fixes it. Trade: markdown is coupled to the contentDir root, but that root is already implicit in the whole system. Hugo/Zola sibling-relative works because *their* build step rewrites paths; we have no such step.

**Trade-off:** Root-relative survives moves but couples markdown to serving topology. Sibling-relative is portable across servers (grep-friendly `![](screenshot.png)`) but fragile under the most common editing action (file move). The spec picks portability at the cost of robustness; the user's real complaint about PR #41 was *absolute-path brittleness*, not sibling-relative *preference*.

**Status:** CHALLENGED — **Suggested resolution:** Re-examine whether G2 and "bundles move together" are both achievable with sibling-relative. If they are not, make the trade explicit: pick one axis, document the other as a known gap with a trigger (first bug report where a file move silently 404s images → revisit).

---

## Medium Severity

### [M] Finding 3: D11 stateful `dirsWithIncludedMd` has three unaddressed mutation paths

**Category:** DESIGN — **Source:** DC2 (SRE lens) — **Location:** D11 / §13 step 7 / §14 risk row 5

**Issue:** The spec addresses "`.md` create / delete" but misses:
1. **`.md` rename across dirs** (e.g. `docs/a.md` → `archive/a.md`). File watcher emits this as either a rename or delete+create pair depending on the platform. If only `create(archive/a.md)` fires without the corresponding `delete(docs/a.md)`, `docs/` stays "has .md" forever. If only `delete` fires, the new dir never gets added.
2. **Concurrent create of two `.md` in previously-empty dir.** Both call `addMdDir(dir)`; the underlying set handles it, but the *counting* has to be refcount-style (N `.md` in dir → remove on Nth delete), not boolean. Spec says "first md in dir ⇒ add, on delete if no remaining ⇒ remove" — this requires a scan on every delete, which doesn't scale past a few hundred files per dir, or a counter that must handle rename races.
3. **Hot-reload of `content.include`.** If a user edits `config.yml` and the include set shrinks, the dir-set must be rebuilt. The spec doesn't say whether config is hot-reloadable or requires restart.

**Current design:** "On watcher `.md` create event, call `filter.addMdDir(dirname(docName))` ... On `.md` delete, if no remaining `.md` in dir, call `filter.removeMdDir(dirname)`." (§13)

**Alternative:** Replace the stateful set with a **stateless predicate**: `hasIncludedMdSibling(dir) = exists .md in dir matching include and not excluded`. Compute on-demand, cached in an LRU keyed by dirname with a TTL of one watcher tick. Invalidate the entry on any event in that dirname. No rename/concurrency reasoning needed; cost is one `readdir` per first-access-per-tick.

**Trade-off:** Stateless is simpler (fewer bugs) at the cost of a `readdir` on cold access. At 10k files / ~1k dirs, cold-access cost is bounded and rare (only on new uploads). Stateful is faster but has 3+ edge cases to enumerate and test.

**Status:** CHALLENGED — **Suggested resolution:** Either (a) refcount the set (not boolean) and enumerate rename handling explicitly in a filter test; or (b) go stateless and skip the class of bugs entirely.

---

### [M] Finding 4: D12 silent SVG rejection will surprise users; no render-time sanitizer path is on the roadmap

**Category:** DESIGN — **Source:** DC2 (customer-facing lens) — **Location:** D12 / FR foundational assumption

**Issue:** SVG is a first-class format for diagrams (Mermaid exports, Figma exports, architecture sketches). The spec rejects SVG silently at upload ("Unsupported file type: image/svg+xml"). For a wiki product whose unique selling point is authoring diagrams and architectural docs, this is a real usability gap. The spec doesn't record a trigger for revisiting, doesn't mention DOMPurify, and doesn't acknowledge that *render-time* sanitization (the stated storage-layer fidelity principle per CLAUDE.md — "storage never sanitizes; render-time layers do") is the correct home for this.

**Current design:** "SVG sanitization is a render-layer concern we're not solving here." (D12)

**Alternative:** Accept SVG at upload (storage layer, consistent with NG4 in CLAUDE.md) and add a render-time sanitizer at the *editor's* `<img>` rendering path (DOMPurify.sanitize with SVG profile, or `<img>` tag only — never inline `<svg>` — which blocks script execution by the HTML spec). Docs site gets the same treatment separately. This is ~20 LOC in the editor and is exactly the stated architectural precedent.

**Trade-off:** Ship-today pressure (D5) makes "add now" risky; ship-today + silent rejection creates a customer-facing gotcha. Middle path: accept SVG at upload (consistent), render as `<img src>` only (safe, per HTML spec), file a follow-up for richer SVG handling. No DOMPurify needed for v1.

**Status:** CHALLENGED — **Suggested resolution:** Re-examine whether `<img src="file.svg">` (no inline SVG) is safe enough for v1 — spec says "script-execution vector" but `<img src>` does not execute scripts per HTML spec. If yes, flip D12 to accept SVG. If no, add a "SVG not supported — paste as PNG" editor-side hint rather than a backend 400.

---

### [M] Finding 5: D5 launch-today pressure is not reflected in the rework scope — 10 files, stateful filter, contract change

**Category:** DESIGN — **Source:** DC1 (simpler alternative) — **Location:** D5 / §13 rework checklist

**Issue:** The rework checklist has 10 numbered steps touching 10+ files across 4 packages, including a stateful filter change, an HTTP contract change (`parentDocName` added, response shape changed), removal of a config key, and a sirv remount. That is a day of code plus a day of testing, not a launch-today diff. The spec concedes Docs-site rendering is deferred (D10) — a user-visible omission — yet retains everything else as P0. There's no flag-gate; the filter change alters `isExcluded` semantics for *every* content deployment, not just ones using images.

**Current design:** D5 "Launch target: today" + §13 checklist (10 steps, 10 files).

**Alternative:** **Minimum viable rework for today: (a)** keep PR #41's scoped sirv mount but change the scope from `/${uploadsDir}/` to `/<parentDir>/<filename>` (per-upload registration) OR retain a single flat `uploads/` dir but route references through sibling resolution. **(b)** defer the filter reinterpretation (D11) behind a feature flag. **(c)** Ship D7 (sibling-relative refs) and D16 (config cleanup) today; D9+D11 next week with the benchmark (A3) already done.

**Trade-off:** Minimum-viable leaves the flat uploads dir temporarily visible; ships the user-facing value (sibling authoring model for *new* uploads) without touching the filter. The filter work is the biggest unknown and the one thing that can regress every existing user; deferring it one week is cheap.

**Status:** CHALLENGED — **Suggested resolution:** Re-examine whether the filter reinterpretation *must* ship today. If today is "drag-drop works and lands in the right dir," D7+D16 alone achieve that with the scoped sirv staying.

---

## Low Severity

### [L] Finding 6: D14 orphan-on-undo is a name for "no-op" — the principled alternative (pending-commit marker) is barely more code

**Category:** DESIGN — **Source:** DC1 (simpler alternative) — **Location:** D14 / Future Work NG2

**Issue:** D14 says "file stays on disk" on undo. This is less a decision than a non-action. Future Work NG2 (orphan GC) inherits the problem. A near-free alternative exists: tag the just-uploaded file with a sidecar `.pending` marker (or an extended attribute) at upload time, remove the marker when the `.md` save containing the reference commits. A background sweep can delete `.pending` older than 24h. This is ~30 LOC and turns D14 into a real policy rather than a deferred problem.

**Alternative:** Pending-commit marker + sweep. Or: rely on the future shadow-repo attribution (D14's referenced future trigger) — in which case the spec is correctly deferring.

**Trade-off:** Near-term mess (orphans accumulate) vs extra code now. Given D5 time pressure, "nothing" is defensible; just name it honestly in the Future Work tier as "Identified, blocked on shadow-repo."

**Status:** CHALLENGED — **Suggested resolution:** Rename D14's stance to "no cleanup in v1; orphan GC waits on shadow-repo." Don't dress it up as a policy.

---

## Confirmed Design Choices (summary)

- **DC1 (simpler):** D8 (naming conventions match industry prior art), D13 (MCP tool deferral), D15 (reuse `safeContentPath`) — all minimal and defensible.
- **DC2 (stakeholder):** Symlink-escape handling (FR9/D15), MIME magic-bytes (FR12), size cap (FR11), `X-Content-Type-Options` — the security-engineer checklist is comprehensive for the upload path.
- **DC3 (framing):** The core SCR — "PR #41 encoded three 1-way doors that diverge from the agreed authoring model" — holds. The pivot to sibling storage is evidence-supported. Framing breaks down only on the *serving* and *move-robustness* sub-claims (findings 1 and 2).

**Strongest concern:** Finding 1 (D9 surface area). Second: Finding 2 (move semantics). Third: Finding 5 (scope vs D5 today-pressure).
