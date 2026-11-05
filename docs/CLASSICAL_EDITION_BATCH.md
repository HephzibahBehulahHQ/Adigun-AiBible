# Verified edition expansion: twelve exact sources

This batch adds twelve distinct provider editions containing all 66 books and 1,189 source chapters each, with **373,275 source verse records** in total. It includes historical texts and the revised Tongan West text; it does not describe every edition as an unchanged historical publication. The corpus remains separate from the original-language OSHB study data and the Quran source.

The sources were selected from the acquisition catalog, then individually checked against their own primary notices, complete VPL archives, XML and TXT exports. Inventory labels alone did not admit a source. Three initial candidates were deferred for concrete identity/coverage problems. Only the twelve accepted sources below are installed by this batch.

## Source identities, languages and actual coverage

| App edition ID | Primary provider notice | Language tag | Script / direction | Verse records |
| --- | --- | --- | --- | ---: |
| `fra-ostervald` | [fra_fob — French Ostervald](https://ebible.org/fra_fob/copyright.htm) | `fr` | `Latn` / LTR | 31,107 |
| `epo-londona` | [epo — Londona Biblio](https://ebible.org/epo/copyright.htm) | `eo` | `Latn` / LTR | 31,102 |
| `arb-vandyck` | [arb-vd — Arabic Van Dyck](https://ebible.org/arb-vd/copyright.htm) | `ar` | `Arab` / RTL | 31,104 |
| `mya-judson1840` | [myajvb — Judson Burmese](https://ebible.org/myajvb/copyright.htm) | `my` | `Mymr` / LTR | 31,102 |
| `nld-1917` | [nld — De Heilige Schrift 1917](https://ebible.org/nld/copyright.htm) | `nl` | `Latn` / LTR | 31,102 |
| `haw-1868` | [haw1868 — Baibala Hemolele](https://ebible.org/haw1868/copyright.htm) | `haw` | `Latn` / LTR | 31,102 |
| `rus-synodal` | [russyn — Russian Synodal](https://ebible.org/russyn/copyright.htm) | `ru` | `Cyrl` / LTR | 31,169 |
| `ukr-kulish1905` | [ukr1871 — Kulish–Puluj 1905](https://ebible.org/ukr1871/copyright.htm) | `uk` | `Cyrl` / LTR | 31,082 |
| `vie-cadman` | [vie1934 — Vietnamese NT 1923 / OT 1925](https://ebible.org/vie1934/copyright.htm) | `vi` | `Latn` / LTR | 31,102 |
| `srp-danicic-karadzic` | [srp1868 — Serbian Daničić–Karadžić](https://ebible.org/srp1868/copyright.htm) | `sr-Cyrl` | `Cyrl` / LTR | 31,111 |
| `ton-revised-west` | [ton — Revised West Version](https://ebible.org/ton/copyright.htm) | `to` | `Latn` / LTR | 31,102 |
| `eng-geneva1599` | [enggnv — Geneva 1599](https://ebible.org/enggnv/copyright.htm) | `en` | `Latn` / LTR | 31,090 |

Provider IDs remain distinct from canonical app IDs. A provider identifier containing a year is not proof of a historical revision. The Ukrainian notice explicitly identifies **1905**, while its identifier is `ukr1871`. The Vietnamese notice identifies NT **1923** and OT **1925**, not a verified 1934 revision. The individual French Ostervald, Arabic Van Dyck, Russian Synodal and Serbian notices do not establish a historical revision year; no year is invented for them. The Dutch source remains the provider's named 1917 edition, without attributing it to an unverified translation team. Esperanto retains the provider's 1910 label; unnamed translators remain explicitly unspecified.

Source-file dates are distinct from notice dates and this project's observation date. French Ostervald source files are dated **2026-10-30**, Ukrainian **2026-09-02**, Serbian **2026-01-03**, and the other nine accepted sources **2025-12-12**. Their original notice dates are retained separately as `sourceNoticeDate`. Rights were inspected on **2026-11-05**.

Language and script subtags were checked against the [IANA Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry), File-Date **2026-09-17**. Every source letter was inspected using Unicode character names and bidirectional classes; the receipt is retained under each provenance record's `languageEvidence`, with the exact registry digest. Arabic uses Arabic-script letters with bidi class `AL`; Burmese uses Myanmar letters; Russian, Ukrainian and Serbian use Cyrillic. Hawaiian and Tongan modifier letters remain intact. The Geneva source uses English with historical spelling; the provider's label “Old” is not converted into the distinct Old English language tag `ang`.

Metadata `nativeTitle`, `script`, `direction` and `sourceNoticeDate` are added only to these new records. This data work does not change frontend display code. Integration must render actual Arabic and Myanmar text on desktop/mobile, preserve `lang` and source direction, verify glyph shaping and fallback fonts, and keep punctuation/reference controls readable. A passing DOM string assertion alone does not establish correct rendering or native-language approval.

## Rights and attribution

Every admitted individual notice explicitly declares the exact provider text Public Domain. Operation records cite that individual notice and the provider's [intellectual-property policy](https://ebible.org/legal.php) and [public-domain use policy](https://ebible.org/publicdomain.htm). Those policies describe copying, distribution, applications, derivatives and commercial text uses. These are recorded provider declarations, not newly acquired commercial contracts, independent worldwide legal clearance, or human editorial approval. The provider's [master inventory](https://ebible.org/Scriptures/copyright.php) qualifies its public-domain knowledge as applying in the USA, and its policy acknowledges national-law variation. These qualifications remain in the conditions rather than being silently removed.

Geneva's individual notice expressly permits this digital copy worldwide without copyright restrictions and requires no modernization of its spelling. The shared provider policy specifically names the Tongan Revised West translation among works dedicated to the public domain. Its complete notice retains credits for translator James Baxley, artist Kitione Vailea and digital editions/layout by Michael Johnson; this import includes verse text only, not cover art or layout. The Vietnamese notice's stated NT/OT public-domain-entry dates remain publisher statements, not this application's independent legal conclusion.

Each new edition includes the complete extracted `NOTICE.txt` and the exact archive notice bytes in `SOURCE_NOTICE.html.txt`. The latter is data with a `.txt` extension, not executable HTML. Keep edition identity, source URLs, complete notices and conditions attached to redistributed/offline text. No provider certification badge, trademark endorsement, private permission, or human approval has been fabricated. Recorded narration remains **unknown/denied** in the operation register; text permission does not establish a narrator's or recording producer's rights. Hausa and Igbo remain outside the batch because the product-wide Biblica AI-policy applicability is unresolved.

## Exact text preservation and comparison

The importer pins each archive's byte count and SHA-256, each XML/TXT/notice member's SHA-256, and every generated payload's SHA-256. Complete output coverage and member pins are in each `provenance.json`; source definitions are in `scripts/import-editions.py`. Raw archives remain outside Git. All twelve source-record digests differ from each other and from all previously imported Bible sources; this is not an expansion through spelling, annotation or canon variants of an existing text.

XML and TXT must have exactly the same ordered references. Display text is the publisher's complete TXT, including source brackets, empty records and source numbering. No NFC conversion, accent stripping, word rewriting, verse interpolation or reconstructed missing verse is used. Only established XML/VPL boundary padding and documented book-abbreviation mapping are applied. Manifests distinguish maximum verse numbers from actual source-record counts; unavailable positions are recorded, never filled with another edition's words.

Eight sources have exact XML/TXT text agreement. Esperanto has **2**, Hawaiian **39**, Ukrainian **2**, and Tongan **1,238** source records with pinned format differences. All but one of those differences consist solely of square brackets present in TXT and absent in XML. Every coordinate and bracket code-point offset is pinned in a complete exception-inventory digest. These differences never change the displayed TXT.

Tongan **Mark 13:3** additionally retains one ASCII space before a supplied-word closing bracket. The importer permits that one space only when the edition, book/chapter/verse, full XML-text hash, full TXT-text hash and exact offset all match the admitted record. It does not trim arbitrary whitespace or generalize the exception to another record or source. The official [Tongan USFM archive](https://ebible.org/Scriptures/ton_usfm.zip) independently supplies the same phrase in an `\add` span and includes that space before `\add*`. `ton-revised-west/FORMAT_EVIDENCE.json` preserves the exact source excerpt and the archive/member hashes. Its archive SHA-256 is `d217d40dd70eafcd31c6531dd5bc9ea08c84e66d57164977cc1fb822d3af1d6d`; member `71-MRKton.usfm` is pinned as `93ab55a0188882ec870dc996d8466994c0920cad896ea8850cc64c91a84e6cbb`.

The VPL format does not supply separate note, paragraph or heading structures. Source inline annotations still present in its text remain untouched; no structural annotation coverage is claimed.

## Deferred candidates and real blockers

| Provider ID | Evidence and reason for deferral |
| --- | --- |
| `ita1927` | Its individual and archive notices say Riveduta 1927 but also describe Diodati 1885; the primary details page uses a conflicting `DO885` abbreviation. Exact revision/identity has not been resolved. A distinct archive hash alone does not settle it. |
| `pesOPV` | The current copyright/archive notices omit a translator, while the primary details page credits Wycliffe Bible Translators and an archive filename suggests 1895. Attribution/revision identity is unresolved. Its Psalm 121:1 export difference was observed, not normalized or admitted. |
| `kor` | All 66 book IDs occur, but there are only 1,188 source chapter sections: no `1PE` chapter 5 section is supplied. Seventeen XML/TXT differences involve additional bracket spacing and embedded alternate English verse labels. Completeness/numbering needs a separate source audit. |

Other inventory entries still include partial testaments/books, alternate alphabets, annotation variants, canon variants and sources requiring individual rights work. This batch does not establish 100 eligible distinct editions, and the remaining task is not described as universally blocked by commercial licenses. The twelve additions take the installed Bible-source count from 14 to 26 (23 beyond the original three-source baseline), with the Quran kept separate; installation does not override operation-specific or product-wide permission gates.

## Reproduction and acceptance gates

```sh
# Repeat --edition for the twelve admitted IDs; archives use app-ID.zip names.
python3 -B scripts/import-editions.py --source-dir /path/outside/repository --edition fra-ostervald --check

# Offline deterministic rebuild from committed books, manifests and provenance:
python3 -B scripts/import-editions.py --rebuild-indexes
python3 -B scripts/import-editions.py --verify
node --test tests/classical-batch.test.mjs
```

An archive update or a changed comparison inventory must fail closed and receive a new source review. Rebuilding search indexes requires no network/raw archive and validates committed inputs and output hashes before replacing derived files. Source-specific tests cover all new output hashes/counts/identities, exact notice bytes, unique source pins, Unicode and direction metadata, narrowly bounded format exceptions and negative operation decisions. Final integration owns compact transport, publisher speaker coverage, rendering, build size and full browser/release gates; none is substituted by these data checks.
