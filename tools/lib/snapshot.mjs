/**
 * public 스키마 객체 목록(스냅숏).
 * 마이그레이션 전후를 비교해 `lw_` 아닌 객체가 새로 생기거나 사라지지 않았는지 본다.
 *
 * 항목 형식: "<종류>:<이름>" 문자열, 정렬된 배열.
 *   table / partitioned_table / view / matview / sequence / foreign_table / index : pg_class
 *   function:<이름>(<인자 형식>)                                               : pg_proc
 *   type:<이름>  (도메인·열거형·복합형만. 표의 행 형식과 배열 형식은 뺀다)     : pg_type
 *   trigger:<표>.<트리거>                                                      : pg_trigger
 *   policy:<표>.<정책>                                                         : pg_policies
 * public 밖이지만 이 앱이 만드는 것도 함께 적는다(비교에서 `lw_` 검사 대상).
 *   publication:<발행>:<표>  (public 표만) / cron:<작업 이름>
 */
import { runSql } from './env.mjs';

const RELKIND = { r: 'table', p: 'partitioned_table', v: 'view', m: 'matview', S: 'sequence', f: 'foreign_table', i: 'index', I: 'index' };

export async function takeSnapshot() {
  const rows = await runSql(`
    select 'rel'::text as k, c.relkind::text as sub, c.relname::text as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f','i','I')
    union all
    select 'function', '', p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
    union all
    select 'type', '', t.typname::text
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype in ('d','e','c','r','m')
       and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
       and t.typelem = 0
    union all
    select 'trigger', '', c.relname::text || '.' || tg.tgname::text
      from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not tg.tgisinternal
    union all
    select 'policy', '', tablename::text || '.' || policyname::text from pg_policies where schemaname = 'public'
    union all
    select 'publication', '', pubname::text || ':' || tablename::text from pg_publication_tables where schemaname = 'public'
  `);
  const out = rows.map((r) => (r.k === 'rel' ? `${RELKIND[r.sub] || r.sub}:${r.name}` : `${r.k}:${r.name}`));
  // pg_cron 이 설치되어 있을 때만 작업 목록을 더한다(없으면 cron 스키마가 없다).
  const hasCron = await runSql(`select to_regclass('cron.job') is not null as ok`);
  if (hasCron[0]?.ok) {
    const jobs = await runSql(`select jobname from cron.job where jobname is not null`);
    for (const j of jobs) out.push(`cron:${j.jobname}`);
  }
  return [...new Set(out)].sort();
}

/**
 * 항목에서 `lw_` 검사 대상 이름을 뽑는다.
 *   policy:<표>.<정책> → 표와 정책 모두, publication:<발행>:<표> → 표, trigger:<표>.<트리거> → 둘 다
 */
export function namesOf(item) {
  const i = item.indexOf(':');
  const kind = item.slice(0, i);
  const rest = item.slice(i + 1);
  if (kind === 'function') return [rest.slice(0, rest.indexOf('('))];
  if (kind === 'policy' || kind === 'trigger') return rest.split('.');
  if (kind === 'publication') return [rest.slice(rest.indexOf(':') + 1)];
  return [rest];
}

/** 기준 목록과 비교해 규칙 위반(lw_ 아닌 것의 추가·삭제)을 돌려준다. */
export function compareSnapshot(baseline, current) {
  const base = new Set(baseline);
  const cur = new Set(current);
  const added = current.filter((x) => !base.has(x));
  const removed = baseline.filter((x) => !cur.has(x));
  const badAdded = added.filter((x) => !namesOf(x).every((n) => n.startsWith('lw_')));
  const badRemoved = removed.filter((x) => !namesOf(x).every((n) => n.startsWith('lw_')));
  return { added, removed, badAdded, badRemoved, ok: badAdded.length === 0 && badRemoved.length === 0 };
}
