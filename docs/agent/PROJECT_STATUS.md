# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Active repair branch: `codex/historical-navigation-20261105`.
- Actual main is `59d9a999543d5add39643495df376736612ea1b4` (merged PR #33). The remote head was independently read through GitHub at continuation. It includes 29 Bible editions and the separate Greek source study, but its deployment failed.
- Verified public production is `712b2eb91ed943e6d56a9fbb09f82f22e20c3154` (PR #32). Public `build-info.json` returned HTTP 200 at **2026-11-05 15:24:08 UTC**, with build `6d64516006ef9802528d1343` and content `57185b83d1886c12c4db96ff`. This release includes the 26-edition catalog and private retelling recordings. URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ .

## Release repair

[Main workflow 42050102248](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42050102248) passed 504 application tests, 20 backend contracts, TypeScript, lint, source validation and production build, then passed 335/336 browser cases. Only the mobile visual route check failed; deployment and persistence repetitions were skipped. PR #33's prior exact-candidate workflow `42046579957` passed 336 browser cases and ten persistence repetitions, but is not evidence of main deployment.

The downloaded failure artifact's SHA-256 was verified against GitHub: `cefd503e167651e333384489eb43f5c867caa59aaa88ea241ca07c03fe6c21e9`. Its trace shows navigation to Sources being restored to Library while the initial private historical IndexedDB read was still pending. The notebook later opened successfully; there was no runtime crash. The historical guard incorrectly treated readonly loading as an unsaved mutation.

The repair distinguishes pending writes from loading. Editing controls remain disabled during loading; navigation is permitted during a readonly read. Unsaved drafts, pending writes, restores/deletions and active downloads remain protected. Two browser regressions hold real scoped IndexedDB transactions open to exercise both the allowed read navigation and protected write path. Existing visual assertions, timeouts and release gates are unchanged.

## Current verification

- Clean base checkout: `npm run check` passed (504 application tests, 20 backend contracts, source validation, lint, TypeScript and production build).
- Repair: TypeScript, scoped ESLint, seven historical model/storage tests, strict browser-test TypeScript and diff checks passed.
- Actual browser acceptance remains pending in GitHub Actions. Local Playwright's preview server did not become available within its 30-second startup bound; local browser execution is NOT TESTED.
- This first repair checkpoint is being prepared for remote backup. Its exact verified SHA and subsequent CI receipts will be recorded in the pull request and next status update; no release success is claimed.

## Preserved source and private-data acceptance

Main retains all existing source editions, independently numbered Hebrew/Greek corpora, source notices, permission checks, private retelling recordings and complete backups. The 29-edition catalog represents 26 additional editions beyond the original three, 18 source languages and 19 exact tags. Imported scripture is unchanged by this repair.

## Next action

Push and verify the scoped repair, pass the complete 340-case browser gate and ten persistence repetitions, inspect its evidence, merge after the exact candidate passes, and verify the resulting public source receipt. Then continue the explicitly requested synchronized Gospel comparison workspace using exact supplied ranges and honest editorial status.

Full Version 3 remains incomplete. See [feature matrix](../FEATURE_MATRIX.md) for remaining software/content requirements. Human editorial/native-language review, restricted rights, configured provider/backend services, permitted recorded narration and physical two-device/microphone acceptance are separate dependencies. Backend setup was previously interrupted and is not resumed by this task; no unrelated infrastructure is reused.
