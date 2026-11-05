# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Prior deployed main: `8554f1eb85cb483ba5e40914547f862e74d95873`; Pages workflow [42000377767](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42000377767) succeeded.
- PR #27 merged as `dfe6ad3d0fa37425fbcd6a44167f83b22b699c6d` after [CI 42004091276](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42004091276) passed all required checks. Main deployment verification remains pending.
- Release fixes: `codex/advanced-study-workspaces-20261105`, [PR #27](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/27).
- PR #27 verified head: `cc44c16c7fe03876ca3813d8272a186323a69a7e`; its exact test receipt is the successful workflow above.
- Source-backed Speaker Explorer, private editorial drafts/coverage, and the complete pinned Lightfoot Didache are implemented in PR #27. Its previous CI passed source/content/build and 154 browser cases; eight failures exposed wrapped-label selectors, missing offline permission metadata, and the need to verify historical deep-link Bible context.
- Current fixes: stable control labels, permission-register precaching and retention, library query-reference parsing and recovery, and regression tests. No permission or editorial gates were weakened.
- Local Node 24 locked dependencies installed. PR #27 passed the complete source, unit, backend, content, build, desktop/mobile browser and repeated persistence checks. Local Chromium download returned an invalid archive, so release browser checks run in GitHub Actions.
- Current integration branch: `codex/complete-advanced-experiences-20261105`; verified remote checkpoint `9daa39b42fa5373c2df32e74643b88911626e3c9` on 5 November 2026. Lexical importer/model/storage tests (12) and Athens permission/cancellation/export/geometry tests (6) passed. Explicit verified dictionary downloads, cancellation and scoped removal are implemented; full integrated browser checks pending.
- Recovered increment: `codex/advanced-experiences-20261105` at `a790b87473149911fb1a46e9ccb5417944017d98`; contains lexical work, Athens tour, nearby transport and partial interpretation work. Its parent has the same tree as `bfd848d`; integrate only its distinct work after PR #27 is green.
- Root owns integration, release and this status. Isolated specialists own nearby transport cancellation/reconnect hardening and the private interpretation workspace, with their tests and module documentation.
- Existing production: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ ; exact published source receipt: `build-info.json`. No newer deployment is claimed yet.

## Exact remaining dependencies

Human editorial/native-language approval, restricted edition rights, dedicated backend/provider configuration, permitted recorded narration and actual two-device offline validation are not established. Backend setup was previously cancelled; no unrelated infrastructure is reused. These gates do not excuse independent software work. Full Version 3 is not complete.

## Next action

Verify PR #27's main deployment in workflow 42004990781. Integrate and release the remaining advanced experiences, then reconcile implementation and content gates with the feature matrix.
