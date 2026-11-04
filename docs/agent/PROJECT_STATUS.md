# Project status

Updated: 4 November 2026 (Europe/Berlin). The complete Version 3 product remains in progress.

## Verified starting release

- Main: `8ed0aa73cdf759a36c923d09e3889c979104379e`, verified from GitHub.
- [Release workflow 41838579813](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41838579813): build and Pages deployment succeeded; deployment completed 14:32:35 Europe/Berlin.
- Actual release logs: **181 application tests, 20 backend contract tests, 84 desktop/mobile browser cases and 10 repeated persistence checks passed**. TypeScript, lint, content validation and production build passed. Offline backend contracts do not establish live backend operation.
- Production URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Build receipt: https://hephzibahbehulahhq.github.io/Adigun-AiBible/build-info.json .
- The public build receipt has not yet been independently fetched in this continuation. The workflow success is verified separately.
- Released increments include source-supplied publisher annotations, unchanged source rendering, private passage history, return navigation, named source-bound study tabs, backup/restore, concurrent-window protection and damaged-session recovery. Earlier status text that described PR #4 as pending was stale.

## Current bounded slice

- Branch: `codex/reader-layouts-commands-20261104`, created from the verified main above.
- Scope: named device-local layouts for reading appearance, source presentation, inspector and comparison panes; accessible command palette integrated with the existing navigation and modal guards.
- Preserve the current passage, notes, history, licensed source wording and all accepted flows. Layout backups must validate bounded fields and reject invalid data without replacing existing data.
- Environment: the local executor is unavailable. Source is inspected and checkpointed through authenticated GitHub tools. The existing pull-request workflow supplies the actual TypeScript, unit, build and desktop/mobile browser release gates. No local checks are claimed.
- Current changes are WIP until their exact candidate passes those gates. No changes are deployed by this status update.
- Remote checkpoint receipts will be recorded here after exact-head verification; this initial update starts from `8ed0aa73cdf759a36c923d09e3889c979104379e`.

## Remaining gates

Keep [BLOCKERS.md](BLOCKERS.md) and the feature matrix's source, human review, licensing, authenticated service, recorded-media and native-platform dependencies. Do not retry the interrupted dedicated backend setup without explicit resumption. Continue other unblocked reader/search work.

Next: implement and verify saved layouts and the command palette; merge and deploy under the existing authorization after all applicable checks pass, then verify the deployed revision.
