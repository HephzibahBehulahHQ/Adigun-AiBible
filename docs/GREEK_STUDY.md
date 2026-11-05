# Greek source-study workspace

## Integration API

Lazy-load the default export from `src/greek-language/GreekStudyWorkspace.tsx` for root's `greek-study` view:

```tsx
<GreekStudyWorkspace locale={preferences.locale} />
```

The only optional prop is the existing application `Locale`. The component imports `greek-study.css` and provides its own page wrapper. Titles support English, German and Yorùbá; technical controls and exact upstream descriptions remain in English, disclosed in the interface. The integration registers the lazy `greek-study` view, tool directory, keyboard command, explicit reading-position recovery and a verified Greek coverage card. Coverage counts the Greek corpus separately from translated Bible editions and leaves unavailable or changed source values unknown. This branch preserves verified source commit `dba6512d8883a94ab986f95955145f21293543dd` in its ancestry and changes no canonical Greek or OSHB data.

`greekBook`, `greekChapter` and `greekVerse` are independent hash query keys. Their values use the actual source book abbreviations and decimal-string numbering. Source changes preserve every existing Bible path/query byte, including edition and full verse range, unrelated parameters and history state. Hash changes and browser back/forward restore the source selection; local selectors use `history.replaceState`. Missing keys default to the first available source coordinates, independently of the Bible context. Invalid or repeated keys and coordinates absent from the source produce an explicit error. An explicit recovery button selects the first Greek source passage.

## Source fidelity and annotation scope

The source is MorphGNT/SBLGNT at `aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d`: 27 books, 260 represented chapters, 7,927 represented verses and 137,554 tokens. Source strings are never normalized, accent-stripped, case-folded, repaired or substituted. The main line preserves each exact `text` field in source order; display spaces separate tokens. All punctuation, brackets and apparatus signs remain literal, including unbalanced source signs. The distinct upstream `word`, `normalized` and `lemma` fields appear separately in the inspector. For example, Matthew 1:2 source line 10 has text `ἐγέννησεν` and normalized field `ἐγέννησε(ν)`.

The inspector exposes source file, source line, within-verse ordinal, all six literal annotation/text fields, and descriptions only from the pinned README grammar key. File plus line is a derived locator, not an upstream word ID. The README leaves case `V` undefined in 668 tokens across twelve parsing codes; it remains raw and explicitly unknown. A dash remains an unexpanded placeholder. This viewer adds no gloss, Strong's link, pronunciation, full apparatus, reconstructed alternative or translated-word alignment.

Source selectors use only represented verse numbers. John 7 ends at verse 52; John 8 begins at verse 12. John 7:53 and 8:1–11 are not manufactured or borrowed from Faithlife's newer text. This absence is disclosed beside the selectors and in invalid-source-link errors.

Exact lemma lookup compares the complete literal field within the loaded book. It reports token occurrences and represented source verses, retains at most 25 result records per page, and navigates to the actual source token. It makes no claim about distinct senses or translation equivalents. Matthew's exact lemma `ὁ` has 2,782 occurrences in 973 represented verses over 112 pages. Whitespace, accents, capitalization and canonical/decomposed Unicode differences remain significant.

## Integrity, memory and request lifecycle

The loader compiles the exact integrity ledger and explicit trust anchors for manifest, source pin and ledger. Manifest SHA-256 is `fcae63c6558b426c5e03497b28617171f330051cc2c5482a220574c381412d80` (218,921 bytes); source pin SHA-256 is `f2e3ebfdad44002721c9070899abcad10c02d785cc27ff50ac08202db66d3c12` (10,198 bytes); ledger SHA-256 is `3b697fa13ff75150020cc727d188d8d6f11502ffcf5a39b2411f0424db5cd694` (5,396 bytes). Runtime metadata cannot approve its own replacement hashes.

Each response is streamed under its exact pinned length and a 4 MiB ceiling, checked with SHA-256, decoded as strict UTF-8 and schema-validated. The shared fixed-block byte reader bounds chunk bookkeeping and releases cancelled readers without waiting for an unread cloned-stream sibling. Greek raw source paths do not enter the translated-Bible envelope decoder. The largest source book is Luke at 3,225,252 bytes.

Validation checks complete book/chapter/verse identities, source references, consecutive source lines, token ordinals, field types, array/string bounds and supplied grammar identity. It rejects missing or invented rows and unexpected token fields. The loader retains at most two fulfilled book objects plus verified manifest and morphology metadata. Pending and failed requests do not occupy fulfilled cache slots. Clearing advances a generation so an earlier completion cannot repopulate the cache; an older failure cannot evict a newer successful request. UI cancellation and request generations prevent abandoned selections from appearing as current. Failed source validation clears the reader and offers an explicit retry.

## Atomic offline books and license layers

Text is **CC BY 4.0**, attributed to the Society of Biblical Literature and Logos Bible Software. Parsing and lemmatization are **CC BY-SA 3.0**, attributed using Tauber's original 2017 MorphGNT citation. The 2017 citation is preserved while the actual imported revision remains the pinned 2024 commit. Source annotations and their lossless JSON reformatting retain their share-alike terms. Complete original notices and both attribution layers remain separately visible; no endorsement, human linguistic review or editorial approval is claimed.

A selected book download contains ten exact files: that book, manifest, morphology key, source provenance, integrity ledger, and all five original notices:

- `CC-BY-4.0.txt`
- `CC-BY-SA-3.0.txt`
- `MorphGNT-README.md`
- `SBLGNT-About.md`
- `SBLGNT-README.md`

The existing atomic pack API uses a distinct `morphgnt-sblgnt-<book>` pack ID. Before download, the application inventory must match every compiled source pin. After commit, actual cached bytes are checked again. Verification reads only current-version committed packs and the current content cache; incomplete staging, old versions, missing files and damaged notice bytes do not count as verified. Local markers are bounded to 2 MiB and 16,384 known member paths. Marker membership alone never proves integrity.

Downloads support cancellation and block application updates only during an active storage transaction. Cancelled or failed transactions preserve existing complete packs. Removing a book removes its source-book path while retaining shared notices and other books. The component aborts outstanding work on unmount and guards stale status messages. Reloading a downloaded source selection works offline; lemma lookup needs no network. Dictionaries and translated editions are not included in this source pack. The workspace stores no private notes, telemetry or new user profile data.

## Verification and release limits

Focused Node tests validate all actual books and exact token fields, the unknown-case inventory, decomposed-Unicode preservation, literal apparatus/normalized fields, missing John verses, complete identities, exact lemma counts/pages, independent URLs, cache generations, corruption, cancellation and rejected fetches. Offline tests include all five notices, actual cached-byte corruption, incomplete staging, old content versions, atomic rollback and scoped removal. The independent continuation review ran all 18 focused Node checks, including the 15 Python adversarial importer cases, successfully before integration.

`tests/greek-study.browser.spec.ts` supplies desktop/mobile gates for exact DOM wording, keyboard token inspection, source fields, literal unknown morphology, lemma pages and direct navigation, missing verses, history, a genuine offline reload with SHA verification of all ten files, removal, corruption/retry, stale-book abandonment, source/download cancellation, update guards and 320px screenshots. The first-source recovery action also retries failed first-book loading when its coordinates are unchanged. `tests/greek-navigation.browser.spec.ts` checks directory and command navigation, return to the complete Bible range, reload and source-verified coverage with corruption/recovery. Local Chromium execution and a full application build are not claimed at this integration checkpoint. CI execution and screenshot review remain release gates; automated checks do not replace native-language or human editorial review, nor physical-device testing.
