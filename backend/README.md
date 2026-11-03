# Connected backend preparation

These files are **not deployed or connected**. No Adigun-AiBible Supabase project
exists in the verified project inventory. Existing projects belonging to other
products must not be used. See `../docs/CONNECTED_SERVICES.md` for prerequisites.

`schema.sql` is a reviewable initial schema, not an applied migration. It targets
a new, dedicated Supabase PostgreSQL 15+ database and deliberately fails if its
application schemas already exist. It must never be run against another product.

`assistant.mjs` supplies a server-side request handler. Authentication, a durable
quota adapter, a trusted source resolver, and a real provider adapter must all be
configured before it can return generated output. Missing services fail closed.
It is not imported into the browser application.

Local verification (no service, database, email, or model calls):

```sh
node --test backend/tests/*.test.mjs
```

Database access-control scenarios in `VERIFY.md` remain a release gate until run
against the dedicated test project. Passing local handler tests does not prove
PostgreSQL permissions, RLS behavior, provider correctness, or a live integration.
