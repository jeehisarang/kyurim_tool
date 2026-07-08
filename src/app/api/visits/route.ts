import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return startOfToday();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetDate = parseDateParam(searchParams.get("date"));

  const visits = await prisma.visit.findMany({
    where: { visitDate: targetDate, isActive: true },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(visits);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, treatmentCategoryId, visitTypeId, isReserved, checkedByUserId, visitDate } = body;

  if (!patientId || !treatmentCategoryId || !visitTypeId) {
    return NextResponse.json(
      { error: "필수 항목이 누락되었습니다." },
      { status: 400 },
    );
  }

  // visitDate는 화면에서 선택된 날짜("오늘"이 아닐 수 있음)를 그대로 받되, 자정 기준으로
  // 정규화해서 저장한다 — 시간이 섞이면 날짜별 조회(GET, 통계)가 매칭에 실패한다.
  const normalizedVisitDate =
    typeof visitDate === "string" ? parseDateParam(visitDate) : startOfToday();

  // 예약여부는 접수 시점이 아니라 진료 종료 후 목록에서 별도로 체크하는 값이라, 접수 시점엔
  // 항상 예약안함(false)으로 저장한다 — 값이 안 넘어와도 기본값 false를 보장.
  const visit = await prisma.visit.create({
    data: {
      patientId: Number(patientId),
      treatmentCategoryId: Number(treatmentCategoryId),
      visitTypeId: Number(visitTypeId),
      isReserved: isReserved === true,
      visitDate: normalizedVisitDate,
      checkedByUserId: typeof checkedByUserId === "number" ? checkedByUserId : null,
    },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
  });

  return NextResponse.json(visit, { status: 201 });
}
