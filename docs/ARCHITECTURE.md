# Architecture

React and TypeScript render a hash-routed static app. Vite builds for `/Adigun-AiBible/`; GitHub Actions publishes only validated production artifacts. `product.config.json` adapts the HB universal-product contract and records only actual enabled capabilities.

## Public source data

Pinned importers preserve publisher wording, Unicode and numbering. `src/data.ts` separates Bible editions and the Quran corpus. Search runs in an edition-specific web worker. Historical catalog records are distinct from imported reading corpora. The imported Bible baseline remains 66 books; historical titles do not extend its canon.

`src/editorial.ts` validates exact source dependencies, rights, named human reviewers and content hashes. The publisher resolves installed source IDs directly from source files, rejects substitution and failed purported approvals, and emits a compact public artifact. The browser validates that artifact before displaying reviewed records. Changing a source edition does not transfer a review to different wording.

## Private study

The original application-specific IndexedDB store contains notes, bookmarks, highlights, question journals and plan progress. Preferences and last reading position use namespaced localStorage keys. Reference identity includes edition and range, with legacy English keys preserved. JSON backups validate before merge; Markdown notebooks preserve private writing even when source excerpts cannot be loaded offline.

This storage is not encrypted by the app. GitHub Pages projects under the same user domain share an origin: namespacing prevents accidental collisions, not access by another compromised same-origin app. Select a separate product origin before sensitive cloud-linked workflows. No analytics or personal-data telemetry is installed.

## Offline updates

The build finalizer hashes the shell and every source file. Downloads stage into app-scoped versioned caches, verify bytes and SHA-256, and become visible only after a complete pack marker is written. Failed or cancelled downloads preserve prior packs. An update stages already downloaded material and waits for the user's save-and-update action; study data is outside disposable source caches.

## Connected boundary

See [connected services](CONNECTED_SERVICES.md). The static release has no active backend project or model endpoint. Prepared Supabase-compatible SQL and server handlers are isolated from the browser build. Provider credentials, membership checks, moderation and quotas belong on the server. Runtime database authorization tests must pass before activation.

## Expanded local workspaces

Private study, family originals and listening queues use separately namespaced versioned IndexedDB stores. Family and listening writes compare the last saved revision inside a read/write transaction; a stale second tab must reload rather than overwrite newer data. Save success is reported only after transaction completion. A family backup preserves original bytes, checks their SHA-256 and validates declared media types, limits, consent metadata and record identities before presenting a collision preview.

Family recording uses the browser MediaRecorder API only after an explicit permission action. Leaving, canceling or hitting the size/time limit closes microphone tracks. Family form changes and pending writes participate in navigation and service-worker update guards. Private files are never placed in public source caches or committed data. Invitations, remote access revocation and account recovery are unavailable until the dedicated service exists.

The listening engine loads the pinned source revision, rechecks speech rights and selects an actually reported matching-language voice for each queue item. Network voices require a separate per-visit choice. Cancelable run and utterance identities reject late load/speech callbacks. Progress is a verse position, not a claimed word-level audio timestamp. Timers are browser-dependent; no background or native playback guarantee is made.

Passage cards paginate immutable source slices, preserve combining characters and source attribution, and recheck each edition’s export permission. Optional bilingual output pairs explicit verse numbers with an alignment qualification; missing source positions stop export. Audio and card modules load on demand.

The support directory uses explicit country selection, primary-service links and verification dates. It does not infer country, store moods, send messages, or contact a service automatically.


## Gospel notebook

The single `src/gospels/` route retains its gap-aware exact-source reader. Its separate versioned IndexedDB notebook stores complete pane selections and source pins, never copied Scripture. Writes compare an atomic database revision and the editor’s original row; reloading the list cannot silently authorize a stale overwrite. Source preparation uses cancellable operation identities, while committed writes remain guarded until transaction completion. JSON import previews are revalidated before commit. Markdown exports require document-export permission and complete checksum-verified publisher notices; independent plain-text draft recovery requires neither source access nor a working database. See [private Gospel studies](GOSPEL_STUDIES.md).
