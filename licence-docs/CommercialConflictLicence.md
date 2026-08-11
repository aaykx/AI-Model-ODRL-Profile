# CommercialConflictLicence.ttl

**Use Case:** UC-2 — CC-BY-NC Dataset → Commercial AI Product  
**Expected Result:** ✗ CONFLICT  
**Legal Basis:** CC-BY-NC 4.0 §3(b); DSM Directive Art. 4(3); EU AI Act Art. 53(1)(c)

---

## What Problem This Licence Solves

CC-BY-NC is one of the most common dataset licences in AI research — many public datasets on HuggingFace, Kaggle, and institutional repositories use it. The NC clause prohibits commercial use. When a company trains a commercial AI product on one of these datasets, there is a direct legal conflict.

This licence formally encodes that conflict as machine-readable ODRL so the checker can detect it automatically, rather than relying on a human to read the dataset licence and the model's commercial intent.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one permission** (non-commercial training only), **two prohibitions** (commercial training and commercial model sharing), and **one obligation** (inherit NC restrictions downstream).

### Permission — Non-Commercial AI Training Only

```turtle
odrl:permission [
    odrl:action aimd2:AITraining ;
    odrl:constraint [ aimd2:actorType odrl:neq aimd2:CommercialPurpose ] ;
]
```

Training is permitted, but **only** for actors whose `actorType` is not `CommercialPurpose`. A research lab, university, or non-commercial developer is allowed. A startup, enterprise, or GPAI provider is not.

### Prohibition 1 — Commercial AI Training (the conflict trigger)

```turtle
odrl:prohibition [
    odrl:action aimd2:AITraining ;
    odrl:constraint [ aimd2:actorType odrl:eq aimd2:CommercialPurpose ] ;
]
```

This is the ODRL triple that `checkCommercialConflict()` looks for when it walks the parent distribution's policy. When the derived distribution carries `aimd2:actorType "commercial"` and the parent policy contains this prohibition block, the checker returns `compliant: false` with a `NC-conflict` message.

### Prohibition 2 — Commercial Model Sharing

```turtle
odrl:prohibition [
    odrl:action aimd2:ModelSharing ;
    odrl:constraint [ aimd2:actorType odrl:eq aimd2:CommercialPurpose ] ;
]
```

Even if a commercial actor somehow obtains a model trained on the NC dataset, they cannot share it commercially. This closes the gap where someone might train privately and then distribute.

### Obligation — Inherit NC Prohibition Downstream

```turtle
odrl:obligation [
    odrl:action aimd2:InheritSourceProhibitions ;
]
```

Any derivative model must carry the NC prohibition forward. Combined with `propagatesObligationTo`, this means the conflict is not isolated to one hop — it propagates through every subsequent distribution in the chain.

---

## Why DSM Art. 4(3) Matters Here

DSM Directive Art. 4 creates a general TDM exception (anyone can train on lawfully accessed content). But Art. 4(3) allows rights holders to **machine-readably opt out** of this exception. A CC-BY-NC licence *is* that machine-readable opt-out for commercial actors. EU AI Act Art. 53(1)(c) requires GPAI providers to *honour* this opt-out. This licence file is the machine-readable expression of both the opt-out and the GPAI compliance obligation.

---

## How the Checker Uses This File

`checkCommercialConflict("CommercialProductDist2")` runs a SPARQL query:
1. Find the distribution's `actorType` — is it `"commercial"`?
2. Walk to the parent distribution via `aimd:derivedFromDistribution`
3. Follow `odrl:hasPolicy` to the parent's ODRL policy
4. Check for an `odrl:prohibition` block with `odrl:action aimd2:AITraining` and a commercial actor constraint

If all four conditions are true simultaneously, `compliant: false` is returned.

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AITraining` | `odrl:Action` | The governed activity |
| `aimd2:ModelSharing` | `odrl:Action` | Secondary prohibited activity |
| `aimd2:actorType` | `odrl:LeftOperand` | Commercial vs non-commercial gate |
| `aimd2:CommercialPurpose` | `odrl:RightOperand` | Prohibition trigger value |
| `aimd2:InheritSourceProhibitions` | `odrl:Action` (obligation) | NC restriction flows downstream |
| `aimd2:propagatesObligationTo` | `rdf:Property` | NC flows to all derivative policies |
