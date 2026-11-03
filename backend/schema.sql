-- REVIEW ONLY: initial schema for a NEW, DEDICATED Adigun-AiBible project.
-- Not applied. Do not run against VoltPRo or HephzibahBehulahHQ.
-- PostgreSQL 15+ / Supabase roles and auth.uid()/auth.jwt() are prerequisites.
-- Expose only aibible through the Data API; NEVER expose aibible_private.
-- No SECURITY DEFINER functions, auth-schema mutations, or Realtime publication.
begin;

create schema aibible;
create schema aibible_private;
revoke all on schema aibible, aibible_private from public, anon, authenticated;
grant usage on schema aibible, aibible_private to authenticated, service_role;
alter default privileges in schema aibible revoke all on tables from public, anon, authenticated;
alter default privileges in schema aibible_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema aibible revoke execute on functions from public;
alter default privileges in schema aibible_private revoke execute on functions from public;

create function aibible_private.permanent_user()
returns boolean language sql stable security invoker set search_path = ''
as $$ select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous' = 'false', false) $$;

create function aibible_private.valid_study_payload(value jsonb)
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(value) = 'object'
    and value->'schemaVersion' = '1'::jsonb
    and jsonb_typeof(value->'bookmarks') = 'array'
    and jsonb_typeof(value->'highlights') = 'array'
    and jsonb_typeof(value->'notes') = 'array'
    and jsonb_typeof(value->'completedSessions') = 'array'
    and jsonb_typeof(value->'journal') = 'array'
    and jsonb_typeof(value->'readingDays') = 'array'
    and value - array['schemaVersion','bookmarks','highlights','notes','completedSessions','journal','readingDays'] = '{}'::jsonb
    and octet_length(value::text) <= 5000000,
    false
  )
$$;

create table aibible.study_backups (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null check (aibible_private.valid_study_payload(payload)),
  device_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table aibible.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  owner_display_name text not null check (char_length(btrim(owner_display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index circles_owner on aibible.circles(owner_id);

create table aibible.circle_members (
  circle_id uuid not null,
  circle_owner_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id),
  foreign key (circle_id, circle_owner_id) references aibible.circles(id, owner_id) on delete cascade,
  check (user_id <> circle_owner_id) -- owner authority comes only from circles.owner_id
);
create index circle_members_user on aibible.circle_members(user_id, circle_id);
create index circle_members_owner on aibible.circle_members(circle_owner_id);

create table aibible.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null,
  circle_owner_id uuid not null,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  foreign key (circle_id, circle_owner_id) references aibible.circles(id, owner_id) on delete cascade,
  unique (circle_id, invitee_id),
  check (invitee_id <> circle_owner_id),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index circle_invitations_invitee on aibible.circle_invitations(invitee_id);
create index circle_invitations_owner on aibible.circle_invitations(circle_owner_id);

-- These invoker helpers read only the caller's membership, whose SELECT policy
-- never queries circles or another membership row. This avoids recursive RLS.
-- The owner argument must come from an FK-checked row, never a client assertion.
create function aibible_private.circle_member(circle uuid, circle_owner uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select aibible_private.permanent_user() and (
    circle_owner = auth.uid() or exists (
      select 1 from aibible.circle_members m where m.circle_id = circle and m.user_id = auth.uid()
    )
  )
$$;

create function aibible_private.circle_moderator(circle uuid, circle_owner uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select aibible_private.permanent_user() and (
    circle_owner = auth.uid() or exists (
      select 1 from aibible.circle_members m
      where m.circle_id = circle and m.user_id = auth.uid() and m.role = 'moderator'
    )
  )
$$;

create table aibible.circle_posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null,
  circle_owner_id uuid not null,
  kind text not null check (kind in ('reflection', 'prayer', 'question')),
  body text not null check (char_length(btrim(body)) between 1 and 12000),
  anonymous_to_group boolean not null default false,
  display_label text not null,
  moderation_state text not null default 'visible' check (moderation_state in ('visible', 'hidden', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (circle_id, circle_owner_id) references aibible.circles(id, owner_id) on delete cascade,
  unique (id, circle_id, circle_owner_id)
);
create index circle_posts_feed on aibible.circle_posts(circle_id, created_at desc);
create index circle_posts_owner on aibible.circle_posts(circle_owner_id);

-- No author identifier exists in the group-visible posts table. This table is
-- not exposed through REST/GraphQL/Realtime. Members can see only their own map.
-- Operators with trusted database access can resolve an author; no anonymity
-- claim may promise anonymity from those operators or from identifying content.
create table aibible_private.post_authors (
  post_id uuid primary key references aibible.circle_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict
);
create index post_authors_user on aibible_private.post_authors(user_id);

create function aibible_private.post_author(post uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select aibible_private.permanent_user() and exists (
    select 1 from aibible_private.post_authors a where a.post_id = post and a.user_id = auth.uid()
  )
$$;

create table aibible.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  circle_id uuid not null,
  circle_owner_id uuid not null,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'privacy', 'spam', 'unsafe', 'other')),
  details text not null default '' check (char_length(details) <= 4000),
  state text not null default 'open' check (state in ('open', 'resolved', 'dismissed')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, reporter_id),
  foreign key (post_id, circle_id, circle_owner_id)
    references aibible.circle_posts(id, circle_id, circle_owner_id) on delete cascade
);
create index moderation_reports_circle on aibible.moderation_reports(circle_id, state);
create index moderation_reports_reporter on aibible.moderation_reports(reporter_id);
create index moderation_reports_owner on aibible.moderation_reports(circle_owner_id);

-- Database-side counters for the server assistant adapter, never browser tables.
-- A quota reservation is charged even when a provider fails; there is no refund
-- endpoint that could be abused for unlimited retries.
create table aibible_private.assistant_quota (
  bucket text not null,
  window_start timestamptz not null,
  used integer not null check (used > 0),
  primary key (bucket, window_start)
);

-- RLS-protected write counters also apply to direct Data API writes. A gateway
-- alone would be bypassable while authenticated table INSERT grants exist.
create table aibible_private.write_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('posts', 'reports', 'invitations', 'circles')),
  window_start timestamptz not null,
  used integer not null check (used between 1 and 5),
  primary key (user_id, action, window_start)
);

create function aibible_private.guard_quota_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.user_id, new.action, new.window_start) is distinct from (old.user_id, old.action, old.window_start)
    or new.used <> old.used + 1 then
    raise exception 'Quota can only increment' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_quota_update before update on aibible_private.write_quota
for each row execute function aibible_private.guard_quota_update();

create function aibible_private.consume_write_quota(requested_action text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare written integer;
begin
  if not aibible_private.permanent_user() then raise exception 'Sign-in required' using errcode = '42501'; end if;
  insert into aibible_private.write_quota as q (user_id, action, window_start, used)
    values (auth.uid(), requested_action, date_trunc('minute', now()), 1)
    on conflict (user_id, action, window_start) do update set used = q.used + 1 where q.used < 5
    returning used into written;
  if not found then raise exception 'Write rate limit exceeded' using errcode = 'P0001'; end if;
end
$$;

create function aibible_private.limit_group_insert()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare occupants bigint;
begin
  perform aibible_private.consume_write_quota(tg_argv[0]);
  if tg_table_name = 'circle_invitations' then
    if new.circle_owner_id is distinct from auth.uid() then raise exception 'Owner required' using errcode = '42501'; end if;
    -- Owner can see all members/invitations; invitees cannot perform this lookup.
    -- Serialize invitations and count members + still-usable invitations in one
    -- snapshot. Acceptance exchanges one invitation for one membership.
    perform pg_advisory_xact_lock(hashtextextended(new.circle_id::text, 18771));
    select (select count(*) from aibible.circle_members where circle_id = new.circle_id)
      + (select count(*) from aibible.circle_invitations where circle_id = new.circle_id and expires_at > clock_timestamp())
      into occupants;
    if occupants >= 14 then raise exception 'Circle capacity reached' using errcode = '23514'; end if;
  end if;
  return new;
end
$$;
create trigger limit_circle_insert before insert on aibible.circles
for each row execute function aibible_private.limit_group_insert('circles');
create trigger limit_invitation_insert before insert on aibible.circle_invitations
for each row execute function aibible_private.limit_group_insert('invitations');
create trigger limit_report_insert before insert on aibible.moderation_reports
for each row execute function aibible_private.limit_group_insert('reports');

create function aibible_private.consume_assistant_quota(actor uuid)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  window_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  window_minute timestamptz := date_trunc('minute', now());
  target record;
  written integer;
  retry_seconds integer := 60;
begin
  if actor is null then raise exception 'Verified actor required' using errcode = '42501'; end if;
  begin
    -- Global bucket first gives all concurrent requests a consistent lock order.
    for target in select * from (values
      (1, 'assistant:global:day', window_day, 500, 86400),
      (2, 'assistant:' || actor::text || ':day', window_day, 50, 86400),
      (3, 'assistant:' || actor::text || ':minute', window_minute, 5, 60)
    ) as limits(position, bucket, starts, cap, seconds) order by position
    loop
      retry_seconds := greatest(1, ceil(extract(epoch from (target.starts + make_interval(secs => target.seconds) - clock_timestamp())))::integer);
      insert into aibible_private.assistant_quota as q (bucket, window_start, used)
        values (target.bucket, target.starts, 1)
        on conflict (bucket, window_start) do update set used = q.used + 1
          where q.used < target.cap
        returning used into written;
      if not found then raise exception 'Quota exhausted' using errcode = 'P0001'; end if;
    end loop;
  exception when sqlstate 'P0001' then
    -- PL/pgSQL subtransaction rolls back ALL reservations in this attempt.
    return query select false, retry_seconds;
    return;
  end;
  return query select true, 0;
end
$$;

-- Immutable identifiers are enforced by both column grants and triggers.
create function aibible_private.guard_study_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'Study ownership is immutable' using errcode = '42501';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end
$$;
create trigger guard_study_update before update on aibible.study_backups
for each row execute function aibible_private.guard_study_update();

create function aibible_private.guard_circle_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.id, new.owner_id, new.created_at) is distinct from (old.id, old.owner_id, old.created_at) then
    raise exception 'Circle ownership is immutable' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;
create trigger guard_circle_update before update on aibible.circles
for each row execute function aibible_private.guard_circle_update();

create function aibible_private.guard_member_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.circle_id, new.circle_owner_id, new.user_id, new.joined_at)
    is distinct from (old.circle_id, old.circle_owner_id, old.user_id, old.joined_at) then
    raise exception 'Membership identity is immutable' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and old.circle_owner_id is distinct from auth.uid() then
    raise exception 'Only the owner may change a member role' using errcode = '42501';
  end if;
  if new.display_name is distinct from old.display_name and old.user_id is distinct from auth.uid() then
    raise exception 'Only the member may change their display name' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_member_update before update on aibible.circle_members
for each row execute function aibible_private.guard_member_update();

create function aibible_private.consume_invitation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare consumed uuid;
begin
  -- Share the admission lock with invitation creation. The expiry check occurs
  -- after acquiring it, so a waiting acceptance cannot claim an expired slot.
  -- Data API admission transactions must use PostgreSQL READ COMMITTED.
  perform pg_advisory_xact_lock(hashtextextended(new.circle_id::text, 18771));
  delete from aibible.circle_invitations
    where circle_id = new.circle_id and circle_owner_id = new.circle_owner_id
      and invitee_id = auth.uid() and expires_at > clock_timestamp()
    returning id into consumed;
  if consumed is null then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  return new;
end
$$;
create trigger consume_invitation after insert on aibible.circle_members
for each row execute function aibible_private.consume_invitation();

create function aibible_private.prepare_post()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not aibible_private.circle_member(new.circle_id, new.circle_owner_id) then
    raise exception 'Circle membership required' using errcode = '42501';
  end if;
  perform aibible_private.consume_write_quota('posts');
  if new.anonymous_to_group then new.display_label := 'Anonymous member';
  elsif new.circle_owner_id = auth.uid() then
    select owner_display_name into new.display_label from aibible.circles where id = new.circle_id;
  else
    select display_name into new.display_label from aibible.circle_members
      where circle_id = new.circle_id and user_id = auth.uid();
  end if;
  new.moderation_state := 'visible';
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  return new;
end
$$;
create trigger prepare_post before insert on aibible.circle_posts
for each row execute function aibible_private.prepare_post();

create function aibible_private.record_post_author()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not aibible_private.permanent_user() then raise exception 'Sign-in required' using errcode = '42501'; end if;
  insert into aibible_private.post_authors(post_id, user_id) values (new.id, auth.uid());
  return new;
end
$$;
create trigger record_post_author after insert on aibible.circle_posts
for each row execute function aibible_private.record_post_author();

create function aibible_private.guard_post_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.id, new.circle_id, new.circle_owner_id, new.kind, new.anonymous_to_group, new.display_label, new.created_at)
    is distinct from (old.id, old.circle_id, old.circle_owner_id, old.kind, old.anonymous_to_group, old.display_label, old.created_at) then
    raise exception 'Post attribution and identity are immutable' using errcode = '42501';
  end if;
  if new.body is distinct from old.body and
    (not aibible_private.post_author(old.id) or old.moderation_state <> 'visible') then
    raise exception 'Only the author may edit a visible post' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then perform aibible_private.consume_write_quota('posts'); end if;
  if new.moderation_state is distinct from old.moderation_state then
    if new.moderation_state = 'withdrawn' and aibible_private.post_author(old.id) then null;
    elsif aibible_private.circle_moderator(old.circle_id, old.circle_owner_id)
      and new.moderation_state in ('visible', 'hidden') and old.moderation_state <> 'withdrawn' then null;
    else raise exception 'Post state change forbidden' using errcode = '42501'; end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;
create trigger guard_post_update before update on aibible.circle_posts
for each row execute function aibible_private.guard_post_update();

create function aibible_private.guard_report_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.id, new.post_id, new.circle_id, new.circle_owner_id, new.reporter_id, new.reason, new.details, new.created_at)
    is distinct from (old.id, old.post_id, old.circle_id, old.circle_owner_id, old.reporter_id, old.reason, old.details, old.created_at) then
    raise exception 'Report evidence and identity are immutable' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;
create trigger guard_report_update before update on aibible.moderation_reports
for each row execute function aibible_private.guard_report_update();

-- RLS on every application and private table. Restrictive permanent-user gates
-- also exclude Supabase anonymous sign-ins, which otherwise use authenticated.
alter table aibible.study_backups enable row level security;
alter table aibible.study_backups force row level security;
create policy permanent_users on aibible.study_backups as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy own_backup_select on aibible.study_backups for select to authenticated using (user_id = (select auth.uid()));
create policy own_backup_insert on aibible.study_backups for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_backup_update on aibible.study_backups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_backup_delete on aibible.study_backups for delete to authenticated using (user_id = (select auth.uid()));

alter table aibible.circles enable row level security;
alter table aibible.circles force row level security;
create policy permanent_users on aibible.circles as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy circles_select on aibible.circles for select to authenticated using (aibible_private.circle_member(id, owner_id));
create policy circles_insert on aibible.circles for insert to authenticated with check (owner_id = (select auth.uid()));
create policy circles_update on aibible.circles for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy circles_delete on aibible.circles for delete to authenticated using (owner_id = (select auth.uid()));

alter table aibible.circle_members enable row level security;
alter table aibible.circle_members force row level security;
create policy permanent_users on aibible.circle_members as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy membership_select on aibible.circle_members for select to authenticated
  using (user_id = (select auth.uid()) or circle_owner_id = (select auth.uid()));
create policy membership_accept on aibible.circle_members for insert to authenticated with check (
  user_id = (select auth.uid()) and role = 'member' and exists (
    select 1 from aibible.circle_invitations i where i.circle_id = circle_members.circle_id
      and i.circle_owner_id = circle_members.circle_owner_id and i.invitee_id = (select auth.uid()) and i.expires_at > clock_timestamp()
  )
);
create policy membership_update on aibible.circle_members for update to authenticated
  using (user_id = (select auth.uid()) or circle_owner_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) or circle_owner_id = (select auth.uid()));
create policy membership_leave_remove on aibible.circle_members for delete to authenticated
  using (user_id = (select auth.uid()) or circle_owner_id = (select auth.uid()));

alter table aibible.circle_invitations enable row level security;
alter table aibible.circle_invitations force row level security;
create policy permanent_users on aibible.circle_invitations as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy invitations_select on aibible.circle_invitations for select to authenticated
  using (circle_owner_id = (select auth.uid()) or invitee_id = (select auth.uid()));
create policy invitations_insert on aibible.circle_invitations for insert to authenticated
  with check (circle_owner_id = (select auth.uid()));
create policy invitations_delete on aibible.circle_invitations for delete to authenticated
  using (circle_owner_id = (select auth.uid()) or invitee_id = (select auth.uid()));

alter table aibible.circle_posts enable row level security;
alter table aibible.circle_posts force row level security;
create policy permanent_users on aibible.circle_posts as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy posts_select on aibible.circle_posts for select to authenticated using (
  (aibible_private.circle_member(circle_id, circle_owner_id) and moderation_state = 'visible')
  or aibible_private.circle_moderator(circle_id, circle_owner_id) or aibible_private.post_author(id)
);
create policy posts_insert on aibible.circle_posts for insert to authenticated
  with check (aibible_private.circle_member(circle_id, circle_owner_id));
create policy posts_update on aibible.circle_posts for update to authenticated
  using (aibible_private.circle_member(circle_id, circle_owner_id)
    and (aibible_private.post_author(id) or aibible_private.circle_moderator(circle_id, circle_owner_id)))
  with check (aibible_private.circle_member(circle_id, circle_owner_id)
    and (aibible_private.post_author(id) or aibible_private.circle_moderator(circle_id, circle_owner_id)));

alter table aibible_private.post_authors enable row level security;
alter table aibible_private.post_authors force row level security;
create policy permanent_users on aibible_private.post_authors as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy author_self_select on aibible_private.post_authors for select to authenticated using (user_id = (select auth.uid()));
create policy author_self_insert on aibible_private.post_authors for insert to authenticated with check (user_id = (select auth.uid()));

alter table aibible.moderation_reports enable row level security;
alter table aibible.moderation_reports force row level security;
create policy permanent_users on aibible.moderation_reports as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy reports_select on aibible.moderation_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or aibible_private.circle_moderator(circle_id, circle_owner_id));
create policy reports_insert on aibible.moderation_reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and aibible_private.circle_member(circle_id, circle_owner_id)
  and exists (select 1 from aibible.circle_posts p where p.id = post_id and p.moderation_state = 'visible')
);
create policy reports_update on aibible.moderation_reports for update to authenticated
  using (aibible_private.circle_moderator(circle_id, circle_owner_id))
  with check (aibible_private.circle_moderator(circle_id, circle_owner_id));

alter table aibible_private.assistant_quota enable row level security;
alter table aibible_private.assistant_quota force row level security;
-- No authenticated/anon policy exists for quota buckets.

alter table aibible_private.write_quota enable row level security;
alter table aibible_private.write_quota force row level security;
create policy permanent_users on aibible_private.write_quota as restrictive for all to authenticated
  using ((select aibible_private.permanent_user())) with check ((select aibible_private.permanent_user()));
create policy write_quota_select on aibible_private.write_quota for select to authenticated using (user_id = (select auth.uid()));
create policy write_quota_insert on aibible_private.write_quota for insert to authenticated
  with check (user_id = (select auth.uid()) and used = 1 and window_start = date_trunc('minute', now()));
create policy write_quota_update on aibible_private.write_quota for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No broad client INSERT/UPDATE grants: clients cannot supply ownership,
-- attribution, revision, timestamp, or moderation defaults outside this list.
revoke all on all tables in schema aibible, aibible_private from public, anon, authenticated;
grant select, delete on aibible.study_backups to authenticated;
grant insert (payload, device_id), update (payload, device_id) on aibible.study_backups to authenticated;
grant select, delete on aibible.circles to authenticated;
grant insert (name, description, owner_display_name), update (name, description, owner_display_name) on aibible.circles to authenticated;
grant select, delete on aibible.circle_members to authenticated;
grant insert (circle_id, circle_owner_id, user_id, display_name), update (role, display_name) on aibible.circle_members to authenticated;
grant select, delete on aibible.circle_invitations to authenticated;
grant insert (circle_id, circle_owner_id, invitee_id, expires_at) on aibible.circle_invitations to authenticated;
grant select on aibible.circle_posts to authenticated;
grant insert (circle_id, circle_owner_id, kind, body, anonymous_to_group), update (body, moderation_state) on aibible.circle_posts to authenticated;
grant select on aibible_private.post_authors to authenticated;
grant insert (post_id, user_id) on aibible_private.post_authors to authenticated;
grant select on aibible.moderation_reports to authenticated;
grant insert (post_id, circle_id, circle_owner_id, reason, details), update (state, resolution_note) on aibible.moderation_reports to authenticated;
grant select on aibible_private.write_quota to authenticated;
grant insert (user_id, action, window_start, used), update (used) on aibible_private.write_quota to authenticated;

revoke execute on all functions in schema aibible_private from public, anon, authenticated;
grant execute on function aibible_private.permanent_user(), aibible_private.valid_study_payload(jsonb),
  aibible_private.circle_member(uuid, uuid), aibible_private.circle_moderator(uuid, uuid),
  aibible_private.post_author(uuid), aibible_private.guard_study_update(), aibible_private.guard_circle_update(),
  aibible_private.guard_member_update(), aibible_private.consume_invitation(), aibible_private.prepare_post(),
  aibible_private.record_post_author(), aibible_private.guard_post_update(), aibible_private.guard_report_update(),
  aibible_private.guard_quota_update(), aibible_private.consume_write_quota(text), aibible_private.limit_group_insert()
  to authenticated;

-- service_role is operator/server-only and bypasses RLS. It is NEVER a browser
-- key. Quota function has no browser-callable RPC wrapper and takes only an
-- actor already verified by the server authentication adapter.
grant all on all tables in schema aibible, aibible_private to service_role;
grant execute on all functions in schema aibible_private to service_role;
commit;
