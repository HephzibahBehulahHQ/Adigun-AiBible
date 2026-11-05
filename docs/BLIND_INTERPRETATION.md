# Blind interpretation workspace

## Implemented flow

`src/interpretation/BlindInterpretationWorkspace.tsx` exports a default React component accepting `reference`, optional `locale`, and `onOpenReference`. The host registers the `interpretation` view, route, command and tool entry. Its expected URL is `#/interpretation/MAT/5?verse=17&end=20&edition=eng-web`; the selected Bible edition supplies unchanged Scripture. The exercise passage is explicitly Matthew 5:17–20, with Matthew 5:13–26 available as context.

The user opens a private reflection, reads two shuffled historical readings, examines supporting passages and questions, and records reasoning plus an optional preference. Source names, work titles, tradition associations, provenance and external source links are absent from the exercise DOM before deliberate reveal. Their bundled research data is not a security boundary, and recognizing a historical quotation is possible.

Reveal first commits the reasoning to IndexedDB. Authors become visible only after the transaction succeeds. Before-reveal writing and preference are then preserved; later writing and choices have their own fields and local revision history. There is no correct-answer score, denomination score, reward or ranked outcome. An undecided preference is always allowed.

Saved records retain the challenge version, Bible edition and source checksum, source order, reveal state and timestamps. Reopening uses that original edition. A different challenge or Bible revision cannot silently be attached to an existing record. Missing source text is reported explicitly; another edition is never substituted. Whole-chapter and supporting-reference actions preserve the edition and use the host navigation guard.

## Source evidence checked 5 November 2026

The single installed exercise is an **AI-assisted research preview with human editorial and tradition review pending**. It is not a completed diverse-denomination curriculum. Only two historical Christian writers are represented. Their arguments are attributed to these particular texts, not every member of an associated tradition; Jewish and other non-Christian interpretations are not represented.

| Evidence | Primary publication / institution | Scope checked |
| --- | --- | --- |
| John Chrysostom, Matthew Homily XVI, §§3–5 | [CCEL historical translation](https://www.ccel.org/ccel/schaff/npnf110.iii.XVI.html) | Brief excerpt, the homily’s three accounts of fulfillment, Romans 3:31 and 8:3–4 references, and the following anger/killing example |
| Translation credits | [CCEL edition title](https://www.ccel.org/ccel/schaff/npnf110.iii.i.html) and [editor’s preface](https://www.ccel.org/ccel/schaff/npnf110.ii.html) | George Prevost translation and M. B. Riddle revision; original Oxford edition context |
| Chrysostom’s association with Orthodox reception | [Orthodox Church in America](https://www.oca.org/orthodoxy/the-orthodox-faith/church-history/fourth-century/saint-john-chrysostom) | Author context only; no claim that all Orthodox readers endorse the exercise summary |
| John Wesley, Sermon 25, I.1–4 and II.1–3 | [CCEL 1872-edition text](https://www.ccel.org/ccel/wesley/sermons.v.xxv.html) | Brief excerpt, ceremonial/moral-law distinction, emphasis on explaining the law’s meaning, and Acts 15 references |
| Wesley and Methodist history | [The Methodist Church](https://www.methodist.org.uk/about/history/) | Historical association and diversity of Methodist developments; no universal present-day position asserted |
| Website and edition rights notices | [CCEL copyright policy](https://www.ccel.org/about/copyright.html) | Modern website/special contents remain distinct from historical editions; no full-work redistribution authorization is claimed |

Each source contributes one short excerpt of at most 25 words. Full works, modern introductions and site assets are not copied. Summaries and questions are visibly separate AI-assisted research writing. Source links and notices appear on reveal. `InterpretationSource.sourceSha256` is reproducibly the SHA-256 of the exact UTF-8 **short quotation**, not a checksum of a remote page or evidence of human approval. `BlindReflection.sourceSha256` separately records the Bible edition checksum. Change the challenge version when changing its source interpretation or evidence.

## Privacy, recovery and limits

The independent IndexedDB database is `adigun-aibible-blind-interpretation`, store `study`, key `private`. No network model requests, account sync or public publication are performed. Anyone with access to the browser profile can access these local records.

Storage commits use an atomic revision comparison. Concurrent stale writes and failed transactions preserve the existing notebook and retain the working draft. The storage layer also refuses to rewrite revealed before-text or rewind an existing reveal, including through a backup restore. Local history is an editing record, not independently authenticated proof of authorship or chronology.

The notebook permits up to 100 reflections, 30 historical edits per reflection, 6,000 characters in each reasoning field and 4 MB total serialized data. Limits fail explicitly rather than silently trimming writing or history. Private JSON backups contain saved reasoning and identities as opaque source IDs. An unrevealed plain-text writing export omits source identities and excerpts; a revealed export includes attribution. Bible Scripture is not included in these exports, avoiding an implied Scripture-export permission.

Imports validate the complete schema, sizes, dates, choices, immutable reveal history, installed challenge and Bible source checksums before offering a scoped replacement preview. Replacement requires confirmation. Malformed or stale-source imports cannot overwrite current data. Individual deletion and whole-notebook deletion require confirmation and affect only this notebook. Downloaded files remain outside deletion controls.

Unsaved writing and in-flight persistence prevent app updates; leaving prompts to retain or discard the draft. Reloading stored records retains unsaved writing, and reopening a saved record explicitly resolves a stale editor. Private writing export remains available for recovery. Explicit control associations, native buttons/selects/details, post-start/reveal focus, wrapping content and a single-column narrow layout support keyboard and mobile use.

## Validation and integration

- `node --test tests/blind-interpretation*.test.mjs`: 13 model/source and IndexedDB checks passed during implementation.
- `npm run typecheck` and `npx eslint src/interpretation`: passed for the component checkpoint.
- `tests/blind-interpretation.browser.spec.ts`: five production-browser scenarios cover persistence/reveal/revisit, narrow layout and draft guards, restore/source validation/deletion, concurrent tabs and source retry. They exercise the integrated host route. Local Chromium is unavailable; browser execution is **NOT TESTED locally** and remains an exact-candidate CI gate.
- Last component checkpoint verified remotely before the final tests/documentation: `5a9e9d94ca85de480074f17a7a70efea8170fa46` on `codex/interpretation-completion-20261105`. Root owns the final integration and release receipt in `docs/agent/PROJECT_STATUS.md`.

Human editorial/tradition review, broader sourced interpretation coverage and reviewed localization remain external content gates. No such approval or full-spec completion is claimed by this workspace.
