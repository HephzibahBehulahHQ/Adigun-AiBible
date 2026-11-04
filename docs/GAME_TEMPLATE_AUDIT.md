# Existing game and learning template audit

**Audit date:** 4 November 2026 (Europe/Berlin)  
**Audited product revision:** `95fa8adc0a3f943f7a68d868dd749e68aebc8b71`  
**Reference standards:** pinned `hb-AI-policy@d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e`, `hb-design-system` universal-product schema v3, `hb-evangelism` content guidance, and corporate repository ownership/scope.

## Result

**No standalone Bible game implementation was found in the audited product tree.** No dedicated game directory, game route, quiz engine, mission engine, or game-specific tests are present. Therefore there are no existing standalone games to certify as PASS or to patch into template compliance.

This is a scope finding, not a claim that the product has no learning functionality.

## Existing learning experiences (not games)

| Experience | Actual implementation | Classification | Audit result |
|---|---|---|---|
| Memorization practice | `src/workspace/MemoryTab.tsx`, `src/workspace/learning.ts` | Private study / learning tool | Partial learning flow; not a standalone game |
| Hide and reveal | Exact edition-bound source passage reveal | Memory practice mode | PASS as a practice mode; not game-certified |
| Fill the gaps | Source-derived cloze gaps, answers retained only in the session | Memory practice mode | PASS as a practice mode; not game-certified |
| Verbatim recall | Ordered token comparison with explicit limits and transparent accuracy | Memory practice mode | PASS as a recall tool; not game-certified |
| Spaced review | User-selected again/hard/good interval scheduling | Personal learning schedule | PASS as a scheduling model; no streak or faith score |
| Verse Drop | `src/VerseDrop.tsx`, six curated source passages with context, reader, bookmark and share actions | Finite reading session | PASS as a reading session; not a game |
| Reading plans | `src/workspace/learning.ts`, edition-bound scheduled reading sessions | Study planning | PASS as planning functionality; not a game |

Evidence reviewed: `src/workspace/MemoryTab.tsx`, `src/workspace/learning.ts`, `src/workspace/model.ts`, `src/VerseDrop.tsx`, `src/ToolDirectory.tsx`, `tests/workspace.test.mjs`, `docs/FEATURE_MATRIX.md`, and the canonical Version 3 specification.

## Template and policy checks

| Requirement | Evidence / decision | Result |
|---|---|---|
| Repository ownership | Product code and tests live in Adigun-AiBible; policy, design system, division guidance and corporate site remain canonical in their own repositories | PASS |
| Product identity/configuration | `product.config.json` uses schemaVersion 3, Evangelism brand key and correct product/division/reference repositories | PASS |
| Corporate and division brand | Evangelism gold `#D4AF37`, corporate navy `#0B1220`, ivory `#F8FAFC`; no alternate logo or brand is introduced by the learning modules | PASS |
| Scripture/source integrity | Memorization loads the exact saved edition and refuses incomplete/missing source wording; attribution is displayed | PASS for audited memory practice |
| Scripture vs interpretation | Source text, personal context notes and recall measurements are separately presented | PASS for audited memory practice |
| Learning measurement | Ordered word recall is explicitly described as recall, not understanding or faith; no holiness score or spiritual ranking | PASS |
| Private data | Workspace remains device-local; private answers/context notes are not transmitted to an AI provider | PASS for audited local flows |
| Accessibility | Semantic forms, labelled missing-word inputs, status/error announcements and button controls are present in the inspected implementation | Source inspection PASS; independent accessibility certification NOT TESTED |
| Localization | Product declares en/de/yo/pcm; the inspected memory practice and Verse Drop strings are English-authored and do not yet demonstrate complete localized game/learning UI | PARTIAL; native review and complete localization remain open |
| Child safety | Division guidance requires product-specific child safeguards; no standalone child-oriented game was found to inspect | NOT APPLICABLE to a nonexistent game; required before child game release |
| Game-specific tests | Workspace model tests cover recall, cloze, scheduling and data validation; no game-specific interaction suite exists | NOT APPLICABLE; future games need dedicated browser and model tests |
| Multiplayer/offline rooms | No production multiplayer game or nearby room transport exists; the feature matrix correctly records these as pending | PASS as truthful status; feature itself NOT IMPLEMENTED |
| AI capability claims | Adigun BOT is local-tools only; its UI explicitly says no generative AI service is connected | PASS; no live AI capability claimed |

## Required format for every future game

Before a future game can receive PASS, its product-owned specification, implementation and tests must include:

1. **Identity and purpose:** name, intended age range, learning objective, division/product ownership and supported languages.
2. **Gameplay contract:** instructions, start/continue/replay, rules, state transitions, completion, pause/recovery and meaningful failure/empty states.
3. **Scripture evidence:** exact source edition and passage IDs, rights checks, source attribution, preserved wording, and context access. Never generate or fabricate Scripture.
4. **Educational integrity:** distinguish recall, comprehension, historical evidence and interpretation; explain answer evidence; represent ambiguity honestly; never score holiness, salvation or divine approval.
5. **Content review:** label fictional scenarios, adaptations and commentary; require qualified human and native-language review where applicable.
6. **Privacy and safety:** local/cloud data declaration, consent and deletion, age-appropriate design, moderation for shared play, and no transmission of private writing without permission.
7. **Accessible interaction:** keyboard and screen-reader operation, semantic labels, focus handling, contrast, reduced motion and responsive layouts.
8. **Offline and device behavior:** state which features truly work offline; multiplayer must be tested between real supported devices, not simulated by a QR screen or mock transport.
9. **Design-system conformance:** consume approved tokens/assets and product configuration; no copied global policy or invented integrations.
10. **Verification:** model/unit tests for rules and scoring, browser tests for real play/recovery/accessibility/responsive behavior, content/rights validation, and release checks on the exact candidate SHA.
11. **Honest status:** each game feature is labelled implemented, partial, pending or externally gated with evidence; a prototype or fixture is never presented as a finished game.

## Corrections made

No game code was changed because no standalone game exists to correct. The audit records the distinction between current learning tools and the still-pending game experiences in Version 3. Existing learning features and personal data contracts are preserved.

## Post-audit development — 4 November 2026

- PR #12 added a guided, passage-linked interpretation challenge to private reflections. It is a self-guided study exercise, not a standalone game; no answer score or faith verdict is produced. PR checks and main deployment [41899161850](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41899161850) passed.
- PR #14 added the first decision-simulation pilot: a fictional workplace-report scenario with three meaningful choices, plausible consequences, competing considerations, exact selected-edition passage links (Proverbs 12:22, Ephesians 4:25 and James 1:19), optional follow-up actions, replay and a private reflection saved to the existing device-local workspace. The pilot is English-only and for adult study use. It labels the scenario as fiction, never copies or generates Scripture, has no holiness score or divine-outcome prediction, and uses no AI/cloud service. PR CI [41900211198](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41900211198) and main deployment [41900926485](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41900926485) passed.
- PR #15 added written, edition-bound retelling practice to the existing memorization flow. It preserves exact source passage access, stores user-authored retellings locally, supports deletion and workspace backups, and distinguishes paraphrase from verbatim recall. It does not claim speech recognition, automatic correction or generative AI coaching. PR CI [41901405361](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41901405361) passed; main deployment [41901945519](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41901945519) is pending.

These are bounded learning increments, not completion of the games roadmap. Additional decision scenarios need content review; Nigerian parables require qualified cultural/native-language review; the translation simulator remains gated on licensed lexical/morphology/alignment data. Multiplayer rooms and 3D reconstructions remain unimplemented.

## Next plan

Continue M7 only where local source, privacy and accessibility behavior can be proven. Voice recording, transcription, automatic correction and Pidgin/Yorùbá/Hausa/Igbo speech support require a real permitted service and native-language review. Expand M8 decision simulations only with reviewed scenarios. Keep parables, translation simulation, blind/reveal modes and multiplayer rooms separately marked pending or externally gated until their source, rights, review, accessibility, safety and real-device requirements pass.
