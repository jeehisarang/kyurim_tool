import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPrescription } from "@/lib/prescriptions";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Visit.visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseStartDate(value: unknown): Date | null {
  if (value === undefined) return startOfToday();
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET() {
  const prescriptions = await prisma.prescription.findMany({
    include: { patient: true, program: true, staffUser: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(prescriptions);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, programId, staffUserId, startDate: startDateInput, surveyDataJson, surveyResponseCacheId } = body;

  if (!patientId || !programId || !staffUserId) {
    return NextResponse.json(
      { error: "환자, 프로그램, 담당자를 모두 선택하세요." },
      { status: 400 },
    );
  }

  const startDate = parseStartDate(startDateInput);
  if (startDate === null) {
    return NextResponse.json({ error: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (startDate.getTime() > startOfToday().getTime()) {
    return NextResponse.json({ error: "시작일은 미래 날짜를 선택할 수 없습니다." }, { status: 400 });
  }

  const prescription = await createPrescription({
    patientId: Number(patientId),
    programId: Number(programId),
    staffUserId: Number(staffUserId),
    startDate,
    surveyDataJson: typeof surveyDataJson === "string" && surveyDataJson.trim() ? surveyDataJson : undefined,
    surveyResponseCacheId:
      typeof surveyResponseCacheId === "number" ? surveyResponseCacheId : undefined,
  });

  const withRelations = await prisma.prescription.findUniqueOrThrow({
    where: { id: prescription.id },
    include: { patient: true, program: true, staffUser: true },
  });

  return NextResponse.json(withRelations, { status: 201 });
}
