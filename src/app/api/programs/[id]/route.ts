import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDirector } from "@/lib/staff-auth";

/**
 * 프로그램 활성/비활성 토글(task.md) — 원장 전용. 물리 삭제가 아니라 isActive
 * 소프트삭제 패턴(staff-users PATCH와 동일한 원칙) — 비활성화해도 과거 처방 이력의
 * 프로그램 참조는 그대로 보존되고, /prescriptions/new 등록 목록에서만 제외된다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const programId = Number(id);
  const body = await request.json();

  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 프로그램 상태를 변경할 수 있습니다." }, { status: 403 });
  }

  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
  if (isActive === undefined) {
    return NextResponse.json({ error: "isActive 값이 필요합니다." }, { status: 400 });
  }

  const program = await prisma.program.update({
    where: { id: programId },
    data: { isActive },
  });

  return NextResponse.json(program);
}
