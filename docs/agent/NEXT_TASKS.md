# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #60 is merged and deployed at source `3cb1fe2374bf5e0fcafa909bb6de5dfa1f7ac580`. Main workflow 43365223314 passed production validation, desktop/mobile browser checks, persistence, Pages deployment, exact-source verification and live desktop/mobile Chromium smoke. The public receipt at `2026-11-13T04:35:48.285Z` records build `dd9fb5a7191d271b3572d9ac` and content `731ec02f0d29768381e269e1`. Main has 35 Bible editions (32 additional) across 23 source languages, including publisher-pinned Hausa 2020 and Igbo 2020 editions. PR #56 requires exact active worldwide display rights at build time; country-selective delivery remains unavailable. Native-language/editorial and product-wide AI review are not implied by display rights. Physical two-device offline acceptance remains pending.

## Independent work to finish

1. Continue toward the 100+ additional-edition target beyond the 34 installed Bible editions, with exact identity, notices, hashes, complete coverage, reproducible imports and rights review. The static build now rejects territorial or unknown display grants before public packaging. This guards deployment but does not selectively serve content by country; implement genuine regional delivery or obtain broader rights evidence before admitting U.S.-qualified editions. Persian `pesOPV` remains deferred over identity/credit and a Psalm 121:1 archive discrepancy; Korean `kor` remains deferred over a missing 1 Peter 5 chapter and XML/TXT differences.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa and Igbo native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

