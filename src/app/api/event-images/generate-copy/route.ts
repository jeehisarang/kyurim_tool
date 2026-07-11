import { NextResponse } from "next/server";
import { generateEventCopy } from "@/lib/ai-message";

export async function POST(request: Request) {
  const body = await request.json();
  const rawIdea = String(body.rawIdea ?? "").trim();
  if (!rawIdea) {
    return NextResponse.json({ error: "이벤트 아이디어를 입력해주세요." }, { status: 400 });
  }

  const previous =
    body.previous && typeof body.previous.title === "string" && typeof body.previous.copy === "string"
      ? { title: body.previous.title, copy: body.previous.copy }
      : null;
  const instruction = typeof body.instruction === "string" ? body.instruction : null;

  try {
    const result = await generateEventCopy({ rawIdea, previous, instruction });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "문구 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
