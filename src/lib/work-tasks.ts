import { prisma } from "@/lib/db";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import { logActivity } from "@/lib/activity-log";

/**
 * 업무/요청 등록. TodoTask(taskType='WORK')와 WorkTask 상세를 함께 만든다.
 * - 특정 담당자 지정: TodoTask.staffUserId = assigneeId (기존 "담당자" 필터/컬럼 재사용)
 * - 자율업무(지정 안 함): TodoTask.staffUserId = creatorId (본인 목록에만 노출)
 * - 전체 공통(isSharedTask): assigneeId는 항상 null, TodoTask.staffUserId도 null —
 *   특정 1인 소유가 아니라 모든 직원 화면에 노출돼야 하므로 /api/todo-tasks가
 *   staffUserId 필터와 무관하게(workTask.isSharedTask로) 별도로 포함시킨다.
 */
/**
 * TodoTask + WorkTask 생성(task.md 원자성 수정) — 반드시 하나의 트랜잭션으로 묶는다.
 * 예전에는 두 create를 순차 실행해서, 두 번째(WorkTask)가 실패해도 첫 번째(TodoTask)는
 * 이미 커밋된 채로 남아 "짝 없는 고아 TodoTask"가 생겼다(WorkTask.findUniqueOrThrow가
 * 실패해 체크/삭제도 안 되는 상태로 영구히 남음). 트랜잭션으로 묶으면 어느 한쪽이라도
 * 실패 시 둘 다 롤백되어 고아가 생길 수 없다.
 */
export async function createWorkTask(input: {
  title: string;
  description?: string;
  creatorId: number;
  assigneeId?: number;
  isSharedTask?: boolean;
  dueDate: Date | null;
  // 특정 환자와 연관된 자동생성 업무(예: 프로그램문의/이벤트문의 요청)에서만 채운다 — 직원이 직접
  // 등록하는 일반 업무/요청은 환자와 무관할 수 있어 기존처럼 비워둔다.
  patientId?: number;
}) {
  const isSharedTask = input.isSharedTask ?? false;
  const assigneeId = isSharedTask ? undefined : input.assigneeId;

  const workTask = await prisma.$transaction(async (tx) => {
    const todoTask = await tx.todoTask.create({
      data: {
        taskType: WORK_TASK_TYPE,
        dueDate: input.dueDate,
        staffUserId: isSharedTask ? null : (assigneeId ?? input.creatorId),
        patientId: input.patientId ?? null,
      },
    });

    return tx.workTask.create({
      data: {
        todoTaskId: todoTask.id,
        title: input.title,
        description: input.description,
        creatorId: input.creatorId,
        assigneeId,
        isSharedTask,
      },
      include: { creator: true, assignee: true, todoTask: true },
    });
  });

  await logActivity({
    actorType: "STAFF",
    actorId: input.creatorId,
    actionType: "WORK_CREATE",
    label: `${workTask.creator.name}님이 업무를 등록했습니다: ${workTask.title}`,
  });

  return workTask;
}

/**
 * 업무 완료 처리 + 활동피드 기록을 한 곳에 묶는다 — /api/todo-tasks/[id] PATCH가 이 함수를
 * 호출한다(기존에는 그 라우트가 직접 prisma.todoTask.update만 호출해 로그가 없었음).
 *
 * 고아 TodoTask 방어 처리(task.md) — WorkTask가 없는(트랜잭션 도입 전 생성된) 레코드도
 * 예외를 던지지 않고 그냥 완료 처리한다. 제목 정보가 없어 로그 문구만 다르게 남긴다.
 */
export async function completeWorkTask(todoTaskId: number, doneByUserId: number) {
  const [workTask, doneByUser] = await Promise.all([
    prisma.workTask.findUnique({ where: { todoTaskId } }),
    prisma.staffUser.findUniqueOrThrow({ where: { id: doneByUserId } }),
  ]);

  await prisma.todoTask.update({
    where: { id: todoTaskId },
    data: { isDone: true, doneByUserId, doneAt: new Date() },
  });

  await logActivity({
    actorType: "STAFF",
    actorId: doneByUserId,
    actionType: "WORK_COMPLETE",
    label: workTask
      ? `${doneByUser.name}님이 업무를 완료했습니다: ${workTask.title}`
      : `${doneByUser.name}님이 업무를 완료했습니다(고아 레코드 정리, todoTaskId=${todoTaskId})`,
  });
}

/**
 * 업무 수정. 완료 여부와 무관하게 전부 허용한다(단순한 구조 유지 원칙 — 완료된 항목만
 * 따로 제한할 이유가 없다고 판단). 요청대상 재선택 시 생성과 동일한 규칙을 그대로
 * 적용한다: 전체공통이면 assigneeId/staffUserId 둘 다 null, 특정 담당자면 그 사람,
 * 지정 안 함이면 작성자 본인.
 */
export async function updateWorkTask(
  todoTaskId: number,
  input: {
    title: string;
    description?: string;
    assigneeId?: number;
    isSharedTask?: boolean;
    dueDate: Date | null;
  },
) {
  const existing = await prisma.workTask.findUniqueOrThrow({ where: { todoTaskId } });
  const isSharedTask = input.isSharedTask ?? false;
  const assigneeId = isSharedTask ? undefined : input.assigneeId;

  await prisma.todoTask.update({
    where: { id: todoTaskId },
    data: {
      dueDate: input.dueDate,
      staffUserId: isSharedTask ? null : (assigneeId ?? existing.creatorId),
    },
  });

  return prisma.workTask.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      description: input.description ?? null,
      assigneeId: assigneeId ?? null,
      isSharedTask,
    },
    include: { creator: true, assignee: true, todoTask: true },
  });
}

// 검사기록과 동일하게 하위 참조 테이블이 없어 하드 삭제한다(소프트삭제 불필요).
// WorkTask.todoTaskId가 TodoTask를 참조하므로 자식(WorkTask)을 먼저 지운다.
//
// 고아 TodoTask 방어 처리(task.md) — WorkTask가 없으면 그 삭제 단계만 건너뛰고
// TodoTask는 그대로 삭제한다(예전엔 findUniqueOrThrow가 여기서 던져 TodoTask 삭제까지
// 도달하지 못해 고아가 영구히 안 지워졌음).
export async function deleteWorkTask(todoTaskId: number) {
  const existing = await prisma.workTask.findUnique({ where: { todoTaskId } });
  if (existing) {
    await prisma.workTask.delete({ where: { id: existing.id } });
  }
  await prisma.todoTask.delete({ where: { id: todoTaskId } });
}
