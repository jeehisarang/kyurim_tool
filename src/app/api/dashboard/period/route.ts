import { NextRequest, NextResponse } from "next/server";
import { computePeriodStats } from "@/lib/stats";
import { DEFAULT_STATS_PERIOD, isValidStatsPeriod } from "@/lib/stats-period";

export async function GET(req: NextRequest) {
  const periodParam = req.nextUrl.searchParams.get("period") ?? DEFAULT_STATS_PERIOD;
  if (!isValidStatsPeriod(periodParam)) {
    return NextResponse.json({ error: "잘못된 기간 값입니다." }, { status: 400 });
  }
  const stats = await computePeriodStats(periodParam);
  return NextResponse.json(stats);
}
