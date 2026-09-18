/**
 * 활동 부품: sentence (문장 틀을 고르고 빈칸을 채운다)
 *
 * 공개 설정: templates[{ id, label, before, after }] — 틀이 둘 이상이면 참가자가 하나를 고른다
 * payload: { template: '<틀 id>', blank: '2~60자' }
 */
import { esc, rich, len, oneLine } from '../core.js';

const MIN = 2;
const MAX = 60;

export function templateOf(activity, id) {
  return (activity.templates || []).find((t) => t.id === id) || null;
}

/** 틀 + 빈칸 → 문장 HTML (빈칸은 <b>로 감싼다. 참가자 글은 이스케이프) */
export function sentenceHTML(tpl, blank) {
  if (!tpl) return esc(blank);
  return `${tpl.before ? `${rich(tpl.before)} ` : ''}<b>${esc(blank)}</b>${tpl.after ? ` ${rich(tpl.after)}` : ''}`;
}

/* ───────────── 참가자 화면 ───────────── */

function participant(ctx) {
  const a = ctx.activity;
  const tpls = a.templates || [];
  const multi = tpls.length > 1;
  const root = ctx.root;
  const draft = ctx.draft;
  let cur = ctx;

  const saved = draft.load();
  const base = saved || ctx.mine || {};
  const form = {
    template: templateOf(a, base.template) ? base.template : (multi ? null : (tpls[0] && tpls[0].id)),
    blank: typeof base.blank === 'string' ? base.blank : ''
  };
  let mode = ctx.mine && (!saved || !ctx.isOpen) ? 'result' : 'form';

  const save = () => draft.save(form);

  function previewHTML() {
    const t = templateOf(a, form.template);
    if (!t) return '<div class="fill muted-fill">틀을 고르면 여기에 문장이 나옵니다.</div>';
    const b = oneLine(form.blank);
    return '<div class="fill">' +
      (t.before ? `${rich(t.before)} ` : '') +
      `<span class="blank${b ? '' : ' empty'}">${esc(b)}</span>` +
      (t.after ? ` ${rich(t.after)}` : '') + '</div>';
  }

  function drawForm() {
    root.innerHTML =
      (a.description ? `<div class="hint lead">${rich(a.description)}</div>` : '') +
      (multi
        ? '<div class="step"><span>1</span>문장 틀 고르기</div>' +
          '<div class="tpls" id="tpls">' +
          tpls.map((t) =>
            `<label class="tpl${form.template === t.id ? ' on' : ''}">` +
            `<input type="radio" name="tpl" value="${esc(t.id)}"${form.template === t.id ? ' checked' : ''}>` +
            `<span class="tpl-lb">${rich(t.label || '')}</span>` +
            `<span class="tpl-tx">${t.before ? rich(t.before) : ''} <i>____</i> ${t.after ? rich(t.after) : ''}</span>` +
            '</label>').join('') +
          '</div>' +
          '<div class="step"><span>2</span>빈칸 채우기</div>'
        : '') +
      `<div id="pv">${previewHTML()}</div>` +
      '<div class="field">' +
      `<textarea id="blank" rows="2" maxlength="${MAX}" placeholder="빈칸에 들어갈 말"${form.template ? '' : ' disabled'}>${esc(form.blank)}</textarea>` +
      `<div class="hint">앞뒤 말과 이어지게 적어 주세요. ${MIN}~${MAX}자</div>` +
      '</div>' +
      `<div class="sticky-b"><button class="btn" data-act="submit">${cur.mine ? '고쳐서 다시 내기' : '제출하기'}</button></div>`;

    const ta = root.querySelector('#blank');
    ta.addEventListener('input', () => {
      form.blank = ta.value;
      save();
      root.querySelector('#pv').innerHTML = previewHTML();
    });
    const tp = root.querySelector('#tpls');
    if (tp) {
      tp.addEventListener('change', (e) => {
        if (e.target.name !== 'tpl') return;
        form.template = e.target.value;
        tp.querySelectorAll('.tpl').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
        ta.disabled = false;
        save();
        root.querySelector('#pv').innerHTML = previewHTML();
        ta.focus();
      });
    }
    root.querySelector('[data-act="submit"]').onclick = submit;
  }

  async function submit(e) {
    const btn = e.currentTarget;
    if (!templateOf(a, form.template)) { cur.toast('문장 틀을 골라 주세요.'); return; }
    const b = oneLine(form.blank);
    if (!b) { cur.toast('빈칸을 채워 주세요.'); return; }
    if (len(b) < MIN) { cur.toast('조금만 더 구체적으로 적어 주세요.'); return; }
    if (len(b) > MAX) { cur.toast(`${MAX}자 이내로 적어 주세요.`); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '제출하는 중…';
    const ok = await cur.submit({ template: form.template, blank: b });
    if (!ok) { btn.disabled = false; btn.textContent = label; return; }
    draft.clear();
    cur.toast('제출했습니다.');
    mode = 'result';
    window.scrollTo(0, 0);
    drawResult();
  }

  function drawResult() {
    cur.need(['responses', 'participants']);
    const rows = cur.rows || [];
    const names = cur.names;
    const list = rows.slice(0, 200).map((r) => {
      const p = r.payload || {};
      const t = templateOf(a, p.template);
      const who = (names && names.get(r.participant_id)) || (r.participant_id === cur.me.id ? cur.me.name : '…');
      return `<div class="stream-item${r.participant_id === cur.me.id ? ' mine' : ''}">` +
        `<div class="nm">${esc(who)}${multi && t ? `<span class="tag">${rich(t.label || '')}</span>` : ''}</div>` +
        `<div class="tx">${sentenceHTML(t, p.blank)}</div></div>`;
    }).join('');

    root.innerHTML =
      '<div class="card blue center">' +
      `<div class="big-num">${rows.length}<span>개</span></div>` +
      `<div class="hint">문장 · ${cur.liveBadge}</div>` +
      '</div>' +
      (cur.isOpen ? '<button class="btn line" data-act="edit">고쳐서 다시 내기</button>' : '') +
      `<div class="stream">${list || '<div class="empty">아직 낸 사람이 없습니다.</div>'}</div>` +
      '<div class="sticky-b"><button class="btn" data-act="menu">메뉴로</button></div>';

    const edit = root.querySelector('[data-act="edit"]');
    if (edit) {
      edit.onclick = () => {
        const d = draft.load() || cur.mine || {};
        if (templateOf(a, d.template)) form.template = d.template;
        form.blank = typeof d.blank === 'string' ? d.blank : '';
        mode = 'form';
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
  const n = (activity.templates || []).length;
  return n > 1 ? `문장 틀 ${n}개` : '빈칸 한 곳';
}

function adminCard(ctx) {
  const a = ctx.activity;
  const tpls = a.templates || [];
  const rows = ctx.rows || [];
  if (tpls.length < 2 || !rows.length) return '';
  return tpls.map((t) => {
    const n = rows.filter((r) => r.payload && r.payload.template === t.id).length;
    return `${rich(t.label || t.id)} <b>${n}</b>`;
  }).join(' · ');
}

function adminResponse(ctx, row) {
  const a = ctx.activity;
  const p = row.payload || {};
  const t = templateOf(a, p.template);
  return `<div class="ptx">${(a.templates || []).length > 1 && t ? `<span class="tag">${rich(t.label || '')}</span> ` : ''}` +
    `${sentenceHTML(t, p.blank)}</div>`;
}

export default {
  type: 'sentence',
  typeLabel: '문장',
  summary,
  participant,
  adminCard,
  adminResponse,
  adminCell: () => '✓',
  /** 현황판 화면(T4가 채운다) */
  board: null
};
