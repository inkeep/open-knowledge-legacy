# Evidence: E5 — Free OSS Program Adoption

**Dimension:** Free OSS program adoption
**Date:** 2026-04-11
**Sources:** mintlify.com/oss-program, mintlify.com/pricing, mintlify.com/customers, LinkedIn, X/Twitter, GitHub

---

## Key pages referenced

- https://www.mintlify.com/oss-program — OSS program page
- https://www.mintlify.com/pricing — Current pricing
- https://www.mintlify.com/customers — Customer showcase
- https://www.linkedin.com/posts/nkhami_we-recently-made-mintlifys-open-source-software-activity-7420555958113832960-YJAk — Nicholas Khami OSS announcement
- https://fastmcp.mintlify.app/ — FastMCP docs on Mintlify

---

## Findings

### Finding: OSS program is genuinely free (upgraded from 90% discount)
**Confidence:** CONFIRMED
**Evidence:** mintlify.com/oss-program, LinkedIn post by Nicholas Khami

The program gives qualifying non-commercial OSS projects the full Pro plan (normally $250/month) at no cost. Previously offered 90% discount ($30/month), upgraded to 100% free. Nicholas Khami's LinkedIn post confirmed the transition, citing Tailwind CSS layoffs as motivation for supporting OSS economics.

**Eligibility gates:**
1. Recognized OSS license (MIT, Apache 2, GPL)
2. Not VC-backed or revenue-funded
3. Not owned/primarily maintained by a for-profit company

These gates exclude corporate-backed OSS — a major carve-out given how much popular OSS is company-sponsored.

### Finding: No adoption numbers published anywhere
**Confidence:** CONFIRMED (absence)
**Evidence:** Negative search across mintlify.com, blog, customers page, third-party sources

The only public figure is a Mintlify tweet stating "hundreds of open source projects already use @mintlify for their docs" — context for the program launch. This is a pre-existing base metric, not a post-program adoption count. No post-launch metrics published.

**Vendor bias flag:** "Hundreds" is an unverified vendor claim.

### Finding: No tier-1 OSS projects confirmed on Mintlify free tier
**Confidence:** CONFIRMED (absence)
**Evidence:** Direct domain searches, customer page review

- **FastMCP** (Python MCP server framework): Confirmed on Mintlify at fastmcp.mintlify.app. Notable AI-ecosystem project but relatively niche.
- **Hono**: NOT on Mintlify — own docs at hono.dev (Vitepress/custom)
- **tRPC**: NOT confirmed on Mintlify
- **Drizzle**: NOT confirmed on Mintlify
- **Fastify**: NOT confirmed on Mintlify
- **Laravel**: Listed on Mintlify customers page (commercial tier, not OSS program)

mintlify.com/customers lists 30+ companies but zero OSS projects. The program page lists zero named adopters.

openalternative.co/stacks/mintlify claims "10+ Best Open Source Projects using Mintlify" but the page returned 403 — could not verify.

### Finding: Program functions as brand/ecosystem play, not direct conversion funnel
**Confidence:** INFERRED
**Evidence:** Program structure analysis

The eligibility rules (no VC backing, no for-profit ownership) structurally exclude projects most likely to convert to paid. The stated philosophy is explicitly altruistic: "support the backbone of the open source ecosystem." Indirect conversion path: OSS projects that attract funding would disqualify and convert to paid. Brand-building value from high-visibility OSS projects (e.g., FastMCP aligning with Mintlify's AI-agent narrative).

### Finding: Competitive comparison — Mintlify is the only paid platform offering free managed hosting for OSS
**Confidence:** CONFIRMED
**Evidence:** Competitor pricing pages, Fumadocs comparison page

| Platform | OSS Model | Key Difference |
|----------|-----------|----------------|
| Mintlify | Free Pro tier for qualifying OSS | Managed hosting + AI features included |
| Fumadocs | Free, fully open-source (MIT) | Self-hosted; requires engineering effort |
| Nextra | Free, fully open-source | Self-hosted |
| Docusaurus | Free, fully open-source | Self-hosted; Meta-maintained |
| GitBook | Free tier + OSS community plan | Visual editor advantage |

Mintlify's unique position: zero-ops managed hosting with AI features (Assistant, search) for qualifying OSS. Competitors either require self-hosting or don't include AI features in free tiers.

**Vendor bias flag:** Fumadocs' own comparison page notes it is "not as powerful as Mintlify" for OpenAPI docs. This is a competitor acknowledging strength, not Mintlify self-promotion.

**Implications:** The OSS program is real and genuinely free, but adoption is entirely opaque. No tier-1 projects visible. The strict eligibility gates (no corporate-backed OSS) limit the program's reach to the long tail of independent OSS projects. For competitive assessment: this is a community goodwill play, not a significant revenue driver or adoption signal.

---

## Negative searches

* mintlify.com/customers → zero OSS projects listed
* mintlify.com/blog → no post about OSS program results
* GitHub search for mint.json in popular OSS repos → no tier-1 projects found
* Twitter reaction to OSS launch → blocked by auth wall

---

## Gaps / follow-ups

* Actual adoption count is unknown — "hundreds" is unverified
* Whether any OSS projects have graduated from free to paid is unknown
* openalternative.co list of 10+ projects could not be verified (403)
