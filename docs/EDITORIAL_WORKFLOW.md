# Editorial workflow

## Files and first run

`content/editorial/candidates.json` preserves the original 50 research leads and cautions. Never approve a raw seed in place. Create an explicit record in `records.json` after research. `reviewers.json` starts empty; an authorized maintainer may register a real, consenting human reviewer after verifying identity. An agent must never populate it with invented people.

Run `node scripts/publish-editorial.mjs` using Node 24. The publisher reads actual Bible units from `data/books`, builds edition-specific inventory, validates every proposed publication, and atomically writes `data/editorial-published.json`. There may legitimately be zero approved records. A purported approval that fails validation blocks publication rather than silently publishing it. The release build runs this publisher before copying data and exposes only compact approved publication metadata. Run `node --test tests/editorial.test.mjs` for the risk tests.

## Preparing and reviewing a comparison

1. Resolve the seed against selected permitted editions. Inspect both full cited ranges and surrounding chapters. Preserve original quotations exactly. Identify translator, edition version, reference system, license evidence, and source IDs.
2. Define a limited proposition, relationship, explanation, rationale, and any interpretive qualification. For mixed claims write separate shared and differing points. Reject unsuitable links rather than force agreement.
3. Store exact source records and their hashes. For the imported Bible, source IDs are `eng-web:GEN:1:1`; use the actual edition ID from the manifest. Bible reference systems use `<editionId>:publisher-numbering`. Hash source text with `hashSourceText`; do not normalize it. `validateReference` resolves actual unit inventory, including ranges.
4. Compute `sourceRevision(link)` once source explanation and evidence are final. Set every explanation's `derivedFromRevision` to that value. A real reviewer sees source text, chapter context, proposed claim, named interpretive sources, rights evidence, changes from the previous revision, and intended publication status.
5. A reviewer may reject, request revisions (`in_review` with notes), or approve. Each explanation needs its own `explanationContentHash(locale, explanation, revision)`, reviewer ID, review date, and evidence IDs. Finally compute `comparisonContentHash(link)` and record the independent comparison approval. Hash helpers calculate values; they do not authorize approval.
6. After edits call `invalidateComparison(previous, next)`. Changed source claims or dependency hashes invalidate translations and the overall approval; any changed translation invalidates its own and the overall approval. Publication rechecks hashes even if an editor forgets this helper. Keep revision history and inspect `git diff` before human review.

Paraphrases and other editorial additions use `EditorialContent`, `editorialContentHash`, and `validateEditorialContent`. Base-source evidence and named supporting sources are required. Origin (`human_authored` or `ai_assisted`) is separate from review status.

## Additional corpus manifest

The installed edition catalog is resolved automatically from `data/editions`: canonical Bible evidence IDs use `<editionId>:<BOOK>:<chapter>:<verse>`, and Quran IDs use `eng-clearquran:QUR:<surah>:<verse>`. Source hashes bind the exact installed wording. External inventory cannot replace any installed edition. ClearQuran adaptation rights are false.

Use `content/editorial/source-inventory.json`, or `--inventory /absolute/path.json`, with `{schemaVersion: 1, editions: EditionInventory[], sources: SourcePassage[]}`. The exported contracts in `src/editorial.ts` are authoritative. Every edition identifies corpus, version, reference system, evidenced redistribution/adaptation rights, and works with explicit ordered chapter/unit inventories. Every source identifies its exact edition/version, atomic reference, text, and SHA-256 hash. Missing/merged/split or nonnumeric labels must be represented explicitly; never infer another edition's numbering. Additional corpora cannot overwrite the imported Bible. Quran sources use corpus `quran`, work `QUR`. Hadith uses corpus `hadith` and its registered work/locator mapping. Register a documented mapping for historical divisions before importing them. `ValidationContext.resolveSource` is injectable for other storage backends.

## Coverage and UI integration

`getCoverage(records, ref)` returns an explicit matching record or `unreviewed`; links-array length never proves no parallel. The publisher emits one coverage row for every actual imported Bible unit and computes `coverageCounts` and backlog totals. No-match records require scope, source evidence, exact dependency hashes, a human review, and `coverageContentHash(record)`. Disputes require at least two sourced positions. Approved links establish only their actual cited units.

Read the artifact's `approvedComparisons`, `approvedParaphrases`, `approvedContent`, `coverage`, `coverageCounts`, and `backlog`. Render only approved arrays in approved libraries. Pending candidates belong in an explicitly labeled research backlog. Keep the originally reviewed edition accessible when a user switches displayed editions: a different wording has not automatically been reviewed. Source availability and rights blockers are separate from editorial status.
