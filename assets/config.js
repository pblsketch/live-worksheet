/**
 * 접속 정보 (브라우저용)
 * publishable key는 브라우저에 공개되는 키다. 이 키로는 공개 표 읽기와 서버 함수 호출만 된다.
 * 쓰기는 모두 서버 함수가 검사한 뒤에 한다(supabase/README.md).
 * 관리 API용 개인 토큰은 절대 여기에 두지 않는다(.env.local 에만 둔다).
 */
export const CONFIG = {
  supabaseUrl: "https://agxnzngjhiysqipqwsug.supabase.co",
  supabaseKey: "sb_publishable_a_z11noDLFLpNXRGtmOyDg_q9MQMLp2",
  /** 실시간 연결이 안 될 때 다시 불러오는 간격(밀리초) */
  pollMs: 20000
};
