# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Independently verified production: `e437600d66213544923a12df8d95f161654a15de`, PR #31, [main workflow 42035599588](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42035599588). All main build/browser/persistence/deployment gates passed. Independent public HTTPS verification at 13:35:53 UTC confirmed HTTP 200, that exact source, build `61d068d86be7cb2c2a310d66`, content `57185b83d1886c12c4db96ff` and all 26 catalog edition identities in source order.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . `build-info.json` is the public source receipt.
- Source release [PR #31](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/31) is merged and live. Candidate and main workflows each passed 449 application tests, 20 backend contracts, 268 browser cases and ten persistence repetitions. Final downloaded-PNG/catalog layout review passed.
- Private retelling [PR #32](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/32): verified incoming head `8208173def9feb6354b7c9ec2f29f04c003a8133` extends `710f66fe` with a delayed-Add draft-preservation fix. [Workflow 42036926748](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42036926748) is running the new 292-case browser/release gate. The preceding workflow was superseded/cancelled, not passed. This source-study candidate preserves the incoming commit and its regression test.
- Current integration branch: `codex/source-study-continuation-20261105`, [PR #33](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/33). Last remote checkpoint `6c18d0c64211bf6c3a500da2edfad380186d11a3` was verified by git ls-remote at 13:32:27 UTC. This continuation integrates the newer audio repair and records verified deployment evidence; its full browser gate now contains 336 cases.

## Verified base release

PR #31 brings the reader to 26 Bible editions, 23 beyond the original three, across 17 source languages. It adds twelve exact full-text sources, correct Arabic/Myanmar font/direction handling and complete original font notices. All 373,275 added verse records were reconstructed from pinned archives. Earlier source, dictionary, Hebrew, historical, private-study and advanced-workspace releases remain included.

Exact-candidate CI passed 449 application tests, 20 backend contracts, TypeScript, lint, source validation, the production build, all 268 desktop/mobile browser cases and ten persistence repetitions. All 1,742 source envelopes matched 342,735,000 canonical bytes. The earlier failures identified obsolete acquisition/search assumptions and Playwright 1.62.1's documented offline-state bug; pinned 1.64.0 passes strict offline document-reload and uncached-network assertions. New source staging is outside public assets, and finalization rejects any leaked staging tree. Actual downloaded PNGs were visually inspected: Arabic, Myanmar and bilingual text and complete credits remain inside each image without visible missing-glyph boxes or clipping. Desktop/mobile/320px catalog captures were also inspected. This is technical layout evidence, not native-language approval.

## Private retelling candidate

Optional consent-based local microphone originals, exact playback/download, manual transcripts, complete backups, atomic restore/delete/Undo and unsaved-draft/capture protection are implemented. Stable recording IDs preserve transcript drafts during concurrent deletion/reordering; rescheduling keeps the selected card. Arabic/Myanmar source review preserves its actual typography; personal writing uses automatic direction.

Candidate `dca1024854610d54bbe7154e99be5cdabc4eb469` passed all 472 application tests, 20 backend contracts, source validation, TypeScript, lint and production build. Current `8208173d` adds a focused protection against delayed card addition unmounting newly started writing or recording. It invalidates abandoned additions and checks the current navigation guard after committed state and cleared busy state render. A deterministic regression holds real source loading and an IndexedDB transaction, then verifies that rejected navigation retains the original card, writing and exact audio bytes. The complete retelling browser gate now contains 292 cases, including 24 retelling-media cases. Actual execution and screenshot review remain required. No automatic transcription, spoken-language scoring or physical microphone acceptance is claimed.

## Combined Greek and three-edition study candidate

Greek branch `d09ab41dab433441ecddc2794ae1451463bae4b0` is integrated. Its separate 27-book/260-chapter/7,927-verse/137,554-token source supports exact token/parsing inspection, literal within-book lemma pages, independent source navigation and complete-license atomic offline books. The selected Bible edition/range is preserved; translated-word alignment is not inferred. The isolated candidate passed 50 focused checks, TypeScript/lint, source validation and a packaged build; all 36 served Greek files matched canonical bytes. Its 22 desktop/mobile cases remain for combined CI. See [Greek study](../GREEK_STUDY.md).

Three-edition branch `ea615c776bd1e7dbdacfc3f01908fb18d739a63b` adds BPC French Darby 2024 v2.0, Simple Spanish 2026 and the CC BY-SA 4.0 Tandroy publisher draft. The combined reader has 29 Bible editions, 26 beyond the original baseline, 18 source languages and 19 exact tags retained for filtering. All 93,353 added records preserve exact source numbering, gaps and notices. Complete archive reproduction, 38 focused checks including five Python negatives, TypeScript/lint, source validation and compact production build passed in isolation. The final edition branch adds 22 browser cases. Tandroy remains visibly a publisher draft; source text permission does not authorize recordings or model training. See [source admission evidence](../NEXT_CLASSICAL_BATCH.md).

The complete combined candidate `1d3b96890112597e6fac9a688de17cedd79ed3ea` passed 502 application tests, 20 backend contracts, TypeScript, full lint, source validation and production build. All 1,943 source envelopes matched 376,983,453 canonical bytes (117,215,180 transferred bytes). That predecessor collected 334 cases in 45 files. The incoming delayed-Add regression raises the current combined gate to 336 cases. Actual full browser/persistence execution, screenshot inspection and public release receipt remain required. Source integrity and implementation checks do not establish human/native-language approval.

## Remaining scope and access constraints

Full Version 3 is not complete. The [feature matrix](../FEATURE_MATRIX.md) and [next tasks](NEXT_TASKS.md) retain the 100+ additional-edition target, translated interlinear alignment, wider speaker/relationship study, remaining adaptations/multiplayer flows, historical content and complete localization.

Independent human editorial/native-language review, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. Backend setup was previously interrupted; unrelated infrastructure is not reused. True OS widgets remain outside scope; the web verse card is implemented.

Local Chromium installation remains unavailable, including the 1.64.0 browser-download attempt. Browser execution is verified in GitHub Actions. Physical microphone/device testing and local browser execution are not claimed.

## Next action

Run the combined source-study candidate through its complete 336-case browser/persistence gate and inspect Greek/edition evidence. Release PR #32 first, then merge this increment only after its own successful exact-candidate CI and verify its public source receipt. PR #31 is already independently verified live.
