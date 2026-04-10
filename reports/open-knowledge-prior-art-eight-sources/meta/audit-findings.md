# Audit Findings

**Artifact:** /Users/edwingomezcuellar/reports/open-knowledge-prior-art-eight-sources/REPORT.md
**Audit date:** 2026-04-07
**Total findings:** 8 (3 high, 3 medium, 2 low)

The audit focused on the load-bearing "paper vs implementation" thesis (user-flagged), cross-finding consistency, cherry-picking risk, 1P/3P separation, quantitative claim attribution, and tone-vs-evidence matching.

**Headline finding:** The report's most prominent claim — "ByteRover paper and code diverge on 4 specific points" — is substantially overstated. Direct verification against the cloned byterover-cli repo (same repo the evidence cites) shows that **two of the four claimed divergences are incorrect**. The 5-tier retrieval IS implemented in `query-executor.ts`, and atomic writes ARE implemented via `DirectoryManager.writeFileAtomic()` used throughout `curate-tool.ts`. Only the AKL-weights-disabled finding is a true paper-vs-code divergence. The "24 → 11 tools" finding is real but is a README/marketing-vs-code discrepancy, not a paper-vs-code discrepancy (the evidence file itself acknowledges this in prose but folds it into the "paper" column of the summary table). This materially weakens Executive Summary finding #1, Key Finding #2 ("paper claims must be verified"), and the D9 "methodology lesson" section.

---

## High Severity

### [H] Finding 1: The "5-tier progressive retrieval is not in the code" claim is factually wrong

**Category:** FACTUAL
**Source:** T2 (own/OSS source verification) — /Users/edwingomezcuellar/.claude/oss-repos/prior-art-open-knowledge/byterover-cli
**Location:** REPORT.md Executive Summary finding #1 (line 43); D2 finding "Critical finding" (line 128-132); D9 "Paper vs implementation — a methodology lesson" (line 506-510); evidence file d2-byterover-cli.md lines 186-206, 309.
**Issue:** The report and evidence claim that ByteRover's 5-tier progressive retrieval exists in the paper but not in the code ("single unified pipeline"). This is contradicted by the actual code. The 5-tier strategy is explicitly implemented in `src/server/infra/executor/query-executor.ts` with all five tiers called out by name in both comments and runtime code paths.
**Current text:** "(b) '5-tier progressive retrieval' does not exist in code — the implementation is a single unified pipeline" (REPORT line 43). Evidence file d2 line 188: "Evidence: Subagent investigation: 'The paper mentions 5-tier progressive retrieval but code shows NO explicit 5-tier pattern.'"
**Evidence:** `query-executor.ts:55-60` contains the tier documentation:
```
* Tiered response strategy (fastest to slowest):
* - Tier 0: Exact cache hit (0ms)
* - Tier 1: Fuzzy cache match via Jaccard similarity (~50ms)
* - Tier 2: Direct search response without LLM (~100-200ms)
* - Tier 3: Optimized single LLM call with pre-fetched context (<5s)
* - Tier 4: Full agentic loop fallback (8-15s)
```
and the corresponding code paths at lines 87-139 labeled `=== Tier 0 ===`, `=== Tier 1 ===`, `=== Tier 2 ===`, `=== Tier 3/4 ===`. The supporting `QueryResultCache` (with Jaccard-based `findSimilar()`) lives at `src/server/infra/executor/query-result-cache.ts` and `src/server/infra/executor/query-similarity.ts`. The evidence file only inspected `search-knowledge-service.ts` (the Tier-2 internals), missing the orchestrator file entirely.
**Status:** CONTRADICTED
**Suggested resolution:** Remove the "5-tier retrieval not in code" divergence from the Executive Summary, D2, and D9. Update the evidence file to reflect that the 5-tier architecture is implemented. Revise "only 1 of 4" remaining divergences and rewrite the methodology lesson to be more narrowly scoped (see Finding 3).

---

### [H] Finding 2: The "atomic writes not implemented" claim is factually wrong

**Category:** FACTUAL
**Source:** T2 (OSS source verification) — /Users/edwingomezcuellar/.claude/oss-repos/prior-art-open-knowledge/byterover-cli
**Location:** REPORT.md Executive Summary finding #1 (line 43); D2 finding at line 131 "(c) 'atomic write-to-temp-then-rename' is claimed but code uses direct writeFile"; evidence file d2-byterover-cli.md lines 249-274, 308.
**Issue:** The evidence file claims ByteRover does not implement the paper's atomic write-to-temp-then-rename pattern. Direct verification of the code shows the pattern IS implemented in `DirectoryManager.writeFileAtomic()` and is used extensively by the curation tool (which is the code path the paper §4.1.3 is describing). The evidence only looked at `file-context-tree-writer-service.ts`, which is a secondary code path.
**Current text:** "(c) 'atomic write-to-temp-then-rename' is claimed but code uses direct writeFile" (REPORT line 43).
**Evidence:** `src/server/core/domain/knowledge/directory-manager.ts:214-220`:
```typescript
async writeFileAtomic(filePath: string, content: string): Promise<void> {
  await this.ensureParentDirectory(filePath)
  const tempPath = `${filePath}.tmp`
  await fs.writeFile(tempPath, content, 'utf8')
  await fs.rename(tempPath, filePath)
},
```
`curate-tool.ts` calls `DirectoryManager.writeFileAtomic()` at lines 381, 452, 485, 529, 702, 849, 1073, and multiple other sites — the curation write path (which is the one the paper is referring to when it talks about "Context Tree consistency") is fully atomic. The evidence file's cited path (`file-context-tree-writer-service.ts`) is a different write path used for direct file operations from the agent's write_file tool, not for curation.
**Status:** CONTRADICTED
**Suggested resolution:** Remove the "atomic writes not implemented" divergence from the Executive Summary and D2. Either drop the claim entirely, or qualify it narrowly ("atomic writes are implemented for curation via DirectoryManager.writeFileAtomic, but the direct file-write path in file-context-tree-writer-service.ts uses fs.writeFile without temp+rename").

---

### [H] Finding 3: The "4 out of 11 paper claims diverge" headline is overstated and conflates paper claims with README/marketing claims

**Category:** COHERENCE + FACTUAL
**Source:** L1 (cross-finding contradiction), L4 (evidence-synthesis fidelity), T2 (source verification) + web verification of arxiv:2604.01599
**Location:** REPORT.md Executive Summary finding #1 (line 43); Key Finding #2 (line 62); D2 section lines 128-143; D9 "Paper vs implementation — a methodology lesson" (lines 504-517); evidence table at d2-byterover-cli.md lines 300-317.
**Issue:** Once Findings 1 and 2 above are corrected, only the AKL-weights-disabled divergence remains as a true paper-vs-code discrepancy. The "24 tools" discrepancy is real but is a README/marketing-vs-code issue, not a paper-vs-code issue — the evidence file itself acknowledges this in prose ("The paper doesn't claim 24 explicitly. The 24 number appears to be marketing inflation") but folds it into the "Paper vs Implementation" summary table at line 306 by labeling the paper column `"24" (in marketing)`. The report's Executive Summary then presents all 4 as "paper claims" that diverge. I also verified the paper itself via arxiv.org/html/2604.01599 and it does not mention "24 built-in agent tools." The true delta between the paper and the code is closer to **1 out of ~10 paper-specific claims** (AKL weights), not 4 out of 11.
**Current text:** "Of 11 verifiable paper claims checked against code, 4 do not match reality" (REPORT line 43); "4 out of 11 verifiable architectural claims diverge" (REPORT line 506); "4 out of 11 verifiable claims diverge from implementation" (evidence file line 317).
**Evidence:** Per-claim status after verification:
1. Tool count 24 → 11: real but is README/marketing vs code, not paper vs code
2. 5-tier retrieval: IMPLEMENTED (Finding 1) — no divergence
3. Atomic writes: IMPLEMENTED in curation path (Finding 2) — no divergence
4. AKL weights disabled: VERIFIED as true paper vs code divergence (`W_IMPORTANCE = 0`, `W_RECENCY = 0`, `TIER_BOOST` all 1 in memory-scoring.ts)

The overall "paper vs implementation" framing collapses to: "one load-bearing paper feature (AKL compound scoring) is shipped with zero weights, rendering it effectively disabled; one marketing claim ('24 tools') is inflated vs the code's 11." That's a much more modest finding than the one the report leads with.
**Status:** INCOHERENT (the count conflates two sources) + CONTRADICTED (two of the four claims are wrong)
**Suggested resolution:** Rewrite Executive Summary finding #1, Key Finding #2, and D9 "methodology lesson" to:
- State the real delta as 1 (AKL) + 1 (marketing claim) and stop calling it "4 out of 11 paper claims"
- Keep the AKL finding — that one holds and is valuable
- Downgrade the overall tone of the "paper vs code is a cautionary tale" lesson; the actual lesson is narrower
- Acknowledge that ByteRover's real architecture is closer to the paper than the evidence file claimed
- Consider whether "paper claims must be verified against code" is still a load-bearing recommendation for open-knowledge when the delta is much smaller than reported
- Also fix the chain reaction: Report line 671 ("The wins come from BM25 + structure + LLM-curated entries, NOT from AKL or 5-tier retrieval") is wrong on the 5-tier part — 5-tier IS in the code, and the paper's ablation study shows removing tiered retrieval drops accuracy by 29.4 pp (the single largest ablation impact in the whole paper, per D3 evidence and the paper's Table 6). So the report's claim about what drives the benchmark wins is inconsistent with the paper's own ablation data. The wins very likely DO come partly from tiered retrieval.

---

## Medium Severity

### [M] Finding 4: D10 1P section separation is only partial — D1–D8 "Implications for open-knowledge" subsections embed 1P content inside 3P findings

**Category:** COHERENCE
**Source:** L6 (stance consistency), Phase 2 reader pass
**Location:** REPORT.md lines 112-380 (every D1-D8 finding has an "Implications for open-knowledge" subsection); D10 header at line 533.
**Issue:** The user explicitly requested that the D10 1P analysis be "clearly separated from 3P findings." The report does mark D10 with a header and a parenthetical "(1P analysis — explicitly requested by the user during scoping. Clearly separated from the 3P findings above.)" But every D1-D8 section also contains substantial 1P content under "Implications for open-knowledge" subsections — recommendations like "open-knowledge should adopt X", "open-knowledge should consider Y", plus explicit PQ/XQ/S1-S10 references woven throughout. A reader looking to consume the 3P findings first (what the prior art actually is) has to actively skip over 1P commentary in every section. This isn't ideal for the "explicitly separated" ask.
**Current text:** Example at REPORT line 115: "Open-knowledge should follow the same pattern." Embedded in D1 (Graphify) 3P finding.
**Evidence:** D1 (lines 112-122) contains 3 paragraphs of 1P recommendations, D2 (lines 137-147) contains 3, D3 (lines 161-189) contains ~8 paragraphs of 1P recommendations, D5 (lines 220-248) contains heavy 1P content, etc. The 1P volume in D1-D8 combined is comparable to D10 itself.
**Status:** INCOHERENT with user's stated ask
**Suggested resolution:** Either (a) relocate all "Implications for open-knowledge" content from D1-D8 into D10, keeping D1-D8 purely 3P; or (b) rename D10 to acknowledge it is the *summary* and synthesis of 1P implications, while D1-D8 retain source-specific implications (with a clearer label like "D1 → open-knowledge implications" rather than burying them inside the finding). Option (a) is more aligned with what the user asked for.

---

### [M] Finding 5: Executive Summary point #3 ("obsidian-mind covers ~70% of value") uses a quantitative figure with no derivation in the evidence

**Category:** COHERENCE / L7
**Source:** L7 (inline source attribution), L4 (evidence-synthesis fidelity)
**Location:** REPORT.md Key Findings #3 (line 47), risk section (line 601), plus recurrent references to "~70%".
**Issue:** The "covers ~70% of open-knowledge's value" figure is presented as a concrete risk claim ("obsidian-mind covers ~70% of open-knowledge's value with zero application code"). The evidence file d5-obsidian-mind.md does NOT derive a 70% figure anywhere — it makes a qualitative argument ("achieves much of what open-knowledge wants"). The number appears to be invented at report-write time without a methodology for how "value" was measured or what was included/excluded from the 30% delta. A reader would reasonably ask "70% of what? measured how?" and the evidence doesn't answer.
**Current text:** "obsidian-mind covers ~70% of open-knowledge's value with zero application code" (line 47); "obsidian-mind delivers a lot of open-knowledge's value proposition [...] through pure composition" (line 222); "if obsidian-mind already covers 70% of the value at zero infrastructure cost" (evidence d5 line 32).
**Evidence:** Evidence file d5 contains NO quantitative value-coverage analysis. The 70% figure is only asserted, never derived. The underlying argument (obsidian-mind as positioning risk) is defensible, but the percentage is not.
**Status:** UNVERIFIABLE (number has no provenance)
**Suggested resolution:** Either drop the percentage and replace with qualitative language ("obsidian-mind covers a substantial portion of open-knowledge's value proposition through pure composition"), OR add a footnote that explicitly enumerates which value props obsidian-mind covers and which it doesn't, then calibrate the fraction. Given this is positioned as a Key Finding impacting strategic decisions, precision matters.

---

### [M] Finding 6: The report's claim that AKL and 5-tier are "not load-bearing" contradicts the paper's own ablation study

**Category:** COHERENCE + FACTUAL
**Source:** L4 (evidence-synthesis fidelity), L1 (cross-finding contradiction)
**Location:** REPORT.md lines 671-672 ("The wins come from BM25 + structure + LLM-curated entries, NOT from AKL or 5-tier retrieval"); line 182-183 in evidence d2 ("AKL may not be load-bearing [...] The simpler approach — pure BM25 + structural relations — is what actually wins on benchmarks"); lines 321-328 in evidence d2; cross-referenced against evidence d3 lines 247-261 (the paper's ablation study).
**Issue:** The report's "Known confidence gaps" section (line 671) states: "The wins come from BM25 + structure + LLM-curated entries, NOT from AKL or 5-tier retrieval." But the evidence file d3 reports the paper's ablation study at line 253-256: removing tiered retrieval drops accuracy by 29.4 points — the single largest ablation impact in the paper. The paper literally tested "w/o Tiered Retrieval → 63.4 vs BYTEROVER Full 92.8" as the dominant contributor. The report's evidence contradicts the report's conclusion.
**Current text:** "The wins come from BM25 + structure + LLM-curated entries, NOT from AKL or 5-tier retrieval" (line 671).
**Evidence:** d3 evidence line 253:
```
| w/o Tiered Retrieval | 63.4 | −29.4 |
```
Combined with Finding 1 (5-tier IS implemented), this means tiered retrieval is both in the code AND is the largest contributor to benchmark performance per the paper's own ablation. The "wins don't come from 5-tier" claim in the report is directly contradicted by the paper's ablation numbers that the same report cites elsewhere.
**Status:** INCOHERENT (conclusion contradicts cited evidence)
**Suggested resolution:** Rewrite line 671 to: "The AKL compound-score ranking is not doing the work (weights set to 0) — but the tiered retrieval architecture IS load-bearing per the paper's own ablation study (removing it drops accuracy by 29.4 points)." Relate this to the corrected narrative in Finding 3.

---

## Low Severity

### [L] Finding 7: Minor quantitative/proper-noun imprecisions

**Category:** FACTUAL
**Source:** T4/T5 (web verification), T2 (source verification)
**Location:** Multiple
**Issue:** Several small numeric or spelling errors that do not change the report's conclusions but a careful reader might catch:
1. **"LoCoMo (4 categories, 1,982 questions)"** (d3 evidence line 213) — official LoCoMo has 1,986 questions, not 1,982. Report doesn't repeat the exact number, so low impact.
2. **"HonCho"** — the real competitor is spelled "Honcho" (one capital letter, from Plastic Labs / plasticlabs.ai). The report and d3 evidence file consistently write "HonCho". Not material but indicates the authors didn't cross-check spelling against the actual vendor's name.
3. **"3.4K stars" for Graphify** — actual star count as of 2026-04-07 is 3,536 (not 3.4K). The rounding is fine but the forks count in evidence "321" is 340 as of today. Minor drift.
4. **"5,941 LOC across 16 modules"** for Graphify's Python package — actual count: 5,941 LOC across 19 `.py` files in the `graphify/` package directory. The 5,941 LOC number is right; "16 modules" is slightly low (19 .py files).
5. Report line 518 references "Letta, Letta" (duplicated) in the out-of-scope list — typo.
**Status:** STALE (stars) and minor imprecision
**Suggested resolution:** Fix HonCho → Honcho globally (across REPORT.md + d2 + d3 evidence). Update fork counts if authors care about precision. Fix "Letta, Letta" duplicate. The LoCoMo question count and "16 modules" are in evidence only, low priority.

---

### [L] Finding 8: "Paper claims 18 LLM providers, code has 19" is not actually a paper claim

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Evidence d2 line 312
**Issue:** The discrepancy table row `| LLM providers | 18 mentioned | 19 in registry | ✓ Match |` includes "18 mentioned" in the Paper column, but the ByteRover paper does not make a load-bearing count claim about the number of LLM providers — it's an implementation detail. This row is essentially noise in the discrepancy analysis and dilutes the signal in the "11 verifiable claims" denominator that the "4 out of 11" headline is computed against.
**Current text:** Row in the d2 summary table.
**Evidence:** The paper's focus is on the memory architecture, not the provider abstraction layer. Counting this in the 11 claims inflates the denominator and makes the 4/11 statistic noisier.
**Status:** INCOHERENT (not a real "paper claim")
**Suggested resolution:** When revising the paper-vs-code analysis per Findings 1-3, drop this row from the discrepancy table. It adds noise.

---

## Confirmed Claims (summary)

The following claims were spot-checked and verified as accurate:

**Quantitative/external claims:**
- ByteRover paper arxiv:2604.01599 exists and matches the title cited — CONFIRMED via arxiv.org
- LoCoMo 96.1% overall for ByteRover — CONFIRMED via paper Table 3
- HonCho 89.9% on LoCoMo — CONFIRMED via paper Table 3 (93.2-84.0-77.1-88.2-89.9 breakdown)
- LongMemEval-S 92.8% — CONFIRMED via paper Table 4
- "6.2 points over HonCho" — 96.1 - 89.9 = 6.2 ✓
- Ablation numbers: -29.4 (no tiered), -0.4 (no OOD), -0.4 (no relation graph) — CONFIRMED via paper Table 6
- DeepWiki launch April 2025 — CONFIRMED (April 27, 2025 per Cognition blog)
- GitHub star counts (gh api): Graphify 3,536 (report says 3.4K ≈ ok), byterover-cli 4,319 (4.3K ✓), obsidian-mind 1,302 (1.3K ✓), orca 495 (495 ✓)

**OSS source verifications (T2):**
- ByteRover has exactly 11 tools in TOOL_REGISTRY (tool-registry.ts) — CONFIRMED
- `W_IMPORTANCE = 0`, `W_RECENCY = 0`, `TIER_BOOST` all 1 in memory-scoring.ts — CONFIRMED (the single real paper-vs-code divergence that survives)
- Graphify SKILL.md is 1,214 lines — CONFIRMED
- Graphify Python package is 5,941 LOC — CONFIRMED
- Orca repo is 495 stars, 88 releases, MIT license, TypeScript — CONFIRMED
- Karpathy gist ID 442a6bf555914893e9891c11519de94f exists — CONFIRMED
- Garry Tan GBrain gist exists at the cited URL — CONFIRMED (not independently re-fetched; external link in report)

**Structural/logical claims:**
- The three-layer Karpathy architecture (raw / wiki / schema) is faithfully extracted from the gist — CONFIRMED
- The "Obsidian is the IDE / LLM is the programmer / wiki is the codebase" Karpathy quote is verbatim — CONFIRMED
- obsidian-mind has zero application code (CLAUDE.md + settings.json + hooks + agents only) — CONFIRMED per evidence file inspection
- ByteRover's 2-tool MCP surface (`brv-query`, `brv-curate`) — CONFIRMED via the cloned repo
- ByteRover uses sequential per-project FIFO task queue (not CRDT) — CONFIRMED
- DeepWiki is read-only with a 6-day cooldown on refresh — CONFIRMED by report author's direct fetch

---

## Unverifiable Claims

- **"Graphify 71.5x token reduction"** — the report appropriately caveats this as vendor-benchmark. Not re-verified (would require running the benchmark on an independent corpus).
- **Garry Tan's "7,471 files, 2.3GB brain, git choking"** — lifted verbatim from the GBrain gist; source confirmed but the underlying technical claim (git scales poorly past 5K files) was not independently reproduced. It is directionally plausible and matches anecdotal reports.
- **Cognition's Devin "4x faster, 67% PR merge rate"** — report correctly flags this as "Cognition's own numbers, not independently verified". No action needed.
- **obsidian-mind's "70% of value" claim** — see Finding 5 above; unverifiable because no derivation exists.

---

## Notes on scope

- The audit did not re-verify the GBrain spec (D6) at the Gist — the evidence cites verbatim extraction and nothing in the gist interpretation looked off.
- The audit did not clone or deep-inspect obsidian-mind or orca beyond what the evidence files describe; the evidence is generally well-cited with specific file paths.
- The audit spent disproportionate effort on D2/D3 because the "paper vs code" thesis is load-bearing for multiple sections of the report, and because the user flagged it as the most important claim to verify.
- Cherry-picking risk assessment: the report generally steelmans its sources (each section has honest "Implications" that credit strengths and name trade-offs). The main failure is in the inverse direction — the report was TOO quick to find flaws in ByteRover (Findings 1-3), not too slow. No evidence of cherry-picking against the sources in favor of open-knowledge.
- Tone assessment: the report's tone mostly matches the evidence strength, with one notable exception — the "4 out of 11 paper claims diverge" headline reads as high-confidence when the underlying evidence has clear gaps (Findings 1-2 were missed in the source investigation). Once that's corrected, tone and evidence will align.
