# Nine historical Bible editions: source acquisition

Source inspection date: **5 November 2026**. This increment evaluates nine distinct historical translations/editions. It does not complete the 100-additional-edition target or certify human editorial review.

## Exact downloaded sources

The source archives are kept outside Git. Each download passed its advertised byte length and ZIP CRC checks. All nine contain 66 books and 1,189 chapters. Verse totals below count the actual source records; numbering and omissions remain edition-specific.

| Application ID | eBible provider ID | Historical edition identity | Source date | Archive bytes | Verse records |
| --- | --- | --- | --- | ---: | ---: |
| `eng-ylt` | `engylt` | Young's Literal Translation; provider inventory 1862/1898 | 2025-12-12 | 4,318,747 | 31,102 |
| `eng-dby` | `engDBY` | Darby Translation; provider inventory 1871/1884 | 2019-11-16 | 4,316,919 | 31,099 |
| `eng-webster` | `engwebster` | Noah Webster Bible, 1833 | 2025-12-12 | 4,342,864 | 31,102 |
| `fra-lsg1910` | `fraLSG` | Louis Segond 1910 | 2026-10-30 | 4,592,359 | 31,170 |
| `spa-rv1909` | `spaRV1909` | Reina-Valera 1909 | 2015-08-10 | 4,403,456 | 31,102 |
| `deu-elberfelder1905` | `deuelo` | Unrevised Elberfelder 1905 | 2025-12-12 | 4,689,332 | 31,102 |
| `deu-textbibel1906` | `deutkw` | Kautzsch–Weizsäcker Textbibel 1906 | 2025-12-12 | 4,923,760 | 31,157 |
| `ces-kralicka1613` | `ces1613` | Last Kralická edition of 1613 | 2025-12-12 | 4,668,076 | 31,172 |
| `ita-diodati1885` | `ita1885` | Diodati Bibbia 1885; notice identifies 1641 translation and 1821 revision | 2025-05-03 | 4,672,839 | 31,095 |

Total compressed downloads: **40,928,352 bytes**. Historical edition years, source-file dates, archive timestamps and content hashes are separate fields. The provider's 1579–1593 Kralická inventory date describes translation history; its individual notice expressly identifies the 1613 edition. Darby's provider ID is retained separately from the lowercase application ID, without inventing a different edition year.

## Primary evidence

For each provider ID in the table, the exact source catalog is `https://ebible.org/find/details.php?id=ID`, the notice is `https://ebible.org/ID/copyright.htm`, and the downloaded VPL archive is `https://ebible.org/Scriptures/ID_vpl.zip`. The archive's `ID_about.htm` contains the matching edition notice and is pinned independently of the scripture members.

The individual notices identify the exact historical texts as public domain. Provider policies explain copying and permitted uses: [Intellectual Property Policy](https://ebible.org/legal.php) and [Public Domain](https://ebible.org/publicdomain.htm). The [inventory](https://ebible.org/Scriptures/copyright.php) alone is explicitly USA-qualified and is not a substitute for the individual notices. A permission record must identify its actual evidence and exact source checksum; it is not a human editorial approval.

No third-party narration, publisher maps, illustrations or modern revisions are included. Text permission is not a recording license. Complete source notices must accompany offline/exported source packages. Source wording must remain identifiable; changed study material must use its own label.

## Source fidelity

The publisher VPL contains scripture text only. It excludes introductions, notes, paragraph formatting and noncanonical headings. No such coverage is claimed.

All XML and plain-text references match. In seven archives the XML omits square brackets that remain in the plain-text display source. Comparison-only bracket removal produces exact character agreement; the original TXT is retained unchanged. The exact per-edition reference/offset inventory must be pinned before accepting this format discrepancy. Kralická and Textbibel require no such exception. No correction of spelling, diacritics, Unicode normalization, source omissions or verse numbering is permitted.

## Admission and validation

Acquired archives are not yet an installed-reader claim. Admission requires complete source/notice pins, source-specific rights evidence, importer checks, generated-file hash verification, search/display agreement and source-specific regression checks. The batch remains limited to these nine candidates; no source is admitted by weakening a failed check.

The existing 4,096-file offline-inventory ceiling and GitHub Pages size ceiling must be addressed before a materially larger catalog. This batch does not introduce new hosting or paid services.
