# Edition word and phrase concordance

This implements the surface-word concordance slice of Version 3 §10 using existing installed Bible sources. It does not complete occurrence-linked original-language study, morphology, interlinear alignment, Strong’s alignment or a scholarly concordance. No new source text, translation, reviewed teaching, remote service or private storage is introduced. Quran sources remain in their separate workspace.

## Integration API

`src/concordance/ConcordanceWorkspace.tsx` exports a default React component:

```tsx
import ConcordanceWorkspace from './concordance/ConcordanceWorkspace';

<ConcordanceWorkspace
  reference={current}
  locale={prefs.locale}
  onOpenReference={openPassage}
/>
```

`reference` and `onOpenReference` use the existing reader `Reference` type. `locale` is optional, defaults to `en`, and uses the existing `Locale` type. Controls are explicitly English; Bible text retains the edition’s source language. The initial selected edition follows `reference.editionId`, defaulting to `eng-web`. Edition changes inside this workspace remain local until a result opens in the reader.

Root owns route, lazy import, command and navigation integration. Target route:

```text
#/concordance/<BOOK>/<chapter>?verse=<n>&edition=<id>
```

No App, routing, global documentation or existing data files are modified by this branch. The browser scenarios expect the root route integration. A lazy component import is appropriate: the source index and worker are loaded only when the workspace is used, and an index is requested only when the reader starts a count.

## Matching contract

- **Exact word:** one complete source token, not a substring or a lemma. `love` does not match `beloved`.
- **Consecutive words:** one to eight adjacent source tokens within the same verse. Other punctuation and spacing separate words; their literal spelling is not part of phrase matching. Phrases never cross a verse boundary.
- A token begins with a Unicode letter or number and includes following letters, numbers and combining marks. Internal straight or curly apostrophes are retained; those two apostrophes are distinct. Hyphens separate tokens. These are documented surface-token rules, not a claim of linguistic segmentation for every language.
- Tokens are normalized to NFC for canonical Unicode equivalence. Case is ignored using Unicode lowercase unless “Match letter case” is selected. Accents are never removed. No synonym, stem, root, transliteration or semantic expansion is performed.
- Every matching token start counts, including overlapping phrases. In `one one one`, `one one` has two occurrences within one matching verse. Overlapping highlight spans are merged only for display.
- Authoritative source strings are never normalized or rewritten. Highlight positions are exact JavaScript UTF-16 offsets into the original string. React text rendering preserves the source and escapes markup.

## Source and permission boundaries

`ConcordanceSourceLoader` in `src/concordance/source.ts` is the sole loader. It accepts only current installed Bible IDs. It retrieves the application’s validated offline inventory, verifies the manifest and search-index bytes against that inventory, validates exact edition/revision identity, checks `display` and `searchIndex` permissions, and validates every index reference before returning a usable corpus.

The index must contain exactly the manifest’s actual record inventory, in canonical book/chapter/verse order, without duplicates or another edition’s IDs. Source numbering gaps remain absent. Blank source records are counted as records but contain no words. Actual `verseRecordCounts` are used when supplied; maximum verse numbers are never converted into invented records.

`readConcordanceBytes` bounds a streaming response before joining chunks. An oversized declared body or observed stream cancels its reader when it exceeds the pinned byte count or the 32 MB per-file hard cap, including responses without `Content-Length`. Abort signals also cancel a pending reader. `readVerifiedConcordanceJson` then verifies the exact outer-file SHA-256 and decodes strict UTF-8 JSON. This is the central boundary for a future bounded transport codec; the present release uses the existing raw source contract.

Cache reuse binds the application base URL, content version, edition ID, manifest hash and index hash, and rechecks operation permissions. At most one completed edition index is retained in this worker. A changed source revision or inventory invalidates that cache. Worker termination releases it on workspace exit.

Before opening a result, the workspace resolves its reader passage with the expected source revision and display permission, then compares the complete source verse with the index text. Missing or different context produces an explicit error; another edition is never substituted.

## Counts, paging and unavailable states

The result shows individual word/phrase occurrences, distinct matching verses, actual records searched and a per-book distribution. Scope can be the complete edition, Old Testament, New Testament or a specific installed book. A testament filter requires a known Matthew boundary in the installed book inventory.

Every page counts the complete selected scope, while only 25 matching verse records and their exact spans cross the worker boundary. Pages continue beyond the existing global search’s first-100-results limit. Query length is limited to 200 characters, phrases to eight tokens, source inventories to 100,000 records and individual files to 32 MB. Unsupported sizes fail visibly instead of producing partial totals.

Zero is displayed only after full byte, permission and coverage validation and a completed count. Missing metadata, missing offline files, invalid source records, changed hashes and denied operations produce an unavailable/error state. Cancellation publishes no partial total. Every request has an identity; superseded and late responses are discarded in both the engine and the UI. Counting yields between bounded record batches so the worker can receive cancellation requests.

## Accessibility, privacy and offline use

Controls have explicit labels, native keyboard interaction, 44 px minimum targets and visible focus. Pagination restores focus to the results heading. Counts and progress have a live status; failures have an alert. Source highlights use an underline as well as color. The distribution has an accessible table with headers and caption. Layouts and hashes wrap at 320 px.

The tool writes no query history, personal study schema, analytics or telemetry. Source access uses the app’s existing public-content cache. For offline use, select the edition in the reader, open **Settings → Download complete Bible**, and wait for successful verification. Viewing a few chapters alone does not install the search index. The workspace reports unavailable sources honestly when a complete index or its metadata cannot be retrieved.

## Verification receipts and acceptance limits

- Sixteen focused Node checks pass, including complete manifest/record validation for all fourteen installed Bible editions, repeated occurrences versus matching verses, overlapping phrase spans, Unicode preservation, sparse numbering, scopes, complete pagination beyond 100 matches, denied permission, changed hashes, incomplete content, cache revision changes, late responses, cancellation and bounded stream overrun/abort.
- TypeScript and dedicated concordance lint checks pass, including the bounded-stream update.
- Four Playwright scenarios cover genuine source counts/context, keyboard pagination and 320 px reflow, complete Czech offline search with unchanged Unicode, and cancellation/unavailable sources. They run under the existing desktop and mobile projects: eight browser cases after root integration.
- Browser execution and screenshots are not claimed locally. Root integrates the route and runs the real candidate browser/build/release gates. This module is not live until that deployment is verified.
- No independent human linguistic, editorial or legal approval is claimed. This software computes documented source-token counts; original-language alignment and the broader Version 3 study requirements remain separate work.

The integrated release accepts the common build-only source envelope after verifying the transferred file hash. The shared decoder then verifies the canonical decoded byte count and hash; source record and permission checks remain unchanged. Both raw development JSON and packaged production data use the same counting model.
