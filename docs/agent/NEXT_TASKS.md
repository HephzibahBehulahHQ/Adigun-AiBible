# Version 3 continuation

Continue from deployed PR #3, main `4d8943e60143a74e228c0bf7ed37b2d404d6776c`; the live receipt was verified 4 November 2026, 13:17 Europe/Berlin. Current evidence belongs in [PROJECT_STATUS.md](PROJECT_STATUS.md), with requirement-level scope in [FEATURE_MATRIX.md](../FEATURE_MATRIX.md). Preserve this release while working on `codex/reader-context-20261104`.

## Next bounded slice: reader context and private navigation

1. Preserve and validate source-supplied headings, poetry, footnotes/cross-references and red-letter metadata during ingestion. Bind annotations to their edition/revision and exact text boundaries. Keep canonical Scripture text unchanged; do not infer annotations missing from a source.
2. Render available annotations accessibly with source attribution and explicit coverage. Publisher red-letter markup is source metadata, not a reviewed speaker corpus or evidence that the complete Speaker Explorer exists.
3. Add private reading history, return-to-previous-passage and multiple study tabs with explicit source identity. Preserve existing bookmarks/notes and handle missing editions, invalid references, storage failure and restoration safely. Keep this history on-device and provide deliberate removal controls.
4. Verify affected import/rendering and persistence behavior, keyboard/focus behavior and narrow layouts. Checkpoint useful work within five minutes; run the exact-candidate release gates before merging/deploying this slice and verify its live receipt. No completion is claimed before those checks.

## Following independent work

Prioritize the remaining reader/search and workspace requirements in the matrix, including saved layouts and command palette, then continue eligible advanced-study, language, discovery and presentation slices. Expand authentic edition acquisition without counting inventory leads toward the 100+ additional-edition target. PR #3 already delivered the local family, listening, sharing and support flows; extend them from their verified state rather than rebuilding them.

## Remaining external gates

1. Obtain actual human reviewer registration, approved Gen Z/Pidgin study wording and comparison records. Verify exact source hashes and separate language reviews before publication.
2. Resolve edition-specific Pidgin rights and native-language interface review. Preserve the named-source fallbacks until then; audit Biblica product-wide AI applicability before enabling affected operations.
3. Provision the dedicated backend after the interrupted setup is explicitly resumed. Execute the cross-user/cross-circle RLS, concurrency, moderation, retention/deletion and quota matrix; connect only tested services. Never substitute unrelated projects.
4. Configure an authenticated model endpoint, approved provider/secret/budget and opt-in client flow. Keep model calls and group posting disabled until runtime gates pass.
5. Acquire permitted recorded media and build native platform integrations when their actual assets/environments are available. Nearby rooms still require a genuine two-device offline transport test.

These gates remain independent of unblocked local implementation. Do not fabricate review, permissions or service availability, retry the cancelled backend setup without explicit resumption, or treat the released progress as completion of the full Version 3 scope.
