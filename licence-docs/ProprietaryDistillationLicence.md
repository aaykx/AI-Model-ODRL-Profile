# ProprietaryDistillationLicence.ttl

**Use Case:** UC-6 — Proprietary LLM API → Unauthorised Distillation → Open Student Model  
**Expected Result:** ✗ CONTRACTUAL PROHIBITION VIOLATED  
**Legal Basis:** Contractual ToS prohibition; US Copyright Office Part 2 (2025); Anthropic AUP (Feb 2026); OpenAI ToS §2(c)

---

## What Problem This Licence Solves

Model distillation — using a large proprietary LLM (the "teacher") to generate synthetic training data for a smaller model (the "student") — is one of the most contested practices in AI today. Anthropic, OpenAI, and others have explicitly prohibited this in their Terms of Service, and both companies made public statements about coordinated distillation-attack campaigns in February 2026 (referencing DeepSeek-R1).

The legal mechanism is important: the US Copyright Office Part 2 Report (2025) confirmed that AI-generated outputs are **not copyrightable**. There is no protected expression in the generated text. The violation is therefore not a copyright claim — it is a **contractual** one. When a developer registers for an LLM API, they agree to Terms of Service. Those ToS terms bind them and — critically — any artefact they create using the API's outputs.

This licence models **both layers** of that legal reality:

- **Layer 1 — Prohibition:** Competitor actors are directly prohibited from training on API outputs.
- **Layer 2 — Constraint inheritance:** Any actor who trains on API outputs, even in a scenario where that training was somehow permitted, must carry ALL of the source's ToS constraints forward into the derived model's policy. The derived model is bound by the same terms as the original API user.

Layer 2 is the key insight: the prohibition is not a standalone rule added on top of copyright — it is an *inherited contractual constraint*. This is structurally analogous to GPL copyleft (use GPL code → your code becomes GPL), but the legal basis is contract, not copyright.

---

## What the File Contains

The file defines a single ODRL `Policy` with one inference permission (with a constraint-inheritance duty), three prohibition blocks, and **two obligations** that encode the inheritance mechanism.

### Permission — Standard API Inference (Non-Competitors Only)

```turtle
odrl:permission [
    odrl:action aimd2:AIInference ;
    odrl:constraint [ aimd2:actorType odrl:neq <CompetitorModelTrainer> ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceProhibitions ] ;
]
```

Standard API usage for inference is allowed for non-competitors. But crucially, a **duty is attached even to the permitted use**: `InheritSourceProhibitions`. This means that even when someone legitimately calls the API for inference, they are contractually agreeing that any outputs they use downstream must carry the source's prohibitions. The duty on the permission makes the contractual relationship explicit in machine-readable form.

### Prohibition 1 — Any AI Training on API Outputs (Broadest)

```turtle
odrl:prohibition [
    odrl:action aimd2:AITraining ;
]
```

No constraint — applies universally. Using API outputs as training data violates ToS regardless of actor type or purpose.

### Prohibition 2 — Any Fine-Tuning on API Outputs

```turtle
odrl:prohibition [
    odrl:action aimd2:FineTuning ;
]
```

Listed separately because `FineTuning` (evidence: `baseModelURL`) is formally distinct from `AITraining` (evidence: `trainingDatasetURL`). A pipeline that fine-tunes a base model on teacher outputs is covered by this block.

### Prohibition 3 — Competitor Distillation (Specific Trigger)

```turtle
odrl:prohibition [
    odrl:action aimd2:AITraining ;
    odrl:constraint [ aimd2:actorType odrl:eq <CompetitorModelTrainer> ] ;
]
```

This is the specific signal `checkDistillationProhibition()` detects. It is more specific than Prohibition 1 (which is universal) because it allows the checker to identify the *category* of violation: not just "training happened" but "competitor training happened."

### Obligation 1 — Constraint Inheritance (Layer 2 — The Core Mechanism)

```turtle
odrl:obligation [
    odrl:action aimd2:InheritSourceProhibitions ;
]
```

This is the new addition. It makes explicit that a derived model — whether the training was a contractual violation or not — is **contractually obligated** to carry forward all of this source's ToS prohibitions. The evidence property for `InheritSourceProhibitions` is `aimd2:derivedModelLicenceURI`, which must point to a policy that includes the source's prohibited use list.

In UC-6, `UnauthorisedDistillationDist6` has no `derivedModelLicenceURI` — it uses `OpenResearchLLMLicence`, which contains no ToS restrictions at all. This is a second failure signal on top of the prohibition: not only was the training prohibited, but the derived model's policy contains no trace of the source's constraints.

### Obligation 2 — Synthetic Provenance Disclosure

```turtle
odrl:obligation [
    odrl:action aimd2:ComplyWithArticle50 ;
]
```

The derived model must disclose in its Art. 50/53 policy that it was trained on (or derived from) a proprietary teacher model. This connects to UC-10's synthetic data disclosure requirement — a model trained on proprietary teacher outputs must declare that provenance, regardless of whether the training itself was authorised.

---

## The Two-Layer Structure vs. The Original Single-Layer

The original version of this file only had the three prohibition blocks (Layer 1). The revision adds Layer 2: the `InheritSourceProhibitions` obligation on both the permission and as a standalone obligation.

**Why Layer 2 matters:**

| Scenario | Layer 1 only | Layer 1 + Layer 2 |
|---|---|---|
| Competitor trains on outputs | ✗ detected (prohibition fires) | ✗ detected (prohibition + inheritance failure) |
| Non-competitor trains on outputs (hypothetical) | Not detected | ✗ detected (obligation to inherit constraints not met) |
| Derived model published under wrong licence | Not detected | ✗ detected (no `derivedModelLicenceURI` carrying source constraints) |

Layer 2 catches cases that Layer 1 misses: a model that was built from prohibited distillation but is then published without any acknowledgement of the source's constraints. The derived model's licence itself becomes a compliance artefact.

---

## Analogy to GPL Copyleft

| GPL Copyleft (copyright basis) | ToS Constraint Inheritance (contract basis) |
|---|---|
| Use GPL code → your code must become GPL | Use proprietary API → your model must carry ToS constraints |
| Legal mechanism: copyright + copyleft | Legal mechanism: contract law + ToS |
| Evidence: `downstreamLicenceURI` pointing to GPL | Evidence: `derivedModelLicenceURI` pointing to ToS-bound policy |
| ODRL term: `InheritSourceLicence` | ODRL term: `InheritSourceProhibitions` |

Both are about obligations flowing downstream through a derivation chain. The difference is the legal basis and the direction of the obligation (ShareAlike vs. ToS binding).

---

## How the Checker Uses This File

`checkDistillationProhibition("UnauthorisedDistillationDist6")`:

1. Finds `aimd2:actorType "competitor"` on the derived distribution
2. Walks to parent via `aimd:derivedFromDistribution` → finds `ProprietaryLLMDist6`
3. Follows `odrl:hasPolicy` → finds this licence
4. **Layer 1 check:** Detects `odrl:prohibition` on `aimd2:AITraining` with competitor constraint → violation flagged
5. **Layer 2 check:** Detects `odrl:obligation` on `aimd2:InheritSourceProhibitions` → checks whether `UnauthorisedDistillationDist6` carries `aimd2:derivedModelLicenceURI` → absent → second violation flagged
6. Returns `compliant: false`, `conflicts: ["distillation-prohibited: competitor training", "constraint-inheritance: derivedModelLicenceURI absent"]`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AIInference` | `odrl:Action` | Permitted activity (with inheritance duty) |
| `aimd2:AITraining` | `odrl:Action` | Prohibited activity |
| `aimd2:FineTuning` | `odrl:Action` | Prohibited activity |
| `aimd2:actorType` | `odrl:LeftOperand` | Competitor vs non-competitor gate |
| `aimd2:InheritSourceProhibitions` | `odrl:Action` | **Constraint inheritance mechanism** — ToS flows to derived model |
| `aimd2:ComplyWithArticle50` | `odrl:Action` | Synthetic provenance disclosure |
| `aimd2:propagatesObligationTo` | `rdf:Property` | All ToS constraints bind derived models |
