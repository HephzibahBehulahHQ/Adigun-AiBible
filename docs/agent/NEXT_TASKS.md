# Version 3 continuation

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current exact production revision. The [requirement matrix](../FEATURE_MATRIX.md) separates implementation, content, review and live-service acceptance.

## Current release

PR #73 is merged and deployed as main commit `8da4a668f7d74198267c84c18c57829af554e5d9`. Main workflow #331 (43617616738) passed build, deployment and live-browser checks; production receipt: build `75f7dc46af5269312b5bc9a2`, content `dbc3a3510fb5fdaa1cdd8c09`, built `2026-11-14T16:50:49.685Z`. Production: https://adigun-aibible.hephzibahbehulah.com/. Main has 41 installed Bible editions. The project owner directed us to create the original Adigun Gen Z Bible from WEB across all 66 books; Genesis 1–5 (138 verses) are staged at `content/genz/ot/GEN/01.json`. Old and New Testament authoring use disjoint paths in [AGENTS.md](../../AGENTS.md). The complete corpus, edition integration and reader migration remain active.

## Independent work to finish

1. Continue toward the 100+ additional-edition target; the current main catalog has 41 Bible editions, 38 beyond its original three-edition baseline. Continue with exact identity, notices, hashes, complete coverage, reproducible imports and rights review. The static build now rejects territorial or unknown display grants before public packaging. This guards deployment but does not selectively serve content by country; implement genuine regional delivery or obtain broader rights evidence before admitting U.S.-qualified editions. Persian `pesOPV` remains deferred over identity/credit and a Psalm 121:1 archive discrepancy; Korean `kor` remains deferred over a missing 1 Peter 5 chapter and XML/TXT differences.
3. Extend Gospel comparison with separately researched parallel groups; independent user selections are not reviewed mappings. Complete translated interlinear alignment, genealogy/relationship exploration, diagrams and textual-variant tooling with permitted data. Historical dictionaries and original-source morphology do not satisfy every language-tool requirement.
4. Extend source-grounded speaker browsing beyond the current publisher spans and correction workflow; preserve explicit uncertainty and exact quotation boundaries.
5. Implement the remaining Nigerian adaptation and multiplayer detective engines without inventing reviewed content, multiplayer activity or spiritual scores. Content review remains a separate gate.
6. Expand historical source imports, canon profiles, contextual research, module dictionaries and book aliases. Hausa and Igbo native-language approval remain unfinished.
7. Preserve private data, exact source revisions, rights checks, accessible controls and released behavior. Keep increments small; pass required candidate checks, merge, deploy application changes and verify the exact public build receipt after each increment.

## External prerequisites

Independent editorial/native-language review, restricted source rights, authenticated provider configuration, permitted recorded narration and physical two-device offline validation are not established. The dedicated backend setup was interrupted; no unrelated project may be reused or called live. True OS widgets are outside the latest Law Diary addendum; the web lock-screen export is implemented.

