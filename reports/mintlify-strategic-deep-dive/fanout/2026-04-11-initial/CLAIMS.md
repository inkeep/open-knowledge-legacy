# Claim Inventory: mintlify-strategic-deep-dive

**Consolidation date:** 2026-04-11
**Sources:** 4 fanout sub-reports + 21 evidence files
**Total claims:** 42 (31 CONFIRMED, 7 INFERRED, 3 UNCERTAIN, 1 NOT FOUND)

---

## Claims by Dimension

### D1: Execution Reality

| ID | Claim | Confidence | Source sub-report | Primary source |
|---|---|---|---|---|
| D1.1 | 20+ product improvements shipped in 9-day window (Apr 2–11) | CONFIRMED | execution-refresh/E1 | Mintlify changelogs Apr 3 + Apr 10 |
| D1.2 | KB Agent soft-launched to customers March 22 (not internal-only) | CONFIRMED | execution-refresh/E2 | Blog CTA: "sign up and try it" |
| D1.3 | Trieve acquired July 24, 2025 (not Dec 2024) | CONFIRMED | execution-refresh/E4 | GlobeNewswire press release |
| D1.4 | Context-1 is Chroma's model, not Trieve's | CONFIRMED | execution-refresh/E4 | MarkTechPost, Chroma Context-1 article |
| D1.5 | Pro plan pricing $250/month (not $300) | CONFIRMED | execution-refresh/E1 | mintlify.com/pricing |
| D1.6 | ChromaFs remains internal infrastructure | CONFIRMED | execution-refresh/E3 | npm/PyPI/GitHub negative searches |
| D1.7 | Helicone 0 of 4 announced integration areas materialized | CONFIRMED | execution-refresh/E4 | helicone.ai status + GitHub activity |
| D1.8 | "AI knowledge infrastructure" positioning is aspirational | INFERRED | execution-refresh/E1 | Shipped product analysis: docs-as-code features only |
| D1.9 | ChromaFs HN post 409 points | CONFIRMED | execution-refresh/E6 | HN item #47618223 |
| D1.10 | External sentiment net positive, no high-profile departures | INFERRED | execution-refresh/E6 | HN, HubSpot migration, Wing VC ET30 |

### D2: Write-Path Architecture

| ID | Claim | Confidence | Source sub-report | Primary source |
|---|---|---|---|---|
| D2.1 | Three write channels: Workflows, KB Agent, Agent Job API | CONFIRMED | write-path/W1+W2+W3 | Mintlify docs + blog |
| D2.2 | All run Daytona Docker + OpenCode + Opus 4.6 | CONFIRMED | write-path/W1 | Daytona docs, Mintlify Opus 4.6 blog |
| D2.3 | Sandbox: 1 vCPU, 1 GB RAM, 3 GB disk, no external network | CONFIRMED | write-path/W1 | Daytona limits docs |
| D2.4 | PRs attributed to "mintlify[bot]" | CONFIRMED | write-path/W1 | Mintlify GitHub deploy docs |
| D2.5 | KB Agent same infrastructure as Workflows, different trigger | CONFIRMED | write-path/W2 | KB Agent blog: "same stack behind Workflows" |
| D2.6 | Agent Job API: Enterprise-only REST, natural language input | CONFIRMED | write-path/W3 | Mintlify API docs |
| D2.7 | 6 of 7 co-creation primitives PARTIAL or better | CONFIRMED | write-path/W4 | Composite assessment from W1-W3 evidence |
| D2.8 | Per-edit attribution structurally limited by git model | CONFIRMED | write-path/W4 | MDX-in-git architecture analysis |
| D2.9 | Bidirectional MCP Model A: 4–8 weeks engineering | INFERRED | write-path/W5 | Component delta analysis |
| D2.10 | No public signals from leadership about bidirectional MCP | NOT FOUND | write-path/W5 | Blog, Twitter, HN negative search |
| D2.11 | Business-case friction is the primary gate, not engineering | INFERRED | write-path/W5 | Trust, quality, competitive moat analysis |

### D3: Distribution Strategy

| ID | Claim | Confidence | Source sub-report | Primary source |
|---|---|---|---|---|
| D3.1 | skill.md auto-generated per Anthropic's Agent Skills spec | CONFIRMED | distribution-audit/F1 | agentskills.io, Mintlify docs |
| D3.2 | Mintlify hosts agentskills.io but did not author the spec | CONFIRMED | distribution-audit/F1 | github.com/anthropics/skills |
| D3.3 | No centralized mintlify-skills repo | CONFIRMED | distribution-audit/F2 | npm + GitHub negative searches |
| D3.4 | mintlify-claude-plugin has 1 star (22,662× smaller than obsidian-skills) | CONFIRMED | distribution-audit/F2 | GitHub star counts |
| D3.5 | Community ecosystem adversarial (remorses/holocron 535 stars = OSS replacement) | CONFIRMED | distribution-audit/F3 | GitHub repo descriptions |
| D3.6 | Mintlify authored zero of four "agents reading docs" standards | CONFIRMED | distribution-audit/F5 | authorship audit: llms.txt/Howard, CN/IETF, MCP/Anthropic, Skills/Anthropic |
| D3.7 | GitBook matches 2/4 standards, Docusaurus 3/4 via plugins | CONFIRMED | distribution-audit/F5 | GitBook blog, Docusaurus plugin ecosystem |
| D3.8 | Per-site auto-generation = content-level distribution (not format-level) | INFERRED | distribution-audit/F4 | Structural analysis: each site = one skill |

### D4: Business Signals

| ID | Claim | Confidence | Source sub-report | Primary source |
|---|---|---|---|---|
| D4.1 | $21M total raised ($2.8M seed + $18M Series A), no Series B | CONFIRMED | business-audit/B1 | Crunchbase, PitchBook, a16z |
| D4.2 | Post-money valuation $88.4M | CONFIRMED | business-audit/B1 | PremierAlts |
| D4.3 | ~$10M ARR at end-2025, 10× YoY growth | INFERRED | business-audit/B2 | Sacra (vendor-sourced) |
| D4.4 | NRR reportedly 150% | UNCERTAIN | business-audit/B2 | Sacra (vendor-sourced, no independent verification) |
| D4.5 | 12→50+ employees in 18 months | CONFIRMED | business-audit/B3 | Mintlify Year in Review, PitchBook, YC |
| D4.6 | Enterprise AE at $350–420K OTE | CONFIRMED | business-audit/B3 | YC Jobs listing |
| D4.7 | Estimated remaining cash $4–10M | UNCERTAIN | business-audit/B4 | Burn model triangulation |
| D4.8 | Runway ~5–9 months at current burn | UNCERTAIN | business-audit/B4 | Derived from D4.7 + burn model |
| D4.9 | Wing VC ET30 #1 Early Stage | CONFIRMED | business-audit/B1 | Wing VC, BusinessWire |
| D4.10 | Named customers: Anthropic, Microsoft, Coinbase, PayPal, AT&T, etc. | CONFIRMED | business-audit/B2 | mintlify.com/customers |

### D5: Acquisition Integration

| ID | Claim | Confidence | Source sub-report | Primary source |
|---|---|---|---|---|
| D5.1 | Trieve acquired July 24, 2025 (corrected from Dec 2024) | CONFIRMED | execution-refresh/E4 | GlobeNewswire |
| D5.2 | Trieve cloud sunset November 1, 2025 | CONFIRMED | business-audit/B5 | trieve.ai blog |
| D5.3 | Trieve MIT-relicensed post-acquisition | CONFIRMED | business-audit/B5 | trieve.ai blog |
| D5.4 | Helicone announced March 3, 2026 | CONFIRMED | execution-refresh/E4 | Mintlify blog |
| D5.5 | Helicone in maintenance mode | CONFIRMED | execution-refresh/E4 | helicone.ai |
| D5.6 | Helicone was already powering Mintlify pre-acquisition | CONFIRMED | execution-refresh/E4 | Helicone founders' blog |
| D5.7 | Acquisition pattern unusual at Series A scale | INFERRED | business-audit/B5 | M&A benchmark comparison |

---

## Cross-Source Conflicts Resolved

| Topic | Sub-report A | Sub-report B | Resolution |
|---|---|---|---|
| Trieve acquisition date | business-audit: July 2025 | execution-refresh: July 24, 2025 (precise) | Consistent; used precise date |
| Pro plan pricing | business-audit: $250/month | execution-refresh: $250/month | Consistent |
| KB Agent status | business-audit: not addressed | execution-refresh: soft-launched March 22 | No conflict; different scope |
| Runway estimate | business-audit: 5–9 months (from $4-10M/~$550K/mo) | execution-refresh: not addressed | No conflict; different scope |
| Acquisition pattern | business-audit: B5 playbook analysis | execution-refresh: E4 integration status | Complementary — merged into D5 |

No irreconcilable conflicts detected across the four sub-reports.

---

## Coverage Summary

| Dimension | Total claims | CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND |
|---|---|---|---|---|---|
| D1 Execution | 10 | 7 | 2 | 0 | 0 |
| D2 Write-path | 11 | 8 | 2 | 0 | 1 |
| D3 Distribution | 8 | 6 | 2 | 0 | 0 |
| D4 Business | 10 | 7 | 1 | 2 | 0 |
| D5 Acquisitions | 7 | 6 | 1 | 0 | 0 |
| **Total** | **42** **(excl. D6/D7 parent-level)** | **31** | **7** | **3** | **1** |

D6 (Three-Constraint Synthesis) and D7 (Decision Triggers) are parent-level synthesis — not claim-extractable from sub-reports. They are structural frameworks, not factual assertions.
