# CEO Diary — 깃허브 페이지 배포 방법

## 폴더 구성
```
index.html          ← 앱 본체 (v3.28)
manifest.json       ← 홈 화면 앱 설정
icons/
  apple-touch-icon.png   ← 아이폰 홈 화면 아이콘 (180px)
  icon-192.png           ← 안드로이드/PWA
  icon-512.png           ← 안드로이드/PWA
  icon-rounded-512.png   ← 브라우저 탭용
  favicon-32.png         ← 브라우저 탭용
```

## 올리는 방법 (웹에서, git 명령어 불필요)

1. github.com 로그인 → `choide88/ceo-diary` 저장소 열기
   (없으면 New repository → 이름 `ceo-diary`, Public 으로 생성)
2. **Add file → Upload files** 클릭
3. 이 zip을 푼 다음 `index.html`, `manifest.json`, `icons` 폴더를
   통째로 드래그해서 업로드 → **Commit changes**
4. **Settings → Pages** → Branch 를 `main` / `(root)` 로 선택 → Save
5. 1~2분 뒤 `https://choide88.github.io/ceo-diary/` 접속

## 아이폰 홈 화면에 추가
1. 사파리로 위 주소 접속
2. 공유 버튼 → **홈 화면에 추가**
3. CEO DENNIS 로고가 앱 아이콘으로 표시되고,
   홈 화면에서 열면 주소창 없는 전체 화면 앱으로 실행됩니다.

## 업데이트할 때
새 버전 파일을 `index.html` 로 이름만 바꿔 같은 방법으로
업로드하면 기존 파일을 덮어씁니다.
