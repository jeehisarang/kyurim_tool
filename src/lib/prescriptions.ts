import { prisma } from "@/lib/db";

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

export async function createPrescription(input: {
  patientId: number;
  programId: number;
  startDate: Date;
  staffUserId: number;
  surveyDataJson?: string;
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

  const prescription = await prisma.prescription.create({
    data: {
      patientId: input.patientId,
      programId: input.programId,
      startDate: input.startDate,
      staffUserId: input.staffUserId,
      status: STATUS_ACTIVE,
      currentRound: isSplit ? 1 : null,
      totalRounds,
    },
  });

  const dueDate = isSplit
    ? addDays(input.startDate, splitIntervalDays)
    : addDays(input.startDate, program.followUpDays ?? 30);

  await prisma.todoTask.create({
    data: {
      prescriptionId: prescription.id,
      taskType: isSplit ? TASK_TYPE_NEXT_DOSE : TASK_TYPE_FOLLOW_UP,
      dueDate,
      staffUserId: input.staffUserId,
    },
  });

  return prescription;
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
          dueDate: addDays(task.dueDate, program.splitIntervalDays ?? 14),
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
