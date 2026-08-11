"use strict";
const axios = require("axios");
const SPARQL_ENDPOINT = "http://localhost:7200/repositories/AIModels";
const PREFIXES = `
PREFIX dcat: <https://www.w3.org/ns/dcat#>
PREFIX aimd2: <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#>
`;

async function sparqlSelect(query) {
  const r = await axios.post(SPARQL_ENDPOINT, `query=${encodeURIComponent(query)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return r.data.results.bindings;
}

// Mirrors server_v2.js's checkEmbargoCompliance() logic exactly (real wall-clock `today`).
async function checkEmbargo(distId, today = new Date()) {
  const b = await sparqlSelect(`${PREFIXES}\nSELECT ?e WHERE { dcat:${distId} aimd2:EmbargoEndDate ?e . }`);
  if (b.length === 0) return { distId, compliant: true, reason: "no embargo declared" };
  const endDate = new Date(b[0].e.value);
  const compliant = today >= endDate;
  return {
    distId,
    compliant,
    reason: compliant
      ? `today (${today.toISOString().slice(0, 10)}) >= EmbargoEndDate (${b[0].e.value}) -- embargo lapsed`
      : `today (${today.toISOString().slice(0, 10)}) < EmbargoEndDate (${b[0].e.value}) -- embargo active`,
  };
}

(async () => {
  console.log("--- Pre-embargo case (PrematureRAGDist4, EmbargoEndDate=2027-06-30) ---");
  console.log(await checkEmbargo("PrematureRAGDist4"));
  console.log("\n--- Post-embargo counterfactual (PostEmbargoRAGTestDist4b, EmbargoEndDate=2025-01-01) ---");
  console.log(await checkEmbargo("PostEmbargoRAGTestDist4b"));
})();
