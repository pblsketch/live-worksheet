#!/usr/bin/env node
/**
 * supabase/migrations/*.sql 을 이름 순서대로 관리 API(SQL 실행)로 적용한다.
 *
 *   node tools/apply-migrations.mjs              모든 마이그레이션 적용(여러 번 실행해도 안전)
 *   node tools/apply-migrations.mjs --snapshot   public 스키마 객체 목록을 출력하고
 *                                                supabase/baseline-snapshot.json 과 비교한다
 *                                                (lw_ 아닌 객체가 새로 생기거나 사라지면 실패)
 *   node tools/apply-migrations.mjs --snapshot --write <파일>  목록을 파일로도 저장
 *
 * 토큰은 .env.local 에서 읽고 절대 출력하지 않는다.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, runSql } from './lib/env.mjs';
import { takeSnapshot, compareSnapshot } from './lib/snapshot.mjs';

const args = process.argv.slice(2);

async function applyAll() {
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.error('마이그레이션 파일이 없습니다.');
    return 1;
  }
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const t0 = Date.now();
    try {
      await runSql(sql);
      console.log(`ok    ${f}  (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`FAIL  ${f}`);
      console.error(`      ${e.message}`);
      return 1;
    }
  }
  console.log(`\n${files.length}개 파일 적용 완료`);
  return 0;
}

async function snapshot() {
  const current = await takeSnapshot();
  console.log(JSON.stringify(current, null, 2));
  const wi = args.indexOf('--write');
  if (wi >= 0 && args[wi + 1]) {
    writeFileSync(args[wi + 1], JSON.stringify(current, null, 2) + '\n');
    console.error(`저장: ${args[wi + 1]}`);
  }
  const baseline = JSON.parse(readFileSync(join(ROOT, 'supabase', 'baseline-snapshot.json'), 'utf8'));
  const cmp = compareSnapshot(baseline, current);
  console.error(`\n기준 대비: 추가 ${cmp.added.length}개, 삭제 ${cmp.removed.length}개`);
  if (!cmp.ok) {
    for (const x of cmp.badAdded) console.error(`  lw_ 아닌 추가: ${x}`);
    for (const x of cmp.badRemoved) console.error(`  lw_ 아닌 삭제: ${x}`);
    console.error('규칙 위반: lw_ 아닌 객체가 바뀌었습니다.');
    return 1;
  }
  console.error('규칙 통과: 새로 생긴 객체는 모두 lw_ 접두어입니다.');
  return 0;
}

try {
  process.exitCode = args.includes('--snapshot') ? await snapshot() : await applyAll();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
