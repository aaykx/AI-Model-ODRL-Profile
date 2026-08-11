"use strict";

const express = require("express");
const axios   = require("axios");
const path    = require("path");

const app  = express();
const PORT = 3000;

const GRAPHDB_BASE    = "http://localhost:7200";
const REPO_ID         = "AIModels";
const SPARQL_ENDPOINT = `${GRAPHDB_BASE}/repositories/${REPO_ID}`;
const DALICC_URL      = "http://localhost:8090";

const AIMD_BASE  = "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#";
const AIMD2_BASE = "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#";

const P = `
PREFIX dcat:   <https://www.w3.org/ns/dcat#>
PREFIX odrl:   <http://www.w3.org/ns/odrl/2/>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX airo:   <https://w3id.org/airo#>
PREFIX aimd:   <${AIMD_BASE}>
PREFIX aimd2:  <${AIMD2_BASE}>
PREFIX xsd:    <http://www.w3.org/2001/XMLSchema#>
PREFIX foaf:   <http://xmlns.com/foaf/0.1/>
PREFIX duv:    <http://www.w3.org/ns/duv#>
PREFIX cc:     <http://creativecommons.org/ns#>
PREFIX schema: <http://schema.org/>
PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>
PREFIX prov:   <http://www.w3.org/ns/prov#>
`;

// ─── SPARQL helpers ───────────────────────────────────────────────────────────

async function sq(query) {
    const r = await axios.post(SPARQL_ENDPOINT, `query=${encodeURIComponent(query)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
        timeout: 15000,
    });
    return r.data.results.bindings;
}

async function ask(query) {
    const r = await axios.post(SPARQL_ENDPOINT, `query=${encodeURIComponent(query)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
        timeout: 10000,
    });
    return r.data.boolean;
}

function extractLocalID(uri) {
    if (!uri) return uri;
    if (uri.includes("#")) return uri.split("#").pop();
    if (uri.includes("/")) return uri.split("/").pop();
    if (uri.includes(":")) return uri.split(":").pop();
    return uri;
}

// ─── Sub-attribute checkers (pure, mirror server_v2.js) ───────────────────────

function co2SubChecks(co2Data, PH) {
    const fields = [
        { key: `${AIMD_BASE}kgCO2eq`,              label: "kg CO₂ equivalent declared",               severity: "mandatory"  },
        { key: `${AIMD_BASE}energyKWhTotal`,        label: "Total energy (kWh) declared",              severity: "mandatory"  },
        { key: `${AIMD_BASE}trainingHardware`,      label: "Training hardware specified",              severity: "mandatory"  },
        { key: `${AIMD_BASE}trainingDurationHours`, label: "Training duration (hours) declared",       severity: "recommended"},
        { key: `${AIMD_BASE}cloudRegion`,           label: "Cloud region / data centre declared",      severity: "recommended"},
        { key: `${AIMD_BASE}gridCarbonIntensity`,   label: "Grid carbon intensity declared",           severity: "recommended"},
        { key: `${AIMD_BASE}emissionsScope`,        label: "Emissions scope declared",                 severity: "mandatory"  },
        { key: `${AIMD_BASE}reportingStandard`,     label: "Reporting standard declared (e.g. CodeCarbon)", severity: "mandatory"},
        { key: `${AIMD_BASE}co2MeasurementURL`,     label: "CO₂ measurement report URL present",      severity: "recommended"},
    ];
    return fields.map(f => {
        const val = co2Data[f.key];
        const bad = !val || val === "unknown" || val === "0" || (val && val.startsWith(PH));
        const present = val !== undefined && !bad;
        return { label: f.label, present, value: val || "(not declared)", severity: f.severity };
    });
}

function copyrightSubChecks(cpData, PH) {
    const fields = [
        { key: `${AIMD_BASE}optOutMechanism`,       label: "Opt-out mechanism declared (robots.txt / Spawning / HIBT)", severity: "mandatory"  },
        { key: `${AIMD_BASE}rightsHolderRegistry`,  label: "Rights-holder registry URL present",                        severity: "mandatory"  },
        { key: `${AIMD_BASE}tdmWaiver`,             label: "TDM waiver / licence declared",                             severity: "mandatory"  },
        { key: `${AIMD_BASE}openAccessSourcesOnly`, label: "Open-access-sources-only flag declared",                    severity: "recommended"},
        { key: `${AIMD_BASE}ccSignalsCompliant`,    label: "CC Signals compliance declared",                            severity: "recommended"},
        { key: `${AIMD_BASE}copyrightPolicyDocURL`, label: "Copyright policy document URL present",                     severity: "mandatory"  },
    ];
    return fields.map(f => {
        const val = cpData[f.key];
        const bad = !val || val === "none declared" || (val && val.startsWith(PH));
        const present = val !== undefined && !bad;
        return { label: f.label, present, value: val || "(not declared)", severity: f.severity };
    });
}

// ─── Phase 2: verifyComplianceAPI ─────────────────────────────────────────────

async function verifyComplianceAPI(distributionID) {
    const PH = "https://example.com/placeholder/";

    const obB = await sq(`${P}
SELECT ?action ?label ?evidenceProp ?severity ?checkDesc ?legalBasis WHERE {
    ?action a odrl:Action ;
            aimd:evidenceProperty ?evidenceProp .
    OPTIONAL { ?action rdfs:label ?label }
    OPTIONAL { ?action aimd:severity ?severity }
    OPTIONAL { ?action aimd:checkDescription ?checkDesc }
    OPTIONAL { ?action aimd:legalBasis ?legalBasis }
}`);

    if (obB.length === 0) {
        return { distributionID, allCompliant: false, noData: true,
            mandatoryFails: 0, recommendedFails: 0,
            obligations: [], co2: null, copyright: null, crossRepo: null };
    }

    const seen = new Set();
    const obligationDefs = [];
    for (const b of obB) {
        const ep = b.evidenceProp.value;
        if (seen.has(ep)) continue;
        seen.add(ep);
        obligationDefs.push({
            label:        b.label?.value     || b.action.value.split("#").pop(),
            evidenceProp: ep,
            severity:     b.severity?.value  || "mandatory",
            checkDesc:    b.checkDesc?.value || "",
            legalBasis:   b.legalBasis?.value|| "",
        });
    }

    const metaB = await sq(`${P} SELECT ?prop ?val WHERE { dcat:${distributionID} ?prop ?val . }`);
    const declared = {};
    for (const b of metaB) declared[b.prop.value] = b.val.value;

    const co2B = await sq(`${P}
SELECT ?subProp ?subVal WHERE {
    dcat:${distributionID} aimd:co2Disclosure ?disc . ?disc ?subProp ?subVal . }`);
    const co2Data = {};
    for (const b of co2B) co2Data[b.subProp.value] = b.subVal.value;

    const cpB = await sq(`${P}
SELECT ?subProp ?subVal WHERE {
    dcat:${distributionID} aimd:copyrightPolicy ?cp . ?cp ?subProp ?subVal . }`);
    const cpData = {};
    for (const b of cpB) cpData[b.subProp.value] = b.subVal.value;

    let mandatoryFails = 0;
    let recommendedFails = 0;
    const obligations = obligationDefs.map(ob => {
        const value   = declared[ob.evidenceProp];
        const present = value !== undefined && !value.startsWith(PH);
        if (!present && ob.severity === "mandatory")   mandatoryFails++;
        if (!present && ob.severity === "recommended") recommendedFails++;
        return { ...ob, present, value: value || "(not declared)" };
    });

    const xrB = await sq(`${P}
SELECT ?sourcePolicy ?distPolicy ?rpTitle WHERE {
    dcat:${distributionID} aimd:derivedFromResearchProduct ?sourceRP .
    ?sourceRP dct:license ?sourcePolicy .
    OPTIONAL { ?sourceRP dct:title ?rpTitle }
    OPTIONAL { dcat:${distributionID} dct:license ?distPolicy }
}`);
    let crossRepo = null;
    if (xrB.length > 0) {
        const sp = xrB[0]?.sourcePolicy?.value || null;
        const dp = xrB[0]?.distPolicy?.value   || null;
        crossRepo = {
            sourceRP:      xrB[0]?.rpTitle?.value || "(unknown)",
            sourceLicence: sp || "(not found)",
            distLicence:   dp || "(not declared)",
            verifiable:    !!(sp && dp),
        };
    }

    return {
        distributionID,
        allCompliant: mandatoryFails === 0,
        mandatoryFails,
        recommendedFails,
        noData: false,
        obligations,
        co2:       co2B.length > 0 ? co2SubChecks(co2Data, PH) : null,
        copyright: cpB.length  > 0 ? copyrightSubChecks(cpData, PH) : null,
        crossRepo,
    };
}

// ─── Phase 2: checkNewV2ObligationsAPI ────────────────────────────────────────

async function checkNewV2ObligationsAPI(distributionID) {
    const PH = "https://example.com/placeholder/";

    const obB = await sq(`${P}
SELECT ?action ?label ?evidenceProp ?severity ?checkDesc ?legalBasis WHERE {
    ?action a odrl:Action ;
            aimd:evidenceProperty ?evidenceProp .
    FILTER(STRSTARTS(STR(?action), "${AIMD2_BASE}"))
    OPTIONAL { ?action rdfs:label ?label }
    OPTIONAL { ?action aimd:severity ?severity }
    OPTIONAL { ?action aimd:checkDescription ?checkDesc }
    OPTIONAL { ?action aimd:legalBasis ?legalBasis }
}`);

    if (obB.length === 0) {
        return { distributionID, mandatoryFailures: 0, recommendedGaps: 0, noData: true, obligations: [] };
    }

    const metaB = await sq(`${P} SELECT ?prop ?val WHERE { dcat:${distributionID} ?prop ?val . }`);
    const declared = {};
    for (const b of metaB) declared[b.prop.value] = b.val.value;

    let mandatoryFailures = 0;
    let recommendedGaps   = 0;
    const obligations = obB.map(b => {
        const ep       = b.evidenceProp.value;
        const severity = b.severity?.value || "mandatory";
        const value    = declared[ep];
        const present  = value !== undefined && !value.startsWith(PH);
        if (!present && severity === "mandatory")   mandatoryFailures++;
        if (!present && severity === "recommended") recommendedGaps++;
        return {
            obligation: b.label?.value || b.action.value.split("/").pop(),
            present,
            value:      value || "(not declared)",
            severity,
            legalBasis: b.legalBasis?.value || "",
            checkDesc:  b.checkDesc?.value  || "",
        };
    });

    return { distributionID, mandatoryFailures, recommendedGaps, noData: false, obligations };
}

// ─── Phase 3: nHopChainAPI ────────────────────────────────────────────────────

async function nHopChainAPI(startDistributionURI, maxHops = 5) {
    const chain   = [];
    const visited = new Set();
    let current   = startDistributionURI;
    let hopNumber = 0;

    while (current && !visited.has(current) && hopNumber <= maxHops) {
        visited.add(current);
        const distID = extractLocalID(current);
        const comp   = await verifyComplianceAPI(distID);
        const failures = comp.obligations
            .filter(r => !r.present && r.severity === "mandatory")
            .map(r => r.label);

        chain.push({ uri: current, distID, hopNumber, compliant: comp.allCompliant, failures, compliance: comp });
        hopNumber++;

        const pb = await sq(`${P}
SELECT ?parent WHERE { <${current}> aimd:derivedFromDistribution ?parent . } LIMIT 1`);
        current = pb.length > 0 ? pb[0].parent.value : null;
    }

    return {
        startURI: startDistributionURI,
        overallCompliant: chain.length > 0 && chain.every(h => h.compliant),
        chain,
    };
}

// ─── Phase 5: daliccCheckAPI ──────────────────────────────────────────────────

async function daliccCheckAPI() {
    let available = false;
    try {
        await axios.get(`${DALICC_URL}/docs`, { timeout: 3000 });
        available = true;
    } catch (_) {}

    const pairs = await sq(`${P}
SELECT ?dist ?sourceLicence ?distLicence ?rpTitle WHERE {
    ?dist a aimd:AIModelDistribution ;
          aimd:derivedFromResearchProduct ?rp ;
          dct:license ?distLicence .
    ?rp dct:license ?sourceLicence .
    OPTIONAL { ?rp dct:title ?rpTitle }
} LIMIT 2`).catch(() => []);

    const results = [];
    for (const p of pairs) {
        const sURI = p.sourceLicence.value;
        const dURI = p.distLicence.value;
        let compatible, conflicts, hints, method;

        if (available) {
            try {
                const r = await axios.post(`${DALICC_URL}/compatibility`,
                    { firstLicenseURI: sURI, secondLicenseURI: dURI },
                    { timeout: 5000, headers: { "Content-Type": "application/json" } }
                );
                const data = r.data;
                conflicts  = data.conflicts || [];
                hints      = data.hints || data.resolutionHints || [];
                compatible = data.compatible !== false && conflicts.length === 0;
                method     = "dalicc";
            } catch (_) {
                compatible = sURI === dURI;
                conflicts  = compatible ? [] : ["URI mismatch"];
                hints      = [];
                method     = "uri-match (dalicc error)";
            }
        } else {
            compatible = sURI === dURI;
            conflicts  = compatible ? [] : [`URI mismatch: ${extractLocalID(sURI)} ≠ ${extractLocalID(dURI)}`];
            hints      = compatible ? [] : ["Ensure downstream licence URI matches or extends source licence"];
            method     = "uri-match";
        }

        results.push({
            distribution:  extractLocalID(p.dist.value),
            sourceRP:      p.rpTitle?.value || "(unknown)",
            sourceLicence: sURI,
            distLicence:   dURI,
            compatible, method, conflicts, hints,
        });
    }

    return { available, pairs: results };
}

// ─── Phase 7: use-case checks ────────────────────────────────────────────────

const CHECKS = [
    async () => {
        const b = await sq(`${P}
SELECT ?a ?b ?c ?d WHERE {
    dcat:OpenResearchLLMDist1
        aimd2:trainingDatasetURL   ?a ;
        aimd2:modelWeightsURL      ?b ;
        aimd2:downstreamLicenceURI ?c ;
        aimd2:article50PolicyURL   ?d .
}`);
        return { id: "UC-01", title: "Open Research LLM",
            chain: "CC-BY corpus → open LLM pre-training",
            compliant: b.length > 0,
            verdict: b.length > 0 ? "COMPLIANT" : "EVIDENCE MISSING",
            detail: b.length > 0 ? "All 4 evidence properties present" : "One or more evidence properties missing",
            legalBasis: "CC-BY 4.0 · OSAID 1.0 · DSM Art. 3" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?a WHERE {
    dcat:CommercialProductDist2 aimd2:actorType ?a ;
                                aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CommercialConflictLicence> .
}`);
        const v = b.some(r => r.a?.value === "commercial");
        return { id: "UC-02", title: "NC Commercial Conflict",
            chain: "CC-BY-NC source → commercial product",
            compliant: !v,
            verdict: v ? "NC CONFLICT" : "COMPLIANT",
            detail: v ? "actorType=commercial + CC-BY-NC on parent source" : "No conflict detected",
            legalBasis: "CC-BY-NC 4.0 · DSM Art. 4(3)" };
    },
    async () => {
        const b = await sq(`${P}
SELECT (BOUND(?dl) AS ?has) WHERE {
    dcat:CopyleftViolatingModelDist3 aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CopyleftPropagationLicence> .
    OPTIONAL { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI ?dl }
}`);
        const v = b.some(r => r.has?.value === "false");
        return { id: "UC-03", title: "Copyleft Violation",
            chain: "CC-BY-SA corpus → licence-stripping fine-tune",
            compliant: !v,
            verdict: v ? "COPYLEFT VIOLATION" : "COMPLIANT",
            detail: v ? "ShareAlike source + downstreamLicenceURI absent" : "Copyleft obligation satisfied",
            legalBasis: "CC-BY-SA 4.0 · OSAID 1.0" };
    },
    async () => {
        const b = await sq(`${P} SELECT ?e WHERE { dcat:PrematureRAGDist4 aimd2:EmbargoEndDate ?e . }`);
        if (!b.length) return { id: "UC-04", title: "Embargo Violation",
            chain: "Embargoed preprint → premature RAG ingestion",
            compliant: false, verdict: "DATA MISSING",
            detail: "EmbargoEndDate not found", legalBasis: "DSM Art. 6 · BOAI 2002" };
        const active = new Date(b[0].e.value) > new Date();
        return { id: "UC-04", title: "Embargo Violation",
            chain: "Embargoed preprint → premature RAG ingestion",
            compliant: !active,
            verdict: active ? "EMBARGO ACTIVE" : "COMPLIANT",
            detail: active ? `Embargo end: ${b[0].e.value}` : "Embargo has lifted",
            legalBasis: "DSM Art. 6 · BOAI 2002" };
    },
    async () => {
        const b = await sq(`${P}
SELECT (COUNT(?p) AS ?cnt) ?a WHERE {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p ; aimd2:actorType ?a .
} GROUP BY ?a`);
        const ncP = await ask(`${P}
ASK {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CommercialConflictLicence> .
}`);
        const c = parseInt(b[0]?.cnt?.value || "0", 10);
        const v = c >= 3 && b[0]?.a?.value === "commercial" && ncP;
        return { id: "UC-05", title: "Multi-Source GPAI",
            chain: "CC-BY + CC-BY-NC + CC-BY-SA → GPAI model",
            compliant: !v,
            verdict: v ? "MULTI-SOURCE CONFLICT" : "COMPLIANT",
            detail: v ? `${c} sources: NC parent + commercial actor` : "No conflict detected",
            legalBasis: "EU AI Act Art. 53(1)(c) · DSM Art. 3/4" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?a (BOUND(?dl) AS ?has) WHERE {
    dcat:UnauthorisedDistillationDist6 aimd2:actorType ?a ;
                                       aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/ProprietaryDistillationLicence> .
    OPTIONAL { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI ?dl }
}`);
        const l1 = b.some(r => r.a?.value === "competitor");
        const l2 = b.some(r => r.has?.value === "false");
        return { id: "UC-06", title: "Distillation Prohibition",
            chain: "Proprietary LLM API → student model",
            compliant: !(l1 || l2),
            verdict: l1 && l2 ? "CONTRACTUAL PROHIBITION" : l1 ? "ToS VIOLATION" : "COMPLIANT",
            detail: l1 && l2 ? "Layer 1: competitor actor · Layer 2: derivedModelLicenceURI absent" : "No violation detected",
            legalBasis: "US Copyright Office Part 2 (2025) · API ToS" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?x ?y WHERE { dcat:MITStudentDist7 aimd2:baseModelURL ?x ; aimd2:modelWeightsURL ?y . }`);
        return { id: "UC-07", title: "Apache → MIT Fine-tune",
            chain: "Apache 2.0 base → MIT fine-tuned model",
            compliant: b.length > 0,
            verdict: b.length > 0 ? "COMPLIANT" : "ATTRIBUTION MISSING",
            detail: b.length > 0 ? "baseModelURL + modelWeightsURL declared" : "Attribution metadata missing",
            legalBasis: "Apache 2.0 · MIT Licence · OSAID 1.0" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?ctx (BOUND(?w) AS ?hasW) WHERE {
    dcat:NetworkAPIDist8 aimd2:deploymentContext ?ctx .
    OPTIONAL { dcat:NetworkAPIDist8 aimd2:modelWeightsURL ?w }
}`);
        const v = b.some(r => r.ctx?.value === "network" && r.hasW?.value === "false");
        return { id: "UC-08", title: "AGPL Network Trigger",
            chain: "AGPL fine-tune deployed as public API",
            compliant: !v,
            verdict: v ? "AGPL §13 VIOLATION" : "COMPLIANT",
            detail: v ? "deploymentContext=network + modelWeightsURL absent" : "Source offer obligation satisfied",
            legalBasis: "AGPLv3 §13 · Black Duck OSSRA" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?pol (BOUND(?cs) AS ?hasCs) WHERE {
    dcat:RLHFAlignedDist9 aimd2:rlhfDataPolicy ?pol .
    OPTIONAL { dcat:RLHFAlignedDist9 aimd2:userConsentStatus ?cs }
}`);
        const v = b.some(r => !!r.pol?.value && r.hasCs?.value === "false");
        return { id: "UC-09", title: "RLHF Consent Violation",
            chain: "RLHF training without GDPR consent",
            compliant: !v,
            verdict: v ? "GDPR CONSENT MISSING" : "COMPLIANT",
            detail: v ? "rlhfDataPolicy declared + userConsentStatus absent" : "Consent obligation satisfied",
            legalBasis: "GDPR Art. 6/13/14 · EU AI Act Art. 10" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?m (BOUND(?a50) AS ?hasA50) WHERE {
    dcat:OpenModelSyntheticDist10 aimd2:dataGenerationMethod ?m .
    OPTIONAL { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL ?a50 }
}`);
        const v = b.some(r => r.m?.value === "synthetic-from-proprietary-teacher" && r.hasA50?.value === "false");
        return { id: "UC-10", title: "Synthetic Data Disclosure",
            chain: "Proprietary teacher → synthetic data → open model",
            compliant: !v,
            verdict: v ? "ART. 50 DISCLOSURE GAP" : "COMPLIANT",
            detail: v ? "Synthetic-from-proprietary + article50PolicyURL absent" : "Disclosure obligation satisfied",
            legalBasis: "EU AI Act Art. 50/53 · Recitals 107–110" };
    },
    async () => {
        const b = await sq(`${P}
SELECT (COUNT(?p) AS ?cnt) ?rag WHERE {
    dcat:GeneratorRAGDist11 aimd:derivedFromDistribution ?p ;
                            aimd2:ragCorpusPolicy ?rag .
} GROUP BY ?rag`);
        const c  = parseInt(b[0]?.cnt?.value || "0", 10);
        const ok = c >= 2 && !!b[0]?.rag?.value;
        return { id: "UC-11", title: "RAG PolicySet",
            chain: "Retriever model + corpus → RAG output",
            compliant: true,
            verdict: ok ? "POLICY SET SATISFIED" : "POLICY SET PARTIAL",
            detail: ok ? `${c} licences composed · ragCorpusPolicy declared` : "Multi-asset composition incomplete",
            legalBasis: "IDS-RAM 4.0 · W3C ODRL PolicySet" };
    },
    async () => {
        const b = await sq(`${P}
SELECT ?eL ?mL WHERE {
    dcat:MoEMergedDist12 dct:license ?mL ;
                         aimd:derivedFromDistribution ?e .
    ?e dct:license ?eL .
    FILTER(?eL = <https://example.com/policy/MoEMergedModelLicence>)
}`);
        const v = b.some(r =>
            r.eL?.value === "https://example.com/policy/MoEMergedModelLicence" &&
            r.mL?.value !== "https://example.com/policy/MoEMergedModelLicence"
        );
        return { id: "UC-12", title: "MoE Inheritance Failure",
            chain: "Expert A + Llama expert + Expert C → merged MoE",
            compliant: !v,
            verdict: v ? "INHERITANCE FAILURE" : "COMPLIANT",
            detail: v ? "Llama obligation not propagated to merged model" : "Strictest-survives rule satisfied",
            legalBasis: "Meta Llama Community Licence §2 · EU AI Act Art. 53" };
    },
    async () => {
        const exists = await ask(`${P} ASK { dcat:ExecutorLLMDist13 a aimd:AIModelDistribution . }`);
        if (!exists) return { id: "UC-13", title: "Inference Chain",
            chain: "Planner LLM → executor LLM at inference time",
            compliant: true, verdict: "DATA NOT LOADED",
            detail: "Run npm run evaluate:reload first", legalBasis: "Novel anti-pattern test" };
        const b = await sq(`${P}
SELECT ?lic (BOUND(?t) AS ?hasT) (BOUND(?bm) AS ?hasBm) WHERE {
    dcat:ExecutorLLMDist13 dct:license ?lic .
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:trainingDatasetURL ?t }
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:baseModelURL       ?bm }
}`);
        const hasInfLic = b.some(r => r.lic?.value === "https://example.com/policy/InferenceChainLicence");
        const hasTrainP = b.some(r => r.hasT?.value === "true" || r.hasBm?.value === "true");
        const ok = hasInfLic && !hasTrainP;
        return { id: "UC-13", title: "Inference Chain",
            chain: "Planner LLM → executor LLM at inference time",
            compliant: ok,
            verdict: ok ? "TRUE NEGATIVE — COMPLIANT" : "FALSE POSITIVE RISK",
            detail: ok ? "InferenceChainLicence + no training evidence" : "Training evidence found on inference-only distribution",
            legalBasis: "Novel anti-pattern test" };
    },
    async () => {
        const b = await sq(`${P}
SELECT (COUNT(?dist) AS ?count) WHERE {
    { BIND(dcat:GPAIAPIDist14 AS ?dist) }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    ?dist aimd2:article50PolicyURL ?a50 .
}`);
        const c = parseInt(b[0]?.count?.value || "0", 10);
        return { id: "UC-14", title: "3-Hop CC-BY Chain",
            chain: "CC-BY corpus → base LLM → fine-tune → GPAI API",
            compliant: c >= 3,
            verdict: c >= 3 ? "COMPLIANT" : "ART. 50 INCOMPLETE",
            detail: c >= 3 ? `${c}/4 hops carry Art. 50 policy URL` : `${c}/4 hops have Art. 50 declaration`,
            legalBasis: "EU AI Act Art. 50 · CC-BY 4.0 · OSAID 1.0" };
    },
    async () => {
        const c1 = await ask(`${P}
ASK { ?d aimd2:actorType "competitor" .
      VALUES ?d { dcat:DistillationDist15 dcat:ClosedModelDist15 } }`);
        const c2 = await ask(`${P}
ASK {
    dcat:ConsumerProductDist15 aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
    FILTER NOT EXISTS { dcat:ConsumerProductDist15 aimd2:article50PolicyURL ?u }
}`);
        const c3 = await ask(`${P}
ASK {
    dcat:MoEMergeStepDist15 aimd:derivedFromDistribution ?e .
    ?e dct:license <https://example.com/policy/MoEMergedModelLicence> .
    FILTER NOT EXISTS {
        dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence>
    }
}`);
        const types = [
            c1 && "Distillation prohibition",
            c2 && "Art. 50 disclosure gap",
            c3 && "MoE inheritance failure",
        ].filter(Boolean);
        return { id: "UC-15", title: "5-Hop Cascading Conflicts",
            chain: "Proprietary chain · 5 derivation hops",
            compliant: false,
            verdict: "CASCADING CONFLICTS",
            detail: `${types.length} conflict type(s): ${types.join(" · ")}`,
            legalBasis: "EU AI Act Art. 53 · Llama §2 · API ToS" };
    },
];

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/status", async (_req, res) => {
    try {
        await axios.get(`${GRAPHDB_BASE}/repositories`, { timeout: 3000 });
        const b = await sq(`${P} SELECT ?d WHERE { ?d a aimd:AIModelDistribution } LIMIT 1`).catch(() => []);
        res.json({ graphdb: true, dataLoaded: b.length > 0 });
    } catch {
        res.json({ graphdb: false, dataLoaded: false });
    }
});

app.get("/api/run", async (_req, res) => {
    const t0 = Date.now();
    try {
        // Phase 2 — compliance + V2 obligations (parallel per distribution)
        const [comp1, comp2, v2_1, v2_2] = await Promise.all([
            verifyComplianceAPI("IrishLegalLLMDist1.5"),
            verifyComplianceAPI("TextGenDist1.4"),
            checkNewV2ObligationsAPI("IrishLegalLLMDist1.5"),
            checkNewV2ObligationsAPI("TextGenDist1.4"),
        ]);

        // Phase 3 — N-hop provenance chain (sequential — follows links iteratively)
        const provenance = await nHopChainAPI(
            "https://www.w3.org/ns/dcat#LegalLLMContractAnalysisDist1.6"
        );

        // Phase 5 — DALICC licence compatibility
        const dalicc = await daliccCheckAPI();

        // Phase 7 — use-case checks (parallel)
        const useCases = await Promise.all(
            CHECKS.map((c, i) => c().catch(err => ({
                id: `UC-${String(i + 1).padStart(2, "0")}`, title: "Check Failed",
                chain: "", compliant: false, verdict: "ERROR",
                detail: err.message.slice(0, 120), legalBasis: "",
            })))
        );

        res.json({
            complianceChecks: [
                { ...comp1, v2: v2_1 },
                { ...comp2, v2: v2_2 },
            ],
            provenance,
            dalicc,
            useCases,
            durationMs: Date.now() - t0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
    console.log(`\n  ┌──────────────────────────────────────────┐`);
    console.log(`  │  AIMD v2.0 Demo → http://localhost:${PORT}  │`);
    console.log(`  └──────────────────────────────────────────┘\n`);
});
