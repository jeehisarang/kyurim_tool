import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_STATUSES = ["ACTIVE", "COMPLETED", "STOPPED"];

/**
 * 치료처방 수정. 담당자/시작일처럼 잘못 입력했을 수 있는 값만 고칠 수 있고,
 * 프로그램/환자는 바꿀 수 없다(이미 생성된 TodoTask가 원래 프로그램 기준으로 만들어져
 * 있어 구조가 깨진다). "삭제"는 물리 삭제 대신 status를 STOPPED로 바꾸는 소프트
 * 처리로 처리한다(Prescription.status에 이미 있는 값 — 기존 원칙과 동일, 이력 보존).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prescriptionId = Number(id);
  const body = await request.json();

  const staffUserId = typeof body.staffUserId === "number" ? body.staffUserId : undefined;
  const startDate = typeof body.startDate === "string" ? new Date(body.startDate) : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "상태값은 ACTIVE/COMPLETED/STOPPED 중 하나여야 합니다." },
      { status: 400 },
    );
  }
  if (startDate !== undefined && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const prescription = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      ...(staffUserId !== undefined ? { staffUserId } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: { patient: true, program: true, staffUser: true },
  });

  return NextResponse.json(prescription);
}
