# Google 장기 연결 설정 (관리자 1회)

새로고침은 기존 탭의 만료 전 access token으로 자동 복원합니다. 만료 후 자동 갱신은 아래 서버 설정이 필요합니다. Refresh token과 Google client secret은 웹앱·GitHub·채팅에 넣지 않습니다.

1. Supabase SQL Editor에서 `003_google_connections.sql`을 실행합니다. 기존 일기 데이터는 변경하지 않습니다. 두 새 테이블은 브라우저 읽기·쓰기가 차단됩니다.
2. Google Cloud → 클라이언트 → 기존 웹 OAuth 클라이언트에서 승인된 리디렉션 URI에 아래를 정확히 추가합니다. JavaScript 원본 `https://choide88.github.io`는 유지합니다.

   `https://syyfpdcylvumvyrlgezc.supabase.co/functions/v1/google-connect?callback=1`

3. Supabase → Edge Functions에서 `google-connect` 함수를 만들고 `functions/google-connect/index.ts`를 배포합니다. 함수 설정의 플랫폼 JWT 검증은 끕니다. Google 콜백에는 Supabase JWT가 없기 때문입니다. 함수 코드가 나머지 요청의 JWT와 계정 허용 목록을 직접 검사합니다.
4. Edge Functions → Secrets에 다음을 저장합니다.
   - `GOOGLE_CLIENT_ID`: 현재 공개 OAuth 클라이언트 ID
   - `GOOGLE_CLIENT_SECRET`: 같은 클라이언트의 보안 비밀번호 (서버에만 입력)
   - `GOOGLE_TOKEN_KEY`: 암호화 키. `openssl rand -base64 32`로 생성한 32바이트 키를 입력합니다. 값을 바꾸면 기존 연결은 다시 동의해야 합니다.
   - `HARU_APP_URL`: `https://choide88.github.io/ceo-diary/haru-final/`
   - `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 함수 런타임의 기본 환경변수를 사용합니다. 프런트엔드로 복사하지 않습니다.
5. 하루 로그인 → Google ‘연결 설정’에서 Tasks 사용 여부 저장 → **계속 연결하기** → 본인 Google 계정으로 한 번 다시 동의합니다.

CLI를 사용하는 경우 이 폴더를 Supabase 프로젝트에 연결한 뒤 `supabase functions deploy google-connect --no-verify-jwt`를 실행할 수 있습니다. 비밀 값은 Dashboard Secrets 또는 git에 포함하지 않는 별도 env 파일을 사용하세요.

Google 앱이 외부 ‘테스트’ 상태이고 Calendar/Tasks 범위를 요청하면 refresh token은 일반적으로 7일 후 만료됩니다. 개인 사용이어도 장기 이용에는 Google의 게시 상태·민감한 범위 정책을 확인해야 합니다. 권한 취소, 계정 보안 변경 등에는 다시 동의가 필요할 수 있습니다. 완전 무기한 연결을 보장하지 않습니다.

보안: OAuth state는 무작위 생성 후 해시로 보관하며 10분 내 1회만 사용합니다. 갱신 토큰은 계정 ID를 추가 인증 데이터로 사용한 AES-GCM으로 암호화합니다. 일반 일기 백업에는 포함되지 않습니다. 해제 시 서버 연결과 대기 OAuth state를 삭제하고 Google 권한 해제를 시도합니다.
