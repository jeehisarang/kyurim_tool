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
export async function createWorkTask(input: {
  title: string;
  description?: string;
  creatorId: number;
  assigneeId?: number;
  isSharedTask?: boolean;
  dueDate: Date | null;
}) {
  const isSharedTask = input.isSharedTask ?? false;
  const assigneeId = isSharedTask ? undefined : input.assigneeId;

  const todoTask = await prisma.todoTask.create({
    data: {
      taskType: WORK_TASK_TYPE,
      dueDate: input.dueDate,
      staffUserId: isSharedTask ? null : (assigneeId ?? input.creatorId),
    },
  });

  const workTask = await prisma.workTask.create({
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

  await logActivity({
    actorType: "STAFF",
    actorId: input.creatorId,
    actionType: "WORK_CREATE",
    label: `${workTask.creator.name}님이 업무를 등록했습니다: ${workTask.title}`,
  });

  return workTask;
}

// 업무 완료 처리 + 활동피드 기록을 한 곳에 묶는다 — /api/todo-tasks/[id] PATCH가 이 함수를
// 호출한다(기존에는 그 라우트가 직접 prisma.todoTask.update만 호출해 로그가 없었음).
export async function completeWorkTask(todoTaskId: number, doneByUserId: number) {
  const [workTask, doneByUser] = await Promise.all([
    prisma.workTask.findUniqueOrThrow({ where: { todoTaskId } }),
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
    label: `${doneByUser.name}님이 업무를 완료했습니다: ${workTask.title}`,
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
export async function deleteWorkTask(todoTaskId: number) {
  const existing = await prisma.workTask.findUniqueOrThrow({ where: { todoTaskId } });
  await prisma.workTask.delete({ where: { id: existing.id } });
  await prisma.todoTask.delete({ where: { id: todoTaskId } });
}
