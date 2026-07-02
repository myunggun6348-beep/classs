# 커리어넷 API + Google Sheets 연동 설정

이 문서는 고3 2반 앱에서 실제 대학·학과 검색이 작동하도록 설정하는 절차입니다.

## 1. 준비물

- Google 스프레드시트 1개
- Google Apps Script 프로젝트 1개
- 커리어넷 OpenAPI 키

## 2. 커리어넷 API 키 준비

1. 커리어넷 OpenAPI 센터에 접속합니다.
2. OpenAPI 이용 신청 후 API 키를 발급받습니다.
3. 발급받은 키를 `google-sheets-apps-script.js`의 `CAREERNET_API_KEY`에 입력합니다.

```javascript
const CAREERNET_API_KEY = "발급받은_API_KEY";
```

## 3. Google Sheets ID 입력

Google 스프레드시트 주소가 아래와 같다면,

```text
https://docs.google.com/spreadsheets/d/스프레드시트_ID/edit
```

`/d/`와 `/edit` 사이의 값을 복사해서 `SPREADSHEET_ID`에 넣습니다.

```javascript
const SPREADSHEET_ID = "스프레드시트_ID";
```

## 4. Apps Script 배포

1. Google 스프레드시트에서 `확장 프로그램 > Apps Script`를 엽니다.
2. 기존 코드를 지우고 `google-sheets-apps-script.js` 내용을 붙여넣습니다.
3. 저장합니다.
4. `배포 > 새 배포`를 선택합니다.
5. 유형은 `웹 앱`으로 선택합니다.
6. 실행 권한은 `나`로 설정합니다.
7. 액세스 권한은 배포 환경에 맞게 설정합니다.
   - 학교 계정 내부에서만 사용할 경우: 조직 내 사용자
   - 학생 기기에서 접속해야 할 경우: 링크가 있는 사용자 또는 모든 사용자
8. 배포 후 생성된 웹앱 URL을 복사합니다.

## 5. 앱에 웹앱 URL 입력

1. `index.html` 앱에서 교사로 로그인합니다.
2. 교사용 탭으로 이동합니다.
3. `Google Sheets 연동` 영역의 Apps Script 웹앱 URL에 배포 URL을 붙여넣습니다.
4. `Sheets 설정 저장`을 누릅니다.

## 6. 대학·학과 캐시 최초 생성

Apps Script 편집기에서 함수 목록을 열고 아래 함수를 한 번 실행합니다.

```javascript
refreshCareerNetMajorCache
```

처음 실행할 때 권한 승인 창이 나옵니다. 승인하면 스프레드시트에 `대학학과API캐시` 시트가 만들어지고 실제 대학·학과 데이터가 저장됩니다.

## 7. 매일 자동 갱신 트리거 설치

Apps Script 편집기에서 아래 함수를 한 번 실행합니다.

```javascript
installDailyMajorCacheTrigger
```

이후 매일 새벽 4시에 `refreshCareerNetMajorCache`가 자동 실행되어 대학·학과 캐시를 갱신합니다.

## 8. 검색 작동 방식

학생이 앱에서 검색하면 다음 순서로 작동합니다.

```text
검색어 입력
→ 앱이 Apps Script 웹앱 호출
→ Apps Script가 Google Sheets 캐시 검색
→ 필요 시 커리어넷 API 캐시 생성 또는 갱신
→ 앱에 실제 대학·학과 결과 표시
```

검색 예시는 다음과 같습니다.

```text
부산대학교
부산대
의예과
부산 통계
서울 컴퓨터
간호
```

## 9. 참고

- 커리어넷 OpenAPI 센터: https://www.career.go.kr/cnet/front/openapi/openApiTestCenter.do
- Google Apps Script 웹앱 문서: https://developers.google.com/apps-script/guides/web
- Google Apps Script 설치형 트리거 문서: https://developers.google.com/apps-script/guides/triggers/installable
