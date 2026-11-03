# Verification evidence

## Executed locally

The pre-integration checkpoint passed TypeScript, ESLint, 62 automated tests, English source validation, all additional-edition integrity checks and the production build. Subsequent targeted checks passed 14 editorial/source tests and two notebook recovery/edition-attribution tests.

The integrated release also passed TypeScript, ESLint, 68 app/domain/source tests, 20 backend contract tests, corpus checks and a production build. The first actual CI browser run passed 24 of 26 cases. Both PNG cases exposed an ambiguous canvas-size accessible name; the control now has an explicit accessible name. The full browser gate is rerunning, and PNG verification is not yet claimed. The final release result and commit are recorded in [project status](agent/PROJECT_STATUS.md). Browser checks run against the built production artifact in GitHub Actions; merely collecting tests is not a pass.

Commands: `npm run check`, `npm run test:e2e`, and `node --test backend/tests/*.test.mjs`. The browser suite covers functional navigation, durable study state, source identity, offline reading, exports and responsive layout. Backend tests use injected adapters and do not establish deployed RLS correctness.

## First deployment evidence

GitHub Actions run `41728171389` succeeded for source `f6e58b976dbfd30d65bf174b009340f3d3e30ea6`. The public build-info returned that commit and the browser opened Genesis 1. This verifies the first live release only.

## Remaining independent verification

Native-language review, human editorial approvals, production database authorization tests, provider response evaluation, and device-specific TTS/media support require their corresponding real environments or reviewers. No independent accessibility certification is claimed.
