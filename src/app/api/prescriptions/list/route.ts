import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPrescriptionRows } from "@/lib/prescriptions";

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
      staffUser: true,
      todoTasks: { orderBy: { dueDate: "desc" }, take: 1 },
    },
    orderBy: { startDate: "desc" },
  });

  const rows = await buildPrescriptionRows(prescriptions);

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
