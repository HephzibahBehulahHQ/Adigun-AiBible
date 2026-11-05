# Extended source and device coverage

`ExtendedCoverage` supplements the existing edition and editorial tables. It reads public metadata only; it never opens private study, family, prayer, note or interpretation databases. Counts are separate measures, not a combined completion percentage.

## Integration

Import the component from `src/editorial-workbench/ExtendedCoverage.tsx` and render it on the Coverage Explorer's coverage tab:

```tsx
import ExtendedCoverage from './ExtendedCoverage';
import { historicalCatalog } from '../historical/catalog';

<ExtendedCoverage catalogOnlyWorks={historicalCatalog}/>
```

The optional `catalogOnlyWorks` prop accepts the canonical historical catalog's `{id, title}` records. Missing input is **Unknown**, while an explicitly supplied empty array is zero. The parent owns the shared catalog and route integration; this increment changes neither.

## Count definitions and sources

| Measure | Source and interpretation |
| --- | --- |
| Publisher speaker spans | `data/speakers/publisher-coverage.json`, validated against per-book sums, source revision and each installed Bible manifest. Spans and verse records are distinct. |
| Independent approved speaker spans | Validated public publication plus `loadReviewedSpeakers`; changed or unavailable source wording is excluded and reported. Publisher markings never create approval. |
| Context research | The validated `src/context/records.ts` registry supplies draft setting records and distinct book counts. Separately published approved `context` records exclude speaker payloads and retain the publication's edition scope. |
| Historical reading | `data/historical/manifest.json`, including display permission, source revision, chapter/unit counts and transcription status. Metadata-only external catalogs are counted separately. |
| Historical dictionaries | `data/linguistics/manifest.json`; source commit, unique dictionaries, number-record/headword totals and language subtotals must agree. Unused numbers are preserved. No occurrence alignment or approved modern translation is implied. |
| Authored experience pilots | Existing Athens, blind-interpretation, decision-simulation and detective registries. Generic tools and user-created records are not counted as authored pilots. Presence does not imply human approval or all ten experiences being complete. |
| Recorded audio | Public audio files in the current content manifest, separate from device-reported local/network voice counts. Private recordings are excluded. No speech or microphone capture starts here. |
| Configured services | `buildServiceInventory` declares the actual current local-only client: accounts, cloud sync, connected circles and model gateway are unconfigured. This is not a live service-health probe. Wiring a future real client must update these declarations alongside its activation gates. |
| Offline content sets | Exact required book/search/source/notice paths derived from source manifests. Current source operation rights must permit display and offline use. Complete sets require byte counts and SHA-256 matches; missing notices, corrupt data and unverified permissions cannot count as complete. |

Each independently loaded metadata family can fail without concealing available coverage. Failed or unavailable inputs remain Unknown and have visible errors; refresh retries metadata requests. A missing edition manifest remains an unknown offline row rather than shrinking the denominator to zero.

## Offline boundaries

Cache inspection is read-only and begins only when the visitor selects **Check cached content packs**. It reads this application's current content cache and committed current-version packs. Staging caches without completion markers, older releases, other apps, query-string entries and files outside the manifest are excluded. Shared files are hashed once per inspection. Cancellation stops inspection without presenting partial work as a complete count.

The display verifies content sets, not an offline application launch. Files exported outside browser caches, including standalone Athens HTML study packs, cannot be inspected. Browser voice reports and an installed PWA do not establish successful physical two-device offline operation.

## Verification

`node --test tests/extended-coverage.test.mjs` covers source-revision drift, inconsistent/duplicated totals, Unknown versus zero, required notices/search files, permission withdrawal, missing-manifest denominators, cache scope/staging/version isolation, corrupted content, deduplicated checks and cancellation.

`tests/extended-coverage.browser.spec.ts` adds desktop/mobile inventory checks, 320 CSS px reflow and screenshots, independent metadata failure/retry, and a real historical download followed by controlled notice corruption/removal. These isolated cache mutations stay in browser test profiles. They do not certify physical-device offline operation. Browser execution and deployment receipts belong in the root release record.
