# Project status

## Release handoff — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Continuation/handoff branch: `codex/gospel-notebook-release-handoff-20261105`.
- Private Gospel studies [PR #36](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/36) is merged into main `6e85085f704c44fb9726099cf243558cc7ccc47c`. Its application tree is identical to final tested candidate `94121dfbc8134af721c6702e5720c46da0c0647b`.
- [Candidate CI 42076853766](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42076853766) passed 543 application/source tests, 20 backend contracts, TypeScript, lint, source validation, production build, 382 desktop/mobile browser cases and ten persistence repetitions. Browser retries are disabled; the report records zero unexpected, flaky or skipped cases.
- [Production workflow 42079138366](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42079138366) is verifying the merged revision. Public publication verification remains pending at this draft handoff.
- Production URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Exact public receipts and final workflow links are also retained in PR #36.

## Completed increment

Private saved Gospel studies are integrated into the existing `src/gospels/` workspace. They preserve pane order, linked flags, retained independent selections, effective references and exact source hashes. The notebook includes titles/notes, ordered navigation, strict JSON backup/import previews, explicit conflict handling, deletion/Undo, independent draft-text recovery and source-checked Markdown exports with complete verified notices.

Reload cannot authorize a stale editor to overwrite a newer saved row. Source preparation is cancellable; late responses cannot write, download or replace a preview. Actual IndexedDB transactions remain protected until completion. Explicit startup URLs and the original reader reference remain intact. Private writing never enters public selection URLs or source caches. Saved sources preserve numbering gaps and fail visibly when a revision is unavailable; no substitute wording or independent review is invented.

A cached-edition history regression and hidden-file-input overflow were found and repaired. Original normal-click and overflow assertions pass. All 24 new notebook browser cases pass in CI with Chromium 156.0.8078.4. The complete artifact (13438838719) matched its recorded SHA-256 digest; desktop/mobile native, 320px and offline notebook screenshots were inspected. The local Chromium 141 installation remains unsuitable for the two uncached-edition offline regressions; those unchanged tests pass in the required CI browser.

## Synchronization and continuation

- Last verified application checkpoint on `codex/continue-study-20261105`: `94121dfbc8134af721c6702e5720c46da0c0647b`, read back at **2026-11-05 17:39:59 UTC**. Merged main `6e85085f704c44fb9726099cf243558cc7ccc47c` was read back at **2026-11-05 17:54:20 UTC**.
- This documentation-only release/continuation handoff is based on that accepted main revision. It does not change application code or claim a second application release. Inspect actual remote heads before starting the next implementation branch.
- Root owns integration and synchronization. Bounded model/storage, source-helper, browser/layout and read-only review tasks are complete. Existing reference repositories remain read-only.
- The earlier unshipped singular-route prototype remains preserved at `c243633a1f6c23a069bb927a312fcd92d83ea657`; do not merge it over the released plural `src/gospels/` route.

## Next concrete implementation

Add private, source-pinned speech collections to the existing Speaker Explorer: name a collection, add an existing publisher-marked span, order entries, reopen exact speech with full context, remove/Undo, and validate private JSON backup/restore. Retain edition/revision, reference, Unicode code-point boundaries, text hash and publisher provenance. Changed sources or markings must fail visibly. Keep publisher annotations distinct from independent review; public curated collections, new speaker assignments, scheduling and audio remain separate increments.

No external service is needed for this bounded software work. Preserve runtime rights checks, private-data conflict/cancellation recovery, explicit offline downloads and accessible 320px/keyboard behavior. Pass the unchanged full release gate on the next final candidate, merge under standing authorization and verify its public source receipt.

Full Version 3 remains incomplete. Authentic additional-edition imports, remaining language/study tools and other software work stay in the feature matrix. Human editorial/native-language review, restricted edition rights, backend/provider activation, permitted recorded narration and physical two-device/microphone acceptance remain separate external dependencies. The interrupted backend setup is not resumed.
