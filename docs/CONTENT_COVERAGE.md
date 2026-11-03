# Content coverage

Counts are derived from committed publisher source inventories and checked during the production build.

| Corpus / edition | Books or surahs | Chapters | Numbered source records | Imported |
|---|---:|---:|---:|---|
| English WEB | 66 | 1,189 | 31,103 | Complete pinned edition |
| German Luther 1912 | 66 | 1,189 | 31,102 | Complete pinned edition |
| Biblica Yoruba | 66 | 1,189 | 31,087 | Complete pinned edition; original numbering gaps preserved |
| Talal Itani ClearQuran | 114 surahs | 114 | 6,236 | Complete pinned edition |

WEB has 31,098 records with main-text wording and five publisher-empty records. The Yoruba inventory omits 16 numbered positions rather than supplying invented verses. Details and exact pins are in the source documentation and provenance files. A highest verse number is not assumed to equal the number of actual records.

There are zero production-approved comparisons, paraphrases or other editorial records, and 50 unreviewed research candidates. Baseline comparison coverage is 31,103 unreviewed English WEB source units. Other imported editions do not inherit those reviews. Source availability is independent of editorial review.

Historical reading coverage is zero imported editions; three source-backed catalog records link external editions. Additional requested historical works remain an explicit research queue. Pidgin source, native-language editorial review, recorded narration and approved teaching are not claimed available.

Recalculate with `npm run content:validate`, `python3 scripts/import-editions.py --verify`, and `node scripts/publish-editorial.mjs`. Downloaded-on-device coverage is determined from verified browser caches, not server inventory.
