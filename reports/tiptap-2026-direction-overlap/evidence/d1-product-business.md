# Evidence: TipTap Product & Business in 2026

**Dimension:** D1 — TipTap's product and business in 2026
**Date:** 2026-04-04
**Sources:** tiptap.dev, tiptap.dev/pricing, tiptap.dev/customers, tiptap.dev/open-source-to-platform, tracxn.com, getlatka.com

---

## Key pages referenced
- https://tiptap.dev/pricing — pricing tiers and feature comparison
- https://tiptap.dev/customers — 25 named customers
- https://tiptap.dev/open-source-to-platform — OSS-to-platform strategy narrative
- https://tiptap.dev/feature-comparison — tier feature matrix
- https://tiptap.dev/enterprise — enterprise positioning

---

## Findings

### Finding: TipTap is now a five-product platform, not just an editor library
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev product pages, pricing page, feature comparison

TipTap's product suite in 2026 consists of:
1. **Tiptap Editor** (MIT OSS) — headless rich-text editor on ProseMirror
2. **Tiptap Collaboration** (Cloud/self-hosted) — real-time collab via Hocuspocus/Yjs
3. **Tiptap Documents** (Cloud/self-hosted) — document storage, REST API, version history
4. **Tiptap Content AI** (paid add-on) — AI Toolkit, AI Generation, Server AI Toolkit
5. **Tiptap Conversion** (paid) — DOCX import/export, PDF export, page layouts

Plus emerging products:
- **Tiptap Pages** — page-based layout with headers/footers
- **Tiptap Flex** — AI-native writing UI prototype
- **Tiptap Shorthand** — compression format for AI token cost reduction

**Implications:** TipTap has evolved from "editor library" to "document infrastructure platform." They sell the platform layer, not the editor.

### Finding: TipTap Cloud vs OSS split is clearly defined
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/open-source-to-platform

**Free (MIT):**
- Tiptap Editor (core, all standard extensions)
- Hocuspocus (self-hosted collaboration server)
- 8 formerly-Pro extensions (Details, Emoji, DragHandle, FileHandler, InvisibleCharacters, Mathematics, TableOfContents, UniqueID)
- @tiptap/markdown (bidirectional markdown)

**Paid (Platform):**
- Cloud document storage and management
- Managed collaboration infrastructure
- AI Toolkit and AI Generation
- Document conversion (DOCX/PDF)
- Tracked Changes / Redlining
- Pages extension
- Comments system
- Version history / snapshots

### Finding: Revenue model is document-based, not per-seat
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/pricing

Pricing tiers (all custom pricing except Start):
- **Start (free trial):** 500 cloud docs, 2 environments, 2 dev licenses
- **Team:** 5,000 cloud docs, 3 environments, 5 dev licenses
- **Business:** 50,000 cloud docs, 5 environments, 10 dev licenses
- **Enterprise:** Custom, on-prem option, SOC 2 Type II

Revenue comes from:
- Cloud document storage quotas
- Add-ons: AI Toolkit, Tracked Changes
- Enterprise on-prem licensing
- "Only documents stored in Tiptap Platform count toward your plan"
- Annual billing = 20% discount

### Finding: Company is small but growing with notable customers
**Confidence:** CONFIRMED (revenue/team); UNCERTAIN (exact funding)
**Evidence:** getlatka.com, tracxn.com, crunchbase.com, tiptap.dev/customers

- **Revenue (2024):** $2.3M
- **Team size:** ~15 employees
- **Founded:** 2023 (as Tiptap GmbH; Ueberdosis GmbH was the prior entity)
- **HQ:** Berlin, Germany
- **Funding:** Conflicting data — Tracxn says $2.6M (1 round), PitchBook/CBInsights say ~$8.75M
- **CEO:** Philip Isik
- **Founders:** Philip Isik, Patrick Baber, Sven Adlung, Nick Hirche, Timo Isik

Notable customers: Axios, BCG, Beehiiv, Business Insider, Coda, DataSnipper, DeShaw & Co, DevRev, Hebbia, Jenni AI, KPMG, Productboard, Simpplr, SmallPDF, Storyblok, Substack, Trainual, UserTesting

Partners: LinkedIn, Anthropic, GitLab, Claude (Anthropic), Y Combinator

---

## Gaps / follow-ups
- Exact funding amount unclear (conflicting sources)
- No public ARR growth rate data
- Customer count beyond the 25 featured is unknown
