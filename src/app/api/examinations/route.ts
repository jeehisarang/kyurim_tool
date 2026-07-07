import { NextResponse } from "next/server";
import {
  createBodyCompositionRecord,
  createStrengthTestRecord,
  listExaminations,
} from "@/lib/examinations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientIdParam = searchParams.get("patientId");
  const patientId = patientIdParam ? Number(patientIdParam) : undefined;

  const rows = await listExaminations(patientId);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { examType, patientId, prescriptionId, staffUserId, measuredAt } = body;

  if (!examType || !patientId || !staffUserId) {
    return NextResponse.json(
      { error: "검사 종류, 환자, 담당자를 모두 선택하세요." },
      { status: 400 },
    );
  }

  const commonInput = {
    patientId: Number(patientId),
    prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
    measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
    staffUserId: Number(staffUserId),
  };

  if (examType === "BODY_COMPOSITION") {
    const { weightKg, note } = body;
    if (typeof weightKg !== "number") {
      return NextResponse.json({ error: "체중을 입력하세요." }, { status: 400 });
    }
    const record = await createBodyCompositionRecord({
      ...commonInput,
      weightKg,
      note: typeof note === "string" && note.trim() ? note : undefined,
    });
    return NextResponse.json({ examType, ...record }, { status: 201 });
  }

  if (examType === "STRENGTH_TEST") {
    const {
      gender,
      measuredAge,
      heightCm,
      armMuscleMassLeftKg,
      armMuscleMassRightKg,
      legMuscleMassLeftKg,
      legMuscleMassRightKg,
      gripLeftKg,
      gripRightKg,
    } = body;

    if (
      (gender !== "MALE" && gender !== "FEMALE") ||
      [
        measuredAge,
        heightCm,
        armMuscleMassLeftKg,
        armMuscleMassRightKg,
        legMuscleMassLeftKg,
        legMuscleMassRightKg,
        gripLeftKg,
        gripRightKg,
      ].some((v) => typeof v !== "number")
    ) {
      return NextResponse.json({ error: "근력검사 입력값을 모두 확인하세요." }, { status: 400 });
    }

    const record = await createStrengthTestRecord({
      ...commonInput,
      gender,
      measuredAge,
      heightCm,
      armMuscleMassLeftKg,
      armMuscleMassRightKg,
      legMuscleMassLeftKg,
      legMuscleMassRightKg,
      gripLeftKg,
      gripRightKg,
    });
    return NextResponse.json({ examType, ...record }, { status: 201 });
  }

  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}
