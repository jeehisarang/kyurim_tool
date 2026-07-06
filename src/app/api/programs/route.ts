import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const programs = await prisma.program.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(programs);
}
