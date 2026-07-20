import { prisma } from "@/lib/db";

// 증상 패턴 프로필(task.md) — HRV 등 검사와 별개로 환자에 종속된 독립 상담 체크리스트.
// 3단계(없다/경미하다/심하다 = 0/1/2) 응답을 카테고리별로 집계해 비율(ratio)로 저장하고,
// 환자 노출용으로는 항상 3단계 라벨(낮음/보통/뚜렷함)로만 변환해서 보여준다 — 내부 ratio
// 숫자를 환자 화면에 그대로 노출하지 않는다(task.md 지시).

export type AnswerInput = { questionId: number; score: 0 | 1 | 2 };

// 원장실(POST /api/consultation-survey)/공유링크(POST /api/share-links/[token]/consultation-survey)
// 양쪽 제출 API가 동일하게 쓰는 입력 검증 — 둘 다 같은 형식(questionId: number, score: 0|1|2 배열)을 받는다.
export function isValidAnswerArray(value: unknown): value is AnswerInput[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (a) =>
      a !== null &&
      typeof a === "object" &&
      typeof (a as Record<string, unknown>).questionId === "number" &&
      [0, 1, 2].includes((a as Record<string, unknown>).score as number),
  );
}

export type CategoryScoreView = {
  categoryId: number;
  categoryCode: string;
  patientLabel: string;
  treatmentPrinciple: string | null;
  // 위험신호 고정문구(task.md 건강 리포트 리뉴얼) — 원장이 입력 안 했으면 null(카드 숨김).
  redFlagNotice: string | null;
  rawScore: number;
  maxScore: number;
  ratio: number;
  tierLabel: "낮음" | "일부확인" | "뚜렷함";
  isCandidate: boolean;
};

export type ChecklistResponseView = {
  id: number;
  patientId: number;
  source: string;
  otherSymptomsText: string | null;
  createdAt: Date;
  updatedAt: Date;
  categoryScores: CategoryScoreView[];
};

// 3단계 표시 구간 — task.md에 정확한 컷오프가 명시되지 않아 균등 3분할로 가정한다
// (schema-proposal-v2.md "확인이 필요한 점" 1번 — 조정 필요하면 이 숫자만 바꾸면 된다).
// 3단계 표시 컷오프(원장 확인, task.md) — 0%는 낮음, 1~50%는 일부확인, 51~100%는 뚜렷함.
function tierLabel(ratio: number): "낮음" | "일부확인" | "뚜렷함" {
  if (ratio <= 0) return "낮음";
  if (ratio <= 0.5) return "일부확인";
  return "뚜렷함";
}

/** 관리자 화면(설정)/체크리스트 폼 렌더링용 — 활성 카테고리 + 문항을 순서대로 반환한다. */
export async function listActiveCategoriesWithQuestions() {
  return prisma.tcmCategory.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      questions: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
    },
  });
}

/** 관리자 화면(설정) 전용 — 카테고리 전체(비활성 포함 안 함)를 치료원칙 편집용으로 반환한다. */
export async function listCategoriesForAdmin() {
  return prisma.tcmCategory.findMany({
    orderBy: { displayOrder: "asc" },
    include: { questions: { orderBy: { displayOrder: "asc" } } },
  });
}

/** /settings/exam-guides 확장 탭에서 치료원칙만 수정한다(카테고리명/문항은 이번 라운드 수정 대상 아님). */
export async function updateCategoryTreatmentPrinciple(categoryId: number, treatmentPrinciple: string | null) {
  return prisma.tcmCategory.update({
    where: { id: categoryId },
    data: { treatmentPrinciple: treatmentPrinciple?.trim() ? treatmentPrinciple.trim() : null },
  });
}

/** 위험신호(red flag) 고정문구 편집(task.md 건강 리포트 리뉴얼) — treatmentPrinciple과 동일한
 * "원장 직접 입력, AI가 안 만듦" 원칙. 빈 문자열은 null(카드 숨김)로 정규화한다. */
export async function updateCategoryRedFlagNotice(categoryId: number, redFlagNotice: string | null) {
  return prisma.tcmCategory.update({
    where: { id: categoryId },
    data: { redFlagNotice: redFlagNotice?.trim() ? redFlagNotice.trim() : null },
  });
}

// 카테고리별 rawScore/maxScore/ratio 계산 + 동점 병렬 후보 선정(task2.md 결정사항 4) —
// 전체 카테고리 중 최고 ratio가 0이면 후보 없음, 0보다 크면 그 최고값과 동률인 카테고리 전부를
// 후보로 삼는다(억지로 1개만 뽑지 않음). "그외"(OTHER)는 문항이 없어 계산 대상에서 자연히 제외된다.
function computeCategoryScores(
  categories: {
    id: number;
    categoryCode: string;
    patientLabel: string;
    treatmentPrinciple: string | null;
    redFlagNotice: string | null;
    questions: { id: number }[];
  }[],
  answers: AnswerInput[],
): Omit<CategoryScoreView, "isCandidate">[] {
  const scoreByQuestionId = new Map(answers.map((a) => [a.questionId, a.score]));

  return categories
    .filter((c) => c.questions.length > 0)
    .map((category) => {
      const rawScore = category.questions.reduce((sum, q) => sum + (scoreByQuestionId.get(q.id) ?? 0), 0);
      const maxScore = category.questions.length * 2;
      const ratio = maxScore > 0 ? rawScore / maxScore : 0;
      return {
        categoryId: category.id,
        categoryCode: category.categoryCode,
        patientLabel: category.patientLabel,
        treatmentPrinciple: category.treatmentPrinciple,
        redFlagNotice: category.redFlagNotice,
        rawScore,
        maxScore,
        ratio,
        tierLabel: tierLabel(ratio),
      };
    });
}

function markCandidates(scores: Omit<CategoryScoreView, "isCandidate">[]): CategoryScoreView[] {
  const maxRatio = scores.reduce((max, s) => Math.max(max, s.ratio), 0);
  return scores.map((s) => ({ ...s, isCandidate: maxRatio > 0 && s.ratio === maxRatio }));
}

export type SubmitChecklistInput = {
  patientId: number;
  source: "IN_CLINIC" | "SHARE_LINK";
  shareLinkId?: number | null;
  submittedByStaffId?: number | null;
  otherSymptomsText?: string | null;
  answers: AnswerInput[];
};

// 같은 달력월(서버 로컬 시각 기준) 안에서 재작성하면 기존 응답을 덮어쓰고(UPDATE), 달이
// 바뀌면 새 이력으로 추가한다(task2.md 결정사항 5). 판단 기준은 환자의 "가장 최근 응답"의
// createdAt 연-월이며, UPDATE 시에도 createdAt은 그대로 두고(그 달의 첫 작성 시점) updatedAt만
// 갱신한다 — 이력 조회 시 "몇 월 응답인지"가 createdAt 기준으로 안정적으로 유지되게 하기 위함.
export async function submitChecklistResponse(input: SubmitChecklistInput): Promise<ChecklistResponseView> {
  const categories = await listActiveCategoriesWithQuestions();
  const scores = markCandidates(computeCategoryScores(categories, input.answers));

  const latest = await prisma.tcmChecklistResponse.findFirst({
    where: { patientId: input.patientId },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const sameMonth =
    latest !== null &&
    latest.createdAt.getFullYear() === now.getFullYear() &&
    latest.createdAt.getMonth() === now.getMonth();

  const responseId = await prisma.$transaction(async (tx) => {
    let response: { id: number };
    if (sameMonth && latest) {
      await tx.tcmChecklistAnswer.deleteMany({ where: { responseId: latest.id } });
      await tx.tcmCategoryScore.deleteMany({ where: { responseId: latest.id } });
      response = await tx.tcmChecklistResponse.update({
        where: { id: latest.id },
        data: {
          source: input.source,
          shareLinkId: input.shareLinkId ?? null,
          submittedByStaffId: input.submittedByStaffId ?? null,
          otherSymptomsText: input.otherSymptomsText?.trim() ? input.otherSymptomsText.trim() : null,
        },
      });
    } else {
      response = await tx.tcmChecklistResponse.create({
        data: {
          patientId: input.patientId,
          source: input.source,
          shareLinkId: input.shareLinkId ?? null,
          submittedByStaffId: input.submittedByStaffId ?? null,
          otherSymptomsText: input.otherSymptomsText?.trim() ? input.otherSymptomsText.trim() : null,
        },
      });
    }

    await tx.tcmChecklistAnswer.createMany({
      data: input.answers.map((a) => ({ responseId: response.id, questionId: a.questionId, score: a.score })),
    });
    await tx.tcmCategoryScore.createMany({
      data: scores.map((s) => ({
        responseId: response.id,
        categoryId: s.categoryId,
        rawScore: s.rawScore,
        maxScore: s.maxScore,
        ratio: s.ratio,
        isCandidate: s.isCandidate,
      })),
    });

    return response.id;
  });

  const saved = await prisma.tcmChecklistResponse.findUniqueOrThrow({ where: { id: responseId } });
  return { ...saved, categoryScores: scores };
}

/** "최신 응답 = 현재 기준" 조회 — 없으면 null. */
export async function getLatestChecklistResponse(patientId: number): Promise<ChecklistResponseView | null> {
  const response = await prisma.tcmChecklistResponse.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: { categoryScores: { include: { category: true } } },
  });
  if (!response) return null;

  const categoryScores: CategoryScoreView[] = response.categoryScores.map((cs) => ({
    categoryId: cs.categoryId,
    categoryCode: cs.category.categoryCode,
    patientLabel: cs.category.patientLabel,
    treatmentPrinciple: cs.category.treatmentPrinciple,
    redFlagNotice: cs.category.redFlagNotice,
    rawScore: cs.rawScore,
    maxScore: cs.maxScore,
    ratio: cs.ratio,
    tierLabel: tierLabel(cs.ratio),
    isCandidate: cs.isCandidate,
  }));

  return {
    id: response.id,
    patientId: response.patientId,
    source: response.source,
    otherSymptomsText: response.otherSymptomsText,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    categoryScores,
  };
}

/** 원장실 이력 화면용 — 오래된 순서 반대로, 전체 이력을 요약 형태로 반환한다. */
export async function getChecklistHistory(patientId: number) {
  const responses = await prisma.tcmChecklistResponse.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: { categoryScores: { where: { isCandidate: true }, include: { category: true } } },
  });
  return responses.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    source: r.source,
    candidateLabels: r.categoryScores.map((cs) => cs.category.patientLabel),
  }));
}

/** 이미 답변한 문항을 폼에 프리필하기 위한 questionId->score 맵. 응답이 없으면 빈 맵. */
export async function getLatestAnswerMap(patientId: number): Promise<Map<number, 0 | 1 | 2>> {
  const latest = await prisma.tcmChecklistResponse.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: { answers: true },
  });
  if (!latest) return new Map();
  return new Map(latest.answers.map((a) => [a.questionId, a.score as 0 | 1 | 2]));
}

// HRV AI 코멘트 연동(task.md) — 후보(isCandidate=true) 카테고리만 뽑아 hrv-explanation.ts에
// 넘길 최소 정보로 변환한다. 후보가 하나도 없으면 null을 반환해 호출측이 기존 자유텍스트
// tcmPatternMap 방식으로 자연히 폴백하게 한다(병행 원칙).
export async function getTcmCategoryProfileForAi(
  patientId: number,
): Promise<
  { categoryCode: string; patientLabel: string; treatmentPrinciple: string | null; ratio: number }[] | null
> {
  const latest = await getLatestChecklistResponse(patientId);
  if (!latest) return null;
  const candidates = latest.categoryScores.filter((s) => s.isCandidate);
  if (candidates.length === 0) return null;
  // categoryCode는 hrv-health-report.ts의 고정 키워드 사전(TREATMENT_PRINCIPLE_KEYWORD_
  // GLOSSARY, 현재는 카드 렌더링에 미사용이지만 코드는 남아있음) 조회 키로도 쓰였던 필드.
  // ratio는 카드4 상단 카테고리 점수 시각화(task.md 가독성 개선)에 쓰인다 — 후보는 전부
  // 동점(최대 비율) 병렬 선정이라 여러 개면 값이 서로 같을 수 있다(설계상 정상).
  return candidates.map((c) => ({
    categoryCode: c.categoryCode,
    patientLabel: c.patientLabel,
    treatmentPrinciple: c.treatmentPrinciple,
    ratio: c.ratio,
  }));
}

export type CheckedSymptomItem = { categoryId: number; patientQuestion: string; score: 1 | 2 };

/**
 * 건강 리포트(task.md) 카드2 "내가 선택한 증상" 재료 — 최신 응답에서 후보 카테고리의
 * "경미하다/심하다"(score 1|2) 문항을 원문 그대로 반환한다(AI가 만들지 않음, 지어내거나
 * 왜곡할 위험 차단). 후보가 없으면 빈 배열. 카드2는 후보 카테고리 전부의 체크 문항을
 * 그대로 다 보여준다(카드1 헤드라인의 "카테고리당 1개" 캡과는 별개 — hrv-health-report.ts
 * pickHeadlineSymptoms가 이 목록에서 카테고리별로 골라 뽑는다).
 */
export async function getCandidateCheckedSymptoms(patientId: number): Promise<CheckedSymptomItem[]> {
  const response = await prisma.tcmChecklistResponse.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: {
      answers: { include: { question: true }, orderBy: { question: { displayOrder: "asc" } } },
      categoryScores: { where: { isCandidate: true } },
    },
  });
  if (!response) return [];
  const candidateCategoryIds = new Set(response.categoryScores.map((s) => s.categoryId));
  if (candidateCategoryIds.size === 0) return [];

  return response.answers
    .filter((a) => candidateCategoryIds.has(a.question.categoryId) && a.score >= 1)
    .map((a) => ({ categoryId: a.question.categoryId, patientQuestion: a.question.patientQuestion, score: a.score as 1 | 2 }));
}

export type CandidateCategoryRank = { categoryId: number; ratio: number; rawScore: number };

/**
 * 후보 카테고리의 점수 순위 재료(task.md 정책 변경 2번, 2026-07-18) — 헤드라인이 "카테고리당
 * 1개 문항, 4개 이상이면 점수 상위 3개 카테고리만" 규칙을 적용하려면 순위가 필요하다.
 * 후보는 정의상 전부 동일한 최고 ratio를 공유하므로(markCandidates), ratio가 실질적으로는
 * 전부 동률이다 — rawScore(카테고리 문항 수가 다르면 다를 수 있음)를 2차 기준으로 쓰고,
 * 그래도 동률이면 배열 순서(=displayOrder 순, 삽입 순서 그대로 안정 정렬 유지)가 최종 기준.
 */
export async function getCandidateCategoryRanks(patientId: number): Promise<CandidateCategoryRank[]> {
  const latest = await getLatestChecklistResponse(patientId);
  if (!latest) return [];
  return latest.categoryScores
    .filter((s) => s.isCandidate)
    .map((s) => ({ categoryId: s.categoryId, ratio: s.ratio, rawScore: s.rawScore }));
}

/**
 * 건강 리포트(task.md) 카드6 "위험신호 안내" 재료 — 후보 카테고리 중 점수(ratio→rawScore)가
 * 가장 높은 순서로 확인해서 redFlagNotice가 채워진 첫 카테고리의 문구를 반환한다(정책 변경
 * 1번, 2026-07-18 — 이전엔 displayOrder 순이었음). AI가 안 만듦(ensureArrhythmiaNotice와
 * 동일 원칙). 후보가 여러 개고 그중 여럿이 redFlagNotice를 갖고 있어도 이번 버전은 점수
 * 최상위부터 찾은 첫 번째 것만 쓴다(동시에 여러 위험신호를 한 카드에 합치는 UX는 범위 밖).
 */
export async function getRedFlagNoticeForCandidates(patientId: number): Promise<string | null> {
  const latest = await getLatestChecklistResponse(patientId);
  if (!latest) return null;
  const candidates = latest.categoryScores.filter((s) => s.isCandidate);
  const ranked = [...candidates].sort((a, b) => b.ratio - a.ratio || b.rawScore - a.rawScore);
  const withNotice = ranked.find((s) => s.redFlagNotice);
  return withNotice?.redFlagNotice ?? null;
}
