# Verification evidence

## Current release: PR #3

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

The next reader-context/history/tabs slice on `codex/reader-context-20261104` is **NOT TESTED** and is not covered by these release receipts.

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
