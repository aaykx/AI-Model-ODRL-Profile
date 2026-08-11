"use strict";
/**
 * tests/counterfactual_verification.js
 *
 * Applies the 9 remaining minimal-fix counterfactuals from
 * Appendix A4 (UC-2, UC-3, UC-5, UC-6, UC-8, UC-9, UC-10, UC-12, UC-15),
 * re-queries each use case's exact evaluation_suite.js E-check pattern
 * before and after, confirms the verdict flips, then reverts every edit
 * and confirms the graph is back to its documented 3,830-triple baseline.
 *
 * Run: node tests/counterfactual_verification.js
 */
const axios = require("axios");
const SPARQL_QUERY = "http://localhost:7200/repositories/AIModels";
const SPARQL_UPDATE = "http://localhost:7200/repositories/AIModels/statements";

const P = `
PREFIX dcat: <https://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX aimd: <https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#>
PREFIX aimd2: <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#>
`;

async function sSelect(q) {
  const r = await axios.post(SPARQL_QUERY, "query=" + encodeURIComponent(q), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return r.data.results.bindings;
}
async function sAsk(q) {
  const r = await axios.post(SPARQL_QUERY, "query=" + encodeURIComponent(q), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return r.data.boolean;
}
async function update(q) {
  await axios.post(SPARQL_UPDATE, "update=" + encodeURIComponent(q), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}
async function tripleCount() {
  const b = await sSelect("SELECT (COUNT(*) as ?c) WHERE { ?s ?p ?o }");
  return parseInt(b[0].c.value, 10);
}

// ── Check predicates, verbatim from tests/evaluation_suite.js's E-0n logic ──
const checks = {
  "E-02 (UC-2)": async () =>
    (await sSelect(`${P} SELECT ?a WHERE { dcat:CommercialProductDist2 aimd2:actorType ?a ; aimd:derivedFromDistribution ?p . ?p dct:license <https://example.com/policy/CommercialConflictLicence> . }`))
      .some((r) => r.a?.value === "commercial"),
  "E-03 (UC-3)": async () =>
    (await sSelect(`${P} SELECT (BOUND(?dl) AS ?has) WHERE { dcat:CopyleftViolatingModelDist3 aimd:derivedFromDistribution ?p . ?p dct:license <https://example.com/policy/CopyleftPropagationLicence> . OPTIONAL { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI ?dl } }`))
      .some((r) => r.has?.value === "false"),
  "E-05 (UC-5)": async () => {
    const b = await sSelect(`${P} SELECT (COUNT(?p) AS ?cnt) ?a WHERE { dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p ; aimd2:actorType ?a . } GROUP BY ?a`);
    const ncP = await sAsk(`${P} ASK { dcat:GPAIMultiSourceDist5 aimd:derivedFromDistribution ?p . ?p dct:license <https://example.com/policy/CommercialConflictLicence> . }`);
    const cnt = parseInt(b[0]?.cnt?.value || "0", 10);
    return cnt >= 3 && b[0]?.a?.value === "commercial" && ncP;
  },
  "E-06 (UC-6)": async () => {
    const b = await sSelect(`${P} SELECT ?a (BOUND(?dl) AS ?has) WHERE { dcat:UnauthorisedDistillationDist6 aimd2:actorType ?a ; aimd:derivedFromDistribution ?p . ?p dct:license <https://example.com/policy/ProprietaryDistillationLicence> . OPTIONAL { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI ?dl } }`);
    const l1 = b.some((r) => r.a?.value === "competitor");
    const l2 = b.some((r) => r.has?.value === "false");
    return l1 && l2;
  },
  "E-08 (UC-8)": async () =>
    (await sSelect(`${P} SELECT ?ctx (BOUND(?w) AS ?hasW) WHERE { dcat:NetworkAPIDist8 aimd2:deploymentContext ?ctx . OPTIONAL { dcat:NetworkAPIDist8 aimd2:modelWeightsURL ?w } }`))
      .some((r) => r.ctx?.value === "network" && r.hasW?.value === "false"),
  "E-09 (UC-9)": async () =>
    (await sSelect(`${P} SELECT ?pol (BOUND(?cs) AS ?hasCs) WHERE { dcat:RLHFAlignedDist9 aimd2:rlhfDataPolicy ?pol . OPTIONAL { dcat:RLHFAlignedDist9 aimd2:userConsentStatus ?cs } }`))
      .some((r) => !!r.pol?.value && r.hasCs?.value === "false"),
  "E-10 (UC-10)": async () =>
    (await sSelect(`${P} SELECT ?m (BOUND(?a50) AS ?hasA50) WHERE { dcat:OpenModelSyntheticDist10 aimd2:dataGenerationMethod ?m . OPTIONAL { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL ?a50 } }`))
      .some((r) => r.m?.value === "synthetic-from-proprietary-teacher" && r.hasA50?.value === "false"),
  "E-12 (UC-12)": async () =>
    (await sSelect(`${P} SELECT ?eL ?mL WHERE { dcat:MoEMergedDist12 dct:license ?mL ; aimd:derivedFromDistribution ?e . ?e dct:license ?eL . FILTER(?eL = <https://example.com/policy/MoEMergedModelLicence>) }`))
      .some((r) => r.eL?.value === "https://example.com/policy/MoEMergedModelLicence" && r.mL?.value !== "https://example.com/policy/MoEMergedModelLicence"),
  "E-15 (UC-15) conflict-type count": async () => {
    const c1 = await sAsk(`${P} ASK { ?d aimd2:actorType "competitor" . VALUES ?d { dcat:DistillationDist15 dcat:ClosedModelDist15 } }`);
    const c2 = await sAsk(`${P} ASK { dcat:ConsumerProductDist15 aimd2:dataGenerationMethod "synthetic-from-proprietary-teacher" . FILTER NOT EXISTS { dcat:ConsumerProductDist15 aimd2:article50PolicyURL ?u } }`);
    const c3 = await sAsk(`${P} ASK { dcat:MoEMergeStepDist15 aimd:derivedFromDistribution ?e . ?e dct:license <https://example.com/policy/MoEMergedModelLicence> . FILTER NOT EXISTS { dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence> } } `);
    return [c1, c2, c3].filter(Boolean).length;
  },
};

const fixes = `${P}
DELETE DATA { dcat:CommercialProductDist2 aimd2:actorType "commercial" . } ;
INSERT DATA { dcat:CommercialProductDist2 aimd2:actorType "research" . } ;
INSERT DATA { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI <https://creativecommons.org/licenses/by-sa/4.0/> . } ;
DELETE DATA { dcat:GPAIMultiSourceDist5 aimd2:actorType "commercial" . } ;
INSERT DATA { dcat:GPAIMultiSourceDist5 aimd2:actorType "research" . } ;
INSERT DATA { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI <https://example.com/policy/ProprietaryDistillationLicence> . } ;
INSERT DATA { dcat:NetworkAPIDist8 aimd2:modelWeightsURL <https://example.com/weights/agpl-fine-tune-dist8> . } ;
INSERT DATA { dcat:RLHFAlignedDist9 aimd2:userConsentStatus "given" . } ;
INSERT DATA { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL <https://example.com/art50/open-model-synthetic-dist10> . } ;
DELETE DATA { dcat:MoEMergedDist12 dct:license <https://example.com/policy/OpenResearchLLMLicence> . } ;
INSERT DATA { dcat:MoEMergedDist12 dct:license <https://example.com/policy/MoEMergedModelLicence> . } ;
INSERT DATA { dcat:ConsumerProductDist15 aimd2:article50PolicyURL <https://example.com/art50/consumer-product-dist15> . } ;
INSERT DATA { dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence> . }
`;

const reverts = `${P}
DELETE DATA { dcat:CommercialProductDist2 aimd2:actorType "research" . } ;
INSERT DATA { dcat:CommercialProductDist2 aimd2:actorType "commercial" . } ;
DELETE DATA { dcat:CopyleftViolatingModelDist3 aimd2:downstreamLicenceURI <https://creativecommons.org/licenses/by-sa/4.0/> . } ;
DELETE DATA { dcat:GPAIMultiSourceDist5 aimd2:actorType "research" . } ;
INSERT DATA { dcat:GPAIMultiSourceDist5 aimd2:actorType "commercial" . } ;
DELETE DATA { dcat:UnauthorisedDistillationDist6 aimd2:derivedModelLicenceURI <https://example.com/policy/ProprietaryDistillationLicence> . } ;
DELETE DATA { dcat:NetworkAPIDist8 aimd2:modelWeightsURL <https://example.com/weights/agpl-fine-tune-dist8> . } ;
DELETE DATA { dcat:RLHFAlignedDist9 aimd2:userConsentStatus "given" . } ;
DELETE DATA { dcat:OpenModelSyntheticDist10 aimd2:article50PolicyURL <https://example.com/art50/open-model-synthetic-dist10> . } ;
DELETE DATA { dcat:MoEMergedDist12 dct:license <https://example.com/policy/MoEMergedModelLicence> . } ;
INSERT DATA { dcat:MoEMergedDist12 dct:license <https://example.com/policy/OpenResearchLLMLicence> . } ;
DELETE DATA { dcat:ConsumerProductDist15 aimd2:article50PolicyURL <https://example.com/art50/consumer-product-dist15> . } ;
DELETE DATA { dcat:MoEMergeStepDist15 dct:license <https://example.com/policy/MoEMergedModelLicence> . }
`;

async function runAll(label) {
  console.log(`\n--- ${label} ---`);
  const out = {};
  for (const [name, fn] of Object.entries(checks)) {
    out[name] = await fn();
    console.log(`  ${name}: ${JSON.stringify(out[name])}`);
  }
  return out;
}

(async () => {
  const baselineCount = await tripleCount();
  console.log("Baseline triple count:", baselineCount);

  const before = await runAll("BEFORE (documented baseline, all should be non-compliant / high conflict count)");

  console.log("\nApplying 9 minimal fixes...");
  await update(fixes);

  const after = await runAll("AFTER fixes (all should flip to compliant / lower conflict count)");

  console.log("\nReverting all 9 fixes...");
  await update(reverts);

  const reverted = await runAll("REVERTED (should exactly match BEFORE)");
  const revertedCount = await tripleCount();
  console.log("\nReverted triple count:", revertedCount, revertedCount === baselineCount ? "(matches baseline ✓)" : "(MISMATCH ✗)");

  console.log("\n=== SUMMARY ===");
  for (const name of Object.keys(checks)) {
    const flipped = name.includes("E-15")
      ? after[name] < before[name]
      : before[name] === true && after[name] === false;
    const restored = JSON.stringify(reverted[name]) === JSON.stringify(before[name]);
    console.log(`${name}: before=${JSON.stringify(before[name])} after=${JSON.stringify(after[name])} flipped=${flipped} revertedOk=${restored}`);
  }
})();
