import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPrescription } from "@/lib/prescriptions";

export async function GET() {
  const prescriptions = await prisma.prescription.findMany({
    include: { patient: true, program: true, staffUser: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(prescriptions);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, programId, staffUserId, startDate, surveyDataJson, surveyResponseCacheId } = body;

  if (!patientId || !programId || !staffUserId) {
    return NextResponse.json(
      { error: "환자, 프로그램, 담당자를 모두 선택하세요." },
      { status: 400 },
    );
  }

  const prescription = await createPrescription({
    patientId: Number(patientId),
    programId: Number(programId),
    staffUserId: Number(staffUserId),
    startDate: startDate ? new Date(startDate) : new Date(),
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
