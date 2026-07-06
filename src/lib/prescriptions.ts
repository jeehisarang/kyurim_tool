import { prisma } from "@/lib/db";

const PROGRAM_TYPE_SPLIT = "SPLIT";
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
}) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: input.programId },
  });

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
