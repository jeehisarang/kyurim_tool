import { prisma } from "@/lib/db";
import { isMessageTaskType } from "@/lib/task-types";
import { issueTrialReferralLink, linkTrialApplicationToPrescription } from "@/lib/referrals";

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
//
// 1차 = 등록일(startDate) 당일 이미 처방을 받은 것으로 간주해 자동완료 처리한다
// (task.md 회차계산 버그 수정 — 예전에는 등록일+간격을 1차로 계산해 전체 스케줄이
// 한 텀씩 밀리면서 총기간을 초과했다). 그래서 액션이 필요한 "현재 회차"는 항상
// 2차부터 시작하고, N차 예정일은 start+(N-1)*간격이다. (등록 당일 = referenceDate =
// startDate인 기본 흐름에서는 elapsedRounds=0이라 currentRound=2, nextDueDate=
// start+간격로 귀결된다.)
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
  const rawRound = 2 + elapsedRounds;

  if (rawRound > totalRounds) {
    return { currentRound: totalRounds, nextDueDate: null, isCompleted: true };
  }

  return {
    currentRound: rawRound,
    nextDueDate: addDays(startDate, (rawRound - 1) * splitIntervalDays),
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
  trialApplicationId?: number;
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

    if (input.trialApplicationId) {
      await linkTrialApplicationToPrescription(input.trialApplicationId, prescription.id);
    }

    // 킬팻캡슐 3일체험 추천 이벤트(task.md) — 이 처방으로 온 환자가 스스로 추천할 수 있는
    // 개인 링크를 등록 시점에 항상 자동 발급한다(도보/구글폼/추천링크 등 유입 경로 무관).
    await issueTrialReferralLink({
      id: prescription.id,
      patientId: input.patientId,
      startDate: input.startDate,
    });

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

      // 다음 회차 예정일은 항상 등록일 기준 계산값(start+(nextRound-1)*간격)에서
      // 출발한다 — 이전 회차의 override가 있어도 그 뒤 회차로 연쇄되지 않게 하기 위함
      // (task.md: "수정한 회차만 바뀌고 나머지는 원래 계산대로 유지"). 직원이 그 회차에
      // 직접 지정해둔 수동 조정 날짜(PrescriptionRoundOverride)가 있으면 그 값을 대신 쓴다.
      const override = await prisma.prescriptionRoundOverride.findUnique({
        where: { prescriptionId_roundNumber: { prescriptionId: prescription.id, roundNumber: nextRound } },
      });
      const calculatedDueDate = addDays(prescription.startDate, (nextRound - 1) * (program.splitIntervalDays ?? 14));

      await prisma.todoTask.create({
        data: {
          prescriptionId: prescription.id,
          taskType: TASK_TYPE_NEXT_DOSE,
          dueDate: override?.overrideDate ?? calculatedDueDate,
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

export type PrescriptionRoundEntry = {
  round: number;
  dueDate: Date;
  isDone: boolean;
  completedAt: Date | null;
  isOverridden: boolean;
};

export type PrescriptionEventEntry = {
  taskType: string;
  dueDate: Date;
  status: "DONE" | "SKIPPED" | "PENDING";
  completedAt: Date | null;
};

export type PrescriptionTaskHistoryEntry = {
  id: number;
  taskType: string;
  dueDate: Date | null;
  isDone: boolean;
  doneAt: Date | null;
  doneByUserName: string | null;
};

export type PrescriptionDetail = {
  prescriptionId: number;
  status: string;
  startDate: Date;
  currentRound: number | null;
  totalRounds: number | null;
  patient: { id: number; name: string; chartNumber: string };
  program: {
    id: number;
    name: string;
    type: string;
    splitIntervalDays: number | null;
    totalDurationDays: number | null;
    followUpDays: number | null;
  };
  staffUser: { id: number; name: string };
  rounds: PrescriptionRoundEntry[] | null;
  singleFollowUp: PrescriptionRoundEntry | null;
  events: PrescriptionEventEntry[] | null;
  taskHistory: PrescriptionTaskHistoryEntry[];
  // 킬팻캡슐 3일체험 추천 이벤트(task.md) — FIXED_SEQUENCE 처방에만 존재(issueTrialReferralLink).
  referralLink: { token: string; expiresAt: Date; isActive: boolean } | null;
};

// SPLIT 타입 회차 리스트 재구성. 1차는 등록일 당일 처방을 이미 받은 것으로 간주해
// 항상 자동완료 처리한다(computeSplitSchedule과 동일한 회차계산 원칙 — task.md
// 버그 수정). 실제 TodoTask가 있는 회차는 그 TodoTask의 dueDate를 그대로 표시한다
// ("오늘 할 일" 화면과 상세페이지가 절대 어긋나지 않도록 — task.md 2단계 요구사항).
// 미완료 TodoTask는 체인 구조상 항상 currentRound 1건만 존재하므로 그대로 매칭하고,
// 완료된 TodoTask는 dueDate로 라운드 번호를 역산해 매칭한다. 소급 등록으로
// currentRound가 곧바로 앞당겨져 실제 TodoTask 기록이 없는 초창기 회차는 완료일을
// 알 수 없다(completedAt=null). 아직 TodoTask가 생성되지 않은 미래 회차만 override
// 또는 계산값으로 미리보기 예정일을 보여준다.
function buildSplitRounds(input: {
  startDate: Date;
  splitIntervalDays: number;
  totalRounds: number;
  currentRound: number;
  status: string;
  nextDoseTasks: { dueDate: Date | null; isDone: boolean; doneAt: Date | null }[];
  overrides: Map<number, Date>;
}): PrescriptionRoundEntry[] {
  const start = startOfDay(input.startDate);
  const taskByRound = new Map<number, { dueDate: Date; isDone: boolean; doneAt: Date | null }>();
  for (const task of input.nextDoseTasks) {
    if (!task.dueDate) continue;
    if (!task.isDone) {
      taskByRound.set(input.currentRound, { dueDate: task.dueDate, isDone: false, doneAt: null });
      continue;
    }
    const elapsedDays = Math.round((startOfDay(task.dueDate).getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const round = Math.round(elapsedDays / input.splitIntervalDays) + 1;
    if (round >= 2 && round <= input.totalRounds) {
      taskByRound.set(round, { dueDate: task.dueDate, isDone: true, doneAt: task.doneAt });
    }
  }

  const rounds: PrescriptionRoundEntry[] = [
    { round: 1, dueDate: input.startDate, isDone: true, completedAt: input.startDate, isOverridden: false },
  ];
  for (let n = 2; n <= input.totalRounds; n++) {
    const override = input.overrides.get(n);
    const matched = taskByRound.get(n);
    if (matched) {
      rounds.push({ round: n, dueDate: matched.dueDate, isDone: matched.isDone, completedAt: matched.doneAt, isOverridden: Boolean(override) });
    } else {
      const dueDate = override ?? addDays(input.startDate, (n - 1) * input.splitIntervalDays);
      rounds.push({
        round: n,
        dueDate,
        isDone: n < input.currentRound || input.status === STATUS_COMPLETED,
        completedAt: null,
        isOverridden: Boolean(override),
      });
    }
  }
  return rounds;
}

async function buildFixedSequenceEvents(
  prescriptionId: number,
  programId: number,
  startDate: Date,
): Promise<PrescriptionEventEntry[]> {
  const templates = await prisma.programEventTemplate.findMany({
    where: { programId },
    orderBy: { sortOrder: "asc" },
  });
  const tasks = await prisma.todoTask.findMany({
    where: { prescriptionId, taskType: { in: templates.map((t) => t.taskType) } },
    include: { eventLog: true },
  });
  const taskByType = new Map(tasks.map((t) => [t.taskType, t]));

  return templates.map((template) => {
    const task = taskByType.get(template.taskType);
    const dueDate = task?.dueDate ?? addDays(startDate, template.offsetDays);
    let status: PrescriptionEventEntry["status"] = "PENDING";
    if (task?.eventLog?.sentDate) status = "DONE";
    else if (task?.eventLog?.skippedAt) status = "SKIPPED";
    return { taskType: template.taskType, dueDate, status, completedAt: task?.eventLog?.sentDate ?? null };
  });
}

/**
 * /prescriptions/[prescriptionId] 상세페이지 전용 조회 함수. 프로그램 타입(SPLIT/SINGLE/
 * FIXED_SEQUENCE)별로 표시 방식이 달라 각각 다른 필드(rounds/singleFollowUp/events)에
 * 결과를 채우고 나머지는 null로 둔다. taskHistory는 타입 무관하게 이 처방에 연결된
 * TodoTask 전체를 최신순으로 반환 — 메시지형(TRIAL_*)은 TodoTask.isDone이 항상 false로
 * 남으므로 ProgramEventLog.sentDate를 완료 진실원천으로 대신 사용한다.
 */
export async function getPrescriptionDetail(prescriptionId: number): Promise<PrescriptionDetail | null> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: true, program: true, staffUser: true },
  });
  if (!prescription) return null;

  const { program } = prescription;

  const tasks = await prisma.todoTask.findMany({
    where: { prescriptionId },
    include: { eventLog: true, doneByUser: true },
    orderBy: { dueDate: "desc" },
  });

  let rounds: PrescriptionRoundEntry[] | null = null;
  let singleFollowUp: PrescriptionRoundEntry | null = null;
  let events: PrescriptionEventEntry[] | null = null;
  let referralLink: PrescriptionDetail["referralLink"] = null;

  if (program.type === PROGRAM_TYPE_FIXED_SEQUENCE_ROW) {
    const link = await prisma.referralLink.findFirst({ where: { sourcePrescriptionId: prescriptionId } });
    if (link) referralLink = { token: link.token, expiresAt: link.expiresAt, isActive: link.isActive };
  }

  if (program.type === PROGRAM_TYPE_SPLIT && prescription.totalRounds != null && prescription.currentRound != null) {
    const overrideRows = await prisma.prescriptionRoundOverride.findMany({ where: { prescriptionId } });
    const overrides = new Map(overrideRows.map((o) => [o.roundNumber, o.overrideDate]));
    rounds = buildSplitRounds({
      startDate: prescription.startDate,
      splitIntervalDays: program.splitIntervalDays ?? 14,
      totalRounds: prescription.totalRounds,
      currentRound: prescription.currentRound,
      status: prescription.status,
      nextDoseTasks: tasks
        .filter((t) => t.taskType === TASK_TYPE_NEXT_DOSE)
        .map((t) => ({ dueDate: t.dueDate, isDone: t.isDone, doneAt: t.doneAt })),
      overrides,
    });
  } else if (program.type === PROGRAM_TYPE_FIXED_SEQUENCE_ROW) {
    events = await buildFixedSequenceEvents(prescriptionId, program.id, prescription.startDate);
  } else {
    // SINGLE(구형 S환/하비환 등): 처방일 + 후속조치 예정일 1건.
    const followUpTask = tasks.find((t) => t.taskType === TASK_TYPE_FOLLOW_UP);
    const dueDate = followUpTask?.dueDate ?? addDays(prescription.startDate, program.followUpDays ?? 30);
    singleFollowUp = {
      round: 1,
      dueDate,
      isDone: followUpTask?.isDone ?? false,
      completedAt: followUpTask?.doneAt ?? null,
      isOverridden: false,
    };
  }

  const taskHistory: PrescriptionTaskHistoryEntry[] = tasks.map((t) => ({
    id: t.id,
    taskType: t.taskType,
    dueDate: t.dueDate,
    isDone: isMessageTaskType(t.taskType) ? Boolean(t.eventLog?.sentDate) : t.isDone,
    doneAt: isMessageTaskType(t.taskType) ? (t.eventLog?.sentDate ?? null) : t.doneAt,
    doneByUserName: isMessageTaskType(t.taskType) ? null : (t.doneByUser?.name ?? null),
  }));

  return {
    prescriptionId: prescription.id,
    status: prescription.status,
    startDate: prescription.startDate,
    currentRound: prescription.currentRound,
    totalRounds: prescription.totalRounds,
    patient: { id: prescription.patient.id, name: prescription.patient.name, chartNumber: prescription.patient.chartNumber },
    program: {
      id: program.id,
      name: program.name,
      type: program.type,
      splitIntervalDays: program.splitIntervalDays,
      totalDurationDays: program.totalDurationDays,
      followUpDays: program.followUpDays,
    },
    staffUser: { id: prescription.staffUser.id, name: prescription.staffUser.name },
    rounds,
    singleFollowUp,
    events,
    taskHistory,
    referralLink,
  };
}

export type RoundOverrideResult = { ok: true } | { ok: false; error: string };

/**
 * 회차별 예정일 수동 조정(task.md 2단계) — 완료된 회차는 수정 불가, 수정한 회차만
 * 바뀌고 나머지 회차는 원래 계산대로 유지된다(연쇄 재계산 없음). currentRound에
 * 해당하는 회차는 실제로 대기 중인 NEXT_DOSE TodoTask가 있으므로 그 dueDate도 함께
 * 갱신한다 — 그보다 미래 회차는 아직 TodoTask가 없어 completeTodoTask가 체인을
 * 이어갈 때 이 override를 조회해서 반영한다.
 */
export async function setPrescriptionRoundOverride(
  prescriptionId: number,
  roundNumber: number,
  overrideDate: Date,
): Promise<RoundOverrideResult> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { program: true },
  });
  if (!prescription) return { ok: false, error: "치료처방을 찾을 수 없습니다." };
  if (prescription.program.type !== PROGRAM_TYPE_SPLIT) {
    return { ok: false, error: "회차 날짜 수정은 SPLIT 타입 처방에서만 가능합니다." };
  }
  if (prescription.status !== STATUS_ACTIVE) {
    return { ok: false, error: "진행중인 처방만 회차 날짜를 수정할 수 있습니다." };
  }
  const { totalRounds, currentRound } = prescription;
  if (totalRounds == null || currentRound == null) {
    return { ok: false, error: "회차 정보가 없는 처방입니다." };
  }
  if (roundNumber < 2 || roundNumber > totalRounds) {
    return { ok: false, error: "수정할 수 없는 회차입니다." };
  }
  if (roundNumber < currentRound) {
    return { ok: false, error: "이미 완료된 회차는 수정할 수 없습니다." };
  }

  await prisma.prescriptionRoundOverride.upsert({
    where: { prescriptionId_roundNumber: { prescriptionId, roundNumber } },
    update: { overrideDate },
    create: { prescriptionId, roundNumber, overrideDate },
  });

  if (roundNumber === currentRound) {
    const pendingTask = await prisma.todoTask.findFirst({
      where: { prescriptionId, taskType: TASK_TYPE_NEXT_DOSE, isDone: false },
    });
    if (pendingTask) {
      await prisma.todoTask.update({ where: { id: pendingTask.id }, data: { dueDate: overrideDate } });
    }
  }

  return { ok: true };
}

/** 수동 조정한 회차를 계산값으로 되돌린다. */
export async function resetPrescriptionRoundOverride(
  prescriptionId: number,
  roundNumber: number,
): Promise<RoundOverrideResult> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { program: true },
  });
  if (!prescription) return { ok: false, error: "치료처방을 찾을 수 없습니다." };
  if (prescription.program.type !== PROGRAM_TYPE_SPLIT) {
    return { ok: false, error: "회차 날짜 수정은 SPLIT 타입 처방에서만 가능합니다." };
  }

  await prisma.prescriptionRoundOverride.deleteMany({ where: { prescriptionId, roundNumber } });

  if (roundNumber === prescription.currentRound) {
    const splitIntervalDays = prescription.program.splitIntervalDays ?? 14;
    const calculatedDueDate = addDays(prescription.startDate, (roundNumber - 1) * splitIntervalDays);
    const pendingTask = await prisma.todoTask.findFirst({
      where: { prescriptionId, taskType: TASK_TYPE_NEXT_DOSE, isDone: false },
    });
    if (pendingTask) {
      await prisma.todoTask.update({ where: { id: pendingTask.id }, data: { dueDate: calculatedDueDate } });
    }
  }

  return { ok: true };
}
