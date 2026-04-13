# Bridge coverage gaps + fidelity trim — Spec

**Status:** Approved (post-audit)
**Owner(s):** engineering
**Last updated:** 2026-04-12
**Baseline commit:** 39fcd87
**Links:**
- Project: [projects/server-bridge-hardening/PROJECT.md](../../projects/server-bridge-hardening/PROJECT.md) (Phase 2 Now)
- Evidence: Agent B wiki-link audit + Agent C reports catalogue (in conversation context, 2026-04-12)

---

## 1) Problem statement

**Situation.** Phase 1 of server-bridge-hardening shipped (PR #62) including S7, which codified "single-client observer coverage is insufficient for observer bridge changes" in CLAUDE.md. Three parallel Opus investigations on 2026-04-12 audited the codebase at `39fcd87` and found two test-level gaps and one provably-redundant test chain.

**Complication.** The S7 policy was violated by the first PR that shipped after it (PR #71, wiki-links), and the conversion-fidelity test suite spends ~18s per `bun run check` on two describe blocks that a prior research report proved are structurally impossible to fail.

**Resolution.** One PR with 3 atomic commits: (1) add wiki-link multi-client test to bridge-matrix, (2) trim the provably-redundant fidelity chains, (3) add wiki-link patterns to the stress synthetic generator. All test-only — zero production code changes.

## 2) Goals

- **G1.** Wiki-link ProseMirror nodes (`atom: true`, `[[target#anchor|alias]]` serialization) have multi-client bridge convergence coverage in `bridge-matrix.test.ts`.
- **G2.** Conversion-fidelity's observer-round-trip + full-stack-chain describe blocks are removed, with a citation to the evidence that proves they test a pass-through.
- **G3.** The stress test synthetic markdown generator includes `[[...]]` wiki-link patterns so atom-type nodes are exercised under load.
- **G4.** Ship as one PR, 3 atomic commits, each passes `bun run check`.

## 3) Non-goals

- **[NEVER] NG1:** Fixing the `resolved` attribute lossiness through the markdown bridge. UI-only, computed at render time (Agent B GAP 2).
- **[NOT NOW] NG2:** Adding Playwright E2E coverage for wiki-links. Wrong tier — bridge invariants are tested at the integration level.
- **[NOT NOW] NG3:** Mechanical enforcement of S7 policy (CI check for multi-client tests when observers.ts changes). Track as XQ1 in PROJECT.md.
- **[NOT NOW] NG4:** Adding wiki-link content to the fuzz harness (`observers.fuzz.test.ts`). Fuzz operates on synthetic markdown; adding `[[...]]` to the fuzz grammar is a separate scope from the stress synthetic generator.

## 4) Personas

- **P1 — Engineer modifying wiki-link extension code.** Gets: multi-client regression test that catches bridge drift before it ships.
- **P2 — Engineer running `bun run check`.** Gets: ~18s faster feedback loop.
- **P3 — Future stress test reviewer.** Gets: atom-type nodes in the load test, not just text/lists/code.

## 5) Requirements

| Priority | Requirement | Acceptance criteria |
|---|---|---|
| **Must** | R1 — Multi-client wiki-link bridge test | New test in `bridge-matrix.test.ts` multi-client describe block (line 459+). Client A inserts a `wikiLink` node with `{target: 'test-page', anchor: 'Heading', alias: 'Display'}` into XmlFragment. Client B polls `ytext.toString()` for `[[test-page#Heading\|Display]]`. `assertClientsConverged(clientA, clientB)` passes. Test uses the most complex variant (target + anchor + alias) since simpler variants are strict subsets. |
| **Must** | R2 — Conversion-fidelity trim | Delete the `describe('observer round-trip: ...')` block (line 208-252) and `describe('full-stack chain: ...')` block (line 256-301) from `conversion-fidelity.test.ts`. **Also remove the now-unused `setupObservers` import at line 20** (only called inside the deleted blocks — biome's `noUnusedImports` will fail otherwise). **Also update the file header comment (lines 6-9)** which enumerates all 4 conversion tiers — remove references to tiers 3 and 4. Add a block comment at the deletion site: `// Observer round-trip and full-stack chain blocks removed 2026-04-12. // Layer A (mdManager) === Layer B (Y.Doc observer path) on all 118 constructs // (fidelity-catalog probe, 2026-04-12). These chains tested a proven pass-through. // Remaining blocks (md round-trip, tree round-trip, disk round-trip, agent-as-file-editor) // exercise genuinely distinct code paths.` Verify: `bun run check` passes. Test count drops by 44 (22 constructs × 2 blocks). CI wall-clock for `test:conversion` drops by ~18s. |
| **Must** | R3 — Wiki-link patterns in stress synthetic generator | Add a new block type to `generateMarkdown()` in `synthetic.ts` (line 130+) that emits `[[page-name-N]]` and `[[page-name-N#section\|Alias N]]` patterns. Integrate into the existing block-rotation at ~5% frequency (every ~20 lines). When `unicode: true`, emit `[[页面-N#セクション\|エイリアス]]` variants. Verify: generated markdown contains `[[` patterns (simple grep assertion in an existing or new unit test, or just visual inspection during implementation). |
| **Must** | R4 — 3 atomic commits, each passes `bun run check` | Commit 1: TQ1 (wiki-link multi-client test). Commit 2: S2 (fidelity trim). Commit 3: TQ13 (synthetic generator). Order by: new coverage first, then trim, then generator enrichment. Each commit independently green. |
| **Should** | R5 — Wiki-link test helper is reusable | Extract `appendWikiLinkToFragment(client, target, anchor?, alias?)` helper at the top of `bridge-matrix.test.ts` (matching the existing `appendParagraphToFragment` naming convention). Creates a `wikiLink` ProseMirror node and inserts it into the client's XmlFragment. Reusable for future atom-node multi-client tests. |
| **Should** | R6 — Second test case: mixed content (text + wiki-link in same paragraph) | Add a second multi-client test where Client A inserts a paragraph containing text + wiki-link + text (e.g., `"See [[Page#Section\|here]] for details."`), and Client B verifies convergence. This catches the atom-node-adjacent-to-text merge scenario that the isolated-insertion test (R1) misses. The `atom: true` wiki-link node has different Yjs encoding from text runs — merging concurrent edits to the same paragraph containing both is a distinct code path. |

## 6) Current state

### bridge-matrix.test.ts multi-client block (line 459-592)

5 tests, all using plain text markers (`'CLIENT-A-WYSIWYG-MARKER'`, `'CLIENT-B-SOURCE-MARKER'`, `'SERVER-AGENT-CONTENT'`). Zero wiki-link or other atom-node content. Tests cover: WYSIWYG→source propagation, source→WYSIWYG propagation, simultaneous cross-mode, typing-defer bypass, and agent+two-client coexistence.

### conversion-fidelity.test.ts (6 describe blocks)

1. `markdown round-trip` (line 168) — **KEEP** (tests mdManager parse/serialize)
2. `tree round-trip` (line 191) — **KEEP** (tests updateYFragment/yXmlFragmentToProsemirrorJSON)
3. `observer round-trip` (line 208) — **DELETE** (proven pass-through per fidelity catalog)
4. `full-stack chain` (line 256) — **DELETE** (proven pass-through per fidelity catalog)
5. `disk round-trip` (line 305) — **KEEP** (tests persistence + onLoadDocument + file watcher)
6. `agent-as-file-editor` (line 376) — **KEEP** (tests real integration path)

### synthetic.ts (line 130+)

Block types in the rotation: headings (h2), paragraphs, bullet lists, code blocks, trailing paragraphs. No inline marks (bold/italic/links), no atom nodes (wiki-links, images), no block quotes.

## 7) Decision log

| ID | Decision | Type | Resolution | Rationale |
|---|---|---|---|---|
| D1 | Use the most complex wiki-link variant (`[[target#anchor\|alias]]`) in R1 | T | LOCKED | Simpler variants are strict subsets. Agent B confirmed parse/serialize is symmetric for all content attrs. If the complex variant converges, simpler ones do too. |
| D2 | Delete observer-round-trip + full-stack-chain (not just skip/comment) | T | LOCKED | The fidelity catalog's Layer A = Layer B finding is structural, not empirical — it holds by construction. Commenting out would imply they might be re-enabled. Deletion with citation is the honest representation. |
| D3 | Wiki-link synthetic frequency = ~5% of blocks | T | DIRECTED | High enough to exercise atom nodes under stress; low enough not to distort the prose/list/code distribution that the generator was designed to approximate. Implementer can tune. |
| D4 | Commit order: TQ1 → S2 → TQ13 | T | DIRECTED | New coverage first (TQ1 catches any bridge gap before the trim). Trim second (S2 removes known-redundant chains). Generator enrichment last (TQ13 is additive, lowest risk). |
| D5 | R1 test uses `appendWikiLinkToFragment` helper pattern (not raw XmlElement construction) | T | DIRECTED | Matches the existing `appendParagraphToFragment` helper at `bridge-matrix.test.ts:50`. Keeps test code readable. R5 should use the same name (`appendWikiLinkToFragment`, not `insertWikiLink`) for consistency. |
| D6 | No Playwright coverage for wiki-links | P | LOCKED | Bridge invariants are tested at integration tier. Playwright is for DOM-binding regressions (click handlers, CSS rendering, React NodeView lifecycle). NG2. |

## 8) Open questions

None. Investigation complete (3 Opus agent reports + direct PR #65 verification).

## 9) Assumptions

| ID | Assumption | Confidence | Verification |
|---|---|---|---|
| A1 | Wiki-link parse/serialize is symmetric for content attrs (target, anchor, alias) | HIGH | Agent B verified at `wiki-link.test.ts:70-98` — 4 fixtures confirmed stable. |
| A2 | `assertClientsConverged` works with wiki-link content (no special-casing needed) | HIGH | The helper compares normalized `ytext.toString()` across clients + calls `assertBridgeInvariant`. Wiki-links serialize to plain text `[[...]]` in Y.Text. No special-casing needed. |
| A3 | ~~Removing 2 describe blocks doesn't break imports~~ **CORRECTED by audit:** The `setupObservers` import at line 20 is ONLY used inside the deleted blocks (lines 215, 263). `agent-as-file-editor` uses `createTestClient` which has its own import in test-harness.ts:35. **The import MUST be removed as part of the S2 trim** — biome `noUnusedImports` will fail otherwise. R2 updated to include this. | HIGH (corrected) | Verified by challenger H1 + auditor M1 (convergent finding). |
| A4 | Stress test synthetic generator is extensible for wiki-links | HIGH | The generator uses a `switch (posInBlock)` over a 20-line block cycle (`BLOCK_SIZE = 20` at synthetic.ts:134). Adding wiki-links means either repurposing an existing position (e.g., one of the empty-line slots at cases 5/10/17) or injecting `[[page-N]]` as inline content within existing paragraph lines at ~5% frequency. Small change either way. (Corrected from "blockIdx % 6" per challenger M2 + auditor L2.) |

## 10) Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R1's wiki-link test reveals a real bridge bug (atom nodes don't converge across clients) | Low | Medium | If it fails, we have a bug to fix — not a test to skip. The conversion-fidelity test passes for wiki-links in single-client mode. Multi-client failure would indicate a concurrent-editing edge case specific to atom nodes. |
| S2 trim removes a chain that catches a regression the fidelity catalog didn't model | Very low | Medium | The catalog's proof is structural (Layer A's output feeds Layer B's input identically). A regression would require the observer bridge to transform content in a way that produces correct single-client output but different content from mdManager alone — structurally impossible given Observer A calls `mdManager.serialize` and Observer B calls `mdManager.parse`. |
| TQ13's wiki-link patterns cause stress test timeouts | Very low | Low | Wiki-links serialize to short strings (`[[page-N]]` is 12 chars). Adding them at 5% frequency adds negligible content volume. If timeouts occur, reduce frequency. |
| TQ13 changes deterministic output of `generateMarkdown()` — stress test reproducibility shift | Low | Low | The generator is designed for deterministic output (synthetic.ts:5). Changing it alters what every affected line produces. Stress tests assert convergence (not content), so no snapshot/golden-file breakage expected. **Pre-impl check:** grep for any test that compares generated output against a stored reference. If found, update the reference in the same commit. |

## 11) In Scope

- **Files touched:**
  - `packages/app/tests/integration/bridge-matrix.test.ts` — add 1-2 test cases + helper function in multi-client describe block
  - `packages/app/tests/integration/conversion-fidelity.test.ts` — delete 2 describe blocks (~100 lines), add citation comment
  - `packages/app/tests/stress/synthetic.ts` — add wiki-link block type to `generateMarkdown()`
- **Zero production files modified.**
- **PR:** 3 atomic commits (TQ1 → S2 → TQ13), each independently passes `bun run check`.

## 12) Future work

### Explored
- **Wiki-link `resolved` attribute lossiness** (NG1) — Agent B GAP 2. `parseMarkdown` hardcodes `resolved: false`; `renderMarkdown` doesn't encode it. UI-only attr computed at render by `WikiLinkView`. No data loss. Optional cleanup: exclude `resolved` from ProseMirror attributes entirely.

### Identified
- **S7 policy enforcement mechanism** (NG3 / XQ1) — Should CLAUDE.md policy have mechanical backing (CI lint that checks for multi-client tests when observers.ts changes)? Promote if a second violation occurs.
- **Wiki-link fuzz grammar** (NG4) — Add `[[...]]` to the fuzz harness's operation grammar so randomized operations include wiki-link insertion/deletion. Separate from stress synthetic generator.

### Noted
- **Backlinks panel component tests** — Agent B GAP 5. Polling component at `BacklinksPanel.tsx` has no React Testing Library coverage. Data source is tested at integration level. Low risk.
- **MCP tool unit tests** — Agent B GAP 3. 4 tools are thin HTTP proxies. Underlying endpoints tested. Low risk.

## 13) Agent constraints

- **SCOPE:**
  - `packages/app/tests/integration/bridge-matrix.test.ts` — add test(s) + helper in the `describe('multi-client sync')` block (line 459+). Follow existing patterns: `createTestClient(server.port, 'test-doc')`, `pollUntil`, `assertClientsConverged`.
  - `packages/app/tests/integration/conversion-fidelity.test.ts` — delete `describe('observer round-trip')` (lines 208-252) and `describe('full-stack chain')` (lines 256-301). Add block comment citing the fidelity catalog evidence. Do NOT delete any other describe block.
  - `packages/app/tests/stress/synthetic.ts` — add wiki-link block type to `generateMarkdown()` at ~5% rotation frequency. Include both `[[page-N]]` and `[[page-N#section|Alias N]]` variants. Unicode variant when `unicode: true`.
- **EXCLUDE:**
  - ALL production source files. Zero changes to `packages/server/src/`, `packages/app/src/`, `packages/core/src/`, `packages/cli/src/`.
  - `packages/app/tests/stress/observers.fuzz.test.ts` — fuzz grammar is NG4.
  - `packages/app/tests/integration/test-harness.ts` — do NOT modify shared harness infrastructure.
  - Observer code (`observers.ts`) — no behavioral changes.
  - Playwright E2E files (`*.e2e.ts`) — NG2.
- **STOP_IF:**
  - R1's wiki-link multi-client test FAILS — this means there's a real bridge bug with atom nodes under multi-client editing. Do not skip or weaken the test. Report the failure and investigate.
  - S2 trim causes `bun run check` to fail on a remaining test — means a describe block we kept depends on something the deleted blocks set up. Investigate the shared state before proceeding.
  - TQ13's wiki-link patterns cause stress test timeouts — reduce frequency before removing the patterns.
- **ASK_FIRST:**
  - Adding any new test FILE (vs adding to existing files).
  - Modifying the conversion-fidelity CONSTRUCTS array.
  - Changing the stress test tier timeouts.
  - Adding any production code changes.
