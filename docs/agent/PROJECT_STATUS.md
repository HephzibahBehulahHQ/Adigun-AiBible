# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Verified production: `75f2d35be4df3ab07f589c557f01a653acdfc8dc`, merged in [PR #29](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/29). [Main workflow 42013204493](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42013204493) passed. Independent public verification at 10:52:29 UTC on 5 November returned this exact source commit, build `317f9e564b634dcfee37a6a1`, HTTP 200, the app shell and an exact-byte match of the fourteen-edition source catalog.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Public `build-info.json` is the deployed source receipt.
- Current integration branch: `codex/multiscript-reading-20261105`. Last verified font/rendering checkpoint: `121f7dcb0c3154348d41d26ab4f7a5969944506c`, confirmed by GitHub and git ls-remote at 11:58 UTC on 5 November 2026. PR #30 merged as `1198bfcbff5aba6d27a9b22195d37c77635e2299`; its main deployment is still pending verification.

## Released evidence

PR #29 installed nine exact classical source editions: fourteen installed Bible editions, eleven beyond the original three-edition baseline, seven source languages, plus a separate Quran source. All 280,101 added verse records were independently compared with pinned upstream files. Catalog filters/pagination preserve complete passage ranges; expanded coverage separates drafts, approvals and verified device downloads; source/book/search caches are bounded. Exact-candidate workflow `42011864179` passed 379 application tests, 20 backend contracts, source validation, TypeScript, lint, production build, all 208 browser cases with zero failures/flaky results/skips, and ten persistence repeats. Desktop/mobile/320px catalog and coverage screenshots were inspected.

PR #28 remains included: 14,298 historical dictionary records, verified dictionary packs, private translation exercises, the four-stop Athens pilot, private blind interpretation notebook and hardened experimental two-person nearby transport. Its exact-candidate and main workflows passed; no human editorial approval or physical two-device acceptance was inferred from automated tests.

## Concordance / Hebrew release

[PR #30](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/30) merged exact candidate `8a146f24953fcd252e169e1e60b9abb2250566d3` after [workflow 42022863834](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42022863834) passed 436 application tests, 20 backend contracts, source validation, TypeScript, lint, build, all 246 desktop/mobile browser cases and ten persistence repeats. Earlier CI found an outdated race-test observer; it was corrected without changing application behavior, assertions or timeouts. Root inspected the actual Hebrew desktop/320px and concordance 320px screenshots.

The release adds complete edition-specific source-word/phrase counts and pages; the pinned 39-book/929-chapter/23,213-verse OSHB source reader with supplied morphology/lemma fields, reading alternatives and verified offline notices; and compact translated-source transport. All 938 envelopes were verified against 167,732,841 exact canonical bytes (56,395,067 transferred bytes). Fresh staging, final artifact verification, strict decoding, bounded offline streams and prompt cancellation are implemented. Canonical source bytes and distinct source numbering remain unchanged. Main merge deployment and the public receipt still require verification.

## Current twelve-edition / typography candidate

Complete source batch `fd8dc782fa496f8c0f77899846c1a26a355365b6` is integrated: French Ostervald, Esperanto Londona, Arabic Van Dyck, Burmese Judson, Dutch 1917, Hawaiian 1868, Russian Synodal, Ukrainian Kulish, Vietnamese Cadman, Serbian Cyrillic Daničić/Karadžić, Tongan Revised West and English Geneva. Each has 66 books and 1,189 chapters; all 373,275 additional source records were reconstructed from pinned archives. There are 26 Bible editions, 23 beyond the original three, and 17 source languages. Quran, historical works and OSHB are separate counts. Provider-qualified public-domain notices are preserved; there is no claim of independent worldwide legal certification. Italian identity conflict, Persian attribution conflict and inconsistent Korean coverage remain deferred.

Source imports, indexes and permission negatives passed 17 focused tests. Ten new batch browser cases collect. All 26 publisher inventories are regenerated from actual source metadata using the production extractor.

Pinned Arabic and Myanmar fonts retain original bytes, complete SIL OFL 1.1 notices and source hashes. Reader/comparison and exports use source typography/direction; font-dependent images wait for verified font loading. Exact Myanmar word boundaries preserve dependent vowels, and immutable export snapshots prevent later preview changes from replacing authorized source text. Seventeen typography/card/widget tests and the offline-font packaging regression passed; the final combined TypeScript/lint/build and browser checks remain pending. Twelve new rendering browser cases collect from `55a70d449ee80ed5362ad435aa8ef1b148c9cca6`.

Private retelling audio is complete in isolated branch `82a66210a447f176b8b28e33e5d5699ddbf27ccb` with 53 focused checks. Independent review found transcript drafts targeted by array index; a stable-identity draft fix is in progress before integration. A separately pinned Greek source-corpus import is also underway. Neither is included in this candidate.

## Remaining scope and constraints

Version 3 is not complete. Unbuilt software/content engineering remains in [FEATURE_MATRIX.md](../FEATURE_MATRIX.md) and [NEXT_TASKS.md](NEXT_TASKS.md): the 100+ additional-edition target, broader original-language tools and reviewed relationships, remaining experiences, historical content and complete localization. Public-domain inventory labels are acquisition leads, not proof of source distinctness or permissions.

Independent human editorial/native-language approval, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. The dedicated backend setup was interrupted; unrelated infrastructure is not reused. True OS widgets are outside the latest addendum; the web lock-screen card is implemented.

Local Chromium installation returned an invalid archive. Browser execution runs in GitHub Actions; local browser execution and physical-device testing are not claimed.

## Next action

Verify PR #30’s main deployment receipt, finish the 26-edition typography candidate’s combined checks and release it. Integrate private retelling only after the independent draft-safety fix; retain the Greek corpus as separate work until its fidelity and license gates pass.
