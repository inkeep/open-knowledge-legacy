# D5: Framework Implementations of the Consolidation/Reduce Step

**Research date:** 2026-03-21
**Scope:** How real frameworks and systems implement the consolidation/reduce step in AI/LLM knowledge consolidation pipelines
**Parent report:** LLM Knowledge Consolidation with Fidelity

---

## Executive Summary

Across 10+ frameworks and systems, the consolidation/reduce step falls into **six distinct implementation patterns**, ranging from naive string concatenation to entropy-driven convolutional refinement. The critical finding: **no mainstream framework ships a high-fidelity consolidation step by default**. LangChain's reduce prompt is `"Write a concise summary"`. CrewAI's aggregation is literal string concatenation. AutoGen's is `"Summarize the takeaway"`. The frameworks that achieve genuine fidelity — LLMxMapReduce V2 (95.5% reference precision) and Agent Zero (5-action decision taxonomy) — do so through custom, purpose-built consolidation logic that is significantly more sophisticated than any default.

A December 2025 study from Google DeepMind/MIT quantifies the stakes: unstructured multi-agent networks amplify errors **17.2x** compared to single-agent baselines. Centralized coordination with explicit contracts contains this to 4.4x. Architecture, not model capability, determines consolidation quality.

**Key implications for a `/consolidate` skill:**
1. Default reduce prompts in all frameworks are lossy summarization — unsuitable for fidelity-preserving consolidation
2. Structured output contracts at every boundary are essential (Pydantic/JSON Schema/XML)
3. Recursive collapse with token management is the universal overflow strategy
4. Confidence scoring and conflict resolution (LLMxMapReduce) are the only proven fidelity mechanisms
5. Conservative safety rails (Agent Zero's REPLACE threshold) prevent consolidation-induced data loss

---

## 1. LangChain / LangGraph: Recursive Collapse with State Reducers

### 1.1 Architecture

LangChain implements map-reduce consolidation in two generations:

| Generation | Mechanism | Status |
|---|---|---|
| Legacy `MapReduceDocumentsChain` | `while` loop with `_split_list_of_docs` | Deprecated since v0.2.13 |
| LangGraph | Graph cycle with `Send()` fan-out and `operator.add` reducer | Current recommended |

Both share the same core algorithm for the reduce step: **recursive collapse until token budget is met, then final combine**.

### 1.2 The Collapse Algorithm (Shared)

```python
# Core loop — identical logic in both generations
while num_tokens > token_max:
    # 1. Partition: greedy bin-packing under token_max
    groups = split_list_of_docs(docs, length_func, token_max)
    # 2. Collapse: LLM summarizes each group → 1 doc
    docs = [collapse_via_llm(group) for group in groups]
    # 3. Re-measure
    num_tokens = length_func(docs)
```

**`split_list_of_docs`** uses greedy append-until-overflow. A single document exceeding `token_max` raises a hard `ValueError` — no internal splitting. Metadata is merged by comma-concatenating overlapping keys (lossy).

### 1.3 Default Prompts

**Map:** `"Write a concise summary of the following:\n\n{context}"`
**Reduce:** `"The following is a set of summaries:\n{docs}\nTake these and distill it into a final, consolidated summary of the main themes."`

The map and reduce prompts are identical in the legacy chain. The collapse prompt defaults to the same unless overridden.

### 1.4 LangGraph State Reducers

LangGraph's innovation is making fan-in explicit through typed state reducers:

```python
class OverallState(TypedDict):
    summaries: Annotated[list, operator.add]  # parallel outputs concatenate
```

Without `operator.add`, the last-completing parallel node overwrites all others. Custom reducers are also supported:

```python
def dedup_reducer(current: list, new: list) -> list:
    seen = set(current)
    return current + [x for x in new if x not in seen]
```

The `Send()` API enables runtime-determined parallelism — the number of branches is determined by state content, not graph structure.

### 1.5 What's Missing

- **No structured output contract** — reduce returns free text by default
- **No conflict resolution** — contradictory information across sources is not detected
- **No confidence scoring** — all source material weighted equally
- **No fidelity verification** — no mechanism to validate information preservation

**Evidence:** [langchain-langgraph-reduce.md](evidence/langchain-langgraph-reduce.md)

---

## 2. LLMxMapReduce: Structured Information Protocol with Confidence Calibration

### 2.1 Architecture

The most sophisticated consolidation implementation found. Two versions:

| Version | Purpose | Key Innovation |
|---|---|---|
| V1 (Oct 2024) | Long-context QA (1.28M tokens) | Structured Information Protocol + In-Context Confidence Calibration |
| V2 (Apr 2025) | Long-to-long generation (surveys) | Entropy-Driven Convolutional Test-Time Scaling |

**Repository:** [thunlp/LLMxMapReduce](https://github.com/thunlp/LLMxMapReduce) (Apache 2.0, 866 stars)

### 2.2 V1: Four-Field Structured Protocol

Every chunk's output maintains a fixed structured format through all pipeline stages:

```
Extracted Information:  (key facts relevant to the query)
Rationale:              (analysis of how facts answer the question)
Answer:                 (chunk-level answer, or "[NO INFORMATION]")
Confidence Score:       (0-5 numerical rating)
```

The confidence scoring system resolves inter-chunk conflicts:
- **5 points:** Claims fully supported by source text
- **3-3.5 points:** Inferred claims with medium confidence
- **0 points:** Claims unrelated to or unsupported by source text

The reduce prompt instructs: *"Your role is to integrate and reason through this information, weighing confidence scores to resolve any inconsistencies."*

**Ablation results:** Removing confidence calibration reduced accuracy from 99.56 to 96.00 on retrieval tasks. Removing the structured protocol reduced comprehension from 41.23 to 25.93.

### 2.3 V2: Entropy-Driven Convolutional Refinement

V2 treats consolidation as an iterative refinement problem inspired by CNNs:

```
[Encode] → [Hidden Pipeline (iterative)] → [Decode]
                    ↓
    digest → skeleton_refine → digest → skeleton_refine → ...
                    ↓
         7 convolution layers × kernel width 3
         Entropy scoring → Top-k pruning → Best-of-N selection
```

**Key mechanisms:**
1. **Feedback clustering** — Paper digests generate suggestions about the consolidation skeleton
2. **Probabilistic sampling** — Suggestions sampled proportional to entropy scores
3. **Convolution kernel** — Groups of suggestions merged into comprehensive proposals
4. **Modify + Evaluate** — Applied to skeleton, scored for information entropy (0-10)
5. **Top-k pooling** — Best results advance to next layer

**Topology-aware generation:** Different prompts for leaf nodes (detailed synthesis with `ORCHESTRA_PROMPT`) vs. parent nodes (cross-section integration with `SUMMARY_PROMPT`).

### 2.4 Results

| Metric | LLMxMapReduce V2 | AutoSurvey | Vanilla |
|---|---|---|---|
| Reference Precision | **95.50%** | 50.12% | 25.48% |
| Reference Recall | **95.80%** | 51.73% | 26.46% |
| Content Density | **474.90** | — | 78.75 |
| Human Win Rate vs AutoSurvey | **75%** | — | — |

### 2.5 Implications for /consolidate

LLMxMapReduce V1's structured information protocol is the most directly applicable pattern: maintain a fixed output schema with confidence scores through all consolidation stages. V2's iterative refinement with entropy scoring is the gold standard for quality but requires significant compute (7 layers × multiple candidates per layer).

**Evidence:** [llmxmapreduce-architecture.md](evidence/llmxmapreduce-architecture.md)

---

## 3. CrewAI: String Concatenation (No LLM Consolidation)

### 3.1 Aggregation Mechanism

CrewAI's aggregation is **pure string concatenation** — the simplest possible implementation:

```python
DIVIDERS: Final[str] = "\n\n----------\n\n"

def aggregate_raw_outputs_from_task_outputs(task_outputs: list[TaskOutput]) -> str:
    return DIVIDERS.join(output.raw for output in task_outputs)
```

Injected into prompts as: `"{task}\n\nThis is the context you're working with:\n{context}"`

### 3.2 Key Design Decisions

- **No LLM summarization** at the aggregation layer — the downstream agent must synthesize implicitly
- **Pydantic structured outputs** are supported per-task but **flattened back to `.raw` text** at the aggregation boundary
- **`context` parameter** allows explicit dependency declaration: `context=[task_a, task_b]`
- **Default in sequential mode:** all prior task outputs included automatically

### 3.3 CrewAI Flows (Higher-Level)

Flows provide `and_()` for fan-in (wait for all parallel tasks) and `or_()` for first-available, with state-based aggregation.

### 3.4 Implications for /consolidate

CrewAI proves that even production multi-agent frameworks can ship without any consolidation intelligence. The structured-to-text flattening at the aggregation boundary is a cautionary pattern — structured outputs must flow through as structured data, not serialized text.

**Evidence:** [crewai-autogen-aggregation.md](evidence/crewai-autogen-aggregation.md)

---

## 4. AutoGen: Summary-Based Carryover

### 4.1 Summary Methods

AutoGen consolidates through conversation summaries, not task outputs:

| Method | Behavior |
|---|---|
| `"last_msg"` (default) | Returns last message content |
| `"reflection_with_llm"` | LLM summarizes full chat history |
| Custom callable | Any function `(sender, recipient, summary_args) → str` |

**Default LLM prompt:** `"Summarize the takeaway from the conversation. Do not add any introductory phrases."`

### 4.2 Carryover Accumulation

Sequential chats accumulate all prior summaries:

```python
# Each chat receives: own carryover + ALL previous chat summaries
chat_info["carryover"] = _chat_carryover + [
    r.summary for i, r in enumerate(finished_chats)
    if i not in finished_chat_indexes_to_exclude_from_carryover
]
```

Format: `"{message}\nContext:\n{carryover_text}"`

### 4.3 SocietyOfMindAgent

Wraps a group chat into a single agent with consolidation:

```python
response_preparer = "Output a standalone response to the original request, without mentioning any of the intermediate discussion."
```

### 4.4 Key Limitation

GroupChat has **no automatic consolidation** — you must explicitly use `summary_method` on the wrapping `initiate_chat` call. Nested chats return only the **last** chat's summary; earlier summaries feed forward via carryover but don't surface directly.

**Evidence:** [crewai-autogen-aggregation.md](evidence/crewai-autogen-aggregation.md)

---

## 5. Agent Zero: LLM-Driven Memory Consolidation

### 5.1 Architecture

The most sophisticated per-item consolidation system found. Uses a FAISS vector database with an LLM-driven decision pipeline.

**Four-stage pipeline:**
1. **Similar Memory Discovery** — Hybrid search (semantic + keyword via FAISS)
2. **Race Condition Validation** — Verify discovered memories still exist
3. **LLM Analysis** — Structured JSON decision with 5 possible actions
4. **Apply Consolidation** — Execute the chosen action with safety checks

### 5.2 The Five Actions

| Action | Behavior | Safety Gate |
|---|---|---|
| **SKIP** | Insert new memory unchanged | None |
| **KEEP_SEPARATE** | Insert alongside existing | None |
| **MERGE** | Delete originals, insert consolidated | Tracks `consolidated_from` IDs |
| **REPLACE** | Delete old, insert new version | **Requires >0.9 similarity** or auto-downgrades to KEEP_SEPARATE |
| **UPDATE** | Delete old, insert updated versions | Validates existence before update |

### 5.3 The REPLACE Safety Rail

The 0.9 similarity threshold with automatic downgrade is the key design pattern:

> If any memory targeted for replacement has estimated similarity below 0.9, the entire REPLACE is downgraded to KEEP_SEPARATE to prevent accidental data loss.

This is a "first, do no harm" approach — the system is biased toward keeping more data rather than risking information loss through incorrect consolidation.

### 5.4 Prompt Design

The consolidation system prompt (~200 lines) includes:
- **Similarity score awareness** (>0.9 = safe to replace, 0.7-0.9 = caution, <0.7 = avoid)
- **Temporal intelligence** (newer supersedes older, preserve historical context)
- **Content relationship analysis** (complementary → merge, contradictory → analyze accuracy, duplicate → consolidate)
- **Quality assessment** (detail > vagueness, facts > speculation)
- **Knowledge source awareness** (imported files are more authoritative than conversation memories)
- **Three worked examples** with full JSON output

### 5.5 Two-Layer Deduplication

The extraction prompt already merges related facts before they reach consolidation:

> *"Do not break information related to the same subject into multiple memories, keep them as one text. Instead of three memories 'User's dog is Max', 'Max is 6 years old', 'Max is white and brown', create one memory 'User's dog is Max, 6 years old, white and brown.'"*

### 5.6 Implications for /consolidate

Agent Zero's action taxonomy (MERGE/REPLACE/UPDATE/KEEP_SEPARATE/SKIP) is directly applicable to knowledge consolidation. The REPLACE safety rail with similarity threshold prevents the most dangerous failure mode: incorrectly replacing distinct information with a lossy merge.

**Evidence:** [agent-zero-memory-consolidation.md](evidence/agent-zero-memory-consolidation.md)

---

## 6. NexusSum: Progressive Sequential Compression

### 6.1 Architecture

Three-stage sequential pipeline (not a tree hierarchy):

```
[Preprocessor] → [Summarizer] → [Compressor (iterative, max 10 iterations)]
```

Each stage uses a **chunk-and-concat** method: process chunks independently, concatenate results. The "hierarchical" nature comes from progressive compression — each stage produces shorter output than its input.

### 6.2 Iterative Compression with Rollback

The Compressor's key design: when compression crosses below the target word count theta, it returns the **previous** iteration's output (still above theta), not the current one. This prevents over-compression.

### 6.3 Factual Fidelity

No explicit fact-checking agent exists. Fidelity emerges from:
- **Chunk-based grounding** — 8-scene chunks maintain local context
- **Progressive refinement** — each stage has a narrow transformation task
- **Iteration rollback** — prevents over-compression

Human evaluation: 4.0/5.0 on factuality (vs. 3.5 for zero-shot).

**Evidence:** [nexussum-hierarchical-compression.md](evidence/nexussum-hierarchical-compression.md)

---

## 7. OpenAI Patterns

### 7.1 Agents-as-Tools (Primary Pattern)

```python
meta_agent = Agent(
    name="MetaAgent",
    instructions="Combine summaries into executive summary.",
    model_settings=ModelSettings(parallel_tool_calls=True),
    tools=[
        features_agent.as_tool(tool_name="features", ...),
        pros_cons_agent.as_tool(tool_name="pros_cons", ...),
        sentiment_agent.as_tool(tool_name="sentiment", ...),
    ],
)
```

The meta-agent receives all specialist outputs as tool results and produces a consolidated output. The SDK handles parallel execution.

### 7.2 Structured Output with `output_type`

```python
agent = Agent(
    name="Extractor",
    output_type=CalendarEvent,  # Pydantic model
)
```

**Critical constraint:** `parallel_tool_calls=True` and `strict=True` structured outputs are incompatible. Workaround: each specialist has its own `output_type`, but the consolidator receives outputs as tool results.

### 7.3 Context Variable Aggregation (Swarm)

`context_variables` merge additively across agent handoffs — a lightweight consolidation mechanism for shared state.

**Evidence:** [openai-anthropic-patterns.md](evidence/openai-anthropic-patterns.md)

---

## 8. Anthropic Patterns

### 8.1 Parallelization Sub-Patterns

Two documented consolidation sub-patterns:
- **Sectioning:** Independent subtasks → programmatic aggregation
- **Voting:** Identical tasks run N times → threshold-based consensus

### 8.2 Orchestrator-Workers (FlexibleOrchestrator)

Uses XML-structured contracts between orchestrator and workers:

```xml
<analysis>Understanding of task decomposition</analysis>
<tasks>
  <task><type>formal</type><description>...</description></task>
</tasks>
```

Workers return via `<response>` tags. Note: the cookbook implementation does **not** include a synthesis/reduce step — it returns raw worker results.

### 8.3 Multi-Agent Research System (Production)

Key production patterns:
- **Iterative refinement loop** — LeadResearcher evaluates and decides if more research needed
- **Artifact storage** — Subagents store work externally, pass lightweight references
- **Citation layer** — Post-synthesis CitationAgent validates all claims are attributed
- **Subagent output distillation** — Each returns 1,000-2,000 token condensed summaries

### 8.4 Agent Teams (TeammateTool)

Shared task list with dependency tracking, mailbox messaging, lead synthesizes all findings. Sweet spot: 3-5 teammates, 5-6 tasks each.

**Evidence:** [openai-anthropic-patterns.md](evidence/openai-anthropic-patterns.md)

---

## 9. Cross-Framework Comparison

### 9.1 Consolidation Mechanism Taxonomy

| Framework | Mechanism | LLM in Reduce? | Structured Output? | Fidelity Mechanism |
|---|---|---|---|---|
| LangChain/LangGraph | Recursive collapse + final combine | Yes (generic prompt) | No (free text) | None |
| LLMxMapReduce V1 | Structured protocol + confidence weighting | Yes (purpose-built) | Yes (4-field format) | Confidence calibration |
| LLMxMapReduce V2 | Entropy-driven convolutional refinement | Yes (multi-layer) | Yes (skeleton + digests) | Entropy scoring + top-k |
| CrewAI | String concatenation with dividers | **No** | Pydantic (flattened) | None |
| AutoGen | Chat summary as carryover | Optional (`reflection_with_llm`) | No | None |
| Agent Zero | 5-action decision taxonomy | Yes (structured JSON) | Yes (JSON with metadata) | Similarity threshold + action safety rails |
| NexusSum | Progressive sequential compression | Yes (per-stage) | Scene headers | Iteration rollback |
| OpenAI Agents SDK | Meta-agent synthesizes tool results | Yes (implicit) | Pydantic via `output_type` | None |
| Anthropic Orchestrator | Workers → XML tags → orchestrator | Yes (implicit) | XML-structured contracts | Citation agent (post-hoc) |
| Google ADK | `ParallelAgent` + `output_key` | Yes (template interpolation) | Named slots | None |

### 9.2 Token Overflow Strategies

| Strategy | Used By | Mechanism |
|---|---|---|
| Recursive collapse | LangChain, LangGraph, LLMxMapReduce V1 | Partition → LLM compress → re-measure → repeat |
| Iterative compression | NexusSum, LLMxMapReduce V2 | Compress → check threshold → repeat (with rollback) |
| Subagent distillation | Anthropic production | Each subagent returns 1-2K token summary |
| Tool result clearing | Claude Code | Remove stored tool results after value extraction |
| Server-side compaction | Claude Code | High-fidelity context window summarization |
| None (truncation) | CrewAI, AutoGen | Context overflow causes silent truncation |

### 9.3 Error Amplification (DeepMind/MIT, Dec 2025)

| Architecture | Error Amplification Factor |
|---|---|
| Unstructured multi-agent network | **17.2x** |
| Centralized coordination | 4.4x |
| Single agent baseline | 1.0x |

Gains plateau beyond 4 agents. Explicit I/O contracts at every boundary are essential.

---

## 10. Patterns Applicable to a /consolidate Skill

### Pattern 1: Structured Information Protocol (from LLMxMapReduce V1)

Maintain a fixed schema with confidence scores through all consolidation stages. Each source chunk produces:
- Extracted information (facts)
- Rationale (relevance analysis)
- Contribution (how it answers the consolidation goal)
- Confidence score (0-5)

The reduce step weights contributions by confidence, resolving conflicts by favoring higher-confidence sources.

### Pattern 2: Action Taxonomy (from Agent Zero)

When consolidating overlapping information, classify each pair into one of:
- **MERGE** — Complementary information → combine into comprehensive entry
- **REPLACE** — Newer/more accurate supersedes older (with similarity safety gate)
- **UPDATE** — Add new details to existing entry
- **KEEP_SEPARATE** — Distinct enough to maintain independently
- **SKIP** — Duplicate, no action needed

### Pattern 3: Recursive Collapse with Token Management (from LangChain)

When combined outputs exceed the consolidation context window:
1. Partition into groups that each fit under `token_max`
2. Collapse each group via LLM
3. Re-measure total tokens
4. Repeat until everything fits (with max retry limit)
5. Final reduce on the collapsed set

### Pattern 4: Iterative Refinement with Rollback (from NexusSum + LLMxMapReduce V2)

Don't rely on single-pass consolidation. Iterate:
1. Generate initial consolidation
2. Evaluate quality (entropy scoring, fidelity check)
3. If below threshold, refine
4. If over-compressed (crossed below target), rollback to previous iteration

### Pattern 5: Typed Output Contracts at Every Boundary (from OpenAI/Anthropic/Pydantic AI)

Every agent in the consolidation pipeline should have typed input and output schemas. Use Pydantic models, JSON Schema, or XML contracts — never free text between consolidation stages.

### Pattern 6: Citation/Provenance Tracking (from Anthropic + Agent Zero)

Every consolidated claim should trace back to its source(s). Agent Zero tracks `consolidated_from` IDs; Anthropic's research system uses a post-synthesis CitationAgent. The consolidation output must include provenance metadata.

---

## Sources

### Primary Source Code
- [LangChain MapReduceDocumentsChain](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/map_reduce.py)
- [LangChain ReduceDocumentsChain](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/reduce.py)
- [LangGraph map-reduce notebook](https://github.com/langchain-ai/langchain/blob/master/docs/docs/how_to/summarize_map_reduce.ipynb)
- [thunlp/LLMxMapReduce](https://github.com/thunlp/LLMxMapReduce) (V1 + V2)
- [CrewAI formatter.py](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/utilities/formatter.py)
- [AutoGen conversable_agent.py](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/conversable_agent.py)
- [AutoGen chat.py](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/chat.py)
- [AutoGen society_of_mind_agent.py](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/contrib/society_of_mind_agent.py)
- [Agent Zero memory_consolidation.py](https://github.com/agent0ai/agent-zero/blob/main/python/helpers/memory_consolidation.py)
- [OpenAI Swarm](https://github.com/openai/swarm)
- [Cloudflare Agents — Anthropic Patterns](https://github.com/cloudflare/agents/blob/main/guides/anthropic-patterns/src/server.tsx)

### Documentation
- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [OpenAI Agents SDK — Multi-Agent Orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [OpenAI Parallel Agents Cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/parallel_agents)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic — Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic — Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Agent SDK — Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs)
- [Claude Code — Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [CrewAI Tasks](https://docs.crewai.com/en/concepts/tasks)
- [AutoGen Conversation Patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/)
- [Pydantic AI — Multi-Agent Applications](https://ai.pydantic.dev/multi-agent-applications/)
- [Google ADK — Multi-Agent Patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)

### Academic Papers
- [LLMxMapReduce V1 (arXiv:2410.09342)](https://arxiv.org/abs/2410.09342) — Structured Information Protocol
- [LLMxMapReduce V2 (arXiv:2504.05732)](https://arxiv.org/abs/2504.05732) — Entropy-Driven Convolutional Scaling
- [NexusSum (ACL 2025)](https://aclanthology.org/2025.acl-long.500/) — Hierarchical LLM Agents for Summarization
- [Scaling Agent Systems (arXiv:2512.08296)](https://arxiv.org/abs/2512.08296) — DeepMind/MIT Error Amplification Study
- [SurveyEval Benchmark](https://huggingface.co/datasets/R0k1e/SurveyEval)
