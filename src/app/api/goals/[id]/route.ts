import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { targetValue } = body;

  if (typeof targetValue !== "number" || !Number.isFinite(targetValue) || targetValue <= 0) {
    return NextResponse.json({ error: "목표값이 올바르지 않습니다." }, { status: 400 });
  }

  const goal = await prisma.goal.update({
    where: { id: Number(id) },
    data: { targetValue },
  });

  return NextResponse.json(goal);
}
