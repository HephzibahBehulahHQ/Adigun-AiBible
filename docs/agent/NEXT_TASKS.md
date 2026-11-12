# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #51 is merged and deployed at source `4a6f60a695770116cfa3bf67652b563826758def`. Main workflow 43310225711 passed source/build validation, desktop/mobile browser checks, five persistence repetitions, Pages deployment, exact-source verification and live smoke. The public receipt at `2026-11-12T21:28:48.858Z` records build `1377c462f8a6ddd2ccd73882` and content `985046564185b7f76b45857d`. This was a documentation-only deployment; PR #50's *Bib La*, Haitian Creole Bible 1985 remains the latest application import. Main currently has 32 Bible editions (29 beyond the original three-edition baseline). PR #48, #47, #45 and #44 remain in the release history; physical two-device offline acceptance for cooperative play is still pending. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the full receipt.

## Independent work to finish

1. Candidate work imports the Croatian *Sveta Biblija* (Ivan Šarić) as `hrv-saric`, retaining the publisher's 73-book order and `ESG` identifier for Esther. Its pinned archive has 1,328 chapters and 35,448 records; seven non-monotonic source verse sequences and 29 bracket-only format differences are explicitly recorded. The edition-specific profile does not claim one canon for all traditions. Focused source checks pass; finish candidate browser/CI gates, merge, deploy and verify the exact receipt before counting it as the 33rd installed edition. See [the source record](../CROATIAN_SARIC_IMPORT.md).
2. Continue toward the 100+ additional-edition target beyond the 32 installed Bible editions in main (33 if the Croatian candidate is released), with complete manifests, exact source revisions and distinct edition identities. BPC French Darby 2024, Simple Spanish 2026 and the CC BY-SA 4.0 Tandroy publisher draft retain different rights and numbering. Provider metadata alone is not a usable Bible edition.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa/Igbo and native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

