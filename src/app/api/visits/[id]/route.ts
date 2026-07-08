import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** 잘못 기록된 진료분야/진료구분/예약여부 수정. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { treatmentCategoryId, visitTypeId, isReserved } = body;

  const visit = await prisma.visit.update({
    where: { id: Number(id) },
    data: {
      ...(typeof treatmentCategoryId === "number" ? { treatmentCategoryId } : {}),
      ...(typeof visitTypeId === "number" ? { visitTypeId } : {}),
      ...(typeof isReserved === "boolean" ? { isReserved } : {}),
    },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
  });

  return NextResponse.json(visit);
}

/**
 * 잘못 등록된 내원 체크 삭제. TreatmentCategory/VisitType/StaffUser/Program과 동일한 소프트
 * 삭제 원칙 — 물리적 삭제가 아니라 isActive=false로 비활성화해 통계 정확성을 지킨다.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const visit = await prisma.visit.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  return NextResponse.json(visit);
}
