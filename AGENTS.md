# Adigun-AiBible agent instructions

## Adigun Edition

Adigun is creating an original English Bible edition called **Adigun Edition**. Treat it as its own Bible version throughout authoring, data, and product work. Do not describe, classify, or display it as a paraphrase, secondary overlay, or third-party edition. In the reader, show only the selected version's own text; show other versions only when the reader explicitly opens the 2–5 parallel versions feature. Never substitute another edition's wording for missing Adigun text.

### Shared text source and rules

- Translate from the project's pinned World English Bible source: `data/manifest.json` and `data/books/{BOOKID}.json`. The WEB publisher states the text is public domain and permits adaptation and redistribution, provided changed text is not called the World English Bible: https://ebible.org/engwebp/copyright.htm.
- Produce original Adigun wording. Do not copy another modern translation or any third-party Bible edition content.
- Cover every book, chapter, and verse in the WEB 66-book manifest. Preserve canonical book IDs, order, chapter numbers, verse numbers, quotations, speakers, names, events, and meaning. Add no missing text, doctrines, events, or placeholders.
- Use the owner-approved Adigun voice shown in the Genesis 1:1–5 sample: unmistakably conversational, spoken youth language, natural idioms, relaxed dialogue, vivid cadence, and selective fitting emojis. Do not flatten it into ordinary modern-English wording or mechanically force slang into every sentence. Keep each verse faithful to its source meaning and add no events, doctrine, or claims. Do not use racial slurs or hate speech.
- Preserve one complete, nonempty text record for every source verse in a completed chapter. Keep verse-boundary/numbering discrepancies explicit rather than silently dropping or inventing text.
- Keep the owner-approved Genesis 1:1–5 wording exactly as shown in the current sample in `content/genz/ot/GEN/01.json`; the owner has approved this as the project's voice reference.
- The installed edition ID is `adigun-edition`; source ID is `eng-web`. Existing authoring files may retain their legacy `adigun-genz` source ID until they are migrated. Do not use the old editorial-overlay data as the edition corpus; integrate the text through the dedicated edition pipeline.

### Canonical book order and conflict prevention

- Primary Codex owns the first Old Testament lane in canonical order: Genesis through Micah (books 1–33) under `content/genz/ot/{BOOKID}/{CHAPTER}.json`. Finish and validate the current book before beginning the next book; do not skip ahead to another book.
- The assigned second agent owns the final Old Testament lane in reverse canonical order: begin by auditing Malachi, then proceed backward through Zechariah, Haggai, Zephaniah, Habakkuk, and Nahum (books 39–34). Stop before Micah so the two lanes meet without overlap.
- Before authoring any book, inspect the current main repository for existing chapters. Reuse complete, source-aligned chapters; author only the missing chapters. Do not duplicate completed work or infer completion from another agent's report.
- The New Testament candidate corpus is reported complete; do not reauthor it as part of these Old Testament lanes. The primary integrator must verify it against the source manifest before claiming full-canon completion.
- Each chapter file uses `schemaVersion`, `editionId`, `sourceEditionId`, `sourceManifestSha256`, `bookId`, `bookName`, `chapterNumber`, and a `verses` array with `number`, `sourceRef`, and `text`.
- Each agent edits only its assigned book/chapter files and must not edit the other lane or shared files such as `AGENTS.md`, catalog/manifests, rights registers, editorial records, runtime code, import scripts, tests, or release ledgers. The primary integrator owns shared pipeline changes and final merging.
- Commit only completed, source-aligned chapters. Report exact books, chapters, and verse counts. The owner has directed that finished Adigun text be readable as it is completed: install only complete chapters in an explicitly scoped portion manifest, never substitute another edition's wording or expose drafts, and do not claim a full Bible until every manifest verse is present and validated.
