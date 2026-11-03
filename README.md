# Adigun-AiBible

A Scripture study application from HB Evangelism, built around named source editions, private device-based study, and evidence-bound editorial review.

[Open the deployed app](https://hephzibahbehulahhq.github.io/Adigun-AiBible/) · [Current release status](docs/agent/PROJECT_STATUS.md) · [Complete specification](docs/specs/Adigun-AiBible_Codex_Master_Prompt.md)

## Local development

Requires Node.js 24 and Python 3. Install the locked dependencies with `npm ci`, run `npm run dev`, and validate with `npm run check`. `npm run build` produces `dist/` under the `/Adigun-AiBible/` base path. `npm run preview` serves that build. Browser checks use `npm run test:e2e` after Playwright Chromium is installed. Backend contract tests use `node --test backend/tests/*.test.mjs`.

## Implemented product

English WEB, German Luther 1912 and licensed Biblica Yoruba source reading; a separate English ClearQuran reader; edition-aware search and deep links; notes, highlights, bookmarks, plans, private questions and backups; verified offline packs; real PNG and supported silent WebM export; browser speech; five themes; four interface languages; local Adigun BOT actions; a separately sourced historical catalog.

Gen Z and Pidgin study wording and interfaith comparison claims require independent human approval. Their publication pipeline and verse-aligned interface are implemented, but the production dataset currently contains no approvals. Missing review data never proves that no parallel exists. Interface translations still require native-language review.

Accounts, cloud synchronization, private circles and generative AI are not activated. Reviewable backend contracts exist under `backend/`; their deployment and runtime security gates remain separate. No browser bundle contains service credentials, and no personal notes are sent to an AI provider.

## Documentation

- [Architecture](docs/ARCHITECTURE.md), [reference audit](docs/REFERENCE_AUDIT.md), and [deployment](docs/DEPLOYMENT.md).
- [Sources and licenses](docs/SOURCES_AND_LICENSES.md), [coverage](docs/CONTENT_COVERAGE.md), [content policy](docs/CONTENT_POLICY.md), and [editorial workflow](docs/EDITORIAL_WORKFLOW.md).
- [Verification evidence](docs/TEST_RESULTS.md), [milestones](docs/agent/MILESTONES.md), [blockers](docs/agent/BLOCKERS.md), and [continuation](docs/agent/NEXT_TASKS.md).

A saved development checkpoint is not a deployed release. The authoritative release receipt is maintained in `docs/agent/PROJECT_STATUS.md`.
