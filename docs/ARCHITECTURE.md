# Architecture

React and TypeScript render a hash-routed static app. Vite builds for `/Adigun-AiBible/`; GitHub Actions publishes only validated production artifacts. `product.config.json` adapts the HB universal-product contract and records only actual enabled capabilities.

## Public source data

Pinned importers preserve publisher wording, Unicode and numbering. `src/data.ts` separates Bible editions and the Quran corpus. Search runs in an edition-specific web worker. Historical catalog records are distinct from imported reading corpora. The imported Bible baseline remains 66 books; historical titles do not extend its canon.

`src/editorial.ts` validates exact source dependencies, rights, named human reviewers and content hashes. The publisher resolves installed source IDs directly from source files, rejects substitution and failed purported approvals, and emits a compact public artifact. The browser validates that artifact before displaying reviewed records. Changing a source edition does not transfer a review to different wording.

## Private study

One application-specific IndexedDB store contains notes, bookmarks, highlights, question journals and plan progress. Preferences and last reading position use namespaced localStorage keys. Reference identity includes edition and range, with legacy English keys preserved. JSON backups validate before merge; Markdown notebooks preserve private writing even when source excerpts cannot be loaded offline.

This storage is not encrypted by the app. GitHub Pages projects under the same user domain share an origin: namespacing prevents accidental collisions, not access by another compromised same-origin app. Select a separate product origin before sensitive cloud-linked workflows. No analytics or personal-data telemetry is installed.

## Offline updates

The build finalizer hashes the shell and every source file. Downloads stage into app-scoped versioned caches, verify bytes and SHA-256, and become visible only after a complete pack marker is written. Failed or cancelled downloads preserve prior packs. An update stages already downloaded material and waits for the user's save-and-update action; study data is outside disposable source caches.

## Connected boundary

See [connected services](CONNECTED_SERVICES.md). The static release has no active backend project or model endpoint. Prepared Supabase-compatible SQL and server handlers are isolated from the browser build. Provider credentials, membership checks, moderation and quotas belong on the server. Runtime database authorization tests must pass before activation.
