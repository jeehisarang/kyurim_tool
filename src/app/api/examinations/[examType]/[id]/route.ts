import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getBodyCompositionRecord,
  getStrengthTestRecord,
  updateBodyCompositionRecord,
  updateStrengthTestRecord,
  deleteBodyCompositionRecord,
  deleteStrengthTestRecord,
} from "@/lib/examinations";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseExamDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examType: string; id: string }> },
) {
  const { examType, id } = await params;
  const recordId = Number(id);

  if (examType === "BODY_COMPOSITION") {
    const record = await getBodyCompositionRecord(recordId);
    if (!record) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ examType, ...record });
  }
  if (examType === "STRENGTH_TEST") {
    const record = await getStrengthTestRecord(recordId);
    if (!record) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ examType, ...record });
  }
  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}

/**
 * 검사기록 수정. 저장 로직은 등록(POST /api/examinations)과 동일한 원칙을 따른다 —
 * 클라이언트가 보낸 계산값은 무시하고 서버가 원본 입력값으로부터 다시 계산해서 저장한다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ examType: string; id: string }> },
) {
  const { examType, id } = await params;
  const recordId = Number(id);
  const body = await request.json();
  const { prescriptionId, examDate: examDateInput } = body;

  const examDate = parseExamDate(examDateInput);
  if (examDate === null) {
    return NextResponse.json({ error: "검사일자 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (examDate.getTime() > startOfToday().getTime()) {
    return NextResponse.json({ error: "검사일자는 미래 날짜를 선택할 수 없습니다." }, { status: 400 });
  }

  if (examType === "BODY_COMPOSITION") {
    const existing = await getBodyCompositionRecord(recordId);
    if (!existing) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });

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

    if (typeof weightKg !== "number" || typeof bodyFatPercent !== "number" || typeof whr !== "number") {
      return NextResponse.json({ error: "체중, 체지방율, WHR을 모두 입력하세요." }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: existing.patientId } });
    if (!patient) return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
    if (patient.height == null && typeof heightCm !== "number") {
      return NextResponse.json({ error: "환자의 키(cm)를 입력하세요." }, { status: 400 });
    }
    if (patient.gender == null && gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json({ error: "환자의 성별을 선택하세요." }, { status: 400 });
    }

    const limbFields = [armMuscleMassLeftKg, armMuscleMassRightKg, legMuscleMassLeftKg, legMuscleMassRightKg];
    const providedLimbCount = limbFields.filter((v) => typeof v === "number").length;
    if (providedLimbCount > 0 && providedLimbCount < 4) {
      return NextResponse.json(
        { error: "사지골격근량은 4개 항목을 모두 입력하거나 모두 비워두세요." },
        { status: 400 },
      );
    }

    const record = await updateBodyCompositionRecord(recordId, {
      patientId: existing.patientId,
      prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
      examDate,
      weightKg,
      bodyFatPercent,
      whr,
      heightCm: typeof heightCm === "number" ? heightCm : undefined,
      gender: gender === "MALE" || gender === "FEMALE" ? gender : undefined,
      armMuscleMassLeftKg: typeof armMuscleMassLeftKg === "number" ? armMuscleMassLeftKg : undefined,
      armMuscleMassRightKg: typeof armMuscleMassRightKg === "number" ? armMuscleMassRightKg : undefined,
      legMuscleMassLeftKg: typeof legMuscleMassLeftKg === "number" ? legMuscleMassLeftKg : undefined,
      legMuscleMassRightKg: typeof legMuscleMassRightKg === "number" ? legMuscleMassRightKg : undefined,
      note: typeof note === "string" && note.trim() ? note : undefined,
    });
    return NextResponse.json({ examType, ...record });
  }

  if (examType === "STRENGTH_TEST") {
    const existing = await getStrengthTestRecord(recordId);
    if (!existing) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });

    const { gender, measuredAge, gripLeftKg, gripRightKg } = body;

    if ([measuredAge, gripLeftKg, gripRightKg].some((v) => typeof v !== "number")) {
      return NextResponse.json({ error: "근력검사 입력값을 모두 확인하세요." }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: existing.patientId } });
    if (!patient) return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
    if (patient.gender == null && gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json({ error: "환자의 성별을 선택하세요." }, { status: 400 });
    }

    const record = await updateStrengthTestRecord(recordId, {
      patientId: existing.patientId,
      prescriptionId: prescriptionId ? Number(prescriptionId) : undefined,
      examDate,
      gender: gender === "MALE" || gender === "FEMALE" ? gender : undefined,
      measuredAge,
      gripLeftKg,
      gripRightKg,
    });
    return NextResponse.json({ examType, ...record });
  }

  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}

// 검사기록은 하위 참조 테이블이 없어 하드 삭제한다(소프트삭제 불필요 — 통계는 목록 재조회 시
// 자연히 제외됨).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ examType: string; id: string }> },
) {
  const { examType, id } = await params;
  const recordId = Number(id);

  if (examType === "BODY_COMPOSITION") {
    await deleteBodyCompositionRecord(recordId);
    return NextResponse.json({ success: true });
  }
  if (examType === "STRENGTH_TEST") {
    await deleteStrengthTestRecord(recordId);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "알 수 없는 검사 종류입니다." }, { status: 400 });
}
