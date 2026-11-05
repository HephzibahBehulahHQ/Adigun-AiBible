# Private retelling recordings

This increment adds optional local microphone recording to the existing **Personal workspace → Memorization → Write a retelling** flow. It uses the same cards, private writing, backup controls and Undo action. Written retellings, spaced review scheduling and all other workspace collections remain supported.

## User flow and privacy

The reader explicitly consents for each new recording before microphone access. Start, stop, keep and discard are separate actions. A completed recording stays in the form until **Save private retelling** commits both its metadata and original bytes. Permission denial, an unavailable microphone or an unavailable exact source revision leaves writing available. A recording may be saved without a transcript; the UI explicitly says when no manual transcript has been added. Later manual transcript edits preserve the original audio.

Playback uses native browser audio controls without autoplay. Original download retains the exact bytes, MIME and SHA-256. A browser that cannot play the format still offers the original download and manual transcript. Source narration and other audio are stopped before microphone capture. All tracks and timers are released on stop, cancellation, error, device interruption and unmount. A late permission result or preparation callback cannot revive a canceled session. Internal card/mode/tab navigation, page navigation, unload and service-worker updates protect active capture and unsaved drafts.

Audio is stored in this browser on this device, with no transcription, network upload, voice cloning, automated feedback, language assessment or score. Browser storage is not described as encrypted or backed up remotely. Native microphone support and playback codecs remain browser/device capabilities; the software does not claim a human microphone acceptance test.

## Schema and persistence

| Boundary | Contract |
| --- | --- |
| Workspace state | Schema version 2; accepts and validates version 1 data additively. Existing `{at,text}` retellings keep their exact writing and acquire no invented ID or source hash. |
| New retelling | Stable `id`, timestamp and writing; an optional `recording` holds original filename, actual MIME, byte count, SHA-256, elapsed capture time and exact source reference/edition revision. |
| Device storage | Existing `adigun-aibible-workspace` IndexedDB database, version 2; existing `workspace` store plus additive `retelling-audio` store keyed by recording ID. |
| Write API | `commit(change)` remains compatible. `commit(change, media)` supplies verified originals. `saveWorkspaceWithMedia` returns the committed state, previous state and removed originals for Undo. |
| Read/export API | `readWorkspaceSnapshot()` obtains metadata and all originals in one readonly transaction, then verifies their inventory, sizes, MIME signatures and hashes. `loadRetellingMedia` verifies the requested original against its exact saved metadata. |
| Complete backup | `completeWorkspaceBackup(snapshot)` produces a version 2 JSON Blob containing workspace state and chunk-encoded original audio. `readCompleteWorkspaceBackup(file)` validates before any device write. Version 1 text backups remain accepted. |

Every write reads and compares the expected workspace revision in the same transaction that changes metadata and audio. Hashing happens before the write transaction. A second revision check prevents changes made during preparation from being overwritten. Successful results are published only after transaction completion. Quota failures, aborts, stale revisions, corrupt originals and malformed imports do not replace existing data or clear the current unsaved form.

Originals must correspond exactly to live recording references: no missing originals, orphan files, duplicate IDs, metadata substitutions or mismatched source bindings are accepted. Deleting a recording, retelling, card or complete workspace removes its originals atomically. One-step Undo carries removed bytes in memory and restores them atomically. The next successful change, reload or leaving the workspace releases that Undo snapshot. An old version 1 tab closes on database version change; attempting to reopen at version 1 fails rather than silently dropping attachment fields.

Manual transcript drafts bind to the stable retelling ID and exact original recording metadata. Deleting or reordering another entry cannot redirect or close that draft. If the original was removed or replaced, its transcript remains visible and can be copied or moved into a new written retelling without overwriting an existing draft. Switching to another transcript asks before discarding changed writing. The selected memory card also stays selected when its review date changes, so sorting the practice list does not silently unmount its editor.

## Bounds and portable recovery

- **Per recording:** 8 MiB and at most five minutes of measured microphone capture time.
- **Retained device audio:** 32 MiB across the personal workspace.
- **Writing/metadata:** existing 12 MiB portable-metadata bound and 50 retellings per card.
- **Complete JSON backup:** 64 MiB, including base64 expansion. Bytes, encoding, declared sizes, identities, reference closure and hashes are checked before import.

The capture deadline requests a stop one second before five minutes to allow ordinary event scheduling. If a suspended browser delays the measured stop beyond five minutes, that recording is discarded and the writing remains. Capture time is explicitly **elapsed microphone time**, not a claim that decoded media duration was independently measured.

Restore keeps the existing per-record conflict choice: keep device records or use imported records. Only original audio belonging to the selected merged records is committed. Import previews never write to device storage. Complete export captures a consistent saved revision; current unsaved forms are excluded and the UI says to save them first. Readable notebook export includes writing, manual transcripts and source identity but explicitly excludes audio bytes. The legacy text-only `workspaceBackup` helper refuses to omit audio silently.

## Verification and remaining release gate

Focused checks cover legacy migration of all five private collections and their histories; exact source identity; invalid MIME/signatures, sizes and hashes; complete and multi-megabyte backup roundtrips; duplicate/missing/orphan/tampered imports; two-store transaction completion and rollback; concurrent writes; recording/card/workspace deletion and Undo; explicit restore conflicts; consent, denied/pending permissions, time/byte limits, device interruptions and cancellation/unmount races. Existing written-retelling, workspace and family regressions are included in the focused command:

```sh
node --test tests/retelling-media*.test.mjs tests/retelling-transcript.test.mjs tests/retelling.test.mjs tests/workspace*.test.mjs tests/family.test.mjs
npm run typecheck
./node_modules/.bin/eslint src/workspace
```

`tests/retelling-media.browser.spec.ts` provides ten acceptance scenarios in both configured desktop/mobile projects. It uses controlled permission outcomes with real browser `AudioContext`, `MediaStream` and `MediaRecorder` originals; tests offline reload/byte-exact backup/restore/delete/Undo, manual transcripts and native playback, stale draft recovery, injected quota failure, actual IndexedDB upgrade and old-client rejection. Regression scenarios cover transcript switching/deletion, a removed original after a competing-tab save, and card retention after rescheduling. Desktop/mobile and 320 px screenshots are emitted. These fixtures contain synthetic audio, not human voices.

The originating increment passed 53 focused Node tests, TypeScript and workspace ESLint. The subsequent transcript-safety fix passed 26 focused capture/storage/backup/transcript tests, TypeScript, scoped ESLint and strict browser-test type checking; Playwright collected 20 desktop/mobile cases. Browser execution and screenshot inspection run in root CI; local browser execution, physical-device microphone acceptance and independent human/editorial/spoken-language review are not claimed. Any future model transcription or automated interpretation remains a separate feature and permission boundary.
