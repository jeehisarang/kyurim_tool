import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createBodyCompositionRecord,
  createStrengthTestRecord,
  listExaminations,
} from "@/lib/examinations";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// visitDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱) — 과거 트러블슈팅
// 히스토리에서 시:분:초가 섞여 일별 조회가 어긋난 문제가 재발하지 않도록 통일한다.
function parseExamDate(value: unknown): Date | null {
  if (value === undefined) return startOfToday();
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientIdParam = searchParams.get("patientId");
  const patientId = patientIdParam ? Number(patientIdParam) : undefined;

  const rows = await listExaminations(patientId);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { examType, patientId, prescriptionId, staffUserId, examDate: examDateInput } = body;

  if (!examType || !patientId || !staffUserId) {
    return NextResponse.json(
      { error: "검사 종류, 환자, 담당자를 모두 선택하세요." },
      { status: 400 },
    );
  }

  const examDate = parseExamDate(examDateInput);
  if (examDate === null) {
    return NextResponse.json({ error: "검사일자 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (examDate.getTime() > startOfToday().getTime()) {
    return NextResponse.json({ error: "검사일자는 미래 날짜를 선택할 수 없습니다." }, { status: 400 });
  }

  const commonInput = {
    patientId: Number(patientId),
    prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
    examDate,
    staffUserId: Number(staffUserId),
  };

  if (examType === "BODY_COMPOSITION") {
    const {
      weightKg,
      bodyFatPercent,
      whr,
      note,
      heightCm,
      gender,
      armMuscleMassLeftKg,
      armMuscleMassRightKg,
      legMuscleMassLeftKg,
      legMuscleMassRightKg,
    } = body;

    if (
      typeof weightKg !== "number" ||
      typeof bodyFatPercent !== "number" ||
      typeof whr !== "number"
    ) {
      return NextResponse.json(
        { error: "체중, 체지방율, WHR을 모두 입력하세요." },
        { status: 400 },
      );
    }

    const patient = await prisma.patient.findUnique({ where: { id: commonInput.patientId } });
    if (!patient) {
      return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
    }
    if (patient.height == null && typeof heightCm !== "number") {
      return NextResponse.json({ error: "환자의 키(cm)를 입력하세요." }, { status: 400 });
    }
    if (patient.gender == null && gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json({ error: "환자의 성별을 선택하세요." }, { status: 400 });
    }

    const limbFields = [
      armMuscleMassLeftKg,
      armMuscleMassRightKg,
      legMuscleMassLeftKg,
      legMuscleMassRightKg,
    ];
    const providedLimbCount = limbFields.filter((v) => typeof v === "number").length;
    if (providedLimbCount > 0 && providedLimbCount < 4) {
      return NextResponse.json(
        { error: "사지골격근량은 4개 항목을 모두 입력하거나 모두 비워두세요." },
        { status: 400 },
      );
    }

    const record = await createBodyCompositionRecord({
      ...commonInput,
      weightKg,
      bodyFatPercent,
      whr,
      heightCm: typeof heightCm === "number" ? heightCm : undefined,
      gender: gender === "MALE" || gender === "FEMALE" ? gender : undefined,
      armMuscleMassLeftKg: typeof armMuscleMassLeftKg === "number" ? armMuscleMassLeftKg : undefined,
      armMuscleMassRightKg:
        typeof armMuscleMassRightKg === "number" ? armMuscleMassRightKg : undefined,
      legMuscleMassLeftKg: typeof legMuscleMassLeftKg === "number" ? legMuscleMassLeftKg : undefined,
      legMuscleMassRightKg:
        typeof legMuscleMassRightKg === "number" ? legMuscleMassRightKg : undefined,
      note: typeof note === "string" && note.trim() ? note : undefined,
    });
    return NextResponse.json({ examType, ...record }, { status: 201 });
  }

  if (examType === "STRENGTH_TEST") {
    const { gender, measuredAge, gripLeftKg, gripRightKg } = body;

    if ([measuredAge, gripLeftKg, gripRightKg].some((v) => typeof v !== "number")) {
      return NextResponse.json({ error: "근력검사 입력값을 모두 확인하세요." }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: commonInput.patientId } });
    if (!patient) {
      return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
    }
    if (patient.gender == null && gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json({ error: "환자의 성별을 선택하세요." }, { status: 400 });
    }

    const record = await createStrengthTestRecord({
      ...commonInput,
      gender: gender === "MALE" || gender === "FEMALE" ? gender : undefined,
      measuredAge,
      gripLeftKg,
      gripRightKg,
    });
    return NextResponse.json({ examType, ...record }, { status: 201 });
  }

  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}
