# Private retelling recordings

Implementation is in progress on `codex/private-retelling-audio-20261105`, based on `0f86f30f9ee9415ceeaf8c6eb2c1e7d5e6df925d`. This is not a completion or release claim.

## Integrated design and boundaries

The existing Personal workspace → Memorization → Write a retelling flow gains optional local microphone recording, native original-audio playback/download and a manual transcript. Written retellings, review scheduling and all other workspace records remain intact. No transcription, network upload, voice cloning, automated feedback, language assessment or score is introduced.

Workspace state and backup schema version 2 retain legacy version 1 records without inventing source hashes. New audio entries bind their exact edition/reference/source revision. IndexedDB version 2 adds a `retelling-audio` store in the existing `adigun-aibible-workspace` database. Workspace metadata and referenced audio are saved/deleted/restored in one revision-checked transaction. One-step Undo retains removed original bytes until the next successful change or reload.

Limits are five minutes elapsed capture time and 8 MiB per recording, 32 MiB retained audio, the existing 12 MiB metadata bound and a 64 MiB complete portable backup bound. Capture time is not a claim that decoded media duration was independently verified. Original bytes, MIME and SHA-256 remain unchanged through persistence, playback, download and backup.

Full backups include original audio. Legacy text-only backups remain importable. A readable notebook contains writing, manual transcripts and source references; it explicitly excludes audio. Quota errors, aborts, corrupt imports and stale revisions must preserve saved data and unsaved drafts.

## Acceptance work remaining

Implement and verify the complete storage/Undo/backup/UI path together. Add focused model, migration, atomic-storage, bounded-backup, recorder-lifecycle and offline browser coverage. Browser execution and 320 px screenshot review run in root CI. Independent human/editorial/spoken-language review and any future model transcription are separate gates.
