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
- Checkpoint `61dd3cfb7c7dce22e8846561c2928274afea5875` was read back exactly from the remote branch at 17:55:25 Europe/Berlin. This follow-up includes the reviewed source-detail reset and final browser assertions.
- Current changes are WIP until their exact candidate passes those gates. No changes are deployed by this status update.
- Verified remote checkpoints: `07aa031e59544b7878c2f0dd129689eae7fb4724` reconciled prior release records; `a07a9f104a7f0b18cbc245af3b0362fa74faccd3` added the integrated layouts, commands and regression coverage. [Draft PR #6](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/6) runs the real release gate. Initial CI passed the full source/content/build check; its browser run was superseded by the reviewed candidate. No new release is claimed.
- Independent review found that closing an overlay could steal focus back to the Notes inspector. The note-autofocus effect now runs only for inspector/passage changes; a dedicated regression is included in this candidate. Restoring a layout that disables publisher notes/headings also closes the corresponding source-detail drawer.
- The deployment workflow now checks the public `build-info.json` source commit and application HTTP response after Pages publication, using the returned deployment URL. This verifies publication in the runner when direct web retrieval is unavailable.

## Remaining gates

Keep [BLOCKERS.md](BLOCKERS.md) and the feature matrix's source, human review, licensing, authenticated service, recorded-media and native-platform dependencies. Do not retry the interrupted dedicated backend setup without explicit resumption. Continue other unblocked reader/search work.

Next: implement and verify saved layouts and the command palette; merge and deploy under the existing authorization after all applicable checks pass, then verify the deployed revision.
