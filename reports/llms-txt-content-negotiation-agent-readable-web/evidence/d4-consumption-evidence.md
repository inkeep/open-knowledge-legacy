# Evidence: Real Consumption — Who Reads llms.txt?

**Dimension:** D4 — Actual consumption by AI tools, crawlers, search engines
**Date:** 2026-04-07
**Sources:** Dries Buytaert/Acquia, Semrush, Reboot Online, SE Ranking, OtterlyAI, dev5310, LangChain mcpdoc

---

## Summary: The Consumption Gap Persists

| Consumer | Auto-discovers? | Consumes when configured? | Evidence |
|---|---|---|---|
| AI crawlers (GPTBot, ClaudeBot) | NO | N/A | Buytaert: "not one" |
| Google/Bing/Perplexity | NO | N/A | Mueller: "no AI system uses llms.txt" |
| Claude Code | NO | YES (manual URL) | Issue #2476 |
| Cursor | NO | YES (@Docs) | Community docs |
| Windsurf | NO | YES (@ references) | Community docs |
| GitHub Copilot | NO | NO | Open feature request |
| LangChain mcpdoc | NO (requires config) | YES — primary consumer | mcpdoc GitHub |

## Key Findings

### Multiple independent server log studies confirm near-zero fetch rates
**Confidence:** CONFIRMED

| Study | Result |
|---|---|
| Buytaert/Acquia (400M reqs) | 5K llms.txt requests (0.001%), ALL from SEO tools |
| Semrush (3 months) | Zero AI bot visits to llms.txt |
| Reboot Online (3 months) | Zero AI bot visits across 2 test domains |
| SE Ranking (300K domains) | No correlation between llms.txt and AI citations |
| Search Engine Land (180 days) | 8/9 sites showed no measurable change |

### LangChain mcpdoc is the strongest actual consumption story
**Confidence:** CONFIRMED
MCP server that takes llms.txt URLs, exposes fetch_docs tool. Requires manual config. Domain-locked for security.

### The Buytaert quote captures it: "The bots it was designed for don't look for it"
**Confidence:** CONFIRMED
