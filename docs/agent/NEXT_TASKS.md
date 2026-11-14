# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #72 is merged and deployed as main commit `54a7c795699f4d1f992c01a137598e1343b857c9`. [Main workflow #329](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/43614522208) passed production checks; receipt: build `75f7dc46af5269312b5bc9a2`, content `dbc3a3510fb5fdaa1cdd8c09`, built `2026-11-14T16:16:50.711Z`. Production: https://adigun-aibible.hephzibahbehulah.com/. Main includes 41 installed Bible editions across 26 source languages. PR #72 documents the KJV 2006 source review and defers it under the publisher's territorial restriction. PR #70 removed the visible Gen Z paraphrase/pending labels, but audit finds no standalone Gen Z corpus: the `genz` preset still resolves to WEB and only five Genesis 1:1–5 entries exist as reviewed paraphrases. The [source review](../GENZ_EDITION_SOURCE_REVIEW.md) found no eligible complete external edition and records rights constraints. AI/audio permissions, independent editorial review and physical two-device offline acceptance remain unestablished.

## Independent work to finish

1. Continue toward the 100+ additional-edition target; the current main catalog has 41 Bible editions, 38 beyond its original three-edition baseline. Continue with exact identity, notices, hashes, complete coverage, reproducible imports and rights review. The static build now rejects territorial or unknown display grants before public packaging. This guards deployment but does not selectively serve content by country; implement genuine regional delivery or obtain broader rights evidence before admitting U.S.-qualified editions. Persian `pesOPV` remains deferred over identity/credit and a Psalm 121:1 archive discrepancy; Korean `kor` remains deferred over a missing 1 Peter 5 chapter and XML/TXT differences.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa and Igbo native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

