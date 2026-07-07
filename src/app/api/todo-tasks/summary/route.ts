import { NextResponse } from "next/server";
import { computeTodoWeeklySummary } from "@/lib/stats";

export async function GET() {
  const summary = await computeTodoWeeklySummary();
  return NextResponse.json(summary);
}
