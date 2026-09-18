-- ═══════════════════════════════════════════════════════════════
--  live-worksheet · 0003 실시간 방송과 익명화 예약 작업
--  여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
--  실시간: 참가자·응답·진행 설정의 변경을 방송한다
--  (클라이언트는 event_id 로 자기 연수만 걸러 받는다)
-- ───────────────────────────────────────────────
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime 발행이 없어 실시간 설정을 건너뜁니다.';
    return;
  end if;
  foreach t in array array['lw_participants', 'lw_responses', 'lw_settings'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 수정·삭제 방송에도 옛 행 전체(event_id 포함)가 실려야 연수별로 거를 수 있다
alter table public.lw_participants replica identity full;
alter table public.lw_responses    replica identity full;
alter table public.lw_settings     replica identity full;

-- ───────────────────────────────────────────────
--  익명화 예약 작업: 매일 18:17 UTC(한국 시각 새벽 3:17)
--  cron.schedule 은 같은 이름이 있으면 고쳐 쓴다(pg_cron 1.3+).
-- ───────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('lw_anonymize', '17 18 * * *', 'select public.lw_anonymize_expired()');
