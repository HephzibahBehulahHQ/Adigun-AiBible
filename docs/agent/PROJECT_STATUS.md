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
- Initial integrated candidate passed 543 application tests, 20 backend contracts, source validation and production build. All 25 new model/storage/source-export tests passed; TypeScript, scoped ESLint and whitespace checks passed after integration repairs.
- The first complete local Gospel run passed 38/42 cases. The real cached-edition history regression is fixed and passes. Desktop 320px overflow and a mobile checkbox hit-target failure remain under diagnosis. The other two failures are the unchanged uncached-edition offline regression under local Chromium 141; the locked Playwright requires Chromium 156, whose installation returned an invalid archive. Its service-worker offline behavior must be established by the unchanged full CI gate with the required browser. No local all-green browser claim is made.
- Last verified remote checkpoint: `391b8666a6b2df0a1aa9a4c6a90676b09a1e3c7f` on `codex/continue-study-20261105`, read back at **2026-11-05 17:27:28 UTC**. It includes the complete 24-case notebook suite, history fix and documentation. No notebook deployment is claimed.
- Root owns integration and synchronization. A bounded browser specialist owns the Gospel stylesheet during layout diagnosis; other specialist implementation tasks are complete. Existing reference repositories remain read-only.

## Next action

Repair the narrow-screen defects, verify the affected browser cases and inspect screenshots. Pass all existing release gates on the exact candidate, merge under standing authorization and verify the deployed source receipt.

Full Version 3 remains incomplete. Human editorial/native-language review, restricted edition rights, backend/provider activation, permitted recorded narration and physical two-device/microphone acceptance are separate external dependencies. The interrupted backend setup is not resumed. See the feature matrix and blockers for remaining scope.
