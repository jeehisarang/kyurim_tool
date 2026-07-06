# 작업 지시: 핵심기능③ 문자발송(알림톡) 관리 + AI 문구생성

## 배경
사이드바 공통 레이아웃은 이미 완성되어 있음 (Sidebar.tsx). 
이번 작업은 그 틀 안에 "문자발송" 메뉴와 화면을 새로 추가하는 것.

## 0단계: 사이드바에 메뉴 추가
- src/components/Sidebar.tsx에 메뉴 항목 추가: "문자발송" → /messages
- 위치: "내원체크"와 "오늘 할 일" 사이 (또는 자연스러운 순서로)

## 1단계: 스키마 (먼저 계획만 제시, 승인 후 진행)

### MessageLog (문자발송 이력)
- id, patientId (FK → Patient)
- messageType: WELCOME | MEETING | DAY2 | DAY7 | THIRD_VISIT
- sentDate: DateTime, nullable (발송 확인 전엔 null)
- staffUserId (FK → StaffUser, nullable): 발송 확인한 사람
- aiDraftContent: String, nullable (AI가 생성했던 문구 기록, WELCOME/MEETING은 항상 null)
- 환자당 messageType별로 유니크 (한 환자, 한 유형당 1행)

### Patient에 필드 추가 (없으면 추가, 있으면 재사용)
- memo: String, nullable (AI 문구 생성에 쓸 환자 메모)

## 2단계: AI 문구생성 (공용 함수, src/lib/ai-message.ts)
- 입력: 환자 정보(이름, 메모, 최근 내원이력), messageType(DAY2 | DAY7 | THIRD_VISIT)
- Anthropic API(claude-sonnet-4-6) 호출해서 문구 생성
- 프롬프트는 임시 버전으로 구현하되, 파일 상단에 상수로 분리해서 추후 쉽게 교체 가능하게 할 것
  - DAY2: "첫 내원 다음날 점심에 보내는 안부/독려 메시지, 짧고 다정한 톤"
  - DAY7: "7일간 미내원한 환자에게 보내는 재방문 유도 메시지, 부담스럽지 않은 톤"
  - THIRD_VISIT: "3회 내원 완료를 축하하고 향후 치료 방향을 안내하는 메시지"
- 출력: 순수 텍스트 (카카오톡 붙여넣기용, 마크다운 금지)
- Anthropic API 키가 환경변수에 없으면 어떻게 설정해야 하는지 명확히 보고할 것

## 3단계: 화면 /messages (문자발송 관리)
- 기존 사이드바 레이아웃 안에 자연스럽게 들어가도록 구성 (기존 디자인 토큰 재사용)
- 환자 목록(검색 가능) + 5종 알림톡 유형별 상태(발송함/안함) 표시
- WELCOME, MEETING: 고정 템플릿 텍스트 표시 + "복사" 버튼 + "발송확인" 버튼(별도)
- DAY2, DAY7, THIRD_VISIT: "문구 생성" 버튼 → AI 호출 결과 표시 
  + "복사" 버튼(복사만) + "발송확인" 버튼(별도, 클릭 시 sentDate/staffUserId 저장)
- "복사"와 "발송확인"은 반드시 분리된 버튼
- 현재 사용자(사이드바 하단 CurrentUserSelector) 값을 발송확인 시 staffUserId로 사용

## 4단계: API
- GET /api/messages?patientId= : 환자의 5종 알림톡 상태 조회
- POST /api/messages/generate : { patientId, messageType } → AI 문구 생성 반환 (DB저장 없음, 미리보기)
- POST /api/messages/confirm : { patientId, messageType, staffUserId, aiDraftContent? } → 발송확인 저장

## 작업 방식
- 스키마 변경 전 계획만 먼저 제시 → 승인 후 진행
- 완료 후 npm run build로 검증
- 기존 기능(내원체크, 처방등록, 오늘할일)은 절대 건드리지 않음