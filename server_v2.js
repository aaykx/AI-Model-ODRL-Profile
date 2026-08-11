/**
 * server_v2.js — AIMD Extended v2.0
 *
 * Original prototype: Cian Twomey, 2024
 * Extended (v3.0):   Diya Mathew, 2026
 * Extended (v2.0):   MAI Dissertation, 2026
 *
 * v2.0 additions (over Diya's server.js):
 *
 *  1. checkLicenceCompatibility(sourceURI, distributionURI)
 *     Calls DALICC's /compatibility endpoint; falls back to URI matching
 *     if DALICC is unavailable.
 *
 *  2. checkNHopChain(startDistributionURI, maxHops)
 *     Generalises Diya's provenance verifier to an explicit N-hop loop,
 *     returning per-hop compliance results.
 *
 *  3. checkNewV2Obligations(distributionURI)
 *     Graph-driven checker for the 11 new aimd2: obligation terms defined
 *     in AIMD_extended_v2.ttl. Follows the same SPARQL-load pattern as
 *     Diya's verifyCompliance().
 *
 *  4. Phase 2 (compliance) extended: checkNewV2Obligations called after
 *     each verifyCompliance() run.
 *
 *  5. Phase 3 (provenance) extended: verifyProvenanceChain replaced with
 *     checkNHopChain — same data, generalised traversal.
 *
 *  6. Phase 5 (new): DALICC licence compatibility check across pairs found
 *     in the knowledge graph.
 *
 * All of Diya's original phases (1-4 / steps 2-12) are preserved unchanged.
 */

const axios = require("axios");

// ─────────────────────────────────────────────
// GraphDB config
// ─────────────────────────────────────────────
const graphdbBaseUrl       = "http://localhost:7200";
const repositoryId         = "AIModels";
const sparqlUpdateEndpoint = `${graphdbBaseUrl}/repositories/${repositoryId}/statements`;
const sparqlQueryEndpoint  = `${graphdbBaseUrl}/repositories/${repositoryId}`;

const AIMD_BASE  = "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#";
const AIMD2_BASE = "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#";
const DCAT_BASE  = "https://www.w3.org/ns/dcat#";
// Corrected 2026-08-06: the upstream DALICC docker-compose.yml exposes the
// API on 8002 (mapped from container port 80), not 8090. The 8090 value
// (and the /compatibility, {firstLicenseURI,secondLicenseURI} shape below)
// were never validated against a running DALICC instance before this
// session's evaluation run -- see Chapter 7's discussion of this discovery.
const DALICC_URL = "http://localhost:8002"; // start with: docker-compose up -d (see dev-notes/README_DALICC.md)

const PREFIXES = `
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

// ─────────────────────────────────────────────
// SPARQL helpers  (unchanged from Diya's v3.0)
// ─────────────────────────────────────────────
function logAxiosError(prefix, error) {
    if (error.response) {
        console.error(`${prefix}: HTTP ${error.response.status}`);
        console.error(String(error.response.data).slice(0, 500));
    } else if (error.request) {
        console.error(`${prefix}: no response from server`);
    } else {
        console.error(`${prefix}: ${error.message}`);
    }
}

async function sparqlUpdate(query) {
    try {
        const response = await axios.post(
            sparqlUpdateEndpoint,
            `update=${encodeURIComponent(query)}`,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        return response.status;
    } catch (error) {
        logAxiosError("SPARQL Update Error", error);
        return null;
    }
}

async function sparqlSelect(query) {
    try {
        const response = await axios.post(
            sparqlQueryEndpoint,
            `query=${encodeURIComponent(query)}`,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/sparql-results+json",
                },
            }
        );
        return response.data.results.bindings;
    } catch (error) {
        logAxiosError("SPARQL Select Error", error);
        return [];
    }
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

/**
 * Extracts the local name from a full URI or prefixed name.
 * e.g. "https://www.w3.org/ns/dcat#IrishLegalLLMDist1.5" → "IrishLegalLLMDist1.5"
 * @param {string} uri
 * @returns {string}
 */
function extractLocalID(uri) {
    if (uri.includes("#")) return uri.split("#").pop();
    if (uri.includes("/")) return uri.split("/").pop();
    if (uri.includes(":")) return uri.split(":").pop();
    return uri;
}

// ─────────────────────────────────────────────
// INSERT: Catalogue  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertCatalogue(catalogID, description, publisher) {
    const q = `${PREFIXES}
INSERT DATA {
  dcat:${catalogID} a dcat:Catalog ;
      dct:description "${description}" ;
      dct:publisher "${publisher}" .
}`;
    const s = await sparqlUpdate(q);
    console.log(`Catalogue ${catalogID}: ${s}`);
}

// ─────────────────────────────────────────────
// INSERT: ResearchProduct  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertResearchProduct({ id, title, creator, issued, description, doi, repoURL, licenceURI, keyword }) {
    const doiTriple = doi ? `dct:identifier "${doi}" ;` : "";
    const q = `${PREFIXES}
INSERT DATA {
  dcat:${id} a dcat:Dataset, aimd:ResearchProduct ;
      dct:title "${title}" ;
      dct:creator "${creator}" ;
      dct:issued "${issued}"^^xsd:date ;
      dct:description "${description}" ;
      dcat:keyword "${keyword}" ;
      dcat:accessURL <${repoURL}> ;
      ${doiTriple}
      dct:license <${licenceURI}> .
}`;
    const s = await sparqlUpdate(q);
    console.log(`ResearchProduct ${id}: ${s}`);
}

// ─────────────────────────────────────────────
// INSERT: AI Model Resource  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertAIModelResource({
    resID, creator, title, date, desc, domain, purpose, capability, user, subject,
    modelCardURL, datasetCardURL, biasReportURL,
    trainingDataSummaryURL, riskAssessmentURL,
}) {
    const P = "https://example.com/placeholder/";
    const q = `${PREFIXES}
INSERT DATA {
  dcat:${resID} a dcat:Resource ;
      dct:title "${title}" ;
      dct:creator "${creator}" ;
      dct:issued "${date}"^^xsd:date ;
      dct:description "${desc}" ;
      airo:isAppliedWithinDomain "${domain}" ;
      airo:hasPurpose "${purpose}" ;
      airo:hasCapability "${capability}" ;
      airo:isUsedBy "${user}" ;
      airo:hasAISubject "${subject}" ;
      aimd:modelCardURL <${modelCardURL || P + "model-card"}> ;
      aimd:datasetCardURL <${datasetCardURL || P + "dataset-card"}> ;
      aimd:biasReportURL <${biasReportURL || P + "bias-report"}> ;
      aimd:trainingDataSummaryURL <${trainingDataSummaryURL || P + "training-data"}> ;
      aimd:riskAssessmentURL <${riskAssessmentURL || P + "risk-assessment"}> .
}`;
    const s = await sparqlUpdate(q);
    console.log(`AIModel ${resID}: ${s}`);
}

// ─────────────────────────────────────────────
// INSERT: CO2Disclosure node  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertCO2Disclosure(disclosureID, {
    kgCO2eq, energyKWhTotal, trainingHardware, trainingDurationHours,
    cloudRegion, gridCarbonIntensity, emissionsScope, reportingStandard, co2MeasurementURL,
}) {
    const P = "https://example.com/placeholder/";
    const q = `${PREFIXES}
INSERT DATA {
  aimd:${disclosureID} a aimd:CO2Disclosure ;
      aimd:kgCO2eq "${kgCO2eq || 0}"^^xsd:decimal ;
      aimd:energyKWhTotal "${energyKWhTotal || 0}"^^xsd:decimal ;
      aimd:trainingHardware "${trainingHardware || "unknown"}" ;
      aimd:trainingDurationHours "${trainingDurationHours || 0}"^^xsd:decimal ;
      aimd:cloudRegion "${cloudRegion || "unknown"}" ;
      aimd:gridCarbonIntensity "${gridCarbonIntensity || 0}"^^xsd:decimal ;
      aimd:emissionsScope "${emissionsScope || "training"}" ;
      aimd:reportingStandard "${reportingStandard || "unknown"}" ;
      aimd:co2MeasurementURL <${co2MeasurementURL || P + "co2-report"}> .
}`;
    const s = await sparqlUpdate(q);
    console.log(`CO2Disclosure ${disclosureID}: ${s}`);
}

// ─────────────────────────────────────────────
// INSERT: CopyrightPolicy node  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertCopyrightPolicy(policyNodeID, {
    optOutMechanism, rightsHolderRegistry, tdmWaiver,
    openAccessSourcesOnly, ccSignalsCompliant, copyrightPolicyDocURL,
}) {
    const P = "https://example.com/placeholder/";
    const q = `${PREFIXES}
INSERT DATA {
  aimd:${policyNodeID} a aimd:CopyrightPolicy ;
      aimd:optOutMechanism "${optOutMechanism || "none declared"}" ;
      aimd:rightsHolderRegistry <${rightsHolderRegistry || P + "rights-registry"}> ;
      aimd:tdmWaiver "${tdmWaiver || "none declared"}" ;
      aimd:openAccessSourcesOnly "${openAccessSourcesOnly === true}"^^xsd:boolean ;
      aimd:ccSignalsCompliant "${ccSignalsCompliant === true}"^^xsd:boolean ;
      aimd:copyrightPolicyDocURL <${copyrightPolicyDocURL || P + "copyright-policy"}> .
}`;
    const s = await sparqlUpdate(q);
    console.log(`CopyrightPolicy ${policyNodeID}: ${s}`);
}

// ─────────────────────────────────────────────
// INSERT: Distribution  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertDistribution(distID, accessURL, date, {
    sourceResearchProductID = null,
    parentDistributionID = null,
    co2DisclosureID = null,
    copyrightPolicyNodeID = null,
} = {}) {
    const rpTriple   = sourceResearchProductID ? `aimd:derivedFromResearchProduct dcat:${sourceResearchProductID} ;` : "";
    const distTriple = parentDistributionID    ? `aimd:derivedFromDistribution dcat:${parentDistributionID} ;`       : "";
    const co2Triple  = co2DisclosureID         ? `aimd:co2Disclosure aimd:${co2DisclosureID} ;`                      : "";
    const cpTriple   = copyrightPolicyNodeID   ? `aimd:copyrightPolicy aimd:${copyrightPolicyNodeID} ;`              : "";
    const q = `${PREFIXES}
INSERT DATA {
  dcat:${distID} a dcat:Distribution, aimd:AIModelDistribution ;
      dcat:accessURL <${accessURL}> ;
      dct:issued "${date}"^^xsd:date ;
      ${rpTriple}
      ${distTriple}
      ${co2Triple}
      ${cpTriple}
      dct:format "application/x-hdf5" .
}`;
    const s = await sparqlUpdate(q);
    console.log(`Distribution ${distID}: ${s}`);
}

// ─────────────────────────────────────────────
// Relationship / Policy / Usage helpers  (Diya v3.0 — unchanged)
// ─────────────────────────────────────────────
async function insertRelationship(from, to) {
    const q = `${PREFIXES}
INSERT DATA { dcat:${from} dcat:dataset dcat:${to} . }`;
    const s = await sparqlUpdate(q);
    console.log(`Rel ${from} -> ${to}: ${s}`);
}

async function linkResearchProductToCatalogue(catalogID, rpID) {
    const q = `${PREFIXES}
INSERT DATA { dcat:${catalogID} dcat:dataset dcat:${rpID} . }`;
    const s = await sparqlUpdate(q);
    console.log(`Cat ${catalogID} -> RP ${rpID}: ${s}`);
}

async function linkDistributionToResearchProduct(distID, rpID) {
    const q = `${PREFIXES}
INSERT DATA { dcat:${distID} aimd:derivedFromResearchProduct dcat:${rpID} . }`;
    const s = await sparqlUpdate(q);
    console.log(`Dist ${distID} -> RP ${rpID}: ${s}`);
}

async function insertPolicy(policyID, accessURL) {
    const q = `${PREFIXES}
INSERT DATA {
  odrl:${policyID} a odrl:Policy ;
      dcat:accessURL <${accessURL}> ;
      dct:title "${policyID}" .
}`;
    const s = await sparqlUpdate(q);
    console.log(`Policy ${policyID}: ${s}`);
}

async function assignPolicy(distID, policyID) {
    const q = `${PREFIXES}
INSERT DATA {
  dcat:${distID} odrl:hasPolicy odrl:${policyID} ;
                 dct:license odrl:${policyID} .
}`;
    const s = await sparqlUpdate(q);
    console.log(`Assign policy ${policyID} -> ${distID}: ${s}`);
}

async function insertUsage(usageID, organisation, date, accessURL) {
    const q = `${PREFIXES}
INSERT DATA {
  duv:${usageID} a duv:Usage ;
      foaf:organization "${organisation}" ;
      dct:issued "${date}"^^xsd:date ;
      dcat:accessURL <${accessURL}> .
}`;
    const s = await sparqlUpdate(q);
    console.log(`Usage ${usageID}: ${s}`);
}

async function assignUsage(distID, usageID) {
    const q = `${PREFIXES}
INSERT DATA { dcat:${distID} duv:hasUsage duv:${usageID} . }`;
    await sparqlUpdate(q);
}

async function insertUsageHasResource(usageID, resourceID) {
    const q = `${PREFIXES}
INSERT DATA { duv:${usageID} dcat:dataset dcat:${resourceID} . }`;
    await sparqlUpdate(q);
}

async function searchDistributionByPolicy(policyURI) {
    const q = `${PREFIXES}
SELECT ?Distribution WHERE {
    ?Distribution a dcat:Distribution ;
                  odrl:hasPolicy <${policyURI}> .
}`;
    const results = await sparqlSelect(q);
    return results.map((r) => r.Distribution.value);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE VERIFICATION  v3.0 — GRAPH-DRIVEN  (Diya's original — unchanged)
// ═══════════════════════════════════════════════════════════════════════════════
async function verifyCompliance(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  Compliance check: dcat:${distributionID}`);
    console.log(HR);

    const obligationQuery = `${PREFIXES}
SELECT ?action ?label ?evidenceProp ?severity ?checkDesc ?legalBasis
WHERE {
    ?action a odrl:Action ;
            aimd:evidenceProperty ?evidenceProp .
    OPTIONAL { ?action rdfs:label ?label }
    OPTIONAL { ?action aimd:severity ?severity }
    OPTIONAL { ?action aimd:checkDescription ?checkDesc }
    OPTIONAL { ?action aimd:legalBasis ?legalBasis }
}`;
    const obligationBindings = await sparqlSelect(obligationQuery);

    if (obligationBindings.length === 0) {
        console.log("  ⚠️  No graph-defined obligations found.");
        console.log("     Make sure AIMD_extended.ttl has been imported into GraphDB.");
        console.log(`${HR}\n`);
        return { distributionID, allCompliant: false, results: [] };
    }

    const seen = new Set();
    const obligations = [];
    for (const b of obligationBindings) {
        const ep = b.evidenceProp.value;
        if (!seen.has(ep)) {
            seen.add(ep);
            obligations.push({
                actionURI:    b.action.value,
                label:        b.label?.value      || b.action.value.split("#").pop(),
                evidenceProp: ep,
                severity:     b.severity?.value   || "mandatory",
                checkDesc:    b.checkDesc?.value   || "",
                legalBasis:   b.legalBasis?.value  || "",
            });
        }
    }

    const metaQuery = `${PREFIXES}
SELECT ?prop ?val
WHERE { dcat:${distributionID} ?prop ?val . }`;
    const metaBindings = await sparqlSelect(metaQuery);

    const declared = {};
    for (const b of metaBindings) {
        declared[b.prop.value] = b.val.value;
    }

    const co2Query = `${PREFIXES}
SELECT ?subProp ?subVal
WHERE {
  dcat:${distributionID} aimd:co2Disclosure ?disc .
  ?disc ?subProp ?subVal .
}`;
    const co2Bindings = await sparqlSelect(co2Query);
    const co2Data = {};
    for (const b of co2Bindings) {
        co2Data[b.subProp.value] = b.subVal.value;
    }

    const cpQuery = `${PREFIXES}
SELECT ?subProp ?subVal
WHERE {
  dcat:${distributionID} aimd:copyrightPolicy ?cp .
  ?cp ?subProp ?subVal .
}`;
    const cpBindings = await sparqlSelect(cpQuery);
    const cpData = {};
    for (const b of cpBindings) {
        cpData[b.subProp.value] = b.subVal.value;
    }

    const PLACEHOLDER = "https://example.com/placeholder/";
    const results = [];
    let mandatoryFails = 0;
    let recommendedFails = 0;

    for (const ob of obligations) {
        const value = declared[ob.evidenceProp];
        const present = value !== undefined && !value.startsWith(PLACEHOLDER);
        if (!present && ob.severity === "mandatory") mandatoryFails++;
        if (!present && ob.severity === "recommended") recommendedFails++;

        const icon = present
            ? "✅ COMPLIANT  "
            : ob.severity === "mandatory" ? "❌ MISSING    " : "⚠️  RECOMMENDED";

        results.push({ ...ob, present, value: value || "(not declared)", icon });
    }

    const co2SubChecks = checkCO2SubAttributes(co2Data, PLACEHOLDER);
    const cpSubChecks  = checkCopyrightSubAttributes(cpData, PLACEHOLDER);

    const overall = mandatoryFails === 0 ? "✅ FULLY COMPLIANT" : "❌ NON-COMPLIANT";
    console.log(`\n  Overall: ${overall}  (${mandatoryFails} mandatory failures, ${recommendedFails} recommended gaps)\n`);

    for (const r of results) {
        console.log(`  ${r.icon}  ${r.label}`);
        if (r.checkDesc) console.log(`               ${r.checkDesc}`);
        if (r.legalBasis) console.log(`               Legal basis: ${r.legalBasis}`);
        if (!r.present)   console.log(`               → Value: ${r.value}`);
        console.log();
    }

    if (co2Bindings.length > 0) {
        console.log("  ── CO2 / Energy Disclosure — sub-attributes ──────────────────");
        for (const c of co2SubChecks) {
            console.log(`  ${c.icon}  ${c.label}`);
            if (!c.present) console.log(`               → ${c.value}`);
        }
        console.log();
    } else {
        console.log("  ❌ CO2 Disclosure object missing — no sub-attributes to check.\n");
    }

    if (cpBindings.length > 0) {
        console.log("  ── Copyright / IP Policy — sub-attributes ────────────────────");
        for (const c of cpSubChecks) {
            console.log(`  ${c.icon}  ${c.label}`);
            if (!c.present) console.log(`               → ${c.value}`);
        }
        console.log();
    } else {
        console.log("  ❌ Copyright Policy object missing — no sub-attributes to check.\n");
    }

    await crossRepoLicenceCheck(distributionID);

    console.log(`${HR}\n`);
    return { distributionID, allCompliant: mandatoryFails === 0, results };
}

// ── CO2 sub-attribute checker  (Diya v3.0 — unchanged) ───────────────────────
function checkCO2SubAttributes(co2Data, PLACEHOLDER) {
    const fields = [
        { key: `${AIMD_BASE}kgCO2eq`,             label: "kg CO2 equivalent declared",          severity: "mandatory"  },
        { key: `${AIMD_BASE}energyKWhTotal`,       label: "Total energy (kWh) declared",         severity: "mandatory"  },
        { key: `${AIMD_BASE}trainingHardware`,     label: "Training hardware specified",         severity: "mandatory"  },
        { key: `${AIMD_BASE}trainingDurationHours`,label: "Training duration (hours) declared",  severity: "recommended"},
        { key: `${AIMD_BASE}cloudRegion`,          label: "Cloud region / data centre declared", severity: "recommended"},
        { key: `${AIMD_BASE}gridCarbonIntensity`,  label: "Grid carbon intensity declared",      severity: "recommended"},
        { key: `${AIMD_BASE}emissionsScope`,       label: "Emissions scope declared",            severity: "mandatory"  },
        { key: `${AIMD_BASE}reportingStandard`,    label: "Reporting standard declared (e.g. CodeCarbon)", severity: "mandatory"},
        { key: `${AIMD_BASE}co2MeasurementURL`,    label: "CO2 measurement report URL present",  severity: "recommended"},
    ];
    return fields.map(f => {
        const val = co2Data[f.key];
        const unknown = !val || val === "unknown" || val === "0" || (val && val.startsWith(PLACEHOLDER));
        const present = val !== undefined && !unknown;
        const icon = present ? "✅" : f.severity === "mandatory" ? "❌" : "⚠️ ";
        return { label: f.label, present, value: val || "(not declared)", icon, severity: f.severity };
    });
}

// ── Copyright sub-attribute checker  (Diya v3.0 — unchanged) ─────────────────
function checkCopyrightSubAttributes(cpData, PLACEHOLDER) {
    const fields = [
        { key: `${AIMD_BASE}optOutMechanism`,      label: "Opt-out mechanism declared (robots.txt / Spawning / HIBT)", severity: "mandatory"  },
        { key: `${AIMD_BASE}rightsHolderRegistry`, label: "Rights-holder registry URL present",                        severity: "mandatory"  },
        { key: `${AIMD_BASE}tdmWaiver`,            label: "TDM waiver / licence declared",                             severity: "mandatory"  },
        { key: `${AIMD_BASE}openAccessSourcesOnly`,label: "Open-access-sources-only flag declared",                    severity: "recommended"},
        { key: `${AIMD_BASE}ccSignalsCompliant`,   label: "CC Signals compliance declared",                            severity: "recommended"},
        { key: `${AIMD_BASE}copyrightPolicyDocURL`,label: "Copyright policy document URL present",                     severity: "mandatory"  },
    ];
    return fields.map(f => {
        const val = cpData[f.key];
        const notDeclared = !val || val === "none declared" || (val && val.startsWith(PLACEHOLDER));
        const present = val !== undefined && !notDeclared;
        const icon = present ? "✅" : f.severity === "mandatory" ? "❌" : "⚠️ ";
        return { label: f.label, present, value: val || "(not declared)", icon, severity: f.severity };
    });
}

// ── Cross-repository licence check  (Diya v3.0 — unchanged) ──────────────────
async function crossRepoLicenceCheck(distributionID) {
    const q = `${PREFIXES}
SELECT ?sourcePolicy ?distPolicy ?rpTitle
WHERE {
  dcat:${distributionID} aimd:derivedFromResearchProduct ?sourceRP .
  ?sourceRP dct:license ?sourcePolicy .
  OPTIONAL { ?sourceRP dct:title ?rpTitle }
  OPTIONAL { dcat:${distributionID} dct:license ?distPolicy . }
}`;
    const bindings = await sparqlSelect(q);
    console.log("  ── Cross-repository licence check ────────────────────────────");
    if (bindings.length > 0) {
        const sp  = bindings[0]?.sourcePolicy?.value || "(not found)";
        const dp  = bindings[0]?.distPolicy?.value   || "(not declared)";
        const rpt = bindings[0]?.rpTitle?.value       || "unknown";
        console.log(`  Source research product   : ${rpt}`);
        console.log(`  Source licence policy     : ${sp}`);
        console.log(`  Distribution licence      : ${dp}`);
        const ok = sp !== "(not found)" && dp !== "(not declared)";
        console.log(`  Licence chain verifiable  : ${ok ? "✅ YES" : "⚠️  MISSING — one or both sides undeclared"}`);
    } else {
        console.log("  ⚠️  No source ResearchProduct link found — cross-repo check skipped.");
    }
    console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-HOP PROVENANCE CHAIN VERIFICATION  (Diya v3.0 — preserved for reference)
// This function is kept but the main() now calls checkNHopChain() instead.
// ═══════════════════════════════════════════════════════════════════════════════
async function verifyProvenanceChain(startDistributionID) {
    const HR = "═".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  Multi-hop Provenance Chain: dcat:${startDistributionID}`);
    console.log(HR);

    const rpQuery = `${PREFIXES}
SELECT DISTINCT ?rp ?rpTitle ?rpLicence
WHERE {
  dcat:${startDistributionID} (aimd:derivedFromDistribution)* / aimd:derivedFromResearchProduct ?rp .
  OPTIONAL { ?rp dct:title ?rpTitle }
  OPTIONAL { ?rp dct:license ?rpLicence }
}`;
    const rpBindings = await sparqlSelect(rpQuery);

    const chainQuery = `${PREFIXES}
SELECT DISTINCT ?dist ?distTitle ?distLicence
WHERE {
  dcat:${startDistributionID} (aimd:derivedFromDistribution)+ ?dist .
  OPTIONAL { ?dist dct:title ?distTitle }
  OPTIONAL { ?dist dct:license ?distLicence }
}`;
    const chainBindings = await sparqlSelect(chainQuery);

    console.log(`\n  Provenance chain for dcat:${startDistributionID}:\n`);

    if (rpBindings.length === 0 && chainBindings.length === 0) {
        console.log("  (No upstream provenance found — this is a root model with no declared derivation.)");
    }

    for (const b of rpBindings) {
        const title   = b.rpTitle?.value   || b.rp.value;
        const licence = b.rpLicence?.value || "(no licence)";
        console.log(`  📄 ResearchProduct: ${title}`);
        console.log(`     URI     : ${b.rp.value}`);
        console.log(`     Licence : ${licence}`);
        console.log();
    }

    for (const b of chainBindings) {
        const title   = b.distTitle?.value   || b.dist.value;
        const licence = b.distLicence?.value || "(no licence)";
        console.log(`  🤖 Upstream Distribution: ${title}`);
        console.log(`     URI     : ${b.dist.value}`);
        console.log(`     Licence : ${licence}`);
        console.log();
    }

    const allDists = [
        startDistributionID,
        ...chainBindings.map(b => {
            const uri = b.dist.value;
            return uri.split(":").pop().split("/").pop().split("#").pop();
        }),
    ];

    const chainResults = [];
    for (const distID of allDists) {
        console.log(`\n  Checking compliance at hop: ${distID}`);
        const result = await verifyCompliance(distID);
        chainResults.push(result);
    }

    console.log(`\n${HR}`);
    console.log("  Chain Compliance Summary");
    console.log(HR);
    for (const r of chainResults) {
        const icon = r.allCompliant ? "✅" : "❌";
        console.log(`  ${icon}  ${r.distributionID}`);
    }
    const allChainCompliant = chainResults.every(r => r.allCompliant);
    console.log(`\n  Chain overall: ${allChainCompliant ? "✅ FULLY COMPLIANT" : "❌ NON-COMPLIANT at one or more hops"}`);
    console.log(`${HR}\n`);

    return chainResults;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 EXTENSION 1: checkLicenceCompatibility
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calls DALICC's /compatibility endpoint to check semantic licence compatibility.
 * Falls back to URI matching (Diya's approach) if DALICC is unavailable.
 *
 * @param {string} sourceURI - URI of the source dataset's ODRL policy
 * @param {string} distributionURI - URI of the downstream distribution's ODRL policy
 * @returns {Promise<{compatible: boolean, conflicts: string[], resolutionHints: string[], method: string}>}
 */
async function checkLicenceCompatibility(sourceURI, distributionURI) {
    try {
        // Corrected 2026-08-06: real DALICC exposes POST /compatibilitycheck/
        // taking {"licenses": [uri, uri, ...]} and returning
        // {"conflicting_statements": {"direct": {...}, "derived": {...}}},
        // not the {firstLicenseURI, secondLicenseURI} / {compatible, conflicts}
        // shape this previously assumed.
        const response = await axios.post(
            `${DALICC_URL}/compatibilitycheck/`,
            { licenses: [sourceURI, distributionURI] },
            {
                timeout: 5000,
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
            }
        );
        const data = response.data;
        const direct = (data.conflicting_statements && data.conflicting_statements.direct) || {};
        const derived = (data.conflicting_statements && data.conflicting_statements.derived) || {};
        const conflicts = [...Object.values(direct), ...Object.values(derived)];
        const compatible = conflicts.length === 0;
        console.log(`  ℹ DALICC method used for compatibility check`);
        return {
            compatible,
            conflicts: conflicts.map((c) => c.reason || JSON.stringify(c)),
            resolutionHints: [],
            method: "dalicc",
        };
    } catch (error) {
        // Fall back to URI matching when DALICC is unavailable
        const isConnectionError = error.code === "ECONNREFUSED" || error.code === "ECONNRESET"
            || error.code === "ETIMEDOUT" || (error.response && error.response.status >= 500);
        if (isConnectionError || !error.response) {
            console.log("  ℹ DALICC unavailable — falling back to URI matching");
            const compatible = sourceURI === distributionURI;
            return {
                compatible,
                conflicts: compatible ? [] : [`URI mismatch: source="${sourceURI}" vs distribution="${distributionURI}"`],
                resolutionHints: compatible ? [] : ["Ensure downstream licence URI matches or is a compatible extension of the source licence"],
                method: "uri-match",
            };
        }
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 EXTENSION 2: checkNHopChain
// Generalises Diya's verifyProvenanceChain to an explicit N-hop loop.
// Instead of using SPARQL transitive paths that return all ancestors at once,
// this iterates hop-by-hop so maxHops can be enforced and per-hop results
// are structured for programmatic consumption.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generalises Diya's hardcoded 2-hop verifier to N hops.
 * Recursively follows aimd:derivedFromDistribution links and runs a
 * compliance check at each hop.
 *
 * @param {string} startDistributionURI - Full URI of the distribution to start from
 * @param {number} maxHops - Maximum chain depth to traverse (default: 5)
 * @returns {Promise<{chain: Array<{uri: string, hopNumber: number, compliant: boolean, failures: string[]}>, overallCompliant: boolean}>}
 */
async function checkNHopChain(startDistributionURI, maxHops = 5) {
    const HR = "═".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  N-Hop Provenance Chain (max ${maxHops} hops)`);
    console.log(`  Start: ${startDistributionURI}`);
    console.log(HR);

    const chain = [];
    const visited = new Set();
    let currentURI = startDistributionURI;
    let hopNumber = 0;

    while (currentURI && !visited.has(currentURI) && hopNumber <= maxHops) {
        visited.add(currentURI);

        const distID = extractLocalID(currentURI);
        console.log(`\n  → Hop ${hopNumber}: ${distID}`);

        const compResult = await verifyCompliance(distID);
        const mandatoryFailures = compResult.results
            .filter(r => !r.present && r.severity === "mandatory")
            .map(r => r.label);

        chain.push({
            uri: currentURI,
            hopNumber,
            compliant: compResult.allCompliant,
            failures: mandatoryFailures,
        });

        hopNumber++;

        // Follow one hop upstream via derivedFromDistribution only
        // (derivedFromResearchProduct leads to non-distribution nodes)
        const parentQuery = `${PREFIXES}
SELECT ?parent
WHERE {
    <${currentURI}> aimd:derivedFromDistribution ?parent .
}
LIMIT 1`;
        const parentBindings = await sparqlSelect(parentQuery);
        currentURI = parentBindings.length > 0 ? parentBindings[0].parent.value : null;
    }

    // Print chain compliance summary (matches Diya's terminal output style)
    console.log(`\n${HR}`);
    console.log(`  Chain Compliance Summary  (${chain.length} hop${chain.length !== 1 ? "s" : ""} checked)`);
    console.log(HR);
    for (const h of chain) {
        const icon = h.compliant ? "✅" : "❌";
        console.log(`  ${icon}  Hop ${h.hopNumber}: ${extractLocalID(h.uri)}`);
        if (!h.compliant && h.failures.length > 0) {
            console.log(`       Mandatory failures: ${h.failures.join(", ")}`);
        }
    }
    const overallCompliant = chain.length > 0 && chain.every(h => h.compliant);
    console.log(`\n  Chain overall: ${overallCompliant ? "✅ FULLY COMPLIANT" : "❌ NON-COMPLIANT at one or more hops"}`);
    console.log(`${HR}\n`);

    return { chain, overallCompliant };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 EXTENSION 3: checkNewV2Obligations
// Graph-driven check for the 11 new aimd2: action terms.
// Filters the obligation query to the aimd2 namespace so it only picks up
// terms defined in AIMD_extended_v2.ttl, not Diya's existing terms.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks compliance against the new aimd2 obligation terms defined in AIMD_extended_v2.ttl.
 * Follows the same graph-driven pattern as Diya's existing compliance checker.
 *
 * @param {string} distributionID - Local dcat ID of the distribution to check
 * @returns {Promise<{results: Array<{obligation: string, present: boolean, value: string, severity: string, legalBasis: string}>, mandatoryFailures: number}>}
 */
async function checkNewV2Obligations(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  V2 Obligation Check (aimd2:): dcat:${distributionID}`);
    console.log(HR);

    // Load all aimd2: action terms with evidenceProperty from the graph
    const obligationQuery = `${PREFIXES}
SELECT ?action ?label ?evidenceProp ?severity ?checkDesc ?legalBasis
WHERE {
    ?action a odrl:Action ;
            aimd:evidenceProperty ?evidenceProp .
    FILTER(STRSTARTS(STR(?action), "${AIMD2_BASE}"))
    OPTIONAL { ?action rdfs:label ?label }
    OPTIONAL { ?action aimd:severity ?severity }
    OPTIONAL { ?action aimd:checkDescription ?checkDesc }
    OPTIONAL { ?action aimd:legalBasis ?legalBasis }
}`;
    const obligationBindings = await sparqlSelect(obligationQuery);

    if (obligationBindings.length === 0) {
        console.log("  ⚠️  No aimd2: obligation terms found in the graph.");
        console.log("     Load AIMD_extended_v2.ttl into GraphDB and re-run.");
        console.log(`${HR}\n`);
        return { results: [], mandatoryFailures: 0 };
    }

    // Load all direct properties of the distribution
    const metaQuery = `${PREFIXES}
SELECT ?prop ?val
WHERE { dcat:${distributionID} ?prop ?val . }`;
    const metaBindings = await sparqlSelect(metaQuery);
    const declared = {};
    for (const b of metaBindings) {
        declared[b.prop.value] = b.val.value;
    }

    const PLACEHOLDER = "https://example.com/placeholder/";
    const results = [];
    let mandatoryFailures = 0;
    let recommendedGaps = 0;

    for (const b of obligationBindings) {
        const ep       = b.evidenceProp.value;
        const label    = b.label?.value    || b.action.value.split("/").pop();
        const severity = b.severity?.value || "mandatory";
        const checkDesc= b.checkDesc?.value|| "";
        const legalBasis = b.legalBasis?.value || "";

        const value   = declared[ep];
        const present = value !== undefined && !value.startsWith(PLACEHOLDER);

        if (!present && severity === "mandatory")   mandatoryFailures++;
        if (!present && severity === "recommended") recommendedGaps++;

        const icon = present
            ? "✅ COMPLIANT  "
            : severity === "mandatory" ? "❌ MISSING    " : "⚠️  RECOMMENDED";

        console.log(`  ${icon}  ${label}`);
        if (checkDesc)  console.log(`               ${checkDesc}`);
        if (legalBasis) console.log(`               Legal basis: ${legalBasis}`);
        if (!present)   console.log(`               → Value: ${value || "(not declared)"}`);
        console.log();

        results.push({ obligation: label, present, value: value || "(not declared)", severity, legalBasis });
    }

    const overall = mandatoryFailures === 0 ? "✅ FULLY COMPLIANT" : "❌ NON-COMPLIANT";
    console.log(`  V2 Overall: ${overall}  (${mandatoryFailures} mandatory failures, ${recommendedGaps} recommended gaps)`);
    console.log(`${HR}\n`);

    return { results, mandatoryFailures };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA  (Diya v3.0 — unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

const academicCatalogue = [
    { catID: "TCD-TARA", description: "TCD TARA Institutional Repository — open access research outputs", publisher: "Trinity College Dublin" },
];

const researchProducts = [
    {
        id: "tara-paper-001", title: "Bias in NLP Models: A Systematic Review",
        creator: "Dr. Jane Murphy", issued: "2023-06-15",
        description: "Comprehensive review of bias in NLP models.",
        doi: "10.5281/zenodo.12345", repoURL: "https://tara.tcd.ie/handle/12345/001",
        licenceURI: "https://example.com/policy/OpenAccessAcademicLicence",
        keyword: "NLP, bias, AI, machine learning",
    },
    {
        id: "tara-dataset-002", title: "Irish Legal Corpus — Open Access",
        creator: "Prof. Aoife Walsh", issued: "2022-11-20",
        description: "A curated corpus of Irish legislative and court documents.",
        doi: "10.5281/zenodo.67890", repoURL: "https://tara.tcd.ie/handle/12345/002",
        licenceURI: "https://example.com/policy/OpenAccessAcademicLicence",
        keyword: "legal NLP, Irish law, corpus",
    },
];

const aiModelResources = [
    {
        resID: "facialrecognitionID", creator: "Meta", title: "facial-recog", date: "2024-03-10",
        desc: "Facial recognition model", domain: "Law Enforcement", purpose: "Facial Recognition",
        capability: "Match face with database", user: "Law Enforcement", subject: "Crime Suspects",
        modelCardURL: "https://huggingface.co/meta/facial-recog/blob/main/README.md",
        datasetCardURL: "https://huggingface.co/datasets/meta/face-db",
        biasReportURL: "https://huggingface.co/meta/facial-recog/blob/main/bias_report.pdf",
        trainingDataSummaryURL: "https://huggingface.co/meta/facial-recog/blob/main/training_data.md",
        riskAssessmentURL: "https://huggingface.co/meta/facial-recog/blob/main/risk_assessment.pdf",
    },
    {
        resID: "texttospeechID", creator: "Google", title: "text-to-speech", date: "2024-03-09",
        desc: "Text to speech model", domain: "Communication", purpose: "Text to Speech",
        capability: "Generate speech from text", user: "Mute Persons", subject: "Language Learner",
        modelCardURL: "https://huggingface.co/google/tts/blob/main/README.md",
        datasetCardURL: "https://huggingface.co/datasets/google/speech-corpus",
        biasReportURL: "https://huggingface.co/google/tts/blob/main/bias_report.pdf",
        trainingDataSummaryURL: "https://huggingface.co/google/tts/blob/main/training_data.md",
        riskAssessmentURL: "https://huggingface.co/google/tts/blob/main/risk_assessment.pdf",
    },
    {
        resID: "image-classificationID", creator: "Microsoft", title: "image-classification", date: "2024-03-08",
        desc: "Biomedical scan tumour classifier", domain: "Healthcare", purpose: "Tumor Classification",
        capability: "Classify tumors", user: "Radiologist", subject: "Hospital Patients",
        modelCardURL: "https://huggingface.co/microsoft/biomedical-classifier/blob/main/README.md",
        datasetCardURL: "https://huggingface.co/datasets/microsoft/scan-data",
        biasReportURL: "https://huggingface.co/microsoft/biomedical-classifier/blob/main/bias_report.pdf",
        trainingDataSummaryURL: "https://huggingface.co/microsoft/biomedical-classifier/blob/main/training_data.md",
        riskAssessmentURL: "https://huggingface.co/microsoft/biomedical-classifier/blob/main/risk_assessment.pdf",
    },
    {
        resID: "textgenID", creator: "anon123", title: "TextGen-QA", date: "2024-03-01",
        desc: "Question Answering Model — trained on TCD TARA corpus",
        domain: "Retail", purpose: "Customer Service", capability: "QA", user: "Retail", subject: "Customers",
        modelCardURL: null, datasetCardURL: null, biasReportURL: null,
        trainingDataSummaryURL: null, riskAssessmentURL: null,
    },
    {
        resID: "legal-llm-001", creator: "LegalAI Ltd", title: "IrishLegalLLM", date: "2025-01-15",
        desc: "LLM fine-tuned on Irish Legal Corpus", domain: "Legal", purpose: "Legal Document Analysis",
        capability: "Summarise Irish legislation", user: "Legal Professionals", subject: "Irish Practitioners",
        modelCardURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/README.md",
        datasetCardURL: "https://huggingface.co/datasets/legalai/irish-legal-corpus",
        biasReportURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/bias_report.pdf",
        trainingDataSummaryURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/training_data.md",
        riskAssessmentURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/risk_assessment.pdf",
    },
    {
        resID: "legal-llm-finetuned-001", creator: "LegalTech Startup", title: "IrishLegalLLM-ContractAnalysis", date: "2025-06-01",
        desc: "IrishLegalLLM further fine-tuned for contract analysis", domain: "Legal", purpose: "Contract Analysis",
        capability: "Identify clauses and risks in contracts", user: "Solicitors", subject: "Contract Parties",
        modelCardURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/README.md",
        datasetCardURL: "https://huggingface.co/datasets/legaltech/contracts",
        biasReportURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/bias_report.pdf",
        trainingDataSummaryURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/training_data.md",
        riskAssessmentURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/risk_assessment.pdf",
    },
];

const co2Disclosures = {
    "FacialRecog_CO2": {
        kgCO2eq: 1200, energyKWhTotal: 5000, trainingHardware: "NVIDIA A100 x 16",
        trainingDurationHours: 720, cloudRegion: "us-east-1", gridCarbonIntensity: 420,
        emissionsScope: "training", reportingStandard: "CodeCarbon v2",
        co2MeasurementURL: "https://huggingface.co/meta/facial-recog/blob/main/co2_report.json",
    },
    "TextToSpeech_CO2": {
        kgCO2eq: 430, energyKWhTotal: 1800, trainingHardware: "NVIDIA V100 x 8",
        trainingDurationHours: 240, cloudRegion: "eu-west-1", gridCarbonIntensity: 233,
        emissionsScope: "training+inference", reportingStandard: "ML CO2 Impact",
        co2MeasurementURL: "https://huggingface.co/google/tts/blob/main/co2_report.json",
    },
    "BiomedImaging_CO2": {
        kgCO2eq: 620, energyKWhTotal: 2600, trainingHardware: "NVIDIA A100 x 8",
        trainingDurationHours: 360, cloudRegion: "eu-west-2", gridCarbonIntensity: 256,
        emissionsScope: "training", reportingStandard: "CodeCarbon v2",
        co2MeasurementURL: "https://huggingface.co/microsoft/biomedical-classifier/blob/main/co2_report.json",
    },
    "IrishLegalLLM_CO2": {
        kgCO2eq: 890, energyKWhTotal: 3700, trainingHardware: "NVIDIA A100 x 8",
        trainingDurationHours: 480, cloudRegion: "eu-west-1", gridCarbonIntensity: 233,
        emissionsScope: "training", reportingStandard: "CodeCarbon v2",
        co2MeasurementURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/co2_report.json",
    },
    "LegalLLMFineTuned_CO2": {
        kgCO2eq: 95, energyKWhTotal: 400, trainingHardware: "NVIDIA A10 x 4",
        trainingDurationHours: 48, cloudRegion: "eu-west-1", gridCarbonIntensity: 233,
        emissionsScope: "training", reportingStandard: "CodeCarbon v2",
        co2MeasurementURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/co2_report.json",
    },
};

const copyrightPolicies = {
    "FacialRecog_CP": {
        optOutMechanism: "robots.txt + Spawning AI opt-out registry",
        rightsHolderRegistry: "https://huggingface.co/meta/facial-recog/blob/main/rights_registry.json",
        tdmWaiver: "DSM Directive Art. 4 TDM exception",
        openAccessSourcesOnly: false,
        ccSignalsCompliant: true,
        copyrightPolicyDocURL: "https://huggingface.co/meta/facial-recog/blob/main/copyright_policy.pdf",
    },
    "IrishLegalLLM_CP": {
        optOutMechanism: "Open-access only — DSM Art. 4 applies; no web-crawl opt-out needed",
        rightsHolderRegistry: "https://tara.tcd.ie/handle/12345/002/rights",
        tdmWaiver: "CC-BY TDM clause; DSM Art. 4 TDM exception",
        openAccessSourcesOnly: true,
        ccSignalsCompliant: true,
        copyrightPolicyDocURL: "https://huggingface.co/legalai/irish-legal-llm/blob/main/copyright_policy.pdf",
    },
    "LegalLLMFineTuned_CP": {
        optOutMechanism: "Inherited from parent model IrishLegalLLMDist1.5",
        rightsHolderRegistry: "https://huggingface.co/legaltech/contract-analysis/blob/main/rights_registry.json",
        tdmWaiver: "CC-BY TDM clause; inherits parent model waiver",
        openAccessSourcesOnly: true,
        ccSignalsCompliant: true,
        copyrightPolicyDocURL: "https://huggingface.co/legaltech/contract-analysis/blob/main/copyright_policy.pdf",
    },
};

const distributions = [
    {
        distribution: "FacialRecognitionDist1.1", accessURL: "https://huggingface.co/meta/facial-recog",
        date: "2024-03-20", sourceRP: null, parentDist: null,
        co2ID: "FacialRecog_CO2", cpID: "FacialRecog_CP",
    },
    {
        distribution: "TextToSpeechDist1.2", accessURL: "https://huggingface.co/google/tts",
        date: "2024-03-17", sourceRP: null, parentDist: null,
        co2ID: "TextToSpeech_CO2", cpID: null,
    },
    {
        distribution: "BiomedicalImageClassifierDist1.3", accessURL: "https://huggingface.co/microsoft/biomedical-classifier",
        date: "2024-03-19", sourceRP: null, parentDist: null,
        co2ID: "BiomedImaging_CO2", cpID: null,
    },
    {
        distribution: "TextGenDist1.4", accessURL: "https://huggingface.co/anon123/textgen-qa",
        date: "2024-03-18", sourceRP: "tara-paper-001", parentDist: null,
        co2ID: null, cpID: null,
    },
    {
        distribution: "IrishLegalLLMDist1.5", accessURL: "https://huggingface.co/legalai/irish-legal-llm",
        date: "2025-01-20", sourceRP: "tara-dataset-002", parentDist: null,
        co2ID: "IrishLegalLLM_CO2", cpID: "IrishLegalLLM_CP",
    },
    {
        distribution: "LegalLLMContractAnalysisDist1.6", accessURL: "https://huggingface.co/legaltech/contract-analysis",
        date: "2025-06-10", sourceRP: null, parentDist: "IrishLegalLLMDist1.5",
        co2ID: "LegalLLMFineTuned_CO2", cpID: "LegalLLMFineTuned_CP",
    },
];

const policies = [
    { policy: "FacialRecogLicence",        accessURL: "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/HighRiskAILicence.ttl" },
    { policy: "TextToSpeechLicence",       accessURL: "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/GPAILicence.ttl" },
    { policy: "ImagingLicence",            accessURL: "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/HighRiskAILicence.ttl" },
    { policy: "TextGenLicence",            accessURL: "https://example.com/policy/OpenAccessAcademicLicence" },
    { policy: "OpenAccessAcademicLicence", accessURL: "https://example.com/policy/OpenAccessAcademicLicence" },
];

const usage = [
    { usage: "UsageID0001", organisation: "MacroHard",         date: "2024-04-03", accessURL: "https://example.com" },
    { usage: "UsageID0002", organisation: "LegalAI Ltd",       date: "2025-02-01", accessURL: "https://legalai.example.com" },
    { usage: "UsageID0003", organisation: "LegalTech Startup", date: "2025-06-15", accessURL: "https://legaltech.example.com" },
];

const resource1 = [{
    resID: "SportsBettingCustServiceID", creator: "MacroHard",
    title: "SportsBettingCustService001", date: "2024-04-03",
    desc: "Fine-tuned for sports betting questions", domain: "Retail",
    purpose: "Customer Assistance", capability: "Answer betting questions",
    user: "Bookmakers", subject: "Gambling Customers",
    modelCardURL: "https://huggingface.co/macrohard/sports-betting/blob/main/README.md",
    datasetCardURL: null, biasReportURL: null, trainingDataSummaryURL: null, riskAssessmentURL: null,
}];

const policy1 = [
    { policy: "GPAILicence", accessURL: "https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/GPAILicence.ttl" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// UC INSTANCE DATA INSERTION
// Inserts RDF triples for all 15 use case distribution chains.
// Called once from main() before the checker runs.
// ═══════════════════════════════════════════════════════════════════════════════

async function insertUCInstances() {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log("  Inserting use-case instance data (UC-1 to UC-15)");
    console.log(HR);

    // Prefixes shared by all INSERT DATA blocks
    const P = `${PREFIXES}
PREFIX ex: <https://example.com/policy/>
`;

    const blocks = [
        // ── UC-1: CC-BY corpus → open research LLM (✓) ────────────────────
        `${P}
INSERT DATA {
  dcat:CCBYCorpusDist1 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-01-01"^^xsd:date ;
    dcat:accessURL <https://tara.tcd.ie/uc1-corpus> ;
    aimd2:actorType "research" ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc1-corpus> .

  dcat:OpenResearchLLMDist1 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:CCBYCorpusDist1 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-03-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/openresearch/llm-uc1> ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc1-corpus> ;
    aimd2:modelWeightsURL <https://huggingface.co/openresearch/llm-uc1> ;
    aimd2:downstreamLicenceURI <https://example.com/policy/OpenResearchLLMLicence> ;
    aimd2:article50PolicyURL <https://openresearch.example.com/art50/uc1> ;
    aimd2:actorType "research" .
}`,
        // ── UC-2: CC-BY-NC dataset → commercial AI product (✗) ────────────
        `${P}
INSERT DATA {
  dcat:CCBYNCDatasetDist2 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/CommercialConflictLicence> ;
    dct:issued "2025-06-01"^^xsd:date ;
    dcat:accessURL <https://example.com/nc-dataset> .

  dcat:CommercialProductDist2 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:CCBYNCDatasetDist2 ;
    dct:license <https://example.com/policy/GPAILicence> ;
    dct:issued "2026-03-01"^^xsd:date ;
    dcat:accessURL <https://example.com/commercial-product-v2> ;
    aimd2:actorType "commercial" ;
    aimd2:trainingDatasetURL <https://example.com/nc-dataset> .
}`,
        // ── UC-3: CC-BY-SA corpus → copyleft-violating fine-tune (✗) ──────
        `${P}
INSERT DATA {
  dcat:CCBYSACorpusDist3 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/CopyleftPropagationLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://example.com/sa-corpus> .

  dcat:CopyleftViolatingModelDist3 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:CCBYSACorpusDist3 ;
    dct:license <https://example.com/policy/GPAILicence> ;
    dct:issued "2026-04-01"^^xsd:date ;
    dcat:accessURL <https://example.com/copyleft-model-v3> ;
    aimd2:baseModelURL <https://example.com/sa-corpus> .
}`,
        // ── UC-4: Embargoed preprint → premature RAG ingestion (✗) ────────
        `${P}
INSERT DATA {
  dcat:EmbargoedPreprintDist4 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/EmbargoedCorpusLicence> ;
    dct:issued "2025-09-01"^^xsd:date ;
    dcat:accessURL <https://tara.tcd.ie/embargo/preprint-uc4> ;
    aimd2:EmbargoEndDate "2027-06-30"^^xsd:date .

  dcat:PrematureRAGDist4 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:EmbargoedPreprintDist4 ;
    dct:license <https://example.com/policy/RAGPolicySetLicence> ;
    dct:issued "2026-06-30"^^xsd:date ;
    dcat:accessURL <https://example.com/rag-system-uc4> ;
    aimd2:ragCorpusPolicy <https://example.com/policy/EmbargoedCorpusLicence> ;
    aimd2:EmbargoEndDate "2027-06-30"^^xsd:date .
}`,
        // ── UC-5: Multi-source (CC-BY + CC-BY-NC + CC-BY-SA) → GPAI (✗) ─
        `${P}
INSERT DATA {
  dcat:MultiSourceCCBYDist5 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2023-01-01"^^xsd:date ;
    dcat:accessURL <https://example.com/ccby-source-uc5> .

  dcat:MultiSourceCCBYNCDist5 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/CommercialConflictLicence> ;
    dct:issued "2023-02-01"^^xsd:date ;
    dcat:accessURL <https://example.com/ccbync-source-uc5> .

  dcat:MultiSourceCCBYSADist5 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/CopyleftPropagationLicence> ;
    dct:issued "2023-03-01"^^xsd:date ;
    dcat:accessURL <https://example.com/ccbysa-source-uc5> .

  dcat:GPAIMultiSourceDist5 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:MultiSourceCCBYDist5 ;
    aimd:derivedFromDistribution dcat:MultiSourceCCBYNCDist5 ;
    aimd:derivedFromDistribution dcat:MultiSourceCCBYSADist5 ;
    dct:license <https://example.com/policy/GPAILicence> ;
    dct:issued "2026-05-01"^^xsd:date ;
    dcat:accessURL <https://example.com/gpai-multi-source-uc5> ;
    aimd2:actorType "commercial" ;
    aimd2:trainingDatasetURL <https://example.com/multi-source-summary-uc5> .
}`,
        // ── UC-6: Proprietary LLM API → unauthorised distillation (✗) ─────
        `${P}
INSERT DATA {
  dcat:ProprietaryLLMDist6 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ProprietaryDistillationLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://api.proprietaryllm.example.com/v1> .

  dcat:UnauthorisedDistillationDist6 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ProprietaryLLMDist6 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-02-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/anon/distilled-model-uc6> ;
    aimd2:actorType "competitor" ;
    aimd2:trainingDatasetURL <https://api.proprietaryllm.example.com/v1> .
}`,
        // ── UC-7: Apache 2.0 → MIT fine-tune (✓) ──────────────────────────
        `${P}
INSERT DATA {
  dcat:ApacheBaseDist7 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ApacheMITChainLicence> ;
    dct:issued "2024-06-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/apache-org/base-model-uc7> .

  dcat:MITStudentDist7 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ApacheBaseDist7 ;
    dct:license <https://example.com/policy/ApacheMITChainLicence> ;
    dct:issued "2026-05-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/student/mit-finetune-uc7> ;
    aimd2:baseModelURL <https://huggingface.co/apache-org/base-model-uc7> ;
    aimd2:modelWeightsURL <https://huggingface.co/student/mit-finetune-uc7> ;
    aimd2:downstreamLicenceURI <https://example.com/policy/ApacheMITChainLicence> ;
    aimd2:article50PolicyURL <https://example.com/uc7/art50> .
}`,
        // ── UC-8: Apache 2.0 → AGPL fine-tune → API deployment (✗) ────────
        `${P}
INSERT DATA {
  dcat:ApacheBaseNetworkDist8 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ApacheMITChainLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/apache-org/base-model-uc8> .

  dcat:AGPLFineTuneDist8 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ApacheBaseNetworkDist8 ;
    dct:license <https://example.com/policy/AGPLNetworkLicence> ;
    dct:issued "2025-06-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/agpl-org/fine-tune-uc8> ;
    aimd2:baseModelURL <https://huggingface.co/apache-org/base-model-uc8> .

  dcat:NetworkAPIDist8 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:AGPLFineTuneDist8 ;
    dct:license <https://example.com/policy/AGPLNetworkLicence> ;
    dct:issued "2026-03-01"^^xsd:date ;
    dcat:accessURL <https://api.agpl-service.example.com/v1> ;
    aimd2:deploymentContext "network" .
}`,
        // ── UC-9: Open model → RLHF on user logs → aligned model (✗) ──────
        `${P}
INSERT DATA {
  dcat:OpenModelDist9 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2024-06-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/openorg/base-uc9> .

  dcat:RLHFAlignedDist9 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:OpenModelDist9 ;
    dct:license <https://example.com/policy/RLHFAlignedModelLicence> ;
    dct:issued "2026-04-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/openorg/rlhf-aligned-uc9> ;
    aimd2:rlhfDataPolicy <https://example.com/uc9/rlhf-policy> .
}`,
        // ── UC-10: Proprietary teacher → synthetic data → open model (✗) ──
        `${P}
INSERT DATA {
  dcat:ProprietaryTeacherDist10 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ProprietaryDistillationLicence> ;
    dct:issued "2023-01-01"^^xsd:date ;
    dcat:accessURL <https://api.teacher-llm.example.com/v1> .

  dcat:SyntheticDataDist10 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ProprietaryTeacherDist10 ;
    dct:license <https://example.com/policy/SyntheticDataDisclosureLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://datasets.example.com/synthetic-uc10> ;
    aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .

  dcat:OpenModelSyntheticDist10 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:SyntheticDataDist10 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-04-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/openorg/synthetic-trained-uc10> ;
    aimd2:trainingDatasetURL <https://datasets.example.com/synthetic-uc10> ;
    aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
}`,
        // ── UC-11: Retriever + Corpus → Generator RAG output ──────────────
        `${P}
INSERT DATA {
  dcat:RetrieverDist11 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/RetrieverModelLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/retriever-org/retriever-uc11> .

  dcat:CorpusDist11 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/RAGCorpusLicence> ;
    dct:issued "2023-01-01"^^xsd:date ;
    dcat:accessURL <https://datasets.example.com/corpus-uc11> .

  dcat:GeneratorRAGDist11 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:RetrieverDist11 ;
    aimd:derivedFromDistribution dcat:CorpusDist11 ;
    dct:license <https://example.com/policy/RAGPolicySetLicence> ;
    dct:issued "2026-05-01"^^xsd:date ;
    dcat:accessURL <https://api.rag-service.example.com/v1> ;
    aimd2:ragCorpusPolicy <https://example.com/policy/RAGCorpusLicence> ;
    aimd2:inferenceEndpointURL <https://api.rag-service.example.com/v1> ;
    aimd2:article50PolicyURL <https://example.com/uc11/art50> .
}`,
        // ── UC-12: Expert A + B + C → MoE merged model (✗) ───────────────
        `${P}
INSERT DATA {
  dcat:ExpertADist12 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/expert-a/model-uc12> .

  dcat:ExpertBDist12 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/MoEMergedModelLicence> ;
    dct:issued "2024-02-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/meta/llama-expert-uc12> .

  dcat:ExpertCDist12 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ApacheMITChainLicence> ;
    dct:issued "2024-03-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/apache-org/expert-c-uc12> .

  dcat:MoEMergedDist12 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ExpertADist12 ;
    aimd:derivedFromDistribution dcat:ExpertBDist12 ;
    aimd:derivedFromDistribution dcat:ExpertCDist12 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-05-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/moe-org/merged-uc12> ;
    aimd2:modelWeightsURL <https://huggingface.co/moe-org/merged-uc12> .
}`,
        // ── UC-13: Planner LLM → Executor LLM → actions (✓ inference only)
        `${P}
INSERT DATA {
  dcat:PlannerLLMDist13 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/InferenceChainLicence> ;
    dct:issued "2025-01-01"^^xsd:date ;
    dcat:accessURL <https://api.planner-llm.example.com/v1> ;
    aimd2:inferenceEndpointURL <https://api.planner-llm.example.com/v1> .

  dcat:ExecutorLLMDist13 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:PlannerLLMDist13 ;
    dct:license <https://example.com/policy/InferenceChainLicence> ;
    dct:issued "2025-01-01"^^xsd:date ;
    dcat:accessURL <https://api.executor-llm.example.com/v1> ;
    aimd2:inferenceEndpointURL <https://api.executor-llm.example.com/v1> ;
    aimd2:deploymentContext "inference-chain" .
}`,
        // ── UC-14: CC-BY → base LLM → fine-tune → GPAI API (3-hop, ✓) ────
        `${P}
INSERT DATA {
  dcat:CCBYCorpusDist14 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2022-01-01"^^xsd:date ;
    dcat:accessURL <https://tara.tcd.ie/uc14-corpus> ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc14-corpus> .

  dcat:BaseLLMDist14 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:CCBYCorpusDist14 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2023-06-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/openresearch/base-llm-uc14> ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc14-corpus> ;
    aimd2:modelWeightsURL <https://huggingface.co/openresearch/base-llm-uc14> ;
    aimd2:downstreamLicenceURI <https://example.com/policy/OpenResearchLLMLicence> ;
    aimd2:article50PolicyURL <https://example.com/uc14/hop1-art50> .

  dcat:FineTunedDist14 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:BaseLLMDist14 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2024-06-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/domainai/finetuned-uc14> ;
    aimd2:baseModelURL <https://huggingface.co/openresearch/base-llm-uc14> ;
    aimd2:modelWeightsURL <https://huggingface.co/domainai/finetuned-uc14> ;
    aimd2:downstreamLicenceURI <https://example.com/policy/OpenResearchLLMLicence> ;
    aimd2:article50PolicyURL <https://example.com/uc14/hop2-art50> ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc14-corpus> .

  dcat:GPAIAPIDist14 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:FineTunedDist14 ;
    dct:license <https://example.com/policy/OpenResearchLLMLicence> ;
    dct:issued "2026-01-01"^^xsd:date ;
    dcat:accessURL <https://api.gpai.example.com/v1/uc14> ;
    aimd2:inferenceEndpointURL <https://api.gpai.example.com/v1/uc14> ;
    aimd2:modelWeightsURL <https://huggingface.co/domainai/finetuned-uc14> ;
    aimd2:article50PolicyURL <https://example.com/uc14/hop3-art50> ;
    aimd2:trainingDatasetURL <https://tara.tcd.ie/uc14-corpus> ;
    aimd2:downstreamLicenceURI <https://example.com/policy/OpenResearchLLMLicence> .
}`,
        // ── UC-15: Prop data → closed model → distillation → MoE → product (✗ cascading)
        `${P}
INSERT DATA {
  dcat:PropDataDist15 a dcat:Distribution, aimd:AIModelDistribution ;
    dct:license <https://example.com/policy/ProprietaryDistillationLicence> ;
    dct:issued "2020-01-01"^^xsd:date ;
    dcat:accessURL <https://example.com/proprietary-data-uc15> .

  dcat:ClosedModelDist15 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:PropDataDist15 ;
    dct:license <https://example.com/policy/ProprietaryDistillationLicence> ;
    dct:issued "2022-01-01"^^xsd:date ;
    dcat:accessURL <https://example.com/closed-model-uc15> ;
    aimd2:actorType "competitor" .

  dcat:DistillationDist15 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:ClosedModelDist15 ;
    dct:license <https://example.com/policy/CascadingConflictLicence> ;
    dct:issued "2024-01-01"^^xsd:date ;
    dcat:accessURL <https://huggingface.co/anon/distilled-uc15> ;
    aimd2:actorType "competitor" ;
    aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .

  dcat:MoEMergeStepDist15 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:DistillationDist15 ;
    dct:license <https://example.com/policy/CascadingConflictLicence> ;
    dct:issued "2025-01-01"^^xsd:date ;
    dcat:accessURL <https://example.com/moe-stage-uc15> ;
    aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .

  dcat:ConsumerProductDist15 a dcat:Distribution, aimd:AIModelDistribution ;
    aimd:derivedFromDistribution dcat:MoEMergeStepDist15 ;
    dct:license <https://example.com/policy/CascadingConflictLicence> ;
    dct:issued "2026-06-01"^^xsd:date ;
    dcat:accessURL <https://consumer-product.example.com/v1> ;
    aimd2:deploymentContext "network" ;
    aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" .
}`,
    ];

    for (let i = 0; i < blocks.length; i++) {
        const s = await sparqlUpdate(blocks[i]);
        console.log(`  UC-${i + 1} instance data: HTTP ${s}`);
    }
    console.log(`${HR}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// USE-CASE CHECKER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── UC-2: checkCommercialConflict ─────────────────────────────────────────────
/**
 * Detects a CC-BY-NC-style conflict: source distribution has an NC licence
 * AND the derived distribution declares commercial actorType.
 *
 * @param {string} distributionID - local dcat ID of the derived distribution
 * Legal basis: CC-BY-NC §3(b); DSM Art. 4(3); EU AI Act Art. 53(1)(c)
 */
async function checkCommercialConflict(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-2 Commercial Conflict Check: dcat:${distributionID}`);
    console.log(HR);

    const q = `${PREFIXES}
SELECT ?sourceLicence ?actorType
WHERE {
    dcat:${distributionID} aimd2:actorType ?actorType ;
                            aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?sourceLicence .
}`;
    const bindings = await sparqlSelect(q);

    const conflicts = [];
    const NC_LICENCE = "https://example.com/policy/CommercialConflictLicence";

    for (const b of bindings) {
        const licence = b.sourceLicence?.value || "";
        const actor   = b.actorType?.value    || "";
        if (licence === NC_LICENCE && actor === "commercial") {
            conflicts.push(`NC licence (${licence}) conflicts with commercial actor`);
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ CONFLICT";
    console.log(`  ${icon}  (${conflicts.length} conflict(s) detected)`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    if (compliant) {
        console.log("  No NC-vs-commercial conflict found.");
    }
    console.log(`  Legal basis: CC-BY-NC 4.0 §3(b); DSM Art. 4(3); EU AI Act Art. 53(1)(c)`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-3: checkCopyleftPropagation ───────────────────────────────────────────
/**
 * Checks CC-BY-SA copyleft: source has a copyleft licence → downstream must
 * declare a compatible downstreamLicenceURI.
 *
 * Legal basis: CC-BY-SA 4.0 §3(b) ShareAlike; Andersen v. Stability AI.
 */
async function checkCopyleftPropagation(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-3 Copyleft Propagation Check: dcat:${distributionID}`);
    console.log(HR);

    const SA_LICENCE = "https://example.com/policy/CopyleftPropagationLicence";

    const q = `${PREFIXES}
SELECT ?sourceLicence ?downstreamLic
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?sourceLicence .
    OPTIONAL { dcat:${distributionID} aimd2:downstreamLicenceURI ?downstreamLic . }
}`;
    const bindings = await sparqlSelect(q);

    const conflicts = [];
    for (const b of bindings) {
        const src  = b.sourceLicence?.value || "";
        const down = b.downstreamLic?.value || null;
        if (src === SA_LICENCE) {
            if (!down) {
                conflicts.push(`ShareAlike source (${src}) requires downstreamLicenceURI — missing`);
            } else if (down !== SA_LICENCE) {
                conflicts.push(`ShareAlike source requires CC-BY-SA-compatible downstream; got: ${down}`);
            }
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ COPYLEFT VIOLATION";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: CC-BY-SA 4.0 §3(b); Andersen v. Stability AI (trial Sept 2026)`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-4: checkEmbargoCompliance ─────────────────────────────────────────────
/**
 * Checks whether RAG ingestion of an embargoed preprint is premature.
 * Reads aimd2:EmbargoEndDate from the distribution and compares to today.
 *
 * Legal basis: DSM Art. 3(1) lawful access precondition; TCD TARA policy.
 */
async function checkEmbargoCompliance(distributionID, today = new Date()) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-4 Embargo Compliance Check: dcat:${distributionID}`);
    console.log(HR);

    const q = `${PREFIXES}
SELECT ?embargoEnd
WHERE {
    dcat:${distributionID} aimd2:EmbargoEndDate ?embargoEnd .
}`;
    const bindings = await sparqlSelect(q);
    const conflicts = [];

    if (bindings.length === 0) {
        console.log("  ✅ No embargo declared — access is unrestricted.");
    } else {
        const endDateStr = bindings[0].embargoEnd.value;
        const endDate    = new Date(endDateStr);
        if (today < endDate) {
            conflicts.push(`Embargo active until ${endDateStr}; current date: ${today.toISOString().slice(0, 10)}`);
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ EMBARGO VIOLATION";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: DSM Art. 3(1) lawful access; TCD TARA embargo policy`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-5: checkMultiSourceConflict ───────────────────────────────────────────
/**
 * Checks multi-source training: if ANY parent has an NC licence AND the derived
 * distribution is commercial, the whole chain fails. Also checks copyleft
 * propagation from CC-BY-SA parents.
 *
 * Legal basis: EU AI Act Art. 53(1)(c); DALICC dependency-graph reasoning.
 */
async function checkMultiSourceConflict(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-5 Multi-Source Conflict Check: dcat:${distributionID}`);
    console.log(HR);

    const NC_LICENCE = "https://example.com/policy/CommercialConflictLicence";
    const SA_LICENCE = "https://example.com/policy/CopyleftPropagationLicence";

    const q = `${PREFIXES}
SELECT ?parent ?parentLicence ?actorType ?downstreamLic
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?parentLicence .
    OPTIONAL { dcat:${distributionID} aimd2:actorType ?actorType . }
    OPTIONAL { dcat:${distributionID} aimd2:downstreamLicenceURI ?downstreamLic . }
}`;
    const bindings = await sparqlSelect(q);

    const conflicts = [];
    for (const b of bindings) {
        const parentLic = b.parentLicence?.value || "";
        const actor     = b.actorType?.value    || "";
        const downLic   = b.downstreamLic?.value || null;

        if (parentLic === NC_LICENCE && actor === "commercial") {
            conflicts.push(`NC parent (${parentLic}) + commercial actor → CONFLICT (DSM Art. 4(3))`);
        }
        if (parentLic === SA_LICENCE && downLic !== SA_LICENCE) {
            conflicts.push(`ShareAlike parent (${parentLic}) requires compatible downstream licence`);
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ MULTI-SOURCE CONFLICT";
    console.log(`  ${icon}  (${conflicts.length} conflict(s) across ${bindings.length} source(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: EU AI Act Art. 53(1)(c); DSM Art. 3/4; DALICC dependency graph`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-6: checkDistillationProhibition ───────────────────────────────────────
/**
 * Detects a contractual prohibition violation: source is a proprietary LLM API
 * (ProprietaryDistillationLicence) AND the derived distribution declares
 * actorType = "competitor".
 *
 * Legal basis: Contractual ToS; US Copyright Office Part 2 (2025) — no copyright claim.
 */
async function checkDistillationProhibition(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-6 Distillation Prohibition Check: dcat:${distributionID}`);
    console.log(HR);

    const PROP_LICENCE = "https://example.com/policy/ProprietaryDistillationLicence";
    const INHERIT_ACTION = "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#InheritSourceProhibitions";

    // Layer 1: detect competitor-actor training on proprietary source
    const q1 = `${PREFIXES}
SELECT ?sourceLicence ?actorType
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent ;
                            aimd2:actorType ?actorType .
    ?parent dct:license ?sourceLicence .
}`;

    // Layer 2: check whether source licence requires InheritSourceProhibitions
    // AND whether the derived distribution provides derivedModelLicenceURI.
    // Uses dct:license (not odrl:hasPolicy) because inline seeding blocks set dct:license only.
    const q2 = `${PREFIXES}
SELECT ?inheritObligation ?derivedLicenceURI
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?policy .
    OPTIONAL {
        ?policy odrl:obligation ?obl .
        ?obl odrl:action aimd2:InheritSourceProhibitions .
        BIND(aimd2:InheritSourceProhibitions AS ?inheritObligation)
    }
    OPTIONAL { dcat:${distributionID} aimd2:derivedModelLicenceURI ?derivedLicenceURI . }
}`;

    const [bindings1, bindings2] = await Promise.all([
        sparqlSelect(q1),
        sparqlSelect(q2),
    ]);

    const conflicts = [];

    // Layer 1
    for (const b of bindings1) {
        if (b.sourceLicence?.value === PROP_LICENCE && b.actorType?.value === "competitor") {
            conflicts.push(`Proprietary API ToS prohibits competitor training; actorType=competitor detected`);
        }
    }

    // Layer 2: inheritance obligation present but derivedModelLicenceURI absent
    for (const b of bindings2) {
        if (b.inheritObligation && !b.derivedLicenceURI) {
            conflicts.push(
                `Constraint-inheritance obligation (InheritSourceProhibitions) not satisfied: ` +
                `derivedModelLicenceURI absent — derived model carries no forward-bound ToS constraints`
            );
            break; // one report is enough even if query returns multiple rows
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ CONTRACTUAL PROHIBITION VIOLATED";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Note: Contract-law violation; AI outputs are not copyrightable`);
    console.log(`        (US Copyright Office Part 2, 2025). Layer 2: ToS propagates`);
    console.log(`        contractually to derived models (analogous to GPL copyleft).`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-8: checkAGPLNetworkTrigger ────────────────────────────────────────────
/**
 * Checks the AGPLv3 §13 network-use copyleft trigger: if deploymentContext
 * is "network" and modelWeightsURL is absent, source was not offered → non-compliant.
 *
 * Legal basis: AGPLv3 §13; Black Duck OSSRA network-copyleft tier.
 */
async function checkAGPLNetworkTrigger(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-8 AGPL Network Trigger Check: dcat:${distributionID}`);
    console.log(HR);

    const AGPL_LICENCE = "https://example.com/policy/AGPLNetworkLicence";
    const PLACEHOLDER  = "https://example.com/placeholder/";

    const q = `${PREFIXES}
SELECT ?parentLicence ?deployCtx ?weightsURL
WHERE {
    OPTIONAL { dcat:${distributionID} aimd2:deploymentContext ?deployCtx . }
    OPTIONAL { dcat:${distributionID} aimd2:modelWeightsURL ?weightsURL . }
    OPTIONAL {
        dcat:${distributionID} aimd:derivedFromDistribution ?parent .
        ?parent dct:license ?parentLicence .
    }
}`;
    const bindings = await sparqlSelect(q);

    const conflicts = [];
    for (const b of bindings) {
        const agplParent = b.parentLicence?.value === AGPL_LICENCE;
        const isNetwork  = b.deployCtx?.value === "network";
        const hasWeights = b.weightsURL?.value && !b.weightsURL.value.startsWith(PLACEHOLDER);
        if (agplParent && isNetwork && !hasWeights) {
            conflicts.push("AGPL §13 network trigger: deploymentContext=network but modelWeightsURL absent (source not offered)");
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ AGPL §13 NETWORK COPYLEFT VIOLATION";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: AGPLv3 §13; Black Duck OSSRA four-tier risk classification`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-9: checkRLHFConsent ────────────────────────────────────────────────────
/**
 * Checks GDPR consent for RLHF training: if rlhfDataPolicy is declared but
 * userConsentStatus is absent or not "given", training is unlawful.
 *
 * Legal basis: GDPR Art. 6/13/14; EU AI Act Art. 10.
 */
async function checkRLHFConsent(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-9 RLHF Consent Check: dcat:${distributionID}`);
    console.log(HR);

    const q = `${PREFIXES}
SELECT ?rlhfPolicy ?consentStatus
WHERE {
    OPTIONAL { dcat:${distributionID} aimd2:rlhfDataPolicy ?rlhfPolicy . }
    OPTIONAL { dcat:${distributionID} aimd2:userConsentStatus ?consentStatus . }
}`;
    const bindings = await sparqlSelect(q);
    const conflicts = [];

    if (bindings.length > 0) {
        const hasRLHF   = !!bindings[0].rlhfPolicy?.value;
        const consent   = bindings[0].consentStatus?.value || null;
        if (hasRLHF && consent !== "given") {
            conflicts.push(
                consent
                    ? `RLHF declared but userConsentStatus="${consent}" (must be "given")`
                    : "RLHF declared but userConsentStatus is absent — GDPR Art. 6 lawful basis missing"
            );
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ RLHF CONSENT MISSING";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: GDPR Art. 6/13/14; EU AI Act Art. 10`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-10: checkSyntheticDataDisclosure ──────────────────────────────────────
/**
 * Checks that models trained on synthetic data from a proprietary teacher
 * declare this in their Art. 53 training-content disclosure.
 *
 * Legal basis: EU AI Act Art. 53(1)(c); Recitals 107-110.
 */
async function checkSyntheticDataDisclosure(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-10 Synthetic Data Disclosure Check: dcat:${distributionID}`);
    console.log(HR);

    const PLACEHOLDER = "https://example.com/placeholder/";

    const q = `${PREFIXES}
SELECT ?dataGenMethod ?art50URL
WHERE {
    OPTIONAL { dcat:${distributionID} aimd2:dataGenerationMethod ?dataGenMethod . }
    OPTIONAL { dcat:${distributionID} aimd2:article50PolicyURL ?art50URL . }
}`;
    const bindings = await sparqlSelect(q);
    const conflicts = [];

    if (bindings.length > 0) {
        const method = bindings[0].dataGenMethod?.value || null;
        const art50  = bindings[0].art50URL?.value     || null;
        if (method === "synthetic-from-proprietary-teacher") {
            if (!art50 || art50.startsWith(PLACEHOLDER)) {
                conflicts.push(
                    "dataGenerationMethod=synthetic-from-proprietary-teacher but article50PolicyURL is absent — EU AI Act Art. 53(1)(c) disclosure gap"
                );
            }
        }
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ SYNTHETIC PROVENANCE NOT DISCLOSED";
    console.log(`  ${icon}  (${conflicts.length} violation(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: EU AI Act Art. 53(1)(c); Recitals 107-110; Phi-1/Orca precedents`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-11: checkRAGPolicySet ──────────────────────────────────────────────────
/**
 * Checks that a RAG distribution satisfies both the retriever model licence
 * AND the corpus data licence (multi-asset PolicySet composition).
 *
 * Legal basis: IDS-RAM 4.0; W3C ODRL PolicySet; Lewis et al. 2020.
 */
async function checkRAGPolicySet(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-11 RAG PolicySet Check: dcat:${distributionID}`);
    console.log(HR);

    const q = `${PREFIXES}
SELECT ?parent ?parentLicence ?ragPolicy ?inferenceURL
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?parentLicence .
    OPTIONAL { dcat:${distributionID} aimd2:ragCorpusPolicy ?ragPolicy . }
    OPTIONAL { dcat:${distributionID} aimd2:inferenceEndpointURL ?inferenceURL . }
}`;
    const bindings = await sparqlSelect(q);

    const licences   = new Set(bindings.map(b => b.parentLicence?.value).filter(Boolean));
    const ragPolicy  = bindings[0]?.ragPolicy?.value  || null;
    const inferenceURL = bindings[0]?.inferenceURL?.value || null;
    const conflicts  = [];

    if (licences.size < 2) {
        conflicts.push(`RAG PolicySet requires ≥2 source licences; found ${licences.size}`);
    }
    if (!ragPolicy) {
        conflicts.push("ragCorpusPolicy not declared — corpus access terms undisclosed");
    }
    if (!inferenceURL) {
        conflicts.push("inferenceEndpointURL not declared (recommended for deployed RAG service)");
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ RAG POLICYSET INCOMPLETE";
    console.log(`  ${icon}  (${licences.size} source licence(s), ${conflicts.length} issue(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: IDS-RAM 4.0; W3C ODRL PolicySet; Lewis et al. 2020 RAG architecture`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-12: checkMoEInheritance ────────────────────────────────────────────────
/**
 * Checks that the merged MoE model's licence is at least as restrictive as
 * the most restrictive expert licence (Meta Llama MAU threshold must survive).
 *
 * Legal basis: Meta Llama Community License §2; Jewitt et al. (2025).
 */
async function checkMoEInheritance(distributionID) {
    const HR = "─".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-12 MoE Inheritance Check: dcat:${distributionID}`);
    console.log(HR);

    const MOE_LICENCE = "https://example.com/policy/MoEMergedModelLicence";

    const q = `${PREFIXES}
SELECT ?parent ?parentLicence ?mergedLicence
WHERE {
    dcat:${distributionID} aimd:derivedFromDistribution ?parent .
    ?parent dct:license ?parentLicence .
    OPTIONAL { dcat:${distributionID} dct:license ?mergedLicence . }
}`;
    const bindings = await sparqlSelect(q);

    const parentHasMoERestriction = bindings.some(b => b.parentLicence?.value === MOE_LICENCE);
    const mergedLicence = bindings[0]?.mergedLicence?.value || null;
    const conflicts = [];

    if (parentHasMoERestriction && mergedLicence !== MOE_LICENCE) {
        conflicts.push(
            `Expert with MoE licence (Llama MAU threshold) detected; merged model licence "${mergedLicence}" does not inherit MoE obligations`
        );
    }

    const compliant = conflicts.length === 0;
    const icon = compliant ? "✅ COMPLIANT" : "❌ MOE OBLIGATION INHERITANCE FAILURE";
    console.log(`  ${icon}  (${bindings.length} expert(s), ${conflicts.length} failure(s))`);
    conflicts.forEach(c => console.log(`     → ${c}`));
    console.log(`  Legal basis: Meta Llama Community License §2; Jewitt et al. (2025); Mixtral (Jiang 2024)`);
    console.log(`${HR}\n`);
    return { distributionID, compliant, conflicts };
}

// ── UC-15: checkCascadingConflicts ────────────────────────────────────────────
/**
 * Walks the full chain of a distribution and aggregates ALL conflicts —
 * distillation prohibition, MoE licence inheritance, Art. 53 disclosure gap.
 * Does NOT short-circuit on first failure.
 *
 * Legal basis: EU AI Act Art. 53(1)(c); Llama Community License §2;
 *              EU Commission Draft Guidelines 19 May 2026; OWASP SCVS BOM.
 */
async function checkCascadingConflicts(terminalDistID) {
    const HR = "═".repeat(65);
    console.log(`\n${HR}`);
    console.log(`  UC-15 Cascading Conflict Check: dcat:${terminalDistID}`);
    console.log(HR);

    // Walk the full chain
    const visited = new Set();
    let current = `https://www.w3.org/ns/dcat#${terminalDistID}`;
    const chain = [];

    while (current && !visited.has(current)) {
        visited.add(current);
        const id = extractLocalID(current);
        chain.push(id);
        const q = `${PREFIXES}
SELECT ?parent
WHERE { <${current}> aimd:derivedFromDistribution ?parent . }
LIMIT 1`;
        const pb = await sparqlSelect(q);
        current = pb.length > 0 ? pb[0].parent.value : null;
    }

    console.log(`  Chain (${chain.length} hops): ${chain.join(" → ")}`);

    // Collect all conflicts from all hops without stopping on first failure
    const allConflicts = [];

    for (const distID of chain) {
        // Distillation prohibition check (UC-6 pattern)
        const c6 = await checkDistillationProhibition(distID);
        allConflicts.push(...c6.conflicts.map(c => `[Hop:${distID}][UC-6] ${c}`));

        // RLHF consent check (UC-9 pattern — may not apply to all hops)
        const c9 = await checkRLHFConsent(distID);
        allConflicts.push(...c9.conflicts.map(c => `[Hop:${distID}][UC-9] ${c}`));

        // Synthetic data disclosure check (UC-10 pattern)
        const c10 = await checkSyntheticDataDisclosure(distID);
        allConflicts.push(...c10.conflicts.map(c => `[Hop:${distID}][UC-10] ${c}`));

        // AGPL network trigger (UC-8 pattern — applicable if network deployment)
        const c8 = await checkAGPLNetworkTrigger(distID);
        allConflicts.push(...c8.conflicts.map(c => `[Hop:${distID}][UC-8] ${c}`));
    }

    // MoE inheritance on terminal distribution (UC-12 pattern)
    const c12 = await checkMoEInheritance(terminalDistID);
    allConflicts.push(...c12.conflicts.map(c => `[Terminal][UC-12] ${c}`));

    const compliant = allConflicts.length === 0;
    console.log(`\n${HR}`);
    console.log(`  Cascading Conflict Summary: ${allConflicts.length} total conflict(s)`);
    console.log(HR);
    allConflicts.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    if (compliant) console.log("  No conflicts detected across the chain.");
    console.log(`\n  Chain overall: ${compliant ? "✅ FULLY COMPLIANT" : "❌ CASCADING UNRESOLVABLE CONFLICTS"}`);
    console.log(`  Legal basis: EU AI Act Art. 53(1)(c); EU Commission Draft Guidelines 19 May 2026;`);
    console.log(`               Meta Llama Community License §2; OWASP SCVS BOM Maturity Model`);
    console.log(`${HR}\n`);

    return { terminalDistID, chain, compliant, conflicts: allConflicts };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {

    // ── 1. Policy search  (Diya's original) ───────────────────────────────────
    const dists = await searchDistributionByPolicy("http://www.w3.org/ns/odrl/2/TextToSpeechLicence");
    console.log(dists.length ? `Distributions with TTS policy: ${dists}` : "No distributions found for TTS policy.");

    // ── 2. Catalogues ─────────────────────────────────────────────────────────
    await insertCatalogue("CompA", "A catalog of open source AI models", "OpenSourceAILtd");
    for (const c of academicCatalogue) await insertCatalogue(c.catID, c.description, c.publisher);

    // ── 3. ResearchProducts ───────────────────────────────────────────────────
    for (const rp of researchProducts) {
        await insertResearchProduct(rp);
        await linkResearchProductToCatalogue("TCD-TARA", rp.id);
    }

    // ── 4. AI Model Resources ─────────────────────────────────────────────────
    for (const r of aiModelResources) await insertAIModelResource(r);

    // ── 5. CO2 Disclosures ────────────────────────────────────────────────────
    for (const [id, data] of Object.entries(co2Disclosures)) {
        await insertCO2Disclosure(id, data);
    }

    // ── 6. Copyright Policies ─────────────────────────────────────────────────
    for (const [id, data] of Object.entries(copyrightPolicies)) {
        await insertCopyrightPolicy(id, data);
    }

    // ── 7. Distributions ──────────────────────────────────────────────────────
    for (const d of distributions) {
        await insertDistribution(d.distribution, d.accessURL, d.date, {
            sourceResearchProductID: d.sourceRP,
            parentDistributionID:    d.parentDist,
            co2DisclosureID:         d.co2ID,
            copyrightPolicyNodeID:   d.cpID,
        });
    }

    // ── 8. Relationships ──────────────────────────────────────────────────────
    for (const d of distributions) await insertRelationship("CompA", d.distribution);
    for (const r of aiModelResources) await insertRelationship("CompA", r.resID);
    for (let i = 0; i < Math.min(aiModelResources.length, distributions.length); i++) {
        await insertRelationship(aiModelResources[i].resID, distributions[i].distribution);
    }
    await linkDistributionToResearchProduct("TextGenDist1.4",              "tara-paper-001");
    await linkDistributionToResearchProduct("IrishLegalLLMDist1.5",        "tara-dataset-002");

    // ── 9. Policies ───────────────────────────────────────────────────────────
    for (const p of policies) await insertPolicy(p.policy, p.accessURL);
    for (let i = 0; i < Math.min(policies.length, distributions.length); i++) {
        await assignPolicy(distributions[i].distribution, policies[i].policy);
    }

    // ── 10. Usage ─────────────────────────────────────────────────────────────
    for (const u of usage) await insertUsage(u.usage, u.organisation, u.date, u.accessURL);
    for (const u of usage) {
        for (const d of distributions) {
            if (d.distribution === "TextGenDist1.4") await assignUsage(d.distribution, u.usage);
        }
    }
    for (const r of resource1) await insertAIModelResource(r);
    for (const u of usage) for (const r of resource1) await insertUsageHasResource(u.usage, r.resID);
    for (const p of policy1) await insertPolicy(p.policy, p.accessURL);
    for (const p of policy1) for (const r of resource1) await assignPolicy(r.resID, p.policy);

    // ── 11. COMPLIANCE CHECKS  (Phase 2 — extended with v2 obligations) ───────
    console.log("\n\n" + "▓".repeat(65));
    console.log("  COMPLIANCE VERIFICATION RUNS  (aimd v3.0 + aimd2 v2.0)");
    console.log("▓".repeat(65));

    // Compliant — full CO2 + copyright disclosure
    await verifyCompliance("IrishLegalLLMDist1.5");
    await checkNewV2Obligations("IrishLegalLLMDist1.5"); // v2 extension

    // Non-compliant — missing almost everything
    await verifyCompliance("TextGenDist1.4");
    await checkNewV2Obligations("TextGenDist1.4"); // v2 extension

    // ── 12. PROVENANCE CHAIN  (Phase 3 — generalised from Diya's 2-hop) ───────
    // Replaced: await verifyProvenanceChain("LegalLLMContractAnalysisDist1.6");
    // checkNHopChain traverses the same chain iteratively with explicit hop
    // counting and returns structured per-hop results for programmatic use.
    console.log("\n\n" + "▓".repeat(65));
    console.log("  MULTI-HOP PROVENANCE CHAIN VERIFICATION  (N-hop generalisation)");
    console.log("▓".repeat(65));

    await checkNHopChain(`${DCAT_BASE}LegalLLMContractAnalysisDist1.6`);

    // ── 13. DALICC LICENCE COMPATIBILITY CHECK  (Phase 5 — new) ──────────────
    console.log("\n\n" + "▓".repeat(65));
    console.log("  PHASE 5: DALICC LICENCE COMPATIBILITY CHECK");
    console.log("▓".repeat(65));

    let daliccAvailable = false;
    try {
        await axios.get(`${DALICC_URL}/docs`, { timeout: 3000 });
        daliccAvailable = true;
    } catch (_) {
        // connection refused or timeout — DALICC not running
    }

    if (!daliccAvailable) {
        console.log("  ⚠ DALICC not running — start with: docker-compose up -d (see README_DALICC.md)");
        console.log("  Falling back to URI matching for all pairs.\n");
    }

    // Query graph for distribution/source licence pairs
    const pairsQuery = `${PREFIXES}
SELECT ?dist ?sourceLicence ?distLicence ?rpTitle
WHERE {
    ?dist a aimd:AIModelDistribution ;
          aimd:derivedFromResearchProduct ?rp ;
          dct:license ?distLicence .
    ?rp dct:license ?sourceLicence .
    OPTIONAL { ?rp dct:title ?rpTitle }
}
LIMIT 2`;
    const pairs = await sparqlSelect(pairsQuery);

    if (pairs.length === 0) {
        console.log("  ⚠️  No licence pairs found in the graph — run data population first.\n");
    } else {
        for (const p of pairs) {
            const distLabel = extractLocalID(p.dist.value);
            const rpTitle   = p.rpTitle?.value || extractLocalID(p.dist.value);
            console.log(`\n  Checking: ${distLabel} ← ${rpTitle}`);
            const result = await checkLicenceCompatibility(p.sourceLicence.value, p.distLicence.value);
            const icon = result.compatible ? "✅" : "❌";
            console.log(`  ${icon} Compatible: ${result.compatible}  (method: ${result.method})`);
            console.log(`     Source licence     : ${p.sourceLicence.value}`);
            console.log(`     Distribution licence: ${p.distLicence.value}`);
            if (result.conflicts.length > 0) {
                console.log(`     Conflicts: ${result.conflicts.join("; ")}`);
            }
            if (result.resolutionHints.length > 0) {
                console.log(`     Hints: ${result.resolutionHints.join("; ")}`);
            }
        }
    }

    // ── 14. UC INSTANCE DATA  (Phase 6 — use case chains) ────────────────────
    console.log("\n\n" + "▓".repeat(65));
    console.log("  PHASE 6: USE CASE INSTANCE DATA POPULATION  (UC-1 to UC-15)");
    console.log("▓".repeat(65));

    await insertUCInstances();

    // ── 15. USE CASE COMPLIANCE CHECKS  (Phase 7) ─────────────────────────────
    console.log("\n\n" + "▓".repeat(65));
    console.log("  PHASE 7: USE CASE COMPLIANCE CHECKS");
    console.log("▓".repeat(65));

    // UC-1: CC-BY → open research LLM (✓ expected)
    await checkNHopChain("https://www.w3.org/ns/dcat#OpenResearchLLMDist1", 2);

    // UC-2: CC-BY-NC → commercial product (✗ expected)
    await checkCommercialConflict("CommercialProductDist2");

    // UC-3: CC-BY-SA → copyleft-violating fine-tune (✗ expected)
    await checkCopyleftPropagation("CopyleftViolatingModelDist3");

    // UC-4: embargoed preprint → premature RAG ingestion (✗ expected — embargo until 2027)
    await checkEmbargoCompliance("PrematureRAGDist4");

    // UC-5: multi-source CC-BY + CC-BY-NC + CC-BY-SA → GPAI (✗ expected)
    await checkMultiSourceConflict("GPAIMultiSourceDist5");

    // UC-6: proprietary API → unauthorised distillation (✗ expected)
    await checkDistillationProhibition("UnauthorisedDistillationDist6");

    // UC-7: Apache 2.0 → MIT fine-tune (✓ expected)
    await checkNHopChain("https://www.w3.org/ns/dcat#MITStudentDist7", 2);

    // UC-8: Apache 2.0 → AGPL → network API without source (✗ expected)
    await checkAGPLNetworkTrigger("NetworkAPIDist8");

    // UC-9: open model → RLHF without consent (✗ expected)
    await checkRLHFConsent("RLHFAlignedDist9");

    // UC-10: proprietary teacher → synthetic → open model (✗ expected)
    await checkSyntheticDataDisclosure("OpenModelSyntheticDist10");

    // UC-11: retriever + corpus → RAG output (multi-asset PolicySet)
    await checkRAGPolicySet("GeneratorRAGDist11");

    // UC-12: Expert A + B + C → MoE merged (✗ expected — Llama obligation not inherited)
    await checkMoEInheritance("MoEMergedDist12");

    // UC-13: planner → executor (inference chain, ✓ expected — no training obligations)
    await checkNHopChain("https://www.w3.org/ns/dcat#ExecutorLLMDist13", 2);

    // UC-14: CC-BY corpus → base LLM → fine-tune → GPAI API (3-hop, ✓ expected)
    await checkNHopChain("https://www.w3.org/ns/dcat#GPAIAPIDist14", 4);

    // UC-15: proprietary chain → cascading unresolvable conflicts (✗ expected)
    await checkCascadingConflicts("ConsumerProductDist15");

    console.log("\nDone.");
})();
