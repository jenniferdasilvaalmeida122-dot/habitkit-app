BEGIN;

-- Executar uma unica vez em um projeto onde estas tabelas ainda nao existem.
-- Produto anual informado pelo proprietario e fixado na configuracao protegida.
-- Se o ID for removido (NULL), TODO acesso continua bloqueado.
-- Nao use o ID da oferta/link do checkout no lugar do ID do produto.
-- Nunca coloque chave de API, segredo de webhook ou senha neste arquivo.
create table public.vision_planner_config (
  singleton boolean primary key default true check (singleton),
  cakto_product_id text unique check (cakto_product_id is null or
    (length(cakto_product_id) between 1 and 200 and cakto_product_id=btrim(cakto_product_id)))
);
insert into public.vision_planner_config(singleton,cakto_product_id)
values(true, '69f774eb-5832-4dc6-9133-91f4455a8a5b');

alter table public.vision_planner_config enable row level security;
revoke all on public.vision_planner_config from public,anon,authenticated,service_role;
create table public.purchase_access (
  order_id text primary key check (length(order_id) between 1 and 200 and order_id=btrim(order_id)),
  product_id text not null check(length(product_id) between 1 and 200 and product_id=btrim(product_id)),
  email text not null check (email = lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null check (status in ('approved','refunded','chargeback')),
  paid_at timestamptz check (paid_at is null or isfinite(paid_at)),
  expires_at timestamptz check (expires_at is null or isfinite(expires_at)),
  check ((paid_at is null and expires_at is null) or (paid_at is not null and expires_at is not null and expires_at>paid_at)),
  check (status<>'approved' or (paid_at is not null and expires_at is not null)),
  updated_at timestamptz not null default now()
);
create index purchase_access_email on public.purchase_access(email);
create table public.payment_events (
  event_id text primary key check (length(event_id) between 1 and 500),
  order_id text not null,
  event_kind text not null check (event_kind in ('approved','refunded','chargeback')),
  input_fingerprint text not null check (length(input_fingerprint)=64),
  received_at timestamptz not null default now()
);
create table public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.purchase_access enable row level security;
alter table public.payment_events enable row level security;
alter table public.workspaces enable row level security;
revoke all on public.purchase_access,public.payment_events,public.workspaces from public,anon,authenticated;
grant select on public.workspaces to authenticated;

create function public.account_access() returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  -- Each purchase must qualify independently. Never borrow an expiry from a
  -- refunded/charged-back purchase, another product, or a future payment.
  -- A separate, genuinely paid annual purchase may keep the account active.
  with valid_purchases as (
    select least(p.expires_at,p.paid_at+interval '1 year') as valid_until
    from auth.users u
    join public.purchase_access p on p.email=lower(btrim(u.email))
    join public.vision_planner_config cfg on cfg.singleton and cfg.cakto_product_id=p.product_id
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and p.status='approved' and p.paid_at is not null and p.expires_at is not null
      and isfinite(p.paid_at) and isfinite(p.expires_at) and p.paid_at<=now()
      and least(p.expires_at,p.paid_at+interval '1 year')>now()
  )
  select jsonb_build_object(
    'active',exists(select 1 from valid_purchases),
    'expires_at',(select max(valid_until) from valid_purchases)
  );
$$;
revoke all on function public.account_access() from public,anon,authenticated,service_role;
grant execute on function public.account_access() to authenticated;

create policy own_active_workspace on public.workspaces for select to authenticated
using(user_id=auth.uid() and (public.account_access()->>'active')::boolean);

create function public.save_workspace(expected_revision integer, document jsonb) returns integer
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare actual integer;
begin
  if auth.uid() is null or not (public.account_access()->>'active')::boolean then
    raise insufficient_privilege using message='annual_access_required';
  end if;
  if expected_revision is null or expected_revision<0 or document is null
     or jsonb_typeof(document) is distinct from 'object' or jsonb_typeof(document->'habits') is distinct from 'object'
     or not (document ? 'vision') or jsonb_typeof(document->'vision') not in ('object','null')
     or octet_length(document::text)>3145728 then
    raise exception 'invalid_workspace';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select revision into actual from public.workspaces where user_id=auth.uid();
  if coalesce(actual,0)<>expected_revision then
    raise exception 'workspace_conflict' using errcode='40001';
  end if;
  if actual is null then
    insert into public.workspaces(user_id,payload,revision) values(auth.uid(),document,1);
    return 1;
  end if;
  update public.workspaces set payload=document,revision=actual+1,updated_at=now() where user_id=auth.uid();
  return actual+1;
end;
$$;
revoke all on function public.save_workspace(integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_workspace(integer,jsonb) to authenticated;

-- Only the server-side webhook may write payment grants. Refund/chargeback wins
-- over late or replayed approval events for the same purchase.
create function public.apply_payment_event(event_key text, purchase_id text, product text,
  buyer_email text, event_kind text, approved_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  existing public.purchase_access;
  fingerprint text;
  previous_event public.payment_events;
  normalized_email text;
begin
  if event_key is null or length(event_key) not between 1 and 500 or event_key<>btrim(event_key)
     or purchase_id is null or length(purchase_id) not between 1 and 200 or purchase_id<>btrim(purchase_id)
     or product is null or length(product) not between 1 and 200 or product<>btrim(product)
     or buyer_email is null or length(buyer_email)>254
     or btrim(buyer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or event_kind is null or event_kind not in ('approved','refunded','chargeback')
     or (event_kind='approved' and (approved_at is null or not isfinite(approved_at) or approved_at>now()+interval '5 minutes'))
     or (event_kind<>'approved' and approved_at is not null) then
    raise exception 'invalid_payment_event';
  end if;
  if not exists(select 1 from public.vision_planner_config cfg
      where cfg.singleton and cfg.cakto_product_id=product) then
    raise insufficient_privilege using message='vision_planner_product_required';
  end if;
  normalized_email:=lower(btrim(buyer_email));
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(purchase_id,product,normalized_email,event_kind,approved_at)::text,'UTF8')),'hex');
  -- The event lock prevents a reused event ID from racing across purchases.
  perform pg_advisory_xact_lock(hashtextextended('event:'||event_key,0));
  perform pg_advisory_xact_lock(hashtextextended('purchase:'||purchase_id,0));
  select * into previous_event from public.payment_events where event_id=event_key;
  if previous_event.event_id is not null then
    if previous_event.input_fingerprint<>fingerprint then
      raise exception 'payment_event_replay_mismatch';
    end if;
    return;
  end if;
  select * into existing from public.purchase_access where order_id=purchase_id;
  if existing.order_id is not null and
      (existing.email<>normalized_email or existing.product_id<>product) then
    raise exception 'payment_identity_mismatch';
  end if;
  insert into public.payment_events(event_id,order_id,event_kind,input_fingerprint)
    values(event_key,purchase_id,event_kind,fingerprint);
  -- Terminal states cannot be undone by a late/replayed approval.
  if existing.status in ('refunded','chargeback') and event_kind='approved' then return; end if;
  if existing.status='chargeback' then return; end if;
  insert into public.purchase_access(order_id,product_id,email,status,paid_at,expires_at)
    values(purchase_id,product,normalized_email,event_kind,approved_at,
      case when approved_at is not null then approved_at+interval '1 year' else null end)
  on conflict(order_id) do update set status=excluded.status,updated_at=now(),
    paid_at=coalesce(public.purchase_access.paid_at,excluded.paid_at),
    expires_at=coalesce(public.purchase_access.expires_at,excluded.expires_at);
end;
$$;
revoke all on function public.apply_payment_event(text,text,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.apply_payment_event(text,text,text,text,text,timestamptz) to service_role;

-- A private bucket: never use public URLs or long-lived signed links for images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dream-images','dream-images',false,8388608,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='dream-images' and
    (public or file_size_limit is null or file_size_limit>8388608 or allowed_mime_types is distinct from array['image/png','image/jpeg','image/webp','image/gif'])) then
    raise exception 'dream_images_bucket_configuration_mismatch';
  end if;
end $$;
create policy own_active_images_read on storage.objects for select to authenticated
using(bucket_id='dream-images' and (storage.foldername(name))[1]=auth.uid()::text
  and (public.account_access()->>'active')::boolean);
create policy own_active_images_insert on storage.objects for insert to authenticated
with check(bucket_id='dream-images' and (storage.foldername(name))[1]=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp|gif)$'
  and (public.account_access()->>'active')::boolean);
-- Immutable hashed objects: no client UPDATE or overwrite permission.
-- Unused image cleanup is performed server-side after checking workspace refs.

-- Restrictive policies also apply if another feature already installed a broad
-- permissive policy on storage.objects. Other buckets retain their own rules.
create policy protect_dream_images_read on storage.objects as restrictive for select to authenticated
using(bucket_id<>'dream-images' or ((storage.foldername(name))[1]=auth.uid()::text and (public.account_access()->>'active')::boolean));
create policy protect_dream_images_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'dream-images' or ((storage.foldername(name))[1]=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp|gif)$' and (public.account_access()->>'active')::boolean));
create policy no_anonymous_dream_images_read on storage.objects as restrictive for select to anon
using(bucket_id<>'dream-images');
create policy no_anonymous_dream_images_insert on storage.objects as restrictive for insert to anon
with check(bucket_id<>'dream-images');
create policy no_dream_images_overwrite on storage.objects as restrictive for update to anon,authenticated
using(bucket_id<>'dream-images') with check(bucket_id<>'dream-images');
create policy no_dream_images_delete on storage.objects as restrictive for delete to anon,authenticated
using(bucket_id<>'dream-images');

COMMIT;
