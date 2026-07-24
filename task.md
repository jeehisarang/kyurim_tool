# 작업 지시서 — Phase 4: 카카오톡 공유하기 + 채널 추가 버튼

## 사전 준비 완료 확인
원장님이 아래 두 값을 확보하셨음. `.env`에 추가할 것:

NEXT_PUBLIC_KAKAO_JS_KEY=328b5cfc5cce037b40de256191427051
NEXT_PUBLIC_KAKAO_CHANNEL_PUBLIC_ID=_FVxlGT


- JavaScript 키: 카카오디벨로퍼스 "규림툴" 앱에서 발급, `link.kyurim.kr` 도메인 등록 완료
- 채널 고유 ID: 카카오톡채널 관리자센터(regularpf) 기준 `_FVxlGT` (채널 URL
  `pf.kakao.com/_FVxlGT`의 마지막 부분)
- **중요**: 카카오톡 공유(Kakao.Share) 기능은 별도 활성화/심사 없이 JS 키 발급 +
  도메인 등록만으로 바로 사용 가능함을 확인함. "카카오톡 메시지" 메뉴(친구 목록
  API로 서버가 대신 발송하는 기능, 별도 심사 필요)와는 무관하니 혼동하지 말 것.

## ⚠️ SDK 버전 주의
- Kakao JS SDK v1(Legacy)은 2026.12.31 지원 종료 예정. **반드시 v2 SDK로 구현**
  (`https://t1.kakaocdn.net/kakao_js_sdk/2.x.x/kakao.min.js` 최신 버전 사용)
- v2 함수명: `Kakao.Channel.createAddChannelButton()` / `Kakao.Channel.addChannel()`
  (v1과 이름은 같지만 최신 SDK 스크립트로 로드할 것), 공유는
  `Kakao.Share.sendDefault()`

## 작업 범위

### 1. 카카오 SDK 공통 로딩
- 카카오 JS SDK(v2, 최신 버전)를 앱 전체에서 한 번만 로드하는 공용 훅/컴포넌트
  신설 (예: `useKakaoSdk()`)
- `NEXT_PUBLIC_KAKAO_JS_KEY` 있을 때만 `Kakao.init()` 호출, 없으면 이후 모든
  카카오 관련 버튼을 렌더링하지 않음(안전한 폴백)

### 2. 카카오톡 공유 버튼
- 대상 화면: 신청 완료 화면(`/refer/trial`), 마감설문 배너(제출 전/후 양쪽,
  `/refer/exit/[prescriptionId]`)
- 클릭 시 `Kakao.Share.sendDefault()` 호출 — 템플릿(제목/설명/썸네일/링크)
  구성, 링크는 각 화면 기준 해당 환자의 추천링크로 자동 설정
- 기존 "링크 복사" 버튼 옆에 나란히 배치

### 3. 카카오톡 채널 추가 버튼
- 대상 화면: 신청 완료 화면(`/refer/trial`) — 기존 카카오 채팅창 오픈 버튼과
  나란히 노출
- `Kakao.Channel.createAddChannelButton({ container, channelPublicId:
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_PUBLIC_ID })` 사용
- `NEXT_PUBLIC_KAKAO_CHANNEL_PUBLIC_ID` 값이 없으면 버튼 자체 미노출

## 검증
- 실기기(모바일)에서 카톡 공유 버튼 → 공유 시트 정상 오픈, 실제 카톡방에
  카드 형태로 전달되는지 확인
- 채널 추가 버튼 클릭 → 실제로 규림한의원 천안 채널이 추가되는지 확인
  (본인 카카오계정으로 테스트, 이미 추가돼 있으면 새 계정/로그아웃 상태로 테스트)
- 두 환경변수 중 하나라도 없을 때 관련 버튼만 정확히 숨겨지는지 확인(폴백 안전성)
- npx tsc --noEmit / npm run build 통과

## 완료 후 보고
- 수정/신규 파일 경로
- 커밋 해시, git push 결과
- 두 버튼 각각 실기기 확인 여부