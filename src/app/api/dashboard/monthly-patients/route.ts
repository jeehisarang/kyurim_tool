import { NextResponse } from "next/server";
import { computeMonthlyPatientTrend } from "@/lib/stats";

export async function GET() {
  const data = await computeMonthlyPatientTrend();
  return NextResponse.json(data);
}
