# Arabic and Myanmar source rendering

Work in progress on `codex/multiscript-reading-20261105`, separate from the current release candidate. This branch prepares source-script rendering for the Arabic Van Dyck and Burmese Judson editions. It does not change any Scripture bytes or grant editorial approval.

Two original variable fonts are pinned to `google/fonts@fbe81817505e8aeadc53cc7a38a2b76fb57c333e`: Noto Naskh Arabic and Noto Sans Myanmar. Their original bytes and complete SIL Open Font License 1.1 notices are preserved. Local filenames omit axis punctuation; internal font data is unchanged. `public/fonts/sources.json` records original URLs, upstream Git blob identities, exact byte counts and SHA-256 digests. Combined font payload: 1,092,424 bytes.

Pending integration: explicit source direction, script-specific typography, font-ready canvas layout, exact Unicode image/print exports, source glyph coverage checks and actual desktop/mobile/offline screenshot review. Downloading these assets alone does not establish correct rendering.
