# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Active feature branch: `codex/gospel-comparison-20261105`.
- Last verified feature checkpoint: `df14e0ea00aff7b175814787c476159b3efd6e6a`, remotely read back at **2026-11-05 15:43 UTC**. Includes the comparison workspace, strict source/model validation, fourteen unit tests and immediate download cancellation. Browser coverage, typography and this handoff follow that checkpoint.
- Actual main: `5d709eb88c18b51280bbcac701e1f9b8d09ec952`, merged [PR #34](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/34). Its [main workflow 42057642086](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42057642086) is running; deployment is not yet claimed.
- Last independently verified public production: `712b2eb91ed943e6d56a9fbb09f82f22e20c3154` (PR #32). Public `build-info.json` returned HTTP 200 at **2026-11-05 15:24:08 UTC**, build `6d64516006ef9802528d1343`, content `57185b83d1886c12c4db96ff`. URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ .

## Navigation repair

Main PR #33's deployment failed only its mobile Sources route check. The trace showed the historical reader restoring the Library route while its initial readonly IndexedDB load was pending. No crash occurred. PR #34 separates initial reads from pending writes: navigation during readonly loading is allowed, while drafts, pending mutations and downloads retain their guards.

Exact head `a0cc21e40417440c8ca73b228d43f32eb2b4bb82` passed [candidate workflow 42055116071](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42055116071): 504 application tests, 20 backend contracts, TypeScript, lint, source validation, production build, all 340 desktop/mobile browser cases and ten persistence repeats. Both new cases hold actual IndexedDB transactions open. The successful evidence archive's SHA-256 was checked (`334e7cdfe1a0686960847863203d3c638aeacb9db687f39826031bf2ecb9d0a1`); desktop reader and mobile Sources screenshots were inspected before merge. Main deployment requires its own final receipt.

## Gospel comparison candidate

- New lazy-loaded Study Tools workspace and Law Diary entry point; original reader passage and edition remain intact.
- Two to four panes. The supplied Sower selection links Matthew 13:1–23, Mark 4:1–20 and Luke 8:4–15. Each can be unlinked to choose its own installed edition and range; John is always independent. No invented John counterpart, verse alignment or chronology is supplied.
- Exact source wording, original numbering, full surrounding chapter, source identity and complete attribution. Real absent/empty verses remain explicit; invalid links or unavailable sources show recoverable errors without substituting text.
- Selection lives in the link and supports reload/back/forward. Language/direction/font follow the actual edition; English controls show an explicit fallback outside English. This adds no private data store.
- Selected source books and notices use the existing verified atomic offline downloader. Cancel releases the operation immediately even while a shared source read is pending; late results cannot publish completion or replace the current selection. Prior complete packs are retained.
- Only the supplied Sower group is included, with editorial review pending. Wider researched parallel groups and translated control dictionaries remain separate work.

## Current checks and next action

`npm run check` passed locally: 518 application tests (including fourteen Gospel tests), 20 backend contracts, TypeScript, lint, source validation and production build. That run preceded the final cancellation handler and browser-test integration; run affected checks and exact-candidate CI before release. Independent read-only source verification passed all 87 combinations across the 29 Bible editions: 1,595 exact selected records and 4,495 complete-context records, matching source revisions, permissions and link round-trips.

Local browser execution is NOT TESTED because the preview server did not start within Playwright's existing 30-second bound. Actual browser acceptance runs in GitHub Actions. Finish eight Gospel browser cases per project, including exact source/context, independent gaps/history, late responses, real-service-worker offline recovery, cancellation and narrow/keyboard screenshots. Submit the scoped candidate, inspect actual evidence, then merge and verify its resulting main deployment and public source receipt. Preserve existing timeouts, persistence repetitions and visual assertions.

## Preserved acceptance boundaries

Main retains 29 Bible editions (26 additional beyond the original three), 18 source languages and 19 exact language tags, the separate Quran, independently numbered Hebrew/Greek source studies, private retelling recordings, source notices and backups. Gospel comparison changes no imported Scripture bytes.

Full Version 3 remains incomplete; see the [feature matrix](../FEATURE_MATRIX.md) and [next tasks](NEXT_TASKS.md). Independent human editorial/native-language review, restricted rights, configured providers/backend services, permitted recorded narration and physical two-device/microphone acceptance remain separate dependencies. The interrupted backend setup is not resumed; no unrelated infrastructure is reused.
