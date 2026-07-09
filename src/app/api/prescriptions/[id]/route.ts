import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updatePrescriptionStartDate } from "@/lib/prescriptions";

const VALID_STATUSES = ["ACTIVE", "COMPLETED", "STOPPED"];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Visit.visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseStartDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * 치료처방 수정. 담당자/시작일처럼 잘못 입력했을 수 있는 값만 고칠 수 있고,
 * 프로그램/환자는 바꿀 수 없다(이미 생성된 TodoTask가 원래 프로그램 기준으로 만들어져
 * 있어 구조가 깨진다). "삭제"는 물리 삭제 대신 status를 STOPPED로 바꾸는 소프트
 * 처리로 처리한다(Prescription.status에 이미 있는 값 — 기존 원칙과 동일, 이력 보존).
 * startDate 변경은 SPLIT+ACTIVE 처방이면 updatePrescriptionStartDate()가 스케줄까지
 * 재계산한다(대기 중인 다음 회차 재생성) — createPrescription과 동일한 원칙.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prescriptionId = Number(id);
  const body = await request.json();

  const staffUserId = typeof body.staffUserId === "number" ? body.staffUserId : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "상태값은 ACTIVE/COMPLETED/STOPPED 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  if (body.startDate !== undefined) {
    const startDate = parseStartDate(body.startDate);
    if (startDate === null) {
      return NextResponse.json({ error: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (startDate.getTime() > startOfToday().getTime()) {
      return NextResponse.json({ error: "시작일은 미래 날짜를 선택할 수 없습니다." }, { status: 400 });
    }
    await updatePrescriptionStartDate(prescriptionId, startDate);
  }

  const prescription = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      ...(staffUserId !== undefined ? { staffUserId } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: { patient: true, program: true, staffUser: true },
  });

  return NextResponse.json(prescription);
}
