---
title: "LangChain/LangGraph Reduce Step Implementation"
source_type: source_code_analysis
sources:
  - url: "https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/map_reduce.py"
    title: "MapReduceDocumentsChain source"
  - url: "https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain/chains/combine_documents/reduce.py"
    title: "ReduceDocumentsChain source"
  - url: "https://github.com/langchain-ai/langchain/blob/master/docs/docs/how_to/summarize_map_reduce.ipynb"
    title: "LangGraph map-reduce tutorial notebook"
  - url: "https://docs.langchain.com/oss/python/langgraph/graph-api"
    title: "LangGraph Graph API docs"
  - url: "https://reference.langchain.com/python/langgraph/types/Send"
    title: "LangGraph Send API reference"
date_collected: "2026-03-21"
---

# LangChain/LangGraph Reduce Step Implementation

## Legacy MapReduceDocumentsChain

### ReduceDocumentsChain Core Logic

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

### split_list_of_docs — Greedy Partitioning

```python
def _split_list_of_docs(docs, length_func, token_max, **kwargs):
    new_result_doc_list = []
    _sub_result_docs = []
    for doc in docs:
        _sub_result_docs.append(doc)
        _num_tokens = length_func(_sub_result_docs, **kwargs)
        if _num_tokens > token_max:
            if len(_sub_result_docs) == 1:
                raise ValueError("A single document was longer than the context length")
            new_result_doc_list.append(_sub_result_docs[:-1])
            _sub_result_docs = _sub_result_docs[-1:]
    new_result_doc_list.append(_sub_result_docs)
    return new_result_doc_list
```

### Metadata Merging (Lossy)

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

### Default Prompts

Map: `"Write a concise summary of the following:\n\n\"{text}\"\n\nCONCISE SUMMARY:"`
Reduce: Same prompt as map by default; can be overridden with separate collapse chain.

## LangGraph Modern Implementation

### State Reducers

```python
class OverallState(TypedDict):
    contents: List[str]
    summaries: Annotated[list, operator.add]     # fan-in via list concatenation
    collapsed_summaries: List[Document]
    final_summary: str
```

`Annotated[list, operator.add]` — when parallel nodes each return `{"summaries": [response]}`, results are concatenated rather than overwritten.

### Send() API for Dynamic Fan-Out

```python
def map_summaries(state: OverallState):
    return [Send("generate_summary", {"content": content}) for content in state["contents"]]
```

### Collapse as Graph Cycle

```python
def should_collapse(state) -> Literal["collapse_summaries", "generate_final_summary"]:
    num_tokens = length_function(state["collapsed_summaries"])
    if num_tokens > token_max:
        return "collapse_summaries"  # loop back
    else:
        return "generate_final_summary"
```

### Reduce Prompts

Map: `"Write a concise summary of the following:\n\n{context}"`
Reduce: `"The following is a set of summaries:\n{docs}\nTake these and distill it into a final, consolidated summary of the main themes."`

## Key Observations

1. Both generations use identical collapse algorithm (split_list_of_docs + recursive LLM calls)
2. LangGraph makes the loop a visible, debuggable, checkpoint-able graph cycle
3. No structured output contracts by default — free text only
4. No conflict resolution, confidence scoring, or fidelity verification
5. Metadata merging is lossy (comma concatenation of overlapping keys)
6. Single document exceeding token_max causes hard ValueError
