# Edition word and phrase concordance

Work in progress: isolated implementation; root integrates the route and release gates.

The bounded scope is source surface-word and consecutive-word occurrence analysis over installed Bible editions. It is independent of the historical lexicons and asserts no lemma, morphology, Strong’s alignment, thematic equivalence or editorial interpretation. Quran sources remain separate.

The workspace will accept `{ reference, locale?, onOpenReference }` with the existing reader `Reference`/`Locale` types. Root route: `#/concordance/<BOOK>/<chapter>?verse=<n>&edition=<id>`.

Counts distinguish individual occurrences from matching source verse records. Phrases never cross verse boundaries; overlapping token starts count separately. Words contain Unicode letters/numbers, attached combining marks, and internal straight/curly apostrophes. Other punctuation and spacing separate words. Matching normalizes tokens to NFC and optionally ignores case. Accents remain significant. Display text and highlight offsets retain the exact original Unicode string; highlight offsets use JavaScript UTF-16 positions.

Source metadata, rights, index hashes and complete record inventories must validate before a zero count can be shown. Results are bounded to 25 matching verse records per page, with complete source totals and per-book distributions. No private data, telemetry or new persistent study schema is introduced.

Implementation and verification receipts will be completed before handoff. Browser execution belongs to the integrated candidate CI.
