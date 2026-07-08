import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidChartNumber, CHART_NUMBER_FORMAT_ERROR } from "@/lib/patients";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const patients = await prisma.patient.findMany({
    where: {
      OR: [{ chartNumber: { contains: q } }, { name: { contains: q } }],
    },
    orderBy: { name: "asc" },
    take: 10,
  });

  return NextResponse.json(patients);
}

export async function POST(request: Request) {
  const body = await request.json();
  const chartNumber = String(body.chartNumber ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!chartNumber || !name) {
    return NextResponse.json(
      { error: "차트번호와 이름을 모두 입력하세요." },
      { status: 400 },
    );
  }

  if (!isValidChartNumber(chartNumber)) {
    return NextResponse.json({ error: CHART_NUMBER_FORMAT_ERROR }, { status: 400 });
  }

  const existing = await prisma.patient.findUnique({ where: { chartNumber } });
  if (existing) {
    return NextResponse.json(
      {
        error: `이미 등록된 환자입니다: ${existing.name} (${existing.chartNumber})`,
        existingPatient: { id: existing.id, chartNumber: existing.chartNumber, name: existing.name },
      },
      { status: 409 },
    );
  }

  const patient = await prisma.patient.create({
    data: { chartNumber, name },
  });

  return NextResponse.json(patient, { status: 201 });
}
