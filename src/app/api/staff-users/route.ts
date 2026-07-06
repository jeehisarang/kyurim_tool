import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const staffUsers = await prisma.staffUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(staffUsers);
}
