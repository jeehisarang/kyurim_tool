import { NextResponse } from "next/server";
import { createTeachingPage, NeedsExamError } from "@/lib/teaching-pages";

export async function POST(request: Request) {
  const body = await request.json();
  const patientId = Number(body.patientId);
  const programTeachingId = Number(body.programTeachingId);
  const createdByStaffId = Number(body.createdByStaffId);

  if (!patientId || !programTeachingId || !createdByStaffId) {
    return NextResponse.json(
      { error: "환자, 프로그램, 작성자를 모두 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const page = await createTeachingPage({ patientId, programTeachingId, createdByStaffId });
    return NextResponse.json(page, { status: 201 });
  } catch (err) {
    if (err instanceof NeedsExamError) {
      return NextResponse.json(
        { error: err.message, needsExam: true, linkedTestType: err.linkedTestType },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "티칭지 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
