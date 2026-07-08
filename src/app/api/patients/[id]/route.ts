import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidChartNumber, CHART_NUMBER_FORMAT_ERROR } from "@/lib/patients";

/**
 * 환자 이름/차트번호 수정. 단순 UPDATE — 별도 수정 이력은 남기지 않는다("가볍고 쉬운 구조" 원칙).
 * 차트번호 변경 시 신규 등록과 동일한 검증(숫자만, 중복 불가)을 적용한다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  const body = await request.json();

  const chartNumber = typeof body.chartNumber === "string" ? body.chartNumber.trim() : undefined;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

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
    },
  });

  return NextResponse.json(patient);
}
