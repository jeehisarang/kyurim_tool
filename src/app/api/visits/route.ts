import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET() {
  const visits = await prisma.visit.findMany({
    where: { visitDate: startOfToday() },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(visits);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, treatmentCategoryId, visitTypeId, isReserved, checkedByUserId } = body;

  if (
    !patientId ||
    !treatmentCategoryId ||
    !visitTypeId ||
    typeof isReserved !== "boolean"
  ) {
    return NextResponse.json(
      { error: "필수 항목이 누락되었습니다." },
      { status: 400 },
    );
  }

  const visit = await prisma.visit.create({
    data: {
      patientId: Number(patientId),
      treatmentCategoryId: Number(treatmentCategoryId),
      visitTypeId: Number(visitTypeId),
      isReserved,
      visitDate: startOfToday(),
      checkedByUserId: typeof checkedByUserId === "number" ? checkedByUserId : null,
    },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
  });

  return NextResponse.json(visit, { status: 201 });
}
