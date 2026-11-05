# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Verified production: `75f2d35be4df3ab07f589c557f01a653acdfc8dc`, merged in [PR #29](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/29). [Main workflow 42013204493](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42013204493) passed. Independent public verification at 10:52:29 UTC on 5 November returned this exact source commit, build `317f9e564b634dcfee37a6a1`, HTTP 200, the app shell and an exact-byte match of the fourteen-edition source catalog.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Public `build-info.json` is the deployed source receipt.
- Current integration branch: `codex/concordance-integration-20261105`. Last verified root checkpoint: `483dda85b2de1f08de0714c7f04b13d40c9cddaa`, confirmed by GitHub and git ls-remote on 5 November 2026. Final concordance agent checkpoint `1cf36e215f274ed6209d9f183c3dfe7db32d512f` is integrated locally; complete candidate checks passed before the next synchronized release checkpoint.

## Released evidence

PR #29 installed nine exact classical source editions: fourteen installed Bible editions, eleven beyond the original three-edition baseline, seven source languages, plus a separate Quran source. All 280,101 added verse records were independently compared with pinned upstream files. Catalog filters/pagination preserve complete passage ranges; expanded coverage separates drafts, approvals and verified device downloads; source/book/search caches are bounded. Exact-candidate workflow `42011864179` passed 379 application tests, 20 backend contracts, source validation, TypeScript, lint, production build, all 208 browser cases with zero failures/flaky results/skips, and ten persistence repeats. Desktop/mobile/320px catalog and coverage screenshots were inspected.

PR #28 remains included: 14,298 historical dictionary records, verified dictionary packs, private translation exercises, the four-stop Athens pilot, private blind interpretation notebook and hardened experimental two-person nearby transport. Its exact-candidate and main workflows passed; no human editorial approval or physical two-device acceptance was inferred from automated tests.

## Current concordance candidate

The standalone source-word/phrase concordance verifies source manifests, indexes and permissions before displaying counts; distinguishes occurrences from matching verses; preserves Unicode and exact highlight boundaries; provides book distributions and bounded pages beyond 100 results; and opens verified source context. Route, tool directory, keyboard commands and reading-position recovery preserve the selected edition and complete passage range. Streams, cancellation and stale responses are bounded and tested. Matching rules are explicit; no lemma/morphology/translation-equivalence claim is made.

Sixteen focused concordance tests, nine routing/recovery checks, TypeScript and lint passed. The real verified loader accepted all fourteen source indexes and 435,581 source records. Full integrated `ADIGUN_SOURCE_TRANSPORT=gzip-base64-v1 npm run check` passed 406 application tests, 20 backend contracts, TypeScript, lint, source validation and production build. Playwright collects 226 desktop/mobile cases, including eight concordance cases, two navigation cases and eight required packaged-transport cases; execution and screenshot review remain pending in candidate CI.

Compact source transport from verified branch head `ed294f8558b17e79f7b427900ecc2d27ef82e7f7` is now integrated. Build-only gzip/base64 envelopes preserve canonical bytes, URLs and atomic pack behavior; concordance verifies transferred hashes before decoding. The production workflow enables the same packaging used by all candidate browser gates. Decoder streams, output/ratio limits and offline inventory limits (4 MiB, 16,384 paths) are bounded. Current packaged artifact: 87880962 bytes across 2260 files; 2194 offline paths. The copy/rewrite artifact mismatch is resolved by writing each source directly into a fresh staging directory, verifying it, then swapping the completed directory. Final artifact verification passed all 938 envelopes against 167,732,841 canonical bytes; two new regression cases reject raw replacements, missing files, changed canonical bytes and reused staging destinations. Browser execution remains pending.

Independent isolated work continues on a pinned Open Scriptures Hebrew Bible source-study corpus and its viewer; neither is included in this candidate yet. OSHB uses its own source numbering and preserves ketiv/qere alternatives and annotations; it is not counted as another translated 66-book Bible or aligned automatically to translations.

## Remaining scope and constraints

Version 3 is not complete. Unbuilt software/content engineering remains in [FEATURE_MATRIX.md](../FEATURE_MATRIX.md) and [NEXT_TASKS.md](NEXT_TASKS.md): the 100+ additional-edition target, broader original-language tools and reviewed relationships, remaining experiences, historical content and complete localization. Public-domain inventory labels are acquisition leads, not proof of source distinctness or permissions.

Independent human editorial/native-language approval, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. The dedicated backend setup was interrupted; unrelated infrastructure is not reused. True OS widgets are outside the latest addendum; the web lock-screen card is implemented.

Local Chromium installation returned an invalid archive. Browser execution runs in GitHub Actions; local browser execution and physical-device testing are not claimed.

## Next action

Finish and synchronize the concordance candidate, run its exact-candidate browser/persistence gates, inspect screenshots, then merge and verify the deployed revision. Keep Hebrew source-study work and the next acquisition batch isolated until their integrity and release checks pass.
