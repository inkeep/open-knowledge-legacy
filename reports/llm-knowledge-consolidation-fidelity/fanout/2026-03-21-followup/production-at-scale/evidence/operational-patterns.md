---
title: Operational Patterns for Production Knowledge Consolidation
type: primary-source-synthesis
sources:
  - url: https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025
    title: "What 1,200 Production Deployments Reveal About LLMOps in 2025"
    publisher: ZenML
  - url: https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works
    title: "LLMOps in Production: 457 Case Studies of What Actually Works"
    publisher: ZenML
  - url: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
    title: "Context Engineering for AI Agents"
    publisher: Manus
  - url: https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai
    title: "Durable Execution meets AI"
    publisher: Temporal
  - url: https://redis.io/blog/prompt-caching-vs-semantic-caching/
    title: "Prompt caching vs semantic caching"
    publisher: Redis
  - url: https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025
    title: "Prompt Caching Infrastructure Guide 2025"
    publisher: Introl
date_accessed: 2026-03-21
---

## Caching Strategies

### Multi-Tier Architecture
1. **Exact-match cache**: Catches identical repeats (bypasses LLM entirely)
2. **Semantic cache**: Catches paraphrased queries via vector similarity (bypasses LLM)
3. **Prompt/prefix cache**: Optimizes novel queries that share context prefixes (reduces cost)

### Cost Impact
- Anthropic prefix caching: 90% cost reduction, 85% latency reduction
- OpenAI automatic caching: 50% cost savings
- 31% of LLM queries exhibit semantic similarity — massive inefficiency without caching
- Combined savings exceeding 80% in multi-tier setups
- Cached tokens: $0.30/MTok vs $3.00/MTok uncached (Claude Sonnet)

### KV-Cache Optimization (Manus)
- "Single most important metric for production-stage AI agent"
- Stable prompt prefixes required (single-token difference invalidates cache)
- Append-only context to avoid modifying previous actions
- Deterministic serialization (JSON key ordering matters)
- Session ID routing for distributed worker consistency

## Incremental Processing

### Delta Processing
- Stripe: dozens of daily documentation updates require automated refresh pipelines
- Delta processing: "Git diff" style — only update what changed
- Emergent Methods: 1M+ news articles daily via microservices for real-time analysis

### Staged Context Reduction (Manus)
- Compaction first (reversible): drop webpage content but keep URLs, omit documents but keep file paths
- Summarization second (irreversible): only when compaction returns diminish
- Keep last 3 turns raw to preserve model's "rhythm"
- Threshold: summarize oldest 20 turns when context > 128K tokens

## Quality Monitoring

### LLM-as-Judge
- Separate models evaluate consolidation outputs (relevancy, completeness)
- Cox Automotive and LinkedIn: metrics specific to multi-source tasks
- Multiple judge models averaged to reduce evaluation bias (Google FACTS approach)

### Shadow Mode Testing
- Ramp: run agents on historical data comparing predicted to actual outcomes
- Validates guardrails on real datasets without operational risk

### Multi-Tiered Guardrails
- DoorDash: two-tiered LLM Guardrail reduced hallucinations 90%, compliance issues 99%
- Deterministic checks before LLM processing (DoorDash "Zero-Data Statistical Query Validation")

### Regression Detection
- AppFolio: robust CI/CD pipelines for evaluation
- NotebookLM: Gemini 3.1 Pro update "completely broke" grounding (Feb 2026) — demonstrates need for regression testing

## Fallback Strategies

### Graceful Degradation
- DoorDash: defaults to human agents when latency issues arise
- Circuit breakers on cost and conversation turns prevent cascading failures
- Railway: caches successful steps, retries continue (not restart)

### Multi-Model Redundancy
- Bito: multi-LLM orchestration routing across providers
- Automatic failover on provider outages
- Model selection based on context size, cost, performance

### Cost Protection
- GetOnStack: $47,000 weekly cost spike from undetected agent loops
- Mitigation: circuit breakers, budget enforcement, message queues

## Durable Execution

### Temporal Integration
- Every agent interaction captured as deterministic workflow
- Auto-replay/restore after crash, timeout, network failure
- OpenAI uses Temporal for Codex (millions of requests)
- Slack: resume consolidated workflows from failure points (not restart)

## Enterprise Scale Patterns

### Multi-Source Integration
- Loblaws: 50+ internal APIs wrapped into task-oriented tools
- Accenture Knowledge Assist: Claude-2 + Titan + Pinecone + Kendra → 50% training time reduction
- BNY Mellon: 50,000 employees accessing internal knowledge across silos

### Tool/API Consolidation
- Deduplication at multiple levels: tool masking, context compaction, prompt caching
- CloudQuery: identical functionality ignored until renamed — semantic clarity in schemas matters
- Elyos AI: remove context after it serves its purpose

### Critical Success Factors
- Infrastructure > model intelligence (LinkedIn, Meta)
- Data quality investment > model upgrades
- Hybrid approaches > pure solutions
- Human oversight essential for high-stakes domains
