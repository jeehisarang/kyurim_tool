# 작업 지시서 — 킬팻캡슐 추천 이벤트 Phase 3 (본프로그램 추천권 + 처방등록 소개확인)

## 배경
Phase 1~2로 "체험 추천 루프"(5천원, 자동적립)는 완성됨. 이번엔 "본프로그램 추천
루프"(7만원 적립 + 3만원 할인, 수동확정) 차례. 기존 오프라인 "지인소개 이벤트"
플라이어 규칙을 그대로 디지털화하는 것.

## 3-1. 본프로그램 추천링크 자동 발급
- 킬팻캡슐 1개월/3개월(SPLIT 타입) Prescription 생성 시, ReferralLink(kind=MAIN,
  patientId=해당환자, sourcePrescriptionId=해당처방, expiresAt=해당 처방의
  종료예정일) 자동 발급 — Phase 1의 TRIAL 발급 후킹과 동일한 트랜잭션 패턴 재사용
- 이 링크는 톡에 자동 삽입하지 않음. 기존 "링크 포함하기"(ShareLinkPanel, 톡생성기)
  방식으로 담당자가 필요할 때 수동으로 골라 넣을 수 있게 연결만 해둘 것 (자동
  삽입은 이번 범위 아님)
- 처방 상세페이지에도 이 MAIN 링크를 TRIAL 링크와 동일한 UI(추천링크 섹션, QR,
  적립현황 표시 포함)로 노출

## 3-2. 처방 등록 화면(/prescriptions/new)에 "소개 확인" 섹션 추가
- 킬팻캡슐 1개월/3개월 프로그램 선택 시에만 노출
- "이 환자, 소개받고 오셨나요?" — 아니오(기본) / 예(추천인 환자 검색 선택)
- TrialApplication에 referralToken이 남아있는 경우(체험 신청 시 추천코드로
  들어왔던 환자가 본프로그램으로 전환하는 경우), 이 화면 진입 시 "이 신청은
  {코드}로 들어왔습니다 — 추천인으로 연결할까요?" 힌트를 자동으로 띄워 링크
  소유 환자를 후보로 제시 (검색 수고 절감, 최종 확정은 직원이 버튼으로)
- "예" 선택 후 확정 시:
  - ReferralCreditEntry(kind=MAIN_SIGNUP, patientId=추천인, amount=70000,
    referredName=현재등록환자명, referredPrescriptionId=현재처방ID,
    confirmedByStaffId=현재로그인직원) 생성
  - 현재 등록환자 쪽에는 "소개받음 - 3만원 할인 대상" 표시만 남김 (실제 결제
    연동 없음, 한차트에서 원장님이 직접 할인 적용)

## 3-3. 원장 전용 적립 현황 화면
- `/settings/referral-credits` 신규 — 환자별 ReferralCreditEntry 목록,
  TRIAL_SIGNUP 합계 / MAIN_SIGNUP 합계 / 총합 표시, 개별 내역 펼쳐보기
  (이미 처방상세에 있는 개별 표시와 별개로, 전체 환자 가로지르는 조회 화면)

## 검증
- 본프로그램(1개월/3개월) 등록 시 ReferralLink(MAIN) 자동 발급 확인
- 처방등록 화면 소개확인 섹션에서 추천인 지정 시 ReferralCreditEntry(MAIN_SIGNUP)
  정상 생성 확인
- TrialApplication의 referralToken 힌트가 실제로 후보를 제시하는지 확인
- 적립 현황 화면에서 실제 테스트 데이터로 합계 정상 집계 확인
- 처방 상세페이지에서 MAIN 링크도 TRIAL과 동일하게 QR/적립현황 노출 확인
- npx tsc --noEmit 통과 (build는 여유 있을 때 별도로)
- 생성한 테스트 데이터 정리

## 완료 후 보고
- 수정/신규 파일 경로
- 커밋 해시, git push 결과