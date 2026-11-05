# Pinned Greek source corpus

This import is a separate original-language source resource. It does not add a translated Bible edition, a 66-book Bible, translated word alignment, gloss, pronunciation, audio or human editorial approval.

## Source and license decision

The selected corpus is [MorphGNT/SBLGNT at aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d](https://github.com/morphgnt/sblgnt/tree/aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d). Its exact README licenses parsing and lemmatization under **CC BY-SA 3.0**, separately from the SBLGNT text. The primary text licensor's [pinned README and complete LICENSE](https://github.com/Faithlife/SBLGNT/tree/d7f35adca9ec410e1d1499c63b4dd989d76c8d4d) license SBLGNT under **CC BY 4.0**, copyright 2010 Society of Biblical Literature and Logos Bible Software. The [primary SBLGNT license page](https://sblgnt.com/license/) agrees. The complete CC BY-SA 3.0 legal code is pinned from [Creative Commons' own repository](https://github.com/creativecommons/cc-legal-tools-data/blob/a0dac18d1a773b4cdb7d8dd5d9bf4efab7901030/docs/licenses/by-sa/3.0/legalcode.txt).

Both license layers, original notices and attribution remain separate. Annotation adaptations retain the upstream share-alike terms. The importer states its lossless reformatting, supplies no endorsement and claims no independent legal, human editorial or linguistic approval. This is source admission based on the explicit primary declarations; it does not change the application's code license.

The original requested 2017 MorphGNT citation is retained; the exact imported identity is the pinned 2024 commit. Faithlife's newer SBLGNT text and apparatus are **not** imported. Its later John 7:53–8:11 addition is absent from this MorphGNT snapshot, so those rows remain absent.

## Files and schema

`data/original-language/morphgnt-sblgnt/source.json` pins source and license repository commits, complete archive hashes and byte lengths, reconstructed upstream Git trees, selected file SHA-256/Git-blob hashes, attributions and limitations. `integrity.json` hashes the source pin and every generated output; the manifest has no circular self-hash.

Each `books/<source-abbreviation>.json` has `schemaVersion: 1`, `sourceId`, `sourceRevision`, `book`, `name`, `sourceBookNumber`, `sourceFile` and ordered `chapters`. Each chapter has decimal-string `number`, four-digit `sourcePrefix`, and `verses`; each verse has decimal-string `number`, the literal six-digit `reference`, and ordered `tokens`.

A token has numeric `sourceLine` and one-based within-verse `ordinal`, plus the exact original strings `partOfSpeech`, `parsing`, `text`, `word`, `normalized`, and `lemma`. `sourceFile + sourceLine` is a derived locator, not an upstream word ID. `text` includes original punctuation, apparatus signs and brackets; `normalized` is the distinct upstream normalized-word column, never a replacement for display text. No Unicode normalization, accent removal, spelling repair or verse remapping occurs. Joining the seven fields with ASCII spaces and the original LF row endings reconstructs every original source file byte-for-byte.

`morphology.json` extracts descriptions only from the pinned source README. Unknown symbols and full codes remain raw and are counted in the manifest. In particular the README does not define the observed case character `V`; no expansion is invented. A dash remains an unexpanded position. Parentheses in normalized forms and apparatus signs are preserved literally; this source supplies no complete alternative-reading records to expand.

## Reproduction

```bash
python3 -B scripts/import-greek-source.py
python3 -B scripts/import-greek-source.py --check
```

The default acquires only pinned public URLs into a temporary cache. Existing exact files can be supplied using `--archive`, `--text-license-archive`, and `--annotation-license`. Archives are never extracted to filesystem paths. Compressed and expanded byte limits, member limits, duplicate/traversal/link rejection, archive hashes, complete Git tree reconstruction and every selected file hash are checked before generation. The annotation legal-code bytes are independently pinned. `--check` compares every output byte and rejects missing, altered or extra corpus files.

## Verified coverage and limits

The admitted snapshot contains **27 books, 260 represented chapters, 7,927 represented verses and 137,554 word rows**, with 5,461 distinct literal lemma strings and 17,566 distinct upstream normalized-form strings. These are source record counts, not translated verse coverage or distinct word senses. The undefined case symbol `V` occurs in 668 tokens across 12 parsing codes. Those codes remain available in full and are not expanded from an outside grammar.

There are 35 generated outputs totaling 23,023,748 bytes, plus the source pin. The largest book JSON is Luke at 3,225,252 bytes. The complete corpus is separate from the translated edition package count. An offline/export consumer needs the applicable source book files, manifest, morphology key, source pin, integrity ledger and all five notice files.

Verification completed:

- The 1,313,320-byte MorphGNT archive has SHA-256 `e760c941eebae0eb25665a4937cf3b29b04a842f952f4b46d4181601d0e91872`. Reconstructing its entire Git tree yields `c518c6af640829bf882d884559bc8c77a01affec`, matching the primary pinned commit. Every one of the 28 selected files has an independent SHA-256 and Git-blob check.
- The text-license archive is separately pinned: 1,336,564 bytes; SHA-256 `3db73c0966021a84376b274a15243c463bfc29cd4641530923d759d61173e872`; complete reconstructed Git tree `551c17d822e6e0bb46586bd4bfe65f393beefbab`. Its README, About and full license bytes are retained unchanged. Its Greek text is not substituted into the MorphGNT snapshot.
- `--check` reproduced all 35 generated files byte-for-byte. A separate comparison that did not import the importer compared every original archive row and all seven fields against the generated book JSONs. All 137,554 rows agreed exactly.
- `node --test tests/greek-source.test.mjs` passed four Node checks, including all-book reconstruction back to original byte lengths, SHA-256s and Git blobs, complete output/notice inventories, actual numbering and symbol counts, and **15 Python adversarial cases**. Fixtures cover decomposed Unicode, distinct text/normalized fields, unknown codes, numbering gaps and corruption, malformed field boundaries, archive traversal/links/duplicates/collisions, byte/member bounds and missing license declarations. Synthetic fixtures are confined to tests.

No browser or full application build is claimed for this source-only branch. Root integration owns serving, verified loaders, UI, offline packaging and release CI. No test result constitutes independent human linguistic/editorial review.

## Integration boundary

This source-only change does not register routes, translated editions, OSHB data, service-worker policies or UI. Consumers must verify the ledger and source identity, render original strings as text, expose the separate licenses and source limitations, preserve source numbering, and retain all notices for offline/export use. Source lemma equality means equality of the literal upstream field; it is not a verified mapping to a translated Bible, a historical dictionary, Strong's number or a distinct word sense.
