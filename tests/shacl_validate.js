"use strict";
/**
 * shacl_validate.js — cross-checks the live GraphDB knowledge-graph state
 * (exported fresh from the AIModels repository) against AIMD_v2_shapes.ttl,
 * using shacl-engine (pure JS, full SPARQL-constraint support, no Apache
 * Jena dependency).
 *
 * Run: node tests/shacl_validate.js
 */
const fs = require("fs");
const path = require("path");
function req(id) {
  const m = require(id);
  return m && m.default ? m.default : m;
}
const rdfExt = req("rdf-ext");
const N3 = require("n3");
const { Validator } = require("shacl-engine");
const { targetResolvers, validations } = require("shacl-engine/sparql.js");

function parseTurtleFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const parser = new N3.Parser();
  const dataset = rdfExt.dataset();
  for (const quad of parser.parse(content)) {
    dataset.add(quad);
  }
  return dataset;
}

async function main() {
  const shapesPath = path.join(__dirname, "..", "AIMD_v2_shapes.ttl");
  const dataPath = path.join(__dirname, "live_graph_export.ttl");

  console.log("Loading shapes:", shapesPath);
  const shapesDataset = parseTurtleFile(shapesPath);
  console.log("Shapes quads:", shapesDataset.size);

  // aimd2:RAGPolicySetShape's sh:sparql constraint uses `$this` inside a
  // GROUP BY/HAVING clause -- valid, spec-documented SHACL-SPARQL, but it
  // trips a real bug in shacl-engine's underlying Comunica query engine
  // ("Tried to bind variable ?this in a GROUP BY operator"). Excise just
  // this one shape so the other 17 can still be validated, and report the
  // exclusion explicitly rather than silently.
  const { namedNode } = rdfExt;
  const ragShapeNode = namedNode(
    "https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#RAGPolicySetShape"
  );
  const excisedNodes = new Set([ragShapeNode.value]);
  // find blank-node objects reachable from the excised shape (its inline sh:sparql node)
  for (const quad of shapesDataset.match(ragShapeNode)) {
    if (quad.object.termType === "BlankNode") excisedNodes.add(quad.object.value);
  }
  let excisedCount = 0;
  for (const quad of [...shapesDataset]) {
    if (excisedNodes.has(quad.subject.value)) {
      shapesDataset.delete(quad);
      excisedCount++;
    }
  }
  console.log(
    `Excised ${excisedCount} triples for aimd2:RAGPolicySetShape (Comunica $this/GROUP BY incompatibility) -- remaining shapes quads:`,
    shapesDataset.size
  );

  console.log("Loading live graph export:", dataPath);
  const dataDataset = parseTurtleFile(dataPath);
  console.log("Data quads:", dataDataset.size);

  const validator = new Validator(shapesDataset, {
    factory: rdfExt,
    targetResolvers,
    validations,
  });

  const report = await validator.validate({ dataset: dataDataset });

  console.log("\nConforms:", report.conforms);
  console.log("Result count:", report.results.length);

  const results = report.results.map((r) => ({
    focusNode: r.focusNode ? r.focusNode.value : null,
    path: r.path ? r.path.value : null,
    message: (r.message || []).map((m) => m.value).join("; "),
    severity: r.severity ? r.severity.value : null,
    sourceShape: r.shape && r.shape.ptr ? r.shape.ptr.value : (r.source ? r.source.value : null),
  }));

  for (const r of results) {
    console.log("---");
    console.log(JSON.stringify(r, null, 2));
  }

  const outPath = path.join(__dirname, "shacl_violations.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ conforms: report.conforms, count: results.length, results }, null, 2)
  );
  console.log("\nWrote", outPath);
}

main().catch((err) => {
  console.error("SHACL validation failed:", err);
  process.exit(1);
});
