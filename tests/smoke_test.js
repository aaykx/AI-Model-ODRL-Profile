/**
 * tests/smoke_test.js
 *
 * Smoke test suite for the AIMD v2.0 implementation.
 * Run with: node tests/smoke_test.js
 *
 * Prerequisites:
 *   1. GraphDB running at localhost:7200 with repository "AIModels"
 *   2. AIMD_extended.ttl loaded into GraphDB
 *   3. AIMD_extended_v2.ttl loaded into GraphDB
 *   4. server_v2.js has been run at least once to populate the knowledge graph
 *
 * Exits 0 if all experiments pass, 1 if any fail.
 */

const axios = require("axios");

const GRAPHDB_BASE  = "http://localhost:7200";
const REPO_ID       = "AIModels";
const SPARQL_ENDPOINT = `${GRAPHDB_BASE}/repositories/${REPO_ID}`;
const AIMD2_BASE    = "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#";
const AIMD_BASE     = "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#";

const PREFIXES = `
PREFIX dcat:  <https://www.w3.org/ns/dcat#>
PREFIX odrl:  <http://www.w3.org/ns/odrl/2/>
PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct:   <http://purl.org/dc/terms/>
PREFIX aimd:  <${AIMD_BASE}>
PREFIX aimd2: <${AIMD2_BASE}>
PREFIX xsd:   <http://www.w3.org/2001/XMLSchema#>
`;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function sparqlSelect(query) {
    const response = await axios.post(
        SPARQL_ENDPOINT,
        `query=${encodeURIComponent(query)}`,
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/sparql-results+json",
            },
            timeout: 10000,
        }
    );
    return response.data.results.bindings;
}

const results = [];

function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
    console.log(`  ✓  ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
    console.log(`  ✗  ${name}${detail ? " — " + detail : ""}`);
}

// ─────────────────────────────────────────────
// Experiments
// ─────────────────────────────────────────────

/**
 * E-1: GraphDB is reachable at localhost:7200.
 */
async function e1_graphdbRunning() {
    try {
        await axios.get(`${GRAPHDB_BASE}/rest/repositories`, { timeout: 5000 });
        pass("E-1: GraphDB running at localhost:7200");
        return true;
    } catch {
        fail("E-1: GraphDB running at localhost:7200", "connection refused — start GraphDB first");
        return false;
    }
}

/**
 * E-2: The AIModels repository exists in GraphDB.
 */
async function e2_repoExists() {
    try {
        const response = await axios.get(`${GRAPHDB_BASE}/rest/repositories`, { timeout: 5000 });
        const repos = response.data;
        const found = Array.isArray(repos) && repos.some(r => r.id === REPO_ID);
        if (found) {
            pass("E-2: AIModels repository exists");
        } else {
            fail("E-2: AIModels repository exists", `repository "${REPO_ID}" not found — create it in GraphDB Workbench`);
        }
        return found;
    } catch {
        fail("E-2: AIModels repository exists", "could not query repositories");
        return false;
    }
}

/**
 * E-3: AIMD_extended_v2.ttl has been loaded (at least one aimd2: Action term present).
 */
async function e3_v2ProfileLoaded() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?a) AS ?count)
WHERE {
    ?a a odrl:Action .
    FILTER(STRSTARTS(STR(?a), "${AIMD2_BASE}"))
}`);
        const count = parseInt(bindings[0]?.count?.value || "0", 10);
        if (count >= 11) {
            pass("E-3: AIMD_extended_v2.ttl loaded", `${count} aimd2: Action terms found (expected ≥11)`);
            return true;
        } else if (count > 0) {
            fail("E-3: AIMD_extended_v2.ttl loaded", `only ${count} aimd2: Action terms found — expected 11`);
            return false;
        } else {
            fail("E-3: AIMD_extended_v2.ttl loaded", "0 aimd2: terms found — load AIMD_extended_v2.ttl via GraphDB Workbench Import");
            return false;
        }
    } catch (err) {
        fail("E-3: AIMD_extended_v2.ttl loaded", err.message);
        return false;
    }
}

/**
 * E-4: Knowledge graph is populated (distributions present).
 */
async function e4_dataPopulated() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?d) AS ?count)
WHERE { ?d a aimd:AIModelDistribution . }`);
        const count = parseInt(bindings[0]?.count?.value || "0", 10);
        if (count >= 6) {
            pass("E-4: Knowledge graph populated", `${count} distributions found (expected ≥6)`);
            return true;
        } else {
            fail("E-4: Knowledge graph populated", `${count} distributions found — run "node server_v2.js" first`);
            return false;
        }
    } catch (err) {
        fail("E-4: Knowledge graph populated", err.message);
        return false;
    }
}

/**
 * E-5: IrishLegalLLMDist1.5 has CO2Disclosure and CopyrightPolicy declared.
 * Diya's "compliant" distribution should have both disclosure objects linked.
 */
async function e5_irishLegalLLMCompliant() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?co2 ?cp
WHERE {
    dcat:IrishLegalLLMDist1.5 aimd:co2Disclosure ?co2 ;
                               aimd:copyrightPolicy ?cp .
}`);
        if (bindings.length > 0) {
            pass("E-5: IrishLegalLLMDist1.5 has CO2 + copyright disclosure", "Diya's compliant distribution verified");
            return true;
        } else {
            fail("E-5: IrishLegalLLMDist1.5 has CO2 + copyright disclosure", "disclosure objects missing — re-run server_v2.js");
            return false;
        }
    } catch (err) {
        fail("E-5: IrishLegalLLMDist1.5 has CO2 + copyright disclosure", err.message);
        return false;
    }
}

/**
 * E-6: TextGenDist1.4 is non-compliant — it must NOT have CO2Disclosure or CopyrightPolicy.
 * This is Diya's deliberately non-compliant distribution.
 */
async function e6_textGenNonCompliant() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?co2) AS ?hasCO2) (BOUND(?cp) AS ?hasCP)
WHERE {
    OPTIONAL { dcat:TextGenDist1.4 aimd:co2Disclosure ?co2 }
    OPTIONAL { dcat:TextGenDist1.4 aimd:copyrightPolicy ?cp }
}`);
        const hasCO2 = bindings[0]?.hasCO2?.value === "true";
        const hasCP  = bindings[0]?.hasCP?.value  === "true";
        if (!hasCO2 && !hasCP) {
            pass("E-6: TextGenDist1.4 is non-compliant (missing CO2 + copyright)", "deliberately non-compliant distribution confirmed");
            return true;
        } else {
            fail("E-6: TextGenDist1.4 is non-compliant", `unexpected: hasCO2=${hasCO2}, hasCopyrightPolicy=${hasCP}`);
            return false;
        }
    } catch (err) {
        fail("E-6: TextGenDist1.4 is non-compliant", err.message);
        return false;
    }
}

/**
 * E-7: LegalLLMContractAnalysisDist1.6 has a derivation chain (aimd:derivedFromDistribution present).
 */
async function e7_provenanceChainExists() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?parent
WHERE {
    dcat:LegalLLMContractAnalysisDist1.6 aimd:derivedFromDistribution ?parent .
}`);
        if (bindings.length > 0) {
            const parentID = bindings[0].parent.value.split("#").pop().split("/").pop();
            pass("E-7: LegalLLMContractAnalysisDist1.6 provenance chain exists", `parent: ${parentID}`);
            return true;
        } else {
            fail("E-7: LegalLLMContractAnalysisDist1.6 provenance chain exists", "no derivedFromDistribution link found");
            return false;
        }
    } catch (err) {
        fail("E-7: LegalLLMContractAnalysisDist1.6 provenance chain exists", err.message);
        return false;
    }
}

/**
 * E-8: AIMD_extended.ttl (Diya's v3.0) is loaded — at least 10 aimd: Action terms present.
 */
async function e8_diyaProfileLoaded() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?a) AS ?count)
WHERE {
    ?a a odrl:Action .
    FILTER(STRSTARTS(STR(?a), "${AIMD_BASE}"))
}`);
        const count = parseInt(bindings[0]?.count?.value || "0", 10);
        if (count >= 10) {
            pass("E-8: AIMD_extended.ttl (Diya v3.0) loaded", `${count} aimd: Action terms found`);
            return true;
        } else {
            fail("E-8: AIMD_extended.ttl (Diya v3.0) loaded", `${count} terms found — expected ≥10. Load AIMD_extended.ttl into GraphDB.`);
            return false;
        }
    } catch (err) {
        fail("E-8: AIMD_extended.ttl (Diya v3.0) loaded", err.message);
        return false;
    }
}

// ═════════════════════════════════════════════
// E-9 to E-23: Use Case Experiments
// ═════════════════════════════════════════════

/**
 * E-9: UC-1 — CC-BY corpus → open research LLM
 * Expected: ✓ — CC-BY research chain compliant; actorType=research,
 * trainingDatasetURL, modelWeightsURL all present.
 * Legal basis: DSM Art. 3(1); CC-BY 4.0; OSAID 1.0.
 */
async function e9_uc1_openResearchLLM() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?trainingURL ?weightsURL ?actorType
WHERE {
    dcat:OpenResearchLLMDist1 aimd2:trainingDatasetURL ?trainingURL ;
                               aimd2:modelWeightsURL    ?weightsURL ;
                               aimd2:actorType          ?actorType .
}`);
        if (bindings.length > 0 && bindings[0].actorType?.value === "research") {
            pass("E-9: UC-1 CC-BY → open research LLM (✓)", "actorType=research, training+weights URLs present");
            return true;
        } else {
            fail("E-9: UC-1 CC-BY → open research LLM (✓)", "actorType or evidence URLs missing — run server_v2.js first");
            return false;
        }
    } catch (err) {
        fail("E-9: UC-1 CC-BY → open research LLM (✓)", err.message);
        return false;
    }
}

/**
 * E-10: UC-2 — CC-BY-NC dataset → commercial AI product
 * Expected: ✗ — conflict detected; NC source + commercial actor.
 * Legal basis: CC-BY-NC 4.0 §3(b); DSM Art. 4(3); EU AI Act Art. 53(1)(c).
 */
async function e10_uc2_commercialConflict() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?actorType ?sourceLicence
WHERE {
    dcat:CommercialProductDist2 aimd2:actorType          ?actorType ;
                                 aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?sourceLicence .
}`);
        const hasConflict = bindings.some(
            b => b.actorType?.value === "commercial"
              && b.sourceLicence?.value === "https://example.com/policy/CommercialConflictLicence"
        );
        if (hasConflict) {
            pass("E-10: UC-2 CC-BY-NC → commercial product (✗ conflict)", "NC source + commercial actor detected — conflict correctly identified");
            return true;
        } else {
            fail("E-10: UC-2 CC-BY-NC → commercial product (✗ conflict)", "conflict pattern not found in graph");
            return false;
        }
    } catch (err) {
        fail("E-10: UC-2 CC-BY-NC → commercial product (✗ conflict)", err.message);
        return false;
    }
}

/**
 * E-11: UC-3 — CC-BY-SA corpus → copyleft-violating fine-tune
 * Expected: ✗ — downstreamLicenceURI absent (ShareAlike not honoured).
 * Legal basis: CC-BY-SA 4.0 §3(b); Andersen v. Stability AI.
 */
async function e11_uc3_copyleftViolation() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?downstreamLic) AS ?hasDownstream) ?sourceLicence
WHERE {
    dcat:CopyleftViolatingModelDist3 aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?sourceLicence .
    OPTIONAL { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI ?downstreamLic }
}`);
        const isViolating = bindings.some(
            b => b.sourceLicence?.value === "https://example.com/policy/CopyleftPropagationLicence"
              && b.hasDownstream?.value === "false"
        );
        if (isViolating) {
            pass("E-11: UC-3 CC-BY-SA copyleft propagation (✗ violation)", "SA source + missing downstreamLicenceURI — violation detected");
            return true;
        } else {
            fail("E-11: UC-3 CC-BY-SA copyleft propagation (✗ violation)", "expected copyleft violation pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-11: UC-3 CC-BY-SA copyleft propagation (✗ violation)", err.message);
        return false;
    }
}

/**
 * E-12: UC-4 — Embargoed preprint → premature RAG ingestion
 * Expected: ✗ — EmbargoEndDate 2027-06-30 > current date 2026-06-30.
 * Legal basis: DSM Art. 3(1) lawful access; TCD TARA embargo policy.
 */
async function e12_uc4_embargoActive() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?embargoEnd
WHERE {
    dcat:PrematureRAGDist4 aimd2:EmbargoEndDate ?embargoEnd .
}`);
        if (bindings.length > 0) {
            const endDate = new Date(bindings[0].embargoEnd.value);
            const today   = new Date("2026-06-30");
            if (endDate > today) {
                pass("E-12: UC-4 Embargoed preprint premature RAG (✗ embargo active)", `EmbargoEndDate=${bindings[0].embargoEnd.value} > 2026-06-30 — access prohibited`);
                return true;
            } else {
                fail("E-12: UC-4 Embargoed preprint premature RAG (✗ embargo active)", "embargo appears to have lapsed (date check failed)");
                return false;
            }
        } else {
            fail("E-12: UC-4 Embargoed preprint premature RAG (✗ embargo active)", "EmbargoEndDate not found on PrematureRAGDist4");
            return false;
        }
    } catch (err) {
        fail("E-12: UC-4 Embargoed preprint premature RAG (✗ embargo active)", err.message);
        return false;
    }
}

/**
 * E-13: UC-5 — Multi-source CC-BY + CC-BY-NC + CC-BY-SA → GPAI
 * Expected: ✗ — NC parent detected; GPAIMultiSourceDist5 has ≥3 parents,
 * at least one with CommercialConflictLicence, and actor=commercial.
 * Legal basis: EU AI Act Art. 53(1)(c); DALICC dependency-graph.
 */
async function e13_uc5_multiSourceConflict() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?parent) AS ?parentCount) ?actorType
WHERE {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?parent ;
                               aimd2:actorType              ?actorType .
}
GROUP BY ?actorType`);
        const ncCheck = await sparqlSelect(`${PREFIXES}
SELECT ?parentLicence
WHERE {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?parent .
    ?parent dct:license <https://example.com/policy/CommercialConflictLicence> .
    BIND(<https://example.com/policy/CommercialConflictLicence> AS ?parentLicence)
}`);
        const parentCount = parseInt(bindings[0]?.parentCount?.value || "0", 10);
        const actorType   = bindings[0]?.actorType?.value || "";
        const hasNCParent = ncCheck.length > 0;

        if (parentCount >= 3 && actorType === "commercial" && hasNCParent) {
            pass("E-13: UC-5 Multi-source NC conflict (✗ conflict)", `${parentCount} parents, NC parent found, actor=commercial`);
            return true;
        } else {
            fail("E-13: UC-5 Multi-source NC conflict (✗ conflict)", `parents=${parentCount}, actor=${actorType}, hasNCParent=${hasNCParent}`);
            return false;
        }
    } catch (err) {
        fail("E-13: UC-5 Multi-source NC conflict (✗ conflict)", err.message);
        return false;
    }
}

/**
 * E-14: UC-6 — Proprietary LLM API → unauthorised distillation
 * Expected: ✗ — contractual prohibition: actorType=competitor + NC-type source.
 * Legal basis: Contractual ToS; US Copyright Office Part 2 (2025) — no copyright.
 */
async function e14_uc6_distillationProhibition() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?actorType ?sourceLicence
WHERE {
    dcat:UnauthorisedDistillationDist6 aimd2:actorType              ?actorType ;
                                        aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?sourceLicence .
}`);
        const hasViolation = bindings.some(
            b => b.actorType?.value === "competitor"
              && b.sourceLicence?.value === "https://example.com/policy/ProprietaryDistillationLicence"
        );
        if (hasViolation) {
            pass("E-14: UC-6 Proprietary distillation prohibition (✗ contract violation)", "actorType=competitor + proprietary source — ToS violation detected");
            return true;
        } else {
            fail("E-14: UC-6 Proprietary distillation prohibition (✗ contract violation)", "violation pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-14: UC-6 Proprietary distillation prohibition (✗ contract violation)", err.message);
        return false;
    }
}

/**
 * E-15: UC-7 — Apache 2.0 → MIT fine-tune (permissive-to-permissive)
 * Expected: ✓ — baseModelURL + modelWeightsURL present (attribution not dropped).
 * Legal basis: Apache 2.0 §4/4(c); Jewitt et al. (2025).
 */
async function e15_uc7_apacheMITChain() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?baseModelURL ?weightsURL
WHERE {
    dcat:MITStudentDist7 aimd2:baseModelURL   ?baseModelURL ;
                          aimd2:modelWeightsURL ?weightsURL .
}`);
        if (bindings.length > 0) {
            pass("E-15: UC-7 Apache 2.0 → MIT permissive chain (✓)", "baseModelURL + modelWeightsURL present — attribution preserved");
            return true;
        } else {
            fail("E-15: UC-7 Apache 2.0 → MIT permissive chain (✓)", "attribution metadata missing from MITStudentDist7");
            return false;
        }
    } catch (err) {
        fail("E-15: UC-7 Apache 2.0 → MIT permissive chain (✓)", err.message);
        return false;
    }
}

/**
 * E-16: UC-8 — Apache 2.0 → AGPL → network API without source disclosure
 * Expected: ✗ — deploymentContext=network + modelWeightsURL absent (§13 trigger).
 * Legal basis: AGPLv3 §13; Black Duck OSSRA network-copyleft tier.
 */
async function e16_uc8_agplNetworkTrigger() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?weightsURL) AS ?hasWeights) ?deployCtx ?parentLicence
WHERE {
    dcat:NetworkAPIDist8 aimd2:deploymentContext ?deployCtx ;
                          aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?parentLicence .
    OPTIONAL { dcat:NetworkAPIDist8 aimd2:modelWeightsURL ?weightsURL }
}`);
        const isViolating = bindings.some(
            b => b.deployCtx?.value === "network"
              && b.hasWeights?.value === "false"
        );
        if (isViolating) {
            pass("E-16: UC-8 AGPL §13 network copyleft trigger (✗)", "deploymentContext=network + modelWeightsURL absent — source not offered");
            return true;
        } else {
            fail("E-16: UC-8 AGPL §13 network copyleft trigger (✗)", "AGPL network violation pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-16: UC-8 AGPL §13 network copyleft trigger (✗)", err.message);
        return false;
    }
}

/**
 * E-17: UC-9 — Open model → RLHF on user logs → aligned model
 * Expected: ✗ — rlhfDataPolicy declared but userConsentStatus absent.
 * Legal basis: GDPR Art. 6/13/14; EU AI Act Art. 10.
 */
async function e17_uc9_rlhfConsentMissing() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?consentStatus) AS ?hasConsent) ?rlhfPolicy
WHERE {
    dcat:RLHFAlignedDist9 aimd2:rlhfDataPolicy ?rlhfPolicy .
    OPTIONAL { dcat:RLHFAlignedDist9 aimd2:userConsentStatus ?consentStatus }
}`);
        const isViolating = bindings.some(
            b => !!b.rlhfPolicy?.value && b.hasConsent?.value === "false"
        );
        if (isViolating) {
            pass("E-17: UC-9 RLHF consent absent (✗)", "rlhfDataPolicy declared but userConsentStatus absent — GDPR Art. 6 violation");
            return true;
        } else {
            fail("E-17: UC-9 RLHF consent absent (✗)", "RLHF consent violation pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-17: UC-9 RLHF consent absent (✗)", err.message);
        return false;
    }
}

/**
 * E-18: UC-10 — Proprietary teacher → synthetic data → open model
 * Expected: ✗ — dataGenerationMethod=synthetic + article50PolicyURL absent.
 * Legal basis: EU AI Act Art. 53(1)(c); Recitals 107-110; Phi-1/Orca.
 */
async function e18_uc10_syntheticDisclosureGap() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?art50URL) AS ?hasArt50) ?dataGenMethod
WHERE {
    dcat:OpenModelSyntheticDist10 aimd2:dataGenerationMethod ?dataGenMethod .
    OPTIONAL { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL ?art50URL }
}`);
        const isViolating = bindings.some(
            b => b.dataGenMethod?.value === "synthetic-from-proprietary-teacher"
              && b.hasArt50?.value === "false"
        );
        if (isViolating) {
            pass("E-18: UC-10 Synthetic data Art. 53 gap (✗)", "dataGenMethod=synthetic-from-proprietary-teacher + article50PolicyURL absent");
            return true;
        } else {
            fail("E-18: UC-10 Synthetic data Art. 53 gap (✗)", "disclosure gap pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-18: UC-10 Synthetic data Art. 53 gap (✗)", err.message);
        return false;
    }
}

/**
 * E-19: UC-11 — RAG PolicySet: retriever + corpus dual-licence satisfied
 * Expected: passes if ≥2 source licences + ragCorpusPolicy declared.
 * Legal basis: IDS-RAM 4.0; W3C ODRL PolicySet; Lewis et al. 2020.
 */
async function e19_uc11_ragPolicySet() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?parent) AS ?parentCount) ?ragPolicy ?inferenceURL
WHERE {
    dcat:GeneratorRAGDist11 aimd:derivedFromDistribution ?parent ;
                             aimd2:ragCorpusPolicy        ?ragPolicy .
    OPTIONAL { dcat:GeneratorRAGDist11 aimd2:inferenceEndpointURL ?inferenceURL }
}
GROUP BY ?ragPolicy ?inferenceURL`);
        const parentCount = parseInt(bindings[0]?.parentCount?.value || "0", 10);
        const hasRagPolicy = !!bindings[0]?.ragPolicy?.value;
        if (parentCount >= 2 && hasRagPolicy) {
            pass("E-19: UC-11 RAG PolicySet multi-asset composition", `${parentCount} sources + ragCorpusPolicy declared — both licences tracked`);
            return true;
        } else {
            fail("E-19: UC-11 RAG PolicySet multi-asset composition", `parentCount=${parentCount}, ragPolicy=${hasRagPolicy}`);
            return false;
        }
    } catch (err) {
        fail("E-19: UC-11 RAG PolicySet multi-asset composition", err.message);
        return false;
    }
}

/**
 * E-20: UC-12 — MoE: Llama MAU obligation not inherited by merged model
 * Expected: ✗ — ExpertBDist12 has MoEMergedModelLicence (Llama-style);
 * MoEMergedDist12 does NOT — obligation inheritance failure.
 * Legal basis: Meta Llama Community License §2; Jewitt et al. (2025).
 */
async function e20_uc12_moEObligationLost() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?expertLicence ?mergedLicence
WHERE {
    dcat:MoEMergedDist12 dct:license ?mergedLicence ;
                          aimd:derivedFromDistribution ?expert .
    ?expert dct:license ?expertLicence .
    FILTER(?expertLicence = <https://example.com/policy/MoEMergedModelLicence>)
}`);
        const obligationLost = bindings.some(
            b => b.expertLicence?.value === "https://example.com/policy/MoEMergedModelLicence"
              && b.mergedLicence?.value  !== "https://example.com/policy/MoEMergedModelLicence"
        );
        if (obligationLost) {
            pass("E-20: UC-12 MoE Llama MAU obligation inheritance failure (✗)", "Llama-licensed expert found; merged model licence does not carry MAU obligation");
            return true;
        } else {
            fail("E-20: UC-12 MoE Llama MAU obligation inheritance failure (✗)", "MoE inheritance violation pattern not found");
            return false;
        }
    } catch (err) {
        fail("E-20: UC-12 MoE Llama MAU obligation inheritance failure (✗)", err.message);
        return false;
    }
}

/**
 * E-21: UC-13 — Planner LLM → Executor LLM (inference chain, true negative)
 * Expected: ✓ — executor has InferenceChainLicence + no trainingDatasetURL
 * (inference-chaining correctly not treated as training).
 * Legal basis: W3C ODRL AI Vocab ai-augment; ReAct (Yao 2023).
 */
async function e21_uc13_inferenceChainExempt() {
    try {
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT ?licence (BOUND(?trainingURL) AS ?hasTraining) (BOUND(?baseModel) AS ?hasBaseModel)
WHERE {
    dcat:ExecutorLLMDist13 dct:license ?licence .
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:trainingDatasetURL ?trainingURL }
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:baseModelURL       ?baseModel }
}`);
        const hasInferenceLicence = bindings.some(
            b => b.licence?.value === "https://example.com/policy/InferenceChainLicence"
        );
        const hasTrainingProps = bindings.some(
            b => b.hasTraining?.value === "true" || b.hasBaseModel?.value === "true"
        );
        if (hasInferenceLicence && !hasTrainingProps) {
            pass("E-21: UC-13 Inference chain exempt from training obligations (✓)", "InferenceChainLicence + no training properties — correctly classified as inference");
            return true;
        } else {
            fail("E-21: UC-13 Inference chain exempt from training obligations (✓)", `inferenceChainLicence=${hasInferenceLicence}, hasTrainingProps=${hasTrainingProps}`);
            return false;
        }
    } catch (err) {
        fail("E-21: UC-13 Inference chain exempt from training obligations (✓)", err.message);
        return false;
    }
}

/**
 * E-22: UC-14 — CC-BY corpus → base LLM → fine-tune → GPAI API (3-hop)
 * Expected: ✓ — all 4 hops (0–3) have article50PolicyURL declared.
 * Legal basis: EU AI Act Art. 53(1)(c); extends Diya Mathew BAI §3.2 to 3 hops.
 */
async function e22_uc14_threeHopChain() {
    try {
        // Count how many hops in the GPAIAPIDist14 chain have article50PolicyURL
        const bindings = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?dist) AS ?hopsWithArt50)
WHERE {
    {
        BIND(dcat:GPAIAPIDist14 AS ?dist)
    } UNION {
        dcat:GPAIAPIDist14 aimd:derivedFromDistribution ?dist .
    } UNION {
        dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist .
    }
    ?dist aimd2:article50PolicyURL ?art50 .
}`);
        const hopsWithArt50 = parseInt(bindings[0]?.hopsWithArt50?.value || "0", 10);
        if (hopsWithArt50 >= 3) {
            pass("E-22: UC-14 3-hop CC-BY → GPAI API chain (✓)", `${hopsWithArt50}/3+ hops have article50PolicyURL — full provenance disclosed`);
            return true;
        } else {
            fail("E-22: UC-14 3-hop CC-BY → GPAI API chain (✓)", `only ${hopsWithArt50}/3 hops have Art. 50 declaration`);
            return false;
        }
    } catch (err) {
        fail("E-22: UC-14 3-hop CC-BY → GPAI API chain (✓)", err.message);
        return false;
    }
}

/**
 * E-23: UC-15 — Worst-case cascading conflicts (5-hop compound)
 * Expected: ✗ cascading — detects ≥2 distinct conflict types simultaneously
 * (distillation prohibition + synthetic disclosure gap + network deployment).
 * Legal basis: EU AI Act Art. 53(1)(c); EU Commission Draft Guidelines
 *              19 May 2026; Meta Llama Community License §2; OWASP SCVS BOM.
 */
async function e23_uc15_cascadingConflicts() {
    try {
        const distillationCheck = await sparqlSelect(`${PREFIXES}
SELECT ?dist
WHERE {
    ?dist a aimd:AIModelDistribution ;
          aimd2:actorType "competitor" ;
          aimd:derivedFromDistribution ?parent .
    ?parent dct:license <https://example.com/policy/ProprietaryDistillationLicence> .
    VALUES ?dist { dcat:DistillationDist15 dcat:ClosedModelDist15 }
}`);
        const syntheticCheck = await sparqlSelect(`${PREFIXES}
SELECT ?dist
WHERE {
    ?dist a aimd:AIModelDistribution ;
          aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
    VALUES ?dist {
        dcat:DistillationDist15 dcat:MoEMergeStepDist15 dcat:ConsumerProductDist15
    }
}`);
        const networkCheck = await sparqlSelect(`${PREFIXES}
SELECT ?dist
WHERE {
    dcat:ConsumerProductDist15 aimd2:deploymentContext "network" .
    BIND(dcat:ConsumerProductDist15 AS ?dist)
}`);

        const conflictTypes = [];
        if (distillationCheck.length > 0) conflictTypes.push("distillation-prohibition");
        if (syntheticCheck.length > 0)   conflictTypes.push("art53-disclosure-gap");
        if (networkCheck.length > 0)     conflictTypes.push("network-deployment");

        if (conflictTypes.length >= 2) {
            pass("E-23: UC-15 Cascading conflicts (✗ unresolvable)", `${conflictTypes.length} distinct conflict types: ${conflictTypes.join(", ")}`);
            return true;
        } else {
            fail("E-23: UC-15 Cascading conflicts (✗ unresolvable)", `only ${conflictTypes.length} conflict type(s) detected — expected ≥2`);
            return false;
        }
    } catch (err) {
        fail("E-23: UC-15 Cascading conflicts (✗ unresolvable)", err.message);
        return false;
    }
}

// ─────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────
(async () => {
    console.log("\n" + "═".repeat(65));
    console.log("  AIMD v2.0 Smoke Test Suite");
    console.log("═".repeat(65) + "\n");

    const graphdbUp  = await e1_graphdbRunning();
    const repoExists = graphdbUp && await e2_repoExists();

    if (!repoExists) {
        console.log("\n  ⚠  GraphDB or repository unavailable — skipping graph queries.\n");
    } else {
        // ── Foundation experiments (E-1 to E-8) ─────────────────────────────
        await e3_v2ProfileLoaded();
        await e4_dataPopulated();
        await e5_irishLegalLLMCompliant();
        await e6_textGenNonCompliant();
        await e7_provenanceChainExists();
        await e8_diyaProfileLoaded();

        // ── Use case experiments (E-9 to E-23) ──────────────────────────────
        console.log("\n" + "─".repeat(65));
        console.log("  Use Case Experiments (run server_v2.js first to populate UC data)");
        console.log("─".repeat(65) + "\n");
        await e9_uc1_openResearchLLM();
        await e10_uc2_commercialConflict();
        await e11_uc3_copyleftViolation();
        await e12_uc4_embargoActive();
        await e13_uc5_multiSourceConflict();
        await e14_uc6_distillationProhibition();
        await e15_uc7_apacheMITChain();
        await e16_uc8_agplNetworkTrigger();
        await e17_uc9_rlhfConsentMissing();
        await e18_uc10_syntheticDisclosureGap();
        await e19_uc11_ragPolicySet();
        await e20_uc12_moEObligationLost();
        await e21_uc13_inferenceChainExempt();
        await e22_uc14_threeHopChain();
        await e23_uc15_cascadingConflicts();
    }

    // Summary
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    const total  = results.length;

    console.log("\n" + "═".repeat(65));
    console.log(`  Results: ${passed}/${total} passed`);
    if (failed > 0) {
        console.log(`  Failures:`);
        results.filter(r => !r.ok).forEach(r => console.log(`    ✗ ${r.name}: ${r.detail}`));
    }
    console.log("═".repeat(65) + "\n");

    process.exit(failed > 0 ? 1 : 0);
})();
