# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Latest merged release: [PR #31](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/31), `e437600d66213544923a12df8d95f161654a15de`, merged 13:25 UTC. [Main workflow 42035599588](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42035599588) passed all source/application/backend/build gates, 268 browser cases and ten persistence repetitions, then deployed successfully.
- Independently verified production: `e437600d66213544923a12df8d95f161654a15de`, confirmed at 13:36:08 UTC on 5 November through the public receipt and HTTP 200 home. Build `61d068d86be7cb2c2a310d66`; content `57185b83d1886c12c4db96ff`. Catalogue, rights register, offline inventory, font provenance and original OFL notices match merged source. Live UI verification passed Save and update, source reading, the 26-edition catalogue and Arabic Naskh/RTL rendering.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . Public `build-info.json` identifies the deployed source revision.
- Current branch: `codex/retelling-continuation-20261105`; remote repair checkpoint `8208173def9feb6354b7c9ec2f29f04c003a8133` was verified through GitHub and fetched on 5 November, checked again at 13:43 UTC. Its concurrent main integration and release notes are preserved. [PR #32](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/32) targets main. This evidence checkpoint adds actual successful draft-preservation and 320px transcript-recovery screenshots to the complete CI gate.

## Verified source and typography release

PR #31 brings the reader to 26 Bible editions, 23 beyond the original three, across 17 source languages. Twelve exact full-text sources add 373,275 records reconstructed from pinned archives. Arabic/Myanmar text and exports use source fonts and direction, with complete original font notices. Earlier dictionary, Hebrew, historical, concordance, private-study and advanced-workspace releases remain included. Quran and original-language study have separate counts.

Exact candidate `7ce04cb2ac52f3ac3070852a7b02d452cd417244` passed [workflow 42032766361](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42032766361): 449 application tests, 20 backend contracts, TypeScript, lint, source validation, production build, all 268 desktop/mobile browser cases and ten persistence repetitions. Report review found zero unexpected, flaky or skipped cases. All 1,742 source envelopes matched 342,735,000 canonical bytes (105,669,345 transferred bytes).

Downloaded Arabic, Myanmar and bilingual PNGs were visually inspected with complete credits, no visible clipping and no missing-glyph boxes. Desktop/mobile/320px catalog captures were also inspected. This establishes technical rendering, not native-language/editorial approval. Earlier failed runs remain diagnostic evidence; pinned Playwright 1.64.0 resolves the documented offline browser-state defect while keeping strict cache-removal, document-reload and uncached-network assertions. Temporary source construction is outside public assets, and finalization rejects leaked staging.

## Private retelling candidate

Optional consent-based local microphone originals, exact playback/download, manual transcripts, complete backups, atomic restore/delete/Undo and unsaved-draft/capture protection are implemented. Stable recording IDs preserve transcript drafts during concurrent deletion/reordering; rescheduling keeps the selected card. Existing written practice migrates additively. Source review preserves Arabic/Myanmar typography; personal writing uses automatic direction.

Candidate `dca1024854610d54bbe7154e99be5cdabc4eb469` passed all 472 application tests, 20 backend contracts, source validation, TypeScript, lint and the production build. Independent review passed 56 focused capture/storage/transcript/workspace/family checks. The integrated candidate includes the later source staging/browser repair. The delayed-Add regression brings the browser gate to 292 cases, including 24 retelling-media cases; actual execution and screenshot review remain required on the final candidate.

Independent review found that a delayed card addition could unmount writing or recording started during source loading or the storage commit. The focused repair keeps editing available while loading, invalidates abandoned Add operations and checks the current navigation guard after committed state and the cleared busy flag render. Its deterministic browser regression holds the real source request and IndexedDB transaction, then checks that rejected navigation retains the original card, writing and exact original audio bytes. TypeScript, strict browser-test typecheck, scoped ESLint, whitespace and 56 focused capture/storage/transcript/workspace/family tests passed. All 24 retelling-media browser cases collect. The evidence checkpoint captures the preserved draft/original after delayed Add and the deleted-original transcript recovery screen at 320px; production behavior and existing assertions are unchanged. Local Chromium execution is not claimed.

Recordings stay in browser storage. There is no automatic transcription, voice scoring or claim of physical microphone acceptance. Limits are five minutes/8 MiB per original, 32 MiB retained device audio and 64 MiB for a complete backup. See [retelling evidence and limits](../RETELLING_AUDIO.md).

## Next isolated increment

Combined branch `codex/source-study-continuation-20261105` is verified at `1d3b96890112597e6fac9a688de17cedd79ed3ea`. It includes the separate Greek source viewer and three additional exact Bible editions, bringing its reader to 29 editions, 26 beyond the baseline, across 18 source languages. Its local full gate passed 502 application tests, 20 backend contracts, TypeScript/lint, source validation and production build; 334 browser cases collect. Actual browser execution and release remain pending. It will follow PR #32 with current evidence preserved.

## Remaining scope and constraints

Full Version 3 is incomplete. The [feature matrix](../FEATURE_MATRIX.md) and [next tasks](NEXT_TASKS.md) retain the 100+ additional-edition target, translated interlinear alignment, wider speaker/relationship tools, remaining adaptations/multiplayer flows, historical content and complete localization.

Independent human editorial/native-language review, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. Backend setup was interrupted; unrelated infrastructure is not reused. True OS widgets are outside scope; the web verse-card export is implemented.

Local Chromium installation is unavailable. Actual browser execution runs in GitHub Actions. Local browser execution and physical microphone/device acceptance are not claimed.

## Next action

Pass PR #32's repaired 292-case exact-candidate browser/persistence gates and inspect retelling evidence before merge/deployment. Release the separately verified Greek/three-edition increment afterward.
