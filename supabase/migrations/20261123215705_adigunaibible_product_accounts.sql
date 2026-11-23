-- Product membership and completed sign-ins are written by the account service.
create schema adigunaibible_private;
revoke all on schema adigunaibible_private from public, anon, authenticated;

create table adigunaibible_private.product_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_email text not null unique check (login_email = lower(login_email)),
  password_hash text not null,
  email_verified_at timestamptz not null default now()
);

create table adigunaibible_private.verified_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references adigunaibible_private.product_accounts (user_id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > verified_at)
);
create index adigunaibible_verified_sessions_user_id on adigunaibible_private.verified_sessions (user_id);

alter table adigunaibible_private.product_accounts enable row level security;
alter table adigunaibible_private.verified_sessions enable row level security;
revoke all on adigunaibible_private.product_accounts, adigunaibible_private.verified_sessions from public, anon, authenticated;

create function adigunaibible_private.has_verified_session()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
    and exists (
      select 1
      from adigunaibible_private.verified_sessions as verified
      where verified.user_id = (select auth.uid())
        and verified.session_id::text = (select auth.jwt()->>'session_id')
        and verified.expires_at > statement_timestamp()
    );
$$;

create function public.adigunaibible_has_verified_product_session()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select adigunaibible_private.has_verified_session();
$$;

revoke execute on function adigunaibible_private.has_verified_session() from public, anon, authenticated;
revoke execute on function public.adigunaibible_has_verified_product_session() from public, anon, authenticated;
grant usage on schema adigunaibible_private to authenticated;
grant execute on function adigunaibible_private.has_verified_session() to authenticated;
grant execute on function public.adigunaibible_has_verified_product_session() to authenticated;


create table adigunaibible_private.account_worker_key (
  singleton boolean primary key default true check (singleton),
  proof_hash bytea not null
);
alter table adigunaibible_private.account_worker_key enable row level security;
revoke all on adigunaibible_private.account_worker_key from public, anon, authenticated;

create function adigunaibible_private.worker_is_authorized(worker_proof text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select length(worker_proof) = 72 and exists (
    select 1 from adigunaibible_private.account_worker_key
    where proof_hash = pg_catalog.sha256(pg_catalog.convert_to(worker_proof, 'UTF8'))
  );
$$;

create function adigunaibible_private.is_recent_email_otp(email_address text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select auth.uid() is not null
    and auth.jwt()->>'is_anonymous' is distinct from 'true'
    and email_address = pg_catalog.lower(auth.jwt()->>'email')
    and exists (
      select 1 from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end
      ) as factor
      where factor->>'method' = 'otp'
        and case when pg_catalog.jsonb_typeof(factor->'timestamp') = 'number'
          then (factor->>'timestamp')::numeric between
            extract(epoch from statement_timestamp()) - 600 and extract(epoch from statement_timestamp()) + 30
          else false end
    );
$$;

create function adigunaibible_private.check_product_password(worker_proof text, email_address text, password_proof text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  stored_hash text;
  candidate_hash text;
begin
  if adigunaibible_private.worker_is_authorized(worker_proof) is not true
    or email_address is null or length(email_address) > 254
    or password_proof is null or password_proof !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  select password_hash into stored_hash
  from adigunaibible_private.product_accounts where login_email = email_address;
  candidate_hash := extensions.crypt(password_proof, coalesce(stored_hash, extensions.gen_salt('bf', 12)));
  return stored_hash is not null and candidate_hash = stored_hash;
end;
$$;

create function adigunaibible_private.activate_product_account(worker_proof text, email_address text, password_proof text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
begin
  if adigunaibible_private.worker_is_authorized(worker_proof) is not true
     or adigunaibible_private.is_recent_email_otp(email_address) is not true
     or length(email_address) > 254
     or password_proof is null or password_proof !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into adigunaibible_private.product_accounts (user_id, login_email, password_hash)
  values (auth.uid(), email_address, extensions.crypt(password_proof, extensions.gen_salt('bf', 12)))
  on conflict do nothing;
  return found;
end;
$$;

create function adigunaibible_private.verify_product_session(worker_proof text, email_address text, password_proof text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
begin
  if adigunaibible_private.is_recent_email_otp(email_address) is not true
     or adigunaibible_private.check_product_password(worker_proof, email_address, password_proof) is not true
     or not exists (
       select 1 from adigunaibible_private.product_accounts where user_id = auth.uid() and login_email = email_address
     ) then
    return false;
  end if;

  insert into adigunaibible_private.verified_sessions (session_id, user_id, expires_at)
  select provider.id, provider.user_id, statement_timestamp() + interval '12 hours'
  from auth.sessions as provider
  where provider.id::text = auth.jwt()->>'session_id' and provider.user_id = auth.uid()
  on conflict (session_id) do nothing;
  return found;
end;
$$;

create function public.adigunaibible_check_product_password(worker_proof text, email_address text, password_proof text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select adigunaibible_private.check_product_password(worker_proof, email_address, password_proof); $$;

create function public.adigunaibible_activate_product_account(worker_proof text, email_address text, password_proof text)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select adigunaibible_private.activate_product_account(worker_proof, email_address, password_proof); $$;

create function public.adigunaibible_verify_product_session(worker_proof text, email_address text, password_proof text)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select adigunaibible_private.verify_product_session(worker_proof, email_address, password_proof); $$;

revoke execute on function adigunaibible_private.worker_is_authorized(text), adigunaibible_private.is_recent_email_otp(text)
  from public, anon, authenticated;
revoke execute on function adigunaibible_private.check_product_password(text,text,text),
  adigunaibible_private.activate_product_account(text,text,text),
  adigunaibible_private.verify_product_session(text,text,text),
  public.adigunaibible_check_product_password(text,text,text),
  public.adigunaibible_activate_product_account(text,text,text),
  public.adigunaibible_verify_product_session(text,text,text)
  from public, anon, authenticated;

grant usage on schema adigunaibible_private to anon;
grant execute on function adigunaibible_private.check_product_password(text,text,text),
  public.adigunaibible_check_product_password(text,text,text) to anon;
grant execute on function adigunaibible_private.activate_product_account(text,text,text),
  adigunaibible_private.verify_product_session(text,text,text),
  public.adigunaibible_activate_product_account(text,text,text),
  public.adigunaibible_verify_product_session(text,text,text) to authenticated;


create function adigunaibible_private.reset_product_password(worker_proof text, email_address text, password_proof text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  subject_id uuid := auth.uid();
begin
  if adigunaibible_private.worker_is_authorized(worker_proof) is not true
     or adigunaibible_private.is_recent_email_otp(email_address) is not true
     or length(email_address) > 254
     or password_proof is null or password_proof !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update adigunaibible_private.product_accounts
  set password_hash = extensions.crypt(password_proof, extensions.gen_salt('bf', 12))
  where user_id = subject_id and login_email = email_address;
  if not found then return false; end if;

  delete from adigunaibible_private.verified_sessions where user_id = subject_id;
  return true;
end;
$$;

create or replace function adigunaibible_private.verify_product_session(worker_proof text, email_address text, password_proof text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
begin
  if adigunaibible_private.worker_is_authorized(worker_proof) is not true
     or adigunaibible_private.is_recent_email_otp(email_address) is not true then
    return false;
  end if;

  -- Serialize new sign-ins with password recovery for this product account.
  perform 1 from adigunaibible_private.product_accounts
  where user_id = auth.uid() and login_email = email_address for update;
  if not found or adigunaibible_private.check_product_password(worker_proof, email_address, password_proof) is not true then
    return false;
  end if;

  insert into adigunaibible_private.verified_sessions (session_id, user_id, expires_at)
  select provider.id, provider.user_id, statement_timestamp() + interval '12 hours'
  from auth.sessions as provider
  where provider.id::text = auth.jwt()->>'session_id' and provider.user_id = auth.uid()
  on conflict (session_id) do nothing;
  return found;
end;
$$;

create function public.adigunaibible_reset_product_password(worker_proof text, email_address text, password_proof text)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select adigunaibible_private.reset_product_password(worker_proof, email_address, password_proof); $$;

revoke execute on function adigunaibible_private.reset_product_password(text,text,text),
  public.adigunaibible_reset_product_password(text,text,text) from public, anon, authenticated;
grant execute on function adigunaibible_private.reset_product_password(text,text,text),
  public.adigunaibible_reset_product_password(text,text,text) to authenticated;
