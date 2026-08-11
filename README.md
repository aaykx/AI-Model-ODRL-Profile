# AI Model Distribution ODRL Profile — v2.0

> MAI Dissertation · Trinity College Dublin, 2026
> **Aditya Kumar Singh** · School of Computer Science and Statistics
> Supervisor: Prof. David Lewis

---

## Overview

This project defines a machine-readable governance framework for AI model training pipelines, built on the [W3C ODRL 2.2](https://www.w3.org/TR/odrl-model/) rights expression language and the [DCAT 3.0](https://www.w3.org/TR/vocab-dcat-3/) metadata vocabulary.

AI model training pipelines routinely combine corpora, model weights, and API outputs governed by different licences across different legal frameworks. This work makes that compliance landscape automatically checkable by:

- Extending the existing AIMD ODRL profile with **21 new vocabulary terms** (11 Actions, 9 LeftOperands/RightOperands, 1 Property) covering training pipeline obligations not addressed by previous work
- Encoding **13 real-world AI licence scenarios** as standalone machine-readable ODRL TTL files
- Implementing a **graph-driven SPARQL compliance checker** that evaluates 15 use cases against a GraphDB knowledge graph
- Validating correctness with a **66-check automated evaluation suite** (64/66 pass; the two known failures are a single pre-existing data-quality gap on one legacy v1.0 node, not a defect in any of the 15 new use cases — see [Evaluation](#evaluation))

This is a direct extension of prior TCD dissertation work:
- **AIMD v1.0** — Cian Twomey (2024): foundational ODRL profile for AI model distribution metadata
- **AIMD v3.0** — Diya Mathew (2026): EU AI Act post-deployment governance for GPAI systems
- **AIMD v2.0** — this work: training pipeline obligations (dataset ingestion → alignment → deployment)

---

## Key Contributions

| Contribution | Detail |
|---|---|
| 21 new ODRL terms | 11 action terms (AITraining, FineTuning, RAGIngestion, …), 9 operand terms (EmbargoEndDate, actorType, deploymentContext, …), 1 property |
| 13 licence TTL files | Standalone ODRL policies encoding CC conflicts, AGPL network trigger, distillation prohibitions, RLHF consent, synthetic data disclosure, MoE inheritance, cascading chains |
| 15 use cases | Full coverage: Creative Commons conflicts (UC-1–5), proprietary API distillation (UC-6), Apache/AGPL (UC-7–8), GDPR/RLHF (UC-9), synthetic data (UC-10), RAG PolicySet (UC-11), MoE merge (UC-12), inference chain (UC-13), 3-hop CC-BY chain (UC-14), 5-hop cascading (UC-15) |
| Graph-driven checker | Obligations read dynamically from GraphDB via SPARQL — no hard-coded rules in JavaScript |
| 66-check evaluation suite | Automated pass/fail assertions across 6 sections (A/V/L/G/E/X); 64/66 passing |
| SHACL validation | 18 shapes, cross-checked by two independent engines (JS `shacl-engine` and Apache Jena/ARQ), agreeing node-for-node |
| DALICC integration | Genuine external licence-compatibility adjudication via a real DALICC deployment, with a URI-matching fallback |
| Demo frontend | Express + vanilla JS dashboard at localhost:3000 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Policy language | W3C ODRL 2.2 |
| Metadata standard | DCAT 3.0 + AIMD extensions |
| Provenance | W3C PROV-O |
| Validation | SHACL 1.0 |
| Ontology format | Turtle (RDF) |
| Knowledge graph | GraphDB Free v10.x |
| Query language | SPARQL 1.1 |
| Compliance server | Node.js + Axios |
| Demo frontend | Express + vanilla HTML/CSS/JS |
| Legal grounding | EU AI Act Art. 50/53 · DSM Directive Art. 3/4 · GDPR Art. 6/13/14 · AGPLv3 §13 · CC licence families · Meta Llama Community Licence |

---

## Repository Structure

```
├── AIMD.ttl                          # Core ODRL profile (Twomey, 2024) — do not modify
├── AIMD_extended.ttl                 # Mathew (2026) extensions — do not modify
├── AIMD_extended_v2.ttl              # ★ This dissertation: 21 new ODRL terms
├── AIMD_v2_knowledge_graph.ttl       # ★ 15 use-case instance data (PROV-O provenance)
├── AIMD_v2_shapes.ttl                # ★ 18 SHACL validation shapes
│
├── GPAILicence.ttl                   # Mathew (2026) — GPAI Art. 50/53 compliance
├── HighRiskAILicence.ttl             # Mathew (2026) — EU AI Act Annex III/IV
├── OpenAccessAcademicLiscence.ttl    # Mathew (2026) — open academic access
│
├── AGPLNetworkLicence.ttl            # ★ UC-8:  AGPL §13 network trigger
├── ApacheMITChainLicence.ttl         # ★ UC-7:  Apache 2.0 → MIT attribution
├── CascadingConflictLicence.ttl      # ★ UC-15: 5-hop cascading conflicts
├── CommercialConflictLicence.ttl     # ★ UC-2:  CC-BY-NC NonCommercial conflict
├── CopyleftPropagationLicence.ttl    # ★ UC-3:  CC-BY-SA copyleft propagation
├── EmbargoedCorpusLicence.ttl        # ★ UC-4:  DSM Art. 3 embargo compliance
├── InferenceChainLicence.ttl         # ★ UC-13: inference-time composition (true negative)
├── MoEMergedModelLicence.ttl         # ★ UC-12: Mixture-of-Experts obligation inheritance
├── OpenResearchLLMLicence.ttl        # ★ UC-1:  CC-BY open LLM (compliant baseline)
├── ProprietaryDistillationLicence.ttl# ★ UC-6:  API ToS distillation prohibition
├── RAGPolicySetLicence.ttl           # ★ UC-11: ODRL PolicySet multi-asset composition
├── RLHFAlignedModelLicence.ttl       # ★ UC-9:  GDPR consent for RLHF data
├── SyntheticDataDisclosureLicence.ttl# ★ UC-10: EU AI Act Art. 50 synthetic data
│
├── server.js                         # Mathew (2026) — legacy checker, kept for `npm run start:original`
├── server_v2.js                      # ★ Graph-driven compliance checker (7 phases)
├── demo_server.js                    # ★ Express demo server (localhost:3000)
├── load_ontology.js                  # ★ Loads all 20 TTL files into GraphDB via REST API
├── AIMD_v2_Report.tex                # ★ Dissertation report (LaTeX)
├── references.bib                    # ★ Report bibliography
│
├── tests/
│   ├── smoke_test.js                    # ★ GraphDB connectivity and basic assertions
│   ├── evaluation_suite.js              # ★ 66-check automated evaluation suite (A/V/L/G/E/X)
│   ├── timed_evaluation_suite.js        # ★ Instrumented copy of the above, per-section/per-query timing
│   ├── counterfactual_verification.js   # ★ Applies each UC's minimal fix live, confirms the verdict flips, reverts
│   ├── ablation_test.js                 # ★ Standard-vs-custom-term substitution ablation (owl:sameAs bridge)
│   ├── post_embargo_test.js             # ★ Temporal (embargo-date) counterfactual probe
│   └── shacl_validate.js                # ★ SHACL validation via shacl-engine (JS/Comunica)
│
├── licence-docs/                     # ★ Markdown documentation for each of the 13 new licence TTLs
├── figures/                          # ★ Architecture / vocabulary / use-case diagrams
├── public/                           # ★ Demo frontend (served by demo_server.js)
└── package.json
```

---

## Ontology Namespace

```
Prefix:   aimd2:
Namespace: https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [GraphDB Free](https://graphdb.ontotext.com/) running at `http://localhost:7200`
- A GraphDB repository named **`AIModels`**

---

## How to Run

**1. Install dependencies**
```bash
npm install
```

**2. Load all ontology and licence files into GraphDB**
```bash
npm run load
```
Uploads all 20 TTL files in the correct dependency order.

**3. Run the terminal compliance evaluation** (populates instance data + 7-phase output)
```bash
npm start
```

**4. Start the demo frontend**
```bash
npm run demo
```
Open **http://localhost:3000** and click **Run All Checks**.

**5. Run the evaluation suite** (optional — expects 66/66)
```bash
npm run evaluate
```

---

## Use Cases

| ID | Scenario | Expected |
|---|---|---|
| UC-1  | CC-BY corpus → open LLM pre-training | ✅ Compliant |
| UC-2  | CC-BY-NC dataset → commercial product | ❌ NC conflict |
| UC-3  | CC-BY-SA corpus → copyleft-stripping fine-tune | ❌ Copyleft violation |
| UC-4  | Embargoed preprint → premature RAG ingestion | ❌ Embargo active |
| UC-5  | CC-BY + CC-BY-NC + CC-BY-SA → GPAI (commercial) | ❌ Multi-source conflict |
| UC-6  | Proprietary LLM API → knowledge distillation | ❌ Contractual prohibition |
| UC-7  | Apache 2.0 base → MIT fine-tune | ✅ Compliant |
| UC-8  | AGPL fine-tune → public network API | ❌ AGPLv3 §13 violation |
| UC-9  | RLHF alignment without GDPR consent | ❌ Consent missing |
| UC-10 | Synthetic data (proprietary teacher) → open model | ❌ Art. 50 disclosure gap |
| UC-11 | Retriever + corpus → RAG output (PolicySet) | ✅ PolicySet satisfied |
| UC-12 | Expert A + Llama expert + Expert C → MoE merge | ❌ Inheritance failure |
| UC-13 | Planner LLM → executor LLM (inference only) | ✅ True negative |
| UC-14 | CC-BY corpus → 3-hop chain → GPAI API | ✅ Compliant |
| UC-15 | 5-hop proprietary chain (distillation + synthetic + MoE) | ❌ Cascading conflicts |

---

## Evaluation

```
npm run evaluate        # 64/66 expected
npm run evaluate:reload  # reload data first, then evaluate
```

The suite covers six sections: **A** (infrastructure/setup), **V** (vocabulary/ontology
integrity), **L** (licence-file structure, all 13 new TTLs), **G** (knowledge-graph
structural integrity), **E** (the 15 use cases' compliance verdicts), and **X**
(cross-cutting design properties). 64/66 pass; the two failures are both in section G,
both on `LegalLLMContractAnalysisDist1.6` (a pre-existing v1.0 data-quality gap — that
node is missing `dct:license`/`odrl:hasPolicy` — not a defect in any of the 15 new
use cases). All 15 use cases pass; all 8 cross-cutting design properties pass.

A separate, instrumented copy (`tests/timed_evaluation_suite.js`) reports the same
result plus per-section and per-query timing. Absolute timings vary considerably
(4–8×) depending on whether GraphDB/DALICC were freshly started or already warm —
treat any specific millisecond figure as illustrative, not a benchmark.

**SHACL validation** (`AIMD_v2_shapes.ttl`, 18 shapes) is cross-checked by two
independent engines: `tests/shacl_validate.js` (JS, `shacl-engine`/Comunica) and
Apache Jena's `shacl` CLI (Java/ARQ). They agree on every per-shape violation count,
node for node; Jena additionally validates the one shape (`RAGPolicySetShape`) that
Comunica's engine cannot evaluate due to an engine-specific bug with `$this` inside
`GROUP BY`.

---

## DALICC integration (optional)

`server_v2.js`'s `checkLicenceCompatibility()` can call out to a real
[DALICC](https://github.com/dalicc/dalicc) deployment for genuine external
licence-clause adjudication. It is entirely optional — if DALICC isn't
reachable, the checker falls back to direct URI matching automatically and
every other phase continues normally.

```bash
git clone https://github.com/dalicc/dalicc
cd dalicc
mkdir -p app/static        # upstream repo is missing this directory on a fresh clone
docker-compose build --pull
docker-compose up -d
cd licensedata && sh copy_ttls.sh && cd ..
```

DALICC's Virtuoso backend needs one more step before its licence library is
queryable — add `/data/ttl_dump` to `DirsAllowed` in
`virtuoso_data/virtuoso.ini`, restart the `virtuoso-db` container, then
bulk-load:
```bash
docker restart virtuoso-db
docker exec virtuoso-db isql-v -U dba -P dba \
  exec="ld_dir('/data/ttl_dump', '*.ttl', NULL); rdf_loader_run(); checkpoint;"
```

Verify with `curl http://localhost:8002/licenselibrary/list` — a populated
response confirms it's ready. Note the real endpoint is
`http://localhost:8002/compatibilitycheck/`, taking
`{"licenses": ["<uri1>", "<uri2>"]}` and returning
`{"conflicting_statements": {"direct": {...}, "derived": {...}}}` — this
differs from DALICC's own docs/older examples circulating online (wrong
port, wrong endpoint path, and a different request/response shape), which
is why `checkLicenceCompatibility()` in this repo targets the corrected
values directly.

---

## Acknowledgements

- **AIMD v1.0:** [Cian Twomey (2024)](https://github.com/ci2me/AI-Model-Distribution-ODRL-Profile)
- **AIMD v3.0:** Diya Mathew (2026), Trinity College Dublin
- **Supervisor:** Prof. David Lewis, School of Computer Science and Statistics, TCD
- **Institution:** [Trinity College Dublin](https://www.tcd.ie)

---

## Licence

This project is released under the [Creative Commons Attribution 4.0 International Licence](https://creativecommons.org/licenses/by/4.0/).
