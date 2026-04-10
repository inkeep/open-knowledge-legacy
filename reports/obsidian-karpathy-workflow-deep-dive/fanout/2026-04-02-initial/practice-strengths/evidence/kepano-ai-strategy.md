# Evidence: kepano's (Obsidian CEO) AI/Agent Strategy

## Primary Sources
- **obsidian-skills repo:** [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) — MIT licensed, started early Jan 2026
- **kepano tweet:** [x.com/kepano/status/2008578873903206895](https://x.com/kepano/status/2008578873903206895) — "I'm starting a set of Claude Skills for Obsidian... so far they're centered around helping Claude Code edit .md, .base, and .canvas files"
- **Community analysis:** [Medium — "Obsidian's CEO Just Taught AI How to Use His Own App"](https://medium.com/@hamzakhaledlklk/obsidians-ceo-just-taught-ai-how-to-use-his-own-app-here-s-the-0-way-to-do-it-too-97acbe8cfefe)
- **Technical analysis:** [Medium — Addo Zhang — "Obsidian Skills — Empowering AI Agents"](https://addozhang.medium.com/obsidian-skills-empowering-ai-agents-to-master-obsidian-knowledge-management-8b4f6d844b34)
- **Review:** [vibecoding.app — Obsidian Skills Review 2026](https://vibecoding.app/blog/obsidian-skills-review)
- **Philosophy:** [stephango.com/about](https://stephango.com/about) — "File over app" philosophy

## The Strategy: Teach Agents Formats, Don't Embed AI

kepano's approach is distinctive and deliberate:

### What He Did
1. Created `obsidian-skills` — 5 agent skill files following the Agent Skills specification
2. Teaches AI agents (Claude Code, Codex CLI, OpenCode) to work with Obsidian file formats
3. Covers: Obsidian Markdown (.md), Bases (.base), JSON Canvas (.canvas), CLI, Defuddle (web extraction)

### What He Did NOT Do
- Did not add an "Ask AI" button to Obsidian
- Did not build proprietary AI features into the app
- Did not create an AI subscription tier
- Did not build RAG or vector search into core

### The Philosophy
- **"File over app"** — Apps are ephemeral; data in files endures
- **"Teach agents the format"** — Instead of embedding AI, make your file formats legible to agents
- **Open specification** — Uses Agent Skills spec so any compatible agent can learn Obsidian
- **MIT licensed** — Anyone can use, modify, redistribute

### The 5 Skills
1. **obsidian-markdown** — Wikilinks, embeds, callouts, properties, YAML frontmatter
2. **obsidian-bases** — Views, filters, formulas, summaries in .base files
3. **json-canvas** — Visual node-and-edge connections in .canvas files
4. **obsidian-cli** — CLI interaction for vault management, plugin/theme development
5. **defuddle** — Clean markdown extraction from web content (reduces token usage)

### Installation
Place the repo contents in `/.claude` folder at vault root (or working directory for Claude Code).

## Community Reception
- First Agent Skills implementation officially maintained by a mainstream tool vendor
- Described as a "significant turning point" where tool vendors actively embrace AI agents
- Community extending with unofficial skills (e.g., [adriangrantdotorg/Obsidian-Skills](https://github.com/adriangrantdotorg/Obsidian-SKILLS))

## Community reaction ([@Hesamation on X](https://x.com/Hesamation/status/2026801420872093708))
"This Obsidian + AI is the new hot combo. Few people know that the CEO of Obsidian @kepano has made multiple skills for Claude Code and Codex that you can use right now both for your codebase and your personal vault."

## Implications for LLM Knowledge Base Workflow
- **Pro:** Agents can now properly create/edit Obsidian files without breaking formatting
- **Gap:** Skills only teach *format*, not *workflow orchestration* — no skill for "compile raw/ into wiki"
- **Gap:** No event system — skills are passive (agent must be invoked), not reactive (agent can't watch for changes)
- **Signal:** kepano clearly sees the future as agents working WITH Obsidian files, not AI embedded IN Obsidian
