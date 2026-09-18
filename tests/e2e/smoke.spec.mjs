/**
 * 스모크: 휴대폰 폭 참가자가 들어와 OX 대기 화면에 있다가,
 * 관리자(PC 폭, 다른 브라우저 컨텍스트)가 OX를 열면 새로고침 없이 문항 화면으로 바뀌고,
 * 답을 내면 모두의 O/X 분포를 본다. 시험 연수는 실패해도 afterAll 에서 지운다.
 */
import { test, expect, devices } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers.mjs';

const { defaultBrowserType: _ignored, ...PHONE } = devices['Pixel 7'];
const NAME = '시험 참가자';

let EV = null;

test.beforeAll(async () => {
  EV = await createTestEvent('e2e');
});

test.afterAll(async () => {
  if (EV) await deleteTestEvent(EV.id);
});

test('참가자 입장 → OX 대기 → 관리자가 열면 새로고침 없이 전환 → 제출 → 분포', async ({ browser }) => {
  const phone = await browser.newContext({ ...PHONE, locale: 'ko-KR' });
  const desk = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'ko-KR' });
  try {
    /* ── 참가자(휴대폰 폭): 입장 → 메뉴 → OX 대기 ── */
    const p = await phone.newPage();
    let loads = 0;
    p.on('load', () => { loads++; });
    await p.goto(`./?e=${EV.id}`);
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(EV.title);
    await p.getByLabel('이름 또는 별칭').fill(NAME);
    await p.getByRole('button', { name: '들어가기' }).click();

    const oxItem = p.locator('[data-open="ox1"]');
    await expect(oxItem).toContainText('대기');
    await expect(p.locator('[data-open="practice"]')).toContainText('대기');
    await oxItem.click();
    await expect(p.getByRole('heading', { name: '아직 열리지 않았습니다' })).toBeVisible();
    // 새로고침 없이 바뀌는지 보려고 페이지에 표시를 남긴다
    await p.evaluate(() => { window.__lwSamePage = true; });
    // 실시간 연결이 붙었는지(웹소켓)
    await expect(p.locator('body')).toHaveAttribute('data-live', 'live', { timeout: 20_000 });

    /* ── 관리자(PC 폭): 이름 칸에 암호 → 대시보드 → OX 열기 ── */
    const a = await desk.newPage();
    await a.goto(`./?e=${EV.id}`);
    await a.getByLabel('이름 또는 별칭').fill(EV.passcode);
    await a.getByRole('button', { name: '들어가기' }).click();
    await expect(a.locator('body')).toHaveAttribute('data-screen', 'admin');
    const openOx = a.getByRole('switch', { name: '열기: 사람일까, AI일까?' });
    await expect(openOx).toHaveAttribute('aria-checked', 'false');
    await openOx.click();
    await expect(a.getByRole('switch', { name: '열기: 사람일까, AI일까?' })).toHaveAttribute('aria-checked', 'true');
    await expect(a.locator('[data-card="ox1"] .gstate')).toHaveText('열림');

    /* ── 참가자 화면이 새로고침 없이 문항으로 바뀐다 ── */
    await expect(p.locator('.qcount')).toHaveText('1 / 3', { timeout: 15_000 });
    expect(await p.evaluate(() => window.__lwSamePage)).toBe(true);
    expect(loads).toBe(1);

    /* ── 한 문항씩 고르고, 뒤로 가기, 제출 ── */
    await p.locator('[data-pick="O"]').click();
    await expect(p.locator('.qcount')).toHaveText('2 / 3');
    await p.getByRole('button', { name: '앞 문항으로' }).click();
    await expect(p.locator('.qcount')).toHaveText('1 / 3');
    await expect(p.locator('[data-pick="O"]')).toHaveClass(/sel/);
    await p.locator('[data-pick="O"]').click();
    await p.locator('[data-pick="X"]').click();
    await p.locator('[data-pick="O"]').click();
    await expect(p.locator('.qcount')).toHaveText('고른 답');
    await p.getByRole('button', { name: '제출하기' }).click();

    /* ── 모두의 O/X 분포(정답·점수는 공개 전이라 없다) ── */
    await expect(p.locator('.big-num')).toHaveText('1명');
    const bars = p.locator('.bar-item');
    await expect(bars).toHaveCount(3);
    await expect(bars.nth(0).locator('.bar')).toHaveText('O 100%');
    await expect(bars.nth(1).locator('.bar')).toHaveText('X 100%');
    await expect(bars.nth(2).locator('.bar')).toHaveText('O 100%');
    await expect(p.getByText('정답은 진행자가 공개하면 이 화면에 나옵니다.')).toBeVisible();
    await expect(p.locator('.badge')).toHaveCount(0);
    expect(loads).toBe(1);

    /* ── 관리자 화면에도 바로 들어온다 ── */
    await expect(a.locator('[data-card="ox1"] .gnum')).toHaveText('1 / 1명');
    await expect(a.locator('#admPeople')).toContainText(NAME);
    await expect(a.locator('#admPeekTabs [data-peek="ox1"]')).toContainText('1');
  } finally {
    await phone.close();
    await desk.close();
  }
});
