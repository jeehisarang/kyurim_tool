import { prisma } from "@/lib/db";

const PROGRAM_TYPE_FIXED_SEQUENCE_ROW = "FIXED_SEQUENCE";

export type PrescriptionRow = {
  prescriptionId: number;
  patientId: number;
  program: { id: number; name: string; type: string };
  startDate: Date;
  status: string;
  currentRound: number | null;
  totalRounds: number | null;
  completedEventCount: number | null;
  totalEventCount: number | null;
  latestTaskDueDate: Date | null;
  staffUserId: number;
  staffUserName: string;
};

type PrescriptionWithRelationsForRow = {
  id: number;
  patientId: number;
  startDate: Date;
  status: string;
  currentRound: number | null;
  totalRounds: number | null;
  staffUserId: number;
  program: { id: number; name: string; type: string };
  staffUser: { name: string };
  todoTasks: { dueDate: Date | null }[];
};

/**
 * Prescription[] + 관계(program/staffUser/최근 todoTask 1건)를 화면 표시용 PrescriptionRow[]로
 * 변환한다 — /api/prescriptions/list(치료처방 목록)과 /api/patients/[id]/profile(환자
 * 통합뷰)이 공유하는 로직 — 중복 구현 지양.
 * FIXED_SEQUENCE(예: 킬팻캡슐 3일체험)는 currentRound/totalRounds를 안 쓰므로 "N/전체 이벤트
 * 완료" 형태로 진행상태를 따로 계산한다(완료 진실원천은 ProgramEventLog).
 */
export async function buildPrescriptionRows(
  prescriptions: PrescriptionWithRelationsForRow[],
): Promise<PrescriptionRow[]> {
  const fixedSeqPrescriptionIds = prescriptions
    .filter((p) => p.program.type === PROGRAM_TYPE_FIXED_SEQUENCE_ROW)
    .map((p) => p.id);

  const fixedSeqTasks = fixedSeqPrescriptionIds.length
    ? await prisma.todoTask.findMany({
        where: { prescriptionId: { in: fixedSeqPrescriptionIds } },
        include: { eventLog: true },
      })
    : [];

  const eventCountByPrescription = new Map<number, { total: number; done: number }>();
  for (const task of fixedSeqTasks) {
    const key = task.prescriptionId as number;
    const entry = eventCountByPrescription.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (task.eventLog?.sentDate) entry.done += 1;
    eventCountByPrescription.set(key, entry);
  }

  return prescriptions.map((p) => {
    const eventCounts = eventCountByPrescription.get(p.id);
    return {
      prescriptionId: p.id,
      patientId: p.patientId,
      program: { id: p.program.id, name: p.program.name, type: p.program.type },
      startDate: p.startDate,
      status: p.status,
      currentRound: p.currentRound,
      totalRounds: p.totalRounds,
      completedEventCount: eventCounts?.done ?? null,
      totalEventCount: eventCounts?.total ?? null,
      latestTaskDueDate: p.todoTasks[0]?.dueDate ?? null,
      staffUserId: p.staffUserId,
      staffUserName: p.staffUser.name,
    };
  });
}

const PROGRAM_TYPE_SPLIT = "SPLIT";
const PROGRAM_TYPE_FIXED_SEQUENCE = "FIXED_SEQUENCE";
const TASK_TYPE_NEXT_DOSE = "NEXT_DOSE";
const TASK_TYPE_FOLLOW_UP = "FOLLOW_UP";
const STATUS_ACTIVE = "ACTIVE";
const STATUS_COMPLETED = "COMPLETED";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// SPLIT 타입 처방을 과거 startDate로 소급 등록(또는 startDate 수정)할 때, 오늘까지
// 경과한 간격 수만큼 currentRound를 미리 진행시켜서 직원이 지난 라운드를 하나하나
// "완료" 클릭하지 않아도 되게 한다 — 다음 회차 TodoTask 1건만 정확한 예정일로 생성.
// (등록 당일 = referenceDate = startDate인 기존 흐름에서는 elapsedRounds=0이라
// currentRound=1, nextDueDate=start+interval로 기존 동작과 동일하게 귀결된다.)
export function computeSplitSchedule(
  startDate: Date,
  splitIntervalDays: number,
  totalRounds: number,
  referenceDate: Date = new Date(),
): { currentRound: number; nextDueDate: Date | null; isCompleted: boolean } {
  const elapsedDays = Math.floor(
    (startOfDay(referenceDate).getTime() - startOfDay(startDate).getTime()) / (1000 * 60 * 60 * 24),
  );
  const elapsedRounds = Math.max(0, Math.floor(elapsedDays / splitIntervalDays));
  const rawRound = 1 + elapsedRounds;

  if (rawRound > totalRounds) {
    return { currentRound: totalRounds, nextDueDate: null, isCompleted: true };
  }

  return {
    currentRound: rawRound,
    nextDueDate: addDays(startDate, rawRound * splitIntervalDays),
    isCompleted: false,
  };
}

export async function createPrescription(input: {
  patientId: number;
  programId: number;
  startDate: Date;
  staffUserId: number;
  surveyDataJson?: string;
  surveyResponseCacheId?: number;
}) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: input.programId },
  });

  // FIXED_SEQUENCE(예: 킬팻캡슐 3일체험): SPLIT/SINGLE처럼 완료해야 다음 할일이 생기는
  // 체이닝 구조가 아니라, 등록 시점에 정해진 오프셋의 TodoTask 전체를 한번에 만든다.
  if (program.type === PROGRAM_TYPE_FIXED_SEQUENCE) {
    const prescription = await prisma.prescription.create({
      data: {
        patientId: input.patientId,
        programId: input.programId,
        startDate: input.startDate,
        staffUserId: input.staffUserId,
        status: STATUS_ACTIVE,
        currentRound: null,
        totalRounds: null,
        surveyDataJson: input.surveyDataJson,
      },
    });

    if (input.surveyResponseCacheId) {
      await prisma.surveyResponseCache.update({
        where: { id: input.surveyResponseCacheId },
        data: { linkedPrescriptionId: String(prescription.id) },
      });
    }

    const templates = await prisma.programEventTemplate.findMany({
      where: { programId: input.programId },
      orderBy: { sortOrder: "asc" },
    });

    await prisma.todoTask.createMany({
      data: templates.map((template) => ({
        prescriptionId: prescription.id,
        taskType: template.taskType,
        dueDate: addDays(input.startDate, template.offsetDays),
        staffUserId: input.staffUserId,
      })),
    });

    return prescription;
  }

  const isSplit = program.type === PROGRAM_TYPE_SPLIT;
  const splitIntervalDays = program.splitIntervalDays ?? 14;
  const totalDurationDays = program.totalDurationDays ?? 90;
  const totalRounds = isSplit ? Math.ceil(totalDurationDays / splitIntervalDays) : null;

  // SPLIT은 소급 등록(과거 startDate) 시 이미 경과했어야 할 라운드 수만큼 currentRound를
  // 미리 진행시킨다 — 그래야 직원이 지난 라운드를 하나하나 완료 클릭하지 않아도 된다.
  const splitSchedule =
    isSplit && totalRounds ? computeSplitSchedule(input.startDate, splitIntervalDays, totalRounds) : null;

  const prescription = await prisma.prescription.create({
    data: {
      patientId: input.patientId,
      programId: input.programId,
      startDate: input.startDate,
      staffUserId: input.staffUserId,
      status: splitSchedule?.isCompleted ? STATUS_COMPLETED : STATUS_ACTIVE,
      currentRound: splitSchedule ? splitSchedule.currentRound : isSplit ? 1 : null,
      totalRounds,
    },
  });

  const dueDate = isSplit
    ? splitSchedule?.nextDueDate
    : addDays(input.startDate, program.followUpDays ?? 30);

  if (dueDate) {
    await prisma.todoTask.create({
      data: {
        prescriptionId: prescription.id,
        taskType: isSplit ? TASK_TYPE_NEXT_DOSE : TASK_TYPE_FOLLOW_UP,
        dueDate,
        staffUserId: input.staffUserId,
      },
    });
  }

  return prescription;
}

/**
 * 잘못 오늘 날짜로 등록된 처방의 시작일을 나중에 바로잡을 때 쓴다. SPLIT이고 아직
 * 진행 중(ACTIVE)인 처방만 스케줄을 재계산한다 — 새 시작일 기준으로 currentRound를
 * 다시 선진행시키고, 아직 완료 안 된 대기 중인 다음 회차 TodoTask를 지우고 새로
 * 정확한 예정일로 다시 만든다. FIXED_SEQUENCE/SINGLE, 이미 종료(COMPLETED/STOPPED)된
 * 처방은 라운드 개념이 없거나 재계산할 대상이 없어 시작일 값만 갱신한다.
 */
export async function updatePrescriptionStartDate(prescriptionId: number, newStartDate: Date) {
  const prescription = await prisma.prescription.findUniqueOrThrow({
    where: { id: prescriptionId },
    include: { program: true },
  });

  if (prescription.program.type !== PROGRAM_TYPE_SPLIT || prescription.status !== STATUS_ACTIVE) {
    return prisma.prescription.update({
      where: { id: prescriptionId },
      data: { startDate: newStartDate },
    });
  }

  const splitIntervalDays = prescription.program.splitIntervalDays ?? 14;
  const totalRounds =
    prescription.totalRounds ??
    Math.ceil((prescription.program.totalDurationDays ?? 90) / splitIntervalDays);
  const schedule = computeSplitSchedule(newStartDate, splitIntervalDays, totalRounds);

  await prisma.todoTask.deleteMany({
    where: { prescriptionId, taskType: TASK_TYPE_NEXT_DOSE, isDone: false },
  });

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      startDate: newStartDate,
      currentRound: schedule.currentRound,
      status: schedule.isCompleted ? STATUS_COMPLETED : STATUS_ACTIVE,
    },
  });

  if (!schedule.isCompleted && schedule.nextDueDate) {
    await prisma.todoTask.create({
      data: {
        prescriptionId,
        taskType: TASK_TYPE_NEXT_DOSE,
        dueDate: schedule.nextDueDate,
        staffUserId: prescription.staffUserId,
      },
    });
  }

  return updated;
}

export async function completeTodoTask(taskId: number, doneByUserId: number) {
  const task = await prisma.todoTask.findUniqueOrThrow({
    where: { id: taskId },
    include: { prescription: { include: { program: true } } },
  });

  const now = new Date();

  await prisma.todoTask.update({
    where: { id: taskId },
    data: { isDone: true, doneByUserId, doneAt: now },
  });

  const { prescription } = task;
  if (!prescription) {
    throw new Error(`TodoTask ${taskId}에 연결된 처방이 없습니다.`);
  }
  const { program } = prescription;

  if (task.taskType === TASK_TYPE_NEXT_DOSE && prescription.currentRound && prescription.totalRounds) {
    const nextRound = prescription.currentRound + 1;

    if (nextRound > prescription.totalRounds) {
      await prisma.prescription.update({
        where: { id: prescription.id },
        data: { status: STATUS_COMPLETED, currentRound: prescription.totalRounds },
      });
    } else {
      await prisma.prescription.update({
        where: { id: prescription.id },
        data: { currentRound: nextRound },
      });

      await prisma.todoTask.create({
        data: {
          prescriptionId: prescription.id,
          taskType: TASK_TYPE_NEXT_DOSE,
          // NEXT_DOSE는 WORK와 달리 항상 dueDate가 채워지는 체크형 타입이라 non-null 단언.
          dueDate: addDays(task.dueDate!, program.splitIntervalDays ?? 14),
          staffUserId: task.staffUserId,
        },
      });
    }
  } else if (task.taskType === TASK_TYPE_FOLLOW_UP) {
    await prisma.prescription.update({
      where: { id: prescription.id },
      data: { status: STATUS_COMPLETED },
    });
  }
}
