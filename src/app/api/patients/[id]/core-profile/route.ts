import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDirector } from "@/lib/staff-auth";

/**
 * 환자 핵심프로필(과거력/현재질환/주요니즈) 수정 — 원장 전용(14-3). 클라이언트에서 UI를
 * 숨기는 것과 별개로, 서버에서도 요청자(staffUserId)의 role을 반드시 재확인한다.
 * 필드를 보내지 않으면 변경 없음, 빈 문자열로 보내면 null로 지워진다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 핵심프로필을 수정할 수 있습니다." }, { status: 403 });
  }

  const pastHistory =
    typeof body.pastHistory === "string" ? body.pastHistory.trim() || null : undefined;
  const currentCondition =
    typeof body.currentCondition === "string" ? body.currentCondition.trim() || null : undefined;
  const mainNeeds = typeof body.mainNeeds === "string" ? body.mainNeeds.trim() || null : undefined;

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      ...(pastHistory !== undefined ? { pastHistory } : {}),
      ...(currentCondition !== undefined ? { currentCondition } : {}),
      ...(mainNeeds !== undefined ? { mainNeeds } : {}),
    },
  });

  return NextResponse.json(patient);
}
