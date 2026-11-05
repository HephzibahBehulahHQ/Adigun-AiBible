## Navigation repair and Gospel continuation — 5 November 2026

[PR #34](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/34), exact head `a0cc21e40417440c8ca73b228d43f32eb2b4bb82`, passed [workflow 42055116071](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42055116071): 504 application tests, 20 backend contracts, TypeScript, lint, source validation, build, 340 browser cases and ten persistence repeats. Real held IndexedDB transactions prove that an initial read permits navigation and a pending clean write still blocks it. The evidence archive digest was verified and desktop reader/mobile Sources screenshots were inspected. Merge `5d709eb88c18b51280bbcac701e1f9b8d09ec952` has a separate main deployment gate; current evidence is in [PROJECT_STATUS.md](agent/PROJECT_STATUS.md).

The Gospel comparison candidate passed local `npm run check`: 518 application tests, 20 backend contracts, source validation, TypeScript, lint and production build. Fourteen new model/source tests cover exact installed Sower text, real BSB numbering gaps, Unicode/empty records, source identity/permissions, malformed and duplicate link fields, independent selections and late request identity. Read-only extraction and actual rights checks passed 87 combinations across all 29 installed Bible editions, preserving 1,595 selected records and 4,495 complete-context records. After the cancellation/UI fixes, TypeScript and lint passed again; strict browser-test TypeScript and collection passed all sixteen new cases. Actual desktop/mobile browser execution remains pending. Local preview startup timed out; no local browser pass is claimed.

Earlier entries below are historical receipts, not the current release status.

## Catalog release — PR #29 (5 November 2026)

Exact candidate `1586f4714cf6b2df1280e1f47b7c062eb8db56a9`, tested merge preview `0d7917d12762995fc173fd3ce61dad4ac17afe0a`: [workflow 42011864179](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42011864179) passed 379 application tests, 20 backend contracts, source validation, TypeScript, lint, production build, all 208 browser cases and ten repeated persistence cases. Browser artifact statistics: 208 expected, 0 unexpected, 0 flaky, 0 skipped. New catalog/coverage desktop and 320px screenshots were inspected. The installation-error banner in controlled catalog screenshots comes from intentionally blocked service workers; the separate real Czech complete-edition download/offline reload/search test passed.

Merged as `75f2d35be4df3ab07f589c557f01a653acdfc8dc`. [Main workflow 42013204493](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42013204493) and deployment passed. Independent public verification at 10:52:29 UTC returned the exact merge commit, build `317f9e564b634dcfee37a6a1`, HTTP 200 and the application shell; the published source catalog matched the repository bytes and contained fourteen installed Bible editions.

# Verification evidence

## Current continuation: private Gospel studies

The current production authority is [PROJECT_STATUS.md](agent/PROJECT_STATUS.md); Gospel comparison PR #35 is deployed at source `4be988a90fc6ff926d2c1e08fc33213735545a0a`. Older release receipts below remain historical evidence.

The private notebook candidate adds 25 meaningful model/storage/source-export tests and 24 desktop/mobile browser cases. The integrated application suite passed **543 application tests and 20 backend contracts**, TypeScript, lint, full source validation and production build. Subsequent row-conflict, cancellable-preparation and history fixes passed focused tests, TypeScript and lint.

The initial complete local Gospel run passed **38/42** cases, including mixed-pane persistence, source-pin refusal, exact notices and source gaps, backup validation/conflicts, two-tab draft recovery, quota/abort/denial, pending-write navigation guards and actual downloaded-source offline reload. The cached-edition history regression was fixed before this run. Desktop 320px overflow and mobile checkbox hit-target diagnosis found a hidden backup input incorrectly inheriting full-width control styling: desktop scroll width was 356px at 320px; mobile layout width expanded to 426px at 390px. A scoped selector excludes hidden inputs; focused verification is pending. Two unchanged uncached-edition offline tests fail under locally available Chromium 141; required Playwright Chromium 156 installation returned an invalid archive. The full unchanged GitHub gate must establish final acceptance with its matching browser. No failures are skipped or weakened.

## Historical verified release: PR #28

Production `9711f529bff19f18458ab34e6c00c08c0af1c8bb` is deployed at the existing Pages URL. [Candidate CI 42007343926](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42007343926) and [main deployment 42008544329](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42008544329) passed. Independent public verification on 5 November 2026 returned the exact source commit, build `8ec75289f225e2ccb7ab99b9` and HTTP 200.

The browser report records 192 expected cases, zero unexpected/flaky/skipped cases, and both desktop/mobile Chromium projects. The workflow also passed its ten repeated legacy persistence checks, TypeScript, lint, application/source tests, backend contracts, content validation and production build. Desktop and mobile/320 px screenshots for the advanced tools were directly inspected. Browser execution took place in CI because the local Chromium installer returned an invalid archive.

Coverage includes unchanged Aramaic dictionary lookup, private exercise and interpretation persistence/backup/recovery, actual offline dictionary reload, Athens keyboard/2D/3D behavior, full export notices and rejected corruption, and genuine two-page WebRTC approval/chat/navigation/package/reconnect flows. Two browser pages do not establish offline support on two physical devices. Draft research remains unreviewed; backend contracts do not establish live service configuration.

Earlier release entries below are historical receipts. Their former pending statements are superseded by the current release/status record.

## Verified production release: PR #3

Integrated production revision: `4d8943e60143a74e228c0bf7ed37b2d404d6776c`, merged through [PR #3](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/3). Production workflow [41826905145](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41826905145) succeeded after the final pre-merge run [41826113696](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41826113696) passed.

- TypeScript, ESLint, complete source validation and the production build passed.
- 149 application/source/editorial/persistence tests passed.
- 20 offline backend contract tests passed; these use controlled adapters and do not certify a live database, Auth, RLS or model service.
- 62 desktop/mobile browser cases passed with retries disabled.
- The bookmark-persistence case passed five additional repetitions per device profile: 10 repeated checks.

The release adds browser coverage for genuine edition selection and 2–4 comparison panes, prayer persistence, source-resolved transcript evidence, projection audience isolation, family original-file backup/restore and concurrent-edit/unsaved-work/storage-failure behavior, listening source identity/consent/bookmarks/resume and stale speech cancellation, and paginated/bilingual exports with exact text, diacritics, license links and numbering-gap refusal. Speech tests use controlled browser voices; they do not certify an installed voice on every device. Support checks cover explicit country selection, the verified DE contact link, Nigeria at 320 CSS px, clear/reset and non-persistence after reload.

Final CI captured reader, comparison, editions, historical catalog, source coverage, sharing, tools, family, audio, evidence, projection and support views at 1440×900 and 390×844, plus targeted 320 CSS px checks. Direct inspection of the final family/audio desktop/mobile images and support desktop/320px images found no material visual defects. Static screenshots complement the behavioral checks; they do not certify every below-fold state or independent accessibility compliance.

Earlier Version 3 browser runs `41823624648` (48/56 passed) and `41824204313` (52/62 passed) exposed control-name expectations and an omitted explicit Yoruba license-deed link. Corrections retained the assertions; the final run passed without skipping or retrying away failures. The initial 126/127 application result was resolved by reconciling nine candidate-table rows to canonical v3 text while preserving their historical v2 wording and unchanged review/evidence states.

Live [build-info.json](https://hephzibahbehulahhq.github.io/Adigun-AiBible/build-info.json) was verified 4 November 2026, 13:17 Europe/Berlin: source `4d8943e60143a74e228c0bf7ed37b2d404d6776c`, build `76e65cbc808627c0d6a5b0b4`, content `ebbf21b44f84c76c567d50b7`. Production: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ .

The reader-context/history/tabs slice on `codex/reader-context-20261104` is not covered by these release receipts. Its candidate evidence is tracked below.

## Source-reader release: PR #5

[PR #5](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/5) merged source-supplied headings, positioned notes, same-edition reference previews, poetry/paragraphs and optional publisher red-letter spans into main `cce0f7495fc2064b0ee8686a30a9c687275fd175`. Final candidate `b54026a5499a3c9c8a64b6782684601399431ff2` passed [CI 41836742071](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41836742071):

- 166 application/source tests and 20 offline backend contract tests.
- TypeScript, ESLint, full source validation and production build.
- 70 desktop/mobile browser cases with retries disabled, plus 10 repeated legacy persistence checks.
- An independent sweep checked all 2,378 installed BSB/ASV chapters: zero verse or heading text mismatches, invalid heading anchors or metadata issues; all 4,854 BSB notes remain represented once.

Desktop note/red-letter and desktop/mobile 320px poetry/note images from passing run41836214694 were inspected directly. The final candidate only scoped backup help text to included workspaces. Initial run41834090869 passed68/70; the narrow toolbar now wraps and the request-retry test disables service workers so an injected fetch failure reaches the app. The strengthened overflow assertion checks320 CSS pixels directly. No assertion was removed or retried away.

Production workflow [41837242771](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41837242771) and the public receipt are pending verification at this checkpoint.

## Private reading-session candidate: PR #4

[PR #4](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/4) adds capped private history, previous/next navigation, named study tabs, edition/revision-bound backup/restore, concurrent-window protection, cancellation of abandoned asynchronous actions and explicit damaged-session download/reset. It continues from the PR #5 source-reader release; it is not yet deployed.

- All15 focused session model/source tests pass, bringing the complete local application suite to181; all20 backend contract tests, TypeScript, ESLint, source validation and production build also pass.
- Eight history browser cases pass in run41836393302. That run passed76/78 overall; the legacy backup test used a global file-input selector that became ambiguous after the session importer was added. It now targets the existing accessible name, `Import study backup`, retaining the same persistence assertions.
- A regression delays a real Genesis response, unmounts the old reader, opens and saves Psalm6, then proves the late response cannot navigate, change saved state or even begin a stale session write. Four further browser cases verify raw damaged-data preservation, explicit reset/restore and refusal to erase a session another window repaired.
- The initial full-project lint check caught an unsupported suppression; it was removed. Review identified the stale-navigation lifecycle race; per-route abort controllers and storage guards now cancel abandoned work without treating cancellation as storage failure. Final integrated CI must establish the race/recovery browser result before merge.

## Historical hardening release

Verified code checkpoint: `129a01e08761a5e1fccff34af06e1b2f0c030e24`. GitHub Actions run [41737114875](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41737114875) passed:

- TypeScript and ESLint.
- 68 application, source-integrity, editorial, offline/update and study-state tests.
- 20 offline backend contract tests with injected Auth/quota/provider adapters and committed source resolution.
- Complete English and additional-edition corpus validation and production build.
- 25 Chromium cases on their first attempt; a mobile bookmark-persistence case passed only after retry. The stale save-status completion is fixed and retries are disabled. The workflow also repeats that persistence case five times per device profile; the PR checks record the final gate result.

Browser coverage includes hash-route refresh and chapter navigation, skip-link focus, saved bookmarks and notes, exact English/German/Yoruba source identity, independent UI language, invalid-link recovery, verified offline refresh, 320px layout, actual PNG signature/dimensions, legacy WEB backup identity/removal while German is active, and Quran navigation through its final verse.

Initial browser run `41736505631` passed 24/26. Both PNG cases could not locate the canvas-size control by its exact name. Adding an explicit accessible name fixed the control; the unchanged PNG assertions then passed. No failed browser test was skipped or removed.

Commands: `npm run check` and `npm run test:e2e`; `check` includes `node --test backend/tests/*.test.mjs`. Cloud Browser cannot access the workspace loopback preview; actual browser execution occurred in GitHub Actions. Production verification is linked from [project status](agent/PROJECT_STATUS.md).

## First deployment

Run `41728171389` deployed `f6e58b976dbfd30d65bf174b009340f3d3e30ea6`; live build-info matched, and the browser opened Genesis 1.

## Explicit limits

Database schema execution, RLS and concurrency tests, live Auth/model integration, independent editorial/native-language review, recorded narration and native widgets remain unverified or unavailable. Browser speech and silent WebM support depend on the browser; the PNG check does not certify every media platform. No independent accessibility certification is claimed.

## Released private reading sessions and next continuation

Main `8ed0aa73cdf759a36c923d09e3889c979104379e` supersedes the pending PR #4/PR #5 statements above. [Workflow 41838579813](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41838579813) passed **181 application tests, 20 backend contracts, 84 browser cases and 10 persistence repetitions**, then deployed successfully at **14:32:35 Europe/Berlin, 4 November 2026**. These counts were read from the actual build log.

PR #6 adds saved reader layouts and command-palette regression coverage. Its exact-candidate Actions results remain pending at this checkpoint. This continuation has no local executor; no local Node, TypeScript or browser success is claimed. The command-filter model additionally passed five isolated V8 checks, which do not replace the Node or browser release gate.

## Saved reader layouts and command palette: accepted implementation

[PR #6](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/6), code candidate `916d245f75c709259f9b274b7f7df1b97a99cc9e`, passed [CI 41873797416](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41873797416): **199 application tests, 20 backend contracts, 98 desktop/mobile browser cases and 10 persistence repetitions**. TypeScript, lint, source validation and build also passed. The initial run's five browser failures (93/98 passed) were repaired through explicit control names and correct mobile inspector focus; no assertion was removed or retried away.

Coverage includes actual layout/publisher/pane restoration, unchanged source wording and current reference, backup import preview, save/reload, concurrent windows, damaged-data preservation and guarded reset, denied storage, command filtering/keyboard navigation, 320px reflow and Notes-trigger restoration. The final follow-up extends the keyboard case to show the inspector from Reading Focus and must pass the same gate before merge. Its production workflow checks the public build-info source SHA and application response; final receipts are retained in PR #6.
