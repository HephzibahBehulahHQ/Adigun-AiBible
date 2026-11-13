# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #63 is merged and deployed at source `f80f97df9a1a55a2dfa69e4ed7ad0f0c8aa8175b`. Main workflow 43384293395 passed production validation, desktop/mobile browser checks, persistence, Pages deployment, exact-source verification and live desktop/mobile Chromium smoke. The public receipt at `2026-11-13T07:16:31.536Z` records build `e2ba3ff5dfa3e38e7dce4c0f` and content `b5b7bc1cb5db7fe1daf00b2d`. Production has 36 Bible editions (33 additional) across 24 source languages, including publisher-pinned Hausa 2020 and Igbo 2020 full Bibles and the Duya New Testament. PR #56 requires exact active worldwide display rights at build time; country-selective delivery remains unavailable. Native-language/editorial and product-wide AI review are not implied by display rights. Physical two-device offline acceptance remains pending.

## Independent work to finish

1. Continue toward the 100+ additional-edition target; the current catalog has 36 Bible editions, 33 beyond its original three-edition baseline. Continue with with exact identity, notices, hashes, complete coverage, reproducible imports and rights review. The static build now rejects territorial or unknown display grants before public packaging. This guards deployment but does not selectively serve content by country; implement genuine regional delivery or obtain broader rights evidence before admitting U.S.-qualified editions. Persian `pesOPV` remains deferred over identity/credit and a Psalm 121:1 archive discrepancy; Korean `kor` remains deferred over a missing 1 Peter 5 chapter and XML/TXT differences.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa and Igbo native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

