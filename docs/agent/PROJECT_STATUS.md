# Project status

## Latest continuation checkpoint — 4 November 2026

Main now contains the accepted search, audit and route-preservation increments:

- **PR #8 — private saved searches and personal-study search:** merged as `3806a3e1536a7486a5cf296b3fa1eb12e1eb77a6`. Full release workflow [41895760595](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41895760595) passed source/content/build, desktop/mobile browser checks and persistence regression, then deployed and verified the published source revision.
- **PR #9 — game and learning template audit:** merged as `e32154a6fa606dc29bda8da5f97455b3be26c3a7`. [Workflow 41896538265](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41896538265) passed the full build/browser/persistence/deploy gate. No standalone game existed to certify; Verse Drop and memory exercises are study tools. The audit and future-game acceptance checklist are in [GAME_TEMPLATE_AUDIT.md](../GAME_TEMPLATE_AUDIT.md).
- **PR #10 — explicit shared-passage route preservation:** merged as `616daf3554f9fdf4519bde2ea8f2c514e963b073`. It closes the route-recognition gap across all supported screens, prevents invalid deep links from restoring an unrelated saved passage, and adds regressions. [Workflow 41897171553](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41897171553) passed and verified the published source revision.
- **PR #11 — private recent-search history:** merged as `3751ba557ed56d84a29a98417f5e49805ba326e8`. [PR workflow 41897478517](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41897478517) passed unit, desktop/mobile browser and repeated persistence checks. History stores at most 20 distinct recent source queries locally, retains edition and filters, and supports individual removal and explicit clearing. The main deployment workflow [41898329148](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41898329148) is still running; do not claim this latest main revision is published until its deployment receipt passes.
- **PR #7:** closed as superseded by PR #6 because its duplicate layout/command work was already on main. No duplicate systems were merged.
- **PR #12 — guided private interpretation challenge:** in progress. It extends the existing private reflections workspace, binds the exercise to the selected edition/passage, and makes no automatic correctness or faith judgment. Merge only after the exact latest candidate passes all release gates.

Current main checkpoint: `3751ba557ed56d84a29a98417f5e49805ba326e8`. The complete Version 3 project remains in progress; none of these bounded increments implies overall completion.

Updated: 4 November 2026 (Europe/Berlin). The complete Version 3 product remains in progress.

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
- The overlapping navigation branch / PR #7 was closed as superseded after confirming its layout and command systems already existed on main. The distinct shared-passage route defect was independently reproduced, fixed and tested in PR #10.

## Verification and recovery

Initial [CI 41872693806](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/41872693806) passed 93/98 browser cases. Failures exposed ambiguous theme/pane control names and mobile note autofocus. Explicit accessible names and corrected overlay guards fixed those failures; the later complete run passed all 98 without removing assertions or enabling retries.

Checkpoints `07aa031`, `a07a9f1`, `61dd3cf`, `5be157b` and `916d245` were read back from the remote feature branch. The local executor is unavailable in this continuation; actual Node, build and browser verification runs in GitHub Actions. Browser artifacts are retained by those runs. No local browser or independent accessibility certification is claimed. Offline backend contracts do not establish live backend operation.

## Next bounded work

Finish the PR #11 main deployment receipt, then complete PR #12's guided interpretation challenge through the exact-candidate release gate. After that, continue the Version 3 M7/M8 sequence with content/rights/review gates kept separate. Do not rebuild the released source-reader, layouts, command palette, search or private-session features.

External gates remain: genuine human editorial/native-language review, edition-specific permissions, the interrupted dedicated backend setup, authenticated model service, permitted recorded narration and native-platform environments. Do not retry cancelled backend setup without explicit resumption. These dependencies do not block other local implementation.

## Runner setup recovery

Final source checkpoint `065e12e11f7094e8e4237ad92bf882ceba44c2d8` passed its code/content/build gate in workflow 41874798330. Chromium installation began at 18:10:21 Europe/Berlin and remained at that step for over seven minutes, before any browser test ran. The install step now has a five-minute bound so an infrastructure stall yields a diagnosable failure instead of consuming the complete release job. The fresh exact-candidate run still requires every application, browser and persistence check. No setup delay is reported as an application-test success.
