import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_ROLES = ["원장", "직원"];

// includeInactive=1이면 설정 화면(직원 관리)용으로 비활성 직원까지 전부 반환.
// 그 외(기본값)는 "현재 사용자" 드롭다운 등 기존 호출부와 동일하게 활성 직원만 반환.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";

  const staffUsers = await prisma.staffUser.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(staffUsers);
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";

  if (!name || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "이름과 역할(원장/직원)을 모두 입력하세요." },
      { status: 400 },
    );
  }

  const existing = await prisma.staffUser.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "이미 같은 이름의 직원이 있습니다." }, { status: 409 });
  }

  const staffUser = await prisma.staffUser.create({ data: { name, role } });
  return NextResponse.json(staffUser, { status: 201 });
}
