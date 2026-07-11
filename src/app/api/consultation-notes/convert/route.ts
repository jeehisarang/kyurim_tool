import { NextResponse } from "next/server";
import { convertToSoapChart } from "@/lib/ai-chart";
import { isDirector } from "@/lib/staff-auth";

// AI 차팅변환도 작성과 동일하게 원장 전용(방어적 서버단 재확인).
export async function POST(request: Request) {
  const body = await request.json();
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "staffUserId가 필요합니다." }, { status: 400 });
  }
  if (!(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 AI 차팅변환을 사용할 수 있습니다." }, { status: 403 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "변환할 상담 내용을 입력하세요." }, { status: 400 });
  }

  try {
    const convertedChartText = await convertToSoapChart(rawText);
    return NextResponse.json({ convertedChartText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "차팅 변환에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
