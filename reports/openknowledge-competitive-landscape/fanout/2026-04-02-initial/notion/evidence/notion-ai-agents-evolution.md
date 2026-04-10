---
title: "Notion AI Agents Evolution: 3.0 through 3.3"
type: product-timeline
created: 2026-04-02
---

# Notion AI Agents Evolution

## Sources
- https://www.notion.com/releases/2025-09-18 (Notion 3.0)
- https://www.notion.com/releases/2026-01-20 (Notion 3.2)
- https://www.notion.com/releases/2026-02-24 (Notion 3.3)
- https://www.reworked.co/collaboration-productivity/notion-30-introduces-ai-agents-for-task-automation/

## Timeline

### Pre-3.0: Notion AI (Writing Assistant)
- AI writing assistance (summarize, translate, edit tone, brainstorm)
- Q&A over workspace content
- Autofill database properties
- Add-on pricing: $10/user/month on top of plan

### May 2025: Pricing Restructure
- AI bundled into Business ($20/user/mo) and Enterprise plans
- No longer available as separate add-on for Plus/Free
- AI agents priced via credits: free trial, then $10 per 1,000 credits

### September 2025: Notion 3.0 - Agents Launch
- AI rebuilt from ground up as "Agents"
- Capabilities: 20+ minutes of multi-step autonomous actions
- State-of-the-art memory system using Notion pages and databases
- Personal Agents: manage projects, build launch plans, break tasks, assign work, draft docs
- Multi-database operations at scale (create/update hundreds of pages)
- Context from workspace, connected tools (Slack, Google Drive, GitHub), and web
- Built-in models: Claude Sonnet 4, GPT-5
- Enterprise features: database row permissions, AI connectors
- MCP integrations: Lovable, Perplexity, Mistral, HubSpot

### January 2026: Notion 3.2
- AI Agents on mobile
- New models: GPT-5.2, Claude Opus 4.5, Gemini 3
- Intelligent auto-model selection
- People directory
- MCP improvements for Enterprise: audit logs, multi-database queries
- Coming: workspace-level MCP access controls

### February 2026: Notion 3.3 - Custom Agents
- Completely autonomous agents, no manual prompting
- Trigger types: schedule-based or event-based
- Configurable: instructions, data sources, AI model selection
- Connected tools: Slack, Notion Mail, Notion Calendar
- MCP connections: Linear, Figma, HubSpot, FigJam
- Admin controls: restrict agent creation to specific roles
- Full access logs for all agent runs
- Pricing: Free trial through May 3, 2026; then paid via Notion Credits (Business/Enterprise only)

## Key Architectural Insight

Notion's agents are "walled garden" agents -- they operate within Notion's ecosystem and connected tools. They use Notion's own LLM compute (bundled models), Notion's own memory system (Notion pages/databases), and Notion-controlled MCP connections. The intelligence is centralized in Notion's infrastructure.

## Implications for Agent-Native Knowledge Platforms

Notion's AI agent strategy is fundamentally different from an agent-native approach where external agents (Claude Code, Cursor, custom agents) interact with content via MCP with zero LLM compute in the product. Notion bundles LLM compute, agent logic, and knowledge together. An agent-native platform decouples them: content is the substrate, agents are external, LLM compute is wherever the agent lives. This is an architectural philosophical difference, not just a feature gap.
