# Hebrew and Aramaic source study

## Integration API

Lazy-load the default export from `src/original-language/HebrewStudyWorkspace.tsx` on the `hebrew-study` view:

```tsx
<HebrewStudyWorkspace locale={preferences.locale} />
```

The only optional prop is the application's `Locale`. The title supports English, German and Yorùbá; the interface explicitly discloses that source descriptions and technical controls currently remain in English. Source text, descriptions and notices are never machine-translated or normalized. This scope adds no App, route registry, navigation, coverage or global-document changes.

The view retains the Bible path, selected edition, starting verse and complete ending verse. Its own `oshbBook`, `oshbChapter` and `oshbVerse` hash query keys select OSHB source coordinates. Local source changes use `history.replaceState` and preserve unrelated query bytes and existing history state. Hash changes and browser back/forward restore and validate source coordinates. Reloading a downloaded selected book reopens the same source passage. Missing source keys default to the first source book/chapter/verse, independently of the Bible reference; invalid or repeated keys cause an explicit error instead of guessing a translation alignment.

## Exact source and trust boundary

The source is the separately imported Open Scriptures Hebrew Bible, pinned to upstream revision `3d15126fb1ef74867fc1434be1942e837932691f`. The manifest pin is `effcc95ce66eb9a1dde1fbe5692f99caa0d66b6a86c2ea8de7e57b0d33b918b9` (954,363 bytes). Its provenance is in `data/original-language/oshb/source.json`; the original work is attributed exactly as supplied. The upstream text is declared public domain and lemma/morphology annotations are CC BY 4.0. The complete license and source/morphology notices remain available and are included in downloads.

`source.ts` imports the immutable-at-build integrity ledger, with explicit trust anchors for the manifest, provenance file and ledger itself. Newly fetched metadata cannot approve its own changed hashes. Every source response is streamed under its exact pinned length and the 4 MiB per-file ceiling, SHA-256 checked, and decoded as strict UTF-8 JSON before use. The largest current book is Jeremiah, 3,206,631 bytes. Rejected, truncated, oversized or changed files fail closed. Cancellation checks cover requests, stream reads and digest completion; cancellation does not wait indefinitely for the unused branch of a cloned stream.

The manifest validator checks all 39 source identities, 929 chapters, 23,213 verses, source chapter/verse lists, exact output pins and attribution/license identity. Each loaded book must contain the complete matching chapter/verse identities in source order. Word IDs must be unique within the book. Displayable tags, nesting, attributes and types are allowlisted with bounded node counts, strings, arrays and depth. The header is retained as supplied but never rendered as HTML.

The loader retains at most two fulfilled book objects plus one verified manifest and morphology key. Pending/failed loads never occupy fulfilled-book cache slots. Clearing the cache changes its generation so an older completion cannot repopulate it; failures never delete a newer successful load. UI request generations, abort controllers and source-identity checks prevent an old book from appearing under a newer selection.

This source currently travels as raw canonical JSON at its existing OSHB paths; it is not covered by the translated-Bible transport packer's uppercase book-path rule. `verifiedSourceBytes` and `parseSourceBytes` expose an explicit boundary for any future codec. A transformed body that no longer matches these pins is rejected until a deliberate, tested source-transport contract is added. Canonical corpus files are unchanged by the viewer.

## Reader and annotation behavior

The main line renders only main source words, segments and original strings, in RTL order. Source strings remain code-point exact: slashes, Hebrew pointing, accents, whitespace and nested special letters are not normalized or stripped. CSS collapses source indentation for visual layout without rewriting DOM text; word content retains its own whitespace. Large, small and suspended letter segments retain their source types and receive corresponding visual treatment. Keyboard-operable word buttons and a separate accessible word list expose each original word ID, full lemma field, raw morphology code, `n` and `type`.

Notes, catchwords and reading alternatives are displayed separately from the main text. Ketiv stays in the supplied main line. Qere and accent alternatives remain separately labelled, including all source strings and nested segments. Six source qere readings have empty content arrays and explicitly say, “The source supplies an empty qere reading.” Twenty-four qere readings have two words and 1,230 have one. No variant disappears because it lacks a word node.

The word inspector uses exact descriptions from `morphology.json.codes`, including leading spaces. Eight codes affecting nine source words are absent from the supplied key. They remain raw and explicitly unknown. No inferred gloss, transliteration, pronunciation or automatic translation alignment is added. Optional historical-dictionary links are not implemented in this increment, and the interface does not imply that dictionaries have been downloaded.

Exact lemma lookup compares the complete supplied lemma field with strict string equality inside the loaded book's main text. Prefixes, slashes, spaces and qualifiers remain significant. It reports both total occurrences and distinct source verses, presents at most 25 results per page, and navigates directly to the original source word. Reading alternatives are excluded from these counts. No stem equivalence or translated-meaning equivalence is claimed.

## Verified offline books

`downloadSourceBook` uses the existing atomic pack API with a source-specific book pack ID. A selected book requires ten pinned files: the book, source manifest, provenance, integrity ledger, morphology key and all five source/license/morphology notices. Before downloading, inventory records must match the compiled source pins. After the atomic commit, the actual cached bytes are checked again.

`verifySourceDownload` performs read-only checks against current-version committed packs and the current content cache; it never fetches missing source files. Uncommitted staging, old versions, oversized/malformed pack markers and filenames without valid bytes do not count as verified. Every required response must satisfy its own exact length and SHA-256, so a corrupted license or missing morphology key prevents a complete-offline claim. Marker parsing is capped at 2 MiB and 16,384 member paths; source bytes remain capped independently.

Downloads can be cancelled, and the application update event is blocked only while a source storage transaction is active. A failed or cancelled pack does not replace an existing complete pack. Leaving the component aborts requests and prevents stale completion messages. Removing a selected book uses the existing scoped removal API; other source books, shared notices, Bible editions and private user data remain outside that removal. The shared pack migration and service-worker contracts are unchanged.

## Verification and release limits

Focused Node tests validate every actual book without changing its serialized object, all 143,471 NFC-sensitive word-content strings and 143 additional sensitive reading/catchword strings, qere counts, nested large letters, exact Genesis data, unknown morphology, complete identities, exact lemma pagination, hash/length failures, rejected fetches, stream cancellation, bounded fulfilled caching, source-only URL state and atomic download verification/removal. In Genesis, exact field `430` yields 179 main-text occurrences in 160 distinct verses over eight pages.

`tests/hebrew-study.browser.spec.ts` provides desktop/mobile release gates for actual rendered Unicode, keyboard access, 320px reflow/screenshots, empty and multiword qere, unknown morphology, complete lemma pages, independent source navigation, real offline reload/removal, hash history, source corruption, delayed stale requests and download/update cancellation. These tests require root's route integration and the exact built application artifact. Browser execution and screenshot review are CI gates; no local Chromium run is claimed. Automated corpus/permission checks do not constitute human editorial or native-language approval.
