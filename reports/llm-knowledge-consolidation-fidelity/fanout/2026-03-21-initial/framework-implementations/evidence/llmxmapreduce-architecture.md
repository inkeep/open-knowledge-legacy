---
title: "LLMxMapReduce V1/V2 Architecture and Consolidation Mechanisms"
source_type: source_code_and_paper
sources:
  - url: "https://github.com/thunlp/LLMxMapReduce"
    title: "LLMxMapReduce GitHub Repository"
  - url: "https://arxiv.org/abs/2410.09342"
    title: "V1 Paper: Simplified Long-Sequence Processing"
  - url: "https://arxiv.org/abs/2504.05732"
    title: "V2 Paper: Entropy-Driven Convolutional Test-Time Scaling"
  - url: "https://huggingface.co/datasets/R0k1e/SurveyEval"
    title: "SurveyEval Benchmark Dataset"
date_collected: "2026-03-21"
---

# LLMxMapReduce Architecture

## V1: Structured Information Protocol

### Pipeline (from pipeline.py)

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

### Four-Field Structured Output Protocol

Every chunk produces:
```
Extracted Information:  (key facts relevant to the query)
Rationale:              (analysis of how facts answer the question)
Answer:                 (chunk-level answer, or "[NO INFORMATION]")
Confidence Score:       (0-5 numerical rating)
```

### Confidence Calibration (from config/qa.yaml)

Few-shot example embedded in prompt ("Jerry" example):
- Jerry can swim: 5 points (directly stated)
- Jerry will become an athlete: 3.5 points (inferred)
- Jerry can play chess: 0 points (unrelated)

Collapse prompt: "Consider the confidence scores of each piece of extracted information to weigh their reliability."
Reduce prompt: "Your role is to integrate and reason through this information, weighing confidence scores to resolve any inconsistencies."

### Ablation Results

| Removed Component | Re.Avg | En.Avg |
|---|---|---|
| Full system | 99.56 | 41.23 |
| Without confidence calibration | 96.00 | — |
| Without structured protocol | — | 25.93 |

Scales to 1,280K tokens with Llama3-70B-Instruct (8K base context).

## V2: Entropy-Driven Convolutional Test-Time Scaling

### Three-Stage Pipeline

```python
class EntirePipeline(Pipeline):
    def __init__(self, args):
        self.encode_pipeline = EncodePipeline(...)
        self.hidden_pipeline = HiddenPipeline(...)
        self.decode_pipeline = DecodePipeline(...)
    def _connect_nodes(self):
        self.encode_pipeline >> self.hidden_pipeline >> self.decode_pipeline
```

### Hidden Pipeline (Iterative Refinement)

```python
class HiddenPipeline(Pipeline):
    def _connect_nodes(self):
        self.group_node >> self.skeleton_init_node >> self.digest_node >> self.output_node
        self.digest_node >> self.skeleton_refine_node >> self.digest_node  # LOOP
```

### Convolution Layers

Default hyperparameters:
- 7 convolution layers
- Kernel width 3 (receptive field)
- result_num 10 (candidates per layer)
- top_k 6 (survivors per layer)
- 3 self-refinement iterations
- Best-of-3 candidates per refinement

### Entropy Scoring

EvalOutlineNeuron scores skeletons 0-10 on:
- Structure entropy (logicality, redundancy, coverage)
- Chapter description entropy (extraction quality, relationship analysis)

Parsed from `<SCORE>...</SCORE>` tags.

### Topology-Aware Generation

- Leaf nodes: `ORCHESTRA_PROMPT` — detailed synthesis with evidence-based analysis
- Parent nodes: `SUMMARY_PROMPT` — cross-subsection integration and gap identification

### V2 Results (SurveyEval)

| Metric | V2 | AutoSurvey | Vanilla |
|---|---|---|---|
| Structure | 95.00 | 86.00 | 94.44 |
| Faithfulness | 97.22 | 93.10 | 96.43 |
| Ref Precision | 95.50 | 50.12 | 25.48 |
| Ref Recall | 95.80 | 51.73 | 26.46 |
| Density | 474.90 | — | 78.75 |
| Human win rate vs AutoSurvey | 75% | — | — |
