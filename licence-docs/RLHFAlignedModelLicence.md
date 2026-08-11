# RLHFAlignedModelLicence.ttl

**Use Case:** UC-9 — Open Model → RLHF on User Interaction Logs → Aligned Successor  
**Expected Result:** ✗ RLHF CONSENT MISSING  
**Legal Basis:** GDPR Art. 6/13/14; EU AI Act Art. 10; C2PA Content Credentials

---

## What Problem This Licence Solves

Reinforcement Learning from Human Feedback (RLHF) — the technique used in ChatGPT, Claude, and most modern aligned LLMs — involves training on records of human interactions with the model: what users said, how they rated responses, what preferences were expressed. This data is **personal data** under GDPR if it can be linked to identifiable individuals (which interaction logs usually can).

GDPR Art. 6 requires a **lawful basis** for processing personal data. Art. 6(1)(a) consent is the most natural basis for RLHF — users interacting with a service should be told their interactions may be used for training and given the option to opt out. Arts. 13 and 14 require transparency notices at the point of data collection.

The problem this use case models: a company has written a perfectly compliant RLHF data policy document (`rlhfDataPolicy`), but has not actually collected and recorded user consent (`userConsentStatus` is absent). The policy exists; the consent does not. This distinction — policy declaration vs. consent verification — is what makes UC-9 novel.

---

## What the File Contains

The file defines a single ODRL `Policy` with **one consent-gated permission**, **one prohibition** (RLHF without valid consent), and **one unconditional prohibition** (RLHF with no consent declaration at all).

### Permission — RLHF Training With Valid Consent

```turtle
odrl:permission [
    odrl:action aimd2:RLHFTraining ;
    odrl:constraint [
        aimd2:userConsentStatus odrl:eq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#ConsentGiven>
    ] ;
    odrl:duty [ odrl:action aimd2:DeclareRLHFDataUse ] ;   # GDPR Art. 13/14 transparency notice
    odrl:duty [ odrl:action aimd2:ComplyWithArticle50 ] ;  # EU AI Act Art. 50 disclosure
]
```

RLHF training is permitted when `userConsentStatus` equals `ConsentGiven`. The duty `DeclareRLHFDataUse` requires a public `rlhfDisclosureURL` — a transparency notice explaining what data was collected and how it was used (GDPR Art. 13/14). The duty `ComplyWithArticle50` requires an `article50PolicyURL`.

### Prohibition 1 — RLHF With Withdrawn or Invalid Consent

```turtle
odrl:prohibition [
    odrl:action aimd2:RLHFTraining ;
    odrl:constraint [
        aimd2:userConsentStatus odrl:neq <https://raw.githubusercontent.com/aaykx/AI-Model-ODRL-Profile/main/AIMD_extended_v2.ttl#ConsentGiven>
    ] ;
]
```

If `userConsentStatus` is present but its value is not `ConsentGiven` (e.g. `"withdrawn"` or `"not-applicable"`), RLHF training is prohibited.

### Prohibition 2 — RLHF With No Consent Declaration (the UC-9 trigger)

```turtle
odrl:prohibition [
    odrl:action aimd2:RLHFTraining ;
    # no constraint — fires when userConsentStatus is entirely absent
]
```

This is the critical prohibition. It has **no constraint** — it fires unconditionally. The checker interprets "no `userConsentStatus` property at all" as matching this unconstrained prohibition. In the test distribution `RLHFAlignedDist9`, the `rlhfDataPolicy` is declared but `userConsentStatus` is intentionally absent — this prohibition triggers.

The two-prohibition structure (one for wrong value, one for missing property) ensures the checker catches both cases without needing special null-handling logic.

---

## The Policy vs. Consent Distinction

The test distribution `RLHFAlignedDist9` carries:
- `aimd2:rlhfDataPolicy <https://example.com/uc9/rlhf-policy>` ← policy document exists
- No `aimd2:userConsentStatus` ← consent not recorded

A system that only checked "does an rlhfDataPolicy exist?" would return compliant. The licence and checker are designed to require the separate `userConsentStatus` property, modelling the difference between having a written GDPR policy and actually having collected consent.

---

## How the Checker Uses This File

`checkRLHFConsent("RLHFAlignedDist9")`:
1. Finds `aimd2:rlhfDataPolicy` present → RLHF is claimed to have been performed
2. Looks for `aimd2:userConsentStatus "given"` → **absent**
3. Detects the unconstrained prohibition on `aimd2:RLHFTraining`
4. Returns `compliant: false`, `conflict: "rlhf-consent: userConsentStatus absent — GDPR Art. 6 lawful basis unmet"`

---

## ODRL Terms Used

| Term | Type | Role in this Policy |
|---|---|---|
| `aimd2:RLHFTraining` | `odrl:Action` | The governed activity |
| `aimd2:userConsentStatus` | `odrl:LeftOperand` | GDPR Art. 6 consent status gate |
| `aimd2:DeclareRLHFDataUse` | `odrl:Action` (duty) | GDPR Art. 13/14 transparency notice |
| `aimd2:ComplyWithArticle50` | `odrl:Action` (duty) | EU AI Act disclosure |
| `aimd2:propagatesObligationTo` | `rdf:Property` | Consent obligation flows downstream |
