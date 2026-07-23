# 작업 지시서 — 체험이벤트 Phase 1 보완 (실사용 테스트 중 발견된 5건)

## 배경
Phase 1(신청폼+자동발급/적립) 완료 후 원장님이 실제 브라우저로 테스트하며
5가지 보완사항을 발견함. Phase 2(마감설문) 진행 전에 먼저 처리.

## 1. 몸타입 문항 — 단일선택 → 복수선택(최대 2개) + 우세타입 집계

### 문제
원본 구글폼은 "최대 2개까지 선택 가능"한 체크박스 문항인데, 신청폼에서
단일선택 버튼으로 잘못 구현됨.

### 수정
- TrialApplicationForm.tsx의 bodyType1~6 입력 UI를 체크박스 다중선택
  (최대 2개, 2개 넘게 선택 시 알림 후 차단)으로 변경
- TrialApplication 스키마: bodyType1~6 필드를 단일 값 저장에서
  JSON 배열 저장(예: `["A","C"]`)으로 변경 (기타 선택 시 별도
  bodyType{N}Other 텍스트 필드는 유지)
- 우세타입 계산 함수 신규(`computeDominantBodyType()`): 6문항 응답 전체에서
  A~E 등장 횟수를 합산해 가장 많은 알파벳을 "우세타입"으로 산출, 동점이면
  복수 표시(예: "A, C 동점")
- 응답 결과 확인 화면 신규: `/refer/applications`(이미 있는 신청 목록)에
  각 신청 건의 6문항 원본 응답 + 계산된 우세타입을 펼쳐볼 수 있게 상세
  뷰 추가 (구글폼 "응답" 탭처럼 한 화면에서 전체 확인 가능하도록)

## 2. 신청 제출 시 카카오톡 채널 자동 연결 + 후속조치 업무 생성

### 참고할 기존 패턴
`src/lib/teaching-pages.ts`의 `requestConsultCallback()` — 카카오채널 채팅
연결(`window.open`) + 동시에 콜백 업무(WORK 타입) 자동 생성하는 기존 패턴을
그대로 재사용. 이벤트문의(`requestEventInquiryCallback()`)도 동일 패턴으로
이미 구현된 전례 있음.

### 수정
- TrialApplicationForm.tsx 제출 성공 핸들러에서, 완료 화면 표시와 동시에
  `window.open(NEXT_PUBLIC_KAKAO_CHANNEL_CHAT_URL)` 호출 (팝업 차단 회피를
  위해 클릭 핸들러 내 동기 호출 원칙 그대로 적용)
- `src/lib/trial-applications.ts`(또는 기존 referrals.ts)에
  `requestTrialApplicationCallback()` 신규 — 신청 건 기준으로 "새 신청 접수 -
  연락 필요" WORK 업무 자동 생성 (담당자 미지정 전체공통, 당일+동일 신청건
  기준 중복방지 — 카카오 연결 성공 여부와 무관하게 항상 생성, 전화 폴백을
  위한 안전장치이므로)
- 업무 제목에 신청자 이름+연락처 포함해서, 직원이 카톡 확인이 안 되면
  바로 전화할 수 있게 표시

## 3. QR 코드 생성

### 수정
- `qrcode` 패키지 설치 (클라이언트 사이드에서 canvas/데이터URL로 QR 생성)
- `/settings/trial-campaign` 화면에 QR 코드 섹션 추가: `{SHARE_BASE_URL}/refer/trial`
  기준 QR 이미지 표시 + "PNG 다운로드" 버튼 (원내 포스터 인쇄용)
- 처방 상세페이지(`/prescriptions/[prescriptionId]`)의 "추천링크" 섹션에도
  해당 환자 전용 추천링크 QR + 다운로드 버튼 추가 (필요시 환자에게 QR로도
  전달 가능하도록)

## 4. 실시간 활동피드 반영

### 수정
- TrialApplication 생성 시 ActivityLog(PATIENT 타입) 항목 자동 생성 —
  "OOO님이 킬팻캡슐 3일체험을 신청했습니다" (referralToken 있으면 "OOO님
  추천으로 신청했습니다" 형태로 구분)
- 기존 PATIENT 로그 스타일(빨간 강조) 그대로 적용

## 5. 처방 상세페이지에 적립 현황 표시 (Phase 3 전체화면 이전 임시)

### 수정
- 처방 상세페이지의 "추천링크" 섹션에, 해당 링크(ReferralLink) 기준
  ReferralCreditEntry(TRIAL_SIGNUP) 건수/합계를 작게 표시
  (예: "적립 현황: 2건 · 10,000원")
- 전체 환자 통합 조회 화면은 기존 계획대로 Phase 3에서 별도 구현

## 검증
- 몸타입 문항 2개까지 선택 가능, 3개째 시도 시 차단되는지 확인
- 실제 신청 데이터로 우세타입 계산 결과가 응답과 일치하는지 확인
- 신청 제출 시 카카오 채팅창 오픈 + "새 신청 접수" 업무 생성 확인 (카톡
  연결 성공/실패 양쪽 케이스 모두 업무는 생성되는지)
- QR 다운로드한 이미지를 실제 폰 카메라로 스캔해 정상 접속되는지 확인
- 신청 시 실시간 활동피드에 정상 노출 확인
- 처방 상세페이지에서 적립 현황 숫자가 실제 ReferralCreditEntry와 일치하는지 확인
- 기존 테스트 데이터(김우석/김서현) 정리 여부 확인
- npx tsc --noEmit / npm run build 통과

## 완료 후 보고
- 수정/신규 파일 경로
- 커밋 해시, git push 결과
