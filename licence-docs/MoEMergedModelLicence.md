# MoEMergedModelLicence.ttl

**Use Case:** UC-12 — Expert A + Expert B (Llama) + Expert C → MoE Merged Model  
**Expected Result:** ✗ MoE OBLIGATION INHERITANCE FAILURE  
**Legal Basis:** Meta Llama Community License §2; Mixtral (Jiang et al. 2024); Jewitt et al. (2025); DeepSeek-R1 technical report

---

## What Problem This Licence Solves

Mixture-of-Experts (MoE) architectures — used in Mixtral, DeepSeek-MoE, and others — combine multiple separately-trained expert models into a single deployment unit. Each expert may have been trained and licensed independently. When the experts are merged, the resulting model must carry the obligations of **all** its expert sources. Specifically, **the strictest licence among the experts should govern the merged model**.

The Llama Community License §2 imposes two unusual obligations:
1. Any commercial product built on Llama that exceeds **700 million monthly active users** must obtain a separate commercial licence from Meta
2. Companies using Llama within the EU must comply with specific EU deployment provisions

These obligations survive into any derivative model — including a MoE merge that includes even one Llama expert. If the merged model is published under `OpenResearchLLMLicence` (which has no MAU threshold), the Llama obligation has been silently dropped. Jewitt et al. (2025) found this type of obligation stripping is especially common at model combination points.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one MAU-constrained permission** (sharing the merged model below the threshold) and **one prohibition** (sharing above the threshold without a Meta commercial agreement).

### Permission — Sharing the Merged Model Within 700M MAU

```turtle
odrl:permission [
    odrl:action aimd2:ModelSharing ;
    odrl:constraint [
        odrl:leftOperand  odrl:count ;
        odrl:operator     odrl:lt ;
        odrl:rightOperand "700000000"^^xsd:integer ;
    ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceProhibitions ] ;
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
]
```

The `odrl:count` left operand (from ODRL core) represents the number of users. The constraint `odrl:count lt 700000000` encodes the Llama §2 threshold directly in ODRL. Below 700M MAU, the merged model may be shared under the community licence with three duties:
- `InheritSourceLicence` → all expert licences must be declared via `downstreamLicenceURI`
- `InheritSourceProhibitions` → prohibited uses from any expert (especially Llama's prohibited use list) survive
- `ComplyWithArticle50` → EU AI Act Art. 50/53 transparency

### Prohibition — Sharing Above 700M MAU Without Agreement

```turtle
odrl:prohibition [
    odrl:action aimd2:ModelSharing ;
    odrl:constraint [
        odrl:leftOperand  odrl:count ;
        odrl:operator     odrl:gteq ;
        odrl:rightOperand "700000000"^^xsd:integer ;
    ] ;
]
```

Above the threshold, a separate commercial agreement with Meta is required before the merged model can be distributed or deployed. Without such an agreement, sharing is prohibited.

### The Propagation Link

```turtle
aimd2:propagatesObligationTo <https://example.com/policy/MoEMergedModelLicence>
```

This is what makes the checker detect a violation in UC-12. The `checkMoEInheritance()` function looks for expert parent distributions whose policies declare `propagatesObligationTo` pointing to themselves. When it finds `MoEMergedModelLicence` on `ExpertBDist12`, it then checks whether the merged distribution (`MoEMergedDist12`) has a policy that carries equivalent obligations. `MoEMergedDist12` uses `OpenResearchLLMLicence`, which has no MAU constraint — obligation not inherited → violation.

---

## The "Strictest Survives" Principle

The design principle encoded here: when merging N expert models, the merged model's licence obligations must be the **union** of all expert obligations. If any expert has a condition that the others do not (MAU threshold, EU deployment clause, prohibited use list), that condition must appear in the merged model's licence.

This is conservative — it can flag cases where the experts' licences are actually compatible and the MAU threshold would never be reached. But for compliance purposes, erring on the side of inclusion is correct behaviour.

---

## How the Checker Uses This File

`checkMoEInheritance("MoEMergedDist12")`:
1. Finds all expert parent distributions via `aimd:derivedFromDistribution`
2. For each expert, follows `odrl:hasPolicy` to its policy
3. Checks if the expert policy declares `aimd2:propagatesObligationTo` pointing to itself
4. Finds `ExpertBDist12 → MoEMergedModelLicence → propagatesObligationTo MoEMergedModelLicence`
5. Checks whether `MoEMergedDist12`'s policy (`OpenResearchLLMLicence`) carries the same obligations
6. `OpenResearchLLMLicence` has no `odrl:count lt 700M` constraint → obligation not inherited
7. Returns `compliant: false`, `conflict: "moe-inheritance: Llama MAU threshold not inherited into merged model"`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:ModelSharing` | `odrl:Action` | Sharing the merged model |
| `odrl:count` | `odrl:LeftOperand` | MAU threshold check (ODRL core) |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | All expert licences declared |
| `aimd2:InheritSourceProhibitions` | `odrl:Action` (duty) | Expert prohibited uses carried forward |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | EU AI Act transparency |
| `aimd2:propagatesObligationTo` | `rdf:Property` | MAU obligation propagates to merged model |
