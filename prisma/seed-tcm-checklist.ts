import { prisma } from "../src/lib/db";

// task.md 표 그대로 — 문구/카테고리 코드 임의 수정 금지. treatmentPrinciple은 비워둔다
// (원장이 /settings/exam-guides 확장 화면에서 추후 직접 입력).
const CATEGORIES: {
  categoryCode: string;
  patientLabel: string;
  displayOrder: number;
  questions: { questionCode: string; patientQuestion: string; displayOrder: number }[];
}[] = [
  {
    categoryCode: "EMOTION_STAGNATION",
    patientLabel: "스트레스·정서긴장",
    displayOrder: 1,
    questions: [
      { questionCode: "EMOTION_STAGNATION_1", patientQuestion: "가슴이 답답하고 한숨이 잦으신가요?", displayOrder: 1 },
      { questionCode: "EMOTION_STAGNATION_2", patientQuestion: "짜증이나 화, 열감이 갑자기 치밀어 오르시나요?", displayOrder: 2 },
    ],
  },
  {
    categoryCode: "QI_YANG_DEFICIENCY",
    patientLabel: "기력·냉증",
    displayOrder: 2,
    questions: [
      { questionCode: "QI_YANG_DEFICIENCY_1", patientQuestion: "쉽게 피곤하고 기운이 없으신가요?", displayOrder: 1 },
      { questionCode: "QI_YANG_DEFICIENCY_2", patientQuestion: "손발이 차거나 평소 추위를 많이 타시나요?", displayOrder: 2 },
    ],
  },
  {
    categoryCode: "YIN_DRYNESS",
    patientLabel: "열감·건조",
    displayOrder: 3,
    questions: [
      { questionCode: "YIN_DRYNESS_1", patientQuestion: "입이 자주 마르고 손발이나 가슴에 열감이 있으신가요?", displayOrder: 1 },
      { questionCode: "YIN_DRYNESS_2", patientQuestion: "밤에 잠이 얕거나 식은땀이 나시나요?", displayOrder: 2 },
    ],
  },
  {
    categoryCode: "DIGESTIVE",
    patientLabel: "소화기",
    displayOrder: 4,
    questions: [
      { questionCode: "DIGESTIVE_1", patientQuestion: "속이 더부룩하고 소화가 잘 안 되시나요?", displayOrder: 1 },
      { questionCode: "DIGESTIVE_2", patientQuestion: "대변이 무르거나 변비가 있으신가요?", displayOrder: 2 },
    ],
  },
  {
    categoryCode: "PHLEGM_DAMPNESS",
    patientLabel: "담습·부종",
    displayOrder: 5,
    questions: [
      { questionCode: "PHLEGM_DAMPNESS_1", patientQuestion: "몸이나 머리가 무겁고 개운하지 않으신가요?", displayOrder: 1 },
    ],
  },
  {
    categoryCode: "BLOOD_DEFICIENCY",
    patientLabel: "혈허 경향",
    displayOrder: 6,
    questions: [
      { questionCode: "BLOOD_DEFICIENCY_1", patientQuestion: "어지럽거나 안색이 창백하다는 말을 들으시나요?", displayOrder: 1 },
    ],
  },
  {
    categoryCode: "BLOOD_STASIS",
    patientLabel: "순환·어혈",
    displayOrder: 7,
    questions: [
      { questionCode: "BLOOD_STASIS_1", patientQuestion: "아픈 부위가 일정하고 찌르듯 아프신가요?", displayOrder: 1 },
    ],
  },
  {
    // "그외" — 문항 없이 카테고리만 존재(자유기록 전용, otherSymptomsText로 별도 수집).
    categoryCode: "OTHER",
    patientLabel: "그외",
    displayOrder: 8,
    questions: [],
  },
];

async function main() {
  for (const cat of CATEGORIES) {
    const category = await prisma.tcmCategory.upsert({
      where: { categoryCode: cat.categoryCode },
      update: { patientLabel: cat.patientLabel, displayOrder: cat.displayOrder },
      create: { categoryCode: cat.categoryCode, patientLabel: cat.patientLabel, displayOrder: cat.displayOrder },
    });
    for (const q of cat.questions) {
      await prisma.tcmChecklistQuestion.upsert({
        where: { questionCode: q.questionCode },
        update: { patientQuestion: q.patientQuestion, displayOrder: q.displayOrder, categoryId: category.id },
        create: {
          questionCode: q.questionCode,
          patientQuestion: q.patientQuestion,
          displayOrder: q.displayOrder,
          categoryId: category.id,
        },
      });
    }
  }
  const categoryCount = await prisma.tcmCategory.count();
  const questionCount = await prisma.tcmChecklistQuestion.count();
  console.log(`seeded: ${categoryCount} categories, ${questionCount} questions`);
}

main().finally(() => prisma.$disconnect());
