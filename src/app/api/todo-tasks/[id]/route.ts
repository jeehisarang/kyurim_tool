import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { completeTodoTask } from "@/lib/prescriptions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const doneByUserId = body.doneByUserId;

  if (typeof doneByUserId !== "number") {
    return NextResponse.json(
      { error: "체크한 사람을 선택하세요." },
      { status: 400 },
    );
  }

  await completeTodoTask(Number(id), doneByUserId);

  const task = await prisma.todoTask.findUniqueOrThrow({
    where: { id: Number(id) },
    include: {
      prescription: { include: { patient: true, program: true } },
      staffUser: true,
      doneByUser: true,
    },
  });

  return NextResponse.json(task);
}
