import { NextResponse } from "next/server";
import { createWorkTask } from "@/lib/work-tasks";

// 마감일은 examDate/visitDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱)을
// 따르되, 업무는 소급이 아니라 앞으로의 마감을 정하는 값이라 미래 날짜 제한은 없다.
function parseDueDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, description, creatorId, assigneeId, isSharedTask, dueDate: dueDateInput } = body;

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });
  }
  if (typeof creatorId !== "number") {
    return NextResponse.json({ error: "작성자를 확인할 수 없습니다. 상단에서 현재 사용자를 선택하세요." }, { status: 400 });
  }

  const dueDate = parseDueDate(dueDateInput);
  if (dueDate === undefined) {
    return NextResponse.json({ error: "마감일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const workTask = await createWorkTask({
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : undefined,
    creatorId,
    assigneeId: typeof assigneeId === "number" ? assigneeId : undefined,
    isSharedTask: isSharedTask === true,
    dueDate,
  });

  return NextResponse.json(workTask, { status: 201 });
}
