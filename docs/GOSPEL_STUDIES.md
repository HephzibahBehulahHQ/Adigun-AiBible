# Private Gospel studies

Open **Study Tools → Gospel comparison**, then expand **Private Gospel studies**. Select two to four Gospel panes, enter a title and private notes, and choose **Save Gospel study**. The original reader passage remains separate.

## Saved selections

A saved study retains pane order, linked or independent settings, each pane’s retained independent range, effective edition/range, source SHA-256, verified edition/book labels, title, notes and timestamps. Opening a saved study checks those exact source revisions. An unavailable or changed source fails visibly; another edition or newer wording is never substituted. Source numbering gaps remain visible.

Saved studies do not automatically replace an explicit comparison URL on startup. Choose a saved study to open it. Previous/next changes all panes together. Move a saved study earlier or later to arrange your sequence. The Sower ranges remain the supplied, editorial-review-pending selection; personal pane placement establishes no reviewed relationship or chronology.

## Private writing and conflicting saves

The notebook is device-local, without cloud synchronization or encryption. Its IndexedDB database is `adigun-aibible-gospel-notebook`, version 1, store `workspace`, key `private`. Browser storage is best effort, and applications on the same GitHub Pages origin share an origin.

Saves report success only when the transaction completes. Storage denial, quota failure, aborted writes and stale-tab conflicts retain the editor. Reloading saved studies refreshes the saved list without replacing the draft. If another tab changed the active study, reopen its saved version or choose **Save draft as new study**; reloading alone does not authorize overwriting newer writing.

Delete removes the selected saved study while preserving source downloads and other workspaces. Undo restores the actual deleted record and its place without overwriting an existing identifier. Undo remains available until the next saved change. Unsaved writing and pending writes protect navigation and service-worker updates. Readonly startup does not prevent leaving the workspace.

## Backups and recovery

**Export Gospel backup** downloads saved studies in the versioned `adigun-gospel-notebook` JSON format. It includes private writing, pane settings and source references, with no copied Scripture. Other workspaces have their own backups. This notebook accepts at most 100 studies and 2 MiB of validated UTF-8 JSON, with 160-character titles and 12,000-character notes.

**Import Gospel backup** validates size, schema, identifiers, dates and source identities before showing new, identical and conflicting records. Keep-device/use-backup choices apply only to matching IDs. Unrelated studies remain in place; new studies follow backup order. Sources and the storage revision are checked again when committing. Malformed, forged, changed-source and concurrent-write inputs cannot silently replace saved studies.

**Download draft text** is independent of storage, source access and publisher notices. It retains current title, notes, selected references and available saved source pins as a plain-text recovery file. It is explicitly not an importable source-validated backup and does not mark the draft saved.

Source preparation for saving, import or export can be cancelled. An abandoned response cannot later save, download a notebook or replace an import preview. Once an IndexedDB commit starts, it remains protected until the transaction settles.

## Scripture notebooks and offline reading

**Export study notebook** rechecks the selected source revisions, labels and document-export rights. Markdown separates exact Scripture from user writing, includes explicit missing/empty source positions and preserves attribution. Where an edition has a complete publisher notice, its exact bytes and checksum are verified and included. Missing or altered notices stop export; the draft-text recovery control stays available.

Use **Offline Gospel reading** to download the current source books, permissions and notices. Source downloads and private studies are separate: both are needed to reopen a saved study’s Scripture offline. Removing source downloads does not delete private writing. An undownloaded edition remains unavailable offline.

## Acceptance

Model, storage and source checks live in `tests/gospel-study-*.test.mjs`; browser acceptance lives in `tests/gospel-notebook.browser.spec.ts` and the existing `tests/gospels.browser.spec.ts`. They cover real source gaps, exact pins, conflicts, cancellation, failed transactions, complete export notices, offline reload, keyboard behavior and narrow layouts. See [current status](agent/PROJECT_STATUS.md) for the exact candidate and release evidence. No automated check constitutes human editorial/native-language approval.
