# Project status

## Active Gospel release — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Active release branch: `codex/gospel-comparison-20261105`, existing PR #35.
- Actual main and verified production: `5d709eb88c18b51280bbcac701e1f9b8d09ec952` (PR #34). Main run [42057642086](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42057642086) passed build, browser gates and deployment. Its publication step fetched the public receipt and application successfully at **2026-11-05 15:51:25.539 UTC**, build `d873c878d16e410b8ed09d95`, content `319aca2f790aeeb5b317d35e`.
- Production URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . The historical readonly-navigation repair is released.
- The existing Gospel PR head was independently read as `39b863a7395c59f1d4247ce676c616997ebd4647`. Its browser run [42058776027](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42058776027) passed 344 of 356 cases. Twelve cases stopped at exact edition-selector label lookups.

## Current repair and verification

The repair gives the linked-edition, independent-edition and add-Gospel selectors explicit accessible names matching their visible labels. It also derives the default Gospel edition from the current URL during mounted hash/history transitions, preserving an explicit Gospel-edition override. A desktop/mobile regression covers same-document navigation, default source changes, explicit overrides, history and return to the original reader range. It preserves existing behavioral assertions and timeouts. Local TypeScript, scoped ESLint, all 14 Gospel model/source tests and whitespace checks passed. The production build passed. The expanded full browser gate has 358 cases (18 Gospel cases). Local browser execution is unavailable: Chromium cannot create its required socket (Operation not permitted); the installation attempt also returned an invalid browser archive. No local browser pass is claimed. GitHub Actions remains the required browser acceptance environment. No Gospel deployment is claimed yet.

This PR introduces the supplied Sower reading ranges, independent two-to-four Gospel panes, original source numbering and gaps, full chapter context, explicit edition attribution, URL/history retention and atomic offline source downloads. The original reader passage remains separate. The supplied group is editorial review pending, and John is an independent reading rather than an invented counterpart.

The earlier separate private-row implementation was preserved at **`c243633a1f6c23a069bb927a312fcd92d83ea657`** on `codex/gospel-private-study-checkpoint-20261105`, verified from GitHub at **2026-11-05 16:16:40 UTC**. Its `src/gospel/` prototype must NOT be merged beside this PR's `src/gospels/` route. It contains recoverable private storage/backup work and unexecuted acceptance tests for a future coherent integration. It is not part of this release and is not reported as shipped.

Git CLI pushing lacks credentials in this environment. The authorized GitHub connector provides scoped writes. Its GraphQL ref-update action failed twice; creating an immutable checkpoint branch safely preserved the work. Release repair uses guarded file updates against the existing PR, preserving its history. The accessible-name repair was verified remotely at `98a97481d585d1a12cda80556e442c7f0eda8ad0` at 2026-11-05 16:19:20 UTC. The URL/history regression is the next candidate. Final checkpoint, CI and release receipts are recorded in the PR and refreshed status when available.

## Next action

Pass the unchanged full browser/persistence gate on the repaired PR #35 candidate, inspect screenshot evidence, merge under standing authorization, and verify the new main workflow plus public `build-info.json`. Integrate private row storage only through this one Gospel workspace after the source-reading release is accepted.

Full Version 3 remains incomplete. Editorial/native-language review, restricted edition rights, provider/backend activation, permitted recorded narration and real two-device/microphone acceptance remain separate dependencies. The interrupted Bible backend setup is not resumed. See the feature matrix for remaining requirements; no duplicate implementations or fabricated review claims are authorized.
