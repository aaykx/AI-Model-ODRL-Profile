# RAGPolicySetLicence.ttl

**Use Case:** UC-11 — Retriever Model + Document Corpus → Generator Model → RAG Output  
**Expected Result:** Multi-asset PolicySet satisfied (both licences must be met simultaneously)  
**Legal Basis:** IDS-RAM 4.0; W3C ODRL PolicySet; Lewis et al. (2020) RAG architecture; Hugging Face OLDI seed developer certificate

---

## What Problem This Licence Solves

A Retrieval-Augmented Generation (RAG) system is not a single model — it is a composition of at least two licensed assets: the **retriever model** (which encodes and indexes documents) and the **document corpus** (the actual data being retrieved). When a user query is answered, both assets are active simultaneously. The retriever's model licence and the corpus's data licence must both be satisfied at inference time.

Prior work (Cian's and Diya's profiles) modelled training-time licence composition. RAG is different — the corpus is not a training input; it is consumed at **query time** on every inference call. The licence obligations are ongoing, not one-time. A corpus licensed under CC-BY requires attribution in every generated output that quotes or paraphrasesthat corpus content. This is not a training-time obligation; it is an inference-time obligation.

This is the only licence file in the project that uses an ODRL `PolicySet` — the W3C mechanism for grouping multiple policies that apply to a single operation.

---

## What the File Contains

The file defines **four RDF resources**: a `PolicySet` grouping two sub-policies, and an alias for backward compatibility.

### 1. The PolicySet — Groups Both Licences

```turtle
<https://example.com/policy/RAGPolicySet>
    a odrl:PolicySet ;
    odrl:profile <https://example.com/policy/RetrieverModelLicence> ;
    odrl:profile <https://example.com/policy/RAGCorpusLicence> .
```

`odrl:PolicySet` is the W3C ODRL mechanism for saying "this operation requires all of these policies to be satisfied simultaneously." The two `odrl:profile` links point to the retriever licence and the corpus licence. A RAG request is only compliant if both policies are individually satisfied.

This is the IDS-RAM 4.0 approach to multi-party rights management: each asset owner declares their own policy, and the consuming system must compose and satisfy all of them.

### 2. Retriever Model Licence

```turtle
<https://example.com/policy/RetrieverModelLicence>
    a odrl:Policy, odrl:Set ;
    odrl:permission [
        odrl:action aimd2:AIInference ;
        odrl:duty [ odrl:action aimd2:RAGIngestion ] ;
    ] ;
    aimd2:propagatesObligationTo <https://example.com/policy/RAGCorpusLicence> .
```

Permits inference (running the retriever) provided the corpus ingestion (`RAGIngestion`) is governed by the corpus licence. The `propagatesObligationTo` link explicitly chains: the retriever licence's obligations propagate into the corpus licence. This is how the PolicySet composition is expressed in the graph: two policies linked by a propagation relationship.

### 3. Corpus Data Licence

```turtle
<https://example.com/policy/RAGCorpusLicence>
    a odrl:Policy, odrl:Set ;
    odrl:permission [
        odrl:action aimd2:RAGIngestion ;
        odrl:duty [ odrl:action aimd2:InheritSourceLicence ] ;  # attribution in generated output
        odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
    ] ;
    aimd2:propagatesObligationTo <https://example.com/policy/RAGPolicySet> .
```

Permits indexing the corpus provided:
- `InheritSourceLicence` → attribution to the corpus source appears in generated outputs (the `downstreamLicenceURI` must link back to the original corpus licence)
- `ComplyWithArticle50` → Art. 50 transparency applies to the RAG generator as a GPAI system

The `propagatesObligationTo RAGPolicySet` closes the propagation chain: corpus obligations flow back up to the PolicySet level.

### 4. Alias — RAGPolicySetLicence

```turtle
<https://example.com/policy/RAGPolicySetLicence>
    a odrl:Policy ;
    dct:references <https://example.com/policy/RAGPolicySet> .
```

The distribution nodes in the knowledge graph reference `RAGPolicySetLicence` via `dct:license` (consistent with all other UCs). This alias simply redirects to the PolicySet. It exists because distribution nodes carry a single `dct:license` URI, but the actual governance is a PolicySet — the alias bridges this.

---

## Training vs. Inference: Why This Is Different

Every other licence in this project governs a one-time training activity. RAG governance is ongoing — obligations recur on every inference call because the corpus content is retrieved fresh each time. The `RAGIngestion` action is therefore an **inference-time** action, not a training-time action. This is formally aligned with the W3C ODRL AI Vocabulary's `odrl:ai-augment` category, which covers retrieval augmentation at inference time.

---

## How the Checker Uses This File

`checkRAGPolicySet("GeneratorRAGDist11")`:
1. Finds `aimd2:ragCorpusPolicy` on the distribution → RAG system confirmed
2. Queries `aimd:derivedFromDistribution` to find both parents (`RetrieverDist11`, `CorpusDist11`)
3. Checks each parent has `odrl:hasPolicy` linking to a policy in the PolicySet
4. Verifies the generator distribution carries `aimd2:inferenceEndpointURL` and `aimd2:article50PolicyURL`
5. Both sources have policies → `compliant: true` (the test case is the passing multi-asset case)

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `odrl:PolicySet` | ODRL Class | Groups multiple simultaneous policies |
| `aimd2:AIInference` | `odrl:Action` | Retriever inference |
| `aimd2:RAGIngestion` | `odrl:Action` | Corpus indexing at inference time |
| `aimd2:InheritSourceLicence` | `odrl:Action` (duty) | Attribution in generated output |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | GPAI transparency |
| `aimd2:propagatesObligationTo` | `rdf:Property` | Chains retriever → corpus → PolicySet |
