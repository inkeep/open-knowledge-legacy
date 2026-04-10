---
title: "Framework Implementations of the Consolidation/Reduce Step"
description: "Evidence compilation covering how 10+ frameworks implement consolidation: LangChain/LangGraph (recursive collapse, state reducers), LLMxMapReduce V1+V2 (structured protocol, entropy refinement), CrewAI (string concatenation), AutoGen (summary carryover), Agent Zero (5-action taxonomy with safety rails), NexusSum (progressive compression with rollback), OpenAI Agents SDK, Anthropic patterns, and Google ADK. Includes cross-framework comparison matrix and error amplification data (17.2x for unstructured networks)."
created: 2026-03-21
last-updated: 2026-03-21
---

# Framework Implementations of the Consolidation/Reduce Step

## 1. LangChain / LangGraph

Sources:
- [MapReduceDocumentsChain source](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/map_reduce.py)
- [ReduceDocumentsChain source](https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/reduce.py)
- [LangGraph map-reduce tutorial notebook](https://github.com/langchain-ai/langchain/blob/master/docs/docs/how_to/summarize_map_reduce.ipynb)
- [LangGraph Graph API docs](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [LangGraph Send API reference](https://reference.langchain.com/python/langgraph/types/Send)

### 1.1 Legacy MapReduceDocumentsChain

**ReduceDocumentsChain Core Logic:**

```python
class ReduceDocumentsChain(BaseCombineDocumentsChain):
    combine_documents_chain: BaseCombineDocumentsChain
    collapse_documents_chain: Optional[BaseCombineDocumentsChain] = None
    token_max: int = 3000

    def _collapse(self, docs, token_max=None, callbacks=None, **kwargs):
        result_docs = docs
        _token_max = token_max or self.token_max
        while num_tokens is not None and num_tokens > _token_max:
            new_result_doc_list = _split_list_of_docs(
                result_docs, length_func, _token_max, **kwargs)
            result_docs = []
            for docs in new_result_doc_list:
                new_doc = _collapse_docs(docs, _collapse_docs_func, **kwargs)
                result_docs.append(new_doc)
            num_tokens = length_func(result_docs, **kwargs)
```

**Greedy Partitioning (`split_list_of_docs`):** Greedily adds documents to a sub-list until the token count exceeds `token_max`, then starts a new sub-list. A single document exceeding `token_max` causes a hard `ValueError`.

**Metadata Merging (Lossy):** Overlapping metadata keys are merged via comma-concatenation of stringified values -- a lossy operation that flattens structure.

```python
def _collapse_docs(docs, combine_document_func, **kwargs):
    result = combine_document_func(docs, **kwargs)
    combined_metadata = {k: str(v) for k, v in docs[0].metadata.items()}
    for doc in docs[1:]:
        for k, v in doc.metadata.items():
            if k in combined_metadata:
                combined_metadata[k] += f", {v}"  # lossy comma-concatenation
            else:
                combined_metadata[k] = str(v)
    return Document(page_content=result, metadata=combined_metadata)
```

**Default Prompts:**
- Map: `"Write a concise summary of the following:\n\n\"{text}\"\n\nCONCISE SUMMARY:"`
- Reduce: Same prompt as map by default; can be overridden with a separate collapse chain.

### 1.2 LangGraph Modern Implementation

**State Reducers:**

```python
class OverallState(TypedDict):
    contents: List[str]
    summaries: Annotated[list, operator.add]     # fan-in via list concatenation
    collapsed_summaries: List[Document]
    final_summary: str
```

`Annotated[list, operator.add]` -- when parallel nodes each return `{"summaries": [response]}`, results are concatenated rather than overwritten.

**Send() API for Dynamic Fan-Out:**

```python
def map_summaries(state: OverallState):
    return [Send("generate_summary", {"content": content}) for content in state["contents"]]
```

**Collapse as Graph Cycle:**

```python
def should_collapse(state) -> Literal["collapse_summaries", "generate_final_summary"]:
    num_tokens = length_function(state["collapsed_summaries"])
    if num_tokens > token_max:
        return "collapse_summaries"  # loop back
    else:
        return "generate_final_summary"
```

**Reduce Prompts:**
- Map: `"Write a concise summary of the following:\n\n{context}"`
- Reduce: `"The following is a set of summaries:\n{docs}\nTake these and distill it into a final, consolidated summary of the main themes."`

### 1.3 Key Observations

1. Both legacy and modern generations use identical collapse algorithm (split_list_of_docs + recursive LLM calls)
2. LangGraph makes the loop a visible, debuggable, checkpoint-able graph cycle
3. No structured output contracts by default -- free text only
4. No conflict resolution, confidence scoring, or fidelity verification
5. Metadata merging is lossy (comma concatenation of overlapping keys)
6. Single document exceeding `token_max` causes hard `ValueError`

---

## 2. LLMxMapReduce V1 + V2

Sources:
- [LLMxMapReduce GitHub Repository](https://github.com/thunlp/LLMxMapReduce)
- [V1 Paper: Simplified Long-Sequence Processing](https://arxiv.org/abs/2410.09342)
- [V2 Paper: Entropy-Driven Convolutional Test-Time Scaling](https://arxiv.org/abs/2504.05732)
- [SurveyEval Benchmark Dataset](https://huggingface.co/datasets/R0k1e/SurveyEval)

### 2.1 V1: Structured Information Protocol

**Pipeline:**

```python
class BasePipeline:
    def run(self, doc, question, chunk_size):
        split_docs = self.generator.chunk_docs(doc, chunk_size, question=question)
        map_result = self.generator.mr_map(split_docs, question)
        map_result = self.remove_chunk(map_result, irrelevant_note=['[NO INFORMATION]'])
        collapse_result = self.generator.mr_collapse(map_result, question, token_max=chunk_size)
        collapse_result = self.remove_chunk(collapse_result, irrelevant_note=['[NO INFORMATION]'])
        reduce_result = self.generator.mr_reduce(collapse_result, question)
        return reduce_result
```

**Four-Field Structured Output Protocol:** Every chunk produces:
```
Extracted Information:  (key facts relevant to the query)
Rationale:              (analysis of how facts answer the question)
Answer:                 (chunk-level answer, or "[NO INFORMATION]")
Confidence Score:       (0-5 numerical rating)
```

**Confidence Calibration (from config/qa.yaml):** Few-shot example:
- Jerry can swim: 5 points (directly stated)
- Jerry will become an athlete: 3.5 points (inferred)
- Jerry can play chess: 0 points (unrelated)

Collapse prompt: "Consider the confidence scores of each piece of extracted information to weigh their reliability."
Reduce prompt: "Your role is to integrate and reason through this information, weighing confidence scores to resolve any inconsistencies."

**Ablation Results:**

| Removed Component | Re.Avg | En.Avg |
|---|---|---|
| Full system | 99.56 | 41.23 |
| Without confidence calibration | 96.00 | -- |
| Without structured protocol | -- | 25.93 |

Scales to 1,280K tokens with Llama3-70B-Instruct (8K base context).

### 2.2 V2: Entropy-Driven Convolutional Test-Time Scaling

**Three-Stage Pipeline:**

```python
class EntirePipeline(Pipeline):
    def __init__(self, args):
        self.encode_pipeline = EncodePipeline(...)
        self.hidden_pipeline = HiddenPipeline(...)
        self.decode_pipeline = DecodePipeline(...)
    def _connect_nodes(self):
        self.encode_pipeline >> self.hidden_pipeline >> self.decode_pipeline
```

**Hidden Pipeline (Iterative Refinement):**

```python
class HiddenPipeline(Pipeline):
    def _connect_nodes(self):
        self.group_node >> self.skeleton_init_node >> self.digest_node >> self.output_node
        self.digest_node >> self.skeleton_refine_node >> self.digest_node  # LOOP
```

**Convolution Layer Hyperparameters:**
- 7 convolution layers
- Kernel width 3 (receptive field)
- result_num 10 (candidates per layer)
- top_k 6 (survivors per layer)
- 3 self-refinement iterations
- Best-of-3 candidates per refinement

**Entropy Scoring:** EvalOutlineNeuron scores skeletons 0-10 on:
- Structure entropy (logicality, redundancy, coverage)
- Chapter description entropy (extraction quality, relationship analysis)

Parsed from `<SCORE>...</SCORE>` tags.

**Topology-Aware Generation:**
- Leaf nodes: `ORCHESTRA_PROMPT` -- detailed synthesis with evidence-based analysis
- Parent nodes: `SUMMARY_PROMPT` -- cross-subsection integration and gap identification

**V2 Results (SurveyEval):**

| Metric | V2 | AutoSurvey | Vanilla |
|---|---|---|---|
| Structure | 95.00 | 86.00 | 94.44 |
| Faithfulness | 97.22 | 93.10 | 96.43 |
| Ref Precision | 95.50 | 50.12 | 25.48 |
| Ref Recall | 95.80 | 51.73 | 26.46 |
| Density | 474.90 | -- | 78.75 |
| Human win rate vs AutoSurvey | 75% | -- | -- |

---

## 3. CrewAI

Sources:
- [CrewAI formatter.py](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/utilities/formatter.py)
- [CrewAI i18n templates](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/translations/en.json)
- [CrewAI Tasks documentation](https://docs.crewai.com/en/concepts/tasks)

### 3.1 Core Mechanism: String Concatenation

```python
DIVIDERS: Final[str] = "\n\n----------\n\n"

def aggregate_raw_outputs_from_task_outputs(task_outputs: list[TaskOutput]) -> str:
    return DIVIDERS.join(output.raw for output in task_outputs)
```

### 3.2 TaskOutput Class

```python
class TaskOutput(BaseModel):
    raw: str = ""                       # Used for aggregation
    pydantic: BaseModel | None = None   # Flattened to text at aggregation boundary
    json_dict: dict[str, Any] | None = None
    agent: str
    output_format: OutputFormat = OutputFormat.RAW
```

Even with Pydantic structured outputs per-task, aggregation always uses `.raw` (text).

### 3.3 Context Resolution

```python
@staticmethod
def _get_context(task, task_outputs):
    if not task.context:
        return ""
    return (
        aggregate_raw_outputs_from_task_outputs(task_outputs)
        if task.context is NOT_SPECIFIED     # default: all prior outputs
        else aggregate_raw_outputs_from_tasks(task.context)  # explicit selection
    )
```

### 3.4 Prompt Injection Template

```json
"task_with_context": "{task}\n\nThis is the context you're working with:\n{context}"
```

### 3.5 CrewAI Flows

- `and_()` for fan-in (wait for all parallel tasks)
- `or_()` for first-available
- State-based aggregation

---

## 4. AutoGen

Sources:
- [AutoGen conversable_agent.py](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/conversable_agent.py)
- [AutoGen chat.py](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/chat.py)
- [AutoGen SocietyOfMindAgent](https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/contrib/society_of_mind_agent.py)
- [AutoGen Conversation Patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/)

### 4.1 Summary Methods

```python
DEFAULT_SUMMARY_PROMPT = "Summarize the takeaway from the conversation. Do not add any introductory phrases."
```

Two built-in: `"last_msg"` (default) and `"reflection_with_llm"`.

### 4.2 Carryover Accumulation

```python
def initiate_chats(chat_queue):
    finished_chats = []
    while current_chat_queue:
        chat_info = current_chat_queue.pop(0)
        _chat_carryover = chat_info.get("carryover", [])
        chat_info["carryover"] = _chat_carryover + [
            r.summary for i, r in enumerate(finished_chats)
            if i not in finished_chat_indexes_to_exclude_from_carryover
        ]
```

Format: `"{message}\nContext:\n{carryover_text}"`

### 4.3 Nested Chats

Returns summary of the LAST nested chat only:

```python
def _summary_from_nested_chats(chat_queue, ...):
    res = initiate_chats(chat_to_run)
    return True, res[-1].summary
```

### 4.4 SocietyOfMindAgent

```python
response_preparer = "Output a standalone response to the original request, without mentioning any of the intermediate discussion."
```

---

## 5. Agent Zero

Sources:
- [Agent Zero GitHub Repository](https://github.com/agent0ai/agent-zero)
- [DeepWiki -- Memory Consolidation System](https://deepwiki.com/frdel/agent-zero/4.3-memory-consolidation-system)
- [DeepWiki -- Memory Operations](https://deepwiki.com/agent0ai/agent-zero/5.3-memory-operations)

### 5.1 Four-Stage Pipeline

1. **Similar Memory Discovery** -- Hybrid search (semantic + keyword extraction via FAISS)
2. **Race Condition Validation** -- Verify discovered memories still exist
3. **LLM Analysis** -- Structured JSON decision with 5 possible actions
4. **Apply Consolidation** -- Execute chosen action with safety checks

### 5.2 Five-Action Taxonomy

```python
class ConsolidationAction(Enum):
    MERGE = "merge"
    REPLACE = "replace"
    KEEP_SEPARATE = "keep_separate"
    UPDATE = "update"
    SKIP = "skip"
```

### 5.3 LLM Output Schema

```json
{
  "action": "merge|replace|keep_separate|update|skip",
  "memories_to_remove": ["id1", "id2"],
  "memories_to_update": [
    {"id": "memory_id", "new_content": "...", "metadata": {...}}
  ],
  "new_memory_content": "final consolidated memory text",
  "metadata": {
    "consolidated_from": ["id1", "id2"],
    "historical_notes": "summary of older information",
    "importance_score": 0.8,
    "consolidation_type": "description of consolidation performed"
  },
  "reasoning": "brief explanation"
}
```

### 5.4 REPLACE Safety Rail

REPLACE requires >0.9 estimated similarity. Below this threshold, auto-downgrades to KEEP_SEPARATE.

**Configuration Thresholds:**
- `similarity_threshold`: 0.7 (discovery threshold)
- `max_similar_memories`: 10 (initial search limit)
- `max_llm_context_memories`: 5 (sent to LLM for analysis)
- `replace_similarity_threshold`: 0.9 (safety gate for REPLACE)
- `processing_timeout_seconds`: 60 (timeout with fail-safe)

### 5.5 Similarity Score Awareness

- >0.9: suitable for replacement
- 0.7-0.9: related but distinct, use caution
- <0.7: topically related but different, avoid REPLACE

### 5.6 Content Relationship Handling

- Complementary: merge into comprehensive memories
- Contradictory: analyze which is more accurate/current
- Duplicate: consolidate to eliminate redundancy
- Distinct but related: keep separate

### 5.7 Knowledge Source Awareness

- Imported files are more authoritative than conversation memories
- Avoid consolidating knowledge sources with conversation memories

### 5.8 Two-Layer Deduplication

Extraction prompt already merges related facts: "Do not break information related to the same subject into multiple memories. Instead of three memories 'User's dog is Max', 'Max is 6 years old', 'Max is white and brown', create one memory 'User's dog is Max, 6 years old, white and brown.'"

### 5.9 Metadata Tracking

- `consolidation_action`: action taken
- `consolidated_from`: list of merged memory IDs
- `replaced_memories`: list of replaced memory IDs
- `updated_from`: original memory ID for updates
- `importance_score`: LLM-assigned (0-1)

### 5.10 Background Execution

- `DeferredTask` threads -- never blocks agent loop
- 60-second timeout with fail-safe (memory not stored on timeout)
- Fallback on LLM failure: SKIP action (insert unchanged)

---

## 6. NexusSum

Sources:
- [NexusSum: Hierarchical LLM Agents for Long-Form Narrative Summarization](https://arxiv.org/abs/2505.24575)
- [ACL 2025 Proceedings](https://aclanthology.org/2025.acl-long.500/)

### 6.1 Three-Stage Sequential Pipeline

```
[Stage 1: Preprocessor P] -> [Stage 2: Summarizer S] -> [Stage 3: Compressor C]
    N' = P(n1)+P(n2)+...+P(nk)    S0 = S(n'1)+...+S(n'j)    Si = Ci(si-1,1)+...
```

`+` = string concatenation. Each agent processes chunks independently.

### 6.2 Chunking Strategies

| Stage | Method | Size |
|---|---|---|
| Preprocessor | Scene-based | 8 scenes per chunk |
| Summarizer | Scene-based | 8 scenes per chunk |
| Compressor | Sentence-based | delta tokens per chunk |

### 6.3 Iterative Compression with Rollback

```python
for i in range(1, max_iterations + 1):  # max 10 iterations
    Si = Ci(si-1,1) + Ci(si-1,2) + ... + Ci(si-1,li-1)
    if word_count(Si) <= theta:
        return S(i-1)  # PREVIOUS iteration (prevents over-compression)
return S(max_iterations)
```

Key: when compression crosses below target theta, returns PREVIOUS iteration's output to prevent over-compression.

### 6.4 Agent Prompts

- Preprocessor: "You are an expert script-to-narrative converter."
- Summarizer: "You are an expert storyteller. Create a concise summary."
- Compressor: "You are an expert storyteller. Create a concise meta summary of the given previous summary."

### 6.5 Factual Fidelity Mechanisms

1. Chunk-based grounding (8-scene chunks maintain local context)
2. Progressive refinement (each stage has a narrow transformation task)
3. Iteration rollback (prevents over-compression)
4. No explicit fact-checking agent

### 6.6 Human Evaluation Results (K-Drama)

| Metric | NexusSum | Zero-Shot |
|---|---|---|
| Key Events | 4.17 | 3.50 |
| Factuality | 4.00 | 3.50 |
| Readability | 2.17 | 4.17 |

### 6.7 NexusSumR (Reflection Stage)

Fourth agent rewrites for fluency:
- Readability: +1.5 points on 5-point scale
- Maintains factual accuracy
- Output: 234 words (vs NexusSum's 609)

### 6.8 Design Characteristics

- No inter-chunk communication within a stage
- No cross-stage feedback loops (except iterative compression)
- Strictly forward information flow
- "Hierarchical" = progressive compression, not agent hierarchy

---

## 7. OpenAI Agents SDK and Swarm

Sources:
- [OpenAI Agents SDK -- Multi-Agent Orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [OpenAI Parallel Agents Cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/parallel_agents)
- [OpenAI Function Calling Docs](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Swarm](https://github.com/openai/swarm)

### 7.1 Agents-as-Tools (Primary Pattern)

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

### 7.2 AsyncIO Manual Consolidation

```python
responses = await asyncio.gather(*(run_agent(agent, text) for agent in agents))
labeled = [f"### {r.last_agent.name}\n{r.final_output}" for r in responses]
final = await run_agent(meta_agent, "\n".join(labeled))
```

### 7.3 Structured Output with output_type

```python
agent = Agent(name="Extractor", output_type=CalendarEvent)
```

Critical constraint: `parallel_tool_calls=True` and `strict=True` structured outputs are incompatible.

### 7.4 Swarm Context Variables

Merge additively across handoffs -- lightweight shared state consolidation.

---

## 8. Anthropic Patterns

Sources:
- [Anthropic -- Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic -- Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic -- Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Agent SDK -- Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs)
- [Claude Code -- Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Anthropic Cookbook -- Orchestrator Workers](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb)

### 8.1 Parallelization: Sectioning and Voting

- Sectioning: Independent subtasks with programmatic aggregation
- Voting: Identical tasks run N times with threshold-based consensus

### 8.2 FlexibleOrchestrator (Cookbook)

XML-structured contracts: `<analysis>`, `<tasks>`, `<response>` tags.
Note: cookbook does NOT include a synthesis/reduce step -- returns raw worker results.

### 8.3 Multi-Agent Research System (Production)

- Iterative refinement loop (LeadResearcher evaluates, decides if more research needed)
- Artifact storage (subagents store to external systems, pass lightweight references)
- Citation layer (post-synthesis CitationAgent validates attribution)
- Subagent output distillation (1,000-2,000 token condensed summaries)
- Parallel execution cut research time by 90%, consumes ~15x more tokens

### 8.4 Context Engineering Patterns

- Sub-agent returns 1-2K token summary
- Tool result clearing after value extraction
- Server-side compaction (high-fidelity context summarization)
- Agentic note-taking persisted outside context window

### 8.5 Agent Teams (TeammateTool)

- Shared task list with dependency tracking + file-lock-based claiming
- Mailbox inter-agent messaging
- Lead synthesizes all findings
- Sweet spot: 3-5 teammates, 5-6 tasks each
- Quality gates via hooks (TeammateIdle, TaskCompleted)

---

## 9. Google ADK

Source: [Google ADK Multi-Agent Patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)

### 9.1 ParallelAgent + output_key

Named slots in shared state via `output_key`. Consolidator references keys via template interpolation.

---

## 10. Pydantic AI

Source: [Pydantic AI -- Multi-Agent Applications](https://ai.pydantic.dev/multi-agent-applications/)

### 10.1 Union Output Types

```python
flight_search_agent = Agent[None, FlightDetails | Failed](
    output_type=FlightDetails | Failed,  # Each registered as separate tool
)
```

---

## 11. Cross-Framework Comparison

### 11.1 CrewAI vs AutoGen

| Dimension | CrewAI | AutoGen |
|---|---|---|
| Aggregation unit | Task outputs (`.raw`) | Chat summaries |
| Method | String concatenation | LLM reflection or last message |
| LLM in reduce? | No | Optional |
| Structured output | Pydantic (flattened to text) | None built-in |
| Customization | Override i18n template | Custom callable |

### 11.2 Consolidation Pattern Taxonomy

1. **SDK-Native Tool Aggregation** (OpenAI as_tool, Google ADK output_key)
2. **Manual Fan-Out / LLM Reduce** (asyncio.gather, Promise.all)
3. **State-Reducer Aggregation** (LangGraph operator.add, ADK output_key)
4. **Iterative Refinement Loop** (Anthropic LeadResearcher, ADK LoopAgent)
5. **Artifact Storage + Lightweight References** (Anthropic production)
6. **Deterministic Aggregation** (jq, Pydantic routing -- no LLM reduce)

---

## 12. Error Amplification in Multi-Agent Systems

Source: DeepMind/MIT, "Scaling Agent Systems," Dec 2025. [arXiv:2512.08296](https://arxiv.org/abs/2512.08296)

| Architecture | Error Amplification |
|---|---|
| Unstructured multi-agent | **17.2x** |
| Centralized coordination | 4.4x |
| Single agent | 1.0x |

Key findings:
- Gains plateau beyond 4 agents
- Explicit I/O contracts at every boundary are essential
- Cloudflare implementation reference: [Anthropic Patterns server](https://github.com/cloudflare/agents/blob/main/guides/anthropic-patterns/src/server.tsx)
