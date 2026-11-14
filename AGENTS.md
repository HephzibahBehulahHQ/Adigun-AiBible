# Adigun-AiBible agent instructions

## Adigun Edition

Adigun is creating an original English Bible edition called **Adigun Edition**. Treat it as its own Bible version throughout authoring, data, and product work. Do not describe, classify, or display it as a paraphrase, secondary overlay, or third-party edition. In the reader, show only the selected version's own text; show other versions only when the reader explicitly opens the 2–5 parallel versions feature. Never substitute another edition's wording for missing Adigun text.

### Shared text source and rules

- Translate from the project's pinned World English Bible source: `data/manifest.json` and `data/books/{BOOKID}.json`. The WEB publisher states the text is public domain and permits adaptation and redistribution, provided changed text is not called the World English Bible: https://ebible.org/engwebp/copyright.htm.
- Produce original Adigun wording. Do not copy another modern translation or any third-party Bible edition content.
- Cover every book, chapter, and verse in the WEB 66-book manifest. Preserve canonical book IDs, order, chapter numbers, verse numbers, quotations, speakers, names, events, and meaning. Add no missing text, doctrines, events, or placeholders.
- Use natural, clear, contemporary English in the owner's chosen Adigun voice. Do not force slang or memes into verses. Do not add racial slurs, hate speech, or needless embellishment.
- Preserve one complete, nonempty text record for every source verse in a completed chapter. Keep verse-boundary/numbering discrepancies explicit rather than silently dropping or inventing text.
- Genesis 1:1–3 must retain the owner's supplied wording exactly in `content/genz/ot/GEN/01.json`.
- The edition ID is `adigun-genz`; source ID is `eng-web`. Do not use the old editorial-overlay data as the edition corpus; integrate the text through the dedicated edition pipeline.

### Parallel ownership and conflict prevention

- Primary Codex owns Old Testament authoring under `content/genz/ot/{BOOKID}/{CHAPTER}.json`: the 39 Old Testament books in the WEB manifest, Genesis through Malachi.
- The assigned second agent owns New Testament authoring only under `content/genz/nt/{BOOKID}/{CHAPTER}.json`: the 27 New Testament books in the WEB manifest, Matthew through Revelation.
- Each chapter file uses `schemaVersion`, `editionId`, `sourceEditionId`, `sourceManifestSha256`, `bookId`, `bookName`, `chapterNumber`, and a `verses` array with `number`, `sourceRef`, and `text`.
- Agents must not edit each other's path or shared files such as `AGENTS.md`, catalog/manifests, rights registers, editorial records, runtime code, import scripts, tests, or release ledgers. The primary integrator owns shared pipeline changes and final merging.
- Commit only completed, source-aligned chapters. Report exact books, chapters, and verse counts. Partial drafts stay out of the installed catalog. Do not claim a full Bible until every manifest verse is present and validated.
