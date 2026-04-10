---
title: "CrewAI and AutoGen Consolidation/Aggregation Mechanisms"
source_type: source_code_analysis
sources:
  - url: "https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/utilities/formatter.py"
    title: "CrewAI formatter.py (aggregate functions)"
  - url: "https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/translations/en.json"
    title: "CrewAI i18n templates"
  - url: "https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/conversable_agent.py"
    title: "AutoGen conversable_agent.py"
  - url: "https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/chat.py"
    title: "AutoGen chat.py"
  - url: "https://github.com/ag2ai/ag2/blob/main/autogen/agentchat/contrib/society_of_mind_agent.py"
    title: "AutoGen SocietyOfMindAgent"
  - url: "https://docs.crewai.com/en/concepts/tasks"
    title: "CrewAI Tasks documentation"
  - url: "https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/"
    title: "AutoGen Conversation Patterns"
date_collected: "2026-03-21"
---

# CrewAI Aggregation

## Core Mechanism: String Concatenation

```python
# formatter.py
DIVIDERS: Final[str] = "\n\n----------\n\n"

def aggregate_raw_outputs_from_task_outputs(task_outputs: list[TaskOutput]) -> str:
    return DIVIDERS.join(output.raw for output in task_outputs)
```

## Prompt Injection Template

```json
"task_with_context": "{task}\n\nThis is the context you're working with:\n{context}"
```

## TaskOutput Class

```python
class TaskOutput(BaseModel):
    raw: str = ""                       # Used for aggregation
    pydantic: BaseModel | None = None   # Flattened to text at aggregation boundary
    json_dict: dict[str, Any] | None = None
    agent: str
    output_format: OutputFormat = OutputFormat.RAW
```

Key: Even with Pydantic structured outputs per-task, aggregation always uses `.raw` (text).

## Context Resolution

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

## CrewAI Flows

- `and_()` for fan-in (wait for all parallel tasks)
- `or_()` for first-available
- State-based aggregation

---

# AutoGen Consolidation

## Summary Methods

```python
DEFAULT_SUMMARY_PROMPT = "Summarize the takeaway from the conversation. Do not add any introductory phrases."
```

Two built-in: `"last_msg"` (default) and `"reflection_with_llm"`.

## Carryover Accumulation

```python
def initiate_chats(chat_queue):
    finished_chats = []
    while current_chat_queue:
        chat_info = current_chat_queue.pop(0)
        _chat_carryover = chat_info.get("carryover", [])
        # Append ALL previous chat summaries
        chat_info["carryover"] = _chat_carryover + [
            r.summary for i, r in enumerate(finished_chats)
            if i not in finished_chat_indexes_to_exclude_from_carryover
        ]
```

Format: `"{message}\nContext:\n{carryover_text}"`

## Nested Chats

Returns summary of the LAST nested chat only:

```python
def _summary_from_nested_chats(chat_queue, ...):
    res = initiate_chats(chat_to_run)
    return True, res[-1].summary
```

## SocietyOfMindAgent

```python
response_preparer = "Output a standalone response to the original request, without mentioning any of the intermediate discussion."
```

## Comparison

| Dimension | CrewAI | AutoGen |
|---|---|---|
| Aggregation unit | Task outputs (`.raw`) | Chat summaries |
| Method | String concatenation | LLM reflection or last message |
| LLM in reduce? | No | Optional |
| Structured output | Pydantic (flattened to text) | None built-in |
| Customization | Override i18n template | Custom callable |
