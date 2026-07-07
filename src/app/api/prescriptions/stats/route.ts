import { NextResponse } from "next/server";
import { computePrescriptionStats } from "@/lib/stats";

export async function GET() {
  const stats = await computePrescriptionStats();
  return NextResponse.json(stats);
}
