# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Verified production: `9711f529bff19f18458ab34e6c00c08c0af1c8bb`, merged in [PR #28](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/28). [Main workflow 42008544329](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42008544329) passed. Independent public verification returned this exact `sourceCommit`, build `8ec75289f225e2ccb7ab99b9`, HTTP 200 and the app shell on 5 November 2026.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . `build-info.json` is the exact public source receipt.
- Advanced release: [PR #28](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/28) merged as `9711f529bff19f18458ab34e6c00c08c0af1c8bb`. Exact-candidate workflow 42007343926 passed, including 192 browser cases without failures/retries/skips and persistence repeats; desktop/mobile/320px screenshots reviewed. Main deployment 42008544329 and the public receipt are verified.
- Current integration branch: `codex/catalog-scale-integration-20261105`; last verified checkpoint `f951e5d04043ad1052e464732310781a25232dcf`, checked through GitHub and git ls-remote on 5 November 2026. This branch stages the next catalog/coverage increment separately from the running release.
- Integrated: 14,298 pinned historical dictionary records with verified offline packs, private translation exercises, Athens Acts 17 pilot, private blind interpretation notebook, and hardened two-person nearby transport. Routes, command navigation, tool directory and desktop/mobile/320 px visual checks are connected.
- Previous advanced-release checks: lexical importer/model/storage (12), Athens source/export/geometry and complete-notice checks (9), nearby protocol/transport/rights (18), interpretation model/storage (13), routing/recovery (9), TypeScript and lint. Integrated `npm run check` passed: 352 application tests, 20 backend contract tests, source validation, TypeScript, lint and production build. The advanced-release candidate passed all 192 browser cases in CI.
- Next increment: metadata-driven source-language filters, bounded catalog pages, explicit baseline IDs and exact range preservation when switching editions. Expanded coverage and bounded source/search caches are integrated; nine coverage tests and fourteen cache/search checks pass. Nine exact classical source imports are integrated and verified: fourteen installed Bible editions, eleven beyond the original baseline. Original source wording, numbering, Unicode and notices are retained. Full archive-to-output comparison matched all 280,101 added records. Speaker inventory now explicitly covers all fourteen editions.
- Review follow-ups: fixed initial dictionary-inspection race and explicit English language metadata. Athens exports now include complete publisher notices verified against the build inventory; missing or altered notices block export. Root owns integration and release; other isolated work covers expanded coverage inventory and exact-source acquisition research.
- Current catalog candidate: full local `npm run check` passed 379 application tests, 20 backend contracts, TypeScript, lint, source validation and build. Playwright collects 208 desktop/mobile browser cases; exact-candidate execution remains pending. Source/cache/coverage changes and new imports have separate technical review; no independent human editorial or legal approval is claimed.
- Local Chromium download returned an invalid archive. Browser tests run in GitHub Actions; no local browser execution or physical two-device testing is claimed.

## Remaining scope

Version 3 is not complete. Unbuilt software/content-engineering work is enumerated in [FEATURE_MATRIX.md](../FEATURE_MATRIX.md) and [NEXT_TASKS.md](NEXT_TASKS.md), including larger authentic edition coverage, language alignment tools, advanced speaker/atlas features, remaining experience engines and complete localization. These are not all external blockers.

Independent human editorial/native-language approval, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. No unrelated infrastructure is reused, approval fabricated or live integration implied. The latest addendum excludes true OS widgets; the web lock-screen card is implemented.

## Next action

Synchronize the complete catalog candidate, open its release PR and run all browser/persistence gates. Merge only after success, inspect the new screenshots and verify the published source receipt.
