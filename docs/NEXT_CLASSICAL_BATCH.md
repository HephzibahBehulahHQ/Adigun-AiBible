# Next complete-edition batch

This bounded admission batch starts from the 26 installed Bible editions at `8144bc6ca53d6cc157c3403818ae2fbcb38a139c`. Three sources meet the present identity, rights and coverage contract; a provider inventory label does not establish source identity, completeness or permission. The Quran and original-language study corpora remain separate.

## Admitted source identities

The pinned generated outputs for these three sources are integrated on an isolated continuation of repaired PR #31. Source validation, application gates and deployment remain distinct; no human editorial or native-language approval is implied.

| Provider | Exact identity | Source records | Rights evidence |
| --- | --- | ---: | --- |
| `frajnd` | Bible J.N. Darby, BPC JND v2.0, 2024 reissue; source files dated 2 May 2025 | 31,170 | [Individual notice](https://ebible.org/frajnd/copyright.htm) and [BPC's own download page](https://editeurbpc.com/telechargements) identify this text as public domain. The separate 2026 revised edition uses CC BY-NC-ND and is excluded. |
| `spabes` | La Biblia en Español Sencillo 2026; translated and edited by Irma Flores, AudioBiblia.org; source dated 30 October 2026 | 31,102 | [Individual public-domain notice](https://ebible.org/spabes/copyright.htm). This is text permission, not a grant for AudioBiblia recordings. |
| `tdx` | Saontsin’ Añahare, Tandroy-Mahafaly Malagasy; explicitly a **publisher draft** | 31,081 | [Individual notice](https://ebible.org/tdx/copyright.htm): copyright 2023 Steve Lellelid, CC BY-SA 4.0. Full attribution/share-alike/change notices must accompany use; pictures have separate restrictions and are excluded. |

All three archives contain the canonical 66 source book IDs in order and 1,189 chapter sections. French Darby contains three empty source records and Tandroy six; no words are invented for them. French Darby uses the publisher's Hebrew-based verse numbering. Its 2024/v2.0 identity is corroborated by [BPC's revision history](https://ftp.editeurbpc.com/telechargements/JND); it is not labeled an untouched 1885 edition.

French Darby XML/TXT differences consist of 4,030 exact square-bracket cases. Simple Spanish has exact XML/TXT agreement. Tandroy has ten bracket-only cases and seven XML-only terminal U+00A0 characters before omitted footnotes. The primary Tandroy USFM archive independently contains those separators immediately before footnote markers. A bounded, coordinate/hash/offset-pinned comparison exception is covered by adversarial regression checks; display text remains the complete original TXT, without Unicode trimming or wording repair.

## Exclusions found through direct inspection

| Provider / lead | Concrete reason this batch does not admit it |
| --- | --- |
| `porbrbsl` | 81 books / 1,402 chapters, including additional canon; six XML joined verse labels differ from TXT start-only labels. Publisher draft. |
| `frasbl` | 81 books / 1,403 chapters, including additional canon and joined-reference differences. Publisher draft. |
| `spablm` | 81 books / 1,402 chapters, including additional canon and joined-reference differences. Publisher draft. |
| `rusfb` | The actual archive contains only 31 books / 531 chapters, despite its broad Bible title. Publisher draft. |
| `hrv` | 73 source books / 1,328 chapters; its canon/Esther identifiers differ from the current 66-book contract. Extra books are not silently removed. |
| `hltmcsb` | 83 books / 1,391 chapters, joined-reference differences, and an explicitly mixed territorial public-domain/CC BY-SA declaration. |
| `kos` | 66 books / 1,189 chapters, but ten XML verse ranges collapse into start-only TXT labels and seventeen further bracket/spacing discrepancies remain. The notice does not establish a 1928 edition year. |
| `ukrfb` | Same 31,082 references as installed `ukr-kulish1905`; 31,052 records are byte-identical and only 30 differ at punctuation/orthographic/typo scale. A changed archive hash is not enough to count this as a new translation. |
| `ronbl` | Its individual notice identifies a New Testament, not a complete Bible. |
| `engBBE` | Its notice explicitly bases public-domain status in the United States on publication formalities. No worldwide grant is inferred. |
| `hat` | Its public-domain rationale is absence of a 1985 copyright notice/subsequent registration; broader territorial applicability is unresolved. |
| `eng-rv` | Its exact notice identifies an edition with Apocrypha; no silent projection into a differently described 66-book edition. |
| `dan1931` | Explicitly mixed rights: the New Testament is public domain while the Old Testament carries copyright and additional distribution terms. |
| `mri` | The examined individual source is a New Testament under CC BY-ND 4.0. It is not admitted as a full Bible. |

Earlier `ita1927`, `pesOPV`, `kor` and Biblica Hausa/Igbo deferrals remain unchanged. Script, annotation, spelling and canon variants do not inflate the additional-edition count. Other Scandinavian, Polish, modern Greek and Pacific-language names remain research leads; a name or an unverified mirror does not grant permission.

## Scope and acceptance

Only pinned source text and its notices may be imported. Text rights, third-party recordings, source annotations, publisher draft status, AI operations and human editorial approval remain separate. Public-domain claims remain attributed provider declarations with the existing territorial qualifications; this task does not certify worldwide legal clearance.

The isolated continuation owns the three admitted sources, publisher inventory regeneration, exact conditions in the catalog/notebook, and focused source/browser checks. The primary integration owner owns the combined final release, dependency repair, required CI, merge and deployed receipt.

The batch contains 29 installed Bible editions, 26 beyond the original three-edition baseline, and 18 source languages. There are 19 exact language tags because Spanish and Latin American Spanish remain separate filters; regional/script variants do not count as extra source languages. Quran, Hebrew/Aramaic and Greek study corpora remain separate.

## Verification receipts

- `node scripts/generate-publisher-coverage.mjs` regenerated all 29 exact-source inventories with 2,302 publisher-marked spans. Publisher metadata is not an independent editorial approval.
- `node --test tests/next-editions.test.mjs`: nine checks passed, including the five Python adversarial cases in `tests/next_edition_checks.py`. These cover all 93,353 records, every generated artifact pin, source/acquisition/publisher identities, complete gap and empty-record inventories, revision-bound permissions, retained conditions in actual notebook output, and narrow formatting exceptions.
- `playwright test tests/next-editions.browser.spec.ts --list` contributes 22 desktop/mobile cases: source selection and exact ranges; 18-language reporting and regional filters; French source numbering; blank/missing records; visible Tandroy draft/license terms; actual notebook downloads; and each source plus its exact notice across genuine offline document reload and unavailable-book behavior. Browser execution is NOT TESTED locally because Chromium is unavailable; the integration owner must run these cases with the repaired Playwright dependency before release.
- The combined focused group passed **38 tests**, zero failures/skips: next editions, prior classical batch, notebook, rights, extended coverage and shared source transport. TypeScript and scoped ESLint passed.
- Reproduced every artifact of all three admissions from the existing cached SHA-pinned archives using `python -B scripts/import-editions.py --source-dir /workspace/scratch/4c9fbfa89fd1/edition-source-cache --edition fra-darby2024 --edition spa-simple2026 --edition tdx-tandroy --check`. The cache directory contains aliases to already acquired archives, not fresh downloads. All generated output comparisons and the importer’s full installed-source validation passed. `npm run content:validate` also passed.
- `ADIGUN_SOURCE_TRANSPORT=gzip-base64-v1 npm run build` passed on the working candidate. Final artifact verification accepted **1,943 envelopes**, preserving **376,983,453 exact canonical bytes** in **117,215,180 transferred bytes**. The offline inventory contains **3,309 paths / 536,723 bytes**, within the existing 16,384-path / 4 MiB bounds. No source staging directory was published. This working-tree build is not a deployed receipt.
- The complete browser suite collects **290 cases across 42 files**, including the 22 new cases. Actual browser execution and narrow-screen screenshot inspection remain release gates on the integration owner’s final combined revision.
