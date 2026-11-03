# Connected services: prepared, not connected

Last verified: 3 November 2026. The attempted Supabase project creation was
interrupted; the project inventory contains **no Adigun-AiBible project**. The
existing VoltPRo and HephzibahBehulahHQ projects belong to other products and are
not targets for this work. No schema, account, project, email, model call, or
backend deployment was created by this preparation.

## Architecture decision

Use one dedicated Supabase project for accounts, PostgreSQL study backups and
private circles. Keep the current guest reader and device storage available
without an account. The schema and server handler are prepared in `backend/`;
neither is imported into the Vite client or represented as an active service.
Supabase is the selected backend design, not a claim that infrastructure exists.

| Prepared file | Purpose | Current evidence |
| --- | --- | --- |
| `backend/schema.sql` | Initial tables, constraints, invoker triggers, grants, RLS and quotas | Static review only; not applied |
| `backend/assistant.mjs` | Authenticated, bounded Request/Response handler | Offline unit tests |
| `backend/supabase-auth.mjs` | Live Auth user check plus mandatory active-session adapter | Injected-response tests; no Auth request made |
| `backend/source-catalog.mjs` | Read-only resolver for the actual imported editions | Tests against committed source books, including an omitted Yoruba verse |
| `backend/tests/assistant.test.mjs` | Security/error/cancellation contract tests | `node --test backend/tests/*.test.mjs` |
| `backend/VERIFY.md` | Database and deployment acceptance checklist | Not executed against a database |

## Private study backup sync

`aibible.study_backups` stores one versioned JSON document per authenticated
permanent user. Its shape matches `StudyState` schema version 1. The database
checks the top-level keys, array types and a 5,000,000-byte JSON text limit;
the server and client must also apply the existing full `validateStudy` checks
and edition-aware reference validation before accepting a backup. A database
shape check is not a substitute for those deeper checks.

Every read/write/delete is restricted to `auth.uid() = user_id`. Clients cannot
write another owner, server timestamps or revision numbers. Updates increment a
server revision. Uploads must compare the previously read revision in the update
filter; zero rows means a conflict, not success. Do not use unconditional upsert.
Download and validate the server copy, show a merge preview using the existing
study merge behavior, and retry only after the user accepts the merged result.
Preserve the local copy on network errors or conflicts.

Cloud backup is a separate explicit opt-in. Its disclosure must say which notes,
questions, bookmarks, highlights and plan progress will be uploaded, and that
operators can access database contents: **this design is not end-to-end
encryption**. Opt-out must stop future upload; a separate delete-cloud-copy action
removes the server row without silently erasing local study data. Neither cloud
backup nor sign-in grants permission to send private study data to a model.

## Circles and accountability

Circles are private and invite-only, with a maximum of 15 people including the
owner. Owner identity is immutable. Ownership transfer is deliberately absent;
it needs a separately reviewed workflow rather than an UPDATE to `owner_id`.
The owner may rename/delete their circle, invite an existing authenticated user,
remove members and change an accepted member between `member` and `moderator`.
Members can change their own display name and leave. They cannot promote
themselves, alter circle IDs, impersonate another member, or alter another
member's display name. The owner is an implicit member and cannot lose owner
authority by editing a membership row.

Admission transactions must use the normal Data API `READ COMMITTED` isolation;
the shared advisory lock plus a fresh statement snapshot protects concurrent
invitation/acceptance capacity checks. Recheck this configured isolation in the
dedicated project. This contract is not claimed for arbitrary long-lived
`REPEATABLE READ` transactions issued through a privileged SQL connection.

Invitations target an existing user's UUID, expire in at most seven days and are
consumed in the same transaction as acceptance. Acceptance always starts as
`member`. A removed member cannot reuse a consumed invitation. Invitations do
not automatically send emails or discover users by an unrestricted email lookup.
The first UI can let a signed-in person share their own account UUID privately.
Membership rows are visible to that member and the owner; this schema does not
provide a group-wide user-ID directory.

Posts support reflections, prayer requests and questions. Group-visible rows
contain the post and a server-derived display label, **not its author UUID**.
`aibible_private.post_authors` records the account identity atomically. Anonymous
posts display “Anonymous member”; authors and service operators can still resolve
the author. Circle moderators receive no special access to this private mapping.
The message itself, writing style, timing or a self-identifying display name can
reveal identity; this is anonymity of the group label, not complete anonymity.

Authors can edit their visible post or withdraw it. Moderators can hide/unhide
posts but cannot rewrite someone else's words or republish a withdrawn post.
Withdrawal is not immediate physical erasure. Removed members lose group reads
and writes; they can still read their own posts for export/deletion requests.
Reporters can read their reports, and the circle's owner/moderators can review
them. Reporters' identities are visible to those moderators; the reporting UI
must disclose this. A report never exposes an anonymous post author's identity.

Hard deletion and operator identity lookup require a real operational process.
Before release, appoint actual operators, define retention/appeal/deletion rules
and access auditing, and implement the authenticated deletion endpoint. Account
deletion must first handle owned circles and authored posts, because their Auth
foreign keys deliberately block deletion that would orphan accountability.
Deleting an owned circle cascades its members, invitations, posts and reports;
show that scope before confirmation and handle any retention obligation first.
No operator, moderator activity or care service is invented by this code.

## Access control and quotas

Expose only the `aibible` application schema in the Data API. Never expose
`aibible_private` via REST, GraphQL, RPC wrappers or Realtime. It has narrowly
granted privileges for invoker triggers, with RLS on every private table. All
functions are `SECURITY INVOKER`, with an empty search path and schema-qualified
application references. No function uses user-editable `user_metadata` for
authorization. No client policy/grant permits the `anon` role. A restrictive
policy also rejects anonymous Supabase Auth accounts, which otherwise have the
`authenticated` database role. The expected signed JWT must explicitly have
`is_anonymous: false`.

Every UPDATE policy includes USING and WITH CHECK. Composite foreign keys bind
copied circle-owner IDs to the real circle; column grants and triggers freeze
owner/member/post identities. Membership checks use current database rows,
so removal and demotion take effect on subsequent requests without waiting for
stale role metadata in a JWT. Private helper policies avoid recursive membership
lookups. There are no broadly exposed views or Realtime publications.

The direct Data API policies validate the signed identity, not live Auth session
existence. A signed-out access token can therefore remain usable until expiry;
configure a short access-token lifetime and document it. The assistant's server
contract adds a live session check. If immediate session revocation is required
for all private-data requests, add and verify an authorization gateway or a
reviewed session-check policy before enabling those flows; do not claim this
schema already provides that stronger property.

Direct Data API writes invoke database quotas: at most five successful creates
per user, per UTC minute, per action (`posts`, `reports`, `invitations`, `circles`).
Editing post text uses the same `posts` quota. Private counters cannot be reset
or decreased by clients. Concurrency and quota behavior still need database
tests. These limits reduce posting abuse; add HTTP/IP limits before Auth to
control invalid requests, bandwidth abuse and account farming. Operators should
review the values and retention of old quota buckets before enabling circles.

The assistant's private atomic quota function reserves five requests per user
per minute, 50 per user per UTC day, and 500 total per UTC day. A failed reservation
rolls back every counter in that attempt. Provider failures consume a successful
reservation. Only the trusted server can call this private function; there is no
browser RPC wrapper or in-memory fallback. The numbers are conservative initial
request ceilings, not proof of a monetary spending cap. Configure a real provider
budget, model token limits and alerts before making any billable call.

## Generative assistant contract

The server accepts `POST` JSON with exactly `question`, `locale`, and
`references`. Each reference contains `corpus`, `editionId`, `bookId`, `chapter`,
`verse`, and optional `endVerse`. For Quran references, `bookId` is `QUR` and
`chapter` is the surah number. Allowed edition IDs are the four actually imported
editions. No arbitrary URL, model, credential, user ID, source text, note, prayer,
history or conversation transcript is accepted. A free-text question is still
transmitted to the chosen provider; disclose this before the user opts in.

Limits: 16 KiB request body including chunked requests; 1,500 characters in the
question; four references; 20 verses in total; 12,000 source-text characters;
20-second default timeout; requested provider output at most 800 tokens. The
trusted resolver reads the committed source pack and rejects missing books,
chapters and actual omitted verse numbers. It preserves source Unicode and hashes
the selected UTF-8 text, joining multiple verses with a newline. Deployment must
run the existing corpus/import integrity checks before packaging these files.

Required server adapters:

1. **Authentication:** configure the dedicated project URL and publishable key.
   `createSupabaseAuthenticator` checks `/auth/v1/user`, rejects anonymous/banned
   users, and requires an active-session verifier. The verifier must validate the
   same JWT with the current project keys/issuer/expiry, derive its `session_id`,
   and check that session belongs to the verified user in `auth.sessions`.
   Never accept a user/session ID from the request body. Auth session revocation
   and account deletion need their own live regression tests.
2. **Quota:** a server-only database connection invokes
   `aibible_private.consume_assistant_quota(verified_user_uuid)` and maps its
   `allowed` and `retry_after_seconds` fields to the handler's
   `{allowed, retryAfterSeconds}` contract. Keep that schema unexposed. Use a
   narrowly privileged database role where possible; a service role bypasses
   RLS and must never be given to the browser. An outage or missing adapter must
   return 503, not permit the request.
3. **Sources:** mount the verified, read-only `data/` pack and pass its absolute
   path to `createFileSourceResolver`. Server deploys must include the source
   JSON and required license/notice files. The Node resolver needs a filesystem;
   a Supabase Edge Function deployment needs a reviewed bundled-source adapter.
4. **Provider:** implement a server-only adapter for the owner-selected provider
   and model, with a real output cap, credentials from a secret store, abort
   handling and bounded JSON decoding. No provider is selected or called here.
   Return only `{status, answer, citations}`. `status: "insufficient_sources"`
   requires `answer: null` and an empty citation array.

Missing Auth, provider, durable quota or source configuration fails closed with
503. Invalid authentication returns 401; invalid payloads return 400/413/415;
quota denial returns 429 with Retry-After; provider failures/invalid citations
return 502; timeouts return 504. The handler propagates cancellation and returns
499 if the client has cancelled. Errors never echo tokens or provider internals.
All responses are `Cache-Control: no-store`. CORS uses exact configured HTTPS
origins, no wildcard and no credentialed-cookie access.

Provider output is plain text, labelled **Generated study commentary** and
`unreviewed`. It is not automatically published as an editorial answer, source
quotation, comparison claim or approved paraphrase. Citation validation proves
only that returned IDs refer to supplied passages; it does not prove semantic
entailment or human review. The browser must render text safely and keep source
wording separately visible. No tool executes model-generated actions.

## Exact connection prerequisites and sequence

1. A new, explicitly identified Adigun-AiBible Supabase project and its region,
   plan/budget, current PostgreSQL version and owner are required. No existing
   unrelated project may be substituted. Apply `backend/schema.sql` only after
   review against that dedicated target; it is not a migration already applied.
2. Configure Auth providers, exact redirect URLs and email delivery intentionally;
   do not enable anonymous Auth sign-ins for these tables. No Auth emails are
   authorized merely by preparing these files. Decide the production web origin.
   GitHub Pages paths under one account share an origin, so another compromised
   app at that origin can threaten local tokens/data; a separate origin is
   recommended for sensitive cloud-linked workflows.
3. Configure Data API exposure and verify every scenario in `backend/VERIFY.md`
   with isolated test accounts. Run Supabase security/performance advisors and
   review any finding. Only then generate a real CLI migration using commands
   discovered through that CLI's `--help`; do not invent a migration history.
4. Deploy a real server wrapper for the Fetch handler and its four adapters.
   Node 24 is the local verified runtime. The browser receives only project URL,
   publishable key, assistant endpoint and working capability flags. Database
   credentials, service-role/secret keys and model keys are server secrets, never
   `VITE_*`, client assets, IndexedDB, logs, test fixtures or committed env files.
5. Complete operator procedures, retention/account deletion, request/usage
   budgets and live failover tests. Connect frontend sign-in, sync and circles
   through explicit opt-in screens. Disable each capability unless its actual
   integration health checks and acceptance gates pass. Local reading and the
   existing guided study assistant must continue during outages.

## Current documentation checked

The [Supabase changelog](https://supabase.com/changelog) and current Auth/Data API
guidance were checked during preparation. The upcoming
[TLS cipher retirement](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
and [PostgreSQL security minor release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
do not require legacy ciphers or extension-specific functions in this schema;
confirm the dedicated project's actual versions at connection time.

- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Anonymous sign-ins and authorization](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Auth sessions and active-session validation](https://supabase.com/docs/guides/auth/sessions)
- [Database function security](https://supabase.com/docs/guides/database/functions)

**Not verified:** schema execution, RLS results, concurrent SQL quotas, actual
Auth sessions, email, backend hosting, live provider responses, billing limits,
operational moderation or connected frontend flows. None may be claimed complete
from these offline files or tests.
