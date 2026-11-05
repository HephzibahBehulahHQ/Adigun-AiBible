# Optional compressed source JSON transport

Production packaging defaults to raw JSON. The candidate build can opt in with `ADIGUN_SOURCE_TRANSPORT=gzip-base64-v1 npm run build`; any other nonempty mode except `off` fails. Enable this setting for release only after the exact packaged artifact passes the full browser workflow.

The build copies validated canonical data to `public/data` and envelopes only `books/*.json` and `search-index.json` there. Canonical repository sources, provenance, source revision hashes, notices, logical URLs, and operation permissions remain unchanged. Gzip uses level 6 with deterministic headers. Every envelope carries its exact decoded byte length and SHA-256. A producer round trip verifies unchanged canonical bytes before writing the disposable build copy. Metadata, notices, chapter chunks, and unrelated JSON remain raw.

## Shared reader APIs

`readSourceJson(response, signal?)` reads a bounded response and returns parsed raw or decoded JSON. `decodeSourceJsonBytes(bytes, signal?)` accepts already verified transferred bytes, avoiding another response-body read or input copy. Both return `Promise<unknown>`; consumers still perform their existing source-specific schema and permission checks. The main data loader and search worker use the same decoder. A concordance loader should verify the offline inventory's transferred SHA first, then call `decodeSourceJsonBytes`.

`readBoundedJson(response, maxBytes)` handles raw metadata with a hard streaming byte limit before parsing. Offline metadata is limited to 4 MiB and 16,384 validated paths. The latter is an application safety bound, not a hosting file-count limit.

## Decoder limits and storage

The reader permits at most 64 MiB of transferred JSON, 64 MiB of decoded source JSON, 24 MiB of gzip data, and the corresponding 32 MiB base64 string. It enforces strict envelope keys/version/encoding, canonical base64 padding, declared output length, and an expansion ratio of at most 128 (with a 1 KiB allowance for small files). Actual decompressed output is bounded while streaming; a false declared length cannot allow unlimited expansion. UTF-8, JSON object/array shape, SHA-256, and nested-envelope rejection follow. Cancellation prevents late results. Browsers without gzip decompression or secure hashing receive an explicit error; raw development JSON remains supported.

The generated offline manifest hashes the actual transferred envelope. Existing service-worker integrity validation, cache keys, atomic marker publication, update staging, removal, and download inspection continue using those same logical paths and transferred bytes. CacheStorage retains the envelope; only requested source objects are decoded into the existing bounded memory caches. The codec verifies the canonical decoded hash independently before returning data.

Changing an existing asset from raw JSON to an envelope changes its transfer hash and therefore the normal content version. The existing migration stages the new representation before user-controlled activation. Existing apps without this decoder need their old controlled shell until update; rollout and offline migration are browser release gates.

## Capacity measurements

The inspected 14-Bible build contained 2,257 files and 199,148,748 bytes, including 2,194 offline inventory entries. Its 938 book/search payloads totalled 167,732,841 canonical bytes. Deterministic gzip level 6 measured 42,429,122 bytes; JSON plus base64 envelopes measured 56,749,999 bytes. Keeping all other assets raw projects approximately 88.2 MB for that build. These are measured source-payload comparisons, not device heap measurements.

Using the nine recent source editions' measured mix, 104 total editions project approximately 534 MB with current books/indexes enveloped, or 645 MB if the current 14 remain raw; their projected inventory is 8,494 paths. Richer future source structures, provenance, and duplicated chapter chunks can change that estimate. A packaged production build and all-browser gates must establish actual release size and behavior.
