# Project status

## Latest continuation checkpoint — 4 November 2026

Current main: `2619c0261ffa985f3da5bb5fd788bb240880488f`.

- PR #8 saved/private searches and PR #9 game-template audit are merged and their release workflows passed.
- PR #10 shared-passage route preservation and PR #11 private recent-search history are merged; both release workflows passed.
- PR #12 guided private interpretation challenge is merged; PR checks passed.
- PR #14 first sourced decision-simulation pilot is merged as the current main checkpoint. Exact candidate CI [41900211198](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41900211198) passed source/content/build, desktop/mobile browser and persistence checks. Main deployment [41900926485](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41900926485) is queued/pending; do not claim this increment is published until its public build receipt matches main.
- PR #15 adds written retelling practice to the existing edition-bound memorization tool. It retains user-authored text locally, supports deletion and backups, distinguishes paraphrase from verbatim recall, and does not claim speech recognition or AI correction. Exact-candidate CI is running; merge/deployment are pending.

The full Version 3 product remains in progress. Each bounded increment is separately accepted; none implies overall completion.

Updated: 4 November 2026 (Europe/Berlin).

## Reader layouts and command palette: PR #6

Implementation is complete for this bounded slice. Source candidate `916d245f75c709259f9b274b7f7df1b97a99cc9e` passed [CI 41873797416](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41873797416): **199 application tests, 20 offline backend contracts, 98 desktop/mobile browser cases and 10 repeated persistence checks**, with no test retries or failures. TypeScript, lint, content validation and production build passed.

The final follow-up also ensures the inspector command reveals the panel when leaving Reading Focus, with a real-keyboard regression. That checkpoint and this acceptance record must pass the same release workflow. [PR #6](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/6) records its final check, merge and production receipts. Main merges only after the applicable gate is green. The post-publication workflow verifies that the public build receipt equals its exact source SHA.

Delivered implementation:
- Up to 12 named device-local layouts: theme, size, spacing, focus, publisher paragraphs/headings/notes/red letters, inspector and 2–4 linked/independent comparison panes.
- Save, apply, rename, removal, JSON export and explicitly confirmed validated replacement import.
- Atomic concurrent-window protection, clear storage errors, damaged-record download and reset guarded against a newer repair.
- Accessible command palette through the top-bar button or Control/Command + K, with filtering, real actions, keyboard traversal, modal focus restoration and ordinary typing preserved.
- Current passage, Scripture wording, personal notes and reading history remain independently managed.
- Applying a layout that disables publisher annotations closes its corresponding detail drawer. Small-screen inspector behavior and existing note autofocus are preserved.

## Integration and production identity

- Feature branch: `codex/reader-layouts-commands-20261104`. Last read-back checkpoint before this record: `916d245f75c709259f9b274b7f7df1b97a99cc9e`.
- Previous released main: `8ed0aa73cdf759a36c923d09e3889c979104379e`. [Workflow 41838579813](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41838579813) deployed it successfully at 14:32:35 Europe/Berlin.
- Production: https://hephzibahbehulahhq.github.io/Adigun-AiBible/
- Exact current public receipt: https://hephzibahbehulahhq.github.io/Adigun-AiBible/build-info.json
- Deployment evidence for this increment is retained in PR #6 and its production workflow. Do not infer publication from a branch checkpoint; inspect the merge/workflow and generated public receipt when resuming.
- A separate overlapping branch, `codex/workspace-navigation-20261104` / PR #7, was discovered during verification. Its work has not been removed or rewritten. Inspect actual main and reconcile any remaining overlap before integrating it; do not install duplicate competing layout/palette systems.

## Verification and recovery

Initial [CI 41872693806](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41872693806) passed 93/98 browser cases. Failures exposed ambiguous theme/pane control names and mobile note autofocus. Explicit accessible names and corrected overlay guards fixed those failures; the later complete run passed all 98 without removing assertions or enabling retries.

Checkpoints `07aa031`, `a07a9f1`, `61dd3cf`, `5be157b` and `916d245` were read back from the remote feature branch. The local executor is unavailable in this continuation; actual Node, build and browser verification runs in GitHub Actions. Browser artifacts are retained by those runs. No local browser or independent accessibility certification is claimed. Offline backend contracts do not establish live backend operation.

## Next bounded work

Continue advanced/private/saved search from the deployed state. Review the separate navigation branch for independently useful route-preservation work and reconcile through normal reviewed Git changes. Do not rebuild the released source-reader or private-session features.

External gates remain: genuine human editorial/native-language review, edition-specific permissions, the interrupted dedicated backend setup, authenticated model service, permitted recorded narration and native-platform environments. Do not retry cancelled backend setup without explicit resumption. These dependencies do not block other local implementation.

## Runner setup recovery

Final source checkpoint `065e12e11f7094e8e4237ad92bf882ceba44c2d8` passed its code/content/build gate in workflow 41874798330. Chromium installation began at 18:10:21 Europe/Berlin and remained at that step for over seven minutes, before any browser test ran. The install step now has a five-minute bound so an infrastructure stall yields a diagnosable failure instead of consuming the complete release job. The fresh exact-candidate run still requires every application, browser and persistence check. No setup delay is reported as an application-test success.
