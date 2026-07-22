import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmProgramEvent, skipProgramEvent } from "@/lib/program-events";
import { HAPPY_TALK_TASK_TYPE } from "@/lib/happy-talk";

/**
 * 해피톡(처방주기 안내, task.md/13-5) 전용 발송확인/보류 — 일반 PATCH /api/todo-tasks/[id]와
 * 완전히 분리된 엔드포인트다. NEXT_DOSE는 의도적으로 MESSAGE_TASK_TYPES에 넣지 않았으므로
 * (넣으면 "오늘 할 일" 화면의 체크=회차진행 로직이 completeTodoTask 대신 이쪽으로 갈아타 버림)
 * 일반 PATCH가 NEXT_DOSE를 만나면 여전히 completeTodoTask(회차 진행)로 간다 — 그래서 톡생성기의
 * "발송확인"/"보류"는 이 별도 라우트로 confirmProgramEvent/skipProgramEvent(TRIAL_*과 동일한
 * ProgramEventLog 기반 발송상태 관리 구조)를 직접 호출한다. TodoTask.isDone은 이 라우트가
 * 절대 건드리지 않는다(task.md — "오늘 할 일" 체크와 톡생성기 발송확인은 자동 동기화하지 않음).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const doneByUserId = body.doneByUserId;
  const action = body.action === "SKIPPED" ? "SKIPPED" : "DONE";

  if (typeof doneByUserId !== "number") {
    return NextResponse.json({ error: "체크한 사람을 선택하세요." }, { status: 400 });
  }

  const task = await prisma.todoTask.findUniqueOrThrow({ where: { id: Number(id) } });
  if (task.taskType !== HAPPY_TALK_TASK_TYPE) {
    return NextResponse.json({ error: "해피톡 대상이 아닙니다." }, { status: 400 });
  }

  if (action === "SKIPPED") {
    await skipProgramEvent({ todoTaskId: task.id, staffUserId: doneByUserId });
  } else {
    await confirmProgramEvent({
      todoTaskId: task.id,
      staffUserId: doneByUserId,
      patientMessage: typeof body.patientMessage === "string" ? body.patientMessage : undefined,
      internalAnalysis: typeof body.internalAnalysis === "string" ? body.internalAnalysis : undefined,
    });
  }

  return NextResponse.json({ success: true });
}
