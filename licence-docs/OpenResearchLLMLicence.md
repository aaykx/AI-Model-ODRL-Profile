# OpenResearchLLMLicence.ttl

**Use Case:** UC-1 — CC-BY Academic Corpus → Open Research LLM  
**Expected Result:** ✓ COMPLIANT  
**Legal Basis:** CC-BY 4.0 §3(a); DSM Directive Art. 3(1); OSAID 1.0

---

## What Problem This Licence Solves

This is the **baseline compliant case** — the clean, correct scenario that every other use case is measured against. A university research lab downloads a CC-BY-licensed corpus from an institutional repository (like TCD TARA), trains an open LLM on it, and publishes the model under an open licence with all metadata intact.

The question it answers: *if everything is done correctly, does the compliance checker correctly say "compliant"?* Without this case, a checker that always returns "conflict" would pass every violation test and still be wrong.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one permission block**, **one prohibition block**, and three duties attached to the permission.

### Permission — AI Training for Research Actors

```turtle
odrl:permission [
    odrl:action aimd2:AITraining ;
    odrl:constraint [ aimd2:actorType odrl:eq aimd2:RecognisedResearchOrganisation ] ;
    odrl:constraint [ aimd2:actorType odrl:neq aimd2:CommercialPurpose ] ;
    odrl:duty [ odrl:action aimd2:ModelSharing ] ;
    odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
]
```

**Two constraints gate the permission:**
1. `actorType eq RecognisedResearchOrganisation` — the actor must be a university or public research body as defined by DSM Art. 3. This is the DSM Art. 3(1) TDM research exception, which only applies to non-commercial scientific research organisations.
2. `actorType neq CommercialPurpose` — explicitly excludes commercial entities, separating Art. 3 (research TDM, no opt-out rights) from Art. 4 (general TDM, opt-out allowed).

**Three duties must be satisfied to remain in the permission:**
- `ModelSharing` → the trained model weights must be publicly published (OSAID Share freedom)
- `InheritSourceLicence` → the CC-BY attribution obligation must appear on the downstream distribution (`downstreamLicenceURI` must be set)
- `ComplyWithArticle50` → the Art. 50 policy URL must be present (EU AI Act GPAI transparency)

### Prohibition — Commercial AI Training

```turtle
odrl:prohibition [
    odrl:action aimd2:AITraining ;
    odrl:constraint [ aimd2:actorType odrl:eq aimd2:CommercialPurpose ] ;
]
```

Commercial actors cannot use this corpus for training at all. This is what `checkCommercialConflict()` detects in UC-2 — when a downstream distribution carries `actorType=commercial` and its parent carries this licence, the prohibition fires.

### Propagation

```turtle
aimd2:propagatesObligationTo <https://example.com/policy/OpenResearchLLMLicence>
```

The attribution obligation flows to every downstream policy. In UC-14 (the 3-hop chain), this same licence appears at all four hops, and the `propagatesObligationTo` link is what allows the chain checker to verify that attribution was not lost at any intermediate step.

---

## How the Checker Uses This File

`checkNHopChain()` traverses the derivation chain starting from `OpenResearchLLMDist1`. At each hop it queries GraphDB for the ODRL policy attached via `odrl:hasPolicy`, then checks that:
- `trainingDatasetURL` is present (satisfies `AITraining` evidence)
- `modelWeightsURL` is present (satisfies `ModelSharing` evidence)
- `downstreamLicenceURI` is present (satisfies `InheritSourceLicence` evidence)
- `article50PolicyURL` is present (satisfies `ComplyWithArticle50` evidence)

In UC-1 the test distribution carries all four, so the checker returns `compliant: true`.

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AITraining` | `odrl:Action` | The governed activity |
| `aimd2:actorType` | `odrl:LeftOperand` | Gate on who can train |
| `aimd2:RecognisedResearchOrganisation` | `odrl:RightOperand` | DSM Art. 3 actor constraint |
| `aimd2:CommercialPurpose` | `odrl:RightOperand` | Prohibition trigger |
| `aimd2:ModelSharing` | `odrl:Action` (duty) | OSAID Share freedom |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | CC-BY attribution chain |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | EU AI Act transparency |
| `aimd2:propagatesObligationTo` | `rdf:Property` | Attribution flows downstream |
