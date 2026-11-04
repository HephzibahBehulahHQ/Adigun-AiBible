# Version 3 requirement and evidence matrix

Scope: [canonical Version 3.0](specs/Adigun-AiBible_Codex_Master_Prompt.md), supplied 4 November 2026. This expands the existing release; it does not restart it. Code, licensed content, human review, live integrations and deployment are separate acceptance axes.

Baseline: PR #2, candidate `fc1dd49`, merge `25c90b1`; production now reports `2343a9137d3bfebf0563157ea558bfa8bd774664` (the user's specification-only update), build `1f0e5eb4525ee8733ee97d07`, content `fc77a48ca0b4b13da8981389`. HTTP 200 checked 4 November 2026, 07:45 Europe/Berlin. Prior release gates: 68 application tests, 20 backend contract tests, 26 browser cases without retries and 10 repeated persistence checks. These results do not certify new changes.

`Baseline` means implemented in that release. `Partial` means a working subset. `Pending` is not implemented or verified. `Gated` names an external prerequisite. No overall completion percentage is inferred.

| Spec / requirement | Implementation | Licensed / imported content | Human review | Live integration | Deployment evidence |
|---|---|---|---|---|---|
| 1–3,25 M0 continuation/brand/policy | Existing shell retained; v3 copied exactly; matrix added | Official asset and pinned references preserved | Not applicable | Existing repo/Pages | Baseline live; reconciliation checkpoint `a4cfb60` |
| 4 responsive shell, themes, inspector | Baseline retained; grouped Study Tools navigation added | Exact source details | Review states visible | Local | Baseline desktop/mobile/320px |
| 5 100+ additional authentic editions | Five-edition reader; pinned reproducible imports and acquisition pipeline | 5 installed Bible editions (2 additional); 1 separate Quran | Per-edition rights required | No licensed provider credentials | Baseline imports verified |
| 5 priority English/German/African editions | 208 provider inventory records and 43 priority requests; NLV distinct from NLT | Missing editions cannot be selected as readable | Unknown rights deny affected operations | Restricted sources gated | Pending |
| 5 catalog search/favorites/recent/coverage/2–4 panes | Catalog search/favorites/recent and 2–4 comparison panes implemented | Exact installed inventories; verse gaps explicit | No invented mappings | Local | Expanded browser gates pending |
| 6 en/de/yo/pcm/ha/ig/Gen Z | Four baseline UI locales; ha/ig/full dictionary pending | Actual de/yo texts; pcm/ha/ig unavailable | Native review and paraphrase approvals gated | Real device voices only | Baseline UI/edition separation |
| 7 detailed rights | Per-operation registry and runtime checks implemented | Preserve license/notice/source hashes | Biblica product-wide AI applicability unresolved | AI use denied until verified | New gates pending |
| 8 complete reader/ranges/recovery | Baseline | WEB 66 books/1189 chapters/31103 positions; actual de/yo manifests | Source immutable | Local/Pages | Baseline source/browser tests |
| 8 paragraph view/history/tabs/layouts/command palette | Pending expansion | Do not invent source headings/notes | Not applicable | Local | Pending |
| 8 advanced/private/saved search | Edition-specific worker with phrase/all/any, exclusions and book/testament filters | Installed indexes only | Concepts/speakers require validated mapping | Private records outside public index | Basic search baseline |
| 9 speakers/exact spans/nested quotes/uncertainty | Pending contracts/review pipeline/explorer | No approved speaker corpus | Actual review gated | Local | Pending |
| 10 lexicon/morphology/interlinear/concordance | Pending adapters/tools | Licensed linguistic sources/alignment required | Linguistic review gated | Source acquisition | Pending |
| 10 context/genealogy/atlas/chronology | Partial context/reference links | Sourced records with uncertainty required | Historical review gated | Local | Expanded views pending |
| 11 historical library/Moses works | Baseline classified catalog; reading expansion pending | 3 catalog-only records; no imported historical texts | Authorship/tradition/dating explicit | Primary source links | Baseline catalog |
| 12 Bible–Quran comparison | Baseline exact-source renderer and coverage gates | 114 surahs/6236 verses; 50 candidates retained | 0 approved production records | Local | Baseline source/review tests |
| 13 Gen Z/contemporary paraphrases | Baseline publication/adjacent source renderer | No approved production paraphrases | Registered independent human required | Local | Gate behavior tested |
| 14.1 sermon scanner | Local transcript/reference/quotation scanner and saved evidence sessions implemented | Exact permitted installed sources | Automated evidence is not a theological verdict | Live transcription/model gated | Pending |
| 14.2 3D Time Travel | Walkthrough/hotspot/timeline/2D fallback pending | Researched pilot and source assets needed | Reconstruction review gated | Graphics capability required | Pending |
| 14.3 Nigerian parables | Branching/source/reflection renderer pending | Labeled adaptations needed | Native/cultural/editorial review gated | Local | Pending |
| 14.4 decision simulations | Choices/consequences/replay/reflection pending | Sourced scenarios needed | No holiness score/divine guarantee | Local | Pending |
| 14.5 translation simulator | Linguistic adapter/experiments pending | Licensed lexicon/grammar/alignment required | Reviewed alternatives gated | Local | Pending |
| 14.6 blind interpretation | Blind/reveal/private notes pending | Fair sourced diverse interpretations needed | Editorial/tradition review gated | Local | Pending |
| 14.7 retelling coach | Recording/transcript/correction/source feedback pending | Exact passages/permitted audio | Native criteria; paraphrase distinct from recall | Real speech support required | Pending |
| 14.8 Family Legacy Bible | Private original files/consent/recording/transcript/search/backup/delete implemented; 13 data tests pass | User-owned material | User consent required | Local first; sharing backend gated | Pending |
| 14.9 detective missions | Clues/evidence/hints/progress pending | Real source-linked missions needed | Historical/editorial review gated | Multiplayer backend gated | Pending |
| 14.10 nearby rooms | Transport/capability/session model pending | Only sources permitting P2P | Not applicable | Two real supported devices offline required | NOT TESTED; QR/PWA is insufficient |
| 15 notes/tags/collections/boards/revisions | Baseline notes/bookmarks plus private collections and tagged workspace | Personal data | User-authored | Additive private IndexedDB | Baseline persistence verified |
| 15 prayer journal/reflection history | Private categories, passage links, follow-up dates and user outcomes implemented | Personal data | User states outcomes; no AI verdict | Local | New flow pending |
| 15 plans/memorization/learning | Two baseline plans plus editable flexible plans and edition-bound memory practice | Exact edition-specific source | No spiritual ranking | Local | New flow pending |
| 16 Verse Drop/moods/questions | Baseline moods/review gate plus finite, keyboard-navigable Verse Drop | Exact source feed; no invented answers | Mood explanations/Q&A approvals gated | Local | Partial baseline |
| 16 official country support resources | Accessible selector pending | Official links with verified dates needed | Pastoral language review | Public sources | Pending |
| 17 audio queue/loop/sleep/bilingual | Baseline TTS; queue controls pending | No recorded narration; TTS rights explicit | Narration correspondence required | Installed voices only | Baseline supported speech |
| 17 Share Studio/print/handouts | PNG/silent WebM plus verified full-range passage printing; multicard/bilingual exports pending | Operation-specific export rights | Paraphrases stay labeled | Browser format support | Baseline PNG/browser checks |
| 17 projection | Presenter/audience queue, timer and exact-source attribution implemented; full browser gates pending | Exact licensed passages | Private notes/answers excluded | Browser display support | Pending |
| 18 BOT | Baseline local tools; registry/preferences/new actions pending | Permitted source text only | Generation cannot self-approve | Server adapter prepared, not configured | Local baseline; model NOT LIVE |
| 19 groups/community/ministry | Backend schema/contracts; local ministry tools pending | User-owned drafts/content | Moderation prerequisites | Dedicated backend setup interrupted | Offline tests only |
| 20 PWA/offline/update safety | Baseline atomic verified packs, scope-safe removal, save guard | Only allowed downloads | Source changes invalidate review | App-scoped service worker | Baseline offline tests |
| 20 portability/privacy/deletion | Baseline backups/notebook; expanded stores need coverage | Local personal records | No invented telemetry | No cloud/analytics configured | Baseline backup tests |
| 21 runtime contracts | Existing refs/sources/review/study; added contracts in progress | Exact hashes/numbering | Review binds exact claim/dependencies | Local/server contracts | Baseline domain tests |
| 22 ingestion/editorial console/coverage | Baseline importer/publisher; expanded admin/UI pending | Actual counts and denominators | Reviewers registry empty | Server roles gated | Baseline publisher tests |
| 23 deployment | Existing repo/base path/workflow retained | No credentials in client | All release gates retained | Pages active | Live `2343a91` verified |
| 24,26 accessibility/performance | Baseline responsive reader; all new views require checks | Lazy specialist modules/indexes | Native string review outstanding | Existing CI | New screenshot/browser tests pending |
| 27 completion records | Matrix/current continuation reconciled | Actual counts only | Editorial gaps independent of code | Live evidence independent of mocks | Expanded product NOT complete |

## Edition counts and acceptance

Only a distinct authentic installed text edition that actually opens increases the reader count. Additional editions are measured beyond the three-edition baseline. Keep separate full Bible, New Testament, portions, historical, audio, metadata-only and awaiting-rights totals. Duplicate provider IDs, themes, UI locales, voices and paraphrase registers never inflate counts.

Every new slice needs source/rights and review evidence, preservation of existing personal data, material-risk checks and verification on the deployed revision. Test fixtures cannot satisfy production content review, real service authorization or two-device transport gates.
