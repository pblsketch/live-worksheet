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

/* ───────────── 현황판 ───────────── */

/** 새 문장을 노란 테두리로 보이는 시간(밀리초) */
export const FRESH_MS = 12000;

/** 현황판 카드 목록(응답 순서 = 최근 제출 순). key 는 다시 내면 바뀐다 */
export function sentenceCards(activity, rows) {
  return (rows || []).map((r) => {
    const p = (r && r.payload) || {};
    return {
      key: `${r.participant_id}|${r.updated_at || r.created_at || ''}`,
      pid: r.participant_id,
      template: templateOf(activity, p.template),
      blank: typeof p.blank === 'string' ? p.blank : ''
    };
  });
}

/**
 * 새로 들어온 카드 고르기. seen(Map: key → 처음 본 시각)을 고친다.
 * 처음 그릴 때(first) 이미 있던 카드는 새것으로 치지 않는다. 처음 본 뒤 ttl 동안 새것이다.
 * @returns {Set<string>} 지금 강조할 key
 */
export function freshKeys(seen, keys, now, { first = false, ttl = FRESH_MS } = {}) {
  for (const k of keys) if (!seen.has(k)) seen.set(k, first ? 0 : now);
  const out = new Set();
  for (const k of keys) {
    const t = seen.get(k);
    if (t > 0 && now - t < ttl) out.add(k);
  }
  return out;
}

/** 문장 카드 3열. 새 문장은 노란 테두리로 들어오고, 카드마다 틀 라벨과 이름을 붙인다 */
function board(ctx) {
  const a = ctx.activity;
  const tpls = a.templates || [];
  const root = ctx.root;
  const keep = ctx.keep || {};
  if (!keep.seen) keep.seen = new Map();
  let cur = ctx;
  let timer = null;
  let raf = 0;

  const nameOf = (pid) => (cur.names && cur.names.get(pid)) || '…';

  function draw() {
    clearTimeout(timer);
    const rows = cur.rows;
    if (!rows) {
      root.innerHTML = '<div class="blank"><h2>불러오는 중…</h2></div>';
      return;
    }
    const cards = sentenceCards(a, rows);
    const now = Date.now();
    const fresh = freshKeys(keep.seen, cards.map((c) => c.key), now, { first: !keep.ready });
    keep.ready = true;

    if (!cards.length) {
      root.innerHTML = '<div class="blank"><h2>아직 문장이 없습니다</h2>' +
        `<p>${cur.isOpen ? '문장이 들어오면 여기에 한 장씩 쌓입니다.' : '관리자 화면에서 이 활동을 열어 주세요.'}</p></div>`;
      return;
    }
    const cols = [[], [], []];
    cards.forEach((c, i) => {
      const lb = c.template && c.template.label ? `<span class="tag">${rich(c.template.label)}</span>` : '';
      cols[i % 3].push(
        `<div class="sncard${fresh.has(c.key) ? ' fresh' : ''}" data-pid="${esc(c.pid)}">` +
        `<div class="sh">${lb}<span class="nm">${esc(nameOf(c.pid))}</span></div>` +
        `<div class="tx">${sentenceHTML(c.template, c.blank)}</div></div>`);
    });
    const counts = tpls.length > 1
      ? '<div class="sn-top">' + tpls.map((t) => {
        const n = cards.filter((c) => c.template && c.template.id === t.id).length;
        return `<span class="sn-t"><span class="tag">${rich(t.label || t.id)}</span><b>${n}</b></span>`;
      }).join('') + '<span class="sn-more" hidden></span></div>'
      : '<div class="sn-top solo"><span class="sn-more" hidden></span></div>';
    root.innerHTML = `<div class="sn">${counts}<div class="sn-cols">` +
      cols.map((c) => `<div class="sn-col">${c.join('')}</div>`).join('') + '</div></div>';

    // 칸에 다 들어가지 않는 오래된 카드는 반쯤 잘려 보이지 않게 숨기고 수만 알린다
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      let hidden = 0;
      root.querySelectorAll('.sn-col').forEach((col) => {
        const limit = col.clientHeight + 1;
        col.querySelectorAll('.sncard').forEach((card) => {
          if (card.offsetTop + card.offsetHeight > limit) { card.classList.add('cut'); hidden++; }
        });
      });
      const more = root.querySelector('.sn-more');
      if (more) {
        more.hidden = hidden === 0;
        more.textContent = hidden ? `화면 밖 ${hidden}개` : '';
      }
    });

    if (fresh.size) timer = setTimeout(draw, FRESH_MS + 200); // 강조가 저절로 걷히게 한 번 더 그린다
  }

  draw();

  return {
    update(next) {
      cur = next;
      draw();
    },
    destroy() {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    }
  };
}

export default {
  type: 'sentence',
  typeLabel: '문장',
  summary,
  participant,
  adminCard,
  adminResponse,
  adminCell: () => '✓',
  board
};
