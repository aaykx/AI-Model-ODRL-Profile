# InferenceChainLicence.ttl

**Use Case:** UC-13 — Planner LLM (A) → Structured Plan → Executor LLM (B) → Actions  
**Expected Result:** ✓ COMPLIANT — inference chain exempt from training obligations  
**Legal Basis:** W3C ODRL AI Vocabulary `odrl:ai-augment` vs `odrl:ai-training`; ReAct (Yao et al. 2023); OpenAI Assistants API / MCP tool-use

---

## What Problem This Licence Solves

This is the **anti-regression / true-negative test**. In multi-agent systems (ReAct agents, AutoGPT, OpenAI Assistants, Anthropic's MCP-based agents), LLMs are chained at runtime: one model (the planner) generates a structured plan, which is passed to another model (the executor), which acts on it. Neither model is being trained on the other's outputs — they are being used at inference time.

The risk this use case guards against: a naive compliance checker might see `aimd:derivedFromDistribution` between the planner and executor and conclude that the executor "derived from" the planner in a training sense. It would then incorrectly trigger `InheritSourceLicence` (copyleft propagation) and `AITraining` evidence checks on a model that was never trained on the planner's outputs at all.

If the checker incorrectly returns "conflict" here, it produces false positives that would flag every multi-agent inference pipeline as non-compliant. This licence explicitly establishes the exemption and the test verifies the checker respects it.

---

## What the File Contains

The file defines a single ODRL `Policy` with **two permission blocks** (planner inference, executor inference) and **two prohibition blocks** (training on planner outputs, fine-tuning on planner outputs). Notably, the file has **no training duties** — no `InheritSourceLicence`, no `ModelSharing`, no `AITraining` obligation.

### Permission 1 — Planner LLM Inference

```turtle
odrl:permission [
    odrl:target   <https://example.com/assets/PlannerLLM> ;
    odrl:action   aimd2:AIInference ;
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
]
```

The planner is permitted to run inference. The only duty is Art. 50 output transparency — the planner's outputs (plans, instructions) are AI-generated content and may need to be labelled as such.

### Permission 2 — Executor LLM Inference

```turtle
odrl:permission [
    odrl:target   <https://example.com/assets/ExecutorLLM> ;
    odrl:action   aimd2:AIInference ;
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
]
```

Identical structure for the executor. Again: `AIInference` only, not `AITraining` or `FineTuning`. The explicit `odrl:target` separation makes clear these are two distinct licensed assets operating at inference time.

### Prohibition 1 — No Training the Executor on Planner Outputs

```turtle
odrl:prohibition [
    odrl:target  <https://example.com/assets/PlannerLLM> ;
    odrl:action  aimd2:AITraining ;
]
```

If someone tried to use the planner's outputs as training data for the executor, this prohibition fires. The `PlannerLLM` asset governs the planner's outputs — it prohibits those outputs from being used as AITraining data. This closes the loop: it is not just that there are no training duties; there is an explicit prohibition on training.

### Prohibition 2 — No Fine-Tuning on Planner Outputs

```turtle
odrl:prohibition [
    odrl:target  <https://example.com/assets/PlannerLLM> ;
    odrl:action  aimd2:FineTuning ;
]
```

Same logic for fine-tuning specifically — `FineTuning` (which uses `baseModelURL`) is also prohibited to prevent the argument that using planner outputs as a fine-tuning dataset is a different activity than pre-training.

---

## The Design of the Test Distribution

`ExecutorLLMDist13` in the knowledge graph is deliberately constructed with:
- `aimd2:inferenceEndpointURL` present (inference is happening)
- `aimd2:deploymentContext "inference-chain"` (signals the context)
- **No** `aimd2:trainingDatasetURL`
- **No** `aimd2:baseModelURL`

The absence of `trainingDatasetURL` and `baseModelURL` is what Experiment E-21 (the smoke test) verifies. The test asserts that these properties are absent, confirming the checker has correctly identified this as an inference-only distribution and not triggered training obligations.

---

## Why This Licence Has No `propagatesObligationTo`

The `propagatesObligationTo` property is used when training obligations must flow downstream. Since this licence has no training-related obligations — only inference permissions — there is nothing to propagate. A downstream system that receives the executor's inference outputs is not a derivative in any legally meaningful sense.

---

## How the Checker Uses This File

`checkNHopChain("ExecutorLLMDist13", 2)` (reusing the general chain checker):
1. Traverses `PlannerLLMDist13 → ExecutorLLMDist13`
2. Finds `InferenceChainLicence` on both hops via `odrl:hasPolicy`
3. Queries for mandatory obligations in the policy — finds only `ComplyWithArticle50`
4. Checks `article50PolicyURL` — present (in the test data)
5. Checks for `AITraining`/`FineTuning` obligations — **none present**
6. No prohibition matches against the distribution's properties
7. Returns `compliant: true` — inference chain exempt from training obligations

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AIInference` | `odrl:Action` | Permitted activity (both models) |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | Output transparency only |
| `aimd2:AITraining` | `odrl:Action` | **Prohibited** on planner outputs |
| `aimd2:FineTuning` | `odrl:Action` | **Prohibited** on planner outputs |
