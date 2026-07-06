import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staffUserId = searchParams.get("staffUserId");

  const tasks = await prisma.todoTask.findMany({
    where: {
      dueDate: { lt: endOfToday() },
      ...(staffUserId ? { staffUserId: Number(staffUserId) } : {}),
    },
    include: {
      prescription: { include: { patient: true, program: true } },
      staffUser: true,
      doneByUser: true,
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(tasks);
}
