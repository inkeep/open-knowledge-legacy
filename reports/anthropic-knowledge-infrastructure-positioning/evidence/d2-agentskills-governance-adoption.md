# Evidence: agentskills.io Governance + Adoption

**Dimension:** D2 — agentskills.io governance, AAIF, adoption metrics, skills.sh relationship
**Date:** 2026-04-02
**Sources:** agentskills.io, aaif.io, linuxfoundation.org, github.com/agentskills, vercel.com, skills.sh, infoq.com, snyk.io

---

## Key Sources Referenced

- https://aaif.io/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation — AAIF formation
- https://github.com/agentskills/agentskills — Spec repo (14.6K stars, Apache 2.0 + CC-BY-4.0)
- https://github.com/anthropics/skills — Official skills collection (109K stars)
- https://www.infoq.com/news/2026/02/vercel-agent-skills/ — Vercel skills.sh announcement
- https://snyk.io/blog/snyk-vercel-securing-agent-skill-ecosystem/ — Security partnership
- https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem — Vercel skills

---

## Findings

### Finding: AAIF governs MCP and AGENTS.md; Agent Skills is NOT yet under AAIF
**Confidence:** CONFIRMED
**Evidence:** AAIF press release, linux foundation announcement

AAIF (Agentic AI Foundation) was formed under Linux Foundation with:
- Projects transferred: MCP (Anthropic), goose (Block), AGENTS.md (OpenAI)
- Agent Skills / agentskills.io is NOT listed as an AAIF project
- Platinum members: AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI
- Gold: Adyen, Cisco, Datadog, Docker, IBM, JetBrains, Okta, Oracle, Salesforce, SAP, Shopify, Snowflake, Temporal, Twilio
- Silver: 23 members including Hugging Face, Pydantic, WorkOS, Zapier

**Implications:** Agent Skills remains under Anthropic's control. MCP moved to neutral governance; skills have not. This may be strategic — Anthropic retains more control over the skills standard while MCP becomes infrastructure.

### Finding: Adoption metrics as of March 2026
**Confidence:** CONFIRMED (vendor-sourced, Anthropic data)
**Evidence:** GitHub, AAIF announcements, Vercel

- anthropics/skills repo: 109K GitHub stars
- agentskills/agentskills spec repo: 14.6K stars
- MCP: 97M+ monthly SDK downloads, 10K+ active servers
- AGENTS.md: adopted by 60K+ open-source projects
- skills.sh: 83K+ indexed skills, growing at ~147 new skills/day
- SkillsMP (marketplace): 500K+ indexed skills
- Antigravity: 1,340+ curated skills
- Platform adopters: 30+ (Claude Code, OpenAI Codex, Cursor, Gemini CLI, GitHub Copilot, VS Code, Windsurf, Amp, Roo, OpenHands, OpenCode, Kiro, Goose)

### Finding: skills.sh (Vercel) is complementary to agentskills.io, not competing
**Confidence:** CONFIRMED
**Evidence:** Vercel blog, InfoQ, Snyk

skills.sh is a directory/leaderboard + CLI (`npx skills`) built by Vercel. It consumes the agentskills.io standard — it's a distribution/discovery layer, not a competing spec. Relationship: agentskills.io = the spec; skills.sh = a marketplace. Similar to how npm registry implements the Node package spec.

Vercel also partnered with Snyk for automated security scanning at install time. The SkillScan study (arXiv) found 26.1% of 31,132 analyzed skills had vulnerabilities.

---

## Gaps / Follow-ups

- Whether Agent Skills will be transferred to AAIF — no announcement found
- Revenue/business model for skills.sh unclear
