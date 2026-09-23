-- PRAMAAN initial schema: tables, indexes, RLS, triggers, RPCs, realtime, storage.
create extension if not exists pgcrypto;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  org text,
  role text not null default 'investigator',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── cases ─────────────────────────
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('image','video','audio')),
  source text not null check (source in ('upload','record','url','live','api')),
  filename text,
  mime_type text,
  preset text,
  file_path text,
  client_sha256 text,
  sha256 text,
  phash text,
  file_size bigint,
  duration_s double precision,
  status text not null default 'queued' check (status in ('queued','processing','complete','failed')),
  verdict text check (verdict in ('authentic','inconclusive','manipulated')),
  probability double precision,
  calibrated boolean not null default false,
  thresholds jsonb,
  modality_contributions jsonb,
  indicators jsonb,
  artifacts jsonb,
  model_versions jsonb,
  report jsonb,
  summary jsonb,
  is_shareable boolean not null default false,
  is_public_showcase boolean not null default false,
  parent_case_id uuid references public.cases(id) on delete set null,
  api_key_id uuid,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index cases_user_created_idx on public.cases (user_id, created_at desc);
create index cases_sha256_idx on public.cases (sha256);
create index cases_phash_idx on public.cases (phash);
create index cases_showcase_idx on public.cases (is_public_showcase, completed_at desc) where is_public_showcase;

-- ───────────────────────── case_events ─────────────────────────
create table public.case_events (
  id bigserial primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  step text not null,
  status text not null check (status in ('started','ok','error','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb not null default '{}'::jsonb
);
create index case_events_case_idx on public.case_events (case_id, id);

-- ───────────────────────── chat ─────────────────────────
create table public.chat_messages (
  id bigserial primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  grounding_warning boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_case_idx on public.chat_messages (case_id, id);

-- ───────────────────────── live ─────────────────────────
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  case_id uuid references public.cases(id) on delete set null,
  summary jsonb
);
create table public.live_windows (
  id bigserial primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  chunk_index int not null,
  chunk_path text,
  t_start double precision not null,
  scores jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, chunk_index)
);
create index live_windows_session_idx on public.live_windows (session_id, chunk_index);

-- ───────────────────────── API keys / usage ─────────────────────────
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prefix text not null,
  key_hash text not null unique,
  name text not null default 'Default key',
  monthly_quota int,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_user_idx on public.api_keys (user_id);
alter table public.cases add constraint cases_api_key_fk foreign key (api_key_id) references public.api_keys(id) on delete set null;

create table public.api_usage (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  period_month date not null,
  count int not null default 0,
  primary key (key_id, period_month)
);

-- ───────────────────────── model registry / catalog ─────────────────────────
create table public.model_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  modality text not null,
  storage_path text not null,
  format text not null,
  size_bytes bigint not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  dataset_stats jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  thresholds jsonb,
  calibrated boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (name, version)
);
create unique index model_registry_one_active on public.model_registry (name) where is_active;

create table public.indicator_catalog (
  id text primary key,
  name text not null,
  modality text not null,
  "group" text not null,
  method text not null,
  reference text not null,
  expected_range text not null
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.chat_messages enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_windows enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_usage enable row level security;
alter table public.model_registry enable row level security;
alter table public.indicator_catalog enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- role is administrative: users may edit only their display fields.
revoke insert, update on public.profiles from authenticated, anon;
grant update (display_name, org) on public.profiles to authenticated;

create policy cases_own_select on public.cases for select to authenticated using (user_id = auth.uid());
create policy cases_own_insert on public.cases for insert to authenticated with check (user_id = auth.uid() and status = 'queued' and verdict is null);
create policy cases_own_update on public.cases for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cases_own_delete on public.cases for delete to authenticated using (user_id = auth.uid());

-- Column-level privileges: users may only create request fields and toggle sharing; results are engine-written.
revoke insert, update on public.cases from authenticated, anon;
grant insert (user_id, media_type, source, filename, mime_type, preset, file_path, client_sha256, file_size, duration_s, parent_case_id)
  on public.cases to authenticated;
grant update (is_shareable, is_public_showcase) on public.cases to authenticated;

create policy case_events_own_select on public.case_events for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));

create policy chat_own_select on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy chat_own_insert on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and role = 'user'
              and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));

create policy live_sessions_own_select on public.live_sessions for select to authenticated using (user_id = auth.uid());
create policy live_sessions_own_insert on public.live_sessions for insert to authenticated with check (user_id = auth.uid());
create policy live_sessions_own_update on public.live_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy live_windows_own_select on public.live_windows for select to authenticated
  using (exists (select 1 from public.live_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy api_keys_own_select on public.api_keys for select to authenticated using (user_id = auth.uid());
-- Keys are minted only by the server (service role) so users cannot choose their own quota or hash.
revoke insert on public.api_keys from authenticated, anon;
create policy api_keys_own_update on public.api_keys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.api_keys from authenticated, anon;
grant update (name, revoked_at) on public.api_keys to authenticated;

create policy api_usage_own_select on public.api_usage for select to authenticated
  using (exists (select 1 from public.api_keys k where k.id = key_id and k.user_id = auth.uid()));

create policy model_registry_public_read on public.model_registry for select to anon, authenticated using (true);
create policy indicator_catalog_public_read on public.indicator_catalog for select to anon, authenticated using (true);

-- ───────────────────────── RPCs ─────────────────────────
-- Public verification: returns only verdict/hash/timestamps of shareable completed cases.
create or replace function public.verify_hash(p_sha256 text)
returns table (case_id uuid, media_type text, sha256 text, verdict text, probability double precision,
               calibrated boolean, created_at timestamptz, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.media_type, c.sha256, c.verdict, c.probability, c.calibrated, c.created_at, c.completed_at
  from public.cases c
  where c.sha256 = lower(p_sha256) and c.is_shareable and c.status = 'complete'
  order by c.completed_at desc
  limit 5;
$$;
revoke all on function public.verify_hash(text) from public;
grant execute on function public.verify_hash(text) to anon, authenticated;

-- Landing showcase: limited fields of cases explicitly flagged by their owners.
create or replace function public.public_showcase(p_limit int default 12)
returns table (case_id uuid, media_type text, verdict text, probability double precision, calibrated boolean,
               thumbnail_path text, overlay_path text, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.media_type, c.verdict, c.probability, c.calibrated,
         c.artifacts->>'thumbnail_path',
         coalesce(c.artifacts->'top_frames'->0->>'overlay_path', c.artifacts->'overlays'->0->>'path'),
         c.completed_at
  from public.cases c
  where c.is_public_showcase and c.status = 'complete'
  order by c.completed_at desc
  limit least(greatest(p_limit, 1), 48);
$$;
revoke all on function public.public_showcase(int) from public;
grant execute on function public.public_showcase(int) to anon, authenticated;

-- Atomic quota increment. Returns the new count, or -1 if the limit was already reached.
create or replace function public.increment_api_usage(p_key_id uuid, p_period date, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.api_usage (key_id, period_month, count) values (p_key_id, p_period, 0)
  on conflict (key_id, period_month) do nothing;
  update public.api_usage set count = count + 1
   where key_id = p_key_id and period_month = p_period and count < p_limit
  returning count into v_count;
  if v_count is null then return -1; end if;
  update public.api_keys set last_used_at = now() where id = p_key_id;
  return v_count;
end $$;
revoke all on function public.increment_api_usage(uuid, date, int) from public, anon, authenticated;
grant execute on function public.increment_api_usage(uuid, date, int) to service_role;

-- Aggregate stats for the current user's cases (security invoker: RLS applies).
create or replace function public.my_case_stats()
returns table (total bigint, complete bigint, failed bigint, in_progress bigint,
               authentic bigint, inconclusive bigint, manipulated bigint,
               images bigint, videos bigint, audios bigint, mean_probability double precision)
language sql stable security invoker set search_path = public as $$
  select count(*),
         count(*) filter (where status = 'complete'),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status in ('queued','processing')),
         count(*) filter (where verdict = 'authentic'),
         count(*) filter (where verdict = 'inconclusive'),
         count(*) filter (where verdict = 'manipulated'),
         count(*) filter (where media_type = 'image'),
         count(*) filter (where media_type = 'video'),
         count(*) filter (where media_type = 'audio'),
         avg(probability) filter (where status = 'complete')
  from public.cases where user_id = auth.uid();
$$;
grant execute on function public.my_case_stats() to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
alter table public.case_events replica identity full;
alter table public.cases replica identity full;
alter table public.live_windows replica identity full;
alter publication supabase_realtime add table public.case_events, public.cases, public.live_windows;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media-uploads', 'media-uploads', false, 52428800,
     array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','video/x-msvideo',
           'audio/wav','audio/x-wav','audio/wave','audio/flac','audio/mpeg','audio/webm','audio/ogg','audio/mp4']),
  ('overlays', 'overlays', false, 20971520, array['image/png','image/jpeg']),
  ('models', 'models', false, null, null),
  ('live-chunks', 'live-chunks', false, 10485760, array['video/webm','audio/webm','video/mp4']),
  ('reports', 'reports', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Objects are namespaced as <user_id>/... ; users can read/write only their own prefix.
create policy "media own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own select" on storage.objects for select to authenticated
  using (bucket_id = 'media-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "overlays own select" on storage.objects for select to authenticated
  using (bucket_id = 'overlays' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "live own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'live-chunks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "live own select" on storage.objects for select to authenticated
  using (bucket_id = 'live-chunks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reports own select" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
-- 'models' has no user policies: only the service role (engine, training) reads/writes it.
