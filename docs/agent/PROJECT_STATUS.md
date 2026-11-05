# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Verified production: `dfe6ad3d0fa37425fbcd6a44167f83b22b699c6d`, merged in [PR #27](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/27). [Main workflow 42004990781](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42004990781) passed. Independent public verification returned this exact `sourceCommit`, HTTP 200 and the app shell on 5 November 2026.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . `build-info.json` is the exact public source receipt.
- Advanced release: [PR #28](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/28) merged as `9711f529bff19f18458ab34e6c00c08c0af1c8bb`. Exact-candidate workflow 42007343926 passed, including 192 browser cases without failures/retries/skips and persistence repeats; desktop/mobile/320px screenshots reviewed. Main deployment 42008544329 is running; a newer public receipt is not claimed yet.
- Current integration branch: `codex/catalog-scale-integration-20261105`; last verified checkpoint `7a814bdad0d154a0f02a424329f2589289c05426`, checked through GitHub and git ls-remote on 5 November 2026. This branch stages the next catalog/coverage increment separately from the running release.
- Integrated: 14,298 pinned historical dictionary records with verified offline packs, private translation exercises, Athens Acts 17 pilot, private blind interpretation notebook, and hardened two-person nearby transport. Routes, command navigation, tool directory and desktop/mobile/320 px visual checks are connected.
- Focused checks passed: lexical importer/model/storage (12), Athens source/export/geometry and complete-notice checks (9), nearby protocol/transport/rights (18), interpretation model/storage (13), routing/recovery (9), TypeScript and lint. Integrated `npm run check` passed: 352 application tests, 20 backend contract tests, source validation, TypeScript, lint and production build. Playwright collects 192 desktop/mobile cases; exact-candidate browser execution remains pending.
- Next increment: metadata-driven source-language filters, bounded catalog pages, explicit baseline IDs and exact range preservation when switching editions. Expanded coverage and bounded source/search caches are integrated; nine coverage tests and fourteen cache/search checks pass. Nine classical public-domain imports are independently being verified. None of those imports is counted as installed before integration and validation.
- Review follow-ups: fixed initial dictionary-inspection race and explicit English language metadata. Athens exports now include complete publisher notices verified against the build inventory; missing or altered notices block export. Root owns integration and release; other isolated work covers expanded coverage inventory and exact-source acquisition research.
- Local Chromium download returned an invalid archive. Browser tests run in GitHub Actions; no local browser execution or physical two-device testing is claimed.

## Remaining scope

Version 3 is not complete. Unbuilt software/content-engineering work is enumerated in [FEATURE_MATRIX.md](../FEATURE_MATRIX.md) and [NEXT_TASKS.md](NEXT_TASKS.md), including larger authentic edition coverage, language alignment tools, advanced speaker/atlas features, remaining experience engines and complete localization. These are not all external blockers.

Independent human editorial/native-language approval, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. No unrelated infrastructure is reused, approval fabricated or live integration implied. The latest addendum excludes true OS widgets; the web lock-screen card is implemented.

## Next action

Review PR #28 visual evidence, complete its release gate, merge and verify production. Integrate independently verified catalog/coverage/cache changes on the next branch and run its own complete release checks.
