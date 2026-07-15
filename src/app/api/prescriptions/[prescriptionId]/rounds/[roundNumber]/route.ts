import { NextResponse } from "next/server";
import { getPrescriptionDetail, resetPrescriptionRoundOverride, setPrescriptionRoundOverride } from "@/lib/prescriptions";

// Visit.visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseOverrideDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * 회차별 예정일 수동 조정(task.md 2단계). body.reset이 true면 계산값으로 되돌리고,
 * 아니면 body.overrideDate(YYYY-MM-DD)로 해당 회차만 조정한다 — 나머지 회차는
 * 원래 계산대로 유지되며 연쇄 재계산은 없다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ prescriptionId: string; roundNumber: string }> },
) {
  const { prescriptionId, roundNumber } = await params;
  const body = await request.json();

  let result;
  if (body.reset === true) {
    result = await resetPrescriptionRoundOverride(Number(prescriptionId), Number(roundNumber));
  } else {
    const overrideDate = parseOverrideDate(body.overrideDate);
    if (overrideDate === null) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    result = await setPrescriptionRoundOverride(Number(prescriptionId), Number(roundNumber), overrideDate);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const detail = await getPrescriptionDetail(Number(prescriptionId));
  return NextResponse.json(detail);
}
