# Speaker evidence layers

`publisher-coverage.json` counts only the imported publisher's `wj` character spans after the existing source-structure validator accepts their Unicode code point offsets. It is tied to each exact edition checksum. Zero means no such metadata in the imported source; it is not an attribution of silence or a human-reviewed speaker map.

Rebuild after a permitted source import with `node src/speakers/audit.mjs`. The speaker tests compare this inventory with the actual installed books.

Independent annotations use the `SpeakerPayload` and `SpeakerAnnotation` contracts in `src/speakers/model.ts`. A correction export is an **unapproved draft**. Its `editorialDraft` can be entered into the existing editorial queue as `kind: context`, with the `adigun:speaker-annotation:v1` source tag and the exact canonical payload string. The existing publication process still requires an actual active human reviewer, a current content hash and resolved source evidence. Do not edit the publisher corpus or add an approval merely to activate this feature.

The browser accepts independent annotations only from the existing validated publication object and then rechecks their edition checksum, exact verse-text hash and character boundaries. A local proposal, uploaded backup or self-declared review cannot activate the reviewed collection. Private corrections live in an app-scoped IndexedDB database and are never included in this public directory.
