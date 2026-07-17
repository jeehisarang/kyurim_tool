# 환자 상담모드 설문(상담설문) — 스키마 설계 v2 (환자 종속, 검사 비종속)

이 문서는 task.md 지시에 따라 **schema-proposal.md(90c7c87)의 "검사 종속" 설계를 "환자 종속"으로
전면 수정**한 v2입니다. 아직 마이그레이션/코드 구현 전이며, 이 대화에서 확인을 받은 뒤 실제
구현으로 넘어갑니다(task.md 명시 지시).

---

## v1 대비 핵심 변경

- `examRecordId`/`examType`(검사기록 연동 필드)를 **완전히 제거**했습니다. 응답은 `patientId`
  하나로만 환자에 연결되고, 특정 HRV/인바디 검사와 무관하게 독립적으로 존재합니다.
- 점수 계산 방식을 "비율"(`checkedCount ÷ totalCount`)로 확정했습니다(결정사항 5번).
- `treatmentPrinciple`, `TcmChecklistQuestion.questionText`는 **필드/테이블 구조만 만들고
  값은 비워둡니다**(task.md 3·4번 지시) — 마이그레이션 직후에는 `TcmPattern`/
  `TcmChecklistQuestion` 테이블 자체가 빈 상태입니다.
- 기존 `ExamAcademicGuide.tcmPatternMapJson`은 그대로 유지(병행)합니다 — 코드 변경은
  이번 라운드에서 하지 않지만, 향후 `hrv-explanation.ts` 쪽에서 "상담설문 응답 있으면
  그것 우선, 없으면 기존 자유텍스트 판단 방식 유지"(결정사항 6번)를 구현할 근거가 됩니다.

## 제안 스키마

```prisma
// 변증 1개 = 1행. examType 필드를 v1에서 제거했습니다 — 이 기능 자체가 특정 검사 종류와
// 무관한 "환자의 지속적 증상 프로필"이므로 examType 구분이 의미가 없습니다.
model TcmPattern {
  id                 Int      @id @default(autoincrement())
  name               String   @unique          // 변증명, 예: "간기울결"
  phrase             String                    // AI가 인용할 문구(기존 tcmPatternMapJson의 phrase 역할)
  treatmentPrinciple String?                   // 치료원칙 — 이번 라운드는 null로 비워둠(원장 입력 예정)
  sortOrder          Int      @default(0)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  questions          TcmChecklistQuestion[]
  patternScores      TcmPatternScore[]
}

// 변증 1개에 딸린 체크리스트 문항. 이번 라운드는 테이블만 만들고 실제 row(질문 문장)는
// 하나도 넣지 않습니다(task.md 4번) — 원장 확인 후 다음 라운드에 채웁니다.
model TcmChecklistQuestion {
  id           Int        @id @default(autoincrement())
  patternId    Int
  pattern      TcmPattern @relation(fields: [patternId], references: [id])
  questionText String
  sortOrder    Int        @default(0)
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())

  answers      TcmChecklistAnswer[]

  @@index([patternId])
}

// 상담설문 응답 1건 = 환자가 한 번 설문을 작성한 세션. examRecordId 없음 — patientId만으로 연결.
// 재작성 시 새 행으로 계속 쌓이는 이력 구조(결정사항 2번 "재작성 시 이력으로 누적 보관").
model TcmChecklistResponse {
  id        Int      @id @default(autoincrement())
  patientId Int
  patient   Patient  @relation(fields: [patientId], references: [id])

  source             String            // "IN_CLINIC" | "SHARE_LINK"
  shareLinkId        Int?
  shareLink          PatientShareLink? @relation(fields: [shareLinkId], references: [id])
  submittedByStaffId Int?
  submittedByStaff   StaffUser?        @relation(fields: [submittedByStaffId], references: [id])

  createdAt DateTime @default(now())

  answers       TcmChecklistAnswer[]
  patternScores TcmPatternScore[]

  @@index([patientId])
}

model TcmChecklistAnswer {
  id         Int                  @id @default(autoincrement())
  responseId Int
  response   TcmChecklistResponse @relation(fields: [responseId], references: [id])
  questionId Int
  question   TcmChecklistQuestion @relation(fields: [questionId], references: [id])
  checked    Boolean

  @@unique([responseId, questionId])
}

// 응답 1건에 대한 변증별 점수 — 제출 시점 스냅샷(v1과 동일 원칙 유지, HrvTestRecord의 AI
// 코멘트 캐싱과 같은 이유: 나중에 문항이 바뀌어도 과거 응답의 "그때 결과"가 보존됨).
model TcmPatternScore {
  id           Int                  @id @default(autoincrement())
  responseId   Int
  response     TcmChecklistResponse @relation(fields: [responseId], references: [id])
  patternId    Int
  pattern      TcmPattern           @relation(fields: [patternId], references: [id])
  checkedCount Int
  totalCount   Int
  ratio        Float                // checkedCount / totalCount (결정사항 5번, 비율 방식 확정)
  rank         Int?                 // 1=최종 후보 1순위, 2=2순위(null=후보권 밖)
  isCandidate  Boolean              @default(false)

  @@unique([responseId, patternId])
}
```

기존 모델에 역참조 필드만 추가합니다: `Patient.tcmChecklistResponses`,
`PatientShareLink.tcmChecklistResponses`, `StaffUser.tcmChecklistSubmissions` — 전부 기존
FK 관례 그대로입니다.

### "최신 응답 = 현재 기준" 조회 방식(결정사항 2번)

새 테이블이나 플래그 없이 `TcmChecklistResponse.findFirst({ where: { patientId }, orderBy:
{ createdAt: "desc" } })`로 항상 최신 응답 1건을 가져오면 됩니다. 이력은 전부 보존되고,
"현재값"은 조회 시점에 정렬만으로 결정됩니다(HrvTestRecord 이력 조회와 동일 패턴).

---

## 공유링크 4번째 섹션 — 조사 결과 및 예상 변경 범위

### 현재 구조 (조사 결과)

- `PatientShareLink`는 **환자 1명 + teaching(0/1) + event(0/1) + 검사기록(0~N)** 3개 축을
  독립적으로 조합하는 구조입니다(`src/lib/share-links.ts` `createOrReuseShareLink`).
- 표시 순서(검사결과→티칭→이벤트)는 `src/app/s/[token]/page.tsx`에 **하드코딩된 JSX 순서**로
  고정되어 있고, 각 섹션은 데이터가 있을 때만(`hasExams`/`hasTeaching`/`hasEvent`) 렌더링되며
  섹션 사이 `<hr>` 구분선도 수동으로 조건 처리되어 있습니다.
- 링크 생성 UI(`src/components/ShareLinkPanel.tsx`)는 3축을 각각 체크박스/선택으로 고르고,
  `ShareLinkFlags`(`{hasTeaching, hasEvent, hasExam}`) 조합에 따라 톡 문구 인트로를
  `INTRO_BY_COMBO`라는 **8가지(2³) 조합 고정 문구 맵**에서 골라 씁니다.
- 공개 페이지의 유일한 비인증 쓰기 동작은 "이벤트문의하기" 버튼(`event-cta-click`,
  `event-consult-request`) — `patientId`를 클라이언트가 아니라 `token → PatientShareLink.patientId`
  서버 조회로 해석합니다(클라이언트 신뢰 안 함). 상담설문 제출도 동일 원칙을 따라야 합니다.

### 예상 변경 파일 목록

| 파일 | 변경 내용(예상) |
|---|---|
| `prisma/schema.prisma` | 위 5개 테이블 신규 + `Patient`/`PatientShareLink`/`StaffUser` 역참조 추가. `PatientShareLink`에 "이 링크가 상담설문 섹션을 포함하는지" 여부 필드 추가 여부는 **미결정**(아래 질문 참고) |
| `src/lib/share-links.ts` | `CreateShareLinkInput`에 4번째 축 추가, `createOrReuseShareLink` 중복 판정 키에 반영, `getShareLinkByToken`이 환자의 최신 `TcmChecklistResponse`(+ 필요 시 문항/변증 목록)를 조회해 `PublicShareLinkView`에 포함 |
| `src/app/api/share-links/route.ts` | POST body에 4번째 축 필드 추가 수신 |
| `src/app/s/[token]/page.tsx` | 4번째 섹션 렌더링 + 순서/구분선 로직에 새 분기 추가(현재 하드코딩 구조라 순서 변경 시 이 파일을 직접 고쳐야 함) |
| 신규 컴포넌트 (예: `src/components/ConsultationSurveySection.tsx`) | 공유링크 화면에서 "이미 답변함" 요약 표시 또는 "아직 안 함" 시 체크리스트 폼 렌더링 |
| 신규 API (예: `src/app/api/share-links/[token]/consultation-survey/route.ts`) | 비인증 제출 — `event-cta-click`과 동일하게 token→patientId 서버 해석, `TcmChecklistResponse` 생성 |
| `src/components/ShareLinkPanel.tsx` | `ShareLinkFlags`를 4축으로 확장(`comboKey`가 2³=8 → 2⁴=16 조합이 됨), `INTRO_BY_COMBO` 맵 확장, 링크 생성 UI에 "상담설문 포함" 체크박스 추가 |
| `src/components/Sidebar.tsx` | `MENU_ITEMS`에 "상담설문" 독립 메뉴 추가 |
| 신규 페이지 (예: `src/app/consultation-survey/page.tsx`) | 원장실 독립 메뉴 진입점 — 환자 검색 후 체크리스트 작성/이력 조회 |
| 신규 API (예: `src/app/api/consultation-survey/route.ts`) | 원장실(인증) 경로 제출/조회 |
| `src/app/examinations/new/page.tsx` | 환자 선택 완료 후 "상담설문 바로가기" 버튼 추가(기존 `?patientId=` 프리필 관례 재사용) |
| (미결정) 신규 관리자 UI | 아래 "애매한 점" 1번 참고 — `TcmPattern`/`TcmChecklistQuestion`/치료원칙을 원장이 입력할 화면이 이번 범위에 없으면, 마이그레이션 후에도 체크리스트가 계속 빈 채로 남습니다 |

---

## 애매한 점 / 추가 확인 필요 사항 (임의로 결정하지 않음)

1. **변증/문항/치료원칙을 원장이 실제로 입력할 화면이 이번 구현 범위에 없습니다.**
   task.md 3·4번은 "값은 채우지 말 것"이라고 했지만, 그 값을 나중에 입력할 **화면 자체**를
   이번에 만들지는 명시돼 있지 않습니다. 기존 `/settings/exam-guides`를 확장해 같은 화면에서
   `TcmPattern`/`TcmChecklistQuestion`도 관리하게 할지, 아니면 완전히 새 관리자 화면
   (`/settings/consultation-survey` 등)을 이번에 함께 만들지 확인 부탁드립니다. 안 만들면
   당장은 DB에 직접 스크립트로 넣는 방법밖에 없습니다.

2. **공유링크 4번째 섹션이 "옵트인"인지 "항상 노출"인지.** 기존 teaching/event/exam은 링크
   생성 시점에 스태프가 명시적으로 골라 담는 방식입니다. 상담설문도 같은 방식(링크 생성 화면에
   체크박스 추가)으로 할지, 아니면 환자별로 항상 붙어있는 섹션이라 모든 링크에 조건 없이
   최신 상태(이미 답변함 요약 또는 미답변 시 작성 폼)를 자동으로 보여줄지 확인이 필요합니다.
   전자면 `PatientShareLink`에 boolean 필드가 하나 더 필요하고, `ShareLinkFlags`/
   `INTRO_BY_COMBO` 조합이 8→16가지로 늘어납니다.

3. **4번째 섹션의 정확한 표시 위치.** "기존 검사결과→프로그램티칭→이벤트 순서에 자연스럽게
   편입"이라고 하셨는데, 정확히 몇 번째 자리인지(맨 앞? 검사결과 바로 뒤? 맨 끝?) 확인
   부탁드립니다.

4. **동점/후보 없음 처리 규칙.** 비율 방식으로 계산했을 때 여러 변증이 동일 비율이면 어떻게
   순위를 매길지, 그리고 모든 변증 비율이 낮아 "후보 자체가 없음"인 경우 AI 코멘트 쪽에
   어떻게 반영할지(현재 방식과 동일하게 "관련 증상 없음"으로 처리하면 될지) 확인이 필요합니다.

5. **원장실 UI에서 이미 이번 달에 작성한 응답이 있을 때 동작.** "월 1회 권장(강제 아님)"이라고
   하셨는데, 이미 이번 달 응답이 있으면 새로 작성 시 "새 이력으로 추가"인지 "기존 응답 수정"인지
   확인 부탁드립니다(제안 스키마는 항상 새 행을 추가하는 이력 구조로 설계했습니다).

6. **공유링크로 제출된 응답의 `submittedByStaffId`.** 공유링크 경로는 스태프가 없으니 당연히
   `null`이 될 텐데, 이 필드를 "누가 스태프 앞에서 태블릿을 조작했는지" 용도로 계속 쓸지,
   아니면 사용하지 않을지(원장실 경로에서도 항상 null로 둘지) 확인 부탁드립니다 — 실사용
   여부에 따라 이 필드 자체를 없앨 수도 있습니다.

---

**다음 단계**: 위 1~6번에 답을 주시면 실제 Prisma 마이그레이션 + 원장실 UI + 공유링크 4번째
섹션 구현으로 진행하겠습니다.
