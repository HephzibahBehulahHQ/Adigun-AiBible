# Optional compressed source JSON transport

The production workflow opts into the packaged artifact for its full validation, browser and deployment gates. Direct command-line builds default to raw JSON and can opt in with `ADIGUN_SOURCE_TRANSPORT=gzip-base64-v1 npm run build`; any other nonempty mode except `off` fails. The integrated release may merge only after that exact packaged artifact passes the full browser workflow.

The build copies validated canonical data to `public/data` and envelopes only `books/*.json` and `search-index.json` there. Canonical repository sources, provenance, source revision hashes, notices, logical URLs, and operation permissions remain unchanged. Gzip uses level 6 with deterministic headers. Every envelope carries its exact decoded byte length and SHA-256. A producer round trip verifies unchanged canonical bytes before writing the disposable build copy. Metadata, notices, chapter chunks, and unrelated JSON remain raw.

## Shared reader APIs

`readSourceJson(response, signal?)` reads a bounded response and returns parsed raw or decoded JSON. `decodeSourceJsonBytes(bytes, signal?)` accepts already verified transferred bytes, avoiding another response-body read or input copy. Both return `Promise<unknown>`; consumers still perform their existing source-specific schema and permission checks. The main data loader and search worker use the same decoder. A concordance loader should verify the offline inventory's transferred SHA first, then call `decodeSourceJsonBytes`.

`readSourceBytes(response, maxBytes, signal?)` shares the same fixed-block streaming bound with concordance before outer-hash verification. `readBoundedJson(response, maxBytes)` handles raw metadata with a hard streaming byte limit before parsing. Offline metadata is limited to 4 MiB and 16,384 validated paths. The latter is an application safety bound, not a hosting file-count limit.

## Decoder limits and storage

The reader permits at most 64 MiB of transferred JSON, 64 MiB of decoded source JSON, 24 MiB of gzip data, and the corresponding 32 MiB base64 string. It enforces strict envelope keys/version/encoding, canonical base64 padding, declared output length, and an expansion ratio of at most 128 (with a 1 KiB allowance for small files). Actual decompressed output is bounded while streaming; a false declared length cannot allow unlimited expansion. UTF-8, JSON object/array shape, SHA-256, and nested-envelope rejection follow. Cancellation prevents late results. Browsers without gzip decompression or secure hashing receive an explicit error; raw development JSON remains supported.

The generated offline manifest hashes the actual transferred envelope. Existing service-worker integrity validation, cache keys, atomic marker publication, update staging, removal, and download inspection continue using those same logical paths and transferred bytes. CacheStorage retains the envelope; only requested source objects are decoded into the existing bounded memory caches. The codec verifies the canonical decoded hash independently before returning data.

Changing an existing asset from raw JSON to an envelope changes its transfer hash and therefore the normal content version. The existing migration stages the new representation before user-controlled activation. Existing apps without this decoder need their old controlled shell until update; rollout and offline migration are browser release gates.

## Capacity measurements

The original inspected 14-Bible build contained 2,257 files and 199,148,748 bytes, including 2,194 offline inventory entries. Its 938 book/search payloads totalled 167,732,841 canonical bytes. A Python gzip comparison measured 42,429,122 binary bytes and 56,749,999 envelope bytes. The actual Node 24 packaged production build produced 56,395,067 envelope bytes and a total `dist` size of **87,818,700 bytes**, still 2,257 files. Its offline inventory retains 2,194 paths and accounts for 85,604,660 transferred bytes; metadata itself is 354,501 bytes. Compressor implementations can differ without changing decoded canonical hashes. These are artifact measurements, not device heap measurements.

Using the nine recent source editions' measured mix, 104 total editions project approximately 534 MB with current books/indexes enveloped, or 645 MB if the current 14 remain raw; their projected inventory is 8,494 paths. Richer future source structures, provenance, and duplicated chapter chunks can change that estimate. A packaged production build and all-browser gates must establish actual release size and behavior.

## Verification and release gates

`node --test tests/source-codec.test.mjs tests/source-transport.test.mjs tests/offline.test.mjs tests/search-query.test.mjs` covers deterministic real-source round trips, bounded malformed inputs and output, cancellation, unsupported decompression, unchanged raw development JSON, build-only mutation, exact transferred hashes, bounded inventory expansion, and existing atomic pack/update/removal/search regressions.

`tests/source-transport.browser.spec.ts` requires the actual served Genesis artifact to be an envelope with the canonical source hash; it never skips on an accidentally raw build. Desktop/mobile scenarios cover reading and search, complete atomic download and offline reload, corrupt cached envelopes failing closed and recovering after a clean reload, explicit unsupported-browser errors, and raw JSON compatibility. Local browser execution remains unavailable; collection alone is not a browser pass. The root release workflow owns execution against the opt-in artifact before enabling transport for production.
