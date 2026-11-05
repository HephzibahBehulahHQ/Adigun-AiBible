# Arabic and Myanmar source rendering

Work in progress on `codex/multiscript-reading-20261105`, separate from the current release candidate. This branch prepares source-script rendering for the Arabic Van Dyck and Burmese Judson editions. It does not change any Scripture bytes or grant editorial approval.

Two original variable fonts are pinned to `google/fonts@fbe81817505e8aeadc53cc7a38a2b76fb57c333e`: Noto Naskh Arabic and Noto Sans Myanmar. Their original bytes and complete SIL Open Font License 1.1 notices are preserved. Local filenames omit axis punctuation; internal font data is unchanged. `public/fonts/sources.json` records original URLs, upstream Git blob identities, exact byte counts and SHA-256 digests. Combined font payload: 1,092,424 bytes.

Implemented in this work branch: source direction and typography in reader/comparison, font-ready share/widget/multiple-card layouts, explicit canvas RTL alignment with LTR credits restored, grapheme-preserving wrap slices, and source-font styles in print/projection. Original Scripture bytes remain unchanged.

Independent FontTools inspection of all actual Arabic Van Dyck and Burmese Judson book text found 47 Arabic-script and 64 Myanmar-script codepoints; every one is present in the respective pinned font cmap. Sixteen focused typography/passage-card/widget tests pass, including exact wrap reconstruction, mixed-script drawing, RTL widget anchors, source font readiness failure and existing Yoruba/English behavior. TypeScript passed before the last share/print changes; the final check remains pending.

Open review item: include public/fonts notices/provenance in the verified offline shell inventory. Actual desktop/mobile/320px/offline rendering and screenshot review remain required, together with combined source-batch integration and CI. This checkpoint is not a released feature.
