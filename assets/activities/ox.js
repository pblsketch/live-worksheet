/**
 * 활동 부품: ox (한 문항씩 O/X를 고른다)
 *
 * 공개 설정: questions[N], choices?{ O, X } (버튼 아래 작은 설명)
 * 공개 전용(reveal:<id>가 Y일 때만 내려옴): answers[N], labels?[N], notes?[N], panel?[{name, desc?, picks[N], score?}]
 * payload: { answers: ['O'|'X', …] }
 * 점수는 저장하지 않는다. 공개된 정답과 공개 응답으로 화면에서 계산한다.
 */
import { esc } from '../core.js';

const PICKS = ['O', 'X'];

/** 맞힌 수(정답이 없으면 null) */
export function scoreOf(answers, correct) {
  if (!Array.isArray(correct) || !Array.isArray(answers)) return null;
  let n = 0;
  correct.forEach((c, i) => { if (answers[i] === c) n++; });
  return n;
}

/** 문항별 O/X 수 */
export function tally(activity, rows) {
  const t = (activity.questions || []).map(() => ({ O: 0, X: 0 }));
  for (const r of rows || []) {
    const a = (r.payload && r.payload.answers) || [];
    a.forEach((v, i) => { if (t[i] && (v === 'O' || v === 'X')) t[i][v]++; });
  }
  return t;
}

function caption(activity, v) {
  const c = activity.choices && typeof activity.choices === 'object' ? activity.choices[v] : '';
  return typeof c === 'string' ? c : '';
}

/* ───────────── 참가자 화면 ───────────── */

function participant(ctx) {
  const a = ctx.activity;
  const qs = a.questions || [];
  const N = qs.length;
  const root = ctx.root;
  const draft = ctx.draft;

  const saved = draft.load();
  const st = {
    mode: ctx.mine ? 'result' : 'answer',
    i: 0,
    ans: qs.map(() => null)
  };
  if (!ctx.mine && saved && Array.isArray(saved.ans) && saved.ans.length === N) {
    st.ans = saved.ans.map((v) => (v === 'O' || v === 'X' ? v : null));
    st.i = Math.min(Math.max(0, saved.i | 0), N - 1);
    if (st.ans.every(Boolean) && saved.review) st.mode = 'review';
  }
  let cur = ctx;

  const save = () => draft.save({ ans: st.ans, i: st.i, review: st.mode === 'review' });

  function drawAnswer() {
    const q = qs[st.i];
    root.innerHTML =
      (a.description && st.i === 0 ? `<div class="hint lead">${esc(a.description)}</div>` : '') +
      `<div class="qcount">${st.i + 1} / ${N}</div>` +
      `<div class="quote">${esc(q)}</div>` +
      '<div class="ox-row">' +
      PICKS.map((v) => {
        const cp = caption(a, v);
        return `<button class="ox-btn ${v.toLowerCase()}${st.ans[st.i] === v ? ' sel' : ''}" data-pick="${v}">` +
          `<div class="mk">${v}</div>${cp ? `<div class="cp">${esc(cp)}</div>` : ''}</button>`;
      }).join('') +
      '</div>' +
      (st.i > 0 ? '<button class="btn ghost sm wide" data-act="back">앞 문항으로</button>' : '');
    root.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = () => pick(b.dataset.pick);
    });
    const back = root.querySelector('[data-act="back"]');
    if (back) back.onclick = () => { st.i--; save(); drawAnswer(); };
  }

  function pick(v) {
    st.ans[st.i] = v;
    if (st.i < N - 1) {
      st.i++;
      save();
      drawAnswer();
      return;
    }
    st.mode = 'review';
    save();
    drawReview();
  }

  function drawReview() {
    root.innerHTML =
      '<div class="qcount">고른 답</div>' +
      '<div class="review">' +
      qs.map((q, i) =>
        `<button class="review-row" data-go="${i}"><span class="rn">${i + 1}</span>` +
        `<span class="rq">${esc(q)}</span><span class="ra">${esc(st.ans[i] || '·')}</span></button>`).join('') +
      '</div>' +
      '<div class="hint center">고칠 문항을 누르면 그 문항으로 돌아갑니다.</div>' +
      '<div class="sticky-b"><button class="btn" data-act="submit">제출하기</button></div>';
    root.querySelectorAll('[data-go]').forEach((b) => {
      b.onclick = () => { st.mode = 'answer'; st.i = Number(b.dataset.go); save(); drawAnswer(); };
    });
    const btn = root.querySelector('[data-act="submit"]');
    btn.onclick = async () => {
      if (!st.ans.every((v) => v === 'O' || v === 'X')) {
        const i = st.ans.findIndex((v) => !v);
        st.mode = 'answer'; st.i = i; drawAnswer();
        cur.toast('모든 문항에 O 또는 X를 골라 주세요.');
        return;
      }
      btn.disabled = true;
      btn.textContent = '제출하는 중…';
      const ok = await cur.submit({ answers: st.ans.slice() });
      if (!ok) { btn.disabled = false; btn.textContent = '제출하기'; return; }
      draft.clear();
      st.mode = 'result';
      drawResult();
    };
  }

  function drawResult() {
    cur.need(['responses']);
    const rows = cur.rows || [];
    const reveal = cur.reveal;
    const correct = reveal && Array.isArray(reveal.answers) ? reveal.answers : null;
    const mine = (cur.mine && cur.mine.answers) || st.ans;
    const t = tally(a, rows);
    const total = rows.length;
    const myScore = correct ? scoreOf(mine, correct) : null;
    let avg = 0;
    if (correct && total) avg = rows.reduce((s, r) => s + (scoreOf((r.payload || {}).answers, correct) || 0), 0) / total;

    const bars = qs.map((q, i) => {
      const x = t[i] || { O: 0, X: 0 };
      const sum = x.O + x.X;
      const po = sum ? Math.round((x.O / sum) * 100) : 0;
      const px = sum ? 100 - po : 0;
      const right = correct ? correct[i] : null;
      const label = reveal && Array.isArray(reveal.labels) ? reveal.labels[i] : '';
      const note = reveal && Array.isArray(reveal.notes) ? reveal.notes[i] : '';
      const my = mine[i];
      return '<div class="bar-item">' +
        `<div class="bq"><b>${i + 1}.</b> ${esc(q)}` +
        (right ? ` <span class="badge">정답 ${esc(right)}${label ? ` · ${esc(label)}` : ''}</span>` : '') + '</div>' +
        '<div class="bar">' +
        (x.O ? `<span class="b-o" style="width:${po}%">O ${po}%</span>` : '') +
        (x.X ? `<span class="b-x" style="width:${px}%">X ${px}%</span>` : '') +
        '</div>' +
        '<div class="bar-legend">' +
        `<span>O${caption(a, 'O') ? ` · ${esc(caption(a, 'O'))}` : ''} (${x.O}명)</span>` +
        `<span>X${caption(a, 'X') ? ` · ${esc(caption(a, 'X'))}` : ''} (${x.X}명)</span></div>` +
        (note ? `<div class="hint">${esc(note)}</div>` : '') +
        (my ? `<div class="hint">내 답: <b>${esc(my)}</b>` +
          (right ? (my === right ? ' <span class="ok">맞음</span>' : ' <span class="no">틀림</span>') : '') + '</div>' : '') +
        '</div>';
    }).join('');

    let panel = '';
    if (correct && Array.isArray(reveal.panel) && reveal.panel.length) {
      panel = '<div class="section-t">패널 성적표</div>' +
        '<div class="card flat"><table class="panel"><thead><tr><th></th>' +
        qs.map((_, i) => `<th>${i + 1}번</th>`).join('') + '<th>합계</th></tr></thead><tbody>' +
        reveal.panel.map((p) => {
          const picks = Array.isArray(p.picks) ? p.picks : [];
          return `<tr><td class="nm">${esc(p.name)}${p.desc ? `<small>${esc(p.desc)}</small>` : ''}</td>` +
            qs.map((_, i) => {
              const pk = picks[i] || '·';
              const good = pk === correct[i];
              return `<td>${esc(pk)} <span class="${good ? 'ok' : 'no'}">${good ? '✓' : '✗'}</span></td>`;
            }).join('') +
            `<td><b>${scoreOf(picks, correct)}/${N}</b></td></tr>`;
        }).join('') +
        '</tbody></table></div>';
    }

    root.innerHTML =
      '<div class="card blue center">' +
      `<div class="big-num">${total}<span>명</span></div>` +
      `<div class="hint">참여 · ${cur.liveBadge}</div>` +
      (correct ? `<div class="score-line">내 점수 <b>${myScore} / ${N}</b> · 평균 ${avg.toFixed(1)} / ${N}</div>` : '') +
      '</div>' +
      `<div class="bars">${bars}</div>` +
      panel +
      (!correct ? '<div class="hint center gap">정답은 진행자가 공개하면 이 화면에 나옵니다.</div>' : '') +
      '<div class="sticky-b"><button class="btn" data-act="menu">메뉴로</button></div>';
    root.querySelector('[data-act="menu"]').onclick = () => cur.goMenu();
  }

  function draw() {
    if (st.mode === 'result') drawResult();
    else if (st.mode === 'review') drawReview();
    else drawAnswer();
  }

  draw();

  return {
    update(next) {
      cur = next;
      if (st.mode !== 'result') {
        // 같은 이름으로 다른 기기에서 이미 냈다면 결과로 넘어간다
        if (next.mine) { st.mode = 'result'; draft.clear(); drawResult(); }
        return;
      }
      drawResult();
    },
    destroy() {}
  };
}

/* ───────────── 관리자 카드·응답 ───────────── */

function summary(activity) {
  return `${(activity.questions || []).length}문항`;
}

function adminCard(ctx) {
  const reveal = ctx.reveal;
  const correct = reveal && Array.isArray(reveal.answers) ? reveal.answers : null;
  const N = (ctx.activity.questions || []).length;
  const rows = ctx.rows || [];
  if (!correct) return '<span class="muted">정답 공개 전</span>';
  if (!rows.length) return '<span class="muted">정답 공개됨</span>';
  const avg = rows.reduce((s, r) => s + (scoreOf((r.payload || {}).answers, correct) || 0), 0) / rows.length;
  return `정답 공개됨 · 평균 <b>${avg.toFixed(1)} / ${N}</b>`;
}

function adminResponse(ctx, row) {
  const reveal = ctx.reveal;
  const correct = reveal && Array.isArray(reveal.answers) ? reveal.answers : null;
  const ans = (row.payload && row.payload.answers) || [];
  const N = (ctx.activity.questions || []).length;
  return '<div class="ox-chips">' +
    ans.map((v, i) => {
      const cls = correct ? (v === correct[i] ? ' ok' : ' no') : '';
      return `<span class="chip${cls}">${i + 1}·${esc(v)}</span>`;
    }).join('') +
    (correct ? `<span class="chip score">${scoreOf(ans, correct)}/${N}</span>` : '') +
    '</div>';
}

function adminCell(ctx, row) {
  const reveal = ctx.reveal;
  const correct = reveal && Array.isArray(reveal.answers) ? reveal.answers : null;
  if (!correct) return '✓';
  return `${scoreOf((row.payload || {}).answers, correct)}/${(ctx.activity.questions || []).length}`;
}

/* ───────────── 현황판 ───────────── */

/**
 * 현황판에 그릴 값. 정답이 공개되지 않았으면(reveal 에 answers 가 없으면)
 * 정답·라벨·해설·점수·패널을 하나도 담지 않는다.
 * @returns {{ total, revealed, questions:[{q,O,X,n,pO,pX,right,label,note}], avg, dist, panel:[{name,desc,picks,marks,score}] }}
 *   dist[k] = k개 맞힌 사람 수
 */
export function oxSummary(activity, rows, reveal) {
  const qs = activity.questions || [];
  const list = rows || [];
  const t = tally(activity, list);
  const correct = reveal && Array.isArray(reveal.answers) ? reveal.answers : null;
  const pick = (arr, i) => (correct && Array.isArray(arr) && typeof arr[i] === 'string' ? arr[i] : '');
  const questions = qs.map((q, i) => {
    const { O, X } = t[i];
    const n = O + X;
    const pO = n ? Math.round((O / n) * 100) : 0;
    return {
      q, O, X, n, pO, pX: n ? 100 - pO : 0,
      right: correct ? (correct[i] || null) : null,
      label: pick(reveal && reveal.labels, i),
      note: pick(reveal && reveal.notes, i)
    };
  });
  if (!correct) return { total: list.length, revealed: false, questions, avg: null, dist: null, panel: [] };
  const scores = list.map((r) => scoreOf((r.payload || {}).answers, correct) || 0);
  const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
  const dist = qs.map(() => 0).concat(0);
  for (const s of scores) if (dist[s] !== undefined) dist[s]++;
  const panel = (Array.isArray(reveal.panel) ? reveal.panel : []).map((p) => {
    const picks = qs.map((_, i) => (Array.isArray(p.picks) && (p.picks[i] === 'O' || p.picks[i] === 'X') ? p.picks[i] : ''));
    return {
      name: p.name || '',
      desc: p.desc || '',
      picks,
      marks: picks.map((v, i) => v === correct[i]),
      score: scoreOf(picks, correct)
    };
  });
  return { total: list.length, revealed: true, questions, avg, dist, panel };
}

/** 문항별 O/X 막대와 인원. 공개 뒤에는 정답 테두리와 패널 성적표 */
function board(ctx) {
  const a = ctx.activity;
  const root = ctx.root;
  let cur = ctx;

  function bar(x) {
    if (!x.n) return '<div class="oxbar"><span class="none">아직 응답이 없습니다</span></div>';
    const seg = (v, cnt, pct) => (cnt
      ? `<span class="${v.toLowerCase()}${x.right === v ? ' right' : ''}" style="width:${pct}%" data-seg="${v}">` +
        `<b>${v} ${pct}%</b><small>${cnt}명</small></span>`
      : '');
    return `<div class="oxbar">${seg('O', x.O, x.pO)}${seg('X', x.X, x.pX)}</div>`;
  }

  function sideHTML(s) {
    const N = s.questions.length;
    const panel = s.panel.length
      ? '<div class="side-h">패널 성적표</div>' +
        '<table class="oxpanel"><thead><tr><th></th>' +
        s.questions.map((_, i) => `<th>${i + 1}</th>`).join('') + '<th>합계</th></tr></thead><tbody>' +
        s.panel.map((p) =>
          `<tr><td class="nm">${esc(p.name)}${p.desc ? `<small>${esc(p.desc)}</small>` : ''}</td>` +
          p.picks.map((v, i) => `<td>${esc(v || '·')}<span class="${p.marks[i] ? 'ok' : 'no'}">${p.marks[i] ? '✓' : '✗'}</span></td>`).join('') +
          `<td class="sum"><b>${p.score}/${N}</b></td></tr>`).join('') +
        '</tbody></table>'
      : '';
    const maxD = Math.max(1, ...(s.dist || [0]));
    const dist = s.total
      ? '<div class="dist">' + s.dist.map((c, k) => ({ c, k })).reverse().map(({ c, k }) =>
        `<div class="dr"><span class="dk">${k}개 맞힘</span>` +
        `<span class="dt"><i style="width:${((c / maxD) * 100).toFixed(1)}%"></i></span><b>${c}명</b></div>`).join('') + '</div>'
      : '';
    return panel +
      '<div class="side-h">오늘 여기</div>' +
      (s.total
        ? `<div class="ours"><span class="ov">${s.avg.toFixed(1)}<small>/ ${N}</small></span>` +
          `<span class="ol">${s.total}명 평균</span></div>${dist}`
        : '<div class="side-empty">아직 낸 사람이 없습니다.</div>');
  }

  function draw() {
    const rows = cur.rows;
    if (!rows) {
      root.innerHTML = '<div class="blank"><h2>불러오는 중…</h2></div>';
      return;
    }
    const s = oxSummary(a, rows, cur.reveal);
    const cO = caption(a, 'O');
    const cX = caption(a, 'X');
    // 공개 전: 문항 · 막대 · O/X 설명. 공개 뒤: 문항 · 막대(정답 테두리) · 정답 표시와 해설
    const qs = s.questions.map((x, i) =>
      `<div class="oxq" data-q="${i + 1}">` +
      `<div class="qt"><span class="n">${i + 1}</span><span class="qx">${esc(x.q)}</span></div>` +
      bar(x) +
      (x.right
        ? `<div class="cm"><span class="ans">정답 ${esc(x.right)}${x.label ? ` · ${esc(x.label)}` : ''}</span>` +
          `${x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</div>`
        : '<div class="lg">' +
          `<span>O${cO ? ` · ${esc(cO)}` : ''} <b>${x.O}명</b></span>` +
          `<span>X${cX ? ` · ${esc(cX)}` : ''} <b>${x.X}명</b></span></div>`) +
      '</div>').join('');
    root.innerHTML =
      `<div class="ox${s.revealed ? ' rv' : ''}">` +
      `<div class="ox-qs" style="--q:${Math.max(1, s.questions.length)}">${qs}</div>` +
      (s.revealed ? `<aside class="ox-side">${sideHTML(s)}</aside>` : '') +
      '</div>';
  }

  draw();

  return {
    update(next) {
      cur = next;
      draw();
    },
    destroy() {}
  };
}

export default {
  type: 'ox',
  typeLabel: 'O·X',
  summary,
  participant,
  adminCard,
  adminResponse,
  adminCell,
  board
};
