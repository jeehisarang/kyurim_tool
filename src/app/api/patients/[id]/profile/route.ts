import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPrescriptionRows } from "@/lib/prescriptions";
import { listExaminations } from "@/lib/examinations";

const RECENT_EXAM_LIMIT = 5;
const RECENT_VISIT_LIMIT = 5;

/**
 * 환자 통합 프로필 화면(/patients/[patientId]) 전용 — 기본정보/진행중·이력 처방/
 * 검사이력 요약/최근 내원기록을 한 번에 모아 반환한다(13-7 1단계).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId },
    include: {
      program: true,
      staffUser: true,
      todoTasks: { orderBy: { dueDate: "desc" }, take: 1 },
    },
    orderBy: { startDate: "desc" },
  });
  const rows = await buildPrescriptionRows(prescriptions);
  const activePrescriptions = rows.filter((r) => r.status === "ACTIVE");
  const inactivePrescriptions = rows.filter((r) => r.status !== "ACTIVE");

  // listExaminations는 이미 examDate 내림차순으로 정렬해서 반환한다 — 상위 N건만 자른다.
  const recentExams = (await listExaminations(patientId)).slice(0, RECENT_EXAM_LIMIT);

  const recentVisits = await prisma.visit.findMany({
    where: { patientId, isActive: true },
    include: { treatmentCategory: true, visitType: true },
    orderBy: { visitDate: "desc" },
    take: RECENT_VISIT_LIMIT,
  });

  return NextResponse.json({
    patient,
    activePrescriptions,
    inactivePrescriptions,
    recentExams,
    recentVisits,
  });
}
