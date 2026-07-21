import { prisma } from "@/lib/db";
import { EXAM_REMINDER_TASK_TYPE } from "@/lib/task-types";

// 검사 해피톡(task.md) — 인바디/근력/HRV 전부 종류 무관 1달(calendar month) 주기.
// 1달 되기 정확히 당일이 아니라 기존 처방 해피톡 원칙과 일관되게 며칠 전에 "오늘 할 일"에
// 노출한다.
export const EXAM_REMINDER_LEAD_DAYS = 2;

export type ExamReminderExamType = "BODY_COMPOSITION" | "STRENGTH_TEST" | "HRV";

// exam-types.ts(EXAM_TYPE_LABEL)와 동일한 값 — 검사기록 examType 그대로 재사용(task.md 지시).
export const EXAM_REMINDER_TYPE_LABEL: Record<ExamReminderExamType, string> = {
  BODY_COMPOSITION: "인바디",
  STRENGTH_TEST: "근력검사",
  HRV: "자율신경맥파(HRV)",
};

export function isExamReminderExamType(value: string): value is ExamReminderExamType {
  return value === "BODY_COMPOSITION" || value === "STRENGTH_TEST" || value === "HRV";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 달 끝 엣지케이스(예: 1/31 + 1개월)를 자연 처리한다 — JS Date의 기본 setMonth 롤오버(1/31 +
// 1개월 → 3/3)를 피하려고, 대상 월의 실제 일수로 day를 clamp한다(1/31 → 2/28 또는 2/29).
function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const targetFirst = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  return new Date(targetFirst.getFullYear(), targetFirst.getMonth(), Math.min(day, daysInTargetMonth));
}

/**
 * 검사 등록 성공 직후 각 검사 등록 함수(createBodyCompositionRecord/createStrengthTestRecord/
 * createHrvTestRecord)가 호출한다 — 환자+검사종류(patientId, examType) 사이클을 upsert하고,
 * 대기 중이던 이전 리마인더는 완료 처리(superseded)한 뒤 실제 검사일+1개월로 새 리마인더를
 * 만든다. isActive가 꺼진 사이클은 날짜 갱신만 하고 새 리마인더 TodoTask는 만들지 않는다
 * (나중에 다시 켜면 그 시점 최신 검사일 기준으로 이어서 작동하도록).
 * 검사 저장 자체를 막으면 안 되는 부가 기능이라 실패해도 에러를 여기서 삼킨다
 * (logActivity와 동일 원칙).
 */
export async function scheduleNextExamReminder(
  patientId: number,
  examType: ExamReminderExamType,
  examDate: Date,
): Promise<void> {
  try {
    const nextDueDate = startOfDay(addMonths(examDate, 1));

    const cycle = await prisma.examReminderCycle.upsert({
      where: { patientId_examType: { patientId, examType } },
      create: { patientId, examType, lastExamDate: examDate, nextDueDate },
      update: { lastExamDate: examDate, nextDueDate },
    });

    // 재검사가 예정보다 이르든 늦든, 이번 실제 검사일 기준으로 다시 계산된 새 리마인더로
    // 교체한다 — 대기 중(미완료)인 이전 리마인더가 있으면 완료 처리.
    await prisma.todoTask.updateMany({
      where: { examReminderCycleId: cycle.id, isDone: false },
      data: { isDone: true, doneAt: new Date() },
    });

    if (!cycle.isActive) return;

    await prisma.todoTask.create({
      data: {
        taskType: EXAM_REMINDER_TASK_TYPE,
        patientId,
        dueDate: startOfDay(addDays(nextDueDate, -EXAM_REMINDER_LEAD_DAYS)),
        staffUserId: null,
        examReminderCycleId: cycle.id,
      },
    });
  } catch (err) {
    console.error("[exam-reminders] 리마인더 생성 실패:", err);
  }
}

export type ExamReminderCycleView = {
  examType: ExamReminderExamType;
  isActive: boolean;
  lastExamDate: string;
  nextDueDate: string;
};

// 환자 프로필 화면(/patients/[patientId])의 온/오프 토글 렌더링용 — 아직 한 번도 검사를
// 받지 않은 검사종류는 사이클 자체가 없어 목록에 나타나지 않는다(끌 리마인더가 아직 없음).
export async function listExamReminderCyclesForPatient(patientId: number): Promise<ExamReminderCycleView[]> {
  const cycles = await prisma.examReminderCycle.findMany({ where: { patientId } });
  return cycles.map((c) => ({
    examType: c.examType as ExamReminderExamType,
    isActive: c.isActive,
    lastExamDate: c.lastExamDate.toISOString(),
    nextDueDate: c.nextDueDate.toISOString(),
  }));
}

// 원장 전용 온/오프 토글(task.md) — 끄면 이후 검사 등록 시 새 리마인더 생성만 건너뛴다.
// 이미 대기 중인 리마인더는 그대로 둔다: 이번 회차는 이미 안내가 나간 상태라 갑자기
// 취소하면 오히려 어색하고, 다음 검사 등록 시점부터 자연스럽게 반복이 멈추는 편이 낫다고
// 판단했다(settings/programs의 isActive 토글과 동일하게 "새로 생성되는 것"만 막는 원칙).
export async function setExamReminderCycleActive(
  patientId: number,
  examType: ExamReminderExamType,
  isActive: boolean,
): Promise<void> {
  await prisma.examReminderCycle.update({
    where: { patientId_examType: { patientId, examType } },
    data: { isActive },
  });
}

// /api/todo-tasks/[id] PATCH 전용 — WORK의 completeWorkTask와 동일하게 단순 체크형 완료
// 처리만 한다(별도 완료 로그 테이블 없음). 자동 반복 리마인더라 "실시간 활동피드"까지 남기면
// 매달 같은 문구가 반복돼 피드가 시끄러워지므로 로그는 남기지 않는다(WORK_COMPLETE와의
// 의도적 차이).
export async function completeExamReminderTask(todoTaskId: number, doneByUserId: number): Promise<void> {
  await prisma.todoTask.update({
    where: { id: todoTaskId },
    data: { isDone: true, doneByUserId, doneAt: new Date() },
  });
}
