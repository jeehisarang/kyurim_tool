import { NextResponse } from "next/server";
import { computeDashboardStats } from "@/lib/stats";

export async function GET() {
  const stats = await computeDashboardStats();
  return NextResponse.json(stats);
}
