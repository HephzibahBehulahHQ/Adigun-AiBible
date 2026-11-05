# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Verified main: `8554f1eb85cb483ba5e40914547f862e74d95873`; Pages workflow [42000377767](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42000377767) succeeded.
- Release fixes: `codex/advanced-study-workspaces-20261105`, [PR #27](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/27).
- Last verified remote checkpoint: `bfd848d75ca223b86e42bf3e09fcf61ba723e62a`, checked through GitHub and `git ls-remote` on 5 November 2026. The current commit adds the release fixes below; its exact receipt is the PR branch and Actions record.
- Source-backed Speaker Explorer, private editorial drafts/coverage, and the complete pinned Lightfoot Didache are implemented in PR #27. Its previous CI passed source/content/build and 154 browser cases; eight failures exposed wrapped-label selectors, missing offline permission metadata, and the need to verify historical deep-link Bible context.
- Current fixes: stable control labels, permission-register precaching and retention, library query-reference parsing and recovery, and regression tests. No permission or editorial gates were weakened.
- Local Node 24 locked dependencies installed. Full baseline `npm run check` passed. Focused offline/routing/recovery tests passed after fixes; full exact-candidate CI and browser rerun pending. Local Chromium download returned an invalid archive, so release browser checks run in GitHub Actions.
- Current integration branch: `codex/complete-advanced-experiences-20261105`; verified remote checkpoint `0851757fbbcf4cf4f390f480d18b35e5a4602aae` on 5 November 2026. Lexical importer/model/storage tests (12) and Athens permission/cancellation/export/geometry tests (6) passed. Full integrated browser checks pending.
- Recovered increment: `codex/advanced-experiences-20261105` at `a790b87473149911fb1a46e9ccb5417944017d98`; contains lexical work, Athens tour, nearby transport and partial interpretation work. Its parent has the same tree as `bfd848d`; integrate only its distinct work after PR #27 is green.
- Root owns integration, release and this status. An isolated specialist owns only nearby transport cancellation/reconnect hardening, tests and its module documentation.
- Existing production: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ ; exact published source receipt: `build-info.json`. No newer deployment is claimed yet.

## Exact remaining dependencies

Human editorial/native-language approval, restricted edition rights, dedicated backend/provider configuration, permitted recorded narration and actual two-device offline validation are not established. Backend setup was previously cancelled; no unrelated infrastructure is reused. These gates do not excuse independent software work. Full Version 3 is not complete.

## Next action

Verify PR #27 fixes, merge the green candidate and verify production. Recover and finish the unmerged advanced experiences, then reconcile all remaining implementation and content gates with the feature matrix.
