/**
 * 브라우저 E2E (코드로 작성한 Playwright 테스트)
 *   npm run test:e2e
 * 저장소 루트를 작은 정적 서버로 띄우고, 실제 DB에 시험 연수를 등록해서 돌린 뒤 지운다.
 */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.LW_E2E_PORT || 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.mjs',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 20_000
  }
});
