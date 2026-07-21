import { NextResponse } from "next/server";
import {
  listActiveCategoriesWithQuestions,
  addChecklistQuestion,
  updateChecklistQuestionText,
  softDeleteChecklistQuestion,
} from "@/lib/tcm-checklist";
import { isDirector } from "@/lib/staff-auth";

// 증상 패턴 체크리스트 "질문 관리" 화면(task.md) 전용 API — /api/tcm-categories PATCH와
// 동일한 서버단 재검증 패턴(원장만 쓰기 가능, staffUserId를 body로 받아 매 요청 재확인).
// 카테고리 추가/삭제/이름변경은 범위 밖이라 여기서는 항상 기존 카테고리의 질문만 다룬다.

const MAX_QUESTION_LENGTH = 200;

function normalizeQuestionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_QUESTION_LENGTH) return null;
  return trimmed;
}

// "그외"(OTHER)는 관리 대상 7개 카테고리가 아니다(자유기록 textarea 전용 — addChecklistQuestion
// 주석 참고) — 관리화면에 아예 노출하지 않아 "질문 추가"를 시도할 수조차 없게 한다.
async function listManagedCategories() {
  const categories = await listActiveCategoriesWithQuestions();
  return categories.filter((c) => c.categoryCode !== "OTHER");
}

export async function GET() {
  return NextResponse.json(await listManagedCategories());
}

export async function POST(request: Request) {
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 질문을 추가할 수 있습니다." }, { status: 403 });
  }

  const categoryId = Number(body.categoryId);
  const patientQuestion = normalizeQuestionText(body.patientQuestion);
  if (!categoryId || !patientQuestion) {
    return NextResponse.json({ error: "categoryId/patientQuestion 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await addChecklistQuestion(categoryId, patientQuestion);
  } catch (err) {
    const message = err instanceof Error ? err.message : "질문 추가에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json(await listManagedCategories());
}

export async function PATCH(request: Request) {
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 질문을 수정할 수 있습니다." }, { status: 403 });
  }

  const questionId = Number(body.questionId);
  const patientQuestion = normalizeQuestionText(body.patientQuestion);
  if (!questionId || !patientQuestion) {
    return NextResponse.json({ error: "questionId/patientQuestion 형식이 올바르지 않습니다." }, { status: 400 });
  }

  await updateChecklistQuestionText(questionId, patientQuestion);

  return NextResponse.json(await listManagedCategories());
}

export async function DELETE(request: Request) {
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 질문을 삭제할 수 있습니다." }, { status: 403 });
  }

  const questionId = Number(body.questionId);
  if (!questionId) {
    return NextResponse.json({ error: "questionId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 하드 삭제 아님(소프트 삭제) — 이유는 lib/tcm-checklist.ts의 softDeleteChecklistQuestion 주석 참고.
  await softDeleteChecklistQuestion(questionId);

  return NextResponse.json(await listManagedCategories());
}
