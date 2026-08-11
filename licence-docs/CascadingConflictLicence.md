# CascadingConflictLicence.ttl

**Use Case:** UC-15 — Proprietary Data → Closed Model → Distillation → MoE Merge → Consumer Product (Worst Case)  
**Expected Result:** ✗ CASCADING UNRESOLVABLE CONFLICTS — 3 simultaneous conflict types  
**Legal Basis:** EU AI Act Art. 53(1)(c); EU Commission Draft Guidelines 19 May 2026; OWASP SCVS BOM Maturity Model; Meta Llama Community License §2

---

## What Problem This Licence Solves

This licence is the stress test — the worst-case scenario deliberately constructed to accumulate the maximum number of simultaneous, unresolvable conflicts across a 5-hop chain. It stacks three separate conflict patterns from earlier use cases:

1. **UC-6 pattern (distillation prohibition):** The chain starts with proprietary training data used by a competitor actor
2. **UC-12 pattern (MoE obligation inheritance failure):** The chain passes through a MoE merge step that drops obligations
3. **UC-10/Art.53 pattern (synthetic data disclosure gap):** Synthetic data generated in the chain is never disclosed in any Art. 53 policy URL

None of these conflicts can be resolved independently of the others, because they are structurally entangled:
- You cannot fix the Art. 53 disclosure gap by adding an `article50PolicyURL`, because the data provenance is proprietary and undisclosed — you do not know what to disclose
- You cannot fix the distillation prohibition by redesigning the chain, because the prohibition was on the data at hop 0 and has already been violated by the time you reach hop 4
- You cannot fix the MoE inheritance failure by changing the merged model's licence, because the underlying expert is tainted by the distillation

The OWASP Software Component Verification Standard / BOM Maturity Model provides the framework for assessing this: a chain where provenance is missing at multiple hops cannot be verified as a coherent Bill of Materials. This is the machine-readable encoding of that assessment.

---

## What the File Contains

The file defines a single ODRL `Policy` with **three prohibition blocks** (one per conflict type) and **two obligations** that cannot be satisfied (they are present to document what would be required if the chain were legitimate).

### Prohibition 1 — Distillation from Proprietary Source (UC-6 Pattern)

```turtle
odrl:prohibition [
    odrl:target  <https://example.com/assets/ProprietaryTrainingData> ;
    odrl:action  aimd2:AITraining ;
    odrl:constraint [
        aimd2:actorType odrl:eq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#CompetitorModelTrainer>
    ] ;
]
```

A competitor actor using proprietary training data for AI training is prohibited. This is the same structure as `ProprietaryDistillationLicence.ttl` (UC-6). In the 5-hop chain, `ClosedModelDist15` carries `actorType=competitor` — this prohibition fires at hop 1.

### Prohibition 2 — MoE Merge Without Inheriting Strictest Licence (UC-12 Pattern)

```turtle
odrl:prohibition [
    odrl:target  <https://example.com/assets/MoEStage> ;
    odrl:action  aimd2:ModelSharing ;
    odrl:constraint [
        aimd2:downstreamLicence odrl:neq <https://example.com/policy/MoEMergedModelLicence>
    ] ;
]
```

The MoE merge step cannot share the merged model if its `downstreamLicenceURI` does not carry the strictest expert licence (`MoEMergedModelLicence`). In the test data, `MoEMergeStepDist15` has no `downstreamLicenceURI` — this prohibition fires at hop 3.

### Prohibition 3 — GPAI Deployment Without Art. 53 Synthetic Data Disclosure

```turtle
odrl:prohibition [
    odrl:target  <https://example.com/assets/ConsumerProduct> ;
    odrl:action  aimd2:AIInference ;
    odrl:constraint [
        aimd2:dataGenerationMethod odrl:eq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#UndeclaredSynthetic>
    ] ;
]
```

The consumer product cannot be deployed as an inference service if its synthetic data provenance is undeclared. `ConsumerProductDist15` carries `dataGenerationMethod="synthetic-from-proprietary-teacher"` and has no `article50PolicyURL` — this prohibition fires at hop 4.

### Obligations That Cannot Be Satisfied

```turtle
odrl:obligation [ odrl:action aimd2:ComplyWithArticle50 ] ;
odrl:obligation [ odrl:action aimd2:InheritSourceProhibitions ] ;
```

These obligations are present to document what compliance would require. They cannot be satisfied:
- `ComplyWithArticle50` requires knowing and disclosing all training data sources — impossible because the proprietary chain is opaque from hop 0
- `InheritSourceProhibitions` requires carrying forward the distillation prohibition — but the product is the result of that violation

The obligations remain in the policy to make the checker's output interpretable: it can say "these obligations exist AND cannot be met" rather than just "these prohibitions fire."

---

## Why `checkCascadingConflicts()` Does Not Short-Circuit

The key design decision for UC-15: the checker must aggregate **all three conflict types** and report them simultaneously. A checker that stopped at the first failure (prohibition 1 at hop 1) would miss prohibitions 2 and 3. For compliance remediation purposes, knowing all three conflicts exist is materially more useful than knowing only the first one.

`checkCascadingConflicts("ConsumerProductDist15")` calls:
- `checkDistillationProhibition()` on every hop
- `checkSyntheticDataDisclosure()` on every hop
- `checkAGPLNetworkTrigger()` on every hop (detects the network deployment at hop 4)
- `checkMoEInheritance()` on every hop

All results are accumulated into a single `conflicts[]` array before returning. The smoke test E-23 specifically asserts that `conflicts.length >= 3` — verifying that all three conflict types were detected without short-circuiting.

---

## The `propagatesObligationTo` Self-Link

```turtle
aimd2:propagatesObligationTo <https://example.com/policy/CascadingConflictLicence>
```

Every hop in the chain uses this same licence policy, and the policy propagates to itself. This creates the cascading structure: the prohibition at hop 0 propagates forward through the entire chain, accumulating additional violations at each subsequent hop. The chain has no "clean" hops.

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AITraining` | `odrl:Action` | Prohibited: training by competitor on proprietary data |
| `aimd2:ModelSharing` | `odrl:Action` | Prohibited: MoE sharing without inheriting strictest licence |
| `aimd2:AIInference` | `odrl:Action` | Prohibited: consumer deployment without synthetic disclosure |
| `aimd2:actorType` | `odrl:LeftOperand` | Competitor detection (UC-6 pattern) |
| `aimd2:downstreamLicence` | `odrl:LeftOperand` | MoE inheritance check (UC-12 pattern) |
| `aimd2:dataGenerationMethod` | `odrl:LeftOperand` | Synthetic disclosure gap (UC-10 pattern) |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (obligation) | Required but cannot be satisfied |
| `aimd2:InheritSourceProhibitions` | `odrl:Action` (obligation) | Required but cannot be satisfied |
| `aimd2:propagatesObligationTo` | `rdf:Property` | Cascades all conflicts through all 5 hops |
