# Verification evidence

## Hardening release

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
