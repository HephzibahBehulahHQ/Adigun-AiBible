# Public-source memory caches

The application bounds retained public Bible source objects independently of the number of installed editions. These are in-memory caches; eviction does not remove offline downloads, history, bookmarks, private notes, or other stored user data.

| Cache | Maximum retained entries | Reason |
| --- | ---: | --- |
| Source books | 24 | Holds recent reading and comparison books without retaining every book ever opened. |
| Edition manifests | 32 | Keeps frequently used source metadata without growing with the entire future catalog. |
| Search indexes, per worker | 2 | Keeps two recently searched full editions; larger multi-edition searches load one index at a time. |

`src/source-cache.ts` implements least-recently-used promise caching. Every request refreshes recency. Pending and resolved promises both count toward the entry limit. Duplicate requests share a retained promise. Eviction drops only the cache's reference: existing callers still receive their original result, and a later request can reload the same source. A failing request is removed only when it is still the cached promise for that exact key. An evicted request cannot delete or replace a newer request when it settles.

Book keys retain edition and book identity. Search keys additionally include the requested asset base and the manifest source checksum. Source validation and existing operation permission checks remain in their original paths. A cache miss uses the usual fetch path, so verified service-worker downloads can still supply data offline; missing sources retain their existing errors.

The search worker queues requests in arrival order. Only one request can load, parse, and search an index at a time. It still answers every request ID, including failures, with the existing result ordering, total count, and 100-result response limit. A failed task cannot stop later requests. Searching more than two distinct editions can cause subsequent re-fetches; this is the deliberate memory/latency tradeoff.

These are entry-count limits, not a claimed byte-level heap ceiling. Book and index sizes vary; active callers can retain their own references, queued request metadata remains until serviced, and evicted pending book loads may finish. Serial search loading bounds active full-index work; it does not drop a user's query to reduce the queue. No device-memory benchmark or physical-device acceptance result is claimed.

Focused verification: `node --test tests/source-cache*.test.mjs`. The tests cover cache churn, recency, pending deduplication, late failure/success races, retries, and queued work continuing after failure. Integration fixtures exercise the production data and worker module bodies with controlled network and permission adapters.
