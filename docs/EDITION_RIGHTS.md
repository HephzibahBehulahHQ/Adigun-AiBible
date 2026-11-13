# Additional edition sources, rights and reproducible import

Verified publisher notices and source files: **13 November 2026**. These imports add published source text. They do not approve generated teaching, paraphrases, comparisons, or new translations. Software licensing is separate from these edition-specific licenses.

## Imported editions

| ID | Edition | Corpus / language | Source coverage | Rights |
| --- | --- | --- | --- | --- |
| `deu1912` | Lutherbibel 1912 | Bible / German (`de`) | 66 books, 1,189 chapters, 31,102 numbered source records | Publisher declares this historical text public domain. This does not cover modern Luther revisions. |
| `yor` | Biblica® Open Yoruba Contemporary Bible™ | Bible / Yorùbá (`yo`) | 66 books, 1,189 chapters, 31,087 numbered source records | CC BY-SA 4.0, with the publisher's attribution and trademark requirements. |
| `hausa2020` | Biblica® Open Hausa Contemporary Bible™ | Bible / Hausa (`ha`) | 66 books, 1,189 chapters, 31,087 numbered source records | CC BY-SA 4.0; retain attribution, ShareAlike, change disclosure and exact-source Biblica trademark conditions. See [source record](HAUSA_2020_IMPORT.md). |
| `eng-clearquran` | ClearQuran — Allah Edition, translated by Talal Itani | Quran translation / English (`en`) | 114 surahs, 6,236 numbered verses | CC BY-ND 4.0 plus express publisher permissions for formatting and unchanged excerpts, including commercial use. |

The English Quran translation is Talal Itani's **ClearQuran**, not Mustafa Khattab's *The Clear Quran*. This import does not include Arabic text, Hadith, recorded audio, or approved Bible–Quran mappings.

## Sources and notices

| ID | Publisher catalog / current terms | Canonical download | Source date |
| --- | --- | --- | --- |
| `deu1912` | [Catalog](https://ebible.org/find/details.php?id=deu1912), [public-domain notice](https://ebible.org/deu1912/copyright.htm) | [Publisher VPL archive](https://ebible.org/Scriptures/deu1912_vpl.zip) | 29 December 2025 |
| `yor` | [Catalog](https://ebible.org/find/details.php?id=yor), [copyright and licensing notice](https://ebible.org/yor/copyright.htm) | [Publisher VPL archive](https://ebible.org/Scriptures/yor_vpl.zip) | 25 June 2025 |
| `eng-clearquran` | [Publisher terms and downloads](https://clearquran.com/download/) | [Allah Edition plain-text archive](https://d.clearquran.com/text/clearquran-txt-allah-edition.zip) | 9 October 2026, as stated in the pinned archive |

Each edition includes `NOTICE.txt`, retaining the publisher's supplied notice in readable text, plus current source/license URLs. Keep these notices with redistributed or offline copies. The catalog's short attribution is not a replacement for the complete edition notice.

### Hausa conditions

The exact source notice grants CC BY-SA 4.0 display, redistribution and reasonable adaptation in any format, subject to attribution, ShareAlike, change-disclosure and Biblica trademark rules. The import keeps publisher wording unchanged, retains the complete source notice, and does not include third-party images or recordings. Keep Biblica marks with unchanged text and do not imply endorsement. AI product use remains gated pending review of Biblica's separate product-wide policy; native-language/editorial approval is also pending.

### Yorùbá conditions

The text is copyrighted by Biblica, Inc., and is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keep the original title, copyright/source information, and Biblica marks with unchanged text. Do not imply endorsement. For a derivative, the publisher requires removal of the Biblica trademark, disclosure of changes, its prescribed source attribution, and the same CC BY-SA license for the contribution. No semantic adaptation is made by this import. The text grant does not authorize unrelated photographs, maps, or third-party recordings.

### ClearQuran conditions

Use the credit **Translation by Talal Itani, ClearQuran.com**, link to [ClearQuran](https://clearquran.com/) where possible, and include [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/). The current publisher page expressly permits storage, redistribution, commercial use, format conversion, selected exact verses, and combining unchanged quotations with other content. It forbids changing, adding or removing translation words. Therefore `rights.adapt` is `false`: this translation must not be used as a licensed base for a distributed Gen Z or Pidgin paraphrase.

The current publisher terms supersede older readme notices mentioning a noncommercial license. The pinned October 2026 archive itself already states CC BY-ND 4.0. Permission to use text or publisher-provided media is not evidence that recorded media has been imported or that a browser can play or export every format.

## Exact wording, source numbering and omissions

The importer preserves source spelling, punctuation, diacritics and Unicode normalization. It does **not** normalize source text to NFC, modernize German, fill missing verses, translate text, or rename an altered work as a publisher's edition. Bible book identifiers use the existing application catalog; its English book-name labels are navigation metadata, not a claim that the scripture text is English.

Both Bible archives contain XML and plain-text VPL exports. Their references and display text are cross-checked record by record. Only ASCII export padding at verse boundaries is removed. Footnotes, introductions, paragraph layouts and section headings are absent from the publisher's VPL format and are not claimed as included.

**German numbering annotations:** 358 source records have a publisher formatting discrepancy: the XML drops brackets around numeric alternate-numbering markers while the plain-text export and publisher HTML keep them. The importer keeps the exact **plain-text display form**, including those brackets. For verification only, it checks that removing the brackets around these numeric markers makes the corresponding XML text agree; every other character must match. The exact reference/marker inventory is retained in `deu1912/provenance.json`. For example, the publisher's [Genesis 32 page](https://ebible.org/deu1912/GEN32.htm) displays bracketed alternate numbering. No reference is silently remapped using these annotations and no apparent source typo is corrected.

**Yorùbá omitted positions:** the source contains 31,087 actual records. Sixteen numbered positions are absent across fifteen chapters; this is the source edition's inventory, not a parser-created gap. Missing positions are recorded in `yor/provenance.json`, without fabricated empty scripture records. The affected positions are Matthew 17:21; 18:11; 23:14; Mark 7:16; 9:44,46; 11:26; 15:28; Luke 17:36; 23:17; John 5:4; Acts 8:37; 15:34; 24:7; 28:29; and Romans 16:24.

In the new Bible manifests, `books[].verseCounts[]` is the **maximum numbered verse** in each chapter, for navigation bounds. `verseRecordCounts[]` gives actual record counts. `totals.verses` counts actual records. For example, Yorùbá Matthew 17 has 26 records ending at verse 27; code must look up the actual verse number instead of indexing `verses[number - 1]`. An unavailable position requires an explicit source-unavailable state. Do not substitute another edition under the Yorùbá label.

ClearQuran is parsed from its `surah|verse|text` format. Every translation text character is retained. Publisher metadata comments remain separate from scripture. Surah names are not fabricated from memory; only the source's numeric surah identifiers are imported.

## Integrity pins

| Archive | SHA-256 |
| --- | --- |
| `deu1912.zip` | `af668fb39d9c96ceddc3af69cb22db809770d09e7999012aacdaedf85eb5de16` |
| `yor.zip` | `afa5abe34101cd7ce7a49f7c45d8d34449721a3eafe8f20dd7a1acee543ed00b` |
| `eng-clearquran.zip` | `3ca939fee6186ce06db165df29dfa2b8e66179c198f41c4924bc2e15be725876` |

The importer also pins the scripture members and Bible notice members. Each `provenance.json` records source member hashes, normalization/format limitations, exact inventories, and hashes for every generated content file. The first German HTTP response was truncated; it was rejected as an invalid ZIP. A complete retry passed length, ZIP CRC and checksum checks. The incomplete response was never imported.

## Reproduce and verify

Use Python 3.12 or later; only the standard library is needed. Keep original archives **outside the repository**. The expected local names are `deu1912.zip`, `yor.zip` and `eng-clearquran.zip` regardless of their publisher download filenames.

```sh
# Download missing archives from the pinned publisher URLs and import all three.
python3 scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --download

# Rebuild from already downloaded archives without network access.
python3 scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources

# Recreate the two derived Bible search indexes after a clean checkout.
# This needs only committed edition files; it performs no network/archive access.
python3 scripts/import-editions.py --rebuild-indexes

# Verify generated hashes, metadata, inventories and search/display agreement.
python3 scripts/import-editions.py --verify

# Reconstruct every output byte from pinned original archives without changing files.
python3 scripts/import-editions.py --source-dir /absolute/path/outside-repository/edition-sources --check
```

An updated publisher archive intentionally fails the checksum pin. Review its exact edition, terms, numbering and text changes before updating constants; do not remove the integrity gate to accept a changed download. All three inputs are parsed and validated before generated outputs are replaced. A missing/changed source fails with a named error and does not publish a partially validated catalog. `--output` can point to a separate test directory.

The catalog is `data/editions/catalog.json`. Bible data is under `<id>/books/ID.json`, with per-edition manifests and search indexes. Quran data is under `eng-clearquran/quran.json` in its own corpus. Search rows include `editionId` to prevent presenting one edition's hits under another label. The UI/build integration and its browser verification are separate from this importer's mechanical validation.

`data/editions/deu1912/search-index.json` and `data/editions/yor/search-index.json` are redundant **derived build artifacts**. Keep all source books, manifests, provenance and notices tracked. Before validation or build on a clean checkout, run `--rebuild-indexes`: it validates committed input hashes and inventories, reconstructs both indexes in memory, checks their bytes against the existing provenance hashes, and replaces only those two derived files. All source inputs are validated before either file is written. This mode needs no original archives, credentials, network connection or changes to source pins. A modified source book causes failure before an index can be published. `--verify` then validates the recreated files normally; `--check` with original archives remains the full import reproducibility check.

## Nigerian Pidgin remains outside this import

The [eBible pcm export notice](https://ebible.org/pcm/copyright.htm) states all rights reserved. [Wycliffe's own Nigerian Pidgin app listing](https://play.google.com/store/apps/details?id=org.wycliffe.pcm.nigerian.pidgin.bible&hl=en) separately grants CC BY-NC-ND 4.0 for its translation, including noncommercial, attributed sharing and excerpts with unchanged words and punctuation. That grant must be matched to the exact downloadable edition/version and its noncommercial conditions before integration. No commercial/adaptation permission or exact-version match is asserted here; no Pidgin corpus was imported. A separately named WEB-based Adigun Pidgin paraphrase still requires its own actual human editorial review before publication.
