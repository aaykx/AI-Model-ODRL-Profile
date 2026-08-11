"use strict";

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

const GRAPHDB_BASE = "http://localhost:7200";
const REPO_ID      = "AIModels";
const ENDPOINT     = `${GRAPHDB_BASE}/repositories/${REPO_ID}/statements`;

// Order matters: base ontologies before licence policies, knowledge graph last
const FILES = [
    "AIMD.ttl",
    "AIMD_extended.ttl",
    "AIMD_extended_v2.ttl",
    "OpenAccessAcademicLiscence.ttl",
    "HighRiskAILicence.ttl",
    "GPAILicence.ttl",
    "AGPLNetworkLicence.ttl",
    "ApacheMITChainLicence.ttl",
    "CascadingConflictLicence.ttl",
    "CommercialConflictLicence.ttl",
    "CopyleftPropagationLicence.ttl",
    "EmbargoedCorpusLicence.ttl",
    "InferenceChainLicence.ttl",
    "MoEMergedModelLicence.ttl",
    "OpenResearchLLMLicence.ttl",
    "ProprietaryDistillationLicence.ttl",
    "RAGPolicySetLicence.ttl",
    "RLHFAlignedModelLicence.ttl",
    "SyntheticDataDisclosureLicence.ttl",
    "AIMD_v2_knowledge_graph.ttl",
];

async function loadFile(filename) {
    const content = fs.readFileSync(path.join(__dirname, filename));
    const r = await axios.post(ENDPOINT, content, {
        headers: { "Content-Type": "text/turtle" },
        timeout: 30000,
    });
    return r.status;
}

(async () => {
    console.log(`\nLoading ${FILES.length} files into GraphDB repository "${REPO_ID}"...\n`);
    let ok = 0, fail = 0;
    for (const file of FILES) {
        try {
            const status = await loadFile(file);
            console.log(`  ✓  ${file.padEnd(40)} HTTP ${status}`);
            ok++;
        } catch (err) {
            const code = err.response?.status || err.code || "ERROR";
            console.error(`  ✗  ${file.padEnd(40)} ${code}`);
            if (err.response?.data) {
                console.error(`     ${String(err.response.data).slice(0, 200)}`);
            }
            fail++;
        }
    }
    console.log(`\n  ${ok} loaded · ${fail} failed\n`);
    if (fail > 0) process.exit(1);
})();
