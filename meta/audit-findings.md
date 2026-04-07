# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/PROJECT.md
**Audit date:** 2026-04-02
**Total findings:** 18 (4 high, 8 medium, 6 low)

---

## High Severity

### [H1] Walking skeleton statement contradicts S2's placement in Now

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Phasing rationale section (line 278) vs Now stories (S2, line 176)
**Issue:** The walking skeleton test says: "an IC has a rich markdown editor where their AI agent co-creates knowledge in real-time with presence, and everything auto-saves to git. That's a usable, differentiated product **even without source toggle**, polished navigation, or team features." But S2 (source toggle) IS in Now. This creates a contradiction: if the walking skeleton works without S2, then S2 is not walking-skeleton-essential, and its presence in Now needs different justification. The phasing rationale positions S2 as "competitive necessity" (developer-expected) -- but the walking skeleton paragraph undermines this by calling out S2 as something the product works without.
**Current text:** "That's a usable, differentiated product even without source toggle, polished navigation, or team features."
**Evidence:** S2 is listed under Now with a rationale about competitive necessity and TQ9 promotion. The walking skeleton test is supposed to validate that Now delivers standalone value -- but it validates by excluding an item that is IN Now.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) rewrite the walking skeleton test to include S2 as part of the standalone value ("an IC has a rich markdown editor with source toggle..."), OR (b) move S2 to Next with a clear promotion trigger, and strengthen the walking skeleton argument around the remaining Now stories. The current text tries to have it both ways -- S2 is in Now because it's competitively essential, but the skeleton works without it.

---

### [H2] Confluence "3x" price hike claim is not supported by available evidence

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** evidence/worldmodel-key-findings.md line 28
**Issue:** The worldmodel evidence file states "October 2025 price hike (some contracts 3x'd)." Web search shows Atlassian's October 2025 Cloud pricing changes were in the 5-10% range depending on tier, not 300%. No source found for "3x" pricing. This may conflate the October 2025 cloud price adjustment with the earlier 2023 Data Center pricing changes (which were larger) or with specific contract renegotiation scenarios. The claim is used to justify a competitive market opening.
**Current text:** "October 2025 price hike (some contracts 3x'd), widely-criticized editor, poor search. Teams migrating to Notion then hit governance/permissions at scale. Active replacement market."
**Evidence:** Multiple sources (Adaptavist, E7 Solutions, Valiantys, Atlassian Community) describe October 2025 changes as ~5-10% increases, not 3x.
**Status:** CONTRADICTED
**Suggested resolution:** Verify the "3x" claim against the actual research report. If sourced from specific enterprise contract renegotiations (e.g., Server→Cloud forced migration), add that conditionality. If not verifiable, downgrade to "significant price increases" or cite the actual percentages. The market-opening claim doesn't depend on 3x specifically -- real dissatisfaction exists at 5-10% too.

---

### [H3] "PADLOCK study (CHI 2024): 14/14 users chose isolation" is unverifiable from public sources

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** CC4 section (line 141), evidence/auto-persistence-architecture.md
**Issue:** The artifact cites "PADLOCK study (CHI 2024): 14/14 users chose isolation over transparent merge when given the choice" in multiple locations. Web search does not surface a CHI 2024 paper with this name or finding. PADLOCK appears in collaborative editing literature as a lock-level acronym, not as a named study with this specific result. This claim is load-bearing -- it justifies the entire drafts-as-isolation-primitive design decision in CC4.
**Current text:** "PADLOCK study (CHI 2024): 14/14 users chose isolation over transparent merge when given the choice"
**Evidence:** ACM Digital Library search, CHI 2024 proceedings, and general web search yield no paper matching "PADLOCK" with a 14/14 isolation preference finding. The claim may originate from an OpenDesign research report that synthesized multiple sources under this label, but the CHI 2024 attribution is not verifiable.
**Status:** UNVERIFIABLE
**Suggested resolution:** Trace this claim back to the OpenDesign report that originated it (referenced as OpenDesign research). Verify the actual study name, venue, and finding. If it's a synthesis label from the OpenDesign research (not a published paper title), correct the attribution. The isolation preference finding itself may be real but needs proper sourcing.

---

### [H4] CC4 (Editing contexts) is a design document, not a cross-cutting concern

**Category:** COHERENCE
**Source:** L6 (Stance consistency)
**Location:** CC4 section (lines 105-161)
**Issue:** CC4 runs ~57 lines and contains detailed UX specifications (when drafts activate, what it looks like, competitive analysis of 5 competitors, transfer from OpenDesign). Cross-cutting concerns per the /projects template are "dependencies that thread through multiple stories -- not stories themselves, but infrastructure, patterns, or constraints that affect multiple stories. Each with: what it is, which stories it touches, how it constrains them." CC4 is performing a different function: it is a design document for the editing context model. Compare to CC1 (11 lines), CC2 (15 lines of core description), CC3 (3 lines). CC4's length and detail level is inconsistent with the other CCs. The product decisions embedded in CC4 (PQ9, PQ10, PQ11) should be in the Items table (they are) but the detailed UX and competitive analysis belongs in evidence/ or a separate design artifact.
**Current text:** Full CC4 section (lines 105-161)
**Evidence:** CC1 is ~10 lines describing CRDT namespaces. CC2 is ~15 lines on three-tier persistence. CC3 is 3 lines on the web UI shell. CC4 is ~57 lines including competitive analysis, UX mock-ups, and transferred research findings.
**Status:** INCOHERENT
**Suggested resolution:** Extract the competitive analysis, UX specification, and OpenDesign transfer into an evidence file (e.g., `evidence/editing-context-design.md`). Reduce CC4 to the pattern of other CCs: what the concern is (editing contexts: main, draft, proposal -- each a CRDT namespace with git branch underneath), which stories it touches (S1, S4, S5, S6), and how it constrains them (MCP routing, persistence pipeline parameterization, presence scoping).

---

## Medium Severity

### [M1] kepano/obsidian-skills star count is imprecise

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** evidence/worldmodel-key-findings.md line 13
**Issue:** The worldmodel evidence file claims "19K stars." Web search shows the count varies by snapshot date in 2026 -- sources report 13.9K, 15.6K, 18.2K, and 18.6K at different times. None reach 19K. The claim is approximately right but overstated by the highest available count.
**Current text:** "CEO maintains kepano/obsidian-skills, 19K stars"
**Evidence:** Multiple web sources show the repo between 13.9K-18.6K stars in early 2026.
**Status:** INCOHERENT
**Suggested resolution:** Use "~18K stars" or "15K+ stars" with a date qualifier. The directional point (popular, well-adopted) stands regardless of the exact number.

---

### [M2] Evidence file story numbering diverges from PROJECT.md

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** evidence/story-decomposition-draft.md vs PROJECT.md stories section
**Issue:** The evidence file lists 8 stories (S1-S8) with different numbering than PROJECT.md. For example, evidence S2 is "organize articles in a navigable project structure" (which became S3 in PROJECT.md). Evidence S7 is "flip between rich editing and raw markdown" (which became S2 in PROJECT.md). Evidence S8 (skills) became S7. The evidence file was clearly an earlier draft -- which is fine -- but the numbering disconnect makes cross-referencing confusing. More importantly, evidence/story-decomposition-draft.md references an S5 ("agent can discover and understand KB structure") that was subsumed into S4 in PROJECT.md without a trace note.
**Current text:** Evidence file has S1-S8 with different numbering; PROJECT.md has S1-S7 plus S-L1 through S-L6.
**Evidence:** Side-by-side comparison shows the mapping: evidence S1=PROJECT S1, evidence S2=PROJECT S3, evidence S3=PROJECT S5, evidence S4=PROJECT S4, evidence S5=subsumed, evidence S6=PROJECT S6, evidence S7=PROJECT S2, evidence S8=PROJECT S7.
**Status:** INCOHERENT
**Suggested resolution:** Add a note to the evidence file header indicating it's a pre-refinement draft with different numbering. OR update evidence file numbering to match PROJECT.md final numbering. The subsumed S5 (agent discovery) should be noted somewhere -- it was a conscious merge decision, not a lost story.

---

### [M3] Items table has 5 Open items -- resolution completeness gate not met

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Items table (PQ2, PQ9, XQ1, TQ5, TQ7)
**Issue:** The /projects skill requires: "Every P0 item in the Items table must be resolved (Decided, Parked with context, or Assumed with confidence + verification plan)." Five P0 items remain Open: PQ2 (flip UX model), PQ9 (draft model default), XQ1 (MCP protocol design), TQ5 (OSS license), TQ7 (shadow manifest). The Phase 3 output claims phasing is complete, but the resolution completeness gate requires these to be resolved before phasing. The changelog confirms "Phase 3 complete" despite these open items.
**Current text:** PQ2, PQ9, XQ1, TQ5, TQ7 all have Status: Open
**Evidence:** The /projects skill protocol states: "Every P0 item in the Items table must be resolved (Decided, Parked with context, or Assumed with confidence + verification plan). If P0 items remain Open or Exploring, return to Phase 2 to resolve them before phasing."
**Status:** INCOHERENT
**Suggested resolution:** Either (a) resolve each Open P0 item to Decided/Parked/Assumed, or (b) downgrade to P2 with triggers, or (c) acknowledge in the phasing rationale that the resolution gate was intentionally bypassed and explain why (e.g., "these items will be resolved during story specification, not project decomposition"). The current state violates the process's own quality gate.

---

### [M4] Two items also remain in "Exploring" status

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Items table (TQ2, TQ3, TQ4)
**Issue:** TQ2 (rich markdown editor technology choice), TQ3 (markdown round-trip fidelity), and TQ4 (editor framework selection) are in "Exploring" status. Per the resolution completeness gate, these should be resolved before Phase 3. TQ2 and TQ4 overlap significantly (both about editor framework) -- this may indicate they should be one item. TQ3 is explicitly handled as a "gating risk" with a spike approach, which could be expressed as "Assumed (medium confidence, spike validates)" rather than Exploring.
**Current text:** TQ2: "Exploring", TQ3: "Exploring", TQ4: "Exploring"
**Evidence:** Same resolution completeness gate as M3.
**Status:** INCOHERENT
**Suggested resolution:** TQ2 and TQ4 appear to be the same item (editor framework choice) -- merge them. TQ3 should be "Assumed (medium confidence)" with the spike as verification plan (the artifact already describes this risk model). All should advance to Decided, Parked, or Assumed per the gate.

---

### [M5] Cross-cutting concerns don't explicitly list which stories they affect

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** CC1, CC2, CC3, CC4 sections
**Issue:** The /projects template requires each cross-cutting concern to specify "which stories it touches, how it constrains them." CC1 mentions editor and MCP server but not specific story IDs. CC2 doesn't reference any stories by ID. CC3 says "every story renders inside this" but doesn't enumerate. CC4 references PQ9, PQ10, PQ11 (items) but not stories. Meanwhile, the stories DO reference CCs (e.g., S6 says "CC1, CC2, CC4"). The referencing is one-directional -- stories point to CCs, but CCs don't point back to stories.
**Current text:** CC1: "Editor and MCP server both write to Yjs documents..." (no story IDs). CC2: describes three layers (no story IDs). CC3: "Every story renders inside this" (no enumeration).
**Evidence:** /projects template: "Each with: what it is, which stories it touches, how it constrains them."
**Status:** INCOHERENT
**Suggested resolution:** Add story references to each CC. E.g., CC1: "Touches S1, S2, S4, S5, S6. Constrains S4 (MCP writes must go through CRDT), S5 (presence depends on Yjs awareness)." This makes the bidirectional graph navigable from either direction.

---

### [M6] Report references use `/reports/` path that doesn't exist in project directory

**Category:** COHERENCE
**Source:** L7 (Inline source attribution)
**Location:** Items XQ2 (line 61), XQ3 (line 62)
**Issue:** XQ2 references "See /reports/openknowledge-competitive-landscape/" and XQ3 references "See /reports/anthropic-knowledge-infrastructure-positioning/". These reports exist at `/Users/edwingomezcuellar/nick-research/` but not at any `/reports/` path relative to the project. A reader following these references would find nothing.
**Current text:** "See /reports/openknowledge-competitive-landscape/" and "See /reports/anthropic-knowledge-infrastructure-positioning/"
**Evidence:** `ls /Users/edwingomezcuellar/projects/open-knowledge/reports/` yields no directory. Reports found at `/Users/edwingomezcuellar/nick-research/`.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) create symlinks or relative references that resolve, or (b) use absolute paths, or (c) copy/summarize key findings into evidence/ files with proper references. Option (c) is preferred for artifact portability -- evidence/ should be self-contained.

---

### [M7] "16,000+ MCP servers across 10+ registries" may be stale

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** evidence/worldmodel-key-findings.md line 31
**Issue:** The claim "16,000+ MCP servers across 10+ registries" appears to reference a September 2025 snapshot. By early 2026, counts exceed 20,000+. Additionally, "10+ registries" is unspecific -- a Nordic APIs article names 7 specific registries. The directional point (MCP ecosystem is large and growing) holds but the numbers are potentially stale on the day the artifact was written.
**Current text:** "16,000+ MCP servers across 10+ registries"
**Evidence:** Web sources show 16,670 as of September 2025 and 20,000+ as of early 2026. Registry count varies by source.
**Status:** STALE
**Suggested resolution:** Update to "20,000+ MCP servers" or qualify with a date. The claim is in an evidence file (not the main artifact), so staleness is less critical -- but if the evidence is re-used for future decisions, it should reflect current scale.

---

### [M8] "agentskills.io standard (Dec 2025, 30+ adopters)" understates adoption

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** evidence/worldmodel-key-findings.md line 31
**Issue:** The evidence file claims "30+ adopters" for agentskills.io. Web search shows 26+ platform adopters at launch (December 2025) including Claude Code, OpenAI Codex, Gemini CLI, GitHub Copilot, VS Code, Cursor, Roo Code, Amp, Goose, Mistral AI, Databricks, etc. -- and partner-built skills from Canva, Stripe, Notion, Zapier. By April 2026, adoption has grown further. "30+" is approximately right for launch-era, but given the artifact date of 2026-04-02, this is understated.
**Current text:** "agentskills.io standard (Dec 2025, 30+ adopters)"
**Evidence:** Unite.AI and The New Stack report 26+ platform adopters at launch plus partner skills. Ecosystem has grown since December 2025.
**Status:** STALE
**Suggested resolution:** Update the count or add a date qualifier. Minor -- the directional point (widely adopted) is correct.

---

## Low Severity

### [L1] "Semiont is the only conceptual competitor but early-stage alpha" -- Semiont is AI Alliance project, not just "early-stage alpha"

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** Items XQ2 (line 61)
**Issue:** Characterizing Semiont as "early-stage alpha" understates its institutional backing. Semiont is maintained under The AI Alliance (Linux Foundation umbrella), has a GitHub repo with MCP integration, and is positioned as the agent-native wiki standard by a major foundation. "Early-stage alpha" implies a side project. The competitive risk from Semiont is institutional, not just technical maturity.
**Current text:** "Semiont is the only conceptual competitor but early-stage alpha."
**Evidence:** GitHub shows Semiont under The-AI-Alliance organization. InfoWorld coverage describes it as "AI Alliance forges agent-native language, knowledge base." The AI Alliance has institutional weight (IBM, Meta, and others as founders).
**Status:** INCOHERENT
**Suggested resolution:** Recharacterize as "Semiont (AI Alliance/Linux Foundation) is the closest philosophical competitor -- agent-native wiki with MCP integration -- but pre-production with no collaborative editor and no markdown-canonical storage. Institutional backing makes it the one competitor worth monitoring."

---

### [L2] TQ2 and TQ4 are redundant items

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Items table (TQ2, TQ4)
**Issue:** TQ2 is "Rich markdown editor technology choice" listing "TipTap vs BlockNote vs Plate vs Milkdown vs Lexical." TQ4 is "Editor framework selection" listing "TipTap vs BlockNote vs BlockSuite." These are the same decision -- which editor framework to use. Having two items for the same decision creates confusion about which one tracks the resolution.
**Current text:** TQ2: "Rich markdown editor technology choice... TipTap vs BlockNote vs Plate vs Milkdown vs Lexical" and TQ4: "Editor framework selection... TipTap (most mature, MIT core) vs BlockNote (Notion-style, Yjs-first, BSL for advanced) vs BlockSuite (most CRDT-native, AFFiNE, MIT)"
**Evidence:** Both items list overlapping candidates (TipTap, BlockNote) and address the same decision. TQ4 adds BlockSuite and removes Plate/Milkdown/Lexical -- suggesting TQ4 is the refined version of TQ2.
**Status:** INCOHERENT
**Suggested resolution:** Merge into one item. TQ4 appears to be the evolved version with a more focused candidate set. Mark TQ2 as subsumed by TQ4, or delete TQ2.

---

### [L3] AFFiNE license characterization is simplified

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** Items TQ5 (line 60), evidence/worldmodel-key-findings.md
**Issue:** PROJECT.md says "MIT (AFFiNE) most permissive but no SaaS protection." The worldmodel evidence says "AFFiNE: MIT, docs+whiteboards+databases on BlockSuite+Yjs." AFFiNE's licensing is actually mixed: client/editor is MIT, but `packages/backend/server` (the cloud component) uses a different license. The competitive analysis should note this nuance because it's exactly the strategy being evaluated.
**Current text:** "MIT (AFFiNE) most permissive but no SaaS protection"
**Evidence:** GitHub discussion #5947 and AFFiNE's LICENSE file show MIT for the editor/local components, separate license for server/cloud.
**Status:** INCOHERENT
**Suggested resolution:** Add the nuance: "AFFiNE: MIT for editor/local, proprietary license for cloud server. Demonstrates the dual-license strategy where the editor is MIT but the hosted cloud is protected." This is directly relevant to TQ5.

---

### [L4] Phasing rationale for Next is thin compared to Now

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** Phasing rationale section (line 274)
**Issue:** Now phasing rationale is 5 lines with named heuristics and evidence. Next rationale is 1 line: "Navigation/organization (when project structure conventions are resolved -- dependency on PQ7), skills convention (when the core loop proves out -- ecosystem, not product)." No heuristic is named for Next. The /projects template requires naming the heuristic and evidence for each phasing decision.
**Current text:** "Next: S3 + S7 -- organization and ecosystem. Navigation/organization (when project structure conventions are resolved -- dependency on PQ7), skills convention (when the core loop proves out -- ecosystem, not product)."
**Evidence:** /projects template: "Name the heuristic and the evidence for each phasing decision."
**Status:** INCOHERENT
**Suggested resolution:** Name the heuristic. E.g., "Dependency-first: S3 is blocked by PQ7 (project structure conventions, parked). Value-first: S7 (skills alongside articles) has low product complexity but requires the core editing+MCP loop (S1+S4) to be stable before ecosystem value materializes."

---

### [L5] Later stories lack multi-dimensional value articulation

**Category:** COHERENCE
**Source:** L2 (Confidence-prose misalignment)
**Location:** Later stories S-L1 through S-L6 (lines 234-268)
**Issue:** Now and Next stories have full value articulation with intersection reasoning. Later stories have single-line value statements: "Team knowledge bases. The Confluence/Notion replacement story. Monetization trigger." This is acceptable for Later (low-investment phase), but the /projects template uses the same story format for all phases. The inconsistency is minor because Later items are explicitly deferred.
**Current text:** E.g., S-L1 value: "Team knowledge bases. The Confluence/Notion replacement story. Monetization trigger."
**Evidence:** Now stories have 3-4 line value sections with intersection reasoning. Later stories have 1 line each.
**Status:** INCOHERENT
**Suggested resolution:** Acceptable as-is for Later stories at project-grade. If any Later story is promoted, it should be enriched at that time. Optionally add a sentence noting "Later stories are summarized at portfolio-grade; enriched to project-grade when promoted."

---

### [L6] Evidence files are not consistently referenced from the main artifact

**Category:** COHERENCE
**Source:** L7 (Inline source attribution)
**Location:** PROJECT.md vs evidence/ directory
**Issue:** PROJECT.md references 3 of 6 evidence files: `evidence/tiptap-markdown-roundtrip.md` (from TQ3), `evidence/auto-persistence-architecture.md` (from CC2, TQ8). Three evidence files are never referenced from PROJECT.md: `evidence/outcome-mapping-initial.md`, `evidence/worldmodel-key-findings.md`, `evidence/story-decomposition-draft.md`, `evidence/source-of-truth-analysis.md`. These appear to be intermediate working artifacts from the decomposition session. A reader of PROJECT.md would not know they exist.
**Current text:** Only TQ3 and TQ8/CC2 reference evidence files.
**Evidence:** Grep for "evidence/" in PROJECT.md yields 2 references. 6 files exist in evidence/.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) add "See evidence/" references where relevant (e.g., CC1 could reference source-of-truth-analysis.md), or (b) add a "Supporting evidence" section at the bottom of PROJECT.md listing all evidence files with one-line descriptions, or (c) move unreferenced evidence files to `meta/working/` to distinguish final evidence from session artifacts.

---

## Confirmed Claims (summary)

**Factual claims confirmed:**
- BlockNote's markdown export IS named `blocksToMarkdownLossy()` -- confirmed via BlockNote docs and GitHub. The "lossy" characterization is accurate.
- Semiont IS under The AI Alliance and uses W3C Web Annotation -- confirmed via GitHub (The-AI-Alliance/semiont) and InfoWorld coverage.
- Outline IS licensed under BSL 1.1 -- confirmed via GitHub LICENSE file.
- AFFiNE's local editor IS MIT-licensed -- confirmed, though the characterization is simplified (see L3).
- agentskills.io WAS launched December 2025 by Anthropic -- confirmed via multiple sources.
- The MCP ecosystem IS large and growing -- directionally confirmed, though specific numbers are dated (see M7, M8).
- TipTap DOES have bidirectional markdown support with CommonMark compliance -- confirmed via TipTap docs and release notes.
- Karpathy's interest in LLM knowledge bases IS documented -- his 2025 Year in Review references the concept, though a specific April 2026 post titled "LLM Knowledge Bases" was not found in web search (may be very recent or on X/Twitter).

**Structural claims confirmed:**
- Evidence files all have YAML frontmatter with title, type, and created date -- confirmed.
- The Items table uses a unified schema (not separate tracking tables) -- confirmed, no anti-pattern.
- All decisions in "Decided" status have rationale -- confirmed for all 12 Decided items.
- PQ7 (Parked) has a promotion trigger -- confirmed.
- PQ8 (P2 Parked) has a trigger -- confirmed.
- SCR format is present and complete in Strategic context -- confirmed.
- Bet-level non-goals have temporal tags (NEVER, NOT NOW, NOT UNLESS) -- confirmed, well-done.
- Stories in Now use verb-first titles and have value/constraints/lateral/forward sections -- confirmed.

## Unverifiable Claims

1. **"PADLOCK study (CHI 2024): 14/14 users chose isolation"** -- No matching paper found in ACM DL, CHI 2024 proceedings, or general web search. Claim likely originates from an OpenDesign research report synthesis. The underlying user preference finding may be real but the academic citation is not verifiable. (See H3.)

2. **"Karpathy's LLM Knowledge Bases post (April 2, 2026)"** -- No post with this exact title found via web search. Karpathy has discussed knowledge bases and LLMs extensively, and the date matches the project start. The post may exist on X/Twitter (not indexed by web search) or may be paraphrased from a video/thread. The strategic inspiration is plausible but the specific citation is not verifiable.

3. **OpenDesign Report references (Report 11, 12, 13, 44, 45, 46)** -- These are internal reports referenced extensively. They were not audited (out of scope) but their existence is assumed based on the detailed architectural claims transferred from them. If the OpenDesign reports contain errors, those errors propagate into this artifact.

4. **"Confluence dissatisfaction = market opening" at the scale implied** -- Confluence price increases are real, editor criticism is documented, but the claim of an "active replacement market" at scale is characterization, not verified fact. Teams DO migrate, but the claim's strength is not quantified.
