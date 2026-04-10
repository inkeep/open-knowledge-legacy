---
title: "Semiont - Evidence File"
source_type: web_search
collected: 2026-04-02
tool: landscape-summary
---

# Semiont Evidence

## Primary Sources

- **GitHub Repository**: https://github.com/The-AI-Alliance/semiont — AI Alliance project. Active alpha development.
- **InfoWorld Coverage**: https://www.infoworld.com/article/4059656/ai-alliance-forges-agent-native-language-knowledge-base.html — "AI Alliance forges agent-native language, knowledge base"
- **Neo4j Developer Blog (Alexy Khrabrov, March 2026)**: https://medium.com/neo4j/semiont-an-annotated-semantic-layer-for-ai-5078c7f9e4d5 — "Semiont: an Annotated Semantic Layer for AI"
- **Meetup (Nov 2025)**: https://www.meetup.com/big-data-developers-in-boston/events/311870240/ — "SEMIONT - AI-Native Knowledge Kernel for Human/Agent Collaboration"
- **AI Alliance GitHub Profile**: https://github.com/The-AI-Alliance/.github/blob/main/profile/open-agent-hub-projects.md
- **Gather Flow Doc**: https://github.com/The-AI-Alliance/semiont/blob/main/docs/flows/GATHER.md

## Key Facts

- Creator: Adam Pingel, IBM Research engineer, head of Knowledge working group at AI Alliance
- Built on W3C Web Annotation standard
- Architecture: spec-first with OpenAPI specs, Next.js 15 frontend, Hono backend, CLI
- Shared packages: API client, core types, event-sourcing, content storage, graph databases, ontology, inference
- MCP server integration for locally owned knowledge bases
- Humans and AI agents are "architectural equals" — same API, event bus, event-sourced storage
- Knowledge graph grows as byproduct of annotation — no upfront schema required
- Self-hosted; inference on Anthropic (cloud) or Ollama (local)
- Status: Active alpha, API not yet stable, breaking changes expected
- Organizations can calibrate human-AI mix per domain
