# Content coverage

Counts are derived from committed publisher source inventories and checked during the production build.

| Corpus / edition | Books or surahs | Chapters | Numbered source records | Imported |
|---|---:|---:|---:|---|
| English WEB | 66 | 1,189 | 31,103 | Complete pinned edition |
| German Luther 1912 | 66 | 1,189 | 31,102 | Complete pinned edition |
| Biblica Yoruba | 66 | 1,189 | 31,087 | Complete pinned edition; original numbering gaps preserved |
| Berean Standard Bible v5.19 | 66 | 1,189 | 31,086 | Complete pinned publisher USJ edition |
| American Standard Version 1901 | 66 | 1,189 | 31,102 | Complete pinned VPL text edition |
| Young's Literal Translation | 66 | 1,189 | 31,102 | Complete pinned VPL text edition |
| Darby Translation | 66 | 1,189 | 31,099 | Complete pinned VPL text edition |
| Noah Webster Bible (1833) | 66 | 1,189 | 31,102 | Complete pinned VPL text edition |
| Louis Segond 1910 | 66 | 1,189 | 31,170 | Complete pinned VPL text edition |
| Santa Biblia — Reina Valera 1909 | 66 | 1,189 | 31,102 | Complete pinned VPL text edition |
| Unrevidierte Elberfelder 1905 | 66 | 1,189 | 31,102 | Complete pinned VPL text edition |
| Textbibel von Kautzsch und Weizsäcker (1906) | 66 | 1,189 | 31,157 | Complete pinned VPL text edition |
| Bible Kralická 1613 | 66 | 1,189 | 31,172 | Complete pinned VPL text edition |
| Diodati Bibbia 1885 | 66 | 1,189 | 31,095 | Complete pinned VPL text edition |
| Talal Itani ClearQuran | 114 surahs | 114 | 6,236 | Complete pinned edition |

WEB has 31,098 records with main-text wording and five publisher-empty records. The Yoruba inventory omits 16 numbered positions rather than supplying invented verses. Details and exact pins are in the source documentation and provenance files. A highest verse number is not assumed to equal the number of actual records.

There are fourteen installed authentic Bible text editions, eleven additional to the original three-edition baseline. The nine newly acquired editions contribute 280,101 original source records; their exact source dates, archive/member hashes, bracket-difference inventories and notices are documented in [EDITION_EXPANSION.md](EDITION_EXPANSION.md). The 208 observed provider inventory records and 43 named priority requests are acquisition metadata, not additional installed editions or permission approvals. The requested 100 additional editions remain an acquisition target.

There are zero production-approved comparisons, paraphrases or other editorial records, and 50 unreviewed research candidates. Baseline comparison coverage is 31,103 unreviewed English WEB source units. Other imported editions do not inherit those reviews. Source availability is independent of editorial review.

Historical reading includes one complete pinned Lightfoot Didache edition (16 chapters, 189 units); three separate source-backed catalog records link external editions. Two historical dictionaries contain 14,298 number records and 14,197 supplied headwords. BSB supplies 2,302 publisher red-letter spans across 2,047 verses; the other thirteen editions have explicit audited zero-span inventories. These are metadata availability counts, not independently reviewed speaker assignments. Additional requested historical works remain an explicit research queue. Pidgin source, native-language editorial review, recorded narration and approved teaching are not claimed available.

Recalculate with `npm run content:validate`, `python3 scripts/import-editions.py --verify`, and `node scripts/publish-editorial.mjs`. Coverage Explorer reports these separate inventories and verifies current device cache completeness, source permissions, byte counts and hashes on request. Downloaded-on-device coverage is not inferred from server inventory.
