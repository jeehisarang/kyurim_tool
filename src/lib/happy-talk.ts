import { prisma } from "@/lib/db";

// 해피톡(처방주기 안내, task.md/13-5) — SPLIT(분할처방) 프로그램의 다음 처방일(NEXT_DOSE
// TodoTask.dueDate)이 임박한 환자를 톡생성기 "환자별 톡 관리"에 노출한다. 정확히 당일이
// 아니라 며칠 전부터 미리 보여준다(EXAM_REMINDER_LEAD_DAYS와 동일한 "며칠 전" 원칙 —
// exam-reminders.ts 참고, 다만 값 자체는 검사 해피톡과 별개로 관리).
export const HAPPY_TALK_LEAD_DAYS = 2;
export const HAPPY_TALK_TASK_TYPE = "NEXT_DOSE";
const PROGRAM_TYPE_SPLIT = "SPLIT";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

type StaffUserLite = { id: number; name: string; role: string };

export type HappyTalkCandidate = {
  id: number;
  taskType: string;
  dueDate: string;
  patient: { id: number; name: string; chartNumber: string };
  program: { id: number; name: string };
  sourceLabel: string;
  // 남은 차수(현재 회차 포함) — totalRounds/currentRound 둘 다 있을 때만 계산.
  remainingRounds: number | null;
  staffUser: null;
  isDone: boolean;
  doneByUser: StaffUserLite | null;
  skippedAt: string | null;
  skippedByUser: StaffUserLite | null;
  draftContent: string | null;
  internalAnalysis: string | null;
};

/**
 * 톡생성기 "환자별 톡 관리"(TalkGroupManager) 전용 — 해당 환자의 NEXT_DOSE TodoTask 중
 * dueDate가 referenceDate+HAPPY_TALK_LEAD_DAYS 이내(이미 지난 것 포함)인 것만 후보로
 * 반환한다. "다음 처방일 자동계산" 로직(prescriptions.ts computeSplitSchedule/
 * completeTodoTask)이 이미 만들어둔 dueDate를 그대로 재사용할 뿐, 날짜를 다시 계산하지
 * 않는다(task.md 지시). isDone(오늘 할 일 "체크" 상태)이 true인 회차는 이미 완료되어
 * 다음 회차 TodoTask로 넘어갔으므로 대상에서 제외한다 — 단, 여기서 말하는 발송확인
 * 여부(isDone/doneByUser 등 이 함수가 반환하는 필드)는 TodoTask.isDone이 아니라
 * ProgramEventLog(같은 "기존 발송상태 관리 구조"를 TRIAL_*과 공유)를 진실원천으로 쓴다 —
 * "오늘 할 일" 체크와 톡생성기 발송확인이 서로 독립적으로 동작해야 한다는 task.md 요구사항
 * 그대로.
 */
export async function listHappyTalkCandidates(
  patientId: number,
  referenceDate: Date,
): Promise<HappyTalkCandidate[]> {
  const windowEnd = endOfDay(addDays(referenceDate, HAPPY_TALK_LEAD_DAYS));

  const tasks = await prisma.todoTask.findMany({
    where: {
      taskType: HAPPY_TALK_TASK_TYPE,
      isDone: false,
      dueDate: { lt: windowEnd },
      prescription: { patientId, program: { type: PROGRAM_TYPE_SPLIT } },
    },
    include: { prescription: { include: { patient: true, program: true } } },
    orderBy: { dueDate: "asc" },
  });
  if (tasks.length === 0) return [];

  const logs = await prisma.programEventLog.findMany({
    where: { todoTaskId: { in: tasks.map((t) => t.id) } },
    include: { staffUser: true, skippedByUser: true },
  });
  const logByTaskId = new Map(logs.map((l) => [l.todoTaskId, l]));

  return tasks
    .filter((t): t is typeof t & { prescription: NonNullable<typeof t.prescription>; dueDate: Date } =>
      t.prescription !== null && t.dueDate !== null,
    )
    .map((t) => {
      const { prescription } = t;
      const log = logByTaskId.get(t.id) ?? null;
      const isDone = log?.sentDate != null;
      const remainingRounds =
        prescription.totalRounds != null && prescription.currentRound != null
          ? prescription.totalRounds - prescription.currentRound + 1
          : null;

      return {
        id: t.id,
        taskType: t.taskType,
        dueDate: t.dueDate.toISOString(),
        patient: {
          id: prescription.patient.id,
          name: prescription.patient.name,
          chartNumber: prescription.patient.chartNumber,
        },
        program: { id: prescription.program.id, name: prescription.program.name },
        sourceLabel: prescription.program.name,
        remainingRounds,
        staffUser: null,
        isDone,
        doneByUser: isDone ? log!.staffUser : null,
        skippedAt: isDone ? null : (log?.skippedAt?.toISOString() ?? null),
        skippedByUser: isDone ? null : (log?.skippedByUser ?? null),
        draftContent: log?.patientMessage ?? null,
        internalAnalysis: log?.internalAnalysis ?? null,
      };
    });
}
