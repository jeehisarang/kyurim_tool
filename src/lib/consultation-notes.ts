import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { withObjectParticle } from "@/lib/korean-particle";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// 날짜 역순(최신이 위) — /consult-mode 이력 스택과 /patients/[patientId] 읽기 전용
// 표시가 공유하는 유일한 조회 지점.
export async function listConsultationNotesForPatient(patientId: number) {
  return prisma.consultationNote.findMany({
    where: { patientId },
    include: { consultationType: true, createdByStaff: true },
    orderBy: { visitDate: "desc" },
  });
}

// 활동피드(14-7) 로그는 최초 저장 시에만 남긴다 — 수정(updateConsultationNote)은 로그 대상 아님
// (task.md 지시, 오타 정정까지 피드에 노출되면 노이즈만 늘어남).
export async function createConsultationNote(input: {
  patientId: number;
  consultationTypeId: number;
  rawText: string;
  convertedChartText: string | null;
  createdByStaffId: number;
}) {
  const note = await prisma.consultationNote.create({
    data: {
      patientId: input.patientId,
      visitDate: startOfToday(),
      consultationTypeId: input.consultationTypeId,
      rawText: input.rawText,
      convertedChartText: input.convertedChartText,
      createdByStaffId: input.createdByStaffId,
    },
    include: { consultationType: true, createdByStaff: true, patient: true },
  });

  await logActivity({
    actorType: "STAFF",
    actorId: input.createdByStaffId,
    actionType: "CONSULTATION_NOTE_CREATE",
    label: `${note.createdByStaff.name}님이 ${note.patient.name}님 ${withObjectParticle(note.consultationType.name)} 기록했습니다`,
  });

  return note;
}

// 오타/잘못 기재 정정용 — 새 레코드를 만들지 않고 기존 레코드를 그대로 덮어쓴다.
// updatedAt은 Prisma의 @updatedAt이 자동 갱신(언제 마지막으로 손댔는지만 기록, 상세 이력 없음).
export async function updateConsultationNote(
  id: number,
  input: { visitDate?: Date; rawText?: string; convertedChartText?: string | null },
) {
  return prisma.consultationNote.update({
    where: { id },
    data: {
      ...(input.visitDate !== undefined ? { visitDate: input.visitDate } : {}),
      ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
      ...(input.convertedChartText !== undefined
        ? { convertedChartText: input.convertedChartText }
        : {}),
    },
    include: { consultationType: true, createdByStaff: true },
  });
}

// 법적 의무기록이 아니라 내부 참고용 원문/초안이라 하드 삭제 허용(task.md 지시) — 실수
// 방지는 API 호출측(원장 role 재검증) + 클라이언트 확인창으로만 처리, 소프트 삭제 없음.
export async function deleteConsultationNote(id: number) {
  await prisma.consultationNote.delete({ where: { id } });
}
