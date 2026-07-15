import { prisma } from "@/lib/db";

/** 검사종류별 원장 작성 학술 근거 텍스트 조회(task2.md) — 아직 작성 안 됐으면 null. */
export async function getExamAcademicGuide(examType: string) {
  return prisma.examAcademicGuide.findUnique({ where: { examType } });
}

export async function upsertExamAcademicGuide(
  examType: string,
  content: string,
  tcmPatternMapJson?: string | null,
) {
  return prisma.examAcademicGuide.upsert({
    where: { examType },
    update: { content, ...(tcmPatternMapJson !== undefined ? { tcmPatternMapJson } : {}) },
    create: { examType, content, tcmPatternMapJson: tcmPatternMapJson ?? null },
  });
}
