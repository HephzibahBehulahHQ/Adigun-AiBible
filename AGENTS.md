# Adigun-AiBible agent instructions

## Adigun Gen Z Bible edition

Adigun is creating an original English Bible edition called **Adigun Gen Z Bible**. Treat it as its own edition throughout authoring, data, and product work. Do not describe, classify, or display it as a paraphrase, a secondary overlay, or a third-party Gen Z product.

### Shared text source and rules

- Translate from the project's pinned World English Bible source: `data/manifest.json` and `data/books/{BOOKID}.json`. The WEB publisher states the text is public domain and permits adaptation and redistribution, provided changed text is not called the World English Bible: https://ebible.org/engwebp/copyright.htm.
- Produce original Adigun wording. Do not copy another modern translation or any third-party Gen Z Bible content.
- Cover every book, chapter, and verse in the WEB 66-book manifest. Preserve canonical book IDs, order, chapter numbers, verse numbers, quotations, speakers, names, events, and meaning. Add no missing text, doctrines, events, or placeholders.
- Use natural, clear, contemporary English with a light Gen Z voice. Slang may appear when it fits; do not force memes into every verse. Do not add racial slurs, hate speech, or needless embellishment.
- Preserve one complete, nonempty text record for every source verse in a completed chapter. Keep verse-boundary/numbering discrepancies explicit rather than silently dropping or inventing text.
- Genesis 1:1–3 must retain the owner's supplied wording exactly in `content/genz/ot/GEN/01.json`.
- The edition ID is `adigun-genz`; source ID is `eng-web`. Do not use the old editorial-overlay data as the edition corpus; integrate the text through the dedicated edition pipeline.

### Parallel ownership and conflict prevention

- Primary Codex owns Old Testament authoring under `content/genz/ot/{BOOKID}/{CHAPTER}.json`: the 39 Old Testament books in the WEB manifest, Genesis through Malachi.
- The assigned second agent owns New Testament authoring only under `content/genz/nt/{BOOKID}/{CHAPTER}.json`: the 27 New Testament books in the WEB manifest, Matthew through Revelation.
- Each chapter file uses `schemaVersion`, `editionId`, `sourceEditionId`, `sourceManifestSha256`, `bookId`, `bookName`, `chapterNumber`, and a `verses` array with `number`, `sourceRef`, and `text`.
- Agents must not edit each other's path or shared files such as `AGENTS.md`, catalog/manifests, rights registers, editorial records, runtime code, import scripts, tests, or release ledgers. The primary integrator owns shared pipeline changes and final merging.
- Commit only completed, source-aligned chapters. Report exact books, chapters, and verse counts. Partial drafts stay out of the installed catalog. Do not claim a full Bible until every manifest verse is present and validated.
