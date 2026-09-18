# DB (Supabase)

- 프로젝트: `live-worksheet` (ref는 `.env.local`의 `SUPABASE_PROJECT_REF`). 이 앱이 만드는 표·함수·예약 작업은 모두 `lw_` 접두어다.
- 마이그레이션: `supabase/migrations/*.sql`을 이름 순서로 적용한다. 여러 번 실행해도 안전하다(데이터를 지우지 않는다).

```
npm run migrate      # = node tools/apply-migrations.mjs
npm run snapshot     # public 객체 목록 + baseline-snapshot.json 비교 (lw_ 아닌 추가·삭제가 있으면 실패)
npm run test:db      # 서버 함수 검사 (시험 연수 t-… 를 만들고 끝나면 지운다)
```

## 표

| 표 | 브라우저(publishable key) | 내용 |
|---|---|---|
| `lw_events` | 읽기 | `id`, `title`, `date`, `listed`, `config`(공개 설정: `description`·`activities`·`materials`), `created_at`, `updated_at` |
| `lw_event_secrets` | **권한 없음** | `event_id`, `admin_hash`(bcrypt), `reveal`(활동 id → 공개 전용 내용) |
| `lw_participants` | 읽기 | `id`(uuid), `event_id`, `name`, `norm_name`, `created_at`, `last_seen`, `anonymized_at` |
| `lw_responses` | 읽기 | `id`, `event_id`, `activity_id`, `participant_id`, `payload`, `created_at`, `updated_at` — (연수, 활동, 참가자)마다 1건. 이름·점수 칸 없음 |
| `lw_settings` | 읽기 | `event_id`, `key`, `value`('Y'/'N'), `updated_at` |

- 쓰기는 모두 아래 서버 함수로만 한다(표에 직접 쓰는 권한 없음).
- 실시간 발행(`supabase_realtime`): `lw_participants`, `lw_responses`, `lw_settings` (replica identity full). 클라이언트는 `event_id=eq.<id>` 필터로 자기 연수만 받는다.
- 목록 노출 연수: `GET /rest/v1/lw_events?select=id,title,date&listed=is.true&order=date.desc`

## 서버 함수 (`POST /rest/v1/rpc/<이름>`, 인자는 JSON 객체)

실패는 모두 `{ ok:false, code, msg }`. `msg`는 화면에 그대로 보여도 되는 문구다.
코드: `no_event` · `no_participant` · `no_activity` · `closed` · `invalid` · `bad_name` · `bad_mode` · `auth` · `bad_key` · `bad_value`

| 함수 | 인자 | 성공 |
|---|---|---|
| `lw_get_event` | `p_event_id` | `{ ok, event: { id, title, date, listed, description?, activities, materials? }, settings: { "<key>": "Y"|"N" }, reveal: { "<ox 활동 id>": { answers, labels?, notes?, panel? } }, server_time }` — `reveal`에는 `reveal:<id>`가 Y인 ox 활동만 들어간다 |
| `lw_join` | `p_event_id`, `p_name`, `p_mode`('check' 기본 · 'resume' · 'new') | 관리자: `{ ok, admin:true, participant:{ id:'ADMIN', name:'관리자' } }` · 같은 이름이 있고 check: `{ ok, exists:true, name }`(참가자를 만들지 않음) · 이어하기: `{ ok, resumed:true, participant:{id,name}, responses }` · 새로: `{ ok, created:true, participant:{id,name}, responses:{} }` |
| `lw_restore` | `p_event_id`, `p_participant_id` | `{ ok, participant:{id,name}, responses }` (익명화된 참가자는 `no_participant`) |
| `lw_submit` | `p_event_id`, `p_participant_id`, `p_activity_id`, `p_payload` | `{ ok:true }` 만. 점수·정답 여부는 돌려주지 않는다 |
| `lw_admin_set` | `p_event_id`, `p_key`, `p_value`, `p_passcode` | `{ ok, key, value }` |
| `lw_admin_reset` | `p_event_id`, `p_passcode` | `{ ok, participants, responses }` (지운 수. 설정·진행 설정은 남는다) |
| `lw_admin_check` | `p_event_id`, `p_passcode` | `{ ok: true|false }` |
| `lw_ping` | 없음 | `{ ok, at }` (깨우기용) |

- `responses`는 `{ "<활동 id>": payload }` (그 참가자의 응답).
- 관리자 판별: 이름 칸 입력에서 앞뒤 공백만 떼고, 길이 검사·정규화 **전에** 대소문자를 구분해 암호 해시와 비교한다. 관리자 화면은 사람이 입력한 암호를 기기에 두고 관리자 함수마다 `p_passcode`로 넘긴다(다시 열 때는 `lw_admin_check`로 확인).
- 같은 정규화 이름(앞뒤 공백 제거, 연속 공백 하나로, 소문자)이 여럿이면 `resume`은 가장 최근에 만든 참가자로 이어 간다.
- `lw_submit` 검사 순서: 연수 없음 → 참가자 없음(형식 틀린 id·다른 연수·익명화 포함) → 활동 없음 → `open:<활동 id>`가 Y 아님(`closed`, "아직 열리지 않은 과제입니다.") → 종류별 검사(`invalid`, 사유 문구). payload 형식은 `events/README.md` 참고.
- `lw_admin_set` 키: `open:<이 연수의 활동 id>`, `reveal:<이 연수의 ox 활동 id>`, `materials_open`. 값: `Y`/`N`.

## 내부 함수와 예약 작업

- `lw_validate_payload(활동, payload)`가 종류별 검사(`lw_validate_ox`, `lw_validate_stage_check`, `lw_validate_sentence`)로 보낸다. **새 활동 종류**를 더할 때는 `lw_validate_<종류>`를 만들고 이 함수에 한 줄, `tools/lib/event-config.mjs`의 `ACTIVITY_TYPES`와 형식 검사에 한 곳, 클라이언트 등록부에 한 곳을 더한다.
- `lw_anonymize_expired()`: 날짜 + 30일이 지난 연수의 참가자 이름을 '익명'으로, 정규화 이름을 `anon:<id>`로 바꾸고 `anonymized_at`을 적는다. 응답은 남긴다. 여러 번 불러도 결과가 같다.
- pg_cron 작업 `lw_anonymize`: 매일 18:17 UTC(한국 03:17)에 `lw_anonymize_expired()`를 부른다.
- 내부 함수는 브라우저에서 부를 수 없다(실행 권한 없음).
