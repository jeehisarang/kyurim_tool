import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const responses = await prisma.surveyResponseCache.findMany({
    orderBy: { fetchedAt: "desc" },
    take: 20,
  });
  return NextResponse.json(responses);
}
