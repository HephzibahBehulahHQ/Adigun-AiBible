# Verification evidence

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
