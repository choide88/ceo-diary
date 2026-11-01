# Google Calendar 연결 — 처음 한 번 설정

이번 변경은 아직 게시하거나 GitHub에 푸시하지 않은 개발본입니다. 실제 Google 계정 인증에는 아래의 본인 Google 설정과 공개 OAuth 클라이언트 ID가 필요합니다. 코드만으로 사용자 동의를 대신하거나 기존 Google 계정 권한을 얻을 수는 없습니다.

## 먼저 할 일

1. https://console.cloud.google.com/apis/library/calendar-json.googleapis.com 에 접속합니다.
2. 상단에서 사용할 프로젝트를 선택합니다. 없다면 새 프로젝트를 만듭니다. 이름은 `하루 다이어리` 등으로 자유롭게 정합니다.
3. **Google Calendar API → 사용 / Enable**을 누릅니다. 이미 `관리 / Manage`로 보이면 활성화된 것입니다.

여기까지 하고 다음 설정으로 넘어갑니다. Supabase에서 다시 SQL을 실행하거나 로그인 방식을 바꿀 필요는 없습니다.

## Google 로그인 동의 설정

Google Cloud Console의 **Google Auth Platform**에서 설정합니다. 콘솔 버전에 따라 **API 및 서비스 → OAuth 동의 화면**으로 표시될 수도 있습니다.

1. **브랜딩 / Branding**: 앱 이름을 `하루`로 정하고 본인 이메일을 지원·연락 이메일로 지정합니다.
2. **대상 / Audience**: 개인 Google 계정이라면 보통 External을 선택합니다. 테스트 상태에서 **테스트 사용자**에 실제 캘린더를 사용할 본인 Google 이메일을 추가합니다.
3. **데이터 액세스 / Data Access**에서 다음 읽기 전용 범위를 확인·등록합니다.
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

일정 작성·삭제, Gmail·연락처, 드라이브 접근은 요청하지 않습니다. 조직 Google Workspace 계정에서는 관리자 정책이 연결을 제한할 수 있습니다.

## 공개 클라이언트 ID 만들기

1. **클라이언트 / Clients → 클라이언트 만들기**로 이동합니다. 예전 콘솔에서는 **사용자 인증 정보 → OAuth 클라이언트 ID 만들기**입니다.
2. 애플리케이션 유형을 **웹 애플리케이션**으로 선택합니다.
3. **승인된 JavaScript 원본**에 다음을 추가합니다.

   ```text
   https://choide88.github.io
   ```

   `/ceo-diary/haru-final/` 경로를 붙이지 않습니다. 다른 도메인에서 실행한다면 그 사이트의 `https://호스트`를 추가합니다.

4. 이 버전은 Google의 브라우저 토큰·팝업 모델입니다. **승인된 리디렉션 URI는 사용하지 않습니다.** Supabase 콜백 주소를 넣는 방식이 아닙니다.
5. 발급된 **클라이언트 ID**를 복사합니다. 모양은 다음과 같습니다.

   ```text
   123456789012-xxxx.apps.googleusercontent.com
   ```

**Client secret은 필요하지 않으며 앱·GitHub·채팅에 넣지 않습니다.** 클라이언트 ID는 공개용이므로 앱의 연결 설정에 입력하거나 개발자에게 전달할 수 있습니다.

개발 검증 시에는 Google 공식 안내에 따라 `http://localhost`와 사용할 포트를 포함한 `http://localhost:8021`을 원본에 별도로 등록하고, 해당 원본에서 실행합니다. 운영 도메인 설정과 개발 원본 설정은 서로 별개입니다.

## 앱에서 연결하기 — 변경을 배포한 뒤

1. 기존 Supabase 계정으로 하루에 로그인합니다.
2. 홈의 **Google Calendar → 처음 연결하기**를 누릅니다.
3. 위 공개 클라이언트 ID를 입력해 저장합니다. ID와 캘린더 선택은 기존 계정 저장소에 보관되므로 다른 기기에서도 사용할 수 있습니다. 공통 ID를 배포 설정 `config.js`의 `googleClientId`에 넣을 수도 있습니다.
4. **Google Calendar 연결**을 누르고 본인 Google 계정을 선택합니다.
5. 일정과 캘린더 목록의 **읽기 권한 두 가지**에 동의합니다.
6. **캘린더 선택**에서 표시할 캘린더를 고릅니다. 투자 회사·워크스워크·PWR 등 기본 활동을 매핑하면 확인 화면에 분류가 채워집니다.

개인 테스트 중이라면 Google에서 지정한 본인 테스트 계정을 사용합니다. 테스트 사용자가 아니거나 프로젝트·출처 설정이 맞지 않으면 연결이 거부될 수 있습니다. 본인 프로젝트가 맞는지 확인하고 오류 안내에 따라 설정을 수정하세요.

## 기록을 줄이는 사용법

- 홈에는 오늘의 일정 최대 5개, 캘린더 화면에는 오늘·이번 주·다음 주를 표시합니다. 화면의 시간 기준은 한국 시간입니다.
- 캘린더의 예정 시간은 실제 시간 통계에 자동 합산하지 않습니다.
- 일정이 끝나면 **실제 시간 확인**을 누릅니다. 제목·날짜·활동을 미리 채우고, 일정 길이는 참고값으로 보여줍니다. 실제 사용한 분을 확인·수정하고 저장해야 시간 통계에 반영됩니다.
- 미래 일정은 종료 전 실제 시간으로 가져오지 않습니다.
- 종일 일정과 24시간보다 긴 일정은 사용 시간을 직접 입력합니다. 종일을 24시간으로 계산하지 않습니다.
- 같은 일정은 중복 가져오지 않고 이미 저장한 기록을 열어 수정합니다. Google iCalUID가 있으면 여러 캘린더에 표시된 동일 초대 일정도 합칩니다. 반복 일정은 회차별로 구분합니다.
- Google에서 원본 일정을 수정해도 이미 확정한 실제 시간은 자동 변경하지 않습니다.

## 자동화의 범위와 저장

이 버전은 Google 공식 GIS token model을 사용합니다. 서버에서 Google 토큰을 보관하거나 장기 백그라운드 동기화를 수행하지 않습니다.

- Google access token은 현재 페이지 메모리에만 두며 Supabase·localStorage·sessionStorage·백업 파일에 저장하지 않습니다.
- 새로고침·로그아웃·토큰 만료 후에는 **Google Calendar 연결**을 다시 눌러야 할 수 있습니다. 사용자 동의 없이 연결 창을 자동으로 열지 않습니다.
- Google 계정 권한을 추가로 설정하지 않아도 다른 기록 화면과 Supabase 저장은 계속 사용할 수 있습니다.
- 캘린더 원본은 읽기만 하며 작성·수정·삭제하지 않습니다. 세부 설명·참석자 목록·Gmail·연락처는 요청하지 않습니다.
- 조회한 일정은 메모리에만 보관합니다. 사용자가 확인해 가져온 실제 시간 기록과 원본 식별 정보만 기존 서버 기록에 저장합니다.
- 앱 계정 전환·로그아웃 때 Google 토큰과 조회한 일정을 비우고 이전 요청을 취소합니다. 계정 A의 Google 정보를 계정 B 화면에 남기지 않습니다.
- 연결 해제 때 이 앱의 메모리를 비우고 Google에 토큰 취소를 요청합니다. 네트워크 문제로 취소 요청이 실패할 수 있으므로 Google 계정의 앱 권한도 직접 관리할 수 있습니다. 이미 확인한 실제 시간 기록은 유지됩니다.

## 검증 결과와 제한

공식 API/인증 문서를 직접 확인했습니다. 브라우저 테스트에서는 인증·API 응답을 모사하여 다음을 검증했습니다.

- 두 읽기 전용 범위만 요청, Calendar API는 GET만 사용
- 캘린더 목록·일정 목록 페이지 처리, 한국 시간, 취소 일정 제외
- 미래 일정 가져오기 차단, 종일의 실제 분 직접 입력
- 실제 시간 확인 전 자동 저장 없음, 역할 매핑, 중복 방지, 원본 메타데이터 편집 보존
- 일부 캘린더 조회 실패 안내, 읽기 권한 거절, 팝업 취소, 토큰 만료
- Google 토큰의 서버·기기 저장소 미저장, 새로고침 시 자동 동의 없음
- 로그아웃·앱 계정 전환 이후 늦게 도착한 Google 인증 응답 무시, 모바일 레이아웃
- 기존 Supabase 로그인·서버 저장·충돌/복구 테스트 및 PostgreSQL 권한 테스트 통과

실제 Google 계정의 일정 조회는 아직 검증하지 못했습니다. 공개 OAuth 클라이언트 ID와 본인 동의가 남아 있습니다. 테스트는 실계정 연결 성공이나 배포 완료를 대신하지 않습니다.

## 공식 자료

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list

## Google Tasks 추가 — 확인하고 반영

Google Tasks도 사용할 경우 같은 Google Cloud 프로젝트에서 **Google Tasks API**를 추가로 사용 설정합니다.

- 활성화 페이지: https://console.cloud.google.com/apis/library/tasks.googleapis.com
- Google Auth Platform의 데이터 액세스 범위에 `https://www.googleapis.com/auth/tasks.readonly`를 추가합니다.
- 새 Client secret이나 별도의 Supabase SQL은 필요 없습니다. 같은 공개 OAuth 클라이언트 ID를 사용합니다.
- 앱의 연결 설정에서 **Google Tasks 할 일도 읽기 전용으로 연결**을 선택하거나, 캘린더 연결 후 **Google Tasks 연결**을 누릅니다. 추가 읽기 동의는 사용자가 버튼을 눌렀을 때만 요청합니다.
- Tasks 권한을 거절해도 Calendar의 두 읽기 권한이 있으면 캘린더는 사용할 수 있습니다. Tasks API 오류도 일정 조회를 막지 않습니다.

### Google Tasks를 원본으로 쓰는 흐름

1. Google Tasks에서 할 일을 작성합니다.
2. 하루에서 읽어온 목록은 **검토 대기**로 표시됩니다. 이 단계에서는 내 업무·완료 통계에 들어가지 않습니다.
3. **확인하고 반영**을 눌러 제목·활동·기한·본업/알바 등 구분·메모·완료 여부를 확인합니다.
4. **확인한 내용만 반영**을 눌러야 내 업무에 저장됩니다. 취소하면 아무것도 저장하지 않습니다.
5. 원본이 바뀌면 **변경사항 검토**에서 다시 확인합니다. 동일한 Google Tasks 항목은 새로 추가하지 않고 기존 기록을 수정합니다.

현재는 Google Calendar와 Tasks 모두 읽기 전용입니다. 하루에서 업무를 수정하거나 완료해도 Google Tasks 원본으로 쓰지 않습니다. 원본 삭제·완료·기한 변경도 사용자 확인 없이 내 기록을 덮어쓰지 않습니다.

미완료 할 일을 기본으로 조회합니다. Google 웹·모바일 앱에서 완료한 항목도 보려면 **완료한 할 일도 보기**를 선택합니다. API의 `showCompleted`와 `showHidden`을 함께 켭니다. 목록이 너무 많으면 표시할 목록을 좁히거나 미완료만 조회하세요. Tasks 기한은 날짜이며, 시각이나 한국 시간으로 재변환하지 않습니다.

Tasks 조회 결과와 OAuth 토큰은 페이지 메모리에만 있습니다. 확인한 업무와 원본 식별 정보만 기존 Supabase 기록에 저장합니다.

## 알바 기록

캘린더의 끝난 일정에서 **실제 시간 확인 → 기록 분류: 알바**를 선택합니다. 활동과 제목·날짜를 확인하고 실제 근무한 분을 입력합니다.

- 알바명·근무처와 시급은 선택 항목입니다.
- 휴게시간을 제외한 실제 근무시간을 직접 확인합니다.
- 예상 금액은 `실제 분 ÷ 60 × 입력 시급`을 원 단위로 반올림한 값입니다.
- 시급을 적지 않은 기록을 0원 수입으로 판단하지 않습니다. 합계는 시급을 입력한 기록만 계산하고 입력 건수를 표시합니다.
- 세금·수당·계약 조건은 자동 계산하지 않으며 실제 입금이나 확정 급여가 아닙니다.
- 업무 화면의 **알바 기록**에서 날짜별 내역, 이번 달 실제 시간, 시급 입력분의 예상 금액을 봅니다. **알바 기록 ＋**로 직접 입력할 수도 있습니다.
- 실제 시간을 수정하면 예상 금액도 다시 계산합니다. 실제 수입 데이터에 자동 입금 기록을 만들지 않습니다.
- Google Tasks에서 알바 준비를 완료했다고 근무시간·예상 수입을 자동 생성하지 않습니다.

### 추가 검증

`tests/google-tasks.cjs`는 모사 API로 읽기 전용 요청, 목록/할 일 페이지 처리, 검토 취소·확인, 기한 날짜, 역할 매핑, 원본 완료 상태의 명시적 재반영, 중복 방지, 일부 목록 실패, Tasks 동의 거절, 알바 계산·수정, 자동 입금 기록 미생성, 모바일을 검증합니다. 실제 Google 계정 연결이나 원격 게시를 수행한 것은 아닙니다.

공식 Tasks 자료:

- https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/list
- https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list
