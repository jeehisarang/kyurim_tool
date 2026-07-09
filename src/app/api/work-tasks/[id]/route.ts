import { NextResponse } from "next/server";
import { updateWorkTask, deleteWorkTask } from "@/lib/work-tasks";

// 마감일은 /api/work-tasks(등록)와 동일한 자정 정규화 원칙, 미래 날짜 제한 없음.
function parseDueDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * 업무 수정. [id]는 WorkTask.id가 아니라 TodoTask.id — 목록 화면(TodoTaskTable)이
 * 이미 갖고 있는 값을 그대로 재사용하기 위함(별도 workTaskId를 새로 내려줄 필요 없음).
 * 권한 체계 없음(누구나 수정 가능) — 이번 단계 의도된 설계.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { title, description, assigneeId, isSharedTask, dueDate: dueDateInput } = body;

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });
  }

  const dueDate = parseDueDate(dueDateInput);
  if (dueDate === undefined) {
    return NextResponse.json({ error: "마감일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const workTask = await updateWorkTask(Number(id), {
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : undefined,
    assigneeId: typeof assigneeId === "number" ? assigneeId : undefined,
    isSharedTask: isSharedTask === true,
    dueDate,
  });

  return NextResponse.json(workTask);
}

// 하드 삭제 — WorkTask + 연결된 TodoTask를 함께 제거한다(검사기록과 동일 원칙).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteWorkTask(Number(id));
  return NextResponse.json({ success: true });
}
