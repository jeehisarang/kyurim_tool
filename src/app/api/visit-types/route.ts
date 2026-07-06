import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const visitTypes = await prisma.visitType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(visitTypes);
}
