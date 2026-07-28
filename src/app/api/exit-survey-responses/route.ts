import { NextResponse } from "next/server";
import { listAllExitSurveyResponses } from "@/lib/exit-surveys";

// 직원용 목록(/refer/exit-responses 응답 전체보기, task.md).
export async function GET() {
  const responses = await listAllExitSurveyResponses();
  return NextResponse.json(responses);
}
