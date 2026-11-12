# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #48 is merged and deployed at source `ed9476e44099b85ad44654cf6042f2fa8a211169`. Main workflow 43291925336 passed source/build validation, desktop/mobile browser checks, persistence, Pages deployment and live smoke. The public receipt at `2026-11-12T19:49:32.644Z` records build `b3b52a50e1f8aa94aa9e44a3` and content `8147910b08d903da296e249e`. It imports the source-pinned Douay-Rheims American Edition of 1899 as a 73-book readable edition. The library now has 31 Bible editions, 28 beyond the original three-edition baseline. PR #47, #45 and #44 remain in the release history; physical two-device offline acceptance for cooperative play is still pending. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the full receipt.

## Independent work to finish

1. Inspect the 110-entry edition acquisition inventory and identify one distinct full Bible source that can pass exact identity, publisher-notice, rights, reproducible-import, size and browser gates. Do not treat an inventory label or provider ID as proof of a usable edition. Continue toward 100+ additional editions in individually verified batches.
2. Continue toward the 100+ additional-edition target beyond the 31 installed Bible editions, with complete manifests, exact source revisions and distinct edition identities. BPC French Darby 2024, Simple Spanish 2026 and the CC BY-SA 4.0 Tandroy publisher draft retain different rights and numbering. Provider metadata alone is not a usable Bible edition.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa/Igbo and native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

