# 변증 체크리스트 기능 — 조사 결과 및 스키마 제안 (1단계, 구현 없음)

이 문서는 task.md 지시에 따라 **조사·설계 제안만** 담고 있습니다. 실제 Prisma 마이그레이션이나
코드 변경은 하지 않았습니다. 아래 "애매한 설계 결정 사항"에 답을 주시면 2단계(실제 구현)로
넘어가겠습니다.

---

## 1. 현재 "한의학적 가능성 매핑표" 실제 스키마

```prisma
model ExamAcademicGuide {
  id                Int      @id @default(autoincrement())
  examType          String   @unique // 현재는 "HRV" 고정값
  content           String
  tcmPatternMapJson String?
  updatedAt         DateTime @updatedAt
}
```

- `tcmPatternMapJson`은 **JSON 문자열 하나**에 배열을 통째로 저장합니다. 다른 테이블에서 이
  테이블을 참조하는 FK는 전혀 없습니다(코드베이스 전체 검색 결과 없음) — `examType` 문자열
  판별자로만 조회합니다.
- 배열 안 엔트리 타입(`/settings/exam-guides` 화면과 완전히 동일):
  ```ts
  type TcmPatternMapEntry = { symptoms: string; pattern: string; phrase: string };
  ```
  현재 저장된 실제 값 예시(5개 항목 중 1개):
  ```json
  { "symptoms": "흉민, 한숨, 예민함, 소화불량, 월경·감정 기복 연관",
    "pattern": "간기울결",
    "phrase": "정서적 긴장과 기의 울체가 동반된 패턴 가능성" }
  ```
  **`symptoms`는 이미 분리된 질문 목록이 아니라, 사람이 읽는 콤마 구분 키워드 나열 문자열
  하나**입니다. 체크리스트 문항으로 쓰려면 이 문자열을 개별 문항으로 쪼개는 편집 작업이
  필요합니다(4번 섹션에서 자세히).
- 원장 전용 편집 화면(`/settings/exam-guides`)은 행 추가/삭제가 되는 리스트 UI이지만, **순서를
  강제하는 정렬 키가 없습니다** — 배열에 넣은 순서 그대로 저장/전송됩니다. 저장 시
  `{symptoms, pattern, phrase}` 셋 중 하나라도 비어있으면 그 행은 조용히 걸러지고 저장되지
  않습니다(부분 입력 방지).
- 저장은 "전체 배열 통째로 교체"(PATCH가 매번 현재 배열 전체를 보냄) 방식이며, 이력(버전)은
  남기지 않습니다.

## 2. 기존 증상 키워드 매칭 로직 요약

**코드 레벨 키워드 매칭은 존재하지 않습니다.** 매핑표 전체가 항상 그대로 AI 프롬프트에
텍스트로 주입되고, "이 환자 증상과 어느 pattern이 관련 있는지"는 **LLM이 자연어로 직접
판단**합니다(`src/lib/hrv-explanation.ts`의 시스템 프롬프트가 "매핑표의 symptoms와 실제로
관련 있는 내용이 확인되면 그 pattern의 phrase를 인용하라"고 지시할 뿐).

코드가 강제하는 것은 **부정형 규칙 1개뿐**입니다(`violatesPatternNameRule`):
```ts
function violatesPatternNameRule(tcmInterpretation, tcmPatternMap, patientSymptomMaterial) {
  if (patientSymptomMaterial !== null) return false; // 증상기록이 있으면 검사 자체를 안 함
  return tcmPatternMap.some(
    (entry) => tcmInterpretation.includes(entry.pattern) || tcmInterpretation.includes(entry.phrase),
  );
}
```
즉 "증상기록이 `null`(하나도 없음)인데 AI가 패턴명을 언급했다"만 코드로 검증 가능하고,
"증상 X가 실제로 pattern Y와 관련 있는가"라는 **긍정 매칭의 정오는 코드로 검증하지 않습니다**
(위반 시 교정 지시로 1회 재시도, 그래도 위반이면 생성 자체를 실패 처리).

`patientSymptomMaterial`(증상기록)은 `hrv.ts`의 `buildPatientSymptomMaterial()`이 매번 3곳에서
조립합니다: `Patient.pastHistory/currentCondition/mainNeeds`(핵심프로필) + 최신
`ConsultationNote`(상담노트) + 최근 `PatientNote` 5건. 이 셋이 전부 비어있을 때만 `null`이
되고, 그 경우에만 위 부정형 규칙이 작동합니다.

**의미**: 지금 방식은 "패턴이 실제로 맞는지"를 매번 AI 판단에 맡기는 확률적 구조입니다.
체크리스트 방식으로 전환하면 이 부분이 "환자가 직접 체크한 결정론적 데이터"로 바뀌므로,
`hrv-explanation.ts`의 프롬프트/부정형 규칙도 함께 손봐야 하는 지점입니다(2단계 구현 범위,
이번엔 설계만).

## 3. 제안 스키마

기존 `tcmPatternMapJson`(불투명 JSON 블롭)은 **개별 문항을 식별하고, 순서를 지정하고, 환자
응답을 문항 단위로 저장**해야 하는 요구사항을 만족할 수 없습니다(JSON 배열 인덱스로 응답을
연결하면 원장이 매핑표를 편집할 때마다 과거 응답의 참조가 깨질 위험이 있습니다). 그래서
정규화된 테이블 신규 도입을 제안합니다. 기존 `ExamAcademicGuide.content`(학술근거 자유 텍스트)는
그대로 두고, `tcmPatternMapJson`을 대체하는 개념으로 아래 5개 테이블을 신규 제안합니다.

```prisma
// 변증 1개 = 1행. 기존 tcmPatternMapJson 배열의 한 엔트리에 대응하되, 치료원칙 필드가 추가됨.
model TcmPattern {
  id                 Int      @id @default(autoincrement())
  examType           String   // 기존 관례 유지, 현재는 "HRV" 고정
  name               String   // 변증명, 예: "간기울결" (기존 pattern)
  phrase             String   // AI가 인용할 문구 (기존 phrase, 그대로 유지)
  treatmentPrinciple String?  // 신규: 치료원칙, 예: "소간이기" — 배경 설명에 예시로 나온 값 하나
                              // 외 나머지 4개 패턴 값은 원장님이 채워야 함(창작 불가)
  sortOrder          Int      @default(0)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  questions          TcmChecklistQuestion[]
  patternScores      TcmPatternScore[]

  @@unique([examType, name])
}

// 변증 1개에 딸린 체크리스트 문항들. 기존 symptoms 문자열("흉민, 한숨, 예민함, ...")을
// 문항 단위로 쪼갠 결과 — 이 분해 작업 자체는 콘텐츠 편집이라 2단계 구현 범위가 아니라
// 원장님(또는 원장님 승인 하 AI 초안)이 채워야 하는 데이터 마이그레이션 작업입니다.
model TcmChecklistQuestion {
  id           Int        @id @default(autoincrement())
  patternId    Int
  pattern      TcmPattern @relation(fields: [patternId], references: [id])
  questionText String     // 예: "가슴이 답답하고 자주 한숨을 쉬시나요?"
  sortOrder    Int        @default(0)
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())

  answers      TcmChecklistAnswer[]

  @@index([patternId])
}

// 체크리스트 응답 1건 = 환자가 한 번 체크리스트를 작성한 세션.
model TcmChecklistResponse {
  id                 Int       @id @default(autoincrement())
  patientId          Int
  patient            Patient   @relation(fields: [patientId], references: [id])

  // 특정 검사기록과 연동(원장실에서 검사와 함께 체크한 경우)할지, 독립 응답(공유링크로 나중에
  // 혼자 체크)일지 — PatientShareLinkExam과 동일한 "examType 문자열 + examRecordId" 관례.
  examType           String?
  examRecordId       Int?

  // 입력 경로 — 원장실 태블릿 vs 공유링크. 같은 저장 구조를 공유하되 이 필드로만 구분(3번
  // 질문 답변 참고).
  source             String    // "IN_CLINIC" | "SHARE_LINK"

  // 공유링크 경로로 들어온 경우 어느 링크였는지(감사 추적 + patientId를 링크에서 서버가
  // 직접 확인하기 위함 — 클라이언트가 보낸 patientId를 신뢰하지 않음, event-cta-click과
  // 동일 원칙).
  shareLinkId        Int?
  shareLink          PatientShareLink? @relation(fields: [shareLinkId], references: [id])

  // 원장실 경로일 때 태블릿을 조작한 직원(환자 본인이 태블릿을 직접 눌렀더라도 "누구 앞에서
  // 진행됐는지" 기록 목적 — ActivityLog의 actorType 패턴과 유사).
  submittedByStaffId Int?
  submittedByStaff   StaffUser? @relation(fields: [submittedByStaffId], references: [id])

  createdAt          DateTime  @default(now())

  answers            TcmChecklistAnswer[]
  patternScores      TcmPatternScore[]

  @@index([patientId])
  @@index([examType, examRecordId])
}

// 응답 1건 안의 문항별 체크 여부 — 문항 FK로 연결(JSON 인덱스 대신 실제 행 참조라 매핑표
// 편집에도 과거 응답이 깨지지 않음).
model TcmChecklistAnswer {
  id         Int                  @id @default(autoincrement())
  responseId Int
  response   TcmChecklistResponse @relation(fields: [responseId], references: [id])
  questionId Int
  question   TcmChecklistQuestion @relation(fields: [questionId], references: [id])
  checked    Boolean

  @@unique([responseId, questionId])
}

// 응답 1건에 대해 변증별로 계산된 점수/후보 여부 — 제출 시점 스냅샷으로 저장할지, 조회 시점에
// 매번 재계산할지는 "애매한 설계 결정 사항" 5번 참고(결정 안 함).
model TcmPatternScore {
  id           Int                  @id @default(autoincrement())
  responseId   Int
  response     TcmChecklistResponse @relation(fields: [responseId], references: [id])
  patternId    Int
  pattern      TcmPattern           @relation(fields: [patternId], references: [id])
  checkedCount Int                  // 체크된 문항 수
  totalCount   Int                  // 그 변증에 속한 전체 문항 수(변증마다 문항 수가 달라 비율
                                     // 계산에 필요 — 5번 질문 참고)
  rank         Int?                 // 1=최종 후보 1순위, 2=2순위(null이면 후보권 밖)
  isCandidate  Boolean              @default(false) // 최종 후보 1~2개로 선정됐는지

  @@unique([responseId, patternId])
}
```

`Patient`/`PatientShareLink`/`StaffUser` 쪽에는 각각 역참조 relation 필드
(`tcmChecklistResponses`, `tcmChecklistResponses`, `tcmChecklistSubmissions` 등)만 추가하면
됩니다 — 기존 FK 컨벤션 그대로입니다.

### 기존 `tcmPatternMapJson`과의 관계

`TcmPattern.phrase`가 기존 `phrase` 필드를 그대로 대체합니다. **`ExamAcademicGuide.tcmPatternMapJson`을
이번에 완전히 대체할지, 과도기 동안 병행할지는 결정하지 않았습니다** — 5번 섹션 질문 참고.
`ExamAcademicGuide.content`(학술근거 자유 텍스트)는 이 기능과 무관하니 그대로 둡니다.

## 4. 원장실 입력 UI ↔ 공유링크 입력 UI — 데이터 구조 공유 가능 여부

**공유 가능하다고 판단합니다.** 두 경로 모두 최종적으로 동일한
`TcmChecklistResponse` + `TcmChecklistAnswer[]` (+ `TcmPatternScore[]`)를 생성하면 되고, 위
스키마의 `source`/`shareLinkId`/`submittedByStaffId` 필드만으로 두 경로를 구분할 수 있습니다.

다만 **인증/신뢰 경계가 다릅니다**(기존 코드베이스 관례를 그대로 따라야 함):
- **원장실 경로**: 스태프가 로그인(localStorage currentUser)한 상태로 특정 환자 화면을 보고
  있으므로 `patientId`를 클라이언트가 그대로 보내도 됩니다(기존 대부분의 스태프 API와 동일).
- **공유링크 경로**: `/s/[token]`은 완전 비인증 화면입니다. 기존 `event-cta-click`/
  `event-consult-request` 엔드포인트와 동일하게, **`patientId`를 클라이언트에서 받지 않고
  서버가 `token → PatientShareLink.patientId`로 직접 해석**해야 합니다(클라이언트가 임의
  환자ID를 보내 다른 환자 데이터를 조작하는 것을 원천 차단). `TcmChecklistResponse.shareLinkId`가
  이 해석 결과를 감사 추적용으로 남기는 역할입니다.

**주의할 점 하나**: 지금 `/s/[token]` 화면은 순수 읽기 전용(이벤트 문의 버튼 클릭 정도만
비인증 쓰기)이고, "이 링크에 체크리스트를 포함할지"를 결정하는 개념 자체가 없습니다
(teachingPage/eventImage처럼 링크 생성 시점에 번들 여부를 정하는 기존 패턴과 달리, 체크리스트는
아직 그런 훅이 없음) — 이것도 5번 질문에 포함했습니다.

## 5. 궁금한 점 / 애매한 설계 결정 사항 (임의로 결정하지 않음)

1. **`symptoms` 문자열 → 개별 문항 분해는 누가/어떻게 하나요?** 지금 5개 변증의 `symptoms`는
   콤마로 묶인 키워드 나열 문자열 하나입니다(예: 간기울결 = "흉민, 한숨, 예민함, 소화불량,
   월경·감정 기복 연관"). 이걸 "가슴이 답답하고 한숨을 자주 쉬시나요?" 같은 질문 문장 여러
   개로 쪼개는 건 콘텐츠 편집 작업입니다 — 원장님이 직접 문항을 새로 쓰실 건지, AI 초안을
   만들어 원장님이 검수하는 방식으로 할지 정해주셔야 2단계 구현 범위(및 UI에 "질문 추가/삭제"
   기능이 필요한지)가 달라집니다.

2. **치료원칙 값 — 배경 설명에 나온 "간기울결→소간이기" 외 나머지 4개 변증(기울화화/심비양허/
   담기울결/화병범주)의 치료원칙은 제가 임의로 채우지 않았습니다.** 이 값들도 원장님이
   `/settings/exam-guides` 확장 화면에서 직접 입력하시는 방식으로 설계하면 될지 확인
   부탁드립니다.

3. **변증별 점수 계산 방식** — 변증마다 문항 수가 다를 수 있는데(예: A변증 5문항, B변증 3문항),
   단순 "체크된 개수"로 비교하면 문항 많은 변증이 유리해집니다. `checkedCount/totalCount` 비율로
   비교할지, 가중치를 문항별로 다르게 둘지, 아니면 다른 방식(예: 특정 핵심 문항 1개만 체크돼도
   그 변증을 후보에 넣는 등)을 원하시는지 임상적 판단이 필요해 결정하지 않았습니다. "최종 후보
   1~2개"를 뽑는 정확한 임계값/동점 처리 규칙도 함께 필요합니다.

4. **응답 스냅샷 vs 실시간 재계산** — `TcmPatternScore`를 응답 제출 시점에 계산해서
   저장(스냅샷)해두면, 나중에 원장님이 매핑표/문항을 수정해도 과거 응답의 점수는 그대로
   남습니다(HrvTestRecord가 AI 코멘트를 생성 시점에 저장해두고 재계산 안 하는 것과 동일 원칙).
   반대로 매번 최신 매핑표 기준으로 재계산하면 항상 최신 로직이 반영되지만 과거 응답의
   "그때 그 결과"가 사라집니다. 어느 쪽을 원하시는지 확인이 필요합니다(제안 스키마는 일단
   스냅샷 저장 구조로 설계했습니다).

5. **`ExamAcademicGuide.tcmPatternMapJson`을 완전히 대체할지, 과도기 동안 병행할지** — 새
   테이블이 생기면 `hrv-explanation.ts`가 참고하는 "매핑표"의 출처가 바뀝니다(현재: AI가 자유
   텍스트에서 패턴을 추론 / 제안: 환자가 체크한 결정론적 후보를 그대로 프롬프트에 꽂아넣기).
   이 전환을 이번 기능과 동시에 할지, 체크리스트 기능만 먼저 만들고 AI 코멘트 연동은 별도
   단계로 나중에 할지 확인 부탁드립니다. (이번 task.md는 "구현 금지"라 실제 프롬프트 변경은
   하지 않았습니다만, 스키마 설계 자체가 이 결정에 영향을 받습니다.)

6. **공유링크에 체크리스트를 포함하는 방법** — 기존 `PatientShareLink`는 teachingPage/eventImage
   처럼 "링크 생성 시점에 무엇을 담을지" 정하는 구조입니다. 체크리스트도 같은 방식(링크 생성 시
   "체크리스트 포함" 토글)으로 할지, 아니면 모든 공유링크에 항상 체크리스트 섹션을 노출하고
   환자가 원할 때만 작성하게 할지 확인이 필요합니다. 전자라면 `PatientShareLink`에 필드/관계가
   하나 더 필요합니다(이번 제안 스키마에는 포함하지 않았습니다).

7. **응답 재제출 허용 여부** — 환자가 체크리스트를 여러 번 작성할 수 있나요(예: 몇 달 뒤 재검사
   때 다시)? 제안 스키마는 `TcmChecklistResponse`를 매번 새 행으로 쌓는 이력 구조로
   설계했는데, "최신 응답만 유효"로 취급할지 "이력 전체를 보여주며 추이 비교"까지 할지에 따라
   조회 API 설계가 달라집니다.

8. **원장실 입력 UI 위치** — HRV 상세 화면(`/examinations/hrv/[id]`)에 새 섹션으로 넣을지,
   검사 등록 화면(`/examinations/new`)에서 검사와 동시에 입력하게 할지 확인 부탁드립니다
   (task.md 배경 설명은 "검사와 함께 그 자리에서"라고 되어 있어 후자에 가까워 보이지만,
   명시적으로 확인하고 싶습니다).

---

**요약**: 실제 구현은 하지 않았고, 위 스키마는 제안일 뿐입니다. 1~8번 질문에 답을 주시면
task2.md 등으로 다음 라운드에 실제 마이그레이션/코드 작업을 진행하겠습니다.
