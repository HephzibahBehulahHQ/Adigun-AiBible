# Public-source memory caches

The application bounds retained public Bible source objects independently of the number of installed editions. These are in-memory caches; eviction does not remove offline downloads, history, bookmarks, private notes, or other stored user data.

| Cache | Maximum retained entries | Reason |
| --- | ---: | --- |
| Source books | 24 | Holds recent reading and comparison books without retaining every book ever opened. |
| Edition manifests | 32 | Keeps frequently used source metadata without growing with the entire future catalog. |
| Search indexes, per worker | 2 | Keeps two recently searched full editions; larger multi-edition searches load one index at a time. |

`src/source-cache.ts` implements least-recently-used promise caching. Every request refreshes recency. Pending and resolved promises both count toward the entry limit. Duplicate requests share a retained promise. Eviction drops only the cache's reference: existing callers still receive their original result, and a later request can reload the same source. A failing request is removed only when it is still the cached promise for that exact key. An evicted request cannot delete or replace a newer request when it settles.

Book keys retain edition and book identity. Search keys additionally include the requested asset base and the manifest source checksum. Source validation and existing operation permission checks remain in their original paths. A cache miss uses the usual fetch path, so verified service-worker downloads can still supply data offline; missing sources retain their existing errors.

The search worker belongs to the main reader, whose existing handler discards any response ID other than its latest search ID. It retains one active request and one latest pending request. Replacing a pending request sends that superseded ID an explicit `{id, superseded: true, error}` response without loading its index. The active request completes; the latest then runs. This prevents old searches accumulating ahead of the latest while bounding simultaneous index loading/parsing/searching to one. Every ID receives a terminal response; active and latest results keep the existing ordering, total count, and 100-result response limit. A failed task cannot stop the latest request. This coalescing worker is for one latest-search owner; independent searches requiring every result need separate workers or a separate protocol. Searching more than two distinct editions can cause subsequent re-fetches; this is the deliberate memory/latency tradeoff.

These are entry-count limits, not a claimed byte-level heap ceiling. Book and index sizes vary; active callers can retain their own references, and evicted pending book loads may finish. A latest search can still wait for the single active request, but never a backlog of obsolete queued searches. No device-memory benchmark or physical-device acceptance result is claimed.

Focused verification: `node --test tests/source-cache*.test.mjs`. The tests cover cache churn, recency, pending deduplication, late failure/success races, retries, explicit supersession, and the latest work continuing after failure. Integration fixtures exercise the production data and worker module bodies with controlled network and permission adapters.
