---
title: "Decagon & Sierra AI: Enterprise CX Agent Retrieval"
dimension: D4
facet: "Knowledge grounding in high-growth CX agent companies"
collected: 2026-04-03
confidence: medium-high
---

# Decagon & Sierra AI

## Decagon

### Retrieval Architecture

**Unified Knowledge Graph**: Processes structured + unstructured sources into a dynamic knowledge graph connecting help center articles, product data, and past conversations. Infers relationships and identifies key entities -- "a living web of information."

**Multi-Model Stack**: OpenAI, Anthropic, Google + proprietary fine-tuned models on Azure. "Ecosystem of agents" that review each other's work, abstracted into a "unified agent brain."

**Agent Operating Procedures (AOPs)**: Natural-language instructions compiled into structured logic. Non-technical teams define retrieval and reasoning workflows. "Flexibility of natural language with the precision of code."

**Limited technical disclosure**: No published engineering blog or paper on RAG internals. Most detailed public disclosure is the **Evaluation Engine** -- LLM-as-judge scoring (relevance, correctness, naturalness, empathy), ground truth evaluation, stratified sampling, online A/B testing.

Sources: [Decagon AI Guide](https://www.eesel.ai/blog/decagon), [Microsoft for Startups](https://www.microsoft.com/en-us/startups/blog/decagon-building-the-ai-concierge-for-modern-customer-experience/), [Evaluation Engine](https://decagon.ai/resources/evaluation-engine-ai-agents)

### Key Metrics & Customers

- 90% resolution rate for some customers (millions of conversations/year)
- Bilt Rewards: $1.75M cost reduction, 75% resolution
- 80% average deflection rate across customer base
- Customers: Notion, Rippling, Figma, Duolingo, Chime, Affirm, Hertz, Riot Games
- Funding: ~$481M total, $4.5B valuation (latest round)
- Founded Aug 2023 by Jesse Zhang (Harvard) and Ashwin Sreenivas (Stanford/Scale AI)

Sources: [Decagon Homepage](https://decagon.ai/), [Decagon Series B](https://decagon.ai/resources/series-b)

---

## Sierra AI

### Retrieval Architecture

**Agent Data Platform (ADP)**: Merges unstructured conversation data (calls, chats, emails) with structured enterprise data (billing, inventory, policies) into a unified context layer.

**Multiple retrieval methods**: Keyword search, embedding-based retrieval, long-context approaches (feeding large KB portions directly), terminal-style file exploration commands.

**Expert Answers**: Automatically converts contact center knowledge into grounded content for agents.

**Constellation of Models**: 15+ frontier, open-weight, and proprietary models orchestrated together. Each selected for specific strengths: low-latency for simple tasks, high-precision for fraud detection, long-context for documentation, tone-optimized for brand alignment. Built-in redundancy with automatic failover.

### Key Insight: Knowledge Grounding Difficulty

Bret Taylor: "It's harder to ground the agent for well-known brands because internet training data creates temptation for LLMs to go off-script." Less-known brands are paradoxically easier to ground.

Source: [Cheeky Pint Interview](https://cheekypint.substack.com/p/bret-taylor-of-sierra-on-ai-agents)

### tau-3-Bench (Open Evaluation)

Sierra's published benchmark for CX agents (most rigorous in the space):
- tau-Banking: 698 documents, ~195K tokens
- Best frontier model (GPT-5.2 high reasoning) succeeds on only ~25% of tasks
- Even with perfect information: only ~40% success
- Measures actual backend actions (disputes opened, cards frozen), not conversational polish
- **Implication**: Retrieval is necessary but far from sufficient -- reasoning + execution is the bottleneck

Source: [tau-3-Bench Blog](https://sierra.ai/blog/bench-advancing-agent-benchmarking-to-knowledge-and-voice)

### Key Metrics & Customers

- $100M ARR reached Jan 2026 (7 quarters after launch)
- Funding: ~$635M total, $10B valuation
- Customers: SiriusXM, Sonos, Brex, SoFi, ADT, Ramp, Chime (40% of Fortune 50)
- Outcome-based pricing: only paid when interactions are resolved
- Founded 2023 by Bret Taylor (ex-Salesforce CEO) and Clay Bavor (ex-Google VP)

Sources: [TechCrunch](https://techcrunch.com/2025/11/21/bret-taylors-sierra-reaches-100m-arr-in-under-two-years/), [Sierra Customers](https://sierra.ai/customers)

## Comparative Observations

| Dimension | Decagon | Sierra |
|-----------|---------|-------|
| Retrieval core | Unified Knowledge Graph | Multi-method RAG (keyword, embedding, long-context, file exploration) |
| Model strategy | Multi-model on Azure + fine-tuned | "Constellation" of 15+ models with failover |
| Technical transparency | Limited | Slightly more (constellation blog + tau-3-Bench) |
| Memory/state | Not prominently featured | Agent Data Platform with cross-session memory |
| Pricing | Not public | Outcome-based (per resolved interaction) |
| Valuation | $4.5B | $10B |

**Neither has published deep technical details on retrieval pipelines** (no papers, no architecture diagrams, no embedding model specifics).

## Implications for Agent-Native KB Design

1. **Knowledge graphs for entity-relationship reasoning** (Decagon) vs **multi-method retrieval flexibility** (Sierra) -- both valid approaches for different KB structures
2. **tau-3-Bench's finding** (25% success even with best models) means KB retrieval quality alone doesn't determine agent success -- the agent's reasoning and action capabilities matter equally
3. **Outcome-based pricing** (Sierra) suggests the industry values resolution over deflection -- KB interfaces should optimize for answer quality, not just retrieval speed
4. **AOPs / natural language workflow definition** (Decagon) is a pattern worth noting -- non-technical teams defining how knowledge is applied, not just retrieved
5. **The "constellation of models" approach** suggests KB MCP servers should be model-agnostic -- serve context that any model can consume
