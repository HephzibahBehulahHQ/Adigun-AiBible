# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`. Active implementation branch: `codex/gospel-workspace-20261105`.
- Actual main was independently verified as `5d709eb88c18b51280bbcac701e1f9b8d09ec952` (merged PR #34). The historical readonly-navigation repair is already integrated; do not rebuild it.
- Last verified work checkpoint: `1503502cdaede5acc640d79c5e39e4a616679bfa`, read back from the GitHub branch at **2026-11-05 16:06:14 UTC**. Local and remote trees match. CLI push has no authentication; authorized GitHub Git-data tools save the exact reviewed tree with an expected-head check, then Git fetch restores that same commit locally.
- This status and the connected Gospel UI are the next checkpoint; their feature/browser gates remain pending. No new release is claimed.

## Implemented increment in progress

The new `/gospels` study workspace keeps two to four different Gospel ranges in a private ordered row. Previous/next changes all source panels together. Titles and notes remain separate from exact Scripture. Every saved range binds its edition, complete range and source SHA-256. Source gaps, blank verses, changed revisions and forged labels fail without substituting wording.

The requested Sower ranges come directly from the canonical specification (Matthew 13:1–23, Mark 4:1–20, Luke 8:4–15). They are an explicitly unreviewed reading selection, not an approved Gospel harmony. No automatic relationship, chronology or doctrinal inference is introduced.

The increment adds scoped IndexedDB storage with transaction-completion receipts and concurrent-tab revision checks, bounded backup/restore with conflict preview, independent draft-text recovery, source-checked notebook exports, and explicit offline source downloads. Startup reads permit navigation; unsaved drafts, writes and downloads are protected. The reader route/edition is preserved until a deliberate passage handoff.

## Current verification

- Clean `5d709eb` base: `npm run check` passed 504 application tests, 20 backend contracts, TypeScript, lint, content validation and production build.
- Initial Gospel data/storage checkpoint: TypeScript and whitespace checks passed.
- UI and new source/storage/browser acceptance: pending. Complete release workflow and public revision verification are required before merge/deployment.
- Last previously recorded public receipt was `712b2eb91ed943e6d56a9fbb09f82f22e20c3154` at 2026-11-05 15:24:08 UTC. A fresh PR #34 deployment check is in progress; do not treat this older receipt as current production evidence.

## Next action

Verify Gospel model/source/storage behavior, desktop/mobile/320px flows, offline reload, backup/restore, stale revisions and source-response races. Inspect screenshots, run the complete required candidate gate, merge only on green evidence, and verify the resulting public `build-info.json` revision.

Full Version 3 remains incomplete. Human editorial/native-language review, restricted rights, provider/backend activation, permitted recorded narration and real two-device/microphone acceptance remain separate dependencies. Backend setup was previously interrupted and is not resumed here. See the feature matrix and exact blockers for the remaining scope.
