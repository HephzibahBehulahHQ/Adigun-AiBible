# Adigun-AiBible

A Scripture study application from HB Evangelism, built around named source editions, private device-based study, and evidence-bound editorial review.

[Open the deployed app](https://hephzibahbehulahhq.github.io/Adigun-AiBible/) · [Current release status](docs/agent/PROJECT_STATUS.md) · [Complete specification](docs/specs/Adigun-AiBible_Codex_Master_Prompt.md)

The current development candidate adds an edition-specific word and phrase concordance: complete occurrence counts, source-linked result pages, book distributions and exact Unicode highlighting. Matching rules and source-validation boundaries are documented in [docs/CONCORDANCE.md](docs/CONCORDANCE.md). It also adds [Hebrew and Aramaic source study](docs/HEBREW_STUDY.md): 39 separately numbered OSHB books, exact source words, supplied morphology and lemma fields, ketiv/qere alternatives, within-book lemma lookup and verified offline source packs. The [compact download format](docs/SOURCE_TRANSPORT.md) preserves canonical source bytes while reducing transferred Bible data. Candidate browser verification and deployment are tracked in the release status.

## Local development

Requires Node.js 24 and Python 3. Install the locked dependencies with `npm ci`, run `npm run dev`, and validate with `npm run check`. `npm run build` produces `dist/` under the `/Adigun-AiBible/` base path. `npm run preview` serves that build. Browser checks use `npm run test:e2e` after Playwright Chromium is installed. Backend contract tests use `node --test backend/tests/*.test.mjs`.

## Implemented product

Fourteen installed Bible text editions across English, German, Yorùbá, French, Spanish, Czech and Italian (eleven beyond the original three-edition baseline); a separate English ClearQuran reader; edition catalog and two-to-four source comparison; scoped search and deep links; private notes, prayer, collections, flexible plans, memorization and reflections; validated backups and verified offline packs; PNG and supported silent WebM export; finite Verse Drop; transcript evidence and projection; five themes and the existing interface locales.

Version 3 includes a local family archive for authorized original recordings, photographs, documents and memories, plus a device-speech listening queue with real voice detection, finite loops, sleep timer, bookmarks and saved verse positions. Multi-card and bilingual passage exports preserve complete text and source credits. An official support directory uses a country selected by the visitor. The source catalog derives languages from actual installed editions, preserves complete selected ranges, and pages larger result sets. Coverage separates imported text, publisher annotations, human review, device voices, configured services and verified cached content. See the current status for the exact candidate and deployment stage; a source checkpoint does not imply a released feature.

The Law Diary, source-linked context cards, private teaching workspace, lock-screen verse export, Speaker Explorer, coverage/editorial workbench and complete Lightfoot Didache reader extend the study tools. Historical works remain separate from Bible editions; publisher speech markings remain separate from independent speaker review.

Advanced workspaces add 14,298 pinned historical Greek/Hebrew/Aramaic dictionary records with verified offline downloads, private translation exercises, an Athens Acts 17 study tour with optional schematic 3D and a 2D export, and a private blind interpretation notebook. An experimental two-person nearby room supports explicit pairing/approval, discussion and permitted passage packages. Real offline testing on two physical devices remains pending. See [advanced study](docs/ADVANCED_STUDY.md), [interpretation](docs/BLIND_INTERPRETATION.md) and [nearby transport](docs/NEARBY_TRANSPORT.md) for exact scope and review limits.

Saved reader layouts retain appearance, publisher-display preferences, the passage inspector and two-to-four comparison pane choices. Open **Saved reader layouts** in the reader or Settings to save, apply, rename, delete or export them. Press **Control/Command + K**, or select the header command button, to find existing reader actions. Layouts remain on this device and have their own validated backup/recovery controls.

Gen Z and Pidgin study wording and interfaith comparison claims require independent human approval. Their publication pipeline and verse-aligned interface are implemented, but the production dataset currently contains no approvals. Missing review data never proves that no parallel exists. Interface translations still require native-language review.

Accounts, cloud synchronization, private circles and generative AI are not activated. Reviewable backend contracts exist under `backend/`; their deployment and runtime security gates remain separate. No browser bundle contains service credentials, and no personal notes are sent to an AI provider.

## Documentation

- [Architecture](docs/ARCHITECTURE.md), [reference audit](docs/REFERENCE_AUDIT.md), and [deployment](docs/DEPLOYMENT.md).
- [Sources and licenses](docs/SOURCES_AND_LICENSES.md), [coverage](docs/CONTENT_COVERAGE.md), [content policy](docs/CONTENT_POLICY.md), and [editorial workflow](docs/EDITORIAL_WORKFLOW.md).
- [Verification evidence](docs/TEST_RESULTS.md), [milestones](docs/agent/MILESTONES.md), [blockers](docs/agent/BLOCKERS.md), and [continuation](docs/agent/NEXT_TASKS.md).

A saved development checkpoint is not a deployed release. The authoritative release receipt is maintained in `docs/agent/PROJECT_STATUS.md`.
