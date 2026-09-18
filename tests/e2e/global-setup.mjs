/** E2E 시작 전에 지난 실행이 남긴 시험 연수를 치운다(각 테스트는 자기 연수를 만들고 지운다) */
import { sweepStaleTestEvents } from './helpers.mjs';

export default async function globalSetup() {
  await sweepStaleTestEvents();
}
