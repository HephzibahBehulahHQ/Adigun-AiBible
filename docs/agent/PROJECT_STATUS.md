# Project status

## Active continuation — 5 November 2026 (Europe/Berlin)

- Repository: `HephzibahBehulahHQ/Adigun-AiBible`.
- Last verified production: `1198bfcbff5aba6d27a9b22195d37c77635e2299`, PR #30, [main workflow 42024305370](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42024305370). Independent public verification at 12:18:21 UTC confirmed that source, build `8f30becf3385963714bcd6e8`, the fourteen-edition catalog and exact OSHB manifest bytes.
- Live URL: https://hephzibahbehulahhq.github.io/Adigun-AiBible/ . `build-info.json` is the public source receipt.
- Source release [PR #31](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/31): verified head `7ce04cb2ac52f3ac3070852a7b02d452cd417244`; [workflow 42032766361](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/actions/runs/42032766361) passed. Final artifact review, merge and public deployment verification remain to be completed.
- Private retelling [PR #32](https://github.com/HephzibahBehulahHQ/Adigun-AiBible/pull/32): verified head `f21c616f5032dbe451c3aa35e7439c9eb9a43369`, draft based on the source-release branch. Retarget to main after PR #31; its complete browser/release gate is required.
- Current integration branch: `codex/source-study-continuation-20261105`. Last verified checkpoint `12ff10a9931171942cdf0cddc77b75ae49736b91`, confirmed by git ls-remote at 13:13 UTC. The current local continuation merges the separately verified three-edition branch `ea615c776bd1e7dbdacfc3f01908fb18d739a63b` into that Greek/audio base; the next remote checkpoint follows integration checks.

## Verified base release

PR #31 brings the reader to 26 Bible editions, 23 beyond the original three, across 17 source languages. It adds twelve exact full-text sources, correct Arabic/Myanmar font/direction handling and complete original font notices. All 373,275 added verse records were reconstructed from pinned archives. Earlier source, dictionary, Hebrew, historical, private-study and advanced-workspace releases remain included.

Exact-candidate CI passed 449 application tests, 20 backend contracts, TypeScript, lint, source validation, the production build, all 268 desktop/mobile browser cases and ten persistence repetitions. All 1,742 source envelopes matched 342,735,000 canonical bytes. The earlier failures identified obsolete acquisition/search assumptions and Playwright 1.62.1's documented offline-state bug; pinned 1.64.0 passes strict offline document-reload and uncached-network assertions. New source staging is outside public assets, and finalization rejects any leaked staging tree. Actual downloaded PNGs provide export evidence without floating page controls.

## Private retelling candidate

Optional consent-based local microphone originals, exact playback/download, manual transcripts, complete backups, atomic restore/delete/Undo and unsaved-draft/capture protection are implemented. Stable recording IDs preserve transcript drafts during concurrent deletion/reordering; rescheduling keeps the selected card. Arabic/Myanmar source review preserves its actual typography; personal writing uses automatic direction.

Candidate `dca1024854610d54bbe7154e99be5cdabc4eb469` passed all 472 application tests, 20 backend contracts, source validation, TypeScript, lint and production build. Current `f21c616f` also includes the source staging/browser repair; Playwright 1.64.0 collects all 290 browser cases, including 22 retelling cases. Actual execution and screenshot review remain required. No automatic transcription, spoken-language scoring or physical microphone acceptance is claimed.

## Combined Greek and three-edition study candidate

Greek branch `d09ab41dab433441ecddc2794ae1451463bae4b0` is integrated. Its separate 27-book/260-chapter/7,927-verse/137,554-token source supports exact token/parsing inspection, literal within-book lemma pages, independent source navigation and complete-license atomic offline books. The selected Bible edition/range is preserved; translated-word alignment is not inferred. The isolated candidate passed 50 focused checks, TypeScript/lint, source validation and a packaged build; all 36 served Greek files matched canonical bytes. Its 22 desktop/mobile cases remain for combined CI. See [Greek study](../GREEK_STUDY.md).

Three-edition branch `ea615c776bd1e7dbdacfc3f01908fb18d739a63b` adds BPC French Darby 2024 v2.0, Simple Spanish 2026 and the CC BY-SA 4.0 Tandroy publisher draft. The combined reader has 29 Bible editions, 26 beyond the original baseline, 18 source languages and 19 exact tags retained for filtering. All 93,353 added records preserve exact source numbering, gaps and notices. Complete archive reproduction, 38 focused checks including five Python negatives, TypeScript/lint, source validation and compact production build passed in isolation. The final edition branch adds 22 browser cases. Tandroy remains visibly a publisher draft; source text permission does not authorize recordings or model training. See [source admission evidence](../NEXT_CLASSICAL_BATCH.md).

The complete combined candidate still needs its own full application/backend/source/build/browser checks, screenshot inspection and public release receipt. Source integrity and implementation checks do not establish human/native-language approval.

## Remaining scope and access constraints

Full Version 3 is not complete. The [feature matrix](../FEATURE_MATRIX.md) and [next tasks](NEXT_TASKS.md) retain the 100+ additional-edition target, translated interlinear alignment, wider speaker/relationship study, remaining adaptations/multiplayer flows, historical content and complete localization.

Independent human editorial/native-language review, restricted source rights, dedicated backend/provider configuration, permitted recorded narration and physical two-device offline validation remain separate dependencies. Backend setup was previously interrupted; unrelated infrastructure is not reused. True OS widgets remain outside scope; the web verse card is implemented.

Local Chromium installation remains unavailable, including the 1.64.0 browser-download attempt. Browser execution is verified in GitHub Actions. Physical microphone/device testing and local browser execution are not claimed.

## Next action

Synchronize and check the combined source-study candidate. Complete PR #31's final review and deployment verification, then retarget/release PR #32 and the combined Greek/three-edition increment using their exact successful CI and public source receipts.
