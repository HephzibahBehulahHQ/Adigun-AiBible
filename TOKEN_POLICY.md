# Token and Source Integrity Policy

These rules govern all Law Diary, Bible–Quran comparison, historical, and editorial work in Adigun-AiBible.

## 1. No fabrication

- Every Quran citation must identify a real surah and ayah.
- Every biblical citation must identify a real canonical book, chapter, and verse.
- If a parallel is uncertain, leave \`quranComparisons\` empty and record the research gap in \`NOTES.md\`.
- Missing data is acceptable. Fabricated citations are not.

## 2. Human-assigned comparison relationships

- The allowed relationship values are \`agrees\`, \`opposes\`, \`both\`, and \`none\`.
- A human editor assigns every relationship.
- Software may validate that a relationship is present and allowed. It must never infer a relationship from word matches, embeddings, or other text-analysis heuristics.

## 3. Keep canonical and historical works separate

- Lost books and deuterocanonical texts belong in a separate Historical Texts route.
- Label them **Non-canonical · Historical Text** and use the warning token.
- Never place them in canonical Bible book navigation.

## 4. Static-host-compatible navigation

- Use hash routes or ordinary anchor navigation for GitHub Pages.
- Do not introduce \`BrowserRouter\`.
- Every supported deep link must survive refresh without a server-side route 404.

## 5. Complete, honest interfaces

- No lorem ipsum, TODO comments, empty function bodies, or placeholder arrays.
- Every visible button must perform its stated action.
- Every route must render meaningful content.
- When research is incomplete, say **Data for this section is being entered** and identify the specific entries in progress. Do not imply that missing content is complete.

## 6. Neutral, non-proselytizing comparisons

- Compare texts without inviting conversion, ranking religions, or declaring one scripture correct.
- Comparison relationships are editor-assigned.
- Every comparison card must display the TrustBadge disclaimer:

  > AI-assisted, human review status: [status] · Comparison relationships are editor-assigned · This app does not proselytize or call for conversion.

## 7. Token and repository discipline

- Use targeted file searches and bounded file reads rather than dumping entire files.
- Batch independent repository reads where practical.
- Keep each implementation increment small, reviewable, and independently testable.
- Commit and push completed work; verify the remote branch SHA matches the pushed commit before reporting it.
- Never merge unrelated draft pull requests as part of this work.

## 8. Verify every release

- Run the relevant unit, contract, and browser tests before merging.
- Verify the exact pull-request head passed CI.
- After merging, verify the GitHub Pages workflow and the public build receipt against the expected main commit SHA.
- A successful push is not a successful deployment.

## 9. Language integrity

- Supported interface locales are English, German, Yoruba, and Nigerian Pidgin; Gen Z is a reading register/preset unless a distinct reviewed locale is implemented.
- Never silently substitute English for missing Yoruba or Pidgin content.
- Display a visible \`(EN fallback)\` or \`community_pending\` marker when a localized field is not yet reviewed.
- Do not invent translations. Unreviewed community-language content must remain clearly marked as pending.

## 10. Editorial provenance

- Every new Law Diary entry must include \`aiReviewStatus\` and a nonempty \`sources[]\`.
- Include biblical citations and, where applicable, Quranic citations in the source list.
- Distinguish human-authored material from AI-assisted drafts.
- Approval requires a recorded human review; an AI draft or a successful build is not editorial approval.
- Do not present church tradition, disputed authorship, or contested historical claims as settled biblical fact.

## 11. Sensitive content and reader safety

- Do not proselytize or provide conversion instructions.
- Do not harmonize genuine differences between religious texts; state documented differences neutrally.
- Clearly flag debated interpretations and prosperity-gospel risk rather than deleting relevant passages.
- Crisis-resource content must be accurate, current, and reviewed before publication.
