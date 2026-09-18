/**
 * stage_check 현황판 계산 (순수 함수)
 *   npm run test:unit
 * 「판단 갈림」 규칙(spec 4.5): 단계를 고른 사람 5명 이상 · 최다 단계 비율 < 0.45 · 쓰인 단계 3개 이상,
 * 가장 갈린 3개까지, 최다 비율 오름차순 → 쓰인 단계 수 내림차순. 지금 보는 보기의 응답만으로 계산한다.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPLIT_RULE, splitItems, splitInView, heatmap, rowsInView, boardViews, DEFAULT_STAGES, stagesOf
} from '../../assets/activities/stage_check.js';

const c = (id, stage) => ({ id, stage });
const ids = (list) => list.map((s) => s.id);

/** 응답 한 건. stages: { 항목 id: 단계 } */
function row(pid, objective, stages, extra = {}) {
  const items = {};
  for (const [k, v] of Object.entries(stages)) items[k] = { risk: '', stage: v, memo: '', ...(extra[k] || {}) };
  return { activity_id: 'practice', participant_id: pid, payload: { objective, items }, updated_at: `2026-10-15T00:00:${String(pid).padStart(2, '0')}Z` };
}
const A = { id: 'obj-a' };
const Bo = { id: 'obj-b' };
const CU = (text) => ({ id: 'custom', text });

const ACT = {
  id: 'practice',
  type: 'stage_check',
  items: [
    { id: 'topic', name: '탐구 주제 정하기' },
    { id: 'research', name: '자료 조사' },
    { id: 'draft', name: '보고서 초안 쓰기' },
    { id: 'reflect', name: '성찰 쓰기' }
  ],
  objectives: [
    { id: 'obj-a', group: '교과군 가', text: '목표 가' },
    { id: 'obj-b', text: '목표 나' }
  ],
  allowCustom: true
};

describe('판단 갈림 규칙 (splitItems)', () => {
  it('규칙 값은 5명 · 0.45 · 3단계 · 3개', () => {
    assert.deepEqual({ ...SPLIT_RULE }, { minPeople: 5, maxShare: 0.45, minStages: 3, limit: 3 });
  });

  it('경계 0.45: 최다 비율이 정확히 0.45면 갈림이 아니고, 0.44면 갈림이다', () => {
    const at45 = c('at45', [9, 6, 5, 0, 0]); // 9/20 = 0.45
    const at44 = c('at44', [11, 7, 7, 0, 0]); // 11/25 = 0.44
    assert.equal(9 / 20, 0.45);
    const r = splitItems([at45, at44]);
    assert.deepEqual(ids(r), ['at44']);
    assert.equal(r[0].share, 0.44);
    assert.equal(r[0].tot, 25);
    assert.equal(r[0].used, 3);
  });

  it('사람 수: 정확히 5명이면 갈림, 4명이면 아니다', () => {
    const five = c('five', [1, 1, 1, 1, 1]);   // 5명, 0.2, 5단계
    const four = c('four', [1, 1, 1, 1, 0]);   // 4명, 0.25, 4단계
    const fiveB = c('fiveB', [2, 1, 1, 1, 0]); // 5명, 0.4, 4단계
    assert.deepEqual(ids(splitItems([four, five, fiveB])), ['five', 'fiveB']);
  });

  it('쓰인 단계: 3개면 갈림, 2개면 아니다', () => {
    const three = c('three', [2, 2, 2, 0, 0]); // 6명, 1/3, 3단계
    const two = c('two', [3, 3, 0, 0, 0]);     // 6명, 0.5, 2단계
    assert.deepEqual(ids(splitItems([two, three])), ['three']);
    // 비율 조건을 풀어도 쓰인 단계 조건만으로 2단계는 빠진다
    const loose = { ...SPLIT_RULE, maxShare: 1.01 };
    assert.deepEqual(ids(splitItems([two, three], loose)), ['three']);
    const twoMany = c('twoMany', [0, 4, 0, 5, 0]);
    assert.deepEqual(ids(splitItems([twoMany], loose)), []);
  });

  it('갈림 항목이 넷 이상이면 가장 갈린 3개만 남긴다', () => {
    const list = [
      c('p40', [4, 3, 3, 0, 0]),       // 0.4
      c('p20', [1, 1, 1, 1, 1]),       // 0.2
      c('p30', [3, 3, 2, 2, 0]),       // 0.3
      c('p25', [2, 2, 2, 1, 1]),       // 0.25
      c('p43', [3, 2, 2, 0, 0])        // 3/7 ≈ 0.43
    ];
    const r = splitItems(list);
    assert.equal(r.length, 3);
    assert.deepEqual(ids(r), ['p20', 'p25', 'p30']);
  });

  it('정렬: 최다 비율 오름차순, 같으면 쓰인 단계가 많은 쪽이 먼저, 그래도 같으면 항목 순서', () => {
    const u3 = c('u3', [2, 2, 2, 0, 0]);     // 1/3, 3단계
    const u4 = c('u4', [2, 2, 1, 1, 0]);     // 2/6 = 1/3, 4단계
    const low = c('low', [1, 1, 1, 1, 1]);   // 0.2
    const u3b = c('u3b', [0, 0, 3, 3, 3]);   // 1/3, 3단계 (u3 와 완전히 같음)
    assert.equal(2 / 6, 1 / 3);
    const r = splitItems([u3, u4, low, u3b], { ...SPLIT_RULE, limit: 10 });
    assert.deepEqual(ids(r), ['low', 'u4', 'u3', 'u3b']);
    // 3개로 자르면 완전히 같은 둘 가운데 앞 항목이 남는다
    assert.deepEqual(ids(splitItems([u3, u4, low, u3b])), ['low', 'u4', 'u3']);
  });

  it('아무도 단계를 안 고른 항목, 한 단계로 몰린 항목은 갈림이 아니다', () => {
    assert.deepEqual(splitItems([c('none', [0, 0, 0, 0, 0]), c('all3', [0, 0, 9, 0, 0])]), []);
    assert.deepEqual(splitItems([]), []);
    assert.deepEqual(splitItems(null), []);
  });
});

describe('보기별 계산 (rowsInView · splitInView)', () => {
  // topic: obj-a 다섯 명은 1~5단계로 흩어지고, 나머지 넷은 모두 1단계 → 전체에서는 5/9 로 몰린다
  // draft: 2단계 셋, 4단계 셋, 5단계 셋 → 전체에서만 갈림(obj-a 안에서는 두 단계뿐)
  // research: 모두 3단계
  const rows = [
    row(1, A, { topic: 1, research: 3, draft: 2 }),
    row(2, A, { topic: 2, research: 3, draft: 2 }),
    row(3, A, { topic: 3, research: 3, draft: 2 }),
    row(4, A, { topic: 4, research: 3, draft: 4 }),
    row(5, A, { topic: 5, research: 3, draft: 4 }),
    row(6, Bo, { topic: 1, research: 3, draft: 4 }),
    row(7, Bo, { topic: 1, research: 3, draft: 5 }),
    row(8, CU('직접 적은 목표 하나'), { topic: 1, research: 3, draft: 5 }),
    row(9, CU('직접 적은 목표 둘'), { topic: 1, research: 3, draft: 5 })
  ];

  it('보기마다 그 목표를 고른 응답만 남긴다', () => {
    assert.equal(rowsInView(rows, 'all').length, 9);
    assert.equal(rowsInView(rows, { key: 'all' }).length, 9);
    assert.deepEqual(rowsInView(rows, 'o:obj-a').map((r) => r.participant_id), [1, 2, 3, 4, 5]);
    assert.deepEqual(rowsInView(rows, 'o:obj-b').map((r) => r.participant_id), [6, 7]);
    assert.deepEqual(rowsInView(rows, 'custom').map((r) => r.participant_id), [8, 9]);
    assert.deepEqual(rowsInView(rows, 'o:none'), []);
    assert.deepEqual(rowsInView(null, 'all'), []);
    // 학습목표가 없는 이상한 응답은 전체에만 든다
    const odd = [{ participant_id: 'x', payload: { items: {} } }];
    assert.equal(rowsInView(odd, 'all').length, 1);
    assert.equal(rowsInView(odd, 'custom').length, 0);
  });

  it('전체 보기: draft 만 갈림 (topic 은 1단계로 몰림, research 는 한 단계)', () => {
    const r = splitInView(ACT, rows, 'all');
    assert.deepEqual(ids(r), ['draft']);
    assert.equal(r[0].tot, 9);
    assert.equal(r[0].used, 3);
  });

  it('학습목표 하나(obj-a): topic 만 갈림 (draft 는 두 단계뿐)', () => {
    const r = splitInView(ACT, rows, 'o:obj-a');
    assert.deepEqual(ids(r), ['topic']);
    assert.equal(r[0].tot, 5);
    assert.equal(r[0].share, 0.2);
  });

  it('사람이 5명보다 적은 보기(obj-b, 직접 적은 목표)에는 갈림이 없다', () => {
    assert.deepEqual(splitInView(ACT, rows, 'o:obj-b'), []);
    assert.deepEqual(splitInView(ACT, rows, 'custom'), []);
  });

  it('직접 적은 목표 묶음도 5명 이상이 갈리면 표시한다', () => {
    const more = [
      row(21, CU('가'), { reflect: 1 }), row(22, CU('나'), { reflect: 2 }), row(23, CU('다'), { reflect: 3 }),
      row(24, CU('라'), { reflect: 4 }), row(25, CU('마'), { reflect: 5 }), row(26, A, { reflect: 1 })
    ];
    assert.deepEqual(ids(splitInView(ACT, more, 'custom')), ['reflect']);
    assert.deepEqual(ids(splitInView(ACT, more, 'o:obj-a')), []);
  });
});

describe('히트맵 집계 (heatmap)', () => {
  it('항목 × 단계 인원, 위험 분포, 메모(이름용 참가자 id와 함께)', () => {
    const rows = [
      row(1, A, { topic: 2, research: 3 }, { topic: { risk: '상', memo: '  출처   남기기 ' }, research: { risk: '중' } }),
      row(2, A, { topic: 2, research: null }, { topic: { risk: '상' }, research: { risk: '하', memo: '<b>굵게</b>' } }),
      row(3, Bo, { topic: 5 }, { topic: { risk: '하' } })
    ];
    const h = heatmap(ACT, rows);
    const byId = Object.fromEntries(h.items.map((x) => [x.id, x]));
    assert.deepEqual(byId.topic.stage, [0, 2, 0, 0, 1]);
    assert.equal(byId.topic.tot, 3);
    assert.deepEqual(byId.topic.risk, { 상: 2, 중: 0, 하: 1 });
    assert.equal(byId.topic.riskTot, 3);
    assert.deepEqual(byId.research.stage, [0, 0, 1, 0, 0]);
    assert.deepEqual(byId.research.risk, { 상: 0, 중: 1, 하: 1 });
    assert.deepEqual(byId.draft.stage, [0, 0, 0, 0, 0]);
    // 메모는 응답 순서대로, 한 줄로 정리해서(화면이 이스케이프한다)
    assert.deepEqual(h.memos.map((m) => [m.item, m.pid, m.memo]), [
      ['topic', 1, '출처 남기기'],
      ['research', 2, '<b>굵게</b>']
    ]);
  });

  it('범위 밖 단계, 모르는 위험 값, 모르는 항목 id 는 세지 않는다', () => {
    const rows = [{
      participant_id: 1,
      payload: {
        objective: A,
        items: {
          topic: { stage: 0, risk: '최상' },
          research: { stage: 6 },
          draft: { stage: '3' },
          reflect: { stage: 2.5 },
          ghost: { stage: 1, risk: '상', memo: '없는 항목' }
        }
      }
    }];
    const h = heatmap(ACT, rows);
    for (const it of h.items) {
      assert.equal(it.tot, 0, it.id);
      assert.equal(it.riskTot, 0, it.id);
    }
    assert.deepEqual(h.memos, []);
  });

  it('응답이 없으면 모두 0', () => {
    const h = heatmap(ACT, []);
    assert.equal(h.items.length, 4);
    assert.ok(h.items.every((x) => x.tot === 0));
    assert.deepEqual(heatmap(ACT, null).memos, []);
  });
});

describe('보기 목록 (boardViews)', () => {
  it('전체 → 학습목표(설정 순서) → 직접 적은 목표', () => {
    const v = boardViews(ACT);
    assert.deepEqual(v.map((x) => x.key), ['all', 'o:obj-a', 'o:obj-b', 'custom']);
    assert.equal(v[1].label, '교과군 가');
    assert.equal(v[2].label, '목표 2'); // 교과군 라벨이 없으면 순번
    assert.equal(v[3].label, '직접 적은 목표');
  });

  it('직접 적기를 허용하지 않으면 그 묶음이 없다', () => {
    const v = boardViews({ ...ACT, allowCustom: false });
    assert.deepEqual(v.map((x) => x.key), ['all', 'o:obj-a', 'o:obj-b']);
  });
});

describe('허용 단계 (stagesOf)', () => {
  it('기본 5단계 이름과 색은 지학사 판 그대로', () => {
    assert.deepEqual(DEFAULT_STAGES.map((s) => s.color), ['#7d9b5a', '#5f814f', '#4a7a76', '#35507c', '#2a4066']);
    assert.deepEqual(stagesOf(ACT).map((s) => `${s.n} ${s.name}`),
      ['1 혼자 힘으로', '2 생각 틔우기', '3 초안 거들기', '4 함께 다듬기', '5 같이 만들기']);
  });
});
