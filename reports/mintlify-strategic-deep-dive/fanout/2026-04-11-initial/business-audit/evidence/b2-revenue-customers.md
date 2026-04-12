# Evidence: Revenue + Customer Reality

**Dimension:** B2 — Revenue + customer reality
**Date:** 2026-04-11
**Sources:** Mintlify blog (2025 Year in Review), Sacra, Latka, Mintlify pricing page, Mintlify careers page, Mintlify customers page, Ferndesk review, Featurebase, BunnyDesk, Mintlify OSS program page, Mintlify X/Twitter

---

## Key sources referenced

- https://www.mintlify.com/blog/2025-year-in-review — Official 2025 review (accessed 2026-04-11)
- https://sacra.com/c/mintlify/ — Sacra company profile (accessed 2026-04-11)
- https://getlatka.com/companies/mintlify.com — Latka profile (accessed 2026-04-11)
- https://www.mintlify.com/pricing — Pricing page (accessed 2026-04-11)
- https://www.mintlify.com/careers — Careers page (accessed 2026-04-11)
- https://ferndesk.com/blog/mintlify-review — Third-party review (accessed 2026-04-11)
- https://www.mintlify.com/oss-program — OSS program details (accessed 2026-04-11)
- https://x.com/mintlify/status/1978850732624560301 — OSS program announcement (accessed 2026-04-11)

---

## Findings

### Finding: ARR trajectory — $1M (2024) → $10M (2025), 10x YoY growth
**Confidence:** INFERRED (high confidence)
**Evidence:** Sacra profile + Mintlify 2025 Year in Review

Sacra estimates $10M ARR at end of 2025, citing 10x YoY growth from $1M at end of 2024. Mintlify's own blog says "scaled from low 7-figures to over 8-figures in ARR" in 2025.

The "low 7-figures" → "over 8-figures" framing is consistent with $1M → $10M but could span $1-3M → $10-15M. The 10x multiple is Sacra's interpretation, widely cited but not directly confirmed by Mintlify.

**⚠️ Source quality note:** Sacra is a respected SaaS research firm but relies on a mix of public data, proprietary models, and interviews. The $10M figure is their estimate, not an audited disclosure. Mintlify's own language ("8-figures") deliberately avoids precision.

**Prior state (from existing landscape research):** The landscape fanout captured "8-figure ARR" — this tightens it to "~$10M" based on the Sacra triangulation.

### Finding: NRR at 150%, enterprise ACVs growing 15x YoY
**Confidence:** INFERRED (moderate confidence)
**Evidence:** Sacra profile

Sacra reports net revenue retention of 150% and enterprise ACV growth of 15x YoY, with mid-market ACVs growing 5x. These are exceptional numbers if accurate — 150% NRR is top-decile for enterprise SaaS (median: ~110%, strong: 120%+).

**⚠️ Source quality note:** These metrics almost certainly come from Mintlify's own disclosure to Sacra. There is no independent verification. Companies self-reporting to SaaS databases have incentive to present favorable metrics. The 150% NRR and 15x enterprise ACV growth are not independently confirmable.

### Finding: Customer count — 10K+ (2025) → 18K+ (April 2026)
**Confidence:** UNCERTAIN
**Evidence:** Mintlify 2025 Year in Review says "10,000+ companies." Mintlify careers page (accessed April 2026) says "18,000+ companies."

The jump from 10K to 18K in ~4 months is 80% growth, which is extraordinary. Possible explanations:
1. The 10K figure was conservative / paid-only; 18K includes free tier
2. Growth genuinely accelerated post-Helicone acquisition
3. The numbers count different things (docs sites vs. organizations vs. team accounts)
4. One or both figures are rounded/aspirational

**⚠️ Vendor-incentive bias:** Both figures are self-reported. "Companies" is undefined — could include free Hobby tier signups, which would inflate the number significantly. No independent verification exists.

### Finding: Named customers span AI leaders, enterprise, and developer tools
**Confidence:** CONFIRMED
**Evidence:** Mintlify.com/customers, case studies, Series A blog, a16z investment announcement, Ferndesk review

Confirmed named customers (with case study pages or named in official materials):
- **AI companies:** Anthropic, Cursor, Perplexity, Scale AI, ElevenLabs
- **Enterprise/Large:** Microsoft, AT&T, PayPal, Coinbase, HubSpot, X (Twitter)
- **Developer tools:** Zapier, Vercel, Pinecone, Replit, Laravel, Resend

The a16z investment page specifically names: ElevenLabs, Anthropic, Pinecone, Cursor, Resend.

**Implications:** The customer list is credibly impressive for a Series A company. Having Anthropic (Claude's creator) and Cursor (AI code editor) as customers signals that the company Mintlify is documenting for is itself in the AI infrastructure space — a self-reinforcing positioning advantage.

### Finding: Revenue concentration signals — NOT FOUND
**Confidence:** NOT FOUND
**Evidence:** No data on top-10 or top-50 customer revenue share exists in any public source.

At $10M ARR with 10K+ customers, the average revenue per customer is ~$1K/year — well below the $3K/year Pro plan price ($250/month). This implies a heavy free-tier-to-low-paid mix with a thin enterprise layer generating disproportionate revenue.

### Finding: Pricing structure — $0 → $250/month cliff, recently reduced from $300
**Confidence:** CONFIRMED
**Evidence:** Mintlify.com/pricing (accessed 2026-04-11), Ferndesk review, Featurebase analysis

| Plan | Monthly | Annual (approx) | Key gates |
|------|---------|-----------------|-----------|
| Hobby | $0 | $0 | 1 editor, no AI, no team, no preview deployments |
| Pro | $250/month | ~$212.50/month | 5 editors, AI assistant (250 credits), preview deploys, password protection |
| Enterprise | Contact sales | — | SSO, SOC 2, custom SLAs, user permissions |

- Extra seats: $20/month each
- AI overages: $0.25/credit (Mintlify pricing page) or $0.15/message (Ferndesk — may vary by tier)
- The Pro price was $300/month in older sources (Ferndesk, Featurebase) but is $250/month on the current pricing page — an apparent ~17% price reduction in early 2026

**⚠️ Third-party review note:** Some Ferndesk and BunnyDesk pricing data may be slightly outdated. The Mintlify pricing page is authoritative.

**Implications:** The $0-to-$250/month jump remains steep. Mintlify reduced it from $300 but the cliff is still material for individual developers or small teams. The pricing reduction suggests either competitive pressure or conversion optimization.

### Finding: OSS program — 90% discount, not free; adoption numbers undisclosed
**Confidence:** CONFIRMED
**Evidence:** Mintlify OSS program page, Mintlify X/Twitter announcement

The OSS program offers 90% off Pro pricing (effectively ~$25-30/month based on current Pro price). Eligibility requires: recognized OSS license (MIT, Apache 2.0, GPL), not venture-backed, not owned by a for-profit company.

Mintlify's tweet explicitly says: "Why 90% off instead of free? We already have a generous free tier for individual maintainers. This program is for projects that need to scale."

No adoption numbers are disclosed. The program is application-based (Typeform). No named OSS projects are listed as participants on the program page.

### Finding: YC batch penetration — 20%+ of recent batches use Mintlify
**Confidence:** INFERRED
**Evidence:** Series A blog, a16z investment page

Mintlify claims "over 20% of the most recent Y Combinator batch relies on Mintlify." This is the same figure cited across the Series A announcement (Sep 2024) and the a16z announcement. Whether "most recent" at the time of April 2026 still refers to the same batch is unclear.

**⚠️ Vendor-incentive bias:** Self-reported. Could include free tier usage. "Relies on" is vague — could mean their public docs are on Mintlify or they actively use it as a core workflow tool.

---

## Negative searches

- "Mintlify revenue concentration" / "top customers revenue share" — no results
- "Mintlify churn" / "Mintlify left" / "migrated from Mintlify" — no public migration stories found
- "Mintlify magic number" / "Mintlify CAC payback" — no results; these metrics are not publicly disclosed
- "Mintlify free OSS program adoption" / "projects using Mintlify OSS program" — no adoption numbers found

---

## Gaps / follow-ups

- The 10K → 18K customer count jump needs clarification: is this free-inclusive or paid-only?
- Revenue concentration is a significant unknown — at $10M ARR, losing a few enterprise customers could materially impact growth
- The $300 → $250 Pro pricing change timeline and rationale are not documented
- Independent customer satisfaction signals (G2, Capterra scores) not investigated in this pass
- Whether Helicone's 16K organizations will convert to Mintlify customers (or are counted in the 18K figure) is unknown
