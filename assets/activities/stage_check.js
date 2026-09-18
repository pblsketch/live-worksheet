/**
 * 활동 부품: stage_check (학습목표를 고르고, 항목마다 외주화 위험·AI 허용 단계·장치 메모를 적는다)
 *
 * 공개 설정: items[{id,name,desc?}], objectives[{id,group?,text,code?}], allowCustom?,
 *           criteria?{question,rules[],common}, example?{label,risk,stage,memo}, stages?[5개 {name,color}]
 * payload: { objective: { id: '<보기 id>'|'custom', text? }, items: { '<항목 id>': { risk, stage, memo } } }
 * 설정 문구는 <b>만 살려 그린다(rich). 참가자가 적은 글은 모두 이스케이프한다(esc).
 */
import { esc, rich, len, oneLine } from '../core.js';

export const DEFAULT_STAGES = [
  { name: '혼자 힘으로', color: '#7d9b5a' },
  { name: '생각 틔우기', color: '#5f814f' },
  { name: '초안 거들기', color: '#4a7a76' },
  { name: '함께 다듬기', color: '#35507c' },
  { name: '같이 만들기', color: '#2a4066' }
];
export const RISKS = ['상', '중', '하'];
const MEMO_MAX = 80;
const CUSTOM_MIN = 2;
const CUSTOM_MAX = 80;

/** 허용 단계 다섯 개 [{ n, name, color }] (설정에 stages가 있으면 그것을 쓴다) */
export function stagesOf(activity) {
  const s = Array.isArray(activity.stages) && activity.stages.length === 5 ? activity.stages : null;
  return DEFAULT_STAGES.map((d, i) => ({
    n: i + 1,
    name: (s && s[i] && s[i].name) || d.name,
    color: (s && s[i] && /^#[0-9a-fA-F]{6}$/.test(s[i].color || '') && s[i].color) || d.color
  }));
}

/** 응답의 학습목표 → { group, text, custom } */
export function objectiveOf(activity, objective) {
  if (!objective) return null;
  if (objective.id === 'custom') return { group: '직접 적은 목표', text: objective.text || '', custom: true };
  const o = (activity.objectives || []).find((x) => x.id === objective.id);
  return o ? { group: o.group || '', text: o.text, code: o.code || '', custom: false } : null;
}

/** 항목 하나가 채워졌는가 */
export function filled(v) {
  return !!(v && (v.risk || v.stage || oneLine(v.memo)));
}

const clone = (x) => JSON.parse(JSON.stringify(x || {}));

/* ───────────── 참가자 화면 ───────────── */

function participant(ctx) {
  const a = ctx.activity;
  const items = a.items || [];
  const objectives = a.objectives || [];
  const stages = stagesOf(a);
  const root = ctx.root;
  const draft = ctx.draft;
  let cur = ctx;

  const saved = draft.load();
  let form = normalize(saved || (ctx.mine ? clone(ctx.mine) : {}));
  // 낸 적이 있으면 제출 화면부터 보인다. 고쳐 쓰던 내용이 기기에 있고 활동이 열려 있으면 입력 화면으로 간다.
  let mode = ctx.mine && (!saved || !ctx.isOpen) ? 'result' : 'form';

  function normalize(f) {
    const out = { objective: null, items: {} };
    if (f && f.objective && typeof f.objective.id === 'string') {
      out.objective = { id: f.objective.id, text: typeof f.objective.text === 'string' ? f.objective.text : '' };
      if (out.objective.id === 'custom' && a.allowCustom !== true) out.objective = null;
      if (out.objective && out.objective.id !== 'custom' && !objectives.some((o) => o.id === out.objective.id)) out.objective = null;
    }
    const src = (f && f.items) || {};
    for (const it of items) {
      const v = src[it.id] || {};
      out.items[it.id] = {
        risk: RISKS.includes(v.risk) ? v.risk : '',
        stage: [1, 2, 3, 4, 5].includes(v.stage) ? v.stage : null,
        memo: typeof v.memo === 'string' ? v.memo : ''
      };
    }
    return out;
  }

  const save = () => draft.save(form);

  /* ─── 입력 화면 ─── */

  function objectiveHTML() {
    const chosen = form.objective ? form.objective.id : '';
    return objectives.map((o) =>
      `<label class="obj${chosen === o.id ? ' on' : ''}">` +
      `<input type="radio" name="obj" value="${esc(o.id)}"${chosen === o.id ? ' checked' : ''}>` +
      '<span class="obj-body">' +
      (o.group ? `<span class="obj-grp">${rich(o.group)}</span>` : '') +
      `<span class="obj-txt">${rich(o.text)}</span>` +
      (o.code ? `<span class="obj-code">${esc(o.code)}</span>` : '') +
      '</span></label>').join('') +
      (a.allowCustom === true
        ? `<label class="obj custom${chosen === 'custom' ? ' on' : ''}">` +
          `<input type="radio" name="obj" value="custom"${chosen === 'custom' ? ' checked' : ''}>` +
          '<span class="obj-body"><span class="obj-txt">직접 적기</span></span></label>' +
          `<input type="text" class="obj-custom" maxlength="${CUSTOM_MAX}" placeholder="학습목표를 한 줄로 적어 주세요 (${CUSTOM_MIN}~${CUSTOM_MAX}자)"` +
          ` value="${esc(chosen === 'custom' ? form.objective.text : '')}"${chosen === 'custom' ? '' : ' hidden'}>`
        : '');
  }

  function criteriaHTML() {
    const c = a.criteria;
    if (!c || (!c.question && !(c.rules || []).length && !c.common)) return '';
    return '<details class="crit" open><summary>판단 기준</summary>' +
      (c.question ? `<div class="q">${rich(c.question)}</div>` : '') +
      ((c.rules || []).length ? `<ol>${c.rules.map((r) => `<li>${rich(r)}</li>`).join('')}</ol>` : '') +
      (c.common ? `<div class="rule">${rich(c.common)}</div>` : '') +
      '</details>';
  }

  function exampleHTML() {
    const e = a.example;
    if (!e) return '';
    const st = e.stage ? stages[e.stage - 1] : null;
    const parts = [];
    if (e.risk) parts.push(`외주화 위험 <b>${esc(e.risk)}</b>`);
    if (st) parts.push(`허용 단계 <b>${st.n} ${esc(st.name)}</b>`);
    if (e.memo) parts.push(`장치 <b>${rich(e.memo)}</b>`);
    return '<div class="ex"><div class="lb">기입 예시</div>' +
      `<div class="rowline">${e.label ? `${rich(e.label)} → ` : ''}${parts.join(' · ')}</div></div>`;
  }

  function itemHTML(it, k) {
    const v = form.items[it.id];
    const ph = a.example && a.example.memo ? `예) ${a.example.memo}` : '한 줄로 적어 주세요';
    return `<div class="item" data-item="${esc(it.id)}">` +
      '<div class="item-h">' +
      `<div class="no">${k + 1}</div>` +
      `<div class="nm">${rich(it.name)}${it.desc ? `<div class="ds">${rich(it.desc)}</div>` : ''}</div>` +
      '</div>' +
      '<div class="sub-label">외주화 위험 · 지시문을 그대로 AI에 넣으면 3분 안에 나오는가?</div>' +
      '<div class="seg risk">' +
      RISKS.map((r) => `<button type="button" data-risk="${r}" class="${v.risk === r ? 'on' : ''}">${r}</button>`).join('') +
      '</div>' +
      '<div class="sub-label">AI 허용 단계 · 나라면 몇 단계로 열까?</div>' +
      '<div class="seg stage">' +
      stages.map((s) =>
        `<button type="button" data-stage="${s.n}" class="${v.stage === s.n ? 'on' : ''}" style="--c:${s.color}">` +
        `<b>${s.n}</b><small>${esc(s.name)}</small></button>`).join('') +
      '</div>' +
      '<div class="sub-label">배움을 지키는 장치 · 학생이 직접 하게 만들 방법 한 줄</div>' +
      `<input type="text" data-memo maxlength="${MEMO_MAX}" placeholder="${esc(ph)}" value="${esc(v.memo)}">` +
      '</div>';
  }

  function itemsHTML() {
    if (!form.objective) {
      return '<div class="locked-items">학습목표를 고르면 항목 카드가 열립니다.</div>';
    }
    return items.map(itemHTML).join('');
  }

  function drawForm() {
    root.innerHTML =
      (a.description ? `<div class="hint lead">${rich(a.description)}</div>` : '') +
      '<div class="step"><span>1</span>학습목표 고르기</div>' +
      '<div class="hint step-hint">이 과제의 학습목표를 하나 고르세요.</div>' +
      `<div class="objs" id="objs">${objectiveHTML()}</div>` +
      criteriaHTML() +
      exampleHTML() +
      '<div class="step"><span>2</span>항목별 판단</div>' +
      '<div class="hint step-hint">항목마다 세 칸을 채웁니다. 막히면 건너뛰어도 됩니다. ' +
      '정답이 있는 활동이 아닙니다.</div>' +
      `<div id="items">${itemsHTML()}</div>` +
      '<div class="save-note">적은 내용은 이 기기에 저장됩니다.</div>' +
      (a.criteria ? '<button type="button" class="link-btn" data-act="crit">판단 기준 다시 보기</button>' : '') +
      `<div class="sticky-b"><button class="btn" data-act="submit">${cur.mine ? '고쳐서 다시 내기' : '제출하기'}</button></div>`;
    bindForm();
  }

  function bindForm() {
    const objs = root.querySelector('#objs');
    objs.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name !== 'obj') return;
      const wasLocked = !form.objective;
      const text = form.objective && form.objective.id === 'custom' ? form.objective.text : '';
      form.objective = { id: t.value, text: t.value === 'custom' ? text : '' };
      objs.querySelectorAll('.obj').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
      const ci = objs.querySelector('.obj-custom');
      if (ci) {
        ci.hidden = t.value !== 'custom';
        if (t.value === 'custom') ci.focus();
      }
      save();
      if (wasLocked) {
        root.querySelector('#items').innerHTML = itemsHTML();
      }
    });
    const ci = objs.querySelector('.obj-custom');
    if (ci) {
      ci.addEventListener('input', () => {
        if (form.objective && form.objective.id === 'custom') { form.objective.text = ci.value; save(); }
      });
    }

    const box = root.querySelector('#items');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const card = b.closest('[data-item]');
      if (!card) return;
      const v = form.items[card.dataset.item];
      if (b.dataset.risk) {
        v.risk = v.risk === b.dataset.risk ? '' : b.dataset.risk; // 다시 누르면 지운다
        card.querySelectorAll('[data-risk]').forEach((x) => x.classList.toggle('on', x.dataset.risk === v.risk));
      } else if (b.dataset.stage) {
        const n = Number(b.dataset.stage);
        v.stage = v.stage === n ? null : n;
        card.querySelectorAll('[data-stage]').forEach((x) => x.classList.toggle('on', Number(x.dataset.stage) === v.stage));
      } else return;
      save();
    });
    box.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.matches('[data-memo]')) return;
      const card = t.closest('[data-item]');
      form.items[card.dataset.item].memo = t.value;
      save();
    });

    const crit = root.querySelector('[data-act="crit"]');
    if (crit) {
      crit.onclick = () => {
        const d = root.querySelector('details.crit');
        if (!d) return;
        d.open = true;
        d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
    root.querySelector('[data-act="submit"]').onclick = submit;
  }

  async function submit(e) {
    const btn = e.currentTarget;
    const o = form.objective;
    if (!o) {
      cur.toast('학습목표를 먼저 골라 주세요.');
      root.querySelector('#objs').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    let objective = { id: o.id };
    if (o.id === 'custom') {
      const t = oneLine(o.text);
      if (len(t) < CUSTOM_MIN || len(t) > CUSTOM_MAX) {
        cur.toast(`직접 적은 학습목표는 ${CUSTOM_MIN}~${CUSTOM_MAX}자로 적어 주세요.`);
        return;
      }
      objective = { id: 'custom', text: t };
    }
    const out = {};
    for (const it of items) {
      const v = form.items[it.id];
      if (!filled(v)) continue;
      const memo = oneLine(v.memo);
      if (len(memo) > MEMO_MAX) { cur.toast(`메모는 ${MEMO_MAX}자 이내로 적어 주세요.`); return; }
      out[it.id] = { risk: v.risk || '', stage: v.stage || null, memo };
    }
    if (!Object.keys(out).length) { cur.toast('적어도 한 항목은 채워 주세요.'); return; }

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '제출하는 중…';
    const ok = await cur.submit({ objective, items: out });
    if (!ok) { btn.disabled = false; btn.textContent = label; return; }
    draft.clear();
    cur.toast('제출했습니다.');
    mode = 'result';
    window.scrollTo(0, 0);
    drawResult();
  }

  /* ─── 제출 뒤 화면 ─── */

  function rowsHTML(payload) {
    const its = (payload && payload.items) || {};
    const lines = items.filter((it) => filled(its[it.id])).map((it) => {
      const v = its[it.id];
      const st = v.stage ? stages[v.stage - 1] : null;
      return '<div class="pline">' +
        `<span class="pact">${rich(it.name)}</span>` +
        `<span class="prisk r${esc(v.risk || '')}">${esc(v.risk || '·')}</span>` +
        (st ? `<span class="pstage" style="--c:${st.color}">${st.n}</span>` : '<span class="pstage none">·</span>') +
        (oneLine(v.memo) ? `<span class="pmemo">${esc(v.memo)}</span>` : '') +
        '</div>';
    });
    return lines.join('');
  }

  function objectiveLine(payload) {
    const ob = objectiveOf(a, payload && payload.objective);
    if (!ob) return '';
    return `<div class="pobj">${ob.group ? `<span class="obj-grp">${ob.custom ? esc(ob.group) : rich(ob.group)}</span>` : ''}` +
      `<span>${ob.custom ? esc(ob.text) : rich(ob.text)}</span></div>`;
  }

  function drawResult() {
    cur.need(['responses', 'participants']);
    const mine = cur.mine;
    const rows = (cur.rows || []).slice(0, 80);
    const names = cur.names;
    const count = (cur.rows || []).length;
    const k = mine ? Object.keys(mine.items || {}).filter((id) => filled(mine.items[id])).length : 0;

    const feed = rows.map((r) =>
      `<div class="detail${r.participant_id === cur.me.id ? ' mine' : ''}">` +
      `<div class="hd"><div class="nm">${esc((names && names.get(r.participant_id)) || (r.participant_id === cur.me.id ? cur.me.name : '…'))}</div></div>` +
      objectiveLine(r.payload) +
      rowsHTML(r.payload) +
      '</div>').join('');

    root.innerHTML =
      '<div class="card blue center">' +
      '<div class="done-mark">✓</div>' +
      '<div class="serif big-t">제출했습니다</div>' +
      `<div class="hint">${k}개 항목을 채웠습니다. 다시 내면 앞의 제출을 덮어씁니다.</div>` +
      '</div>' +
      (mine ? `<div class="card flat mine-box">${objectiveLine(mine)}${rowsHTML(mine)}</div>` : '') +
      (cur.isOpen ? '<button class="btn line" data-act="edit">고쳐서 다시 내기</button>' : '<div class="hint center">진행자가 활동을 닫아 더 고칠 수 없습니다.</div>') +
      `<div class="section-t">모두의 판단 · ${count}명 <span class="live-inline">${cur.liveBadge}</span></div>` +
      (feed || '<div class="empty">아직 낸 사람이 없습니다.</div>') +
      '<div class="sticky-b"><button class="btn" data-act="menu">메뉴로</button></div>';

    const edit = root.querySelector('[data-act="edit"]');
    if (edit) {
      edit.onclick = () => {
        form = normalize(draft.load() || clone(cur.mine));
        mode = 'form';
        window.scrollTo(0, 0);
        drawForm();
      };
    }
    root.querySelector('[data-act="menu"]').onclick = () => cur.goMenu();
  }

  if (mode === 'result') drawResult();
  else drawForm();

  return {
    update(next) {
      const wasOpen = cur.isOpen;
      cur = next;
      if (mode === 'result') { drawResult(); return; }
      // 고쳐 쓰던 중에 활동이 닫히면 제출 화면으로 돌아간다(적던 내용은 기기에 남는다)
      if (wasOpen && !next.isOpen && next.mine) {
        mode = 'result';
        next.toast('진행자가 활동을 닫았습니다. 적던 내용은 이 기기에 남아 있습니다.');
        drawResult();
      }
    },
    destroy() {}
  };
}

/* ───────────── 관리자 카드·응답 ───────────── */

function summary(activity) {
  const n = (activity.items || []).length;
  const o = (activity.objectives || []).length;
  return `항목 ${n}개 · 학습목표 보기 ${o}개${activity.allowCustom === true ? ' + 직접 적기' : ''}`;
}

function adminCard(ctx) {
  const rows = ctx.rows || [];
  if (!rows.length) return '';
  const custom = rows.filter((r) => r.payload && r.payload.objective && r.payload.objective.id === 'custom').length;
  let memos = 0;
  for (const r of rows) {
    for (const v of Object.values((r.payload && r.payload.items) || {})) if (oneLine(v && v.memo)) memos++;
  }
  return `메모 ${memos}개${custom ? ` · 직접 적은 목표 ${custom}명` : ''}`;
}

function adminResponse(ctx, row) {
  const a = ctx.activity;
  const stages = stagesOf(a);
  const p = row.payload || {};
  const ob = objectiveOf(a, p.objective);
  const its = p.items || {};
  return (ob ? `<div class="pobj">${ob.group ? `<span class="obj-grp">${ob.custom ? esc(ob.group) : rich(ob.group)}</span>` : ''}` +
      `<span>${ob.custom ? esc(ob.text) : rich(ob.text)}</span></div>` : '') +
    (a.items || []).filter((it) => filled(its[it.id])).map((it) => {
      const v = its[it.id];
      const st = v.stage ? stages[v.stage - 1] : null;
      return '<div class="pline">' +
        `<span class="pno">${(a.items || []).indexOf(it) + 1}</span>` +
        `<span class="pact">${rich(it.name)}</span>` +
        `<span class="prisk r${esc(v.risk || '')}">${esc(v.risk || '·')}</span>` +
        (st ? `<span class="pstage" style="--c:${st.color}">${st.n}</span>` : '<span class="pstage none">·</span>') +
        (oneLine(v.memo) ? `<span class="pmemo">${esc(v.memo)}</span>` : '') +
        '</div>';
    }).join('');
}

export default {
  type: 'stage_check',
  typeLabel: '단계 판단',
  summary,
  participant,
  adminCard,
  adminResponse,
  adminCell: () => '✓',
  /** 현황판 화면(T4가 채운다) */
  board: null
};
