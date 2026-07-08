import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_ROLES = ["원장", "직원"];

/**
 * 이름 수정 / 활성 상태 전환(비활성화·재활성화). 물리적 삭제가 아니라 isActive 소프트
 * 삭제 패턴 — 과거 Visit/TodoTask 등에 남은 담당자 표시를 그대로 보존하기 위함.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staffId = Number(id);
  const body = await request.json();

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const role = typeof body.role === "string" ? body.role : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "역할은 원장 또는 직원이어야 합니다." }, { status: 400 });
  }

  if (name !== undefined) {
    const existing = await prisma.staffUser.findUnique({ where: { name } });
    if (existing && existing.id !== staffId) {
      return NextResponse.json({ error: "이미 같은 이름의 직원이 있습니다." }, { status: 409 });
    }
  }

  const staffUser = await prisma.staffUser.update({
    where: { id: staffId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  return NextResponse.json(staffUser);
}
