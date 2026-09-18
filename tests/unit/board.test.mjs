/**
 * 현황판 틀(board.js)의 순수 함수: 화면 목록, 주소의 화면 번호, 제출 현황
 *   npm run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { screenList, startIndex, completion } from '../../assets/board.js';
import { moduleFor } from '../../assets/activities/registry.js';

const EVENT = {
  id: 'x',
  activities: [
    { id: 'ox1', type: 'ox', title: 'O·X' },
    { id: 'practice', type: 'stage_check', title: '실습' },
    { id: 'pledge', type: 'sentence', title: '선언' }
  ]
};

describe('화면 목록', () => {
  it('활동 순서대로, 마지막에 제출 현황', () => {
    const s = screenList(EVENT);
    assert.deepEqual(s.map((x) => x.key), ['a:ox1', 'a:practice', 'a:pledge', 'status']);
    assert.deepEqual(s.slice(0, 3).map((x) => x.index), [0, 1, 2]);
    assert.deepEqual(screenList({}).map((x) => x.key), ['status']);
  });

  it('세 종류 모두 현황판 화면이 있다', () => {
    for (const t of ['ox', 'stage_check', 'sentence']) assert.equal(typeof moduleFor(t).board, 'function', t);
  });

  it('주소의 v 는 1부터 센다. 없거나 범위 밖이면 첫 화면', () => {
    assert.equal(startIndex('1', 4), 0);
    assert.equal(startIndex('3', 4), 2);
    assert.equal(startIndex('4', 4), 3);
    assert.equal(startIndex(' 2 ', 4), 1);
    for (const v of [null, undefined, '', '0', '5', '-1', '2a', '1.5', 'abc']) assert.equal(startIndex(v, 4), 0, String(v));
  });
});

describe('제출 현황 (completion)', () => {
  const people = [
    { id: 'p1', name: '가' }, { id: 'p2', name: '나' }, { id: 'p3', name: '다' }
  ];
  const r = (a, p) => ({ activity_id: a, participant_id: p });

  it('활동별 낸 사람 수, 사람별 점, 모두 완료', () => {
    const c = completion(EVENT.activities, people, [
      r('ox1', 'p1'), r('practice', 'p1'), r('pledge', 'p1'),
      r('ox1', 'p2'), r('pledge', 'p2'),
      r('ox1', 'ghost'),          // 참가자 목록에 없는 기록은 세지 않는다
      r('unknown', 'p3')          // 없는 활동도 세지 않는다
    ]);
    assert.equal(c.total, 3);
    assert.deepEqual(c.perActivity.map((x) => [x.id, x.count]), [['ox1', 2], ['practice', 1], ['pledge', 2]]);
    assert.deepEqual(c.people.map((p) => [p.name, p.marks, p.all]), [
      ['가', [true, true, true], true],
      ['나', [true, false, true], false],
      ['다', [false, false, false], false]
    ]);
    assert.equal(c.allDone, 1);
  });

  it('비어 있어도 된다', () => {
    const c = completion(EVENT.activities, [], []);
    assert.equal(c.total, 0);
    assert.equal(c.allDone, 0);
    assert.deepEqual(completion([], people, null).people.map((p) => p.all), [false, false, false]);
  });
});
