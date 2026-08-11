# CopyleftPropagationLicence.ttl

**Use Case:** UC-3 — CC-BY-SA Corpus → Fine-Tuned Model (Copyleft Stripped)  
**Expected Result:** ✗ VIOLATION  
**Legal Basis:** CC-BY-SA 4.0 §3(b) ShareAlike; *Andersen v. Stability AI*

---

## What Problem This Licence Solves

CC-BY-SA is a copyleft licence — the ShareAlike condition §3(b) requires that any derivative work be released under the same (or a compatible) licence. In software this is well understood. In AI, the question is whether a model trained on a CC-BY-SA corpus is a "derivative work" of that corpus. This is legally contested, but empirically the problem is clear: **Jewitt et al. (2025) found that 35.5% of model-to-application licence transitions strip or weaken restrictive clauses** like ShareAlike.

This licence formally encodes the ShareAlike obligation so the checker can detect when a fine-tuned model has been published under an incompatible licence or — worse — published with no downstream licence declared at all.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one permission** (fine-tuning with copyleft duties) and **one prohibition** (sharing with incompatible downstream licence).

### Permission — Fine-Tuning with ShareAlike Constraint

```turtle
odrl:permission [
    odrl:action aimd2:FineTuning ;
    odrl:constraint [
        odrl:leftOperand  aimd2:downstreamLicence ;
        odrl:operator     odrl:isA ;
        odrl:rightOperand <https://example.com/policy/CopyleftPropagationLicence> ;
    ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;
    odrl:duty [ odrl:action aimd2:ModelSharing ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceProhibitions ] ;
]
```

Fine-tuning is permitted, but only if the `downstreamLicence` constraint is satisfied — meaning the derivative model's licence URI must be a subtype of this licence (i.e., CC-BY-SA compatible). The three duties then require the fine-tuner to:
- Carry the downstream licence URI on the derivative distribution (`InheritSourceLicence` → `downstreamLicenceURI` property)
- Publish the model weights openly (`ModelSharing` → `modelWeightsURL` property)
- Not add restrictions beyond what CC-BY-SA already imposes (`InheritSourceProhibitions`)

### Prohibition — Sharing with Incompatible Downstream Licence

```turtle
odrl:prohibition [
    odrl:action aimd2:ModelSharing ;
    odrl:constraint [
        odrl:leftOperand  aimd2:downstreamLicence ;
        odrl:operator     odrl:neq ;
        odrl:rightOperand <https://example.com/policy/CopyleftPropagationLicence> ;
    ] ;
]
```

If the downstream distribution's licence URI is different from (i.e. incompatible with) the CC-BY-SA licence, sharing the model is prohibited. In UC-3 the test distribution `CopyleftViolatingModelDist3` has no `downstreamLicenceURI` at all — the checker treats absence as incompatible.

---

## The Legal Uncertainty and How We Handle It

*Andersen v. Stability AI* (trial September 2026) will be one of the first cases to consider whether trained model weights constitute a derivative work of training data. If the court rules they do not, UC-3 would return ✓ instead of ✗. 

The checker does not need to take a legal position. The ODRL policy declares the ShareAlike obligation; the checker detects whether it has been honoured. If law settles differently, only the expected result in the test case changes — the mechanism remains valid.

---

## How the Checker Uses This File

`checkCopyleftPropagation("CopyleftViolatingModelDist3")`:
1. Queries the parent distribution's ODRL policy for an `InheritSourceLicence` obligation
2. Checks whether the derived distribution carries `aimd2:downstreamLicenceURI`
3. If the obligation exists in the parent and the property is absent in the derivative → `compliant: false`, `conflict: "copyleft-violation: downstreamLicenceURI absent"`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:FineTuning` | `odrl:Action` | The governed activity |
| `aimd2:ModelSharing` | `odrl:Action` | Secondary governed activity |
| `aimd2:downstreamLicence` | `odrl:LeftOperand` | Copyleft compatibility check axis |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | Must carry `downstreamLicenceURI` |
| `aimd2:InheritSourceProhibitions` | `odrl:Action` (duty) | No extra restrictions permitted |
| `aimd2:propagatesObligationTo` | `rdf:Property` | SA obligation flows to all derivatives |
