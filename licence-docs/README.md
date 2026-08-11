# Licence Documentation

Explanations of all 13 new ODRL licence files created for AIMD Extended Profile v2.0.

Each file explains: what legal problem the licence solves, what the ODRL structure does, and how the compliance checker uses it.

| File | Use Case | Result | Legal Trigger |
|---|---|---|---|
| [OpenResearchLLMLicence.md](OpenResearchLLMLicence.md) | UC-1 CC-BY → open LLM | ✓ | DSM Art. 3 research TDM |
| [CommercialConflictLicence.md](CommercialConflictLicence.md) | UC-2 CC-BY-NC → commercial | ✗ | NC prohibition vs commercial actor |
| [CopyleftPropagationLicence.md](CopyleftPropagationLicence.md) | UC-3 CC-BY-SA → fine-tune | ✗ | ShareAlike obligation stripped |
| [EmbargoedCorpusLicence.md](EmbargoedCorpusLicence.md) | UC-4 Embargo → RAG | ✗ | DSM Art. 3(1) lawful access |
| [ProprietaryDistillationLicence.md](ProprietaryDistillationLicence.md) | UC-6 Proprietary → distillation | ✗ | ToS competitor prohibition |
| [ApacheMITChainLicence.md](ApacheMITChainLicence.md) | UC-7 Apache → MIT | ✓ | Permissive-to-permissive baseline |
| [AGPLNetworkLicence.md](AGPLNetworkLicence.md) | UC-8 AGPL → network API | ✗ | AGPLv3 §13 network copyleft |
| [RLHFAlignedModelLicence.md](RLHFAlignedModelLicence.md) | UC-9 RLHF consent | ✗ | GDPR Art. 6 lawful basis |
| [SyntheticDataDisclosureLicence.md](SyntheticDataDisclosureLicence.md) | UC-10 Synthetic data | ✗ | EU AI Act Art. 53(1)(c) |
| [RAGPolicySetLicence.md](RAGPolicySetLicence.md) | UC-11 RAG PolicySet | PolicySet | IDS-RAM 4.0 multi-asset |
| [MoEMergedModelLicence.md](MoEMergedModelLicence.md) | UC-12 MoE merge | ✗ | Llama MAU threshold not inherited |
| [InferenceChainLicence.md](InferenceChainLicence.md) | UC-13 Planner→Executor | ✓ | Inference-only, true negative |
| [CascadingConflictLicence.md](CascadingConflictLicence.md) | UC-15 Worst case | ✗ | 3 simultaneous unresolvable conflicts |

UC-5 (multi-source) reuses UC-1/2/3 licences. UC-14 (3-hop GPAI) reuses UC-1's licence at all hops.
