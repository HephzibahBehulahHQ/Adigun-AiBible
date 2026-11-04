# Sources and licenses

The authoritative edition records are [English provenance and importer](CONTENT_SOURCES.md) and [additional edition rights](EDITION_RIGHTS.md). The application retains publisher notices in `data/editions/*/NOTICE.txt`; offline packs include the notice of the selected edition. Quotations and exports identify the edition, attribution, license and source.

| Installed source | Rights record | Reading use |
|---|---|---|
| World English Bible, Protestant Edition (`eng-web`) | Publisher public-domain declaration; trademark qualification retained | Unchanged English source |
| Lutherbibel 1912 (`deu1912`) | Publisher public-domain declaration | Unchanged German source |
| Biblica Open Yoruba Contemporary Bible (`yor`) | CC BY-SA 4.0; copyright and trademark notices retained | Unchanged Yoruba source |
| ClearQuran, Talal Itani Allah Edition (`eng-clearquran`) | CC BY-ND 4.0 plus publisher formatting permissions | Unchanged English Quran source; no adaptation |
| Berean Standard Bible, publisher release v5.19 (`eng-bsb`) | [Publisher public-domain dedication](https://berean.bible/terms.htm) | Unchanged English source with publisher structure retained |

No Pidgin corpus is imported. Available Pidgin licenses differ by edition and do not establish rights for an arbitrary downloadable file. No generated study wording is passed off as a named translation.

Historical catalog provenance: [1910 Sixth and Seventh Books of Moses](https://www.loc.gov/item/11000761/), [Apostolic Fathers, 1870 edition](https://www.gutenberg.org/ebooks/77576), and [Hone collection, cataloged 1845?](https://www.loc.gov/item/22019177/). These are catalog records with external reading links, not imported text. The catalog distinguishes an edition's date from the composition dates of its contents. Local rights and edition notices must be checked before future imports.

The corporate image is reused from the official HB design-system asset, not generated or rebranded as a new corporate mark. Browser speech availability and voice processing depend on the selected browser voice; it is not a licensed recorded-narration collection.

## Version 3 rights and acquisition

`data/editions/rights-register.json` records separate permissions for display, redistribution, offline use, indexing, adaptation, translation, paraphrase, AI retrieval, training, TTS, recordings, performance, each export type, peer sharing and commercial use. It includes source hashes, evidence URLs, territory, expiry, withdrawal, refresh, attribution and reporting requirements. `src/edition-rights.ts` validates the register and denies unknown operations. The backend AI resolver enforces it before returning source text.

The [Open Yoruba notice](https://ebible.org/yor/copyright.htm) provides CC BY-SA 4.0 text rights. [Biblica’s permissions page](https://www.biblica.com/permissions/) and [Publisher AI Policy](https://www.biblica.com/publisher-ai-policy/) separately require express AI licensing. No such agreement is recorded. Yoruba AI retrieval, training and TTS remain unavailable; activating an AI-enabled product with this edition requires a product-wide applicability review, not merely hiding a button. ClearQuran AI processing is also unverified. Existing local reading is distinct from an activated generative service. Text licenses do not establish rights to third-party recordings.

`data/editions/acquisition-catalog.json` contains observed provider metadata and every named priority request. Metadata records are not playable editions, approved rights, verified full-Bible coverage, or achievement of the 100-additional-edition target. Provider statements qualified to the USA are not silently treated as worldwide licenses. Equivalent provider records and materially different revisions must be reconciled during acquisition; NLV and NLT remain separate requests.

## Berean source receipt

The [publisher’s v5.19 release](https://github.com/BSB-publishing/bsb2usfm/releases/tag/v5.19), published 27 October 2026, supplies `BSB_usj.zip`. Its SHA-256 is `783aced3c3c8a2b145e4f8c48e3b94a5a5515e050719bb8621d094be78a5269f`, matching the publisher’s release digest. The import validates 66 explicit book identities, 1,189 chapters and 31,086 verse milestones, retaining all 16 absent numbered positions. Every source member and generated artifact has a recorded hash.

The importer preserves footnotes, headings, poetry styles and character spans. Psalm superscriptions remain labeled context; Zechariah 12:1 retains its full opening sentence, cross-checked against [the publisher’s verse display](https://biblehub.com/bsb/zechariah/12.htm). Publisher words-of-Jesus markup is preserved as source metadata and is not represented as independently reviewed speaker data. Unsupported markers and range identities fail rather than being silently discarded or renumbered.

Reproduce with `python scripts/import-editions.py --edition eng-bsb --source-dir OUTSIDE_REPO --download --check` (the archive is named `eng-bsb.zip`). `--rebuild-indexes` regenerates ignored search indexes and chapter chunks from committed books and checks every resulting hash before writing; `--verify` checks the installed output. No archive is committed. Full USJ provenance is in `data/editions/eng-bsb/provenance.json`.
