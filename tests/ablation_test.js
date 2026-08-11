"use strict";
/**
 * tests/ablation_test.js
 *
 * Builds the previously-missing aimd2:AITraining owl:sameAs odrl:ai-training
 * and aimd2:AIInference owl:sameAs odrl:ai-augment bridge, then runs the
 * standard-vs-custom-term substitution ablation described in
 * evaldesign.tex sec:standard-vs-custom-ablation, exactly as checkNewV2Obligations()
 * resolves action terms in server_v2.js (filter by action URI, fetch
 * aimd:evidenceProperty/severity/checkDescription).
 *
 * Tests TWO substitution strategies:
 *   (1) naive: swap the FILTER to match the odrl: URI directly, relying on
 *       the reasoner to know aimd2:AITraining and odrl:ai-training denote
 *       the same action (this is what "automatic reasoning" would need to do)
 *   (2) bridge-aware: explicitly traverse the asserted owl:sameAs triple in
 *       the query itself, not relying on reasoner inference
 *
 * Run: node tests/ablation_test.js
 */
const axios = require("axios");
const Q = "http://localhost:7200/repositories/AIModels";
const U = "http://localhost:7200/repositories/AIModels/statements";
const P = `
PREFIX aimd:  <https://raw.githubusercontent.com/ci2me/AI-Model-Distribution-ODRL-Profile/main/AIMD.ttl#>
PREFIX aimd2: <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#>
PREFIX odrl:  <http://www.w3.org/ns/odrl/2/>
PREFIX owl:   <http://www.w3.org/2002/07/owl#>
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
`;

async function sel(q) {
  const r = await axios.post(Q, "query=" + encodeURIComponent(q), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return r.data.results ? r.data.results.bindings : r.data.boolean;
}
async function upd(q) {
  await axios.post(U, "update=" + encodeURIComponent(q), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

const baselineQuery = (term) => `${P}
SELECT ?action ?evidenceProp ?severity ?checkDesc WHERE {
  ?action a odrl:Action ; aimd:evidenceProperty ?evidenceProp .
  FILTER(?action = ${term})
  OPTIONAL { ?action aimd:severity ?severity }
  OPTIONAL { ?action aimd:checkDescription ?checkDesc }
}`;

const naiveSubstitutedQuery = (odrlTerm) => `${P}
SELECT ?action ?evidenceProp ?severity ?checkDesc WHERE {
  ?action a odrl:Action ; aimd:evidenceProperty ?evidenceProp .
  FILTER(?action = ${odrlTerm})
  OPTIONAL { ?action aimd:severity ?severity }
  OPTIONAL { ?action aimd:checkDescription ?checkDesc }
}`;

const bridgeAwareQuery = (odrlTerm) => `${P}
SELECT ?action ?evidenceProp ?severity ?checkDesc WHERE {
  ?action a odrl:Action ; aimd:evidenceProperty ?evidenceProp ; owl:sameAs ${odrlTerm} .
  OPTIONAL { ?action aimd:severity ?severity }
  OPTIONAL { ?action aimd:checkDescription ?checkDesc }
}`;

(async () => {
  console.log("=== Step 0: confirm bridge does not yet exist ===");
  console.log((await sel(`${P} ASK { aimd2:AITraining owl:sameAs odrl:ai-training }`)));

  console.log("\n=== Step 1: BASELINE — aimd2:AITraining / aimd2:AIInference resolve normally ===");
  const baseTraining = await sel(baselineQuery("aimd2:AITraining"));
  const baseInference = await sel(baselineQuery("aimd2:AIInference"));
  console.log("aimd2:AITraining  ->", JSON.stringify(baseTraining));
  console.log("aimd2:AIInference ->", JSON.stringify(baseInference));

  console.log("\n=== Step 2: NAIVE substitution BEFORE bridge exists (odrl:ai-training / odrl:ai-augment) ===");
  console.log("odrl:ai-training  ->", JSON.stringify(await sel(naiveSubstitutedQuery("odrl:ai-training"))));
  console.log("odrl:ai-augment   ->", JSON.stringify(await sel(naiveSubstitutedQuery("odrl:ai-augment"))));

  console.log("\n=== Step 3: build the bridge (owl:sameAs, since both terms are odrl:Action individuals, not classes) ===");
  await upd(`${P} INSERT DATA {
    aimd2:AITraining owl:sameAs odrl:ai-training .
    aimd2:AIInference owl:sameAs odrl:ai-augment .
  }`);
  const c = await sel(`${P} SELECT (COUNT(*) as ?c) WHERE {?s ?p ?o}`);
  console.log("triple count after bridge insert:", c[0].c.value);

  console.log("\n=== Step 4: NAIVE substitution AFTER bridge exists (tests automatic reasoner inference) ===");
  const naiveTraining = await sel(naiveSubstitutedQuery("odrl:ai-training"));
  const naiveInference = await sel(naiveSubstitutedQuery("odrl:ai-augment"));
  console.log("odrl:ai-training  ->", JSON.stringify(naiveTraining));
  console.log("odrl:ai-augment   ->", JSON.stringify(naiveInference));

  console.log("\n=== Step 5: BRIDGE-AWARE substitution (explicit owl:sameAs traversal in the query itself) ===");
  const bridgeTraining = await sel(bridgeAwareQuery("odrl:ai-training"));
  const bridgeInference = await sel(bridgeAwareQuery("odrl:ai-augment"));
  console.log("odrl:ai-training  ->", JSON.stringify(bridgeTraining));
  console.log("odrl:ai-augment   ->", JSON.stringify(bridgeInference));

  console.log("\n=== Step 6: revert bridge ===");
  await upd(`${P} DELETE DATA {
    aimd2:AITraining owl:sameAs odrl:ai-training .
    aimd2:AIInference owl:sameAs odrl:ai-augment .
  }`);
  const c2 = await sel(`${P} SELECT (COUNT(*) as ?c) WHERE {?s ?p ?o}`);
  console.log("triple count after revert:", c2[0].c.value, c2[0].c.value === "3830" ? "(matches baseline ✓)" : "(MISMATCH ✗)");

  console.log("\n=== SUMMARY ===");
  console.log("Naive substitution before bridge existed: 0 results (expected — no bridge, no reasoning to invent one)");
  console.log("Naive substitution after bridge exists   :", naiveTraining.length + naiveInference.length, "results (tests whether rdfsplus-optimized ruleset + disableSameAs=true auto-propagates equivalence)");
  console.log("Bridge-aware substitution after bridge    :", bridgeTraining.length + bridgeInference.length, "results (tests whether an explicit query-time join recovers equivalence without relying on the reasoner)");
})();
