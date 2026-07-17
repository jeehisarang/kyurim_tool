# 증상 패턴 프로필 — 스키마 설계 v2 확정판 (task.md 기준)

이 문서는 최신 task.md("환자 상담모드 '증상 패턴 프로필' — 스키마 v2 확정 + 구현")에 맞춰
전면 재작성한 최종안입니다. 이전 버전(examRecordId 제거만 반영한 초안)에서 다음이 바뀌었습니다:

- 응답 방식이 **체크박스(있음/없음)에서 3단계 점수(0/1/2)로 변경**
- 7개 대분류 카테고리 + 정확히 12문항 + "그외" 자유기록 1개로 **문항 구조가 완전히 확정**
- 모델명을 `TcmPattern`→**`TcmCategory`**, `TcmPatternScore`→**`TcmCategoryScore`**로 변경
  (task.md가 "변증"이 아니라 "카테고리"라는 용어를 명시적으로 씀 — 과신 방지 목적과 일치)
- **HRV AI 코멘트 생성 연동까지 이번 라운드 구현 범위**에 포함(이전엔 "향후"로 미뤄뒀던 부분)
- 관리자 입력 화면은 신규 화면 대신 `/settings/exam-guides` 확장으로 확정(질문 4의 1번 답변)

---

## 제안 스키마

```prisma
// 7개 대분류(EMOTION_STAGNATION 등) 1개 = 1행. 문항 문구는 별도 테이블(TcmChecklistQuestion).
model TcmCategory {
  id                 Int      @id @default(autoincrement())
  categoryCode       String   @unique // "EMOTION_STAGNATION" 등 7개 고정값(task.md 표 그대로)
  patientLabel       String   // 환자 표시명, 예: "스트레스·정서긴장"
  treatmentPrinciple String?  // 치료원칙 — 이번 라운드는 전부 null로 비워둠(원장 추후 입력)
  displayOrder       Int      @default(0)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  questions      TcmChecklistQuestion[]
  categoryScores TcmCategoryScore[]
}

// 카테고리 1개에 딸린 문항. 12개 전부 task.md 표의 문구 그대로 시드(임의 수정 안 함).
model TcmChecklistQuestion {
  id              Int         @id @default(autoincrement())
  categoryId      Int
  category        TcmCategory @relation(fields: [categoryId], references: [id])
  questionCode    String      @unique // 예: "EMOTION_STAGNATION_1"
  patientQuestion String      // 환자에게 보여줄 실제 질문 문장(task.md 표 그대로)
  weight          Int         @default(1) // 향후 문항별 가중치 조정용, 이번엔 전부 1
  displayOrder    Int         @default(0)
  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())

  answers TcmChecklistAnswer[]

  @@index([categoryId])
}

// 응답 1건 = 환자의 설문 작성 세션(이력 누적, deletedAt 없음). "그외" 자유기록은 여기 직접
// 필드로 둬서 점수화 테이블과 분리(task.md 지시).
model TcmChecklistResponse {
  id        Int     @id @default(autoincrement())
  patientId Int
  patient   Patient @relation(fields: [patientId], references: [id])

  source             String            // "IN_CLINIC" | "SHARE_LINK"
  shareLinkId        Int?
  shareLink          PatientShareLink? @relation(fields: [shareLinkId], references: [id])
  submittedByStaffId Int?
  submittedByStaff   StaffUser?        @relation(fields: [submittedByStaffId], references: [id])

  otherSymptomsText String? // "그외" 자유기록, 점수화 안 함

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt // 같은 달 재작성 시 이 값만 갱신(덮어쓰기), 달이 바뀌면 새 행

  answers        TcmChecklistAnswer[]
  categoryScores TcmCategoryScore[]

  @@index([patientId])
}

// 문항별 응답값 — 0=없다, 1=경미하다, 2=심하다(정수 그대로 저장, task.md 지시).
model TcmChecklistAnswer {
  id         Int                  @id @default(autoincrement())
  responseId Int
  response   TcmChecklistResponse @relation(fields: [responseId], references: [id])
  questionId Int
  question   TcmChecklistQuestion @relation(fields: [questionId], references: [id])
  score      Int // 0 | 1 | 2

  @@unique([responseId, questionId])
}

// 응답 1건의 카테고리별 계산 결과(제출 시점 스냅샷 — 문항이 나중에 바뀌어도 과거 응답의
// "그때 결과"가 보존됨, HrvTestRecord의 AI 코멘트 캐싱과 동일 원칙).
model TcmCategoryScore {
  id          Int                  @id @default(autoincrement())
  responseId  Int
  response    TcmChecklistResponse @relation(fields: [responseId], references: [id])
  categoryId  Int
  category    TcmCategory          @relation(fields: [categoryId], references: [id])
  rawScore    Int   // 해당 카테고리 문항 점수 합
  maxScore    Int   // 문항수 × 2
  ratio       Float // rawScore / maxScore (0.0~1.0) — 내부 저장용, 환자 화면엔 숫자 노출 안 함
  isCandidate Boolean @default(false) // 동점 병렬 포함 후보 여부(전부 0점이면 전부 false)

  @@unique([responseId, categoryId])
}
```

기존 모델에 역참조만 추가: `Patient.tcmChecklistResponses`,
`PatientShareLink.tcmChecklistResponses`, `StaffUser.tcmChecklistResponses`.

### 시드 데이터 (task.md 표 그대로, 문구 임의 수정 없음)

| categoryCode | patientLabel | questionCode | patientQuestion |
|---|---|---|---|
| EMOTION_STAGNATION | 스트레스·정서긴장 | EMOTION_STAGNATION_1 | 가슴이 답답하고 한숨이 잦으신가요? |
| EMOTION_STAGNATION | 스트레스·정서긴장 | EMOTION_STAGNATION_2 | 짜증이나 화, 열감이 갑자기 치밀어 오르시나요? |
| QI_YANG_DEFICIENCY | 기력·냉증 | QI_YANG_DEFICIENCY_1 | 쉽게 피곤하고 기운이 없으신가요? |
| QI_YANG_DEFICIENCY | 기력·냉증 | QI_YANG_DEFICIENCY_2 | 손발이 차거나 평소 추위를 많이 타시나요? |
| YIN_DRYNESS | 열감·건조 | YIN_DRYNESS_1 | 입이 자주 마르고 손발이나 가슴에 열감이 있으신가요? |
| YIN_DRYNESS | 열감·건조 | YIN_DRYNESS_2 | 밤에 잠이 얕거나 식은땀이 나시나요? |
| DIGESTIVE | 소화기 | DIGESTIVE_1 | 속이 더부룩하고 소화가 잘 안 되시나요? |
| DIGESTIVE | 소화기 | DIGESTIVE_2 | 대변이 무르거나 변비가 있으신가요? |
| PHLEGM_DAMPNESS | 담습·부종 | PHLEGM_DAMPNESS_1 | 몸이나 머리가 무겁고 개운하지 않으신가요? |
| BLOOD_DEFICIENCY | 혈허 경향 | BLOOD_DEFICIENCY_1 | 어지럽거나 안색이 창백하다는 말을 들으시나요? |
| BLOOD_STASIS | 순환·어혈 | BLOOD_STASIS_1 | 아픈 부위가 일정하고 찌르듯 아프신가요? |
| OTHER | 그외 | (문항 없음, 자유기록 전용) | — |

`OTHER`는 `TcmCategory` 행은 만들되(관리자 화면에 표시/치료원칙 입력 대상으로 남겨두기 위해)
`TcmChecklistQuestion`은 만들지 않습니다 — 응답은 `TcmChecklistResponse.otherSymptomsText`
자유 텍스트로만 받고 점수 계산에서 제외합니다.

### 점수 계산 (task.md 공식 그대로)

```
rawScore(카테고리) = 그 카테고리 문항들의 score(0/1/2) 합
maxScore(카테고리) = 문항수 × 2
ratio = rawScore / maxScore
```

**환자 노출용 3단계 표시** — 정확한 구간 값은 task.md에 명시되어 있지 않아 균등 3분할로
가정했습니다(아래 "확인 필요" 참고):
- `ratio < 1/3` → "관련 증상 낮음"
- `1/3 ≤ ratio < 2/3` → "보통"
- `ratio ≥ 2/3` → "뚜렷함"

숫자(ratio)는 내부 저장만 하고 환자 대상 화면(원장실 결과 표시, 공유링크)에는 항상 위 3단계
라벨만 노출합니다.

**후보(candidate) 선정**(task2.md 결정사항 4, HRV 코멘트 연동에 사용) — 전체 카테고리 중 최고
ratio를 찾아, 그 값이 0이면 후보 없음("특이 증상 확인되지 않음"), 0보다 크면 그 최고값과 동일한
ratio를 가진 카테고리 전부를 `isCandidate=true`로 병렬 표시(억지로 1개만 뽑지 않음).

### "최신 응답 = 현재 기준" + 월별 갱신 규칙

`TcmChecklistResponse.findFirst({ where: { patientId }, orderBy: { createdAt: "desc" } })`로
최신 응답을 가져옵니다. 제출 시:
1. 환자의 최신 응답을 조회
2. 그 응답의 `createdAt`이 **오늘과 같은 연-월**이면 → 그 응답의 `answers`/`categoryScores`를
   전부 지우고 새로 채운 뒤 `updatedAt`만 갱신(UPDATE, task2.md 결정사항 5)
3. 없거나 다른 연-월이면 → 새 `TcmChecklistResponse` 행 INSERT(새 이력)

### HRV AI 코멘트 연동 설계 (이번 라운드 구현 범위)

- `hrv.ts`의 `tryGenerateHrvCommentary`에서 환자의 최신 `TcmChecklistResponse` +
  `categoryScores`(isCandidate=true인 것만) + 해당 `TcmCategory.treatmentPrinciple`을 함께 조회.
- `HrvExplanationInput`에 `tcmCategoryProfile: { patientLabel: string; treatmentPrinciple: string
  | null }[] | null` 필드 추가(후보가 하나도 없으면 `null` — 이 경우 **기존 자유텍스트
  `tcmPatternMap` 방식이 그대로 동작**, 병행 원칙 유지).
- 시스템 프롬프트(3단계 한의학적 해석)에 분기 추가: `tcmCategoryProfile`이 주어지면 이걸
  우선 근거로 쓰고, 기기 수치 기반 판단(자율신경균형도 등)보다 신뢰도 높은 안정적 데이터이므로
  좀 더 적극적인 어조 허용(task.md 배경 원장 판단 반영) — 단 `treatmentPrinciple`이 `null`인
  카테고리는 그 카테고리명/신호만 언급하고 구체적 치료방향은 절대 창작하지 않음.
- 기존 `violatesPatternNameRule`과 유사한 코드 가드 신규 추가: `tcmCategoryProfile`이 주어졌을
  때 AI가 그 안에 없는 카테고리명을 언급하거나, `treatmentPrinciple`이 null인데도 구체적
  치료법을 언급하면 위반으로 보고 재시도.

---

## 공유링크 4번째 섹션 — 확정 사항 반영

- 순서: 검사결과 → **상담설문(신규)** → 프로그램티칭 → 이벤트(task2.md 결정사항 3)
- 노출: 자동 노출, 단 응답이 1건 이상 있을 때만(task2.md 결정사항 2) — `ShareLinkPanel.tsx`의
  기존 3축(teaching/event/exam) 선택 UI는 **건드리지 않습니다**(옵트인 체크박스 불필요, 조합
  맵도 그대로 8가지 유지).
- **쓰기 지원**: 최신 task.md 검증체크리스트가 "공유링크에서 환자가 직접 응답 입력 가능"을
  명시하므로, 응답이 없을 때는 작성 폼을, 있을 때는 3단계 요약을 보여주고 재작성도 지원합니다
  (비인증 제출은 `event-cta-click`과 동일하게 서버가 token→patientId를 직접 해석).

## 관리자 입력 화면 — 확정 사항 반영

`/settings/exam-guides`에 탭 하나 추가("증상 패턴 프로필") — 기존 "학술 근거" 탭과 나란히.
7개 카테고리를 목록으로 보여주고(카테고리명/문항은 읽기 전용, 이번 라운드는 문항 수정 UI
없음 — task.md가 문항 문구를 확정했고 "임의 수정 금지"라고 했으므로), `treatmentPrinciple`
텍스트만 원장이 입력/수정할 수 있게 합니다.

---

## 확인이 필요한 점 (구현 진행하되, 아래는 최선의 가정으로 처리하고 보고합니다)

task.md가 대부분을 확정해줘서 이번엔 "구현을 막는" 수준의 질문은 없습니다. 다만 명시되지
않아 제가 가정하고 진행하는 부분을 투명하게 남깁니다 — 원하시면 언제든 조정 요청해주세요:

1. **3단계 표시 구간 값**을 균등 3분할(1/3, 2/3)로 가정했습니다. 임상적으로 다른 컷오프
   (예: 0%면 무조건 낮음, 50%부터 뚜렷함 등)를 원하시면 `src/lib/tcm-checklist.ts`의
   `tierLabel()` 함수 숫자만 바꾸면 됩니다.
2. **공유링크에서 재작성 허용 여부** — 이미 이번 달 응답이 있어도 공유링크에서 환자가 다시
   체크하면 원장실 제출과 동일하게 "같은 달이면 덮어쓰기" 규칙을 그대로 적용합니다(별도
   잠금 없음).
3. **PHLEGM_DAMPNESS/BLOOD_DEFICIENCY/BLOOD_STASIS는 1문항뿐**이라 그 카테고리는 사실상
   0점/2점(비율 0%/100%) 둘 중 하나만 나옵니다(1점=50%는 나올 수 있음: 없다=0, 경미=1(50%),
   심하다=2(100%)). 문항 수가 다른 카테고리와 비교 시 이 비대칭은 task.md가 이미 정한 문항
   구성 그대로 반영한 것이라 별도 보정 로직은 넣지 않았습니다.

---

**진행**: 위 가정대로 실제 마이그레이션 + UI + HRV 연동 구현을 시작합니다.
