# EmbargoedCorpusLicence.ttl

**Use Case:** UC-4 — Embargoed Preprint → Premature RAG Ingestion  
**Expected Result:** ✗ EMBARGO ACTIVE (until 2027-06-30)  
**Legal Basis:** DSM Directive Art. 3(1) lawful access precondition; TCD TARA embargo policy

---

## What Problem This Licence Solves

Academic institutions routinely place embargoes on PhD theses and preprints — TCD TARA typically applies 12–24 month embargoes on new submissions. A RAG system that indexes repository content indiscriminately could ingest embargoed material before it is lawfully accessible.

DSM Art. 3(1) requires **lawful access** as a precondition for the TDM research exception to apply. If the document is under embargo, access is not lawful, so the TDM exception does not apply. This licence captures that temporal gate in machine-readable ODRL, so the compliance checker can detect premature ingestion automatically without any human needing to check individual embargo dates.

The novelty here is the **time-varying constraint**: the same distribution that is non-compliant today (2026-07-03) becomes compliant automatically after 2027-06-30 without any change to the code or the data.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one time-gated permission** and **two temporal prohibitions** (RAG before embargo end, training before embargo end).

### Permission — RAG Ingestion Only After Embargo Lapses

```turtle
odrl:permission [
    odrl:action aimd2:RAGIngestion ;
    odrl:constraint [
        odrl:leftOperand  odrl:dateTime ;
        odrl:operator     odrl:gteq ;
        odrl:rightOperand aimd2:EmbargoEndDate ;
    ] ;
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;
]
```

RAG ingestion is permitted, but only when the current `dateTime` is greater than or equal to the `EmbargoEndDate`. The `aimd2:EmbargoEndDate` left operand is resolved from the data property on the distribution node — in the test data this is set to `"2027-06-30"^^xsd:date`. The SPARQL checker compares this against `NOW()`.

The duty `ComplyWithArticle50` remains — even after the embargo lapses, the RAG generator must still satisfy Art. 50 transparency obligations.

### Prohibition 1 — RAG Ingestion Before Embargo End

```turtle
odrl:prohibition [
    odrl:action aimd2:RAGIngestion ;
    odrl:constraint [
        odrl:leftOperand  odrl:dateTime ;
        odrl:operator     odrl:lt ;
        odrl:rightOperand aimd2:EmbargoEndDate ;
    ] ;
]
```

The mirror of the permission. Any RAG ingestion attempted while `NOW() < EmbargoEndDate` is prohibited. This is the triple the checker detects to return `compliant: false`.

### Prohibition 2 — AI Training Before Embargo End

```turtle
odrl:prohibition [
    odrl:action aimd2:AITraining ;
    odrl:constraint [
        odrl:leftOperand  odrl:dateTime ;
        odrl:operator     odrl:lt ;
        odrl:rightOperand aimd2:EmbargoEndDate ;
    ] ;
]
```

Even pre-training on the embargoed content is prohibited for the same reason. The W3C ODRL AI Vocabulary distinguishes `ai-augment` (RAG/inference) from `ai-training` — we need separate prohibition blocks for each because a system could ingest into a vector store (RAGIngestion) separately from using the content in a training job (AITraining).

---

## Why `NOW()` Not a Hardcoded Date

The SPARQL query in `checkEmbargoCompliance()` uses:
```sparql
FILTER (?embargoEnd > NOW())
```

This means the test data never needs to be updated. The same triple that produces ✗ today automatically produces ✓ after the embargo date passes. This is a demonstration that ODRL temporal constraints are dynamic and self-resolving.

---

## How the Checker Uses This File

`checkEmbargoCompliance("PrematureRAGDist4")`:
1. Queries the distribution for `aimd2:EmbargoEndDate` — finds `"2027-06-30"^^xsd:date`
2. Compares against SPARQL `NOW()` — `2027-06-30 > 2026-07-03` is true
3. Returns `compliant: false`, `conflict: "embargo-active: EmbargoEndDate 2027-06-30 not yet reached"`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:RAGIngestion` | `odrl:Action` | Governed activity |
| `aimd2:AITraining` | `odrl:Action` | Secondary governed activity |
| `odrl:dateTime` | `odrl:LeftOperand` | Current datetime (ODRL core) |
| `aimd2:EmbargoEndDate` | `odrl:LeftOperand` | Embargo release date from distribution data |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | EU AI Act transparency after embargo |
