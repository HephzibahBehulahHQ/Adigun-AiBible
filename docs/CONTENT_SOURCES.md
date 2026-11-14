# Scripture source and reproducible import

## Included edition

The application includes the complete **World English Bible, Protestant Edition** from eBible.org (`engwebp`): 66 books and 1,189 chapters. The publisher’s source is dated **30 October 2026**; its provenance and public-domain rights were checked on **3 November 2026**. This is a distinct English Bible edition. Gen Z is tracked as its own Bible edition, separate from interface language.

- [Official edition](https://ebible.org/engwebp/)
- [Publisher’s download and format directory](https://ebible.org/find/details.php?id=engwebp)
- [Canonical verse-per-line archive](https://ebible.org/Scriptures/engwebp_vpl.zip)
- [Rights and trademark notice](https://ebible.org/engwebp/copyright.htm)

The text is public domain. “World English Bible” is the publisher’s trademark; altered wording must not be presented as this edition. The importer preserves wording, punctuation, spelling, Unicode, and source numbering. It removes only XML export padding at verse boundaries. The publisher’s VPL format already excludes paragraph layout, introductions, footnotes, and noncanonical headings; the application does not claim to include those materials.

## Exact coverage and source exceptions

The pinned archive contains **31,103 numbered records**, of which **31,098 contain main-text wording**. Five entries contain no main-text wording in the publisher’s exports:

| Book | Chapter | Verse |
| --- | ---: | ---: |
| Luke | 17 | 36 |
| Acts | 8 | 37 |
| Acts | 15 | 34 |
| Acts | 24 | 7 |
| Romans | 16 | 25 |

These entries retain their number and an empty source text. Any explanation shown in the interface must be separate from scripture and must never be copied, spoken, or exported as scripture. The [publisher’s Luke 17 page](https://ebible.org/engwebp/LUK17.htm) demonstrates a note-only verse; the omitted wording is discussed in its footnote.

The count uses this edition’s numbering. In particular, [Romans 14](https://ebible.org/engwebp/ROM14.htm) contains the doxology at 14:24–26. [Romans 16](https://ebible.org/engwebp/ROM16.htm) ends with a note-only 16:25 record that points to the different placement and numbering in the Textus Receptus tradition. Counting 26 records in Romans 14 and 25 in Romans 16 gives one additional numbered record compared with inventories using 23 and 27. The importer must preserve this edition’s inventory instead of forcing a generic 31,102 total or generating missing words.

The source XML uses SIL/UBS book IDs (`SNG`, `EZK`, `JOL`, `NAM`, `MRK`, `JHN`, `PHP`, `JAS`, `1JN`, `2JN`, `3JN`). The independent publisher text export uses some older abbreviations; the importer normalizes those identifiers only, then compares every text export row with the XML row.

## Reproduce and validate

Requirements: Node.js 24 and Python 3. Python’s standard library reads the ZIP and XML; no third-party parser or downloaded executable is needed.

```sh
npm run content:import
# Or use an already downloaded copy:
npm run content:import -- --source /absolute/path/to/engwebp_vpl.zip
npm run content:validate
node --test tests/content.test.mjs
```

The download is bounded to 45 seconds and 20 MB. The archive is checked before parsing or overwriting content. An updated publisher archive deliberately fails the pin: a maintainer must review the new source, regenerate the content, update integrity pins, and review the diff.

| Artifact | SHA-256 |
| --- | --- |
| Downloaded archive | `37a8ccecfbc765a2305ae64f3b5e88d1d01bafceb9a33e8d191f6ee551a437b9` |
| XML source member | `99a8ab49e3f59739a614f4c67304e159b246053a315ca7b800a0baf4b60f1997` |
| Text source member | `5a150b653d07369448a792ec2baaf9133ba6c582d7a0609cdcd72e185a06c45b` |

[`data/provenance.json`](../data/provenance.json) records the source URLs, source checksums, normalization rules, explicit empty records, canonical inventory, and generated file checksums. The validator pins this provenance and verifies all 66 books, contiguous reference numbering, chapter counts, text encoding, the entire search index, and every literal curated passage selection in `src/curation.ts`. Coverage reflects imported data. Technical validation does not certify doctrinal interpretation, native-language quality, or an editorial comparison review.

## Other product content

No generated paraphrases, Qur’an comparisons, unlicensed translation packs, or recorded narration are included in this import. Such material requires its own source, rights, provenance, review status, and validator before it can be presented as available or reviewed. Reader-selected moods and study plans refer to verified source passages; their editorial selection is separate from the Bible edition and is not a claim of medical benefit or independent theological approval.
