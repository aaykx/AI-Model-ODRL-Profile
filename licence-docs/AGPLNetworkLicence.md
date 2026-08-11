# AGPLNetworkLicence.ttl

**Use Case:** UC-8 — Apache 2.0 Base Model → AGPL Fine-Tune → Network API Deployment  
**Expected Result:** ✗ AGPL §13 NETWORK COPYLEFT VIOLATION  
**Legal Basis:** AGPLv3 §13; Black Duck OSSRA four-tier risk classification

---

## What Problem This Licence Solves

AGPLv3 (Affero General Public License) is unique among open source licences. Standard copyleft (GPL) triggers when you **distribute** the software. AGPL §13 extends this to **network use** — if you deploy an AGPL-licensed program as a web service and users interact with it over a network, you must offer those users the source code, even though you have not distributed a binary.

For AI models this creates a scenario that most existing compliance tools miss entirely: a company fine-tunes an Apache 2.0 model using an AGPL-licensed intermediate (perhaps a reference implementation or training framework), deploys the result as an API, and never offers the model weights to users. Under §13 this is a copyleft violation — the network deployment is the trigger, not distribution.

**Black Duck OSSRA** classifies licences into four tiers: permissive → weak copyleft → strong copyleft → network copyleft. AGPL is the only licence in the network copyleft tier, which is why it needs its own use case.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one constrained permission** (inference on network, with source duty) and **one prohibition** (network deployment without source disclosure).

### Permission — Network Inference with Source Disclosure

```turtle
odrl:permission [
    odrl:action aimd2:AIInference ;
    odrl:constraint [
        aimd2:deploymentContext odrl:eq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#NetworkDeployment>
    ] ;
    odrl:duty [ odrl:action aimd2:ModelSharing ] ;          # §13: offer source to users
    odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;  # downstream also AGPL
]
```

Network deployment as an API is **permitted**, but with two duties:
- `ModelSharing` → the model weights URL must be published and made available to users interacting with the API. This is the direct translation of AGPLv3 §13's "corresponding source" requirement.
- `InheritSourceLicence` → any downstream model built from this one must also be AGPL (standard copyleft propagation).

The constraint `deploymentContext eq NetworkDeployment` is what makes this AGPL-specific. Without this constraint, the permission would apply to local deployment too, which does not trigger §13.

### Prohibition — Network Deployment Without Source Disclosure

```turtle
odrl:prohibition [
    odrl:action aimd2:AIInference ;
    odrl:constraint [
        aimd2:deploymentContext odrl:eq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#NetworkDeployment>
    ] ;
    # Prohibition fires when modelWeightsURL is absent
]
```

This prohibition mirrors the permission but fires when the source has not been disclosed. In the test data, `NetworkAPIDist8` carries `aimd2:deploymentContext "network"` but has **no** `aimd2:modelWeightsURL`. The checker detects this gap — network context present, weights URL absent — and returns the violation.

---

## The Three-Node Chain Design

UC-8 uses three nodes: `ApacheBaseNetworkDist8 → AGPLFineTuneDist8 → NetworkAPIDist8`. The intermediate AGPL fine-tune is necessary to show that the AGPL obligation travels through a hop. The `aimd:derivedFromDistribution*` property path in the SHACL shape (`AGPLNetworkTriggerShape`) uses the `*` (zero-or-more) operator so it catches the AGPL obligation regardless of how many hops away it was introduced.

---

## How the Checker Uses This File

`checkAGPLNetworkTrigger("NetworkAPIDist8")`:
1. Finds `aimd2:deploymentContext "network"` on the terminal distribution
2. Checks `aimd2:modelWeightsURL` — **absent** → potential violation
3. Walks upstream via `aimd:derivedFromDistribution*` to find any ancestor with an AGPL policy
4. Finds `AGPLFineTuneDist8` with `odrl:hasPolicy → AGPLNetworkLicence`
5. Confirms the `InheritSourceLicence` obligation exists in that policy
6. Returns `compliant: false`, `conflict: "agpl-§13: network deployment without modelWeightsURL"`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:AIInference` | `odrl:Action` | Network deployment as API |
| `aimd2:deploymentContext` | `odrl:LeftOperand` | Network vs local deployment gate |
| `aimd2:ModelSharing` | `odrl:Action` (duty) | AGPLv3 §13 source offer to network users |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | Downstream must also be AGPL |
| `aimd2:propagatesObligationTo` | `rdf:Property` | §13 obligation flows to all derivatives |
