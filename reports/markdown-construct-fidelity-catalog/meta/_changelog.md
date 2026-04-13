# Changelog — markdown-construct-fidelity-catalog

## 2026-04-11 — Initial report + audit fixes

### Report created
- Probe script (`evidence/probe-script.ts`) run against 118 constructs via `@tiptap/markdown@3.22.3`
- 3 evidence files authored: d1 (construct catalog), d2 (root cause trace), d3 (hit list ranking)
- REPORT.md synthesizes findings across 5 dimensions (D1-D5)
- Related prior report `markdown-roundtrip-fidelity-tiptap/` cross-referenced

### Audit pass — 5 findings applied

Audit subagent (`_nest:research-audit`) returned 2 H + 2 M + 1 L findings. All resolved:

- **H1** (D3 ranking arithmetic — "41 material differences, 49 ranked"): Reframed D3 to "Of all 118 constructs, we ranked 49 by test priority" with explicit acknowledgement that P2 includes regression-guard constructs and P3 includes out-of-scope items.
- **H2** (Numeric entities mis-classified): Exec summary now says "12 ENTITY_CORRUPTION" (functional count) with a note that the TSV mechanical count is 10. The 2 numeric-entity cases are analytically reclassified because their `&` gets encoded even though the classifier didn't catch them as "literal `&`".
- **M1** ("30 constructs with material corruption" — incorrect): Replaced with "39 material differences" clean partition (2 + 77 + 39 = 118).
- **M2** ("41 have material differences" — double-counted byte-identical): Corrected to 39 throughout (REPORT.md D1 section and d1 evidence file).
- **L1** (D2 missing second call site at line 1020): Added `renderNodesWithMarkBoundaries` as a second call path for `encodeTextForMarkdown`. Noted impact on fix options A/B.

### F2: Backslash-escape origin trace — COMPLETE

**Research question:** At which pipeline layer do backslash-escaped characters (`\*`, `\_`, `\[`, `\#`) get lost?

**Findings:**
- marked (Layer 1) is innocent — correctly produces `escape` tokens with decoded characters per CommonMark §2.4
- `@tiptap/markdown` `parseInlineTokens` (Layer 2) is the primary loss site — no handler for `escape` token type; characters silently dropped
- `@tiptap/markdown` `encodeTextForMarkdown` (Layer 3) is a secondary bug — does not re-escape markdown syntax chars in text nodes, so even a parse fix alone would cause meaning corruption on round-trip (`*x*` → italic, `# x` → heading)

**Files added:**
- `evidence/d2c-backslash-escape-origin.md` — full origin trace with CommonMark spec reference
- `evidence/d2c-split-test.ts` — reproduction script testing all 3 layers independently

**Files updated:**
- `REPORT.md` D3 section — P0 cases 8-11 annotated with "Fix site:" pointers to the dual-layer bug
- `REPORT.md` References — added d2c evidence files

**Fix direction:** ~13 lines across two sites in `@tiptap/markdown` (parse: 3 lines, serialize: ~10 lines). Can be monkey-patched in `@inkeep/open-knowledge-core` if upstream timeline is too slow. No existing upstream issue found — filing recommended.

### F1: @tiptap/markdown extension API exhaustion — COMPLETE

**Research question:** Does `@tiptap/markdown` v3.22.3 expose ANY hook, option, or extension point to bypass `encodeTextForMarkdown` → `encodeHtmlEntities` without forking?

**Findings:**
- **No documented API exists.** Exhaustive audit of: constructor options (4 options, none encode-related), `ExtendableConfig` interface (no encode fields), `MarkdownExtensionSpec` type (no encode hooks), `renderMarkdown` handler scope (cannot intercept child text encoding), `serialize()` method (no pre/post hooks), and the `code: true` mechanism (not viable for general text).
- **Undocumented escape hatch found:** Compiled JS emits `encodeTextForMarkdown` as a regular prototype method (not `#private`). Prototype monkey-patching is viable — 5 lines, zero fork, captures both call sites.
- **New Option D** added to fix taxonomy: prototype monkey-patch. Recommended over Option A (blind post-process) because it acts at root cause. Fragile against future library changes but mitigable by version pinning + build-time assertion.
- **Upstream context:** Entity encoding introduced in [PR #7565](https://github.com/ueberdosis/tiptap/pull/7565) (merged 2026-03-05) fixing [#7539](https://github.com/ueberdosis/tiptap/issues/7539). No discussion of making it configurable.

**Files added:**
- `evidence/d2b-extension-api-surface.md` — full API surface audit + escape hatch analysis

**Files updated:**
- `REPORT.md` D2 section — added D2b subsection, resolved 2 open uncertainties, updated fix taxonomy (3 → 4 options)
- `REPORT.md` References — added d2b evidence link
- `REPORT.md` Out of Scope — updated "three fix options" to "four fix options"

### F3: Multi-client concurrent construct fidelity pass — COMPLETE

**Research question:** When two clients edit the same markdown construct concurrently via Yjs CRDT merge, does the round-trip fidelity differ from the single-client Layer B path documented in D1?

**Findings:**
- **No.** All 30 constructs tested classify as `IDENTICAL_TO_SINGLE_CLIENT`. Zero convergence failures. Zero additional corruption from CRDT merge.
- Entity corruption (`&amp;`, `&lt;`, `&gt;`) fires at `mdManager.serialize` time — after CRDT merge — so it's identical whether 1 or 2 clients contributed content.
- Backslash-escape content loss happens at `mdManager.parse` time — before content reaches Y.Doc — so CRDT merge can't compound what's already lost.
- Yjs convergence guarantee holds across all 30 tested constructs: both clients produce byte-identical serialized output after merge.
- D3 P0 priority ranking is UNCHANGED by this finding.

**Files added:**
- `evidence/d6-multi-client-construct-pass.md` — full 30-case analysis with methodology, classification results, and implications
- `evidence/d6-multi-client-probe.ts` — 2-client manual-sync probe script (5-phase protocol, no Hocuspocus)

**Files updated:**
- `REPORT.md` Research Rubric — added D6 row
- `REPORT.md` Non-goals — struck multi-client line, marked as covered by D6
- `REPORT.md` D6 section — new finding section after D5
- `REPORT.md` Limitations — updated multi-client bullet to "partially resolved by D6"
- `REPORT.md` References — added d6 evidence files

**Remaining gaps:** Same-character-range conflicts, Observer B interaction, 3+ clients not tested.

### Pending: F4 fanout result

Four parallel /research --headless subagents dispatched to extend this report + the prior `markdown-roundtrip-fidelity-tiptap/` report:
- ~~F1 (`_nest:research-f1`) — @tiptap/markdown extension API exhaustion~~ **COMPLETE** — see above
- ~~F2 (`_nest:research-f2`) — Backslash-escape loss origin trace~~ **COMPLETE** — see above
- ~~F3 (`_nest:research-f3`) — Multi-client construct fidelity pass~~ **COMPLETE** — see above
- F4 (`_nest:research-f4`) — Alternative-serializer comparison at 118-case scale (extends prior report)

Results will be consolidated into this changelog and the REPORT.md sections when subagents complete.
