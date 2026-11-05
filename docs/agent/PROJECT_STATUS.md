# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Work branch: `codex/continue-study-20261105`.
- Main and production are verified at `4be988a90fc6ff926d2c1e08fc33213735545a0a`, merged Gospel comparison PR #35. Main workflow [42067257507](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42067257507) passed the required build, browser, persistence and deployment gates.
- The deployment job fetched the public application and its exact source receipt at **2026-11-05 16:57:32.309 UTC**: build `f3487ca4decd8d53b7502894`, content `319aca2f790aeeb5b317d35e`.
- Production: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . The Sower reading group, independent panes and verified offline reading are released.

## Current bounded increment

Integrate private saved Gospel studies into the existing `src/gospels/` workspace. Preserve pane order, linked flags, retained independent selections, complete effective references and exact source hashes. Add private titles/notes, saved-study navigation, bounded JSON backup/import preview, conflict handling, deletion/Undo, independent draft text recovery and source-checked Markdown notebooks. Private writing must never enter public URLs or source caches.

Reuse the released gap-aware source loader. Reopening a saved study must enforce source pins and labels; unavailable or changed wording remains unavailable. No automatic relationship, chronology, human review or translation claim is introduced.

The prior unshipped prototype remains recoverable at `c243633a1f6c23a069bb927a312fcd92d83ea657` on `codex/gospel-private-study-checkpoint-20261105`. Its route is not merged. The new notebook uses its own validated IndexedDB namespace and preserves the one released Gospel route.

## Verification and synchronization

- New model/storage: 13 focused tests passed, including full selection round-trips, strict imports, atomic transaction completion, abort/quota/denial, and stale-tab conflicts.
- Initial integrated candidate passed 543 application tests, 20 backend contracts, source validation and production build. All 25 new model/storage/source-export tests passed; TypeScript, scoped ESLint and whitespace checks passed. The notebook is connected to the released Gospel workspace. Browser and full release acceptance are pending. Local Chromium successfully launched, enabling real browser checks here.
- Last verified remote checkpoint: `ce6a63a7738b405331c917d21c89b1d9f4011f30` on `codex/continue-study-20261105`, read back at **2026-11-05 17:14:58 UTC**. Conflict-safe reload recovery, cancellable source preparation and browser acceptance are the next WIP checkpoint; no new feature deployment is claimed.
- Root owns integration and synchronization. Bounded specialists own only new model/storage and source-helper files. Existing reference repositories remain read-only.

## Next action

Checkpoint the new private-study files, connect the existing Gospel workspace, then verify save/reopen, source gaps and pins, backup conflicts, draft recovery, offline reload, concurrent tabs and narrow/keyboard flows. Pass all existing release gates on the exact candidate, inspect screenshots, merge under standing authorization and verify the deployed source receipt.

Full Version 3 remains incomplete. Human editorial/native-language review, restricted edition rights, backend/provider activation, permitted recorded narration and physical two-device/microphone acceptance are separate external dependencies. The interrupted backend setup is not resumed. See the feature matrix and blockers for remaining scope.
