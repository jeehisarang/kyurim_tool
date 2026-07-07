import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PROGRAM_TYPE_FIXED_SEQUENCE = "FIXED_SEQUENCE";

/**
 * 치료처방 리스트 화면 전용: 현재 진행 중(ACTIVE)인 처방을 환자별로 묶어서 반환한다.
 * 한 환자가 여러 프로그램에 등록돼 있으면 prescriptions 배열에 여러 건이 들어간다
 * (화면에서 뱃지 여러 개로 표시). "프로그램별 필터"는 프론트에서 클라이언트 사이드로 처리.
 */
export async function GET() {
  const prescriptions = await prisma.prescription.findMany({
    where: { status: "ACTIVE" },
    include: {
      patient: true,
      program: true,
      todoTasks: { orderBy: { dueDate: "desc" }, take: 1 },
    },
    orderBy: { startDate: "desc" },
  });

  // FIXED_SEQUENCE(예: 킬팻캡슐 3일체험)는 currentRound/totalRounds를 안 쓰므로
  // "N/전체 이벤트 완료" 형태로 진행상태를 따로 계산한다 (완료 진실원천은 ProgramEventLog).
  const fixedSeqPrescriptionIds = prescriptions
    .filter((p) => p.program.type === PROGRAM_TYPE_FIXED_SEQUENCE)
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

  const rows = prescriptions.map((p) => {
    const eventCounts = eventCountByPrescription.get(p.id);
    return {
      prescriptionId: p.id,
      program: { id: p.program.id, name: p.program.name, type: p.program.type },
      startDate: p.startDate,
      status: p.status,
      currentRound: p.currentRound,
      totalRounds: p.totalRounds,
      completedEventCount: eventCounts?.done ?? null,
      totalEventCount: eventCounts?.total ?? null,
      latestTaskDueDate: p.todoTasks[0]?.dueDate ?? null,
    };
  });

  const byPatient = new Map<
    number,
    { patient: { id: number; name: string; chartNumber: string }; prescriptions: (typeof rows)[number][] }
  >();
  prescriptions.forEach((p, i) => {
    const entry = byPatient.get(p.patientId) ?? { patient: p.patient, prescriptions: [] };
    entry.prescriptions.push(rows[i]);
    byPatient.set(p.patientId, entry);
  });

  return NextResponse.json([...byPatient.values()]);
}
