---
title: "OpenAI and Anthropic Consolidation Patterns"
source_type: documentation_analysis
sources:
  - url: "https://openai.github.io/openai-agents-python/multi_agent/"
    title: "OpenAI Agents SDK — Multi-Agent Orchestration"
  - url: "https://developers.openai.com/cookbook/examples/agents_sdk/parallel_agents"
    title: "OpenAI Parallel Agents Cookbook"
  - url: "https://developers.openai.com/api/docs/guides/function-calling"
    title: "OpenAI Function Calling Docs"
  - url: "https://github.com/openai/swarm"
    title: "OpenAI Swarm"
  - url: "https://www.anthropic.com/research/building-effective-agents"
    title: "Anthropic — Building Effective Agents"
  - url: "https://www.anthropic.com/engineering/multi-agent-research-system"
    title: "Anthropic — Multi-Agent Research System"
  - url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    title: "Anthropic — Context Engineering"
  - url: "https://platform.claude.com/docs/en/agent-sdk/structured-outputs"
    title: "Claude Agent SDK — Structured Outputs"
  - url: "https://code.claude.com/docs/en/agent-teams"
    title: "Claude Code — Agent Teams"
  - url: "https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb"
    title: "Anthropic Cookbook — Orchestrator Workers"
  - url: "https://arxiv.org/abs/2512.08296"
    title: "DeepMind/MIT — Scaling Agent Systems"
  - url: "https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/"
    title: "Google ADK Multi-Agent Patterns"
  - url: "https://github.com/cloudflare/agents/blob/main/guides/anthropic-patterns/src/server.tsx"
    title: "Cloudflare Agents — Anthropic Patterns"
  - url: "https://ai.pydantic.dev/multi-agent-applications/"
    title: "Pydantic AI — Multi-Agent Applications"
date_collected: "2026-03-21"
---

# OpenAI Patterns

## Agents-as-Tools (Primary)

```python
meta_agent = Agent(
    name="MetaAgent",
    instructions="Combine summaries into executive summary.",
    model_settings=ModelSettings(parallel_tool_calls=True),
    tools=[
        features_agent.as_tool(tool_name="features", ...),
        pros_cons_agent.as_tool(tool_name="pros_cons", ...),
    ],
)
```

Meta-agent receives all specialist outputs as tool results and synthesizes.

## AsyncIO Manual Consolidation

```python
responses = await asyncio.gather(*(run_agent(agent, text) for agent in agents))
labeled = [f"### {r.last_agent.name}\n{r.final_output}" for r in responses]
final = await run_agent(meta_agent, "\n".join(labeled))
```

## Structured Output with output_type

```python
agent = Agent(name="Extractor", output_type=CalendarEvent)
```

Critical constraint: `parallel_tool_calls=True` and `strict=True` structured outputs are incompatible.

## Swarm Context Variables

Merge additively across handoffs — lightweight shared state consolidation.

---

# Anthropic Patterns

## Parallelization: Sectioning & Voting

- Sectioning: Independent subtasks → programmatic aggregation
- Voting: Identical tasks × N → threshold-based consensus

## FlexibleOrchestrator (Cookbook)

XML-structured contracts: `<analysis>`, `<tasks>`, `<response>` tags.
Note: cookbook does NOT include a synthesis/reduce step — returns raw worker results.

## Multi-Agent Research System (Production)

- Iterative refinement loop (LeadResearcher evaluates, decides if more research needed)
- Artifact storage (subagents store to external systems, pass lightweight references)
- Citation layer (post-synthesis CitationAgent validates attribution)
- Subagent output distillation (1,000-2,000 token condensed summaries)
- Parallel execution cut research time by 90%, consumes ~15x more tokens

## Context Engineering Patterns

- Sub-agent returns 1-2K token summary
- Tool result clearing after value extraction
- Server-side compaction (high-fidelity context summarization)
- Agentic note-taking persisted outside context window

## Agent Teams (TeammateTool)

- Shared task list with dependency tracking + file-lock-based claiming
- Mailbox inter-agent messaging
- Lead synthesizes all findings
- Sweet spot: 3-5 teammates, 5-6 tasks each
- Quality gates via hooks (TeammateIdle, TaskCompleted)

---

# Industry Findings

## DeepMind/MIT Error Amplification (Dec 2025, arXiv:2512.08296)

| Architecture | Error Amplification |
|---|---|
| Unstructured multi-agent | 17.2x |
| Centralized coordination | 4.4x |
| Single agent | 1.0x |

Gains plateau beyond 4 agents. Explicit I/O contracts at every boundary essential.

## Google ADK — ParallelAgent + output_key

Named slots in shared state via `output_key`. Consolidator references keys via template interpolation.

## Pydantic AI — Union Output Types

```python
flight_search_agent = Agent[None, FlightDetails | Failed](
    output_type=FlightDetails | Failed,  # Each registered as separate tool
)
```

## Consolidation Pattern Taxonomy

1. SDK-Native Tool Aggregation (OpenAI as_tool, Google ADK output_key)
2. Manual Fan-Out / LLM Reduce (asyncio.gather, Promise.all)
3. State-Reducer Aggregation (LangGraph operator.add, ADK output_key)
4. Iterative Refinement Loop (Anthropic LeadResearcher, ADK LoopAgent)
5. Artifact Storage + Lightweight References (Anthropic production)
6. Deterministic Aggregation (jq, Pydantic routing — no LLM reduce)
