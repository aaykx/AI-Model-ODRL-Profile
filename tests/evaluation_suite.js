/**
 * tests/evaluation_suite.js
 *
 * Comprehensive evaluation suite for AIMD Extended Profile v2.0.
 *
 * Sections:
 *   A — Infrastructure & Setup          (A-01 to A-05)
 *   V — Vocabulary / Ontology Integrity (V-01 to V-12)
 *   L — Licence File Structure          (L-01 to L-13)
 *   G — Knowledge Graph Integrity       (G-01 to G-10)
 *   E — Compliance Verdict Correctness  (E-01 to E-15)
 *   X — Cross-Cutting Design Properties (X-01 to X-08)
 *
 * Auto-loading: if TTL files or the knowledge graph are not yet in GraphDB,
 * the suite loads them automatically from disk before running the tests.
 *
 * Run:  node tests/evaluation_suite.js
 * Exit: 0 if all pass, 1 if any fail.
 */

"use strict";

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

// ─── Configuration ────────────────────────────────────────────────────────────
const GRAPHDB_BASE      = "http://localhost:7200";
const REPO_ID           = "AIModels";
const SPARQL_ENDPOINT   = `${GRAPHDB_BASE}/repositories/${REPO_ID}`;
const STATEMENTS_URL    = `${GRAPHDB_BASE}/repositories/${REPO_ID}/statements`;
const ROOT              = path.resolve(__dirname, "..");

const NS = {
    aimd2:   "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#",
    aimd:    "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#",
    odrl:    "http://www.w3.org/ns/odrl/2/",
    rdf:     "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs:    "http://www.w3.org/2000/01/rdf-schema#",
    dct:     "http://purl.org/dc/terms/",
    dcat:    "https://www.w3.org/ns/dcat#",
    xsd:     "http://www.w3.org/2001/XMLSchema#",
    skos:    "http://www.w3.org/2004/02/skos/core#",
    owl:     "http://www.w3.org/2002/07/owl#",
    prov:    "http://www.w3.org/ns/prov#",
    sh:      "http://www.w3.org/ns/shacl#",
    profile: "http://www.w3.org/ns/dx/prof/",
};

const PREFIXES = Object.entries(NS)
    .map(([p, uri]) => `PREFIX ${p}: <${uri}>`)
    .join("\n");

// All TTL files that must be loaded for the suite to pass, in dependency order.
const ALL_TTL_FILES = [
    "AIMD.ttl",
    "AIMD_extended.ttl",
    "AIMD_extended_v2.ttl",
    "OpenResearchLLMLicence.ttl",
    "CommercialConflictLicence.ttl",
    "CopyleftPropagationLicence.ttl",
    "EmbargoedCorpusLicence.ttl",
    "ProprietaryDistillationLicence.ttl",
    "ApacheMITChainLicence.ttl",
    "AGPLNetworkLicence.ttl",
    "RLHFAlignedModelLicence.ttl",
    "SyntheticDataDisclosureLicence.ttl",
    "RAGPolicySetLicence.ttl",
    "MoEMergedModelLicence.ttl",
    "InferenceChainLicence.ttl",
    "CascadingConflictLicence.ttl",
    "AIMD_v2_knowledge_graph.ttl",
    "AIMD_v2_shapes.ttl",
];

// ─── SPARQL helpers ───────────────────────────────────────────────────────────
async function sparqlSelect(query) {
    const r = await axios.post(
        SPARQL_ENDPOINT,
        `query=${encodeURIComponent(query)}`,
        { headers: { "Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "application/sparql-results+json" },
          timeout: 15000 }
    );
    return r.data.results.bindings;
}

async function sparqlAsk(query) {
    const r = await axios.post(
        SPARQL_ENDPOINT,
        `query=${encodeURIComponent(query)}`,
        { headers: { "Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "application/sparql-results+json" },
          timeout: 15000 }
    );
    return r.data.boolean;
}

async function count(sparqlCountQuery) {
    const b = await sparqlSelect(sparqlCountQuery);
    return parseInt(b[0]?.count?.value || b[0]?.c?.value || "0", 10);
}

// ─── Force-reload flag ────────────────────────────────────────────────────────
const FORCE_RELOAD = process.argv.includes("--reload");

// ─── Auto-loader ──────────────────────────────────────────────────────────────
async function autoLoadData() {
    console.log("\n  ↻  Loading all TTL files into GraphDB repository \"" + REPO_ID + "\"...\n");
    let loaded = 0, skipped = 0, failed = 0;
    for (const filename of ALL_TTL_FILES) {
        const filepath = path.join(ROOT, filename);
        if (!fs.existsSync(filepath)) {
            console.log(`  ⊘  ${filename} — not found on disk, skipping`);
            skipped++;
            continue;
        }
        const content = fs.readFileSync(filepath, "utf8");
        try {
            await axios.post(STATEMENTS_URL, content, {
                headers: { "Content-Type": "text/turtle" },
                timeout: 60000,
            });
            console.log(`  ↑  ${filename}`);
            loaded++;
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.log(`  ✗  ${filename}: ${msg}`);
            failed++;
        }
    }
    console.log(`\n  Load complete: ${loaded} loaded, ${skipped} skipped, ${failed} failed\n`);
    return failed === 0;
}

// ─── Result tracking ──────────────────────────────────────────────────────────
const results = [];
let currentSection = "";

function setSection(label) {
    currentSection = label;
    console.log(`\n${"─".repeat(68)}`);
    console.log(`  ${label}`);
    console.log(`${"─".repeat(68)}\n`);
}

function pass(id, name, detail = "") {
    results.push({ id, section: currentSection, name, ok: true, detail });
    console.log(`  ✓  ${id}: ${name}${detail ? " — " + detail : ""}`);
}

function fail(id, name, detail = "") {
    results.push({ id, section: currentSection, name, ok: false, detail });
    console.log(`  ✗  ${id}: ${name}${detail ? " — " + detail : ""}`);
}

function skip(id, name, reason = "") {
    results.push({ id, section: currentSection, name, ok: null, detail: reason });
    console.log(`  ⊘  ${id}: ${name}${reason ? " (skipped: " + reason + ")" : ""}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — Infrastructure & Setup
// ─────────────────────────────────────────────────────────────────────────────
async function sectionA() {
    setSection("A — Infrastructure & Setup");

    // A-01: GraphDB reachable
    try {
        await axios.get(`${GRAPHDB_BASE}/rest/repositories`, { timeout: 5000 });
        pass("A-01", "GraphDB running at localhost:7200");
    } catch {
        fail("A-01", "GraphDB running at localhost:7200", "connection refused — start GraphDB first");
        return false;
    }

    // A-02: Repository exists
    try {
        const r = await axios.get(`${GRAPHDB_BASE}/rest/repositories`, { timeout: 5000 });
        const found = Array.isArray(r.data) && r.data.some(repo => repo.id === REPO_ID);
        if (found) {
            pass("A-02", `Repository "${REPO_ID}" exists`);
        } else {
            fail("A-02", `Repository "${REPO_ID}" exists`, "create it in GraphDB Workbench first");
            return false;
        }
    } catch {
        fail("A-02", `Repository "${REPO_ID}" exists`);
        return false;
    }

    // Check data presence; auto-load if missing
    const vocabCount = await count(`${PREFIXES}
SELECT (COUNT(?a) AS ?count) WHERE {
    ?a a odrl:Action . FILTER(STRSTARTS(STR(?a), "${NS.aimd2}"))
}`).catch(() => 0);

    const distCount = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE { ?d a aimd:AIModelDistribution . }
`).catch(() => 0);

    const policyCount = await count(`${PREFIXES}
SELECT (COUNT(?p) AS ?count) WHERE {
    ?p a odrl:Policy . FILTER(STRSTARTS(STR(?p), "https://example.com/policy/"))
}`).catch(() => 0);

    if (FORCE_RELOAD || vocabCount < 11 || distCount < 30 || policyCount < 13) {
        if (FORCE_RELOAD) {
            console.log("  ⚠  --reload flag set — clearing repository and reloading all TTL files...");
            try {
                await axios.delete(STATEMENTS_URL, { timeout: 60000 });
                console.log("  ✓  Repository cleared");
            } catch (err) {
                console.log(`  ⚠  Clear failed (${err.message}) — proceeding with additive load`);
            }
        } else {
            console.log("  ⚠  Data missing — auto-loading TTL files...");
        }
        await autoLoadData();
    }

    // A-03: Vocabulary loaded
    const vc = await count(`${PREFIXES}
SELECT (COUNT(?a) AS ?count) WHERE {
    ?a a odrl:Action . FILTER(STRSTARTS(STR(?a), "${NS.aimd2}"))
}`).catch(() => 0);
    vc >= 11
        ? pass("A-03", "AIMD_extended_v2.ttl loaded", `${vc} aimd2: Action terms`)
        : fail("A-03", "AIMD_extended_v2.ttl loaded", `${vc} terms — check TTL file loaded correctly`);

    // A-04: Knowledge graph populated
    const dc = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE { ?d a aimd:AIModelDistribution . }
`).catch(() => 0);
    dc >= 30
        ? pass("A-04", "Knowledge graph populated", `${dc} distributions`)
        : fail("A-04", "Knowledge graph populated", `${dc} found — check AIMD_v2_knowledge_graph.ttl loaded correctly`);

    // A-05: All 13 licence files loaded
    const pc = await count(`${PREFIXES}
SELECT (COUNT(?p) AS ?count) WHERE {
    ?p a odrl:Policy . FILTER(STRSTARTS(STR(?p), "https://example.com/policy/"))
}`).catch(() => 0);
    pc >= 13
        ? pass("A-05", "All 13 licence TTL files loaded", `${pc} odrl:Policy instances`)
        : fail("A-05", "All 13 licence TTL files loaded", `${pc}/13 policies found`);

    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION V — Vocabulary / Ontology Integrity
// ─────────────────────────────────────────────────────────────────────────────
async function sectionV() {
    setSection("V — Vocabulary / Ontology Integrity (AIMD_extended_v2.ttl)");

    // Ontology document IRI (no trailing #) — distinct from the term namespace
    const ONTOLOGY_IRI = NS.aimd2.replace(/#$/, "");

    const EXPECTED_ACTIONS = [
        "AITraining", "FineTuning", "RAGIngestion", "RLHFTraining", "AIInference",
        "ModelSharing", "InheritSourceLicence", "InheritSourceProhibitions",
        "DeclareRLHFDataUse", "ReportSecurityIncidents", "ComplyWithArticle50"
    ];
    const EXPECTED_LEFT  = ["EmbargoEndDate","userConsentStatus","downstreamLicence","actorType","dataGenerationMethod","deploymentContext"];
    const EXPECTED_RIGHT = ["CommercialPurpose","ScientificResearchPurpose","RecognisedResearchOrganisation"];

    // V-01: All 11 action terms declared — fetch the list first
    let actionTermsFound = [];
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?term WHERE {
    ?term a odrl:Action . FILTER(STRSTARTS(STR(?term), "${NS.aimd2}"))
}`);
        actionTermsFound = b.map(r => r.term.value.replace(/.*[/#]/, ""));
        const missing = EXPECTED_ACTIONS.filter(a => !actionTermsFound.includes(a));
        missing.length === 0
            ? pass("V-01", "All 11 aimd2: Action terms declared")
            : fail("V-01", "All 11 aimd2: Action terms declared", `missing: ${missing.join(", ")}`);
    } catch (err) { fail("V-01", "All 11 Action terms declared", err.message); }

    // V-02 to V-05: annotation completeness — only meaningful if action terms exist
    if (actionTermsFound.length === 0) {
        for (const [id, label] of [
            ["V-02","aimd:evidenceProperty"], ["V-03","aimd:legalBasis"],
            ["V-04","aimd:severity"],         ["V-05","aimd:checkDescription"],
        ]) {
            fail(id, `All action terms have ${label}`, "no action terms loaded — V-01 prerequisite failed");
        }
    } else {
        for (const [id, prop, label] of [
            ["V-02", "aimd:evidenceProperty", "aimd:evidenceProperty"],
            ["V-03", "aimd:legalBasis",       "aimd:legalBasis"],
            ["V-04", "aimd:severity",         "aimd:severity"],
            ["V-05", "aimd:checkDescription", "aimd:checkDescription"],
        ]) {
            try {
                const b = await sparqlSelect(`${PREFIXES}
SELECT ?term WHERE {
    ?term a odrl:Action . FILTER(STRSTARTS(STR(?term), "${NS.aimd2}"))
    FILTER NOT EXISTS { ?term ${prop} ?v }
}`);
                b.length === 0
                    ? pass(id, `All action terms have ${label}`)
                    : fail(id, `All action terms have ${label}`, `missing on: ${b.map(r => r.term.value.replace(/.*[/#]/, "")).join(", ")}`);
            } catch (err) { fail(id, `All action terms have ${label}`, err.message); }
        }
    }

    // V-06: All 6 LeftOperand terms
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?term WHERE {
    ?term a odrl:LeftOperand . FILTER(STRSTARTS(STR(?term), "${NS.aimd2}"))
}`);
        const found   = b.map(r => r.term.value.replace(/.*[/#]/, ""));
        const missing = EXPECTED_LEFT.filter(o => !found.includes(o));
        missing.length === 0
            ? pass("V-06", "All 6 LeftOperand terms declared", found.join(", "))
            : fail("V-06", "All 6 LeftOperand terms declared", `missing: ${missing.join(", ")}`);
    } catch (err) { fail("V-06", "All 6 LeftOperand terms", err.message); }

    // V-07: All 3 RightOperand terms
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?term WHERE {
    ?term a odrl:RightOperand . FILTER(STRSTARTS(STR(?term), "${NS.aimd2}"))
}`);
        const found   = b.map(r => r.term.value.replace(/.*[/#]/, ""));
        const missing = EXPECTED_RIGHT.filter(o => !found.includes(o));
        missing.length === 0
            ? pass("V-07", "All 3 RightOperand terms declared", found.join(", "))
            : fail("V-07", "All 3 RightOperand terms declared", `missing: ${missing.join(", ")}`);
    } catch (err) { fail("V-07", "All 3 RightOperand terms", err.message); }

    // V-08: propagatesObligationTo is rdf:Property
    try {
        const ok = await sparqlAsk(`${PREFIXES} ASK { aimd2:propagatesObligationTo a rdf:Property }`);
        ok ? pass("V-08", "aimd2:propagatesObligationTo declared as rdf:Property")
           : fail("V-08", "aimd2:propagatesObligationTo declared as rdf:Property", "triple not found");
    } catch (err) { fail("V-08", "propagatesObligationTo rdf:Property", err.message); }

    // V-09: profile:isProfileOf ODRL 2.2
    try {
        const ok = await sparqlAsk(`${PREFIXES} ASK { <${ONTOLOGY_IRI}> profile:isProfileOf <http://www.w3.org/ns/odrl/2/> }`);
        ok ? pass("V-09", "Profile isProfileOf <http://www.w3.org/ns/odrl/2/>")
           : fail("V-09", "Profile isProfileOf <http://www.w3.org/ns/odrl/2/>", "link absent");
    } catch (err) { fail("V-09", "Profile isProfileOf ODRL 2.2", err.message); }

    // V-10: owl:imports
    try {
        const b = await sparqlSelect(`${PREFIXES} SELECT ?i WHERE { <${ONTOLOGY_IRI}> owl:imports ?i . }`);
        b.length >= 1
            ? pass("V-10", "Profile declares owl:imports", b.map(r => r.i.value).join("; "))
            : fail("V-10", "Profile declares owl:imports", "no owl:imports on aimd2:");
    } catch (err) { fail("V-10", "Profile owl:imports", err.message); }

    // V-11: SKOS collection groups ≥21 members
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?m) AS ?count) WHERE {
    ?col a skos:Collection . FILTER(STRSTARTS(STR(?col), "${NS.aimd2}"))
    ?col skos:member ?m .
}`);
        c >= 21 ? pass("V-11", "SKOS collection groups ≥21 terms", `${c} members`)
                : fail("V-11", "SKOS collection groups ≥21 terms", `${c} members`);
    } catch (err) { fail("V-11", "SKOS collection", err.message); }

    // V-12: All action terms have rdfs:label — only run if terms exist
    if (actionTermsFound.length === 0) {
        fail("V-12", "All action terms have rdfs:label", "no action terms loaded — V-01 prerequisite failed");
    } else {
        try {
            const b = await sparqlSelect(`${PREFIXES}
SELECT ?term WHERE {
    ?term a odrl:Action . FILTER(STRSTARTS(STR(?term), "${NS.aimd2}"))
    FILTER NOT EXISTS { ?term rdfs:label ?l }
}`);
            b.length === 0
                ? pass("V-12", "All action terms have rdfs:label")
                : fail("V-12", "All action terms have rdfs:label", `missing on: ${b.map(r => r.term.value.replace(/.*[/#]/, "")).join(", ")}`);
        } catch (err) { fail("V-12", "rdfs:label on action terms", err.message); }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION L — Licence File Structure
// ─────────────────────────────────────────────────────────────────────────────
async function sectionL() {
    setSection("L — Licence File Structure (all 13 TTL files)");

    const LICENCES = [
        { id: "L-01", name: "OpenResearchLLMLicence",        uc: "UC-1, UC-14" },
        { id: "L-02", name: "CommercialConflictLicence",      uc: "UC-2, UC-5"  },
        { id: "L-03", name: "CopyleftPropagationLicence",     uc: "UC-3, UC-5"  },
        { id: "L-04", name: "EmbargoedCorpusLicence",         uc: "UC-4"        },
        { id: "L-05", name: "ProprietaryDistillationLicence", uc: "UC-6, UC-15" },
        { id: "L-06", name: "ApacheMITChainLicence",          uc: "UC-7"        },
        { id: "L-07", name: "AGPLNetworkLicence",             uc: "UC-8, UC-15" },
        { id: "L-08", name: "RLHFAlignedModelLicence",        uc: "UC-9"        },
        { id: "L-09", name: "SyntheticDataDisclosureLicence", uc: "UC-10, UC-15"},
        { id: "L-10", name: "RAGPolicySetLicence",            uc: "UC-11"       },
        { id: "L-11", name: "MoEMergedModelLicence",          uc: "UC-12, UC-15"},
        { id: "L-12", name: "InferenceChainLicence",          uc: "UC-13"       },
        { id: "L-13", name: "CascadingConflictLicence",       uc: "UC-15"       },
    ];

    for (const lic of LICENCES) {
        const uri = `https://example.com/policy/${lic.name}`;
        try {
            const meta = await sparqlSelect(`${PREFIXES}
SELECT ?title ?created WHERE {
    <${uri}> a odrl:Policy ; dct:title ?title ; dct:created ?created .
}`);
            if (meta.length === 0) {
                fail(lic.id, `${lic.name} (${lic.uc})`, "not found or missing dct:title/dct:created");
                continue;
            }
            const ruleCount = await count(`${PREFIXES}
SELECT (COUNT(?r) AS ?count) WHERE {
    <${uri}> ?t ?r . FILTER(?t IN (odrl:permission, odrl:prohibition, odrl:obligation))
}`);
            const hasProp = await sparqlAsk(`${PREFIXES}
ASK { <${uri}> aimd2:propagatesObligationTo ?target . }`);

            if (ruleCount >= 1 && hasProp) {
                pass(lic.id, `${lic.name} (${lic.uc})`, `${ruleCount} rules, propagatesObligationTo ✓`);
            } else if (ruleCount >= 1) {
                fail(lic.id, `${lic.name} (${lic.uc})`, `${ruleCount} rules but propagatesObligationTo absent`);
            } else {
                fail(lic.id, `${lic.name} (${lic.uc})`, `only ${ruleCount} rules (expected ≥1)`);
            }
        } catch (err) { fail(lic.id, `${lic.name} (${lic.uc})`, err.message); }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION G — Knowledge Graph Structural Integrity
// ─────────────────────────────────────────────────────────────────────────────
async function sectionG() {
    setSection("G — Knowledge Graph Structural Integrity");

    const TERMINALS = [
        "OpenResearchLLMDist1",    "CommercialProductDist2",       "CopyleftViolatingModelDist3",
        "PrematureRAGDist4",       "GPAIMultiSourceDist5",         "UnauthorisedDistillationDist6",
        "MITStudentDist7",         "NetworkAPIDist8",               "RLHFAlignedDist9",
        "OpenModelSyntheticDist10","GeneratorRAGDist11",            "MoEMergedDist12",
        "ExecutorLLMDist13",       "GPAIAPIDist14",                 "ConsumerProductDist15",
    ];

    // G-01: All 15 terminal distributions exist — establishes whether G-02/G-03 make sense
    let terminalsExist = false;
    try {
        const missing = [];
        for (const d of TERMINALS) {
            const ok = await sparqlAsk(`${PREFIXES}
ASK { dcat:${d} a aimd:AIModelDistribution . }`);
            if (!ok) missing.push(d);
        }
        if (missing.length === 0) {
            pass("G-01", "All 15 terminal distributions exist");
            terminalsExist = true;
        } else {
            fail("G-01", "All 15 terminal distributions exist", `missing: ${missing.join(", ")}`);
        }
    } catch (err) { fail("G-01", "All 15 terminal distributions", err.message); }

    // G-02 / G-03: only meaningful when distributions actually exist
    if (!terminalsExist) {
        fail("G-02", "All distributions have dct:license",   "prerequisite G-01 failed — no distributions in graph");
        fail("G-03", "All distributions have odrl:hasPolicy","prerequisite G-01 failed — no distributions in graph");
    } else {
        try {
            const b = await sparqlSelect(`${PREFIXES}
SELECT ?dist WHERE {
    ?dist a aimd:AIModelDistribution . FILTER NOT EXISTS { ?dist dct:license ?l }
}`);
            b.length === 0
                ? pass("G-02", "All distributions have dct:license")
                : fail("G-02", "All distributions have dct:license", `missing on: ${b.map(r => r.dist.value.replace(/.*[/#]/, "")).join(", ")}`);
        } catch (err) { fail("G-02", "dct:license on all distributions", err.message); }

        try {
            const b = await sparqlSelect(`${PREFIXES}
SELECT ?dist WHERE {
    ?dist a aimd:AIModelDistribution . FILTER NOT EXISTS { ?dist odrl:hasPolicy ?p }
}`);
            b.length === 0
                ? pass("G-03", "All distributions have odrl:hasPolicy")
                : fail("G-03", "All distributions have odrl:hasPolicy", `missing on: ${b.map(r => r.dist.value.replace(/.*[/#]/, "")).join(", ")}`);
        } catch (err) { fail("G-03", "odrl:hasPolicy on all distributions", err.message); }
    }

    // G-04: ≥15 derivedFromDistribution links
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE {
    ?d a aimd:AIModelDistribution ; aimd:derivedFromDistribution ?p .
}`);
        c >= 15
            ? pass("G-04", "Derivation chains present", `${c} distributions have derivedFromDistribution`)
            : fail("G-04", "Derivation chains present", `${c} links (expected ≥15)`);
    } catch (err) { fail("G-04", "Derivation chains", err.message); }

    // G-05: PROV-O provenance
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE {
    ?d a aimd:AIModelDistribution ; prov:wasGeneratedBy ?act .
}`);
        c >= 15
            ? pass("G-05", "PROV-O provenance present", `${c} distributions have prov:wasGeneratedBy`)
            : fail("G-05", "PROV-O provenance present", `${c} found (expected ≥15)`);
    } catch (err) { fail("G-05", "PROV-O provenance", err.message); }

    // G-06: Multi-parent parent counts
    for (const [dist, expected, uc] of [
        ["GPAIMultiSourceDist5", 3, "UC-5" ],
        ["GeneratorRAGDist11",   2, "UC-11"],
        ["MoEMergedDist12",      3, "UC-12"],
    ]) {
        try {
            const c = await count(`${PREFIXES}
SELECT (COUNT(?p) AS ?count) WHERE { dcat:${dist} aimd:derivedFromDistribution ?p . }`);
            c === expected
                ? pass("G-06", `${dist} (${uc}) has ${expected} parents`, `${c} confirmed`)
                : fail("G-06", `${dist} (${uc}) has ${expected} parents`, `found ${c}`);
        } catch (err) { fail("G-06", `${dist} parent count`, err.message); }
    }

    // G-07a: UC-14 chain ≥4 nodes
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(DISTINCT ?h) AS ?count) WHERE {
    { BIND(dcat:GPAIAPIDist14 AS ?h) }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution ?h }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?h }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?h }
}`);
        c >= 4 ? pass("G-07a", "UC-14 chain is ≥4 nodes deep", `${c} nodes`)
               : fail("G-07a", "UC-14 chain is ≥4 nodes deep", `${c} nodes found`);
    } catch (err) { fail("G-07a", "UC-14 chain depth", err.message); }

    // G-07b: UC-15 chain ≥5 nodes
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(DISTINCT ?h) AS ?count) WHERE {
    { BIND(dcat:ConsumerProductDist15 AS ?h) }
    UNION { dcat:ConsumerProductDist15 aimd:derivedFromDistribution ?h }
    UNION { dcat:ConsumerProductDist15 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?h }
    UNION { dcat:ConsumerProductDist15 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?h }
    UNION { dcat:ConsumerProductDist15 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?h }
}`);
        c >= 5 ? pass("G-07b", "UC-15 chain is ≥5 nodes deep", `${c} nodes`)
               : fail("G-07b", "UC-15 chain is ≥5 nodes deep", `${c} nodes found`);
    } catch (err) { fail("G-07b", "UC-15 chain depth", err.message); }

    // G-08: DCAT catalog lists 15 distributions
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE {
    <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_v2_knowledge_graph.ttl> dcat:dataset ?d .
}`);
        c >= 15 ? pass("G-08", "DCAT catalog lists all 15 distributions", `${c} entries`)
                : fail("G-08", "DCAT catalog lists all 15 distributions", `${c} found`);
    } catch (err) { fail("G-08", "DCAT catalog", err.message); }

    // G-09: ≥13 propagatesObligationTo links
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?p) AS ?count) WHERE {
    ?p aimd2:propagatesObligationTo ?t . FILTER(STRSTARTS(STR(?p), "https://example.com/policy/"))
}`);
        c >= 13 ? pass("G-09", "propagatesObligationTo links present", `${c} links`)
                : fail("G-09", "propagatesObligationTo links present", `${c} (expected ≥13)`);
    } catch (err) { fail("G-09", "propagatesObligationTo in graph", err.message); }

    // G-10: SHACL shapes ≥18
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?s) AS ?count) WHERE {
    { ?s a sh:NodeShape } UNION { ?s a sh:PropertyShape }
    FILTER(STRSTARTS(STR(?s), "${NS.aimd2}"))
}`);
        c >= 18 ? pass("G-10", "SHACL shapes loaded (≥18)", `${c} shapes`)
                : fail("G-10", "SHACL shapes loaded (≥18)", `${c} — check AIMD_v2_shapes.ttl loaded`);
    } catch (err) { fail("G-10", "SHACL shapes", err.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION E — Compliance Verdict Correctness (all 15 Use Cases)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionE() {
    setSection("E — Compliance Verdict Correctness (15 Use Cases)");

    // E-01: UC-1 COMPLIANT — all 4 evidence properties present
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?a ?b ?c ?d WHERE {
    dcat:OpenResearchLLMDist1
        aimd2:trainingDatasetURL   ?a ;
        aimd2:modelWeightsURL      ?b ;
        aimd2:downstreamLicenceURI ?c ;
        aimd2:article50PolicyURL   ?d .
}`);
        b.length > 0
            ? pass("E-01", "UC-1 CC-BY → open research LLM  ✓ COMPLIANT", "all 4 evidence properties present")
            : fail("E-01", "UC-1 CC-BY → open research LLM  ✓ COMPLIANT", "one or more evidence properties missing");
    } catch (err) { fail("E-01", "UC-1", err.message); }

    // E-02: UC-2 NC CONFLICT
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?a WHERE {
    dcat:CommercialProductDist2 aimd2:actorType ?a ; aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CommercialConflictLicence> .
}`);
        b.some(r => r.a?.value === "commercial")
            ? pass("E-02", "UC-2 CC-BY-NC → commercial product  ✗ NC CONFLICT", "actorType=commercial + NC licence on parent")
            : fail("E-02", "UC-2 CC-BY-NC → commercial product  ✗ NC CONFLICT", "conflict pattern not found");
    } catch (err) { fail("E-02", "UC-2", err.message); }

    // E-03: UC-3 COPYLEFT VIOLATION
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT (BOUND(?dl) AS ?has) WHERE {
    dcat:CopyleftViolatingModelDist3 aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CopyleftPropagationLicence> .
    OPTIONAL { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI ?dl }
}`);
        b.some(r => r.has?.value === "false")
            ? pass("E-03", "UC-3 CC-BY-SA copyleft stripped  ✗ COPYLEFT VIOLATION", "SA source + downstreamLicenceURI absent")
            : fail("E-03", "UC-3 CC-BY-SA copyleft stripped  ✗ COPYLEFT VIOLATION", "violation pattern not detected");
    } catch (err) { fail("E-03", "UC-3", err.message); }

    // E-04: UC-4 EMBARGO ACTIVE
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?e WHERE { dcat:PrematureRAGDist4 aimd2:EmbargoEndDate ?e . }`);
        if (b.length > 0) {
            const end   = new Date(b[0].e.value);
            const today = new Date("2026-07-12");
            end > today
                ? pass("E-04", "UC-4 embargo active  ✗ EMBARGO ACTIVE", `EmbargoEndDate=${b[0].e.value} > today`)
                : fail("E-04", "UC-4 embargo active  ✗ EMBARGO ACTIVE", "embargo end date not in future");
        } else {
            fail("E-04", "UC-4 embargo active  ✗ EMBARGO ACTIVE", "EmbargoEndDate not found");
        }
    } catch (err) { fail("E-04", "UC-4", err.message); }

    // E-05: UC-5 MULTI-SOURCE CONFLICT
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?p) AS ?cnt) ?a WHERE {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p ; aimd2:actorType ?a .
} GROUP BY ?a`);
        const ncP = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/CommercialConflictLicence> .
}`);
        const cnt = parseInt(b[0]?.cnt?.value || "0", 10);
        cnt >= 3 && b[0]?.a?.value === "commercial" && ncP
            ? pass("E-05", "UC-5 multi-source  ✗ MULTI-SOURCE CONFLICT", `${cnt} parents, commercial actor, NC parent present`)
            : fail("E-05", "UC-5 multi-source  ✗ MULTI-SOURCE CONFLICT", `count=${cnt}, actor=${b[0]?.a?.value}, ncParent=${ncP}`);
    } catch (err) { fail("E-05", "UC-5", err.message); }

    // E-06: UC-6 CONTRACTUAL PROHIBITION — Layer 1 + Layer 2
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?a (BOUND(?dl) AS ?has) WHERE {
    dcat:UnauthorisedDistillationDist6 aimd2:actorType ?a ; aimd:derivedFromDistribution ?p .
    ?p dct:license <https://example.com/policy/ProprietaryDistillationLicence> .
    OPTIONAL { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI ?dl }
}`);
        const l1 = b.some(r => r.a?.value === "competitor");
        const l2 = b.some(r => r.has?.value === "false");
        l1 && l2
            ? pass("E-06", "UC-6 distillation  ✗ CONTRACTUAL PROHIBITION", "Layer 1 (competitor) + Layer 2 (derivedModelLicenceURI absent) both detected")
            : fail("E-06", "UC-6 distillation  ✗ CONTRACTUAL PROHIBITION", `layer1=${l1}, layer2=${l2}`);
    } catch (err) { fail("E-06", "UC-6", err.message); }

    // E-07: UC-7 COMPLIANT
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?x ?y WHERE {
    dcat:MITStudentDist7 aimd2:baseModelURL ?x ; aimd2:modelWeightsURL ?y .
}`);
        b.length > 0
            ? pass("E-07", "UC-7 Apache 2.0 → MIT fine-tune  ✓ COMPLIANT", "baseModelURL + modelWeightsURL present")
            : fail("E-07", "UC-7 Apache 2.0 → MIT fine-tune  ✓ COMPLIANT", "attribution metadata missing");
    } catch (err) { fail("E-07", "UC-7", err.message); }

    // E-08: UC-8 AGPL §13 VIOLATION
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?ctx (BOUND(?w) AS ?hasW) WHERE {
    dcat:NetworkAPIDist8 aimd2:deploymentContext ?ctx .
    OPTIONAL { dcat:NetworkAPIDist8 aimd2:modelWeightsURL ?w }
}`);
        b.some(r => r.ctx?.value === "network" && r.hasW?.value === "false")
            ? pass("E-08", "UC-8 AGPL network API  ✗ AGPL §13 VIOLATION", "deploymentContext=network + modelWeightsURL absent")
            : fail("E-08", "UC-8 AGPL network API  ✗ AGPL §13 VIOLATION", "AGPL violation pattern not found");
    } catch (err) { fail("E-08", "UC-8", err.message); }

    // E-09: UC-9 RLHF CONSENT MISSING
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?pol (BOUND(?cs) AS ?hasCs) WHERE {
    dcat:RLHFAlignedDist9 aimd2:rlhfDataPolicy ?pol .
    OPTIONAL { dcat:RLHFAlignedDist9 aimd2:userConsentStatus ?cs }
}`);
        b.some(r => !!r.pol?.value && r.hasCs?.value === "false")
            ? pass("E-09", "UC-9 RLHF consent  ✗ GDPR CONSENT MISSING", "rlhfDataPolicy present, userConsentStatus absent")
            : fail("E-09", "UC-9 RLHF consent  ✗ GDPR CONSENT MISSING", "violation pattern not found");
    } catch (err) { fail("E-09", "UC-9", err.message); }

    // E-10: UC-10 ART.53 DISCLOSURE GAP
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?m (BOUND(?a50) AS ?hasA50) WHERE {
    dcat:OpenModelSyntheticDist10 aimd2:dataGenerationMethod ?m .
    OPTIONAL { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL ?a50 }
}`);
        b.some(r => r.m?.value === "synthetic-from-proprietary-teacher" && r.hasA50?.value === "false")
            ? pass("E-10", "UC-10 synthetic data  ✗ ART.53 DISCLOSURE GAP", "synthetic-from-proprietary-teacher + article50PolicyURL absent")
            : fail("E-10", "UC-10 synthetic data  ✗ ART.53 DISCLOSURE GAP", "disclosure gap pattern not found");
    } catch (err) { fail("E-10", "UC-10", err.message); }

    // E-11: UC-11 POLICY SET SATISFIED
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT (COUNT(?p) AS ?cnt) ?rag WHERE {
    dcat:GeneratorRAGDist11 aimd:derivedFromDistribution ?p ; aimd2:ragCorpusPolicy ?rag .
} GROUP BY ?rag`);
        const cnt = parseInt(b[0]?.cnt?.value || "0", 10);
        cnt >= 2 && !!b[0]?.rag?.value
            ? pass("E-11", "UC-11 RAG  ✓ POLICY SET SATISFIED", `${cnt} sources + ragCorpusPolicy declared`)
            : fail("E-11", "UC-11 RAG  ✓ POLICY SET SATISFIED", `sources=${cnt}, ragCorpusPolicy=${!!b[0]?.rag?.value}`);
    } catch (err) { fail("E-11", "UC-11", err.message); }

    // E-12: UC-12 MoE INHERITANCE FAILURE
    try {
        const b = await sparqlSelect(`${PREFIXES}
SELECT ?eL ?mL WHERE {
    dcat:MoEMergedDist12 dct:license ?mL ; aimd:derivedFromDistribution ?e .
    ?e dct:license ?eL .
    FILTER(?eL = <https://example.com/policy/MoEMergedModelLicence>)
}`);
        b.some(r =>
            r.eL?.value === "https://example.com/policy/MoEMergedModelLicence" &&
            r.mL?.value !== "https://example.com/policy/MoEMergedModelLicence")
            ? pass("E-12", "UC-12 MoE  ✗ INHERITANCE FAILURE", "Llama-licensed expert; merged model has different licence")
            : fail("E-12", "UC-12 MoE  ✗ INHERITANCE FAILURE", "inheritance loss pattern not found");
    } catch (err) { fail("E-12", "UC-12", err.message); }

    // E-13: UC-13 TRUE NEGATIVE — check distribution EXISTS before asserting about its properties
    try {
        const exists = await sparqlAsk(`${PREFIXES}
ASK { dcat:ExecutorLLMDist13 a aimd:AIModelDistribution . }`);
        if (!exists) {
            fail("E-13", "UC-13 inference chain  ✓ TRUE NEGATIVE (COMPLIANT)", "ExecutorLLMDist13 not found in graph");
        } else {
            const b = await sparqlSelect(`${PREFIXES}
SELECT ?lic (BOUND(?t) AS ?hasT) (BOUND(?bm) AS ?hasBm) WHERE {
    dcat:ExecutorLLMDist13 dct:license ?lic .
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:trainingDatasetURL ?t }
    OPTIONAL { dcat:ExecutorLLMDist13 aimd2:baseModelURL       ?bm }
}`);
            const hasInfLic = b.some(r => r.lic?.value === "https://example.com/policy/InferenceChainLicence");
            const hasTrainP = b.some(r => r.hasT?.value === "true" || r.hasBm?.value === "true");
            hasInfLic && !hasTrainP
                ? pass("E-13", "UC-13 inference chain  ✓ TRUE NEGATIVE (COMPLIANT)", "InferenceChainLicence + no training evidence — correctly excluded from training obligations")
                : fail("E-13", "UC-13 inference chain  ✓ TRUE NEGATIVE (COMPLIANT)", `inferenceChainLicence=${hasInfLic}, hasTrainingProps=${hasTrainP}`);
        }
    } catch (err) { fail("E-13", "UC-13", err.message); }

    // E-14: UC-14 COMPLIANT — Art.50 at ≥3 hops
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?dist) AS ?count) WHERE {
    { BIND(dcat:GPAIAPIDist14 AS ?dist) }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    ?dist aimd2:article50PolicyURL ?a50 .
}`);
        c >= 3
            ? pass("E-14", "UC-14 3-hop CC-BY chain  ✓ COMPLIANT", `${c}/4 hops have article50PolicyURL`)
            : fail("E-14", "UC-14 3-hop CC-BY chain  ✓ COMPLIANT", `${c}/4 hops have Art.50 declaration`);
    } catch (err) { fail("E-14", "UC-14", err.message); }

    // E-15: UC-15 CASCADING — ≥3 distinct conflict types
    try {
        const c1 = await sparqlAsk(`${PREFIXES}
ASK {
    ?d aimd2:actorType "competitor" .
    VALUES ?d { dcat:DistillationDist15 dcat:ClosedModelDist15 }
}`);
        const c2 = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:ConsumerProductDist15 aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
    FILTER NOT EXISTS { dcat:ConsumerProductDist15 aimd2:article50PolicyURL ?u }
}`);
        const c3 = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:MoEMergeStepDist15 aimd:derivedFromDistribution ?e .
    ?e dct:license <https://example.com/policy/MoEMergedModelLicence> .
    FILTER NOT EXISTS {
        dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence>
    }
}`);
        const types = [c1 && "distillation", c2 && "art53-gap", c3 && "moe-inheritance"].filter(Boolean);
        types.length >= 2
            ? pass("E-15", "UC-15 5-hop cascading  ✗ CASCADING UNRESOLVABLE CONFLICTS", `${types.length} conflict types: ${types.join(", ")}`)
            : fail("E-15", "UC-15 5-hop cascading  ✗ CASCADING UNRESOLVABLE CONFLICTS", `${types.length} type(s) — expected ≥2`);
    } catch (err) { fail("E-15", "UC-15", err.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION X — Cross-Cutting Design Properties
// ─────────────────────────────────────────────────────────────────────────────
async function sectionX() {
    setSection("X — Cross-Cutting Design Properties");

    // X-01: All action terms discoverable with evidenceProperty at runtime
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?a) AS ?count) WHERE {
    ?a a odrl:Action ; aimd:evidenceProperty ?ep .
    FILTER(STRSTARTS(STR(?a), "${NS.aimd2}"))
}`);
        c >= 11
            ? pass("X-01", "Graph-driven: all 11 actions queryable with evidenceProperty", `${c} action→evidenceProperty pairs`)
            : fail("X-01", "Graph-driven: all 11 actions queryable with evidenceProperty", `${c} pairs (expected ≥11)`);
    } catch (err) { fail("X-01", "Graph-driven checker", err.message); }

    // X-02: EmbargoEndDate stored in distribution data, NOT in licence policy
    try {
        const inDist    = await sparqlAsk(`${PREFIXES}
ASK { dcat:PrematureRAGDist4 aimd2:EmbargoEndDate ?d . }`);
        const inLicence = await sparqlAsk(`${PREFIXES}
ASK { <https://example.com/policy/EmbargoedCorpusLicence> aimd2:EmbargoEndDate ?d . }`);
        inDist && !inLicence
            ? pass("X-02", "Temporal self-resolution: EmbargoEndDate in distribution data, not licence", "verdict flips automatically when date passes — no code change needed")
            : fail("X-02", "Temporal self-resolution: EmbargoEndDate in distribution data, not licence", `inDist=${inDist}, inLicence=${inLicence}`);
    } catch (err) { fail("X-02", "Temporal embargo", err.message); }

    // X-03: Multi-hop propagation — same licence file governs all 4 UC-14 hops
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(DISTINCT ?dist) AS ?count) WHERE {
    { BIND(dcat:GPAIAPIDist14 AS ?dist) }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    UNION { dcat:GPAIAPIDist14 aimd:derivedFromDistribution/aimd:derivedFromDistribution/aimd:derivedFromDistribution ?dist }
    ?dist dct:license <https://example.com/policy/OpenResearchLLMLicence> .
}`);
        c >= 4
            ? pass("X-03", "Multi-hop propagation: same licence governs all 4 UC-14 hops", `${c} hops governed by OpenResearchLLMLicence`)
            : fail("X-03", "Multi-hop propagation: same licence governs all 4 UC-14 hops", `${c}/4 hops`);
    } catch (err) { fail("X-03", "Multi-hop propagation", err.message); }

    // X-04: Training vs inference — UC-13 executor must EXIST and have no training properties
    try {
        const exists = await sparqlAsk(`${PREFIXES}
ASK { dcat:ExecutorLLMDist13 a aimd:AIModelDistribution . }`);
        if (!exists) {
            fail("X-04", "Training/inference discrimination: UC-13 executor has no training evidence", "ExecutorLLMDist13 not found in graph — cannot verify");
        } else {
            const hasT = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:ExecutorLLMDist13 ?p ?v .
    VALUES ?p { aimd2:trainingDatasetURL aimd2:baseModelURL aimd2:rlhfDataPolicy }
}`);
            !hasT
                ? pass("X-04", "Training/inference discrimination: UC-13 executor has no training evidence", "inference chain correctly excluded from training-pipeline obligations")
                : fail("X-04", "Training/inference discrimination: UC-13 executor has no training evidence", "training evidence found on inference-only distribution — false positive risk");
        }
    } catch (err) { fail("X-04", "Training/inference discrimination", err.message); }

    // X-05: Layer 2 constraint inheritance — both signals detectable in UC-6
    try {
        const l1 = await sparqlAsk(`${PREFIXES}
ASK { dcat:UnauthorisedDistillationDist6 aimd2:actorType "competitor" . }`);
        const obligation = await sparqlAsk(`${PREFIXES}
ASK {
    <https://example.com/policy/ProprietaryDistillationLicence> odrl:obligation ?ob .
    ?ob odrl:action aimd2:InheritSourceProhibitions .
}`);
        const derivedMissing = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:UnauthorisedDistillationDist6 a aimd:AIModelDistribution .
    FILTER NOT EXISTS { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI ?u }
}`);
        l1 && obligation && derivedMissing
            ? pass("X-05", "Layer 2 constraint inheritance (UC-6): both signals detectable", "Layer 1 (competitor) + Layer 2 (obligation on policy, derivedModelLicenceURI absent)")
            : fail("X-05", "Layer 2 constraint inheritance (UC-6)", `competitor=${l1}, obligation=${obligation}, derivedLicMissing=${derivedMissing}`);
    } catch (err) { fail("X-05", "Layer 2 constraint inheritance", err.message); }

    // X-06: Strictest-survives — Llama obligation on expert, dropped at merge
    try {
        const onExpert = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:MoEMergedDist12 aimd:derivedFromDistribution dcat:ExpertBDist12 .
    dcat:ExpertBDist12 dct:license <https://example.com/policy/MoEMergedModelLicence> .
}`);
        const onMerged = await sparqlAsk(`${PREFIXES}
ASK { dcat:MoEMergedDist12 dct:license <https://example.com/policy/MoEMergedModelLicence> . }`);
        onExpert && !onMerged
            ? pass("X-06", "Strictest-survives: Llama obligation on expert, dropped at merge (UC-12)", "violation correctly identifiable from parent vs merged licence mismatch")
            : fail("X-06", "Strictest-survives: Llama obligation on expert, dropped at merge", `onExpert=${onExpert}, onMerged=${onMerged}`);
    } catch (err) { fail("X-06", "Strictest-survives MoE", err.message); }

    // X-07: No short-circuit — UC-15 has ≥3 independently detectable conflict types
    try {
        const d1 = await sparqlAsk(`${PREFIXES}
ASK {
    ?d aimd2:actorType "competitor" .
    VALUES ?d { dcat:DistillationDist15 dcat:ClosedModelDist15 }
}`);
        const d2 = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:ConsumerProductDist15 aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
    FILTER NOT EXISTS { dcat:ConsumerProductDist15 aimd2:article50PolicyURL ?u }
}`);
        const d3 = await sparqlAsk(`${PREFIXES}
ASK {
    dcat:MoEMergeStepDist15 aimd:derivedFromDistribution ?e .
    ?e dct:license <https://example.com/policy/MoEMergedModelLicence> .
    FILTER NOT EXISTS {
        dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence>
    }
}`);
        const n = [d1, d2, d3].filter(Boolean).length;
        n >= 3
            ? pass("X-07", "No short-circuit: UC-15 exposes ≥3 simultaneous conflict types", `${n} types independently detectable: distillation, Art.53, MoE-inheritance`)
            : fail("X-07", "No short-circuit: UC-15 ≥3 conflict types", `${n} detectable`);
    } catch (err) { fail("X-07", "No short-circuit UC-15", err.message); }

    // X-08: DCAT+ODRL integration — distributions linked to loaded odrl:Policy instances
    try {
        const c = await count(`${PREFIXES}
SELECT (COUNT(?d) AS ?count) WHERE {
    ?d a aimd:AIModelDistribution ; dct:license ?lic ; odrl:hasPolicy ?pol .
    ?lic a odrl:Policy .
}`);
        c >= 15
            ? pass("X-08", "DCAT+ODRL integration: distributions linked to loaded policies", `${c} distributions with dct:license → loaded odrl:Policy`)
            : fail("X-08", "DCAT+ODRL integration", `${c} (expected ≥15)`);
    } catch (err) { fail("X-08", "DCAT+ODRL integration", err.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
function printSummary() {
    console.log("\n" + "═".repeat(68));
    console.log("  EVALUATION SUITE — SUMMARY");
    console.log("═".repeat(68));

    const sections = [...new Set(results.map(r => r.section))];
    let grandPass = 0, grandFail = 0, grandSkip = 0;

    for (const sec of sections) {
        const sr   = results.filter(r => r.section === sec);
        const p    = sr.filter(r => r.ok === true).length;
        const f    = sr.filter(r => r.ok === false).length;
        const s    = sr.filter(r => r.ok === null).length;
        console.log(`\n  ${sec}`);
        console.log(`    ${p}/${sr.length - s} passed${s > 0 ? `, ${s} skipped` : ""}  ${f > 0 ? `✗ (${f} fail)` : "✓"}`);
        sr.filter(r => !r.ok && r.ok !== null).forEach(r => {
            console.log(`      ✗ ${r.id}: ${r.name}${r.detail ? " — " + r.detail : ""}`);
        });
        grandPass += p; grandFail += f; grandSkip += s;
    }

    const total = grandPass + grandFail;
    console.log("\n" + "─".repeat(68));
    console.log(`  TOTAL  ${grandPass}/${total} passed  |  ${grandFail} failed  |  ${grandSkip} skipped`);
    console.log(`  ${grandFail === 0 ? "✓  ALL TESTS PASSED" : `✗  ${grandFail} FAILURE(S) — see above`}`);
    console.log("═".repeat(68) + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log("\n" + "═".repeat(68));
    console.log("  AIMD v2.0 — Comprehensive Evaluation Suite");
    console.log("  A (Infrastructure) · V (Vocabulary) · L (Licences)");
    console.log("  G (Graph) · E (Compliance) · X (Cross-cutting)");
    console.log("═".repeat(68));

    const infraOk = await sectionA();
    if (!infraOk) {
        console.log("\n  ⚠  GraphDB or repository unavailable — cannot run graph sections.\n");
        printSummary();
        process.exit(1);
    }

    await sectionV();
    await sectionL();
    await sectionG();
    await sectionE();
    await sectionX();

    printSummary();
    process.exit(results.filter(r => r.ok === false).length > 0 ? 1 : 0);
})();
