# Italian Riveduta 1927 source review

## Decision

The eBible.org `ita1927` archive is the Italian Riveduta Bible 1927, not the distinct Diodati Bible 1885. The source identity and structure are now corroborated, but the text remains **not installed** because the provider's public-domain inventory is expressly U.S.-qualified and the current static app does not enforce territory-limited display.

## Identity evidence

- eBible.org's [Riveduta 1927 details](https://ebible.org/bible/details.php?id=ita1927) names the title and stable ID `ita1927` / `ITARIV`; the same page also shows abbreviation `DO885` and the line “The Diodati Bible was published in 1885.” These conflicting fields are recorded and are not used to rename the text.
- The provider's [public-domain inventory](https://ebible.org/Scriptures/copyright.php) lists separate records: Riveduta Bibbia 1927 (`ita1927`, contributor Bible Society in Italy) and Diodati Bibbia 1885 (`ita1885`).
- The downloaded [official VPL archive](https://ebible.org/Scriptures/ita1927_vpl.zip), SHA-256 `d73ad51ec797dbc92691431795e42df0502cdbb0b21ac1707b389f8308a6d7d4`, contains 31,102 verse records. Its Genesis 1:1 matches the provider's [Riveduta 1927 page](https://ebible.org/ita1927/GEN01.htm) exactly and differs from the distinct [Diodati 1885 page](https://ebible.org/ita1885/GEN01.htm).
- The provider names Bible Society in Italy as contributor and does not identify a translator on the reviewed details page. No translator is attributed here.

## Source inventory

The XML and TXT each contain 66 ordered books, 1,189 chapters and 31,102 unique references. Their reference order agrees after the 11 VPL-to-SIL abbreviation mappings already used by the importer: `SOL→SNG`, `EZE→EZK`, `JOE→JOL`, `NAH→NAM`, `MAR→MRK`, `JOH→JHN`, `PHI→PHP`, `JAM→JAS`, `1JO→1JN`, `2JO→2JN`, and `3JO→3JN`. Every XML/TXT text difference is trailing ASCII padding in the XML export; after the importer's existing ASCII-padding comparison, all 31,102 verse strings agree. There are no additional wording, punctuation or numbering exceptions, and the unchanged TXT remains the intended display source.

Pinned archive component hashes:

- `ita1927_vpl.xml` — `4eac8055ef88863eb6497da3825dfb44f2f898cf07228b4bfe993207c36b35a8`
- `ita1927_vpl.txt` — `50a63dca8b8164c13812fec073ff2dd50ebdd07e589d7ebf6e2db89a2f82fc80`
- `ita1927_about.htm` — `7a16ea9abfea6b46445fd920d359fb8af4e0f4bb716d1c63b7155b24ada63881`

## Rights and admission gate

The individual [source notice](https://ebible.org/ita1927/copyright.htm) says Public Domain, while the provider's [inventory heading](https://ebible.org/Scriptures/copyright.php) describes its public-domain list as applying in the USA “to the best of my knowledge.” eBible.org's [intellectual-property policy](https://ebible.org/legal.php) also says users remain responsible for applicable law. This is provider evidence, not an independent worldwide legal opinion.

The existing permission model can represent a specified territory, but the shipped static app does not enforce that territory when displaying source text. Therefore the archive remains a research lead with verified identity and structure, not an installed edition. Reconsider admission after broader source-rights evidence or a real territory-aware display and delivery gate is available.
