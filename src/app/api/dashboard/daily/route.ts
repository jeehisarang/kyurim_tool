import { NextResponse } from "next/server";
import { computeMonthlyDailyStats } from "@/lib/stats";

export async function GET() {
  const stats = await computeMonthlyDailyStats();
  return NextResponse.json(stats);
}
