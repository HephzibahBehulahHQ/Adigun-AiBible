# Backend acceptance gates

This checklist has **not been run against PostgreSQL or a live service**. It is
for a new dedicated test project after authorized provisioning. Never run it
against the existing projects for other products. Do not include real private
notes, live recipients or billable model calls in the initial tests.

## Offline checks available now

```sh
node --check backend/assistant.mjs
node --check backend/supabase-auth.mjs
node --check backend/source-catalog.mjs
node --test backend/tests/*.test.mjs
```

Tests use injected Auth/quota/provider doubles and committed public source data.
They cover access rejection, private-context rejection, request/context bounds,
source identity, actual missing Yoruba verses, quota/error handling, citation
validation, no-store/CORS, cancellation and timeouts. They do not test RLS.

## Dedicated database setup

1. Record the actual project reference and confirm its ownership and purpose.
   Review `schema.sql`, then apply it only to the empty dedicated project through
   the approved SQL tool. Inspect the actual Data API configuration: expose
   `aibible`, never `aibible_private`; no private table should be in a Realtime
   publication. Confirm admission requests use `READ COMMITTED`; capacity checks
   rely on a fresh statement snapshot after the shared advisory lock. Do not
   create custom objects in `auth`.
2. Create controlled test Auth accounts without sending mail to real recipients:
   owner A, member A, moderator A, owner B, and an outsider. Record their actual
   UUIDs. Also test the `anon` role and an anonymous Auth identity. Auth users
   must be genuine test accounts, not rows fabricated as production activity.
3. Use actual authenticated Data API requests for positive and negative checks.
   Supplement them with isolated SQL transactions for policies/triggers and
   concurrency. If using SQL, simulate request claims only in the dedicated test
   database and only within rollback transactions:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '<actual-test-user-uuid>',
  'role', 'authenticated',
  'is_anonymous', false
)::text, true);
-- Perform one scenario; inspect results or expected SQLSTATE.
rollback;
```

For setup shared by concurrent transactions, use only the dedicated test
database, explicitly record cleanup, and never report rollback-only tests as
proof of all PostgREST/API behavior. Auth JWT signature verification happens at
the API; simulated SQL claims do not prove it.

## Required scenario matrix

| Area | Exercise | Expected outcome |
| --- | --- | --- |
| Anonymous access | anon reads/writes every application/private table/function | Permission denial; no rows or usable private RPC |
| Anonymous Auth | authenticated role with is_anonymous true; missing claim | Restrictive policies deny access |
| Backup | A creates/reads/updates/deletes own valid document | Success; database revision increments |
| Backup isolation | B guesses A's user UUID; SELECT, UPDATE, DELETE, INSERT | No disclosure; no change; insert/default ownership protected |
| Backup validation | Wrong schemaVersion, unknown keys, wrong array types, oversized JSON | Rejected; prior backup retained |
| Sync conflict | Two devices update using the same expected revision | Only one succeeds; other sees zero rows and merge conflict |
| Immutable owner | Update circle owner/id or backup user_id, including bulk UPSERT | Denied by column grants/trigger; no transferred data |
| Circle isolation | A/B create separate circles; outsider requests IDs | Only member/owner circle visible |
| Invitations | Owner invites real target; target accepts | One member created at role member; invitation consumed |
| Invitation abuse | Wrong target, expired/revoked invite, forged owner, role moderator on join | Denied |
| Replay | Remove accepted member; reuse old invitation | Denied |
| Concurrency | Accept invite while owner revokes it in another transaction | At most one consistent outcome; no unconsumed reusable invite |
| Expiry race | Hold an admission lock while an accepted invite expires; release and race a new invitation | Waiting expired acceptance rolls back; no over-capacity admission |
| Capacity | Concurrent owner invites at 14 existing members/pending invites | Owner plus members/pending invites cannot exceed 15 |
| Roles | Member self-promotes; moderator promotes; owner promotes/demotes member | First two denied; owner change allowed |
| Identity | Member changes user_id/circle/owner/joined_at or someone else's display name | Denied |
| Membership removal | Remove member/moderator, reuse still-unexpired JWT | Group content/new posts/moderation immediately denied on next request |
| Posts | Owner posts without a membership row; member posts each kind | Success; server label and exactly one private author row |
| Cross-circle write | Member sends another circle ID/forged owner ID | Denied by membership/FK |
| Anonymity | Anonymous post response and all API query projections/joins | No author UUID; label Anonymous member |
| Author integrity | Spoof display label/anonymity after creation, insert/update/delete author map via API | Denied; mapping not publicly exposed |
| Author mapping rollback | Force attribution insertion failure | Entire post insertion rolls back; no unaccountable post |
| Editing | Another member/moderator rewrites author's body | Denied |
| Moderation | Moderator hides/unhides; author withdraws; moderator tries republishing withdrawn post | Authorized changes succeed; republish denied |
| Hidden evidence | Author tries editing hidden/withdrawn post | Denied; retained evidence unchanged |
| Removal/export | Removed member requests own posts and other members' posts | Own posts readable; other group posts unavailable |
| Reports | Member reports visible own-circle post; wrong-circle/post-owner tuple | First succeeds; second denied |
| Report privacy | Reporter, circle moderator, unrelated circle and outsider read report | Only reporter/moderator permitted |
| Report integrity | Reporter closes report or changes report identity/evidence | Denied; moderator may update state/resolution only |
| Direct write quotas | Six inserts in a minute via direct Data API for each action | First five succeed; sixth fails; gateway cannot be bypassed |
| Quota concurrency | Many concurrent writes under same user/action | Atomic ceiling; no lost updates or exceeded cap |
| Quota tampering | Client tries decrement/reset/delete/change private bucket identity | Denied |
| Assistant quota | Multiple users/connections reach minute/day/global caps | Exact cap, correct Retry-After, failed attempt rolls back every counter |
| Private functions | Browser tries invoking quota/session helpers | Not exposed/denied; only server adapter can reserve assistant quota |
| Delete | Delete own backup, circle, account through reviewed flow | Only intended data deleted; no orphaned authors; retention process respected |

Inspect foreign-key indexes, RLS-enabled flags and grants in catalog queries,
then run current Supabase security/performance advisors. Resolve issues before
recording real runtime evidence. A parser or manual SQL review is not a database
execution test.

## Connected assistant gates

Use a non-billable test adapter first. Confirm that no secrets appear in built
client assets or source maps. Authenticate against the real dedicated project,
then test forged/expired JWTs, wrong issuer, anonymous identities, revoked
sessions, deleted users and a valid user's session ID paired with another user.
All invalid cases must fail before quota/provider work.

Exercise quota store outage, concurrent reservations across two server
instances, malformed provider output, unknown citations, timeout, cancellation,
unauthorized origins and offline mode. Verify logs contain only necessary
operational metadata, not tokens, questions or private context. Verify no service
worker/cache persists private API responses. No session-cookie CORS mode is
provided by this handler.

Before a real provider call, select the provider/model, set actual spending
limits, confirm retention/data-processing choices, implement the provider adapter
and opt-in disclosure, and obtain any required spending authorization. Enforce
the output-token cap at the provider API as well as output-size checks. Test the
actual deployed endpoint with evidence before enabling the generative capability.

Publish truthful UI states throughout: local study assistant, cloud sync/circles
unavailable, or the exact configured feature. Do not describe a mocked provider
answer or unexecuted RLS policy as a live, verified feature.
