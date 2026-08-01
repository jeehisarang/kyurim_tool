import { NextResponse } from "next/server";
import { getDashboardStatsForApi } from "@/lib/stats";

export async function GET() {
  const stats = await getDashboardStatsForApi();
  return NextResponse.json(stats);
}
