# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #68 is merged and deployed as main commit 7c73f57d5120ce9a35e1bea42f5e1290c61e1755. [Main workflow #317](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/43591180699) passed build, deployment and live-browser checks. Production URL: https://adigun-aibible.hephzibahbehulah.com/. The latest released increment adds the Thai Freedom Bible publisher draft (66 books, 1,189 chapters, 31,103 source records); its draft status and publisher notice remain explicit. The catalog has 39 Bible editions (36 beyond baseline) across 26 source languages. This workspace prepares the next candidate: Dutch Petrus Canisius 1939, with 73 books, 1,328 chapters and 35,335 source records; eBible reports it as public domain, and its source inventory, ranges, aliases and hashes are pinned. Native-language/editorial review remains pending; AI and audio permissions are not inferred. Physical two-device offline acceptance also remains pending. Native-language/editorial review remains pending; AI and audio permissions are not inferred. Physical two-device offline acceptance also remains pending.

## Independent work to finish

1. Continue toward the 100+ additional-edition target; the current catalog has 39 Bible editions, 36 beyond its original three-edition baseline. Continue with exact identity, notices, hashes, complete coverage, reproducible imports and rights review. The static build now rejects territorial or unknown display grants before public packaging. This guards deployment but does not selectively serve content by country; implement genuine regional delivery or obtain broader rights evidence before admitting U.S.-qualified editions. Persian `pesOPV` remains deferred over identity/credit and a Psalm 121:1 archive discrepancy; Korean `kor` remains deferred over a missing 1 Peter 5 chapter and XML/TXT differences.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa and Igbo native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

