-- ═══════════════════════════════════════════════════════════════
--  live-worksheet · 0001 표와 읽기 권한
--
--  여러 번 실행해도 안전하다(데이터를 지우지 않는다).
--  이 앱이 만드는 이름에는 모두 lw_ 접두어를 붙인다.
--  lw_ 아닌 객체를 지우거나 바꾸는 문장은 쓰지 않는다.
-- ═══════════════════════════════════════════════════════════════

-- 관리자 암호 해시(crypt/bf)용. Supabase에는 extensions 스키마에 이미 있다.
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────────────────────────
--  연수: 공개 설정(활동·자료)은 config 에 통째로 둔다
-- ───────────────────────────────────────────────
create table if not exists public.lw_events (
  id         text primary key
             constraint lw_events_id_format check (id ~ '^[a-z0-9-]{3,40}$'),
  title      text not null
             constraint lw_events_title_len check (char_length(btrim(title)) between 1 and 200),
  date       date not null,
  listed     boolean not null default false,
  config     jsonb not null default '{}'::jsonb
             constraint lw_events_config_object check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 연수 비밀: 관리자 암호 해시, 공개 전용 내용(활동 id → 내용). 누구도 직접 읽지 못한다.
create table if not exists public.lw_event_secrets (
  event_id   text primary key references public.lw_events (id) on delete cascade,
  admin_hash text not null,
  reveal     jsonb not null default '{}'::jsonb
             constraint lw_event_secrets_reveal_object check (jsonb_typeof(reveal) = 'object'),
  updated_at timestamptz not null default now()
);

-- 참가자: 이름은 여기에만 둔다(응답에 복사하지 않는다)
create table if not exists public.lw_participants (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null references public.lw_events (id) on delete cascade,
  name          text not null
                constraint lw_participants_name_len check (char_length(name) between 1 and 20),
  norm_name     text not null,
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  anonymized_at timestamptz,
  constraint lw_participants_id_event_key unique (id, event_id)
);
create index if not exists lw_participants_event_norm_idx on public.lw_participants (event_id, norm_name);
create index if not exists lw_participants_event_seen_idx on public.lw_participants (event_id, last_seen desc);

-- 응답: (연수, 활동, 참가자)마다 한 건. 이름·점수 칸은 두지 않는다.
create table if not exists public.lw_responses (
  id             bigint generated always as identity primary key,
  event_id       text not null references public.lw_events (id) on delete cascade,
  activity_id    text not null,
  participant_id uuid not null,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint lw_responses_one_per_activity unique (event_id, activity_id, participant_id),
  constraint lw_responses_participant_fk foreign key (participant_id, event_id)
    references public.lw_participants (id, event_id) on delete cascade
);
create index if not exists lw_responses_participant_idx on public.lw_responses (participant_id);
create index if not exists lw_responses_event_updated_idx on public.lw_responses (event_id, updated_at desc);

-- 진행 설정: 키는 open:<활동 id> · reveal:<활동 id> · materials_open 세 종류, 값은 Y/N
create table if not exists public.lw_settings (
  event_id   text not null references public.lw_events (id) on delete cascade,
  key        text not null
             constraint lw_settings_key_format
             check (key ~ '^(open:[a-z0-9][a-z0-9_-]{0,39}|reveal:[a-z0-9][a-z0-9_-]{0,39}|materials_open)$'),
  value      text not null
             constraint lw_settings_value_yn check (value in ('Y', 'N')),
  updated_at timestamptz not null default now(),
  primary key (event_id, key)
);

-- ───────────────────────────────────────────────
--  RLS · 읽기는 네 표만 공개, 쓰기는 서버 함수로만
-- ───────────────────────────────────────────────
alter table public.lw_events        enable row level security;
alter table public.lw_event_secrets enable row level security;
alter table public.lw_participants  enable row level security;
alter table public.lw_responses     enable row level security;
alter table public.lw_settings      enable row level security;

-- Supabase 기본 권한(anon·authenticated에 모든 권한)을 걷어 내고 읽기만 다시 준다.
-- 비밀 표에는 아무 권한도 주지 않는다(정책도 없다).
revoke all on table public.lw_events, public.lw_event_secrets, public.lw_participants,
                    public.lw_responses, public.lw_settings
  from anon, authenticated;
revoke all on sequence public.lw_responses_id_seq from anon, authenticated;
grant select on table public.lw_events, public.lw_participants, public.lw_responses, public.lw_settings
  to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['lw_events', 'lw_participants', 'lw_responses', 'lw_settings'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = 'lw_read_all') then
      execute format('create policy lw_read_all on public.%I for select to anon, authenticated using (true)', t);
    end if;
  end loop;
end $$;
