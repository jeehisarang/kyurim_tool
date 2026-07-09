import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidChartNumber, CHART_NUMBER_FORMAT_ERROR } from "@/lib/patients";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await prisma.patient.findUnique({ where: { id: Number(id) } });
  if (!patient) {
    return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(patient);
}

/**
 * 환자 이름/차트번호/키/성별 수정. 단순 UPDATE — 별도 수정 이력은 남기지 않는다("가볍고 쉬운 구조" 원칙).
 * 차트번호 변경 시 신규 등록과 동일한 검증(숫자만, 중복 불가)을 적용한다.
 * height/gender는 인바디 검사(exam-thresholds.ts)에서 쓰는 고정값 — 여기서도 수정 가능.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  const body = await request.json();

  const chartNumber = typeof body.chartNumber === "string" ? body.chartNumber.trim() : undefined;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const height = typeof body.height === "number" ? body.height : undefined;
  const gender = body.gender === "MALE" || body.gender === "FEMALE" ? body.gender : undefined;

  if (chartNumber !== undefined && chartNumber.length === 0) {
    return NextResponse.json({ error: "차트번호를 입력하세요." }, { status: 400 });
  }
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }
  if (chartNumber !== undefined && !isValidChartNumber(chartNumber)) {
    return NextResponse.json({ error: CHART_NUMBER_FORMAT_ERROR }, { status: 400 });
  }

  if (chartNumber !== undefined) {
    const existing = await prisma.patient.findUnique({ where: { chartNumber } });
    if (existing && existing.id !== patientId) {
      return NextResponse.json(
        { error: `이미 다른 환자가 사용 중인 차트번호입니다: ${existing.name} (${existing.chartNumber})` },
        { status: 409 },
      );
    }
  }

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      ...(chartNumber !== undefined ? { chartNumber } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(gender !== undefined ? { gender } : {}),
    },
  });

  return NextResponse.json(patient);
}

/**
 * 신규 등록 직후, 아직 내원 체크가 하나도 없는 환자만 되돌리기(취소) 목적으로 삭제
 * 가능하다. 실수로 잘못 입력한 차트번호/이름을 확인 없이 저장부터 해버린 경우를 위한
 * 구제 경로 — Visit이 하나라도 있으면(=실사용 기록이 생겼으면) 거부한다.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);

  const visitCount = await prisma.visit.count({ where: { patientId } });
  if (visitCount > 0) {
    return NextResponse.json(
      { error: "이미 내원 기록이 있는 환자는 삭제할 수 없습니다." },
      { status: 409 },
    );
  }

  await prisma.patient.delete({ where: { id: patientId } });
  return NextResponse.json({ success: true });
}
