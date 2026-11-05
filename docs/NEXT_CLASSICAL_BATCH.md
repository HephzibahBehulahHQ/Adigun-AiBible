# Next complete-edition batch

This bounded acquisition assessment starts from the 26 installed Bible editions at `8144bc6ca53d6cc157c3403818ae2fbcb38a139c`. The goal is up to twelve additional authentic editions; a provider inventory label does not establish source identity, completeness or permission. The Quran and original-language study corpora remain separate.

## Current shortlist

Admission is being completed for the following sources. This assessment checkpoint does not yet claim their generated output or release checks passed.

| Provider | Exact identity | Source records | Rights evidence |
| --- | --- | ---: | --- |
| `frajnd` | Bible J.N. Darby, BPC JND v2.0, 2024 reissue; source files dated 2 May 2025 | 31,170 | [Individual notice](https://ebible.org/frajnd/copyright.htm) and [BPC's own download page](https://editeurbpc.com/telechargements) identify this text as public domain. The separate 2026 revised edition uses CC BY-NC-ND and is excluded. |
| `spabes` | La Biblia en Español Sencillo 2026; translated and edited by Irma Flores, AudioBiblia.org; source dated 30 October 2026 | 31,102 | [Individual public-domain notice](https://ebible.org/spabes/copyright.htm). This is text permission, not a grant for AudioBiblia recordings. |
| `tdx` | Saontsin’ Añahare, Tandroy-Mahafaly Malagasy; explicitly a **publisher draft** | 31,081 | [Individual notice](https://ebible.org/tdx/copyright.htm): copyright 2023 Steve Lellelid, CC BY-SA 4.0. Full attribution/share-alike/change notices must accompany use; pictures have separate restrictions and are excluded. |

All three archives contain the canonical 66 source book IDs in order and 1,189 chapter sections. French Darby contains three empty source records and Tandroy six; no words are invented for them. French Darby uses the publisher's Hebrew-based verse numbering. Its 2024/v2.0 identity is corroborated by [BPC's revision history](https://ftp.editeurbpc.com/telechargements/JND); it is not labeled an untouched 1885 edition.

French Darby XML/TXT differences consist of 4,030 exact square-bracket cases. Simple Spanish has exact XML/TXT agreement. Tandroy has ten bracket-only cases and seven XML-only terminal U+00A0 characters before omitted footnotes. The primary Tandroy USFM archive independently contains those separators immediately before footnote markers. A bounded, coordinate/hash/offset-pinned comparison exception is being verified; display text remains the complete original TXT, without Unicode trimming or wording repair.

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

The parent integration owns source delivery, publisher speaker inventory, frontend rendering and release CI. This branch owns the importer, new edition files, catalog/rights/acquisition metadata and focused source tests. Final reproduction commands, generated hashes and test receipts will be recorded here when the admission checks finish.
