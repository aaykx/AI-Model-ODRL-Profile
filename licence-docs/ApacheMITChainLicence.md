# ApacheMITChainLicence.ttl

**Use Case:** UC-7 — Apache 2.0 Base Model → Fine-Tuning → MIT Student Model  
**Expected Result:** ✓ COMPLIANT  
**Legal Basis:** Apache 2.0 §4/4(c); Jewitt et al. (2025) §4.2

---

## What Problem This Licence Solves

Apache 2.0 is one of the most widely used permissive licences for open AI models (Llama 3 and many HuggingFace models use it). It has **no copyleft** — you can fine-tune an Apache 2.0 model and publish the derivative under a different licence, including MIT. This is the "permissive-to-permissive" baseline.

However, Jewitt et al. (2025) empirically showed that the most common failure in permissive-to-permissive transitions is **silent attribution loss** — the `baseModelURL` (pointing to the original Apache model) is simply not included in the fine-tuned model card. The model still legally works under MIT, but nobody knows where it came from. Apache 2.0 §4 requires that attribution and NOTICE files be preserved.

This licence tests that the checker correctly identifies permissive-to-permissive relicensing as **compliant** (true positive) while also verifying that attribution metadata has not been silently dropped. If `baseModelURL` is missing, the checker would flag it — not as a copyleft violation, but as an attribution evidence gap.

---

## What the File Contains

The file defines a single ODRL `Policy` with **two permission blocks** — one for fine-tuning with attribution duties, and one for sharing the fine-tuned model under a permissive downstream licence.

### Permission 1 — Fine-Tuning with Attribution Duties

```turtle
odrl:permission [
    odrl:action aimd2:FineTuning ;
    odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;  # carry baseModelURL
    odrl:duty [ odrl:action aimd2:ModelSharing ] ;          # publish new weights
]
```

Fine-tuning is unconditionally permitted (no actor-type constraint — Apache 2.0 allows commercial use). The two duties enforce Apache 2.0's attribution requirements:
- `InheritSourceLicence` → the fine-tuned distribution must carry `downstreamLicenceURI` linking back to the Apache source model's licence
- `ModelSharing` → the new model weights must be published (`modelWeightsURL`)

Note the absence of a copyleft constraint. There is no `odrl:constraint` on `downstreamLicence` requiring it to be Apache-compatible — because Apache 2.0 does not require ShareAlike. Any permissive downstream licence is acceptable.

### Permission 2 — Sharing the Fine-Tuned Model Under a Permissive Licence

```turtle
odrl:permission [
    odrl:action aimd2:ModelSharing ;
    odrl:constraint [
        aimd2:downstreamLicence odrl:isA <https://example.com/policy/ApacheMITChainLicence>
    ] ;
]
```

Model sharing is permitted provided the downstream licence is permissive-compatible (MIT qualifies). The `isA` operator here means "is a subtype of" — both MIT and Apache 2.0 are subtypes of permissive-compatible licences relative to this policy.

---

## Why There Is No Prohibition Block

Unlike UC-2 (NC conflict) and UC-3 (copyleft), Apache 2.0 has no prohibitions on who can use the model or what licence derivatives must carry. Adding a prohibition block would be incorrect — it would make the licence more restrictive than Apache 2.0 actually is. The absence of prohibition blocks is itself a design choice that reflects the permissive nature of the source licence.

---

## How the Checker Uses This File

`checkNHopChain("MITStudentDist7", 2)` (reusing the general chain checker):
1. Traverses `ApacheBaseDist7 → MITStudentDist7` via `aimd:derivedFromDistribution`
2. At each hop, queries the ODRL policy for mandatory obligations
3. Checks `baseModelURL` is present on `MITStudentDist7` (satisfies `InheritSourceLicence` evidence)
4. Checks `modelWeightsURL` is present (satisfies `ModelSharing` evidence)
5. No prohibition matches → `compliant: true`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:FineTuning` | `odrl:Action` | Governed activity (permitted) |
| `aimd2:ModelSharing` | `odrl:Action` | Sharing the fine-tuned derivative |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | Apache §4 attribution — carry `baseModelURL` |
| `aimd2:downstreamLicence` | `odrl:LeftOperand` | Permissive-compatible check |
