import { NextResponse } from "next/server";
import {
  getExitSurveyPageData,
  createExitSurveyResponse,
  ExitSurveyAlreadySubmittedError,
  InvalidExitSurveyInputError,
} from "@/lib/exit-surveys";

// 공개 마감설문 페이지(/refer/exit/[prescriptionId], task.md Phase 2-1) — 인증 없음.
export async function GET(_request: Request, { params }: { params: Promise<{ prescriptionId: string }> }) {
  const { prescriptionId } = await params;
  const id = Number(prescriptionId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const data = await getExitSurveyPageData(id);
  if (!data) {
    return NextResponse.json({ error: "처방을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ prescriptionId: string }> }) {
  const { prescriptionId } = await params;
  const id = Number(prescriptionId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = await request.json();

  try {
    await createExitSurveyResponse({
      prescriptionId: id,
      compliance: body.compliance,
      changes: Array.isArray(body.changes) ? body.changes : [],
      consultInterest: body.consultInterest,
      comment: typeof body.comment === "string" ? body.comment : undefined,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    if (err instanceof ExitSurveyAlreadySubmittedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof InvalidExitSurveyInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
