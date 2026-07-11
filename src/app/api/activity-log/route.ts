import { NextResponse } from "next/server";
import { listRecentActivity } from "@/lib/activity-log";

// 우측 고정 레일이 폴링하는 엔드포인트 — 최근 N건, 날짜 역순.
export async function GET() {
  const rows = await listRecentActivity(15);
  return NextResponse.json(rows);
}
