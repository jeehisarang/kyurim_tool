import { NextResponse } from "next/server";
import { getMissionRangeStats, getCurrentWeekRange } from "@/lib/missions";

function parseDateParam(value: string | null): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// 미션톡 발송/수행 통계 요약카드(/missions/today, task2.md) — start/end 없으면 이번주(월~일).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = parseDateParam(searchParams.get("start"));
  const endParam = parseDateParam(searchParams.get("end"));

  const { start, end } = startParam && endParam ? { start: startParam, end: endParam } : getCurrentWeekRange();

  const stats = await getMissionRangeStats(start, end);
  return NextResponse.json(stats);
}
